import * as wmill from 'windmill-client';
import {createHash,randomUUID} from 'node:crypto';
export async function main(dry_run:boolean=true){
 const sql=wmill.datatable('main');
 const groups=await sql`SELECT group_key,body FROM sales_intelligence_groups WHERE body::text LIKE '%linkedin.com/in/%' ORDER BY group_key`.fetch();
 const links=new Map<string,any[]>();
 for(const g of groups){
  const urls=[...new Set((JSON.stringify(g.body).match(/https?:[^\s"<>]*linkedin\.com\/in\/[^\s"<>\\]*/g)||[]).map((s:string)=>{
   try{const u=new URL(s),m=u.pathname.match(/^\/in\/([^/]+)/);return /(^|\.)linkedin\.com$/.test(u.hostname)&&m?'https://www.linkedin.com/in/'+m[1].toLowerCase():null;}catch{return null;}
  }).filter(Boolean))];
  for(const url of urls)links.set(url,[...(links.get(url)??[]),g]);
 }
 if(dry_run)return {groups:groups.length,unique_urls:links.size,max_cost_usd:links.size*.01};
 await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_profiles(url text PRIMARY KEY,status text NOT NULL,cost_micro bigint NOT NULL DEFAULT 10000,profile jsonb,call_id text,updated_at timestamptz NOT NULL DEFAULT now())`.execute();
 await sql`INSERT INTO sales_intelligence_budget(service,migrated,enabled) VALUES('treg',true,true) ON CONFLICT DO NOTHING`.execute();
 const owner=randomUUID();
 const lock=await sql`UPDATE sales_intelligence_budget SET lease_owner=${owner},lease_until=now()+interval '15 minutes' WHERE service='treg' AND enabled=true AND (lease_until IS NULL OR lease_until<now()) RETURNING service`.fetch();
 if(!lock.length)return {status:'busy_or_disabled'};
 let fresh=0,cached=0,matched=0,review=0;
 try{
 const token=await wmill.getVariable('f/sales_intelligence/treg_token');
 for(const [url,people]of links){
  let saved=await sql`SELECT * FROM sales_intelligence_profiles WHERE url=${url}`.fetchOne();
  if(!saved){
   const reserved=await sql`WITH b AS (UPDATE sales_intelligence_budget SET used_micro=used_micro+10000,lease_until=now()+interval '15 minutes'
    WHERE service='treg' AND lease_owner=${owner} AND enabled=true AND used_micro+10000<=cap_micro RETURNING service)
    INSERT INTO sales_intelligence_profiles(url,status) SELECT ${url},'pending' FROM b RETURNING url`.fetch();
   if(!reserved.length)break;
   try{
    const r=await fetch('https://treg.to/call/harvestapi.linkedin.user.profile?'+new URLSearchParams({url}),{headers:{'X-Treg-Token':token,'X-Treg-Route-Max-Cost':'0.01','Idempotency-Key':'sales-intel-'+createHash('sha256').update(url).digest('hex')},signal:AbortSignal.timeout(45000)});
    const body=await r.json();const costHeader=r.headers.get('X-Treg-Cost-Micro');
    const cost=costHeader!==null&&/^\d+$/.test(costHeader)?Number(costHeader):10000;
    const profile=body.element??body.elements?.[0];const status=r.ok&&profile?'complete':'no_result';
    await sql`WITH s AS (UPDATE sales_intelligence_profiles SET status=${status},cost_micro=${cost},profile=${JSON.stringify(profile??null)}::jsonb,call_id=${r.headers.get('X-Treg-Call-Id')},updated_at=now() WHERE url=${url} AND status='pending' RETURNING url)
     UPDATE sales_intelligence_budget SET used_micro=used_micro-10000+${cost} WHERE service='treg' AND EXISTS(SELECT 1 FROM s)`.execute();
    fresh++;
   }catch{await sql`UPDATE sales_intelligence_profiles SET status='uncertain' WHERE url=${url}`.execute();}
   saved=await sql`SELECT * FROM sales_intelligence_profiles WHERE url=${url}`.fetchOne();
  }else cached++;
  if(saved.status!=='complete')continue;
  const p=saved.profile;const fullName=p.fullName??p.name??[p.firstName,p.lastName].filter(Boolean).join(' ');
  const normalize=(v:string)=>v.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>1);
  for(const person of people){
   const a=normalize(person.body.name),b=normalize(fullName);const nameConsistent=a.length>=2&&a.every((s:string)=>b.includes(s));
   const item={url,profile_name:fullName,name_consistent:nameConsistent,identity_status:nameConsistent?'CRM link and name agree; identity not independently verified':'Identity mismatch or incomplete name — review',headline:nameConsistent?(p.headline??null):null,location:nameConsistent?(p.location?.parsed?.text??p.location?.linkedinText??(typeof p.location==='string'?p.location:null)):null,source:'Treg / HarvestAPI',checked_at:new Date().toISOString()};
   const old=person.body.professional_profiles??[];const updated=[...old.filter((x:any)=>x.url!==url),item];person.body.professional_profiles=updated;
   await sql`UPDATE sales_intelligence_groups SET body=jsonb_set(body,'{professional_profiles}',${JSON.stringify(updated)}::jsonb),updated_at=now() WHERE group_key=${person.group_key}`.execute();
   if(nameConsistent)matched++;else review++;
  }
 }
 }finally{await sql`UPDATE sales_intelligence_budget SET lease_owner=NULL,lease_until=NULL WHERE service='treg' AND lease_owner=${owner}`.execute();}
 const budget=await sql`SELECT used_micro,cap_micro FROM sales_intelligence_budget WHERE service='treg'`.fetchOne();
 await sql`UPDATE sales_intelligence_health SET body=body||${JSON.stringify({treg:{fresh,cached,matched,review,budget,scope:'Recorded LinkedIn URLs only; no inferred profiles'}})}::jsonb WHERE id='backfill'`.execute();
 return {fresh,cached,matched,review,budget};
}
