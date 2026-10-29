import * as wmill from 'windmill-client';

/** Read-only All Mail reply visibility sample for each fixed sender lane. */
export async function main() {
  const sql = wmill.datatable('main');
  const rows = await sql`SELECT sender,min(id)::bigint recipient_id
    FROM mumbai_nurture_recipients
    WHERE sender IN
      ('sai@beforest.co','community@beforest.co','yogesh@beforest.co','harish@beforest.co')
    GROUP BY sender ORDER BY sender`.fetch();
  if (rows.length!==4) throw new Error('Missing fixed sender lane sample');
  const results = [];
  for (const row of rows) {
    const result = await wmill.runScriptByPath('f/old_leads_churn/inspect_mumbai_reply_imap',
      {recipient_id:Number(row.recipient_id),record:false});
    results.push({sender:row.sender,recipient_id:Number(row.recipient_id),
      action:result.action,mailbox:result.mailbox || null,
      uid_validity:result.uid_validity || null,
      checked_through_uid:result.checked_through_uid || null,
      confirmed_count:result.confirmed_count || 0,
      ambiguous_count:result.ambiguous_count || 0,
      safe_to_send:result.safe_to_send===true});
  }
  return {read_only:true,lanes:results};
}
