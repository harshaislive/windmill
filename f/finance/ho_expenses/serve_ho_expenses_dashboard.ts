import * as wmill from "windmill-client";

type Query = Record<string, string | string[] | undefined>;

const API_PARAM = "__wmill_public_api";
const PASSCODE_VARIABLE = "f/finance/opex/dashboard_passcode";

function first(query: Query, key: string) {
  const value = query[key];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

async function requirePasscode(value: string) {
  const configured = String(await wmill.getVariable(PASSCODE_VARIABLE)).trim();
  if (!configured || value.trim() !== configured) throw new Error("Invalid dashboard passcode.");
}

async function getDashboard(department = "", period = "", fiscalYear = "") {
  const sql = wmill.datatable("main");
  const fiscalYearRows = await sql`SELECT DISTINCT fiscal_year FROM ho_expense_snapshots ORDER BY fiscal_year DESC`.fetch();
  const fiscalYears = fiscalYearRows.map((row: any) => String(row.fiscal_year));
  const selectedFiscalYear = fiscalYear || fiscalYears[0] || "FY 2026–27";
  const departmentRows = await sql`SELECT department FROM ho_expense_departments WHERE active = TRUE ORDER BY department`.fetch();
  const selectedDepartment = department || String(departmentRows[0]?.department || "");
  const months = await sql`SELECT period_key, report_from, report_to, data_status, synced_at
    FROM ho_expense_snapshots WHERE department = ${selectedDepartment} AND fiscal_year = ${selectedFiscalYear}
    ORDER BY period_key`.fetch();
  const selectedPeriod = period || String(months[months.length - 1]?.period_key || "");
  const snapshot = selectedPeriod
    ? await sql`SELECT payload, data_status, synced_at FROM ho_expense_snapshots
        WHERE department = ${selectedDepartment} AND fiscal_year = ${selectedFiscalYear} AND period_key = ${selectedPeriod}`.fetchOne()
    : null;
  const ytd = await sql`SELECT payload, report_to, synced_at FROM ho_expense_ytd_categories
    WHERE department = ${selectedDepartment} AND fiscal_year = ${selectedFiscalYear}`.fetchOne();
  const referenceBudget = Number(ytd?.payload?.monthlyBudgets?.[selectedPeriod] || 0);
  const hasReferenceBudget = ytd?.payload?.budgetStatus === "configured" && referenceBudget > 0;
  const selectedSnapshot = snapshot?.payload
    ? {
      ...snapshot.payload,
      categories: ytd?.payload?.categories || snapshot.payload.categories,
      categoryScope: ytd?.payload?.categoryScope || snapshot.payload.categoryScope,
      budgetStatus: hasReferenceBudget
        ? "configured"
        : ytd?.payload?.budgetStatus === "sync_pending" ? "sync_pending" : "not_configured_for_period",
      metrics: {
        ...snapshot.payload.metrics,
        budget: hasReferenceBudget ? referenceBudget : null,
        variance: hasReferenceBudget ? referenceBudget - Number(snapshot.payload.metrics?.actual || 0) : null,
        utilization: hasReferenceBudget ? Number(snapshot.payload.metrics?.actual || 0) / referenceBudget : null,
        activeCategories: ytd?.payload?.activeCategories ?? snapshot.payload.metrics?.activeCategories,
      },
    }
    : null;
  const historyRows = await sql`SELECT period_key, payload, data_status, synced_at
    FROM ho_expense_snapshots WHERE department = ${selectedDepartment} AND fiscal_year = ${selectedFiscalYear}
    ORDER BY period_key`.fetch();
  return {
    departments: departmentRows.map((row: any) => String(row.department)),
    months: months.map((row: any) => ({
      key: String(row.period_key), from: row.report_from, to: row.report_to,
      dataStatus: row.data_status, syncedAt: row.synced_at,
    })),
    fiscalYears, selectedFiscalYear, selectedDepartment, selectedPeriod, snapshot: selectedSnapshot,
    history: historyRows.map((row: any) => {
      const key = String(row.period_key);
      const budget = Number(ytd?.payload?.monthlyBudgets?.[key] || 0);
      const hasBudget = ytd?.payload?.budgetStatus === "configured" && budget > 0;
      const actual = Number(row.payload?.metrics?.actual || 0);
      return {
        periodKey: key,
        metrics: row.payload?.metrics ? {
          ...row.payload.metrics,
          budget: hasBudget ? budget : null,
          variance: hasBudget ? budget - actual : null,
          utilization: hasBudget ? actual / budget : null,
        } : null,
        period: row.payload?.period || null,
        dataStatus: row.data_status,
        syncedAt: row.synced_at,
      };
    }),
    dataStatus: snapshot?.data_status || "no_data",
    syncedAt: snapshot?.synced_at || null,
  };
}

function html() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Beforest HO Expenses</title>
  <style>
    :root{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#362820;background:#f7f5f1;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0;background:#f7f5f1}button,select,input{font:inherit;color:inherit}
    .shell{max-width:1600px;margin:auto;padding:0 28px 42px}.topbar{height:86px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1f4b3f}
    .brand{font-family:Georgia,serif;font-size:24px;letter-spacing:8px;color:#211812}.status{font-size:13px;color:#54746a}.bad{color:#9b3c2b}
    .heading{display:flex;justify-content:space-between;gap:28px;align-items:flex-end;padding:34px 0}.heading h1{font-family:Georgia,serif;font-size:58px;line-height:1;margin:0 0 8px;font-weight:500}.heading p,.panel-title p{margin:0;color:#766960}
    .filters{display:grid;grid-template-columns:repeat(2,minmax(210px,1fr));gap:12px;min-width:470px}.filters label{font-size:11px;text-transform:uppercase;color:#766960}.filters select{display:block;width:100%;margin-top:6px;padding:12px;border:1px solid #cfc6bd;background:#fff;border-radius:4px}.filters label:last-child{grid-column:1}
    .kpis{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid #d8d0c7;border-bottom:1px solid #d8d0c7;padding:24px 0;margin-bottom:24px}.kpi{padding:0 24px;border-right:1px solid #d8d0c7;min-width:0}.kpi:first-child{padding-left:0}.kpi:last-child{border:0}.kpi span{display:block;text-transform:uppercase;font-weight:700;font-size:12px;letter-spacing:.08em}.kpi strong{display:block;font-family:Georgia,serif;font-size:36px;font-weight:500;margin:10px 0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpi small{color:#796c63}.accent{color:#1f5949}.danger{color:#a33b2a}
    .visual-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,.65fr);gap:20px;margin-bottom:20px}.panel{background:#fff;border:1px solid #ded7cf;border-radius:6px;padding:22px}.panel-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}.panel h2{font-family:Georgia,serif;font-size:26px;font-weight:500;margin:0 0 5px}.legend{display:flex;align-items:center;gap:7px;font-size:12px;color:#6f6259}.legend i{width:20px;height:8px;display:inline-block}.budget{background:#dfd2c4}.actual{background:#1f5949}
    .month-chart{height:260px;display:flex;align-items:flex-end;gap:16px;padding:16px 12px 0;border-bottom:1px solid #aa9e94;background:repeating-linear-gradient(to top,transparent 0,transparent 63px,#e8e1da 64px)}.month-group{height:100%;flex:1;min-width:48px;display:grid;grid-template-rows:1fr 25px;cursor:pointer;padding:0 5px;border-bottom:3px solid transparent}.month-group:hover,.month-group.selected{background:#f7f4ef;border-bottom-color:#1f5949}.columns{display:flex;align-items:flex-end;justify-content:center;gap:5px;min-height:0}.columns i{display:block;width:min(34%,32px);min-height:2px;border-radius:2px 2px 0 0}.month-group>span{text-align:center;font-size:11px;padding-top:7px;color:#6f6259}
    .trend-list{display:grid;gap:17px;margin:28px 0}.trend-row{display:grid;grid-template-columns:28px 1fr 52px;align-items:center;gap:10px;font-size:11px}.trend-row>div{height:8px;background:#e9e2da}.trend-row i{height:100%;display:block;background:#5f8076}.trend-row strong{text-align:right}.utilization p{color:#71645b;font-size:13px;line-height:1.5}
    .table-panel{padding:0;margin-bottom:20px}.table-panel .panel-title{padding:20px 22px 0}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:13px 16px;border-top:1px solid #e2dbd4;text-align:right;white-space:nowrap}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#74675f;background:#faf8f5}th:first-child,td:first-child{text-align:left;white-space:normal;min-width:220px}.expense-table .budget-col{background:#f5efe8;border-left:1px solid #d1b99f;border-right:1px solid #d1b99f}.expense-table .actual-col{background:#edf5f2;border-right:1px solid #c7dcd5}.expense-table thead .budget-col{border-top:4px solid #c3a487}.expense-table thead .actual-col{border-top:4px solid #1f5949}.variance-positive{color:#0f5948;font-weight:700}.variance-negative{color:#a73325;font-weight:700}.pill{display:inline-block;padding:5px 8px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase}.within{background:#e5f0eb;color:#1f5949}.over{background:#f8e7e3;color:#9b3c2b}.missing{background:#eee9e4;color:#6e6259}.notice{padding:14px 16px;margin-bottom:20px;border:1px solid #dccca7;background:#fff8df;color:#725d2c}.notice.error{border-color:#e5b8ae;background:#fff0ed;color:#942f22}footer{padding:8px 0;color:#796d64;font-size:12px}
    .access{min-height:100vh;display:grid;place-items:center;padding:24px}.access-card{width:min(100%,500px);background:#fff;border:1px solid #ded7cf;border-radius:8px;padding:38px;box-shadow:0 16px 45px rgba(54,40,32,.08)}.access-card h1{font-family:Georgia,serif;font-size:42px;font-weight:500;margin:28px 0 10px}.access-card p{color:#766960;margin:0 0 25px}.access-card label{font-size:12px;font-weight:700}.access-card input{display:block;width:100%;height:44px;margin:8px 0 12px;padding:0 12px;border:1px solid #cfc6bd;border-radius:4px}.access-card button{width:100%;height:44px;border:0;border-radius:4px;background:#1f5949;color:#fff;cursor:pointer}.access-card button:disabled{opacity:.6}.form-error{min-height:20px;color:#9b3c2b;font-size:12px;margin-top:10px}
    @media(max-width:1100px){.heading{align-items:flex-start;flex-direction:column}.filters{min-width:0;width:100%}.kpis{grid-template-columns:repeat(3,1fr);row-gap:22px}.visual-grid{grid-template-columns:1fr}}@media(max-width:700px){.shell{padding:0 16px 28px}.heading h1{font-size:42px}.filters{grid-template-columns:1fr}.filters label:last-child{grid-column:auto}.kpis{grid-template-columns:1fr 1fr}.kpi{padding:0 12px}.month-chart{gap:5px;padding-left:0;padding-right:0;height:220px}}
  </style>
</head>
<body><div id="root"></div>
<script>
  const root=document.getElementById('root');
  const state={passcode:'',data:null,department:'',period:'',fy:''};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});
  const compact=v=>v===null||v===undefined?'—':'₹'+new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Number(v)/100000)+'L';
  const pct=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(1)+'%';
  const monthLabel=k=>new Date(k+'-01T00:00:00Z').toLocaleDateString('en-IN',{month:'short',year:'numeric',timeZone:'UTC'});
  function options(values,selected,map=v=>v){return values.map(v=>'<option value="'+esc(map(v))+'" '+(map(v)===selected?'selected':'')+'>'+esc(v.label||v)+'</option>').join('')}
  async function api(department='',period='',fy=''){
    const url=new URL(location.href);url.search='';url.searchParams.set('${API_PARAM}','get_dashboard');
    if(department)url.searchParams.set('department',department);if(period)url.searchParams.set('period',period);if(fy)url.searchParams.set('fiscal_year',fy);
    const response=await fetch(url,{headers:{Accept:'application/json','X-HO-Expenses-Dashboard-Passcode':state.passcode}});
    const text=await response.text();let payload;try{payload=JSON.parse(text)}catch{payload=null}
    if(!response.ok)throw new Error(payload?.error?.message||payload?.error||payload?.message||text||'Dashboard request failed.');return payload;
  }
  function access(error=''){
    root.innerHTML='<main class="access"><section class="access-card"><div class="brand">BEFOREST</div><h1>HO Expenses</h1><p>Enter the dashboard passcode to continue.</p><form id="access-form"><label>Passcode<input id="passcode" type="password" autocomplete="current-password" required autofocus></label><button id="submit">Open dashboard</button><div class="form-error">'+esc(error)+'</div></form></section></main>';
    document.getElementById('access-form').onsubmit=async e=>{e.preventDefault();const button=document.getElementById('submit');button.disabled=true;state.passcode=document.getElementById('passcode').value;try{state.data=await api();state.department=state.data.selectedDepartment;state.period=state.data.selectedPeriod;state.fy=state.data.selectedFiscalYear;render()}catch(err){access(err.message)} };
  }
  function kpi(label,value,note,klass=''){return '<article class="kpi"><span>'+esc(label)+'</span><strong class="'+klass+'">'+esc(value)+'</strong><small>'+esc(note)+'</small></article>'}
  function render(){
    const d=state.data,s=d.snapshot,m=s?.metrics,c=[...(s?.categories||[])].sort((a,b)=>b.actual-a.actual),h=d.history||[];
    if(!s){root.innerHTML='<main class="shell"><div class="notice">No snapshot is available.</div></main>';return}
    const max=Math.max(1,...h.flatMap(x=>[x.metrics?.actual||0,x.metrics?.budget||0]));
    const rows=c.map(x=>{const status=x.budget===null?(s.budgetStatus==='sync_pending'?'Budget sync pending':'No budget'):(x.actual>x.budget?'Over budget':'Within budget');const cls=status==='Over budget'?'over':status==='Within budget'?'within':'missing';const variance=x.variance===null&&x.actual>0?-x.actual:x.variance;const varianceClass=variance===null?'':variance<0?'variance-negative':'variance-positive';return '<tr><td>'+esc(x.name)+'</td><td class="budget-col">'+money.format(x.budget||0)+'</td><td class="actual-col">'+money.format(x.actual)+'</td><td class="'+varianceClass+'">'+(variance===null?'—':money.format(variance))+'</td><td>'+pct(x.utilization)+'</td><td>'+pct(x.share)+'</td><td><span class="pill '+cls+'">'+esc(status)+'</span></td></tr>'}).join('');
    const monthBars=h.map(x=>'<div class="month-group '+(x.periodKey===state.period?'selected':'')+'" data-period="'+esc(x.periodKey)+'"><div class="columns"><i class="budget" style="height:'+((x.metrics?.budget||0)/max*100)+'%"></i><i class="actual" style="height:'+((x.metrics?.actual||0)/max*100)+'%"></i></div><span>'+esc(monthLabel(x.periodKey).split(' ')[0])+'</span></div>').join('');
    const trend=h.map(x=>'<div class="trend-row"><span>'+esc(monthLabel(x.periodKey).split(' ')[0])+'</span><div><i style="width:'+Math.min(100,Math.max(0,(x.metrics?.utilization||0)*100))+'%"></i></div><strong>'+pct(x.metrics?.utilization)+'</strong></div>').join('');
    const monthRows=h.map(x=>'<tr data-period="'+esc(x.periodKey)+'"><td>'+esc(monthLabel(x.periodKey))+'</td><td>'+compact(x.metrics?.budget)+'</td><td>'+compact(x.metrics?.actual||0)+'</td><td>'+compact(x.metrics?.variance)+'</td><td>'+pct(x.metrics?.utilization)+'</td><td>'+(x.dataStatus==='no_data'?'No data present':'Available')+'</td></tr>').join('');
    const budgetText=m.budget===null?(s.budgetStatus==='sync_pending'?'Sync pending':'Not configured'):compact(m.budget);
    root.innerHTML='<main class="shell"><header class="topbar"><div class="brand">BEFOREST</div><div class="status">Updated '+esc(d.syncedAt?new Date(d.syncedAt).toLocaleString('en-IN'):'—')+'</div></header><section class="heading"><div><h1>HO Expenses</h1><p>'+esc(s.fiscalYear+' · '+s.period.from+' to '+s.period.to+' · Windmill Data Table snapshot')+'</p></div><div class="filters"><label>Department<select id="department">'+options(d.departments,state.department)+'</select></label><label>Financial Year<select id="fy">'+options(d.fiscalYears,state.fy)+'</select></label><label>Month<select id="period">'+options(d.months.map(x=>({label:monthLabel(x.key),key:x.key})),state.period,x=>x.key)+'</select></label></div></section>'+
      (d.dataStatus==='no_data'?'<div class="notice">No expense data is present for '+esc(state.department)+' in '+esc(monthLabel(state.period))+'.</div>':'')+
      '<section class="kpis">'+kpi('Actual Spend',compact(m.actual),'Department-filtered expenses')+kpi('Expense Budget',budgetText,m.budget===null?'Department-tagged budget missing':'Matched by account ID')+kpi('Budget Used',pct(m.utilization),'Actual ÷ budget','accent')+kpi('Under / (Over)',compact(m.variance),'Budget less actual',(m.variance||0)<0?'danger':'')+kpi('Active Categories',String(m.activeCategories),'Categories with actual spend')+'</section><section class="visual-grid"><article class="panel"><div class="panel-title"><div><h2>Monthly Budget vs Actual</h2><p>₹ lakh · '+esc(state.fy)+' through latest sync</p></div><div class="legend"><i class="budget"></i>Budget <i class="actual"></i>Actual</div></div><div class="month-chart">'+monthBars+'</div></article><article class="panel utilization"><h2>Budget Utilization Trend</h2><div class="trend-list">'+trend+'</div><p>'+(m.budget===null?'Budget not configured for the selected department and month.':(m.variance||0)<0?'Selected month is above the configured budget.':'Selected month remains within the configured budget.')+'</p></article></section><section class="panel table-panel"><div class="panel-title"><div><h2>Expense Categories</h2><p>FY-to-date Zoho account totals · matched using account_id</p></div></div><div class="table-wrap"><table class="expense-table"><thead><tr><th>Category</th><th class="budget-col">Budget</th><th class="actual-col">Actual</th><th>Under / (Over)</th><th>Used</th><th>Share</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></section><section class="panel table-panel"><div class="panel-title"><div><h2>Monthly Expense Details</h2><p>Department-filtered snapshots · ₹ lakh</p></div></div><div class="table-wrap"><table><thead><tr><th>Month</th><th>Budget</th><th>Actual</th><th>Under / (Over)</th><th>Utilization</th><th>Data</th></tr></thead><tbody>'+monthRows+'</tbody></table></div></section><footer>Source: Zoho Books read-only API · Accrual basis · Department filter tag_option_id2</footer></main>';
    document.getElementById('department').onchange=e=>reload(e.target.value,'',state.fy);document.getElementById('fy').onchange=e=>reload(state.department,'',e.target.value);document.getElementById('period').onchange=e=>reload(state.department,e.target.value,state.fy);document.querySelectorAll('[data-period]').forEach(el=>el.onclick=()=>reload(state.department,el.dataset.period,state.fy));
  }
  async function reload(department,period,fy){root.querySelector('.status').textContent='Loading snapshots';try{state.data=await api(department,period,fy);state.department=state.data.selectedDepartment;state.period=state.data.selectedPeriod;state.fy=state.data.selectedFiscalYear;render()}catch(err){root.querySelector('.status').textContent='Snapshot unavailable';root.querySelector('.status').classList.add('bad');alert(err.message)}}
  access();
</script></body></html>`;
}

export async function preprocessor(event: {
  kind: string;
  query?: Query;
  headers?: Record<string, string | string[] | undefined>;
}) {
  if (event.kind !== "http") return { query: {} };
  const query = { ...(event.query || {}) };
  const headers = event.headers || {};
  const header = headers["x-ho-expenses-dashboard-passcode"] || headers["X-HO-Expenses-Dashboard-Passcode"];
  query.dashboard_passcode = Array.isArray(header) ? header[0] : header || "";
  return { query };
}

export async function main(query: Query = {}) {
  if (first(query, API_PARAM) === "get_dashboard") {
    await requirePasscode(first(query, "dashboard_passcode"));
    return {
      windmill_content_type: "application/json; charset=utf-8",
      result: await getDashboard(first(query, "department"), first(query, "period"), first(query, "fiscal_year")),
    };
  }
  return { windmill_content_type: "text/html; charset=utf-8", result: html() };
}
