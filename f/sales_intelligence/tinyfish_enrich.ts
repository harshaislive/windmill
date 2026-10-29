import * as wmill from 'windmill-client';
import {createHash,randomUUID} from 'node:crypto';
export async function main(dry_run:boolean=true,batch_size:number=25,continue_backfill:boolean=false){
 const sql=wmill.datatable('main');
 if(dry_run){const n=await sql`SELECT count(*)::integer groups,count(DISTINCT COALESCE(body->>'person_id',group_key))::integer people FROM sales_intelligence_groups WHERE body->'review_work'->'flags' ? 'profile'`.fetchOne();return {dry_run:true,...n,paid_fallback:false,searches_per_hour:450,fetches_per_day:900};}
 await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_tinyfish_queue(person_key text PRIMARY KEY,group_keys jsonb NOT NULL,body jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',result jsonb,updated_at timestamptz NOT NULL DEFAULT now())`.execute();
 await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_tinyfish_calls(request_hash text PRIMARY KEY,kind text NOT NULL,status text NOT NULL,response jsonb,created_at timestamptz NOT NULL DEFAULT now())`.execute();
 await sql`ALTER TABLE sales_intelligence_tinyfish_calls ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1`.execute();
 await sql`ALTER TABLE sales_intelligence_tinyfish_calls ADD COLUMN IF NOT EXISTS account_slot integer NOT NULL DEFAULT 1`.execute();
 await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_tinyfish_account_blocks(kind text NOT NULL,account_slot integer NOT NULL,blocked_until timestamptz NOT NULL,PRIMARY KEY(kind,account_slot))`.execute();
 await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_tinyfish_control(id text PRIMARY KEY,enabled boolean NOT NULL DEFAULT true,lease_owner text,lease_until timestamptz)`.execute();
 await sql`ALTER TABLE sales_intelligence_tinyfish_control ADD COLUMN IF NOT EXISTS initialized boolean NOT NULL DEFAULT false`.execute();
 await sql`INSERT INTO sales_intelligence_tinyfish_control(id) VALUES('backfill') ON CONFLICT DO NOTHING`.execute();
 const owner=randomUUID();const locked=await sql`UPDATE sales_intelligence_tinyfish_control SET lease_owner=${owner},lease_until=now()+interval '15 minutes' WHERE id='backfill' AND enabled=true AND (lease_until IS NULL OR lease_until<now()) RETURNING id`.fetch();if(!locked.length)return {status:'busy_or_disabled'};
 let processed=0,searches=0,fetches=0,halted=false,retryable=false,retryAfter=10;let next_job:any=null;
 try{
 const control=await sql`SELECT initialized FROM sales_intelligence_tinyfish_control WHERE id='backfill'`.fetchOne();
 if(!control.initialized){
 const groups=await sql`SELECT group_key,body FROM sales_intelligence_groups WHERE body->'review_work'->'flags' ? 'profile' ORDER BY pipeline_id,md5(group_key)`.fetch();
 const restricted=await sql`SELECT DISTINCT body->>'person_id' id FROM sales_intelligence_groups WHERE band='restricted'`.fetch();const noSearch=new Set(restricted.map((r:any)=>r.id));
 const people=new Map<string,any>();for(const g of groups){const b=g.body,key=b.person_id?'person-'+b.person_id:g.group_key;const old=people.get(key);if(old){old.group_keys.push(g.group_key);old.body.identity_review ||= b.identity_review;}else people.set(key,{person_key:key,group_keys:[g.group_key],body:{name:b.name,email:b.email,pipeline_id:b.pipeline_id,identity_review:b.identity_review,restricted:noSearch.has(String(b.person_id)),previous:b.profile_discovery??null}});}
 const values=[...people.values()];for(let i=0;i<values.length;i+=200)await sql`INSERT INTO sales_intelligence_tinyfish_queue(person_key,group_keys,body) SELECT v->>'person_key',v->'group_keys',v->'body' FROM jsonb_array_elements(${safeJson(values.slice(i,i+200))}::jsonb) v ON CONFLICT DO NOTHING`.execute();
 await sql`UPDATE sales_intelligence_tinyfish_control SET initialized=true WHERE id='backfill'`.execute();
 }
 const keys=await Promise.all(Array.from({length:9},(_,i)=>wmill.getVariable('f/sales_intelligence/tinyfish_api_key'+(i===0?'':`_${i+1}`)).catch(()=>null)));
 const accounts=keys.map((key,slot)=>({key,slot:slot+1})).filter(a=>!!a.key);
 if(accounts.length<3||new Set(accounts.map(a=>a.key)).size!==accounts.length)throw Error('At least three distinct TinyFish account secrets required');
 async function availableSlot(kind:'search'|'fetch',preferredSlot:number){
  const seconds=kind==='search'?3600:86400,limit=kind==='search'?450:900;
  const usage=await sql`SELECT account_slot,COALESCE(sum(attempts),0)::integer n FROM sales_intelligence_tinyfish_calls WHERE kind=${kind} AND created_at>now()-(${seconds}::integer * interval '1 second') GROUP BY account_slot`.fetch();
  const blocked=await sql`SELECT account_slot FROM sales_intelligence_tinyfish_account_blocks WHERE kind=${kind} AND blocked_until>now()`.fetch();
  const counts=new Map(usage.map((r:any)=>[Number(r.account_slot),Number(r.n)])),denied=new Set(blocked.map((r:any)=>Number(r.account_slot)));
  return !denied.has(preferredSlot)&&(counts.get(preferredSlot)??0)<limit?preferredSlot:null;
 }
 async function blockSlot(kind:'search'|'fetch',slot:number,status:number){
  const seconds=status===429?(kind==='search'?3600:86400):status===401||status===403?86400:120;
  await sql`INSERT INTO sales_intelligence_tinyfish_account_blocks(kind,account_slot,blocked_until) VALUES(${kind},${slot},now()+(${seconds}::integer * interval '1 second')) ON CONFLICT(kind,account_slot) DO UPDATE SET blocked_until=EXCLUDED.blocked_until`.execute();
 }
 async function progress(){const pending=await sql`SELECT count(*)::integer n FROM sales_intelligence_tinyfish_queue WHERE status IN ('pending','fetch_pending')`.fetchOne();await sql`UPDATE sales_intelligence_health SET body=jsonb_set(body,'{tinyfish}',${JSON.stringify({status:'running',pending:pending.n,processed,searches,fetches,updated_at:new Date().toISOString(),paid_fallback:false})}::jsonb),updated_at=now() WHERE id='backfill'`.execute();}
 await progress();
 const queue=await sql`SELECT * FROM sales_intelligence_tinyfish_queue WHERE status IN ('pending','fetch_pending') ORDER BY (status='pending') DESC,row_number() OVER(PARTITION BY body->>'pipeline_id' ORDER BY md5(person_key)),body->>'pipeline_id' LIMIT ${Math.min(50,Math.max(1,batch_size))}`.fetch();
 const started=Date.now();
 const lanes=accounts.map(()=>[] as any[]);
 for(const item of queue){
  // Keep identical names on one lane so duplicate queries and profile URLs reuse the same cache entry.
  const identity=normalize(item.body?.name).join(' ')||item.person_key;
  const lane=createHash('sha256').update(identity).digest().readUInt32BE(0)%lanes.length;
  lanes[lane].push(item);
 }
 const laneResults=await Promise.allSettled(lanes.map(async(items:any[],lane:number)=>{const accountSlot=accounts[lane].slot;
 for(const item of items){if(Date.now()-started>420000)break;
 const enabled=await sql`SELECT enabled FROM sales_intelligence_tinyfish_control WHERE id='backfill'`.fetchOne();if(!enabled.enabled){halted=true;break;}
 const g=item.body,input=discoveryInput(g);let result:any;
 if(g.restricted||g.identity_review||!input)result={status:'needs_identity_clue',candidates:[],reason:g.restricted?'Contact restricted':g.identity_review?'CRM identity unresolved':'Incomplete name or placeholder contact'};
 else if(g.previous)result={...g.previous,status:'cached_'+g.previous.status,reused:true};
 else{
 const hash=createHash('sha256').update('tinyfish-search-v1:'+input.query).digest('hex');
 let cached=await sql`SELECT * FROM sales_intelligence_tinyfish_calls WHERE request_hash=${hash}`.fetchOne();
 if(!cached){const legacy=await sql`SELECT response FROM sales_intelligence_discovery WHERE query=${input.query} AND status='complete' ORDER BY created_at DESC LIMIT 1`.fetchOne();if(legacy){const response={results:(legacy.response?.output?.data?.results??[]).map((r:any)=>({...r,url:r.link}))};await sql`INSERT INTO sales_intelligence_tinyfish_calls(request_hash,kind,status,response) VALUES(${hash},'search_cache','complete',${safeJson(response)}::jsonb) ON CONFLICT DO NOTHING`.execute();cached=await sql`SELECT * FROM sales_intelligence_tinyfish_calls WHERE request_hash=${hash}`.fetchOne();}}
 const retry=!!cached&&(/^(http_(429|5\d\d)|uncertain)$/.test(cached.status))&&Number(cached.attempts)<3;
 const retryStatus=cached?.status;
 if(retry)cached=null;
 if(!cached){
 const slot=await availableSlot('search',accountSlot);if(!slot){retryAfter=3600;break;}
 const usage=await sql`SELECT EXTRACT(EPOCH FROM now()-max(created_at))::float age FROM sales_intelligence_tinyfish_calls WHERE kind='search' AND account_slot=${slot} AND created_at>now()-interval '1 hour'`.fetchOne();
 if(usage.age!==null&&usage.age<8.1)await new Promise(r=>setTimeout(r,Math.ceil((8.1-usage.age)*1000)));
 const claimed=retry
  ?await sql`UPDATE sales_intelligence_tinyfish_calls SET status='pending',attempts=attempts+1,account_slot=${slot},created_at=now() WHERE request_hash=${hash} AND status=${retryStatus} RETURNING request_hash`.fetch()
  :await sql`INSERT INTO sales_intelligence_tinyfish_calls(request_hash,kind,status,account_slot) VALUES(${hash},'search','pending',${slot}) ON CONFLICT DO NOTHING RETURNING request_hash`.fetch();
 if(!claimed.length){retryAfter=10;break;}
 try{
 const r=await fetch('https://api.search.tinyfish.ai?'+new URLSearchParams({query:input.query,location:'IN',language:'en',include_domains:'linkedin.com'}),{headers:{'X-API-Key':keys[slot-1]},signal:AbortSignal.timeout(45000)});
 const data=await r.json();const state=r.ok&&Array.isArray(data.results)?'complete':'http_'+r.status;
 await sql`UPDATE sales_intelligence_tinyfish_calls SET status=${state},response=${safeJson(data)}::jsonb WHERE request_hash=${hash}`.execute();searches++;
 if(!r.ok){if([401,403,429].includes(r.status))await blockSlot('search',slot,r.status);halted=true;retryable=[401,403,429].includes(r.status)||r.status>=500;retryAfter=retryable?10:120;break;}
 }catch{await sql`UPDATE sales_intelligence_tinyfish_calls SET status='uncertain' WHERE request_hash=${hash}`.execute();halted=true;break;}
 cached=await sql`SELECT * FROM sales_intelligence_tinyfish_calls WHERE request_hash=${hash}`.fetchOne();
 }
 if(cached.status!=='complete'){
  const unresolved={status:'provider_uncertain',candidates:[],query:input.query,reason:'Search outcome unavailable after bounded retries',checked_at:new Date().toISOString()};
  await sql`UPDATE sales_intelligence_tinyfish_queue SET status='provider_uncertain',result=${safeJson(unresolved)}::jsonb,updated_at=now() WHERE person_key=${item.person_key}`.execute();
  processed++;continue;
 }
 const parsed=candidateResults({output:{data:{results:cached.response.results.map((r:any)=>({...r,link:r.url}))}}},input);
 result={status:parsed.status,candidates:parsed.candidates.slice(0,5),query:input.query,company_clue:input.anchor,provider:cached.kind==='search_cache'?'Cached Treg search / TinyFish fetch':'TinyFish Search',checked_at:new Date().toISOString()};
 // Fetch a corroborated candidate, or one explicitly unconfirmed candidate for owner review.
 const candidate=parsed.selected??parsed.candidates[0];
 if(candidate){
 const fh=createHash('sha256').update('tinyfish-fetch-v1:'+candidate.url).digest('hex');let page=await sql`SELECT * FROM sales_intelligence_tinyfish_calls WHERE request_hash=${fh}`.fetchOne();
 const retryFetch=!!page&&/^(http_(401|403|429)|uncertain)$/.test(page.status)&&Number(page.attempts)<3;
 if(!page||retryFetch){
 const slot=await availableSlot('fetch',accountSlot);
 if(!slot){result.fetch_status='daily_limit_pending';if(item.status==='fetch_pending')retryAfter=3600;}else{
 const claimed=retryFetch
  ?await sql`UPDATE sales_intelligence_tinyfish_calls SET status='pending',attempts=attempts+1,account_slot=${slot},created_at=now() WHERE request_hash=${fh} AND status=${page?.status} RETURNING request_hash`.fetch()
  :await sql`INSERT INTO sales_intelligence_tinyfish_calls(request_hash,kind,status,account_slot) VALUES(${fh},'fetch','pending',${slot}) ON CONFLICT DO NOTHING RETURNING request_hash`.fetch();
 if(!claimed.length){result.fetch_status='shared_fetch_pending';retryAfter=10;}
 else{
  try{const r=await fetch('https://api.fetch.tinyfish.ai',{method:'POST',headers:{'X-API-Key':keys[slot-1],'Content-Type':'application/json'},body:JSON.stringify({urls:[candidate.url],format:'markdown',per_url_timeout_ms:30000}),signal:AbortSignal.timeout(40000)});const b=await r.json();const state=r.ok?'complete':'http_'+r.status;await sql`UPDATE sales_intelligence_tinyfish_calls SET status=${state},response=${safeJson(b)}::jsonb WHERE request_hash=${fh}`.execute();fetches++;if([401,402,403,429].includes(r.status)){await blockSlot('fetch',slot,r.status);halted=true;retryable=true;retryAfter=10;}}catch{await sql`UPDATE sales_intelligence_tinyfish_calls SET status='uncertain' WHERE request_hash=${fh}`.execute();halted=true;}
  page=await sql`SELECT * FROM sales_intelligence_tinyfish_calls WHERE request_hash=${fh}`.fetchOne();
 }
 }}
 const p=page?.response?.results?.[0];const text=typeof p?.text==='string'?p.text:'';const title=String(p?.title??'');
 const titleAgrees=normalize(g.name).every((t:string)=>normalize(title).includes(t));
 const usable=titleAgrees&&text.length>250&&!!p?.description;
 result.fetch_status=result.fetch_status??(/^http_(401|403|429)$/.test(page?.status??'')?'daily_limit_pending':usable?'public_page_available':page?.response?.errors?.[0]?.error??'limited_or_unavailable');
 if(usable){result.candidate_page={url:candidate.url,title,description:p.description,excerpt:Array.from(text).slice(0,6000).join(''),checked_at:new Date().toISOString(),identity_confirmed:false};
 if(parsed.selected&&normalize(title+' '+p.description+' '+text).includes(input.anchor)){
 const profile={url:candidate.url,profile_name:g.name,name_consistent:true,headline:p.description,source:'TinyFish public page',identity_status:'Name and CRM company clue agree; owner confirmation required. Public page only.',checked_at:new Date().toISOString()};
 for(const group of item.group_keys)await sql`UPDATE sales_intelligence_groups SET body=jsonb_set(body,'{professional_profiles}',COALESCE(body->'professional_profiles','[]'::jsonb)||${safeJson([profile])}::jsonb) WHERE group_key=${group} AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(body->'professional_profiles','[]'::jsonb)) p WHERE p->>'url'=${candidate.url})`.execute();result.status='profile_enriched';
 }}
 }
 }
 await sql`UPDATE sales_intelligence_tinyfish_queue SET status=${result.fetch_status?.endsWith('_pending')?'fetch_pending':result.status},result=${safeJson(result)}::jsonb,updated_at=now() WHERE person_key=${item.person_key}`.execute();
 for(const group of item.group_keys){const row=await sql`SELECT body FROM sales_intelligence_groups WHERE group_key=${group}`.fetchOne();const body={...row.body,tinyfish_discovery:result};if(!g.previous)body.profile_discovery=result;const work=reviewWork(body);
 await sql`UPDATE sales_intelligence_groups SET body=body||${safeJson({tinyfish_discovery:result,...(!g.previous?{profile_discovery:result}:{}),review_work:work})}::jsonb,updated_at=now() WHERE group_key=${group}`.execute();}
 processed++;if(processed%5===0)await progress();
 }
 }));
 const failedLane=laneResults.find((r):r is PromiseRejectedResult=>r.status==='rejected');
 if(failedLane)throw failedLane.reason;
 const pending=await sql`SELECT count(*)::integer n FROM sales_intelligence_tinyfish_queue WHERE status IN ('pending','fetch_pending')`.fetchOne();
 const counts=await sql`SELECT status,count(*)::integer people,sum(jsonb_array_length(group_keys))::integer groups FROM sales_intelligence_tinyfish_queue GROUP BY status`.fetch();
 if(continue_backfill&&(!halted||retryable)&&pending.n)next_job=await wmill.runScriptAsync('f/sales_intelligence/tinyfish_enrich',null,{dry_run:false,batch_size:Math.min(50,Math.max(25,accounts.length*5)),continue_backfill:true},retryAfter);
 const receipt={status:halted?(retryable?'retry_scheduled':'needs_attention'):pending.n?'running':'search_pass_complete',processed,searches,fetches,pending:pending.n,counts,next_job,accounts:accounts.length,updated_at:new Date().toISOString(),paid_fallback:false};
 await sql`UPDATE sales_intelligence_health SET body=jsonb_set(body,'{tinyfish}',${JSON.stringify(receipt)}::jsonb),updated_at=now() WHERE id='backfill'`.execute();
 return receipt;
 }catch(error){await sql`UPDATE sales_intelligence_health SET body=jsonb_set(body,'{tinyfish}',${JSON.stringify({status:'needs_attention',updated_at:new Date().toISOString(),reason:'Worker failed; inspect the dedicated TinyFish job before resuming',paid_fallback:false})}::jsonb),updated_at=now() WHERE id='backfill'`.execute();throw error;
 }finally{await sql`UPDATE sales_intelligence_tinyfish_control SET lease_owner=NULL,lease_until=NULL WHERE id='backfill' AND lease_owner=${owner}`.execute();}
}

function safeJson(value:any){
 return JSON.stringify(value,(_,v)=>typeof v==='string'?v.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,'\uFFFD'):v);
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

function reviewWork(g:any){
 const p=g.priority??{},flags:string[]=[];
 if(['restricted','customer'].includes(p.band))return {flags,profile_status:'not_requested',explanation:p.reason};
 const profiles=g.professional_profiles??[];
 const matched=profiles.some((x:any)=>x.name_consistent&&x.headline);
 if(!matched)flags.push('profile');
 if(!p.phone)flags.push('contact');
 if(g.identity_review||profiles.some((x:any)=>!x.name_consistent)||['ambiguous','needs_identity_clue'].includes(g.profile_discovery?.status))flags.push('identity');
 if(!g.assessment&&g.evidence?.length)flags.push('processing');
 const a=g.assessment?.answers;
 if(p.band==='unscored'&&(!a||['intent','alignment','engagement'].some(k=>!(a[k+'_known']?.noul>=.7))||a.contact?.choice==='review'||a.contact?.probabilities?.restricted>=.2||/collective|source/i.test(p.reason??'')))flags.push('sales');
 return {flags,profile_status:matched?'profile_context_available':g.profile_discovery?.status??'not_searched',explanation:p.reason};
}
