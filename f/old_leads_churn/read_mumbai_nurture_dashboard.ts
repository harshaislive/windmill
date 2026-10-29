import * as wmill from 'windmill-client';
import {createHash,timingSafeEqual} from 'node:crypto';

/** Read-only dashboard. No CRM calls, mail scans, sends, or queue changes. */
export async function main(dashboard_passcode: string = '') {
  // Authenticate before any queue, event, variable or supplementary Sheet read.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(new Date());
  const dateCode = ['day', 'month', 'year'].map(type => parts.find(p => p.type === type)!.value).join('');
  const expected = createHash('sha256').update(dateCode).digest('hex');
  const supplied = createHash('sha256').update(dashboard_passcode).digest('hex');
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex')))
    throw new Error('Incorrect dashboard password');
  const sql = wmill.datatable('main');
  const keys = ['delivery_enabled', 'pilot_global_daily_cap', 'pilot_sender_daily_cap',
    'pilot_rakesh_api_daily_cap', 'pilot_new_admissions_daily_cap',
    'non_crm_sending_enabled', 'crm_handoff_writes_enabled',
    'sender_queues_enabled','sender_queues_start_date','sender_domain_verified'];
  const values = await Promise.all(keys.map(k => wmill.getVariable(`f/old_leads_churn/${k}`)));
  const recipients = await sql`SELECT r.id::text id,r.person_name,r.email_normalized,
    r.zoho_lead_id,r.admission_mode,r.sender,r.owner_name,r.collective,r.state,r.stop_reason,r.next_step,
    r.next_due_at,r.last_verified_send_at,
    (EXISTS(SELECT 1 FROM mumbai_nurture_internal_tests t WHERE t.recipient_email=r.email_normalized)
      OR r.email_normalized LIKE 'harsha+wmqa-%') internal_test,
    count(s.id) FILTER(WHERE s.status='VERIFIED_SENT' AND s.step BETWEEN 1 AND 3)::integer email1,
    count(s.id) FILTER(WHERE s.status='VERIFIED_SENT' AND s.step BETWEEN 4 AND 5)::integer email2,
    count(s.id) FILTER(WHERE s.status='VERIFIED_SENT' AND s.step=6)::integer email3,
    count(s.id) FILTER(WHERE s.status IN ('ATTEMPTING','UNCERTAIN'))::integer uncertain,
    EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id AND e.kind='REPLY') replied,
    (SELECT max(e.occurred_at) FROM mumbai_nurture_events e WHERE e.recipient_id=r.id AND e.kind='REPLY') reply_at,
    (SELECT string_agg(DISTINCT l.batch_id,', ' ORDER BY l.batch_id) FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id) batch,
    EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.source_present) source_present,
    (SELECT max(c.updated_at) FROM mumbai_nurture_mail_cursors c WHERE c.recipient_id=r.id) inbox_checked_at
    FROM mumbai_nurture_recipients r LEFT JOIN mumbai_nurture_sends s ON s.recipient_id=r.id
    WHERE r.email_normalized NOT LIKE '%.invalid'
    GROUP BY r.id ORDER BY r.last_verified_send_at DESC NULLS LAST,r.id LIMIT 5000`.fetch();
  const totals = await sql`SELECT count(*) FILTER(WHERE status='VERIFIED_SENT')::integer verified,
    count(*) FILTER(WHERE status='VERIFIED_SENT' AND (verified_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date)::integer today,
    count(*) FILTER(WHERE status IN ('RESERVED','ATTEMPTING','UNCERTAIN'))::integer pending
    FROM mumbai_nurture_sends`.fetchOne();
  const capacity = await sql`SELECT scope,reserved_count,verified_count FROM mumbai_nurture_daily_capacity
    WHERE local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY scope`.fetch();
  const layout = await sql`SELECT available,checked_at,changed_at FROM mumbai_nurture_layout_gate
    WHERE gate_key='rakesh_create'`.fetchOne();
  const recent = await sql`SELECT r.person_name,r.email_normalized,r.owner_name,s.sender,s.step,
    s.status,s.verified_at,s.attempted_at FROM mumbai_nurture_sends s
    JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id
    WHERE s.status='VERIFIED_SENT' ORDER BY s.verified_at DESC NULLS LAST,s.id DESC LIMIT 20`.fetch();
  const events = await sql`SELECT r.person_name,r.email_normalized,r.owner_name,e.kind,e.occurred_at,
    EXISTS(SELECT 1 FROM mumbai_nurture_internal_tests t WHERE t.recipient_email=r.email_normalized) internal_test,
    e.evidence->>'subject' reply_subject,
    CASE WHEN e.kind='REPLY' THEN 'AWAITING_MANUAL_ZOHO_REVIEW' ELSE NULL END review_status,
    n.status note_status,h.status owner_task_status FROM mumbai_nurture_events e
    JOIN mumbai_nurture_recipients r ON r.id=e.recipient_id
    LEFT JOIN mumbai_nurture_notes n ON n.event_key=e.event_key
    LEFT JOIN mumbai_nurture_handoffs h ON h.event_key=e.event_key
    ORDER BY e.occurred_at DESC LIMIT 30`.fetch();
  // Legacy journal rows can lack a name. Display a name only when the live tracker
  // matches BOTH exact CRM Lead ID and current email; never alter the journal.
  let tracker_names_loaded=false;
  try {
    const key=await wmill.getVariable('f/old_leads_churn/harsha_maton_api_key');
    const range=encodeURIComponent("'Mumbai Nurture Tracker'!A1:D5000");
    const response=await fetch(`https://api.maton.ai/google-sheets/v4/spreadsheets/1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w/values/${range}`,{
      headers:{Authorization:`Bearer ${key}`,'Maton-Connection':'6463e553-eab2-4cb9-a46f-b1a5665c0031'},signal:AbortSignal.timeout(12000)});
    if(response.ok){
      const cells=(await response.json()).values||[];
      if(cells[0]?.[1]==='Zoho Lead ID'){
        const names=new Map<string,string>();const ambiguous=new Set<string>();
        for(const row of cells.slice(1)){const k=`${String(row[1]||'')}|${String(row[3]||'').trim().toLowerCase()}`;
          if(names.has(k))ambiguous.add(k);else names.set(k,String(row[2]||'').trim());}
        for(const row of recipients){const k=`${row.zoho_lead_id||''}|${row.email_normalized}`;
          if(!row.person_name&&!ambiguous.has(k)&&names.get(k))row.person_name=names.get(k);}
        tracker_names_loaded=true;
      }
    }
  } catch { /* Keep verified queue data visible when supplementary names are unavailable. */ }
  const queueSettings=Object.fromEntries(keys.map((k,i)=>[k,values[i]]));
  let plan:any=null;
  if(queueSettings.sender_queues_enabled==='true') {
    const progress=await sql`SELECT count(*)::integer audience,
      count(*) FILTER(WHERE r.next_step=1 AND r.state='READY')::integer first_contact_pending,
      count(*) FILTER(WHERE r.state='COMPLETE')::integer completed,
      count(*) FILTER(WHERE r.state='SUPPRESSED')::integer stopped,
      count(*) FILTER(WHERE r.state='HELD')::integer held,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM mumbai_nurture_sends s WHERE s.recipient_id=r.id
        AND s.status IN ('ATTEMPTING','UNCERTAIN')))::integer unconfirmed_people
      FROM mumbai_nurture_30day_cohort c JOIN mumbai_nurture_recipients r ON r.id=c.recipient_id`.fetchOne();
    const lanes=await sql`SELECT sender,last_started_at,last_finished_at,last_result FROM mumbai_nurture_lane_state
      WHERE sender<>'maintenance' ORDER BY sender`.fetch();
    const start=Date.parse(queueSettings.sender_queues_start_date+'T00:00:00+05:30');
    const day=Number.isFinite(start)?Math.floor((Date.now()-start)/86400000):-1;
    const ramp=[5,8,12,17,23,25];
    plan={...progress,lanes,start_date:queueSettings.sender_queues_start_date,
      target_date:Number.isFinite(start)?new Date(start+29*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}):null,
      day:day+1,new_people_per_mailbox:day<0?0:ramp[Math.min(day,5)],maximum_new_people_per_mailbox:25,
      sender_interval_minutes:3,window:'08:00–19:00 IST',
      status:queueSettings.sender_domain_verified!=='true'?'DOMAIN_AUTHENTICATION_HOLD':day<0?'SCHEDULED':'ACTIVE',
      deadline_is_target:true};
  }
  return {as_of:new Date().toISOString(),read_only:true,plan,
    settings:Object.fromEntries(keys.map((k,i)=>[k,values[i]])),totals,capacity,layout,
    recipients,recent,events,tracker_names_loaded,sequence:[1,1,1,2,2,3],minimum_gap_hours:48,
    tracker_url:'https://docs.google.com/spreadsheets/d/1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w/edit'};
}
