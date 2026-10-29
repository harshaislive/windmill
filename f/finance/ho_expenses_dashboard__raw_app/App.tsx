import React, { useEffect, useMemo, useState } from "react";
import { backend } from "./wmill";
import "./index.css";
import "./dashboard.css";

type Category = { account_id: string; name: string; budget: number | null; actual: number; variance: number | null; utilization: number | null; share: number };
type Snapshot = {
  department: string; fiscalYear: string;
  period: { key: string; from: string; to: string; label: string };
  metrics: { actual: number; budget: number | null; variance: number | null; utilization: number | null; activeCategories: number };
  categories: Category[]; budgetStatus: string; source: { refreshedAt: string };
};
type HistoryItem = {
  periodKey: string;
  period: { label?: string } | null;
  metrics: Snapshot["metrics"] | null;
  dataStatus: string;
};

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const compact = (value: number | null) => value === null ? "—" : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value / 100000)}L`;
const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

function App() {
  const [department, setDepartment] = useState("");
  const [period, setPeriod] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextDepartment = department, nextPeriod = period, nextFinancialYear = financialYear) {
    setLoading(true); setError("");
    try {
      const result = await backend.get_dashboard({ department: nextDepartment, period: nextPeriod, fiscal_year: nextFinancialYear });
      setData(result); setDepartment(result.selectedDepartment || nextDepartment); setPeriod(result.selectedPeriod || nextPeriod); setFinancialYear(result.selectedFiscalYear || nextFinancialYear);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load("", ""); }, []);
  const snapshot = data?.snapshot as Snapshot | null;
  const metrics = snapshot?.metrics;
  const categories = useMemo(() => [...(snapshot?.categories || [])].sort((a, b) => b.actual - a.actual), [snapshot]);
  const history = (data?.history || []) as HistoryItem[];
  const monthlyMaximum = Math.max(1, ...history.flatMap((item) => [item.metrics?.actual || 0, item.metrics?.budget || 0]));

  return <main className="page-shell">
    <header className="topbar"><div className="brand">BEFOREST</div><div className={`status ${error ? "bad" : ""}`}>{loading ? "Loading snapshots" : error ? "Snapshot unavailable" : `Updated ${data?.syncedAt ? new Date(data.syncedAt).toLocaleString("en-IN") : "—"}`}</div></header>
    <section className="heading">
      <div><h1>HO Expenses</h1><p>{snapshot ? `${snapshot.fiscalYear} · ${snapshot.period.from} to ${snapshot.period.to} · Windmill Data Table snapshot` : "Department expense overview"}</p></div>
      <div className="filters">
        <label>Department<select value={department} onChange={(event) => { const value = event.target.value; setDepartment(value); load(value, "", financialYear); }}>{(data?.departments || []).map((item: string) => <option key={item}>{item}</option>)}</select></label>
        <label>Financial Year<select value={financialYear} onChange={(event) => { const value = event.target.value; setFinancialYear(value); load(department, "", value); }}>{(data?.fiscalYears || []).map((item: string) => <option key={item}>{item}</option>)}</select></label>
        <label>Month<select value={period} onChange={(event) => { const value = event.target.value; setPeriod(value); load(department, value, financialYear); }}>{(data?.months || []).map((item: any) => <option key={item.key} value={item.key}>{monthLabel(item.key)}</option>)}</select></label>
      </div>
    </section>
    {error && <div className="notice error">Could not load the HO Expenses snapshot. {error}</div>}
    {!loading && !error && !snapshot && <div className="notice">No data present for this department and month.</div>}
    {snapshot && <>
      {data.dataStatus === "no_data" && <div className="notice">No expense data is present for {department} in {monthLabel(period)}.</div>}
      <section className="kpis">
        <Kpi label="Actual Spend" value={compact(metrics!.actual)} note="Department-filtered expenses" />
        <Kpi label="Expense Budget" value={metrics!.budget === null ? snapshot.budgetStatus === "sync_pending" ? "Sync pending" : "Not configured" : compact(metrics!.budget)} note={metrics!.budget === null ? snapshot.budgetStatus === "sync_pending" ? "Zoho budget reconciliation incomplete" : "Department-tagged budget missing" : "Matched by account ID"} />
        <Kpi label="Budget Used" value={pct(metrics!.utilization)} note={metrics!.utilization === null ? "Unavailable without budget" : "Actual ÷ budget"} accent />
        <Kpi label="Under / (Over)" value={compact(metrics!.variance)} note="Budget less actual" danger={(metrics!.variance || 0) < 0} />
        <Kpi label="Active Categories" value={String(metrics!.activeCategories)} note="Categories with actual spend" />
      </section>
      <section className="visual-grid">
        <article className="panel chart-panel"><div className="panel-title"><div><h2>Monthly Budget vs Actual</h2><p>₹ lakh · FY 2026–27 through latest sync</p></div><div className="legend"><span className="budget-dot"/>Budget <span className="actual-dot"/>Actual</div></div>
          <div className="month-chart">{history.map((item) => {
            const budgetHeight = ((item.metrics?.budget || 0) / monthlyMaximum) * 100;
            const actualHeight = ((item.metrics?.actual || 0) / monthlyMaximum) * 100;
            return <div className={`month-group ${item.periodKey === period ? "selected" : ""}`} key={item.periodKey} onClick={() => { setPeriod(item.periodKey); load(department, item.periodKey); }} title={`${monthLabel(item.periodKey)} · Budget ${compact(item.metrics?.budget ?? null)} · Actual ${compact(item.metrics?.actual || 0)}`}><div className="month-columns"><i className="month-budget" style={{ height: `${budgetHeight}%` }}/><i className="month-actual" style={{ height: `${actualHeight}%` }}/></div><span>{monthLabel(item.periodKey).split(" ")[0]}</span></div>;
          })}</div>
        </article>
        <article className="panel utilization"><h2>Budget Utilization Trend</h2><div className="trend-list">{history.map((item) => <div className="trend-row" key={item.periodKey}><span>{monthLabel(item.periodKey).split(" ")[0]}</span><div><i style={{ width: `${Math.min(100, Math.max(0, (item.metrics?.utilization || 0) * 100))}%` }}/></div><strong>{pct(item.metrics?.utilization ?? null)}</strong></div>)}</div><p>{metrics!.budget === null ? snapshot.budgetStatus === "sync_pending" ? "Budget reconciliation is pending after Zoho rate limiting." : "Budget not configured for the selected department and month." : (metrics!.variance || 0) < 0 ? "Selected month is above the configured budget." : "Selected month remains within the configured budget."}</p></article>
      </section>
      <section className="panel table-panel"><div className="panel-title"><div><h2>Expense Categories</h2><p>FY-to-date Zoho account totals · matched using account_id</p></div></div>
        <div className="table-wrap"><table className="expense-table"><thead><tr><th>Category</th><th className="budget-col">Budget</th><th className="actual-col">Actual</th><th>Under / (Over)</th><th>Used</th><th>Share</th><th>Status</th></tr></thead><tbody>{categories.map((item) => {
          const status = item.budget === null ? snapshot.budgetStatus === "sync_pending" ? "Budget sync pending" : "No budget" : item.actual > item.budget ? "Over budget" : "Within budget";
          const displayedVariance = item.variance === null && item.actual > 0 ? -item.actual : item.variance;
          const varianceClass = displayedVariance === null ? "" : displayedVariance < 0 ? "variance-negative" : "variance-positive";
          return <tr key={item.account_id}><td>{item.name}</td><td className="budget-col">{money.format(item.budget || 0)}</td><td className="actual-col">{money.format(item.actual)}</td><td className={varianceClass}>{displayedVariance === null ? "—" : money.format(displayedVariance)}</td><td>{pct(item.utilization)}</td><td>{pct(item.share)}</td><td><span className={`pill ${status === "Over budget" ? "over" : status === "Within budget" ? "within" : "missing"}`}>{status}</span></td></tr>;
        })}</tbody></table></div>
      </section>
      <section className="panel table-panel monthly-table"><div className="panel-title"><div><h2>Monthly Expense Details</h2><p>Department-filtered snapshots · ₹ lakh</p></div></div><div className="table-wrap"><table><thead><tr><th>Month</th><th>Budget</th><th>Actual</th><th>Under / (Over)</th><th>Utilization</th><th>Data</th></tr></thead><tbody>{history.map((item) => <tr key={item.periodKey} className={item.periodKey === period ? "active-row" : ""} onClick={() => { setPeriod(item.periodKey); load(department, item.periodKey); }}><td>{monthLabel(item.periodKey)}</td><td>{compact(item.metrics?.budget ?? null)}</td><td>{compact(item.metrics?.actual || 0)}</td><td>{compact(item.metrics?.variance ?? null)}</td><td>{pct(item.metrics?.utilization ?? null)}</td><td>{item.dataStatus === "no_data" ? "No data present" : "Available"}</td></tr>)}</tbody></table></div></section>
      <footer>Source: Zoho Books read-only API · Accrual basis · Department filter tag_option_id2</footer>
    </>}
  </main>;
}

function Kpi({ label, value, note, accent = false, danger = false }: { label: string; value: string; note: string; accent?: boolean; danger?: boolean }) {
  return <article className="kpi"><span>{label}</span><strong className={accent ? "accent" : danger ? "danger" : ""}>{value}</strong><small>{note}</small></article>;
}

export default App;
