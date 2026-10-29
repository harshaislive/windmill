import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const mailboxes = [
  'sai@beforest.co','community@beforest.co',
  'yogesh@beforest.co','harish@beforest.co',
] as const;

/** Discover, authenticate, and bind only exact mailbox profiles. Never changes send gates. */
export async function main(dry_run: boolean = true) {
  if (await wmill.getVariable(`${ROOT}/delivery_enabled`) !== 'false')
    throw new Error('Inbox setup requires delivery disabled');
  const apiKey = await wmill.getVariable(`${ROOT}/harsha_maton_api_key`);
  const listed = await fetch('https://api.maton.ai/connections?app=google-mail&status=ACTIVE', {
    headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(30000),
  });
  if (!listed.ok) throw new Error(`Maton connection discovery HTTP ${listed.status}`);
  const connections = (await listed.json()).connections || [];
  const profiles: Array<{connection_id:string,email:string}> = [];
  const unavailable: Array<{connection_id:string,reason:string}> = [];
  for (const c of connections) {
    const id = String(c.connection_id || '');
    if (!/^[a-f0-9-]{36}$/i.test(id) || c.app !== 'google-mail' || c.status !== 'ACTIVE')
      continue;
    const response = await fetch('https://api.maton.ai/google-mail/gmail/v1/users/me/profile', {
      headers:{Authorization:`Bearer ${apiKey}`,'Maton-Connection':id},
      signal:AbortSignal.timeout(30000),
    });
    if (!response.ok) { unavailable.push({connection_id:id,reason:`PROFILE_HTTP_${response.status}`}); continue; }
    const profile = await response.json();
    const email = String(profile.emailAddress || '').trim().toLowerCase();
    if (!email) { unavailable.push({connection_id:id,reason:'PROFILE_MISSING_EMAIL'}); continue; }
    profiles.push({connection_id:id,email});
  }
  const matches = mailboxes.map(email => ({email,
    connections:profiles.filter(p => p.email === email).map(p => p.connection_id)}));
  const missing = matches.filter(m => m.connections.length === 0).map(m => m.email);
  const ambiguous = matches.filter(m => m.connections.length > 1).map(m => m.email);
  const uniqueIds = new Set(matches.flatMap(m => m.connections));
  const complete = missing.length === 0 && ambiguous.length === 0 && uniqueIds.size === 4;
  let community_alias_on_sai: boolean | null = null;
  if (missing.includes('community@beforest.co')) {
    const sai = matches.find(m => m.email === 'sai@beforest.co');
    if (sai?.connections.length === 1) {
      const aliases = await fetch('https://api.maton.ai/google-mail/gmail/v1/users/me/settings/sendAs', {
        headers:{Authorization:`Bearer ${apiKey}`,'Maton-Connection':sai.connections[0]},
        signal:AbortSignal.timeout(30000),
      });
      if (aliases.ok) community_alias_on_sai = ((await aliases.json()).sendAs || [])
        .some((a:any) => String(a.sendAsEmail || '').toLowerCase() === 'community@beforest.co');
    }
  }
  const preview = {dry_run,complete,active_connections:connections.length,
    exact_mailboxes:matches,missing,ambiguous,unavailable,
    community_alias_on_sai,
    community_note:missing.includes('community@beforest.co') ?
      'A send-as alias does not prove an independent inbox or inbound routing. Verify community receipt and connect its real mailbox before release.' :
      'Community has an independent authenticated Gmail profile.',
    next_action:complete ? 'READY_TO_BIND_EXACT_IDS' :
      'Connect missing Google Mail accounts in the Maton dashboard, then rerun dry_run=true. No IDs are guessed or written.'};
  if (dry_run || !complete) return preview;
  for (const m of matches) {
    const path = `${ROOT}/mail_connection_${m.email.split('@')[0]}`;
    await wmill.setVariable(path,m.connections[0],false,
      `Verified active Maton Google Mail connection for ${m.email}`);
    if (await wmill.getVariable(path) !== m.connections[0])
      throw new Error(`Windmill variable read-back mismatch for ${m.email}`);
  }
  return {...preview,dry_run:false,variables_written:matches.map(m =>
    `${ROOT}/mail_connection_${m.email.split('@')[0]}`),
    read_back:true,
    release_gates_unchanged:true};
}
