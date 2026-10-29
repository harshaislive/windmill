import * as wmill from 'windmill-client';
import {createHash,randomUUID} from 'node:crypto';
export async function main(dry_run:boolean=true,batch_size:number=10){
 const sql=wmill.datatable('main');
 const rows=await sql`SELECT group_key,body->>'person_id' person_id,body->>'name' name,body->>'email' email,body->'professional_profiles' professional_profiles,body->'priority' priority,body->'identity_review' identity_review FROM sales_intelligence_groups g WHERE band NOT IN ('restricted','customer') AND body->'profile_discovery' IS NULL AND NOT EXISTS(SELECT 1 FROM sales_intelligence_groups x WHERE x.band='restricted' AND x.body->>'person_id'=g.body->>'person_id') ORDER BY CASE band WHEN 'top10' THEN 0 WHEN 'middle' THEN 1 WHEN 'lower' THEN 2 ELSE 3 END,group_key`.fetch();
 const seen=new Set();const eligible=rows.map((g:any)=>({...g,input:discoveryInput(g)})).filter((g:any)=>{const id=g.person_id??g.group_key;if(seen.has(id)||g.identity_review||g.professional_profiles?.some((p:any)=>p.name_consistent)||!g.input||(!g.input.anchor&&!g.priority?.rank_eligible))return false;seen.add(id);return true;});
 const batchQueries=new Set<string>();
 const selected=eligible.sort((a:any,b:any)=>Number(!!b.input.anchor)-Number(!!a.input.anchor)).filter((g:any)=>{if(batchQueries.has(g.input.query))return false;batchQueries.add(g.input.query);return true;}).slice(0,Math.max(1,Math.min(30,batch_size)));
 if(dry_run)return {eligible_people:eligible.length,anchored:eligible.filter((g:any)=>g.input.anchor).length,selected:selected.length,max_reserved_usd:selected.length*.011};
 await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_discovery(request_hash text PRIMARY KEY,query text NOT NULL,status text NOT NULL,cost_micro bigint NOT NULL DEFAULT 1000,response jsonb,call_id text,created_at timestamptz NOT NULL DEFAULT now())`.execute();
 const owner=randomUUID();const lock=await sql`UPDATE sales_intelligence_budget SET lease_owner=${owner},lease_until=now()+interval '15 minutes' WHERE service='treg' AND enabled=true AND (lease_until IS NULL OR lease_until<now()) RETURNING service`.fetch();if(!lock.length)return {status:'busy_or_disabled'};
 let searched=0,profiles=0,matched=0,ambiguous=0,processed=0;const start=Date.now();
 try{
 const token=await wmill.getVariable('f/sales_intelligence/treg_token');
 let stopped=false;
 async function processPerson(g:any){if(stopped||Date.now()-start>180000)return;
 const hash=createHash('sha256').update('anyapi-v1:'+g.input.query).digest('hex');
 let saved=await sql`SELECT * FROM sales_intelligence_discovery WHERE request_hash=${hash}`.fetchOne();
 if(!saved){
 const reserve=await sql`WITH b AS(UPDATE sales_intelligence_budget SET used_micro=used_micro+1000,lease_until=now()+interval '15 minutes' WHERE service='treg' AND lease_owner=${owner} AND enabled=true AND used_micro+1000<=cap_micro RETURNING service) INSERT INTO sales_intelligence_discovery(request_hash,query,status) SELECT ${hash},${g.input.query},'pending' FROM b RETURNING request_hash`.fetch();if(!reserve.length){stopped=true;return;}
 try{
 const r=await fetch('https://treg.to/call/anyapi.google.serp.organic',{method:'POST',headers:{'Content-Type':'application/json','X-Treg-Token':token,'X-Treg-Route-Max-Cost':'0.001','Idempotency-Key':'si-search-'+hash},body:JSON.stringify({query:g.input.query,limit:5,gl:'in',hl:'en',autocorrect:false}),signal:AbortSignal.timeout(35000)});
 const data=await r.json();const h=r.headers.get('X-Treg-Cost-Micro');const cost=h!==null&&/^\d+$/.test(h)?Number(h):1000;
 const state=r.ok&&(Array.isArray(data?.output?.data?.results)||data?.output?.found===false)?'complete':'http_'+r.status;
 await sql`WITH s AS(UPDATE sales_intelligence_discovery SET status=${state},response=${JSON.stringify(data)}::jsonb,cost_micro=${cost},call_id=${r.headers.get('X-Treg-Call-Id')} WHERE request_hash=${hash} AND status='pending' RETURNING request_hash) UPDATE sales_intelligence_budget SET used_micro=used_micro-1000+${cost} WHERE service='treg' AND EXISTS(SELECT 1 FROM s)`.execute();searched++;
 }catch{await sql`UPDATE sales_intelligence_discovery SET status='uncertain' WHERE request_hash=${hash}`.execute();}
 saved=await sql`SELECT * FROM sales_intelligence_discovery WHERE request_hash=${hash}`.fetchOne();
 }
 const result=saved.status==='complete'?candidateResults(saved.response,g.input):{candidates:[],selected:null,status:'search_failed'};
 let profileItem:any=null;
 if(result.selected){
 const url=result.selected.url;let cached=await sql`SELECT * FROM sales_intelligence_profiles WHERE url=${url}`.fetchOne();
 if(!cached){
 const reserve=await sql`WITH b AS(UPDATE sales_intelligence_budget SET used_micro=used_micro+10000 WHERE service='treg' AND lease_owner=${owner} AND enabled=true AND used_micro+10000<=cap_micro RETURNING service) INSERT INTO sales_intelligence_profiles(url,status) SELECT ${url},'pending' FROM b RETURNING url`.fetch();
 if(reserve.length){try{
 const r=await fetch('https://treg.to/call/harvestapi.linkedin.user.profile?'+new URLSearchParams({url}),{headers:{'X-Treg-Token':token,'X-Treg-Route-Max-Cost':'0.01','Idempotency-Key':'sales-intel-'+createHash('sha256').update(url).digest('hex')},signal:AbortSignal.timeout(35000)});
 const data=await r.json();const p=data.element??data.elements?.[0];const h=r.headers.get('X-Treg-Cost-Micro');const cost=h!==null&&/^\d+$/.test(h)?Number(h):10000;
 await sql`WITH s AS(UPDATE sales_intelligence_profiles SET status=${r.ok&&p?'complete':'no_result'},profile=${JSON.stringify(p??null)}::jsonb,cost_micro=${cost},call_id=${r.headers.get('X-Treg-Call-Id')},updated_at=now() WHERE url=${url} AND status='pending' RETURNING url) UPDATE sales_intelligence_budget SET used_micro=used_micro-10000+${cost} WHERE service='treg' AND EXISTS(SELECT 1 FROM s)`.execute();profiles++;
 }catch{await sql`UPDATE sales_intelligence_profiles SET status='uncertain' WHERE url=${url}`.execute();}
 cached=await sql`SELECT * FROM sales_intelligence_profiles WHERE url=${url}`.fetchOne();}
 }
 if(cached?.status==='complete'){
 const p=cached.profile;const full=p.fullName??p.name??[p.firstName,p.lastName].filter(Boolean).join(' ');const matches=normalize(g.name).every((s:string)=>normalize(full).includes(s));
 if(matches){profileItem={url,profile_name:full,name_consistent:true,headline:p.headline??null,location:p.location?.parsed?.text??p.location?.linkedinText??null,source:'Treg / AnyAPI search + HarvestAPI',identity_status:'Name and CRM email-domain company clue agree; owner confirmation still required',match_basis:{company_clue:g.input.anchor,search_title:result.selected.title,search_snippet:result.selected.snippet},checked_at:new Date().toISOString()};result.status='profile_enriched';matched++;}
 else result.status='ambiguous';
 }else result.status='profile_fetch_pending_review';
 }
 if(result.status==='ambiguous')ambiguous++;
 const discovery={status:result.status,candidates:result.candidates,query:g.input.query,company_clue:g.input.anchor,checked_at:new Date().toISOString(),provider:'Treg / AnyAPI',request_hash:hash};
 const patch:any={profile_discovery:discovery};
 // Preserve each group's existing profiles; only add the corroborated profile and discovery metadata.
 await sql`UPDATE sales_intelligence_groups SET body=body||${JSON.stringify(patch)}::jsonb,updated_at=now() WHERE group_key=${g.group_key} OR (${g.person_id}::text IS NOT NULL AND body->>'person_id'=${g.person_id})`.execute();
 if(profileItem)await sql`UPDATE sales_intelligence_groups SET body=jsonb_set(body,'{professional_profiles}',COALESCE(body->'professional_profiles','[]'::jsonb)||${JSON.stringify([profileItem])}::jsonb),updated_at=now() WHERE (group_key=${g.group_key} OR (${g.person_id}::text IS NOT NULL AND body->>'person_id'=${g.person_id})) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(body->'professional_profiles','[]'::jsonb)) p WHERE p->>'url'=${profileItem.url})`.execute();
 processed++;if(saved.status!=='complete')stopped=true;
 }
 // At most five concurrent people, matching the documented Harvest account limit.
 for(let i=0;i<selected.length&&!stopped;i+=5)await Promise.all(selected.slice(i,i+5).map(processPerson));
 }finally{await sql`UPDATE sales_intelligence_budget SET lease_owner=NULL,lease_until=NULL WHERE service='treg' AND lease_owner=${owner}`.execute();}
 const budget=await sql`SELECT used_micro,cap_micro FROM sales_intelligence_budget WHERE service='treg'`.fetchOne();
 return {processed,searched,profiles,matched,ambiguous,budget,remaining_before_batch:eligible.length};
}

const normalize=(s:string)=>String(s??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>1);
const personal=new Set(['gmail','googlemail','yahoo','ymail','hotmail','outlook','live','msn','icloud','me','mac','aol','rediffmail','rediff','proton','protonmail','gmx','mail','email','rocketmail','yandex','qq','163','126','hey','vsnl','sify','indiatimes','in','consultant','engineer','usa','post','mailinator','fastmail','tutanota','tuta','zoho','yopmail']);
function discoveryInput(g:any){
 const name=normalize(g.name);if(name.length<2||/^(test|dummy|unknown|abc)(\s|$)/i.test(g.name??''))return null;
 const domain=String(g.email??'').split('@')[1]?.toLowerCase().split(/[\s,;]/)[0]??'';
 if(/(^|\.)(example\.(com|org|net)|test|invalid|localhost)$/.test(domain))return null;
 const company=domain.split('.')[0];const anchor=company&&company.length>=4&&!personal.has(company)&&!/^yahoo\d*$/.test(company)?company:null;
 return {query:'site:linkedin.com/in/ "'+name.join(' ')+'"'+(anchor?' "'+anchor+'"':''),anchor,name:name.join(' ')};
}
function candidateResults(raw:any,input:any){
 const rows=raw?.output?.data?.results??[];
 const found=new Map<string,any>();
 for(const r of rows){let u:URL;try{u=new URL(r.link)}catch{continue}const m=u.pathname.match(/^\/in\/([^/]+)/);if(!/(^|\.)linkedin\.com$/.test(u.hostname)||!m)continue;
 const title=String(r.title??''),snippet=String(r.snippet??'');const tokens=normalize(title);if(!normalize(input.name).every(t=>tokens.includes(t)))continue;
 const anchorMatched=!!input.anchor&&normalize(title+' '+snippet).includes(input.anchor);
 const url='https://www.linkedin.com/in/'+m[1].toLowerCase();found.set(url,{url,title,snippet,anchor_matched:anchorMatched});
 }
 const candidates=[...found.values()];const strong=candidates.filter(c=>c.anchor_matched);
 return {candidates,selected:strong.length===1?strong[0]:null,status:strong.length===1?'corroborated_candidate':candidates.length?'ambiguous':'no_result'};
}
