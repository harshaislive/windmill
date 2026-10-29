import * as wmill from 'windmill-client';

/** Repairs imported step timestamps from exact live Zoho message IDs; no send. */
export async function main(dry_run: boolean = true) {
  if (await wmill.getVariable('f/old_leads_churn/delivery_enabled') !== 'false')
    throw new Error('Reconciliation requires delivery disabled');
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    wmill.getVariable('f/old_leads_churn/zoho_rakesh_client_id'),
    wmill.getVariable('f/old_leads_churn/zoho_rakesh_client_secret'),
    wmill.getVariable('f/old_leads_churn/zoho_rakesh_refresh_token'),
  ]);
  const refresh = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST', body: new URLSearchParams({ client_id: clientId,
      client_secret: clientSecret, refresh_token: refreshToken,
      grant_type: 'refresh_token' }), signal: AbortSignal.timeout(30000),
  });
  if (!refresh.ok) throw new Error(`Zoho token HTTP ${refresh.status}`);
  const token = await refresh.json();
  const sql = wmill.datatable('main');
  const recipients = await sql`SELECT id,zoho_lead_id,email_normalized,last_verified_send_at
    FROM mumbai_nurture_recipients WHERE zoho_lead_id IS NOT NULL
    AND sender='sai@beforest.co' AND source_version='mumbai-v1'`.fetch();
  if (recipients.length !== 79) throw new Error('Expected 79 exact legacy Leads');
  let checked = 0, verifiedMessages = 0, timestampsToCorrect = 0;
  const corrections: { sendId: number; recipientId: number; at: string }[] = [];
  for (const r of recipients) {
    const response = await fetch(`${token.api_domain}/crm/v8/Leads/${r.zoho_lead_id}/Emails?type=sent_from_crm`, {
      headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Zoho email log HTTP ${response.status}`);
    const logs: any[] = (await response.json()).Emails || [];
    const stored = await sql`SELECT id,crm_message_id,verified_at
      FROM mumbai_nurture_sends WHERE recipient_id=${r.id} AND status='VERIFIED_SENT'`.fetch();
    if (logs.length !== stored.length) throw new Error('Legacy live/stored send count mismatch');
    const byId = new Map(logs.map((x) => [x.message_id, x]));
    for (const s of stored) {
      const live = byId.get(s.crm_message_id);
      if (!live || live.to?.[0]?.email?.toLowerCase() !== r.email_normalized ||
          !live.time || Number.isNaN(Date.parse(live.time)))
        throw new Error('Legacy exact message or recipient mismatch');
      verifiedMessages++;
      if (new Date(s.verified_at).getTime() !== new Date(live.time).getTime()) {
        timestampsToCorrect++;
        corrections.push({ sendId: Number(s.id), recipientId: Number(r.id), at: live.time });
      }
    }
    checked++;
  }
  if (!dry_run) {
    for (const x of corrections) {
      await sql`UPDATE mumbai_nurture_sends SET verified_at=${x.at}::timestamptz
        WHERE id=${x.sendId} AND recipient_id=${x.recipientId} AND status='VERIFIED_SENT'`.execute();
    }
    const check = await sql`SELECT count(*)::integer n FROM mumbai_nurture_sends
      WHERE status='VERIFIED_SENT' AND verified_at IS NOT NULL`.fetchOne();
    if (check.n !== 217) throw new Error('Send timestamp read-back count mismatch');
  }
  return { dry_run, checked_leads: checked, exact_messages: verifiedMessages,
    timestamps_to_correct: timestampsToCorrect,
    corrected: dry_run ? 0 : timestampsToCorrect };
}
