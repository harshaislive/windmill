import * as wmill from 'windmill-client';
import {timingSafeEqual} from 'node:crypto';
export async function main(group_key: string, dashboard_password: string = '') {
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 const datePart=(type:string)=>parts.find(part=>part.type===type)?.value??'';
 const given=Buffer.from(dashboard_password);
 const expected=Buffer.from(datePart('day')+datePart('month')+datePart('year'));
 if(expected.length!==8||given.length!==expected.length||!timingSafeEqual(given,expected))throw new Error('Invalid dashboard password');
 if(!/^[123]:(person|deal)-\d+$/.test(group_key))throw new Error('Invalid lead');
 const sql=wmill.datatable('main');
 const row=await sql`SELECT g.group_key,g.name,g.owner_name,g.status,g.band,g.body,COALESCE(q.result->'candidates','[]'::jsonb) linkedin_candidates,q.status candidate_queue_status,d.linkedin_match,d.fit_capacity FROM sales_intelligence_groups g LEFT JOIN sales_intelligence_tinyfish_queue q ON q.person_key=split_part(g.group_key,':',2) LEFT JOIN LATERAL (SELECT linkedin_match,fit_capacity FROM sales_readiness_deals WHERE status='open' AND pipeline_id=g.pipeline_id AND (person_id=CASE WHEN split_part(g.group_key,':',2) LIKE 'person-%' THEN substring(split_part(g.group_key,':',2) from 8)::bigint ELSE NULL END OR deal_id=CASE WHEN split_part(g.group_key,':',2) LIKE 'deal-%' THEN substring(split_part(g.group_key,':',2) from 6)::bigint ELSE NULL END) ORDER BY CASE fit_capacity->>'capacity' WHEN 'transaction' THEN 0 WHEN 'budget' THEN 1 ELSE 2 END,updated_at DESC LIMIT 1) d ON true WHERE g.group_key=${group_key}`.fetchOne();
 if(!row)throw new Error('Lead not found');
 return {...row,body:{...row.body,fit_capacity:row.fit_capacity}};
}
