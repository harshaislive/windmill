import * as wmill from 'windmill-client';
import { ImapFlow } from 'imapflow';

const ROOT = 'f/old_leads_churn';
const mailboxes = [
  {lane:'rakesh',address:'sai@beforest.co'},
  {lane:'community',address:'community@beforest.co'},
  {lane:'yogesh',address:'yogesh@beforest.co'},
  {lane:'harish',address:'harish@beforest.co'},
];

function safeClass(error: unknown) {
  const value = String((error as any)?.code || '')+' '+String((error as any)?.message || '');
  if (/certificate|cert_|tls|ssl/i.test(value)) return 'TLS_VERIFICATION_FAILED';
  if (/auth|login|credentials|password|invalid user/i.test(value)) return 'AUTHENTICATION_FAILED';
  if (/timeout|timed out/i.test(value)) return 'CONNECTION_TIMEOUT';
  if (/econn|network|socket|dns|enotfound/i.test(value)) return 'NETWORK_CONNECTION_FAILED';
  return 'IMAP_CHECK_FAILED';
}

/** Live read-only IMAP proof; never fetches messages or changes mailbox state. */
export async function main() {
  if (await wmill.getVariable(`${ROOT}/delivery_enabled`) !== 'false')
    throw new Error('IMAP verification requires delivery disabled');
  const result = [];
  for (const mailbox of mailboxes) {
    let password: string;
    try { password = await wmill.getVariable(`${ROOT}/${mailbox.lane}_gmail_app_password`); }
    catch { result.push({lane:mailbox.lane,address:mailbox.address,
      authenticated:false,inbox_read_only:false,status:'PASSWORD_VARIABLE_MISSING'}); continue; }
    if (!password) { result.push({lane:mailbox.lane,address:mailbox.address,
      authenticated:false,inbox_read_only:false,status:'PASSWORD_VARIABLE_EMPTY'}); continue; }
    const client = new ImapFlow({host:'imap.gmail.com',port:993,secure:true,
      auth:{user:mailbox.address,pass:password},logger:false,
      tls:{rejectUnauthorized:true},connectionTimeout:12000,greetingTimeout:12000,
      socketTimeout:15000});
    let authenticated = false;
    try {
      await client.connect();
      authenticated = true;
      const inbox = await client.mailboxOpen('INBOX',{readOnly:true});
      if (!inbox || !inbox.readOnly) throw new Error('INBOX_NOT_READ_ONLY');
      result.push({lane:mailbox.lane,address:mailbox.address,
        authenticated:true,inbox_read_only:true,status:'READ_ONLY_INBOX_OK'});
    } catch (error) {
      result.push({lane:mailbox.lane,address:mailbox.address,authenticated,
        inbox_read_only:false,status:safeClass(error)});
    } finally {
      try { await client.logout(); } catch { /* do not print error or credentials */ }
    }
  }
  return {checked_from:'Windmill worker',host:'imap.gmail.com',port:993,
    tls_verified:true,logger_disabled:true,no_messages_fetched:true,
    no_flags_changed:true,delivery_enabled:false,
    all_access_verified:result.every(x => x.authenticated && x.inbox_read_only),result};
}
