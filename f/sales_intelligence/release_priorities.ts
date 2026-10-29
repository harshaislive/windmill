import * as wmill from 'windmill-client';
export async function main(dry_run:boolean=true){
 const sql=wmill.datatable('main');
 const pending=await sql`SELECT count(*)::integer n FROM sales_intelligence_groups g WHERE g.status<>'won' AND jsonb_array_length(g.body->'evidence')>0 AND (g.body->'assessment' IS NULL OR g.body->'assessment'='null'::jsonb) AND NOT EXISTS(SELECT 1 FROM sales_intelligence_queue q WHERE q.group_key=g.group_key AND q.evidence_hash=g.body->>'evidence_hash')`.fetchOne();
 const rows=await sql`SELECT g.body,g.status,q.status AS processing_status FROM sales_intelligence_groups g LEFT JOIN sales_intelligence_queue q ON q.group_key=g.group_key AND q.evidence_hash=g.body->>'evidence_hash' ORDER BY g.group_key`.fetch();
 const now=new Date().toISOString();const ranked=rankGroups(rows.map((r:any)=>({...r.body,status:r.status,processing_status:r.processing_status})),now);
 const summary=[1,2,3].map(id=>({pipeline_id:id,total:ranked.filter(r=>r.pipeline_id===id).length,bands:Object.fromEntries(['top10','middle','lower','unscored','restricted','customer'].map(b=>[b,ranked.filter(r=>r.pipeline_id===id&&r.priority.band===b).length]))}));
 if(dry_run)return {dry_run:true,pending:pending.n,summary};
 if(pending.n)throw Error('Full-cohort classification must finish before releasing percentile bands');
 for(let i=0;i<ranked.length;i+=250){
  await sql`WITH v AS (SELECT value FROM jsonb_array_elements(${JSON.stringify(ranked.slice(i,i+250))}::jsonb))
   UPDATE sales_intelligence_groups g SET band=v.value->'priority'->>'band',body=g.body||jsonb_build_object('priority',v.value->'priority'),updated_at=now()
   FROM v WHERE g.group_key=v.value->>'key'`.execute();
 }
 const excluded=await sql`SELECT status,count(*)::integer n FROM sales_intelligence_queue WHERE status<>'complete' GROUP BY status`.fetch();
 const patch={ranking_status:'released_for_owner_review',ranked_at:now,ranking_version:rankVersion,ranking_method:'Within each collective, eligible prospects only; 40% recorded intent, 35% alignment, 25% engagement. Each requires evidence probability >=0.70. Ties share percentile. Unknown, invalid contacts, restrictions and customers excluded. Not purchase probability.',summary,deferred:excluded,archive_audit:{complete:true,archived_deals:0,checked_at:'2026-09-22'},release_scope:'Saved Pipedrive snapshot, imported notes and activity descriptions; linked-profile context where available. No automatic CRM refresh, outreach, attachments or email-body import.'};
 await sql`UPDATE sales_intelligence_health SET body=body||${JSON.stringify(patch)}::jsonb,updated_at=now() WHERE id='backfill'`.execute();
 return {released:true,summary,deferred:excluded};
}

const rankVersion='crm-evidence-v1';
function priorityFor(g:any,now:string){
 const a=g.assessment?.answers;const selected=g.evidence?.find((e:any)=>e.id===a?.evidence?.choice);
 const source=selected??[...(g.evidence??[])].reverse().find((e:any)=>e.text?.length>25&&!/^Typeform intake|^This deal was converted|^enrichment$/i.test(e.text)&&!e.legacy_assessment);
 const parsed=source?.date?Date.parse(String(source.date).replace(' ','T')):NaN;
 const age=Number.isFinite(parsed)?Math.max(0,Math.floor((Date.parse(now)-parsed)/86400000)):null;
 const phone=String(g.phone??'').replace(/[^\d+]/g,'');
 const digits=phone.replace(/\D/g,'');
 const validPhone=digits.length>=10&&digits.length<=15&&!/(\d)\1{7}/.test(digits)&&!/(123456789|000000000)/.test(digits);
 const base:any={version:rankVersion,score:null,percentile:null,cohort_size:0,source:source?{id:source.id,date:source.date,text:source.text,label:source.label??null}:null,evidence_age_days:age,phone:validPhone?phone:null,action:'Review CRM history before contact',reason:'Insufficient reliable evidence',band:'unscored',rank_eligible:false};
 if(g.has_won_deal||g.status==='won')return {...base,band:'customer',reason:'Existing customer history',action:'Coordinate with the relationship owner'};
 const explicitRestriction=(g.evidence??[]).some((e:any)=>/(asked|requested|replied|said).{0,65}(remove.{0,25}(contact|number|database|data base)|stop.{0,20}(call|contact|messag))/i.test(e.text));
 if(explicitRestriction||a?.contact?.choice==='restricted'||a?.contact?.probabilities?.restricted>=.5)return {...base,band:'restricted',reason:'Contact restriction recorded',action:'Do not contact; owner must resolve the restriction'};
 if(g.identity_review)return {...base,reason:'Identity needs verification',action:'Verify this is the correct person in Pipedrive'};
 if(!validPhone)return {...base,reason:'Missing or invalid phone',action:'Verify contact details before calling'};
 if(/^(test|dummy|abc|aa|a|unknown)(\s|$)/i.test(g.name??''))return {...base,reason:'Possible test or incomplete contact',action:'Verify the contact record'};
 if(!a)return {...base,reason:g.processing_status==='oversized'?'Long history needs owner review':g.processing_status==='uncertain'?'Classification response was inconclusive':'Assessment unavailable or history requires review'};
 if(a.contact?.choice==='review'||a.contact?.probabilities?.restricted>=.2)return {...base,reason:'Contact permission is unclear',action:'Owner to review contact restrictions'};
 if(!selected||source.legacy_assessment)return {...base,reason:'No confident supporting source selected',action:'Review the recorded context and confirm current interest'};
 const others=g.pipeline_id===1?/Mumbai|Poomaale|Poomale/i:g.pipeline_id===2?/Hammiyala|Poomaale|Poomale/i:/Hammiyala|Mumbai/i;
 const own=g.pipeline_id===1?/Hammiyala/i:g.pipeline_id===2?/Mumbai/i:/Poomaale|Poomale/i;
 if(others.test(source.text)&&!own.test(source.text))return {...base,reason:'Selected evidence mentions another collective',action:'Confirm which collective this conversation concerns'};
 const dims=['intent','alignment','engagement'];
 const known=dims.every(k=>a[k+'_known']?.noul>=.7&&Number.isFinite(a[k]?.score));
 const signals=dims.map(k=>({name:k,known:a[k+'_known']?.noul??0,score:a[k+'_known']?.noul>=.7?a[k]?.score:null}));
 if(!known){const missing=dims.filter(k=>a[k+'_known']?.noul<.7);return {...base,signals,reason:'Needs confirmation: '+missing.join(', '),action:'Ask about '+missing.map(k=>k==='intent'?'joining plans':k==='alignment'?'reasons for choosing this collective':'previous discussions').join(' and ')};}
 const score=Math.round((.4*a.intent.score+.35*a.alignment.score+.25*a.engagement.score)/3*10000)/100;
 let action='Review the source and agree the next step';
 if(g.status==='lost'||age===null||age>90)action='Reconfirm interest and timing before a sales pitch';
 else if(a.action.choice==='call'&&a.action.probabilities.call>=.6)action='Confirm availability for the recorded call request';
 else if(a.action.choice==='details')action='Address the requested information first';
 else if(a.action.choice==='resolve')action='Address the recorded objection first';
 else if(a.action.choice==='hold')action='Confirm whether the recorded request to wait still applies';
 const reason=age!==null&&age>90?'Historical engagement; reconfirm current interest':'Recorded interest, collective alignment and engagement';
 return {...base,score,signals,action,reason,rank_eligible:true};
}
function rankGroups(groups:any[],now:string){
 const rows=groups.map(g=>({key:g.key,pipeline_id:g.pipeline_id,priority:priorityFor(g,now)}));
 for(const id of [1,2,3]){
  const cohort=rows.filter(r=>r.pipeline_id===id&&r.priority.rank_eligible).sort((a,b)=>a.priority.score-b.priority.score);
  for(let i=0;i<cohort.length;){let end=i+1;while(end<cohort.length&&cohort[end].priority.score===cohort[i].priority.score)end++;
   // Midrank assigns equal scores equal percentiles; no arbitrary split of ties.
   const percentile=cohort.length===1?50:100*((i+end-1)/2)/(cohort.length-1);
   for(let j=i;j<end;j++)Object.assign(cohort[j].priority,{percentile:Math.round(percentile*10)/10,cohort_size:cohort.length,band:percentile>=90?'top10':percentile>=50?'middle':'lower'});
   i=end;
  }
 }
 return rows;
}
