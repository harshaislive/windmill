import * as wmill from 'windmill-client';

type Query = Record<string, string | string[] | undefined>;
const PASSCODE_SHA256 = '2384067494aae17aab4f81c9a1577d49d64073e86d8ec897fb2f9a2f6b91ec08';
const owners = ['Mudumba Sesha Sai','Harsha Mudumba','Soundharya Somaraju','Shivathmika Racharla'];

async function passcodeValid(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') === PASSCODE_SHA256;
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Task Dashboard</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{font-family:Inter,Arial,sans-serif;color:#152524;background:#fff}*{box-sizing:border-box}body{margin:0}main{max-width:1540px;margin:auto;padding:18px 28px 55px}header{position:relative;text-align:center;margin:0 0 26px}h1{font-size:clamp(44px,6vw,84px);letter-spacing:-.065em;line-height:1.05;margin:0 0 3px;color:#142b29}header .kicker{font-size:18px;letter-spacing:.45em;text-transform:uppercase;margin:0 0 4px}header .sub{font:italic 22px Georgia,serif;color:#313a39;margin:0}.legend{position:absolute;right:0;top:45px;border:1px solid #d7dddf;border-radius:10px;padding:11px 18px;box-shadow:0 2px 4px #0001;background:white;font-size:14px}.legend b{display:block;margin-bottom:9px}.legend span{display:inline-flex;align-items:center;gap:6px;margin:0 9px}.badge{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;font-weight:700;font-size:17px;color:#17211e}.badge.High{background:#ffb9b5}.badge.Medium{background:#ffdc85}.badge.Low{background:#cce8c6}.badge.Pending{background:#ececec}.toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap}.toolbar .controls{display:flex;gap:9px;flex-wrap:wrap}select,input,button{font:inherit;border:1px solid #cdd7d3;border-radius:7px;padding:10px 12px;background:white}button{cursor:pointer;background:#173b36;color:white;border-color:#173b36}.meta{font-size:13px;color:#5f6866}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px 20px}.card{border:1px solid var(--line);border-radius:6px;overflow:hidden;background:white;box-shadow:0 2px 5px #00000008}.card h2{font-size:37px;letter-spacing:-.045em;margin:0;padding:14px 22px 11px;background:var(--tint);color:#121b1b}.card .count{font-size:15px;font-weight:500;letter-spacing:0;color:#52615c;margin-left:8px}.card table{border-collapse:collapse;width:100%;table-layout:fixed}.card th{background:var(--tint);text-align:left;font-size:17px;padding:11px 12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.card th:first-child,.card td:first-child{width:50px;text-align:center}.card th:last-child,.card td:last-child{width:128px;text-align:center}.card td{border-bottom:1px solid var(--line);padding:9px 11px;vertical-align:top;min-height:50px}.card tr:last-child td{border-bottom:0}.task-title{font-weight:600;line-height:1.3;overflow-wrap:anywhere}.task-detail{font-size:12px;color:#62706d;margin-top:3px}.empty{padding:25px 16px;color:#687472}.auth{max-width:440px;margin:90px auto;padding:28px;border:1px solid #cbd5d0;border-radius:10px;box-shadow:0 10px 30px #0001}.auth h2{margin:0 0 10px}.auth p{color:#596761}.auth form{display:flex;gap:8px}.auth input{min-width:0;flex:1}.error{color:#a32924;margin-top:12px}.hidden{display:none}.review{font-size:12px;color:#8a5d19;margin-left:5px}@media(max-width:1100px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.legend{position:static;display:inline-block;margin-top:15px}}@media(max-width:700px){main{padding:18px 13px}.grid{grid-template-columns:1fr;gap:14px}.card h2{font-size:31px}header .kicker{letter-spacing:.25em;font-size:13px}.legend span{margin:0 4px}.toolbar .controls{width:100%}.toolbar input{width:100%}}
@font-face{font-family:'ABC Arizona Flare';src:url('https://isdbyvwocudnlwzghphw.supabase.co/storage/v1/object/public/fonts_beforest_arizona/ABCArizonaFlare-Regular.cbcc518c.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'ABC Arizona Flare';src:url('https://isdbyvwocudnlwzghphw.supabase.co/storage/v1/object/public/fonts_beforest_arizona/ABCArizonaFlare-Medium.7ce0f1db.woff2') format('woff2');font-weight:500;font-display:swap}
html{font-size:13px}main{max-width:1480px;padding:18px 24px 42px}header{margin-bottom:20px}h1{font-family:'ABC Arizona Flare',Georgia,serif;font-weight:400;font-size:clamp(38px,4.6vw,62px);letter-spacing:-.035em;line-height:1.04;margin-bottom:5px}header .kicker{font-size:11px;letter-spacing:.38em;font-weight:600}header .sub{font:400 16px 'ABC Arizona Flare',Georgia,serif;margin-top:4px}.legend{top:20px;padding:8px 12px;font-size:11px}.legend b{margin-bottom:5px}.legend span{margin:0 5px}.badge{width:28px;height:28px;font-size:12px;font-weight:700}.toolbar{margin-bottom:12px}.toolbar .controls{gap:7px}.toolbar select,.toolbar input,.toolbar button{font-size:12px;padding:7px 9px}.toolbar .meta{font-size:11px}.grid{gap:14px}.card{height:370px;display:flex;flex-direction:column;min-height:0;box-shadow:none}.card h2{flex:none;font:400 27px/1.1 'ABC Arizona Flare',Georgia,serif;letter-spacing:-.018em;padding:10px 14px 9px}.card .count{font:500 11px Inter,Arial,sans-serif;margin-left:7px}.table-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#b8c6c2 transparent}.table-scroll:focus-visible{outline:2px solid #52867b;outline-offset:-2px}.card th{position:sticky;top:0;z-index:1;font-size:12px;font-weight:600;padding:8px;border-top:0}.card th:first-child,.card td:first-child{width:34px}.card th:last-child,.card td:last-child{width:88px}.card td{font-size:12px;padding:7px 8px;line-height:1.35;min-height:0}.task-title{font-size:12px;font-weight:600;line-height:1.3}.task-view{font-size:10px;font-weight:500;color:#315e55;text-decoration:underline;text-underline-offset:2px;white-space:nowrap;margin-left:5px}.task-view:hover,.task-view:focus-visible{color:#173b36}.task-correct{font-size:10px;font-weight:500;color:#315e55;background:none;border:0;padding:0;margin-left:7px;text-decoration:underline;text-underline-offset:2px}.task-correct:hover,.task-correct:focus-visible{color:#173b36}.human{font-size:10px;color:#315e55}.correction-dialog{width:min(420px,calc(100vw - 32px));border:1px solid #cad7d1;border-radius:9px;padding:22px;box-shadow:0 16px 55px #0002}.correction-dialog::backdrop{background:#10231d80}.correction-dialog h2{font:400 25px 'ABC Arizona Flare',Georgia,serif;margin:0 0 6px}.correction-dialog p{font-size:12px;color:#4b5d58;line-height:1.45}.correction-dialog label{display:block;font-size:12px;font-weight:600;margin:13px 0}.correction-dialog select{display:block;width:100%;margin-top:5px}.correction-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.correction-dialog .error{font-size:12px}.task-detail{font-size:10px;line-height:1.35;margin-top:3px}.review{font-size:10px}.auth{margin:55px auto;padding:23px}.auth h2{font:400 25px 'ABC Arizona Flare',Georgia,serif}.auth p{font-size:13px}@media(max-width:1100px){.legend{position:static;margin-top:10px}}@media(max-width:700px){main{padding:14px 12px 28px}.card{height:330px}.card h2{font-size:25px}header .kicker{font-size:10px;letter-spacing:.2em}.legend{font-size:10px}.toolbar .controls{gap:6px}}
</style></head><body><main><header><h1>Task Dashboard</h1><p class="kicker">JEV → TASK CLASSIFICATION</p><p class="sub">Open tasks. Your team. A clear view.</p><div class="legend"><b>Task Complexity</b><span><i class="badge High">H</i>High</span><span><i class="badge Medium">M</i>Medium</span><span><i class="badge Low">L</i>Low</span></div></header>
<section id="auth" class="auth"><h2>Enter passcode</h2><p>View the open tasks for Seshu, Harsha, Soundharya and Shivathmika.</p><form id="authForm"><input id="passcode" type="password" inputmode="numeric" autocomplete="off" placeholder="Passcode" required><button type="submit">Open dashboard</button></form><div id="authError" class="error" role="alert"></div></section>
<section id="board" class="hidden"><div class="toolbar"><div class="controls"><select id="brand"><option>All brands</option><option>Bewild</option><option>Beforest</option></select><select id="owner"><option>All owners</option></select><input id="search" type="search" placeholder="Search tasks"></div><div><span id="meta" class="meta"></span> <button id="refresh" type="button">Refresh</button></div></div><div id="grid" class="grid"></div><div id="boardError" class="error" role="alert"></div></section></main><dialog id="correctionDialog" class="correction-dialog"><form id="correctionForm"><h2>Correct classification</h2><p id="correctionTask"></p><p>Choose only what needs correcting. Use Jev removes a saved correction. Saving requires your Windmill login.</p><label>Category<select id="correctCategory"></select></label><label>Complexity<select id="correctComplexity"><option value="">Use Jev</option><option>Low</option><option>Medium</option><option>High</option></select></label><div id="correctionError" class="error" role="alert"></div><div class="correction-actions"><button id="correctionCancel" type="button">Cancel</button><button id="correctionSave" type="submit">Save</button></div></form></dialog>
<script>
const categories=[['Bewild','#ecfaf4','#b7d9cc'],['Sales Sprint','#edf5ff','#bdd5ed'],['Finance','#fff3eb','#f2cab2'],['Liaisoning','#f4f0ff','#d4c9ed'],['CDS','#fff0f6','#f4bed3'],['Regolith','#f2f8ed','#cadbbe'],['Collective Ops','#eff7f7','#c5dedf'],['Other','#f5f5f5','#d7d7d7']];let passcode='',data=null;
const el=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){
  if(!data)return;
  const brand=el('brand').value,owner=el('owner').value,search=el('search').value.toLowerCase().trim();
  const all=data.tasks.filter(t=>(brand==='All brands'||t.brand===brand)&&(owner==='All owners'||t.owners.includes(owner))&&(!search||(t.title+' '+t.owners.join(' ')+' '+t.category).toLowerCase().includes(search)));
  el('meta').textContent=all.length+' open tasks · Zoho sync '+new Date(data.synced_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  el('grid').innerHTML=categories.map(([name,tint,line])=>{
    const rows=all.filter(t=>t.category===name);
    return '<article class="card" style="--tint:'+tint+';--line:'+line+'"><h2>'+esc(name)+'<span class="count">'+rows.length+'</span></h2><div class="table-scroll" tabindex="0" aria-label="'+esc(name)+' tasks"><table><thead><tr><th>#</th><th>Task</th><th>Complexity</th></tr></thead><tbody>'+rows.map((t,i)=>
      '<tr><td>'+(i+1)+'</td><td><div class="task-title">'+esc(t.title)
      +(t.zoho_url?' <a class="task-view" href="'+esc(t.zoho_url)+'" target="_blank" rel="noopener noreferrer" aria-label="View '+esc(t.title)+' in Zoho Projects">View ↗</a>':'')
      +' <button class="task-correct" type="button" data-correct="'+esc(t.id)+'" aria-label="Correct classification for '+esc(t.title)+'">Correct</button></div><div class="task-detail">'
      +esc(t.owners.join(', '))+' · '+esc(t.status)+(t.due_date?' · Due '+esc(t.due_date):'')
      +(t.review_reason?'<span class="review"> · '+esc(t.review_reason)+'</span>':'')
      +(t.human_reviewed?'<span class="human"> · Human reviewed</span>':'')
      +'</div></td><td><span class="badge '+esc(t.complexity)+'">'+esc(({High:'H',Medium:'M',Low:'L'})[t.complexity]||'?')+'</span></td></tr>').join('')+'</tbody></table></div></article>'
  }).join('')||'<p class="empty">No open tasks match these filters.</p>';
}
async function load(){el('boardError').textContent='';const response=await fetch(location.pathname+'?data=1',{headers:{'X-Task-Board-Passcode':passcode,'Accept':'application/json'},cache:'no-store'});const body=await response.json();if(!response.ok)throw Error(body.error||'Could not load tasks');data=body;el('owner').innerHTML='<option>All owners</option>'+data.owners.map(x=>'<option>'+esc(x)+'</option>').join('');render()}
let correcting=null;
el('correctCategory').innerHTML='<option value="">Use Jev</option>'+categories.map(([name])=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
el('grid').addEventListener('click',event=>{
  const button=event.target.closest('[data-correct]');if(!button||!data)return;
  correcting=data.tasks.find(t=>t.id===button.dataset.correct);if(!correcting)return;
  el('correctionTask').textContent=correcting.title;
  el('correctCategory').value=correcting.correction_category||'';
  el('correctComplexity').value=correcting.correction_complexity||'';
  el('correctionError').textContent='';el('correctionDialog').showModal();
});
el('correctionCancel').addEventListener('click',()=>el('correctionDialog').close());
el('correctionForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!correcting)return;
  el('correctionError').textContent='';el('correctionSave').disabled=true;
  try{
    const url='/api/w/beforest-automations/jobs/run_wait_result/p/'+encodeURIComponent('f/task_intelligence_system/correct_open_task_board');
    const response=await fetch(url,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({zoho_task_id:correcting.id,category:el('correctCategory').value||null,complexity:el('correctComplexity').value||null})});
    if(response.status===401||response.status===403)throw Error('Sign in to Windmill in another tab, then retry.');
    if(!response.ok)throw Error('Could not save correction: '+(await response.text()).slice(0,180));
    await load();el('correctionDialog').close();
  }catch(error){el('correctionError').textContent=error.message||'Could not save correction.'}
  finally{el('correctionSave').disabled=false}
});
el('authForm').addEventListener('submit',async e=>{e.preventDefault();passcode=el('passcode').value;el('authError').textContent='';try{await load();el('auth').classList.add('hidden');el('board').classList.remove('hidden');el('passcode').value=''}catch(err){el('authError').textContent=err.message}});['brand','owner','search'].forEach(id=>el(id).addEventListener(id==='search'?'input':'change',render));el('refresh').addEventListener('click',async()=>{try{await load()}catch(err){el('boardError').textContent=err.message}});
</script></body></html>`;

export async function preprocessor(event: {kind:string;query?:Query;headers?:Record<string,string|string[]|undefined>}) {
  const headers=event.headers||{};
  const value=headers['x-task-board-passcode']||headers['X-Task-Board-Passcode']||'';
  return {query:event.query||{},passcode:Array.isArray(value)?value[0]:value};
}

export async function main(query: Query = {}, passcode = '') {
  if (!query.data) return {windmill_content_type:'text/html; charset=utf-8',result:html};
  if (!await passcodeValid(passcode)) return {windmill_content_type:'application/json; charset=utf-8',result:{error:'Incorrect passcode'},windmill_status_code:401};
  const sql=wmill.datatable('main');
  const tasks=await sql`SELECT t.zoho_task_id AS id,t.title,max(t.raw->'link'->'web'->>'url') AS zoho_url,coalesce(t.status,'') AS status,t.due_date::text AS due_date,
       array_agg(o.owner_name ORDER BY o.owner_name) FILTER (WHERE lower(o.owner_name) IN ('mudumba sesha sai','harsha mudumba','soundharya somaraju','shivathmika racharla')) AS owners,
       CASE WHEN r.category='Bewild' THEN 'Bewild' WHEN r.category IS NOT NULL THEN 'Beforest' ELSE coalesce(c.brand,'Beforest') END AS brand,
       CASE WHEN coalesce(r.category,c.category)='Licensing' THEN 'Liaisoning' ELSE coalesce(r.category,c.category,'Other') END AS category,
       coalesce(r.complexity,c.complexity,'Pending') AS complexity,r.category AS correction_category,r.complexity AS correction_complexity,
       (r.category IS NOT NULL OR r.complexity IS NOT NULL) AS human_reviewed,
       CASE WHEN c.task_id IS NULL OR c.source_hash <> md5(concat_ws('|', t.project_name, t.title, t.description, t.status, t.priority, t.tags::text, 'v8')) THEN 'Classification pending'
         WHEN r.category IS NULL AND c.category='Other' THEN 'Review workstream'
         WHEN r.category IS NULL AND coalesce((c.probabilities->'overrides'->>'category')::boolean,false)=false AND coalesce((c.probabilities->'category'->>c.category)::numeric,1)<0.45 THEN 'Review workstream'
         WHEN r.complexity IS NULL AND coalesce((c.probabilities->'overrides'->>'complexity')::boolean,false)=false AND coalesce((c.probabilities->'complexity'->>c.complexity)::numeric,1)<0.55 THEN 'Review complexity'
         ELSE NULL END AS review_reason
    FROM task_intel_tasks t JOIN task_intel_task_owners o ON o.task_id=t.id
    LEFT JOIN task_intel_board_classifications c ON c.task_id=t.id
    LEFT JOIN task_intel_board_corrections r ON r.zoho_task_id=t.zoho_task_id
    WHERE lower(coalesce(t.status,'')) NOT IN ('closed','done','completed','cancelled','canceled')
      AND t.synced_at >= now()-interval '3 hours'
      AND EXISTS (SELECT 1 FROM task_intel_task_owners a WHERE a.task_id=t.id AND lower(a.owner_name) IN ('mudumba sesha sai','harsha mudumba','soundharya somaraju','shivathmika racharla'))
    GROUP BY t.id,c.task_id,c.brand,c.category,c.complexity,c.confidence,c.source_hash,c.probabilities,r.category,r.complexity
    ORDER BY t.due_date NULLS LAST,t.title`.fetch();
  const recent=await sql`SELECT max(synced_at) AS synced_at FROM task_intel_tasks`.fetchOne();
  return {windmill_content_type:'application/json; charset=utf-8',result:{tasks,owners,synced_at:recent?.synced_at,generated_at:new Date().toISOString()}};
}


