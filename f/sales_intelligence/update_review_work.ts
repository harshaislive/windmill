import * as wmill from 'windmill-client';
export async function main(dry_run:boolean=true){
 const sql=wmill.datatable('main');const rows=await sql`SELECT group_key,body FROM sales_intelligence_groups`.fetch();
 const patches=rows.map((g:any)=>({key:g.group_key,work:reviewWork(g.body)}));
 const counts=Object.fromEntries(['profile','contact','sales','identity','processing'].map(k=>[k,patches.filter((p:any)=>p.work.flags.includes(k)).length]));
 if(!dry_run)for(let i=0;i<patches.length;i+=250)await sql`WITH v AS(SELECT value FROM jsonb_array_elements(${JSON.stringify(patches.slice(i,i+250))}::jsonb)) UPDATE sales_intelligence_groups g SET body=jsonb_set(body,'{review_work}',v.value->'work'),updated_at=now() FROM v WHERE g.group_key=v.value->>'key'`.execute();
 return {dry_run,counts,total:patches.length};
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
