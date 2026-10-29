import * as wmill from 'windmill-client';
import {createHash,randomUUID} from 'node:crypto';

// Fetch public profiles for TinyFish candidates. Candidate identity remains unconfirmed.
export async function main(dry_run:boolean=true,batch_size:number=25,continue_backfill:boolean=false){
 const sql=wmill.datatable('main');
 const eligible=await sql`SELECT q.person_key,q.group_keys,q.body,q.result,q.result->'candidates'->0->>'url' url FROM sales_intelligence_tinyfish_queue q WHERE q.status IN ('ambiguous','cached_ambiguous') AND q.result->'candidates'->0->>'url' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_intelligence_profiles p WHERE p.url=q.result->'candidates'->0->>'url') ORDER BY q.updated_at,q.person_key LIMIT ${Math.min(50,Math.max(1,batch_size))}`.fetch();
 const scope=await sql`SELECT count(*)::integer people,count(DISTINCT result->'candidates'->0->>'url')::integer urls FROM sales_intelligence_tinyfish_queue WHERE status IN ('ambiguous','cached_ambiguous') AND result->'candidates'->0->>'url' IS NOT NULL`.fetchOne();
 const before=await sql`SELECT used_micro,cap_micro,enabled FROM sales_intelligence_budget WHERE service='treg'`.fetchOne();
 if(dry_run)return {dry_run:true,finished_people_with_candidate:scope.people,unique_candidate_urls:scope.urls,batch_urls:eligible.length,maximum_batch_usd:eligible.length*.0012,budget:before,identity_confirmed:false};
 await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_tinyfish_treg_evidence(person_key text PRIMARY KEY,url text NOT NULL,status text NOT NULL,profile_name text,headline text,current_company text,name_agrees boolean NOT NULL DEFAULT false,company_agrees boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now())`.execute();
 await sql`UPDATE sales_intelligence_profiles SET status='no_result' WHERE status='complete' AND profile->>'request_id' IS NOT NULL AND profile->'data' ? 'error' AND profile->'data'->>'name' IS NULL`.execute();
 await sql`UPDATE sales_intelligence_budget SET cap_micro=8900000 WHERE service='treg' AND cap_micro=5000000`.execute();
 const owner=randomUUID();const locked=await sql`UPDATE sales_intelligence_budget SET lease_owner=${owner},lease_until=now()+interval '15 minutes' WHERE service='treg' AND enabled=true AND (lease_until IS NULL OR lease_until<now()) RETURNING service`.fetch();
 if(!locked.length)return {status:'busy_or_disabled'};
 let fetched=0,reused=0,uncertain=0,stopped=false;
 try{
  const token=await wmill.getVariable('f/sales_intelligence/treg_token');
  for(const item of eligible){
   const url=String(item.url);if(!/^https:\/\/www\.linkedin\.com\/in\/[a-z0-9._-]+$/i.test(url))continue;
   let saved=await sql`SELECT * FROM sales_intelligence_profiles WHERE url=${url}`.fetchOne();
   if(!saved){
    const reserved=await sql`WITH b AS(UPDATE sales_intelligence_budget SET used_micro=used_micro+1200,lease_until=now()+interval '15 minutes' WHERE service='treg' AND lease_owner=${owner} AND enabled=true AND used_micro+1200<=cap_micro RETURNING service) INSERT INTO sales_intelligence_profiles(url,status,cost_micro) SELECT ${url},'pending',1200 FROM b ON CONFLICT DO NOTHING RETURNING url`.fetch();
    if(!reserved.length){stopped=true;break;}
    try{
     const r=await fetch('https://treg.to/call/anyapi.linkedin.user.profile',{method:'POST',headers:{'X-Treg-Token':token,'X-Treg-Route-Max-Cost':'0.0012','Idempotency-Key':'sales-tinyfish-anyapi-'+createHash('sha256').update(url).digest('hex'),'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(45000)});
     const data=await r.json();const h=r.headers.get('X-Treg-Cost-Micro');const cost=h!==null&&/^\d+$/.test(h)?Number(h):1200;
     const status=r.ok&&data.output?.found&&data.output?.data?.name?'complete':r.ok?'no_result':`http_${r.status}`;
     await sql`WITH s AS(UPDATE sales_intelligence_profiles SET status=${status},cost_micro=${cost},profile=${JSON.stringify(data)}::jsonb,call_id=${r.headers.get('X-Treg-Call-Id')},updated_at=now() WHERE url=${url} AND status='pending' RETURNING url) UPDATE sales_intelligence_budget SET used_micro=used_micro-1200+${cost} WHERE service='treg' AND EXISTS(SELECT 1 FROM s)`.execute();
     fetched++;
     if(!r.ok&&[401,402,403,429].includes(r.status)){stopped=true;break;}
    }catch{await sql`UPDATE sales_intelligence_profiles SET status='uncertain',updated_at=now() WHERE url=${url} AND status='pending'`.execute();uncertain++;stopped=true;break;}
   }else reused++;
  }
 }finally{await sql`UPDATE sales_intelligence_budget SET lease_owner=NULL,lease_until=NULL WHERE service='treg' AND lease_owner=${owner}`.execute();}
 const rows=await sql`SELECT q.person_key,q.group_keys,q.body,q.result,p.url,p.status,p.profile FROM sales_intelligence_tinyfish_queue q JOIN sales_intelligence_profiles p ON p.url=q.result->'candidates'->0->>'url' LEFT JOIN sales_intelligence_tinyfish_treg_evidence e ON e.person_key=q.person_key WHERE q.status IN ('ambiguous','cached_ambiguous') AND e.person_key IS NULL ORDER BY q.updated_at,q.person_key LIMIT 100`.fetch();
 let published=0;
 for(const row of rows){
  const data=row.profile?.output?.data??row.profile?.data??{};
  const found=row.status==='complete'&&typeof data.name==='string'&&data.name.trim().length>2;
  const name=found?data.name:null,company=found?String(data.current_company_name??data.current_company??data.experience?.[0]?.company??''):null;
  const norm=(v:any)=>String(v??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>1);
  const expected=norm(row.body?.name),actual=norm(name),nameAgrees=found&&expected.length>=2&&expected.every((t:string)=>actual.includes(t));
  const clue=String(row.result?.company_clue??'').toLowerCase();const companyAgrees=!!clue&&!!company&&company.toLowerCase().includes(clue);
  const headline=found?String(data.headline??data.position??data.experience?.[0]?.title??'').slice(0,300):null;
  const status=found?(nameAgrees?(companyAgrees?'corroborated_candidate':'name_only_candidate'):'name_mismatch'):'no_usable_profile';
  await sql`INSERT INTO sales_intelligence_tinyfish_treg_evidence(person_key,url,status,profile_name,headline,current_company,name_agrees,company_agrees) VALUES(${row.person_key},${row.url},${status},${name},${headline},${company},${nameAgrees},${companyAgrees}) ON CONFLICT DO NOTHING`.execute();
  const summary={url:row.url,status,profile_name:name,headline,current_company:company,source:'Treg / public LinkedIn candidate',identity_status:companyAgrees?'Name and company clue agree; owner confirmation required':nameAgrees?'Name agrees only; identity unconfirmed':'No reliable identity match',checked_at:new Date().toISOString()};
  for(const group of row.group_keys)await sql`UPDATE sales_intelligence_groups SET body=jsonb_set(body,'{tinyfish_treg_candidate}',${JSON.stringify(summary)}::jsonb),updated_at=now() WHERE group_key=${group}`.execute();
  published++;
 }
 const remaining=await sql`SELECT count(*)::integer n FROM sales_intelligence_tinyfish_queue q WHERE q.status IN ('ambiguous','cached_ambiguous') AND q.result->'candidates'->0->>'url' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_intelligence_profiles p WHERE p.url=q.result->'candidates'->0->>'url')`.fetchOne();
 const unpublished=await sql`SELECT count(*)::integer n FROM sales_intelligence_tinyfish_queue q JOIN sales_intelligence_profiles p ON p.url=q.result->'candidates'->0->>'url' WHERE q.status IN ('ambiguous','cached_ambiguous') AND NOT EXISTS(SELECT 1 FROM sales_intelligence_tinyfish_treg_evidence e WHERE e.person_key=q.person_key)`.fetchOne();
 const tinyPending=await sql`SELECT count(*)::integer n FROM sales_intelligence_tinyfish_queue WHERE status IN ('pending','fetch_pending')`.fetchOne();
 const next_job=continue_backfill&&!stopped&&(remaining.n||unpublished.n||tinyPending.n)?await wmill.runScriptAsync('f/sales_intelligence/treg_tinyfish_candidates',null,{dry_run:false,batch_size:25,continue_backfill:true},remaining.n||unpublished.n?10:1800):null;
 const budget=await sql`SELECT used_micro,cap_micro FROM sales_intelligence_budget WHERE service='treg'`.fetchOne();
 return {status:stopped?'stopped':remaining.n||unpublished.n?'running':tinyPending.n?'waiting_for_tinyfish':'complete',fetched,reused,uncertain,published,remaining:remaining.n,unpublished:unpublished.n,tinyfish_pending:tinyPending.n,next_job,budget,identity_confirmed:false};
}
