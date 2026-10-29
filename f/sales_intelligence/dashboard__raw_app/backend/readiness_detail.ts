import * as wmill from 'windmill-client';
import {timingSafeEqual} from 'node:crypto';

export async function main(deal_id: number, dashboard_password: string = '') {
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 const datePart=(type:string)=>parts.find(part=>part.type===type)?.value??'';
 const expected=Buffer.from(datePart('day')+datePart('month')+datePart('year'));
 const given=Buffer.from(dashboard_password);
 if(expected.length!==8||expected.length!==given.length||!timingSafeEqual(expected,given))throw Error('Invalid dashboard password');
 if(!Number.isSafeInteger(deal_id)||deal_id<=0)throw Error('Invalid deal');
 const sql=wmill.datatable('main');
 const row=await sql`SELECT d.deal_id,d.person_id,d.name,d.title,d.pipeline,d.owner_name,d.status,d.readiness,d.reason,d.email,d.phone,d.linkedin_url,d.evidence,d.initial_assessment,d.verification,d.reassessment,d.fit_capacity,d.verify_status,d.verify_started_at,d.verify_updated_at,d.source_updated_at,d.snapshot_at,d.linkedin_match,COALESCE(q.result->'candidates','[]'::jsonb) linkedin_candidates,q.status candidate_queue_status,q.result->>'checked_at' candidate_checked_at FROM sales_readiness_deals d LEFT JOIN sales_intelligence_tinyfish_queue q ON q.person_key='person-'||d.person_id::text WHERE d.deal_id=${deal_id}`.fetchOne();
 if(!row)throw Error('Deal not found');
 return row;
}
