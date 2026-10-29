import React, { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { backend } from "./wmill";
import "./index.css";

type AnyRow = Record<string, any>;

function fmt(value: unknown, max = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: max }).format(next);
}

function compact(value: unknown) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function liters(value: unknown) {
  return `${compact(value)} L`;
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function MetricCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Panel({ title, meta, children, className = "" }: { title: string; meta?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {meta ? <p>{meta}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function RankList({ rows, valueKey = "value", formatter = liters }: { rows: AnyRow[]; valueKey?: string; formatter?: (value: unknown) => string }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  if (!rows.length) return <div className="empty">No records for the selected filters.</div>;
  return (
    <div className="rank-list">
      {rows.slice(0, 8).map((row) => {
        const value = Number(row[valueKey] || 0);
        return (
          <article key={`${row.key}-${row.label}`}>
            <strong>{row.label || row.key}</strong>
            <span>{formatter(value)}</span>
            <em style={{ "--w": `${Math.max(2, (value / max) * 100)}%` } as React.CSSProperties} />
          </article>
        );
      })}
    </div>
  );
}

function Bars({ rows, keys, colors }: { rows: AnyRow[]; keys: string[]; colors: string[] }) {
  const max = Math.max(...rows.flatMap((row) => keys.map((key) => Math.abs(Number(row[key] || 0)))), 1);
  if (!rows.length) return <div className="empty">No trend records for the selected filters.</div>;
  return (
    <div className="bar-chart">
      {rows.slice(-14).map((row) => (
        <article key={row.key}>
          <div className="bar-stack">
            {keys.map((key, index) => (
              <i key={key} style={{ height: `${Math.max(2, (Math.abs(Number(row[key] || 0)) / max) * 100)}%`, background: colors[index] }} />
            ))}
          </div>
          <span>{row.label}</span>
        </article>
      ))}
    </div>
  );
}

function App() {
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [source, setSource] = useState("All");
  const [purpose, setPurpose] = useState("All");
  const [recordType, setRecordType] = useState("All");
  const [trendMode, setTrendMode] = useState("monthly");

  async function load(candidatePasscode = passcode, unlocking = false) {
    if (!candidatePasscode.trim()) {
      setPasscodeError("Enter the dashboard passcode.");
      return;
    }
    setLoading(true);
    setError("");
    setPasscodeError("");
    try {
      const result = await backend.fetch_water_dashboard({
        date_from: dateFrom,
        date_to: dateTo,
        source,
        purpose,
        record_type: recordType,
        trend_mode: trendMode,
        dashboard_passcode: candidatePasscode,
      });
      if (unlocking) setIsUnlocked(true);
      setData(result);
      if (result?.ready && !dateFrom && !dateTo) {
        setDateFrom(result.dateRange?.availableFrom || "");
        setDateTo(result.dateRange?.availableTo || "");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.toLowerCase().includes("invalid dashboard passcode")) {
        setIsUnlocked(false);
        setPasscodeError("That passcode is not correct.");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isUnlocked) load();
  }, [isUnlocked, source, purpose, recordType, trendMode]);

  function unlockDashboard(event: FormEvent) {
    event.preventDefault();
    load(passcode, true);
  }

  const totals = data?.totals || {};
  const filters = data?.filters || {};
  const qualityRows = useMemo(() => {
    const q = data?.quality || {};
    return [
      ["Filtered records", `${fmt(q.filteredRecords)} / ${fmt(q.totalRecords)}`],
      ["Missing runtime", fmt(q.missingRuntime)],
      ["Missing zone/block", fmt(q.missingZoneBlock)],
      ["Duplicate intervals", fmt(q.duplicateIntervals)],
      ["Water files", q.waterFiles || "-"],
      ["Rainfall file", q.rainfallFile || "-"],
    ];
  }, [data]);

  function resetFilters() {
    setDateFrom(data?.dateRange?.availableFrom || "");
    setDateTo(data?.dateRange?.availableTo || "");
    setSource("All");
    setPurpose("All");
    setRecordType("All");
    setTrendMode("monthly");
    setTimeout(load, 0);
  }

  if (!isUnlocked) {
    return (
      <div className="gate-shell">
        <form className="passcode-card" onSubmit={unlockDashboard}>
          <span className="eyebrow">Bodakonda Water & Crops</span>
          <h1>Bodakonda Water Monitoring</h1>
          <p>Enter the team passcode to open the water, pond, rainfall, and crop-zone dashboard.</p>
          <label htmlFor="dashboard-passcode">Passcode</label>
          <div className="passcode-row">
            <input
              id="dashboard-passcode"
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
            <button type="submit">Open</button>
          </div>
          {passcodeError ? <small>{passcodeError}</small> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <span className="eyebrow">Bodakonda Water & Crops</span>
          <h1>Bodakonda Water Monitoring</h1>
          <p>Groundwater extraction, usage, pond movement, rainfall, and data readiness from the current team CSV snapshot.</p>
        </div>
        <div className="status">
          <strong>{loading ? "Refreshing" : "Live from datatables"}</strong>
          <span>Last import: {formatDateTime(data?.generatedAt)}</span>
        </div>
      </header>

      {error ? <div className="notice error">{error}</div> : null}
      {data && !data.ready ? <div className="notice">{data.message}</div> : null}

      <section className="filters" aria-label="Dashboard filters">
        <label>
          <span>From</span>
          <input type="date" value={dateFrom} min={data?.dateRange?.availableFrom || ""} max={data?.dateRange?.availableTo || ""} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={dateTo} min={data?.dateRange?.availableFrom || ""} max={data?.dateRange?.availableTo || ""} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label>
          <span>Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {(filters.sources || ["All"]).map((option: string) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span>Purpose</span>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {(filters.purposes || ["All"]).map((option: string) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span>Record Type</span>
          <select value={recordType} onChange={(e) => setRecordType(e.target.value)}>
            {(filters.recordTypes || ["All"]).map((option: string) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <button type="button" onClick={load}>Refresh</button>
        <button type="button" className="secondary" onClick={resetFilters}>Reset</button>
      </section>

      <section className="metrics">
        <MetricCard label="Groundwater Extracted" value={liters(totals.groundwater)} note={`${fmt(totals.sourceRecords)} source records`} tone="blue" />
        <MetricCard label="Water Consumed" value={liters(totals.consumed)} note={`${fmt(totals.filteredRecords)} filtered records`} tone="green" />
        <MetricCard label="Pond Balance" value={liters(totals.pondBalance)} note={`${liters(totals.pondIn)} in / ${liters(totals.pondOut)} out`} tone="yellow" />
        <MetricCard label="Rainfall" value={`${fmt(totals.totalRainfall, 1)} mm`} note={`${fmt(totals.rainyDays)} rainy-day records`} tone="purple" />
        <MetricCard label="Runtime Hours" value={fmt(totals.runtime, 1)} note={`Average ${compact(totals.averageLitresPerHour)} L/hr`} tone="plain" />
      </section>

      <main className="grid">
        <Panel title="Monthly Trend" meta="Groundwater extraction and end-use consumption over time." className="wide">
          <div className="mode-row">
            <button className={trendMode === "monthly" ? "active" : ""} onClick={() => setTrendMode("monthly")}>Monthly</button>
            <button className={trendMode === "daily" ? "active" : ""} onClick={() => setTrendMode("daily")}>Daily</button>
          </div>
          <Bars rows={data?.trend || []} keys={["extracted", "consumed"]} colors={["#74a9d8", "#6fa36d"]} />
          <div className="legend"><span className="swatch blue" /> Extracted <span className="swatch green" /> Consumed</div>
        </Panel>

        <Panel title="Usage Mix" meta="Consumption by purpose.">
          <RankList rows={data?.usageMix || []} />
        </Panel>

        <Panel title="Source Extraction" meta="Groundwater extracted by source.">
          <RankList rows={data?.sourceExtraction || []} />
        </Panel>

        <Panel title="Pond Movement" meta="Inflow, outflow, and net movement.">
          <div className="pond-summary">
            <strong>Inflow {liters(totals.pondIn)}</strong>
            <strong>Outflow {liters(totals.pondOut)}</strong>
            <strong>Net {liters(totals.pondBalance)}</strong>
          </div>
          <Bars rows={data?.pondMovement || []} keys={["inflow", "outflow"]} colors={["#8dcf96", "#74a9d8"]} />
        </Panel>

        <Panel title="Rainfall" meta="Rainfall events and cumulative rainfall.">
          <div className="rain-total">
            <strong>{fmt(totals.totalRainfall, 1)} mm</strong>
            <span>Peak: {formatDate(totals.peakRainfallDay)} ({fmt(totals.peakRainfallMm, 1)} mm)</span>
          </div>
          <RankList rows={data?.rainfallEvents || []} formatter={(value) => `${fmt(value, 1)} mm`} />
        </Panel>

        <Panel title="Official IMD Rainfall" meta="Reference graphic from IMD Hyderabad.">
          <a className="source-link" href={data?.imdRainfall?.url || "https://mausam.imd.gov.in/hyderabad/mcdata/ghmc_hyd.gif"} target="_blank" rel="noreferrer">Open source</a>
          <div className="imd-frame">
            {data?.imdRainfall?.dataUrl ? (
              <img src={data.imdRainfall.dataUrl} alt="Official IMD Hyderabad GHMC rainfall graphic" />
            ) : (
              <div className="empty">IMD rainfall graphic could not be embedded. Use Open source to view it.</div>
            )}
          </div>
        </Panel>

        <Panel title="Data Health" meta="Import readiness checks for the live pipeline.">
          <div className="quality-list">
            {qualityRows.map(([label, value]) => (
              <article key={label}><span>{label}</span><strong>{value}</strong></article>
            ))}
          </div>
        </Panel>

        <Panel title="Top Zones & Crops" meta="Largest consuming areas after filters are applied." className="wide">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zone / Block</th>
                  <th>Crop</th>
                  <th>Purpose</th>
                  <th>Records</th>
                  <th>Consumed</th>
                  <th>Extracted</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topZonesCrops || []).map((row: AnyRow) => (
                  <tr key={`${row.zone}-${row.crop}-${row.purpose}`}>
                    <td>{row.zone}</td>
                    <td>{row.crop}</td>
                    <td>{row.purpose}</td>
                    <td>{fmt(row.records)}</td>
                    <td>{liters(row.consumed)}</td>
                    <td>{liters(row.extracted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>
    </div>
  );
}

export default App;
