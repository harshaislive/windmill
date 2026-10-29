import React, { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { backend } from "./wmill"
import "./index.css"

type AnyRow = Record<string, any>

const tabs = ["Overview", "Content", "Growth", "Strategy", "Glossary"] as const
const DASHBOARD_PASSCODE = "Beforest@internal"

function fmt(value: unknown) {
  if (value === null || value === undefined || value === "") return "-"
  return new Intl.NumberFormat("en-IN").format(Number(value) || 0)
}

function compact(value: unknown) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0)
}

function pct(value: unknown) {
  const next = Number(value)
  if (!Number.isFinite(next)) return "-"
  return `${next.toFixed(2)}%`
}

function formatDateTime(value: unknown) {
  if (!value) return "-"
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date)
}

function signed(value: unknown, suffix = "") {
  const next = Number(value) || 0
  return `${next > 0 ? "+" : ""}${fmt(next)}${suffix}`
}

function MetricCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <article className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {meta ? <span>{meta}</span> : null}
      </div>
      {children}
    </article>
  )
}

function RankList({ rows, valueKey = "impressions", suffix = "" }: { rows: AnyRow[]; valueKey?: string; suffix?: string }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1)
  if (!rows.length) return <div className="rank-list"><article><strong>No data</strong><span>-</span><em style={{ "--w": "2%" } as React.CSSProperties} /></article></div>
  return (
    <div className="rank-list">
      {rows.slice(0, 8).map((row, index) => {
        const value = Number(row[valueKey] || 0)
        return (
          <article key={`${row.postId || row.label || index}-${valueKey}`}>
            <strong>{row.title || row.label || row.date || row.snapshotDate}</strong>
            <span>{fmt(value)}{suffix}</span>
            <em style={{ "--w": `${Math.max(2, (value / max) * 100)}%` } as React.CSSProperties} />
          </article>
        )
      })}
    </div>
  )
}

function App() {
  const [passcode, setPasscode] = useState("")
  const [passcodeError, setPasscodeError] = useState("")
  const [isUnlocked, setIsUnlocked] = useState(() => window.localStorage.getItem("beforest_linkedin_dashboard_unlocked") === "true")
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [snapshotDate, setSnapshotDate] = useState("")
  const [selectedPostId, setSelectedPostId] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const result = await backend.fetch_linkedin_dashboard({
        snapshot_date: snapshotDate,
        selected_post_id: selectedPostId,
      })
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isUnlocked) load()
  }, [isUnlocked, snapshotDate, selectedPostId])

  function unlockDashboard(event: FormEvent) {
    event.preventDefault()
    if (passcode.trim() === DASHBOARD_PASSCODE) {
      window.localStorage.setItem("beforest_linkedin_dashboard_unlocked", "true")
      setIsUnlocked(true)
      setPasscodeError("")
      return
    }
    setPasscodeError("That passcode is not matching.")
  }

  const topPostsByEngagement = useMemo(() => {
    return [...(data?.posts || [])].sort((a, b) => Number(b.engagements || 0) - Number(a.engagements || 0))
  }, [data])

  if (!isUnlocked) {
    return (
      <main className="shell">
        <section className="access-panel">
          <span className="domain">beforest linkedin</span>
          <h2>LinkedIn Dashboard</h2>
          <p>Enter the team passcode to open the LinkedIn growth, content, and strategy dashboard.</p>
          <form onSubmit={unlockDashboard}>
            <label htmlFor="dashboard-passcode">Passcode</label>
            <div className="access-input">
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
        </section>
      </main>
    )
  }

  if (loading) {
    return <main className="shell"><section className="status">Loading LinkedIn dashboard...</section></main>
  }

  if (error || !data?.ready) {
    return (
      <main className="shell">
        <header className="hero">
          <div>
            <span className="badge">LinkedIn Analytics</span>
            <h1>LinkedIn Dashboard</h1>
            <p>{error || data?.message || "No successful sync has run yet."}</p>
          </div>
          <button type="button" onClick={load}>Refresh</button>
        </header>
        <section className="status">Add `f/marketing/maton_api_key` and run `f/marketing/linkedin/sync_linkedin_metrics` once.</section>
      </main>
    )
  }

  const totals = data.totals || {}
  const growth = data.growth || {}
  const selectedPost = data.selectedPost

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="badge">LinkedIn Analytics</span>
          <h1>LinkedIn Growth Dashboard</h1>
          <p>Track page visibility, post impressions, reactions, engagement trends, follower growth, and company page performance from stored Windmill snapshots.</p>
        </div>
        <div className="hero-actions">
          <span>Last updated: {formatDateTime(data.generatedAt)}</span>
          <button type="button" onClick={load}>Refresh</button>
        </div>
      </header>

      <nav className="tabs" aria-label="Dashboard tabs">
        {tabs.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} type="button" onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>

      <section className="filter-bar" aria-label="Snapshot filter">
        <label>
          <span>Snapshot</span>
          <select value={snapshotDate} onChange={(event) => {
            setSnapshotDate(event.target.value)
            setSelectedPostId("")
          }}>
            <option value="">Latest Snapshot</option>
            {(data.availableSnapshots || []).map((snapshot: AnyRow) => (
              <option key={snapshot.snapshotDate} value={snapshot.snapshotDate}>
                {snapshot.snapshotDate}
              </option>
            ))}
          </select>
        </label>
      </section>

      {activeTab === "Overview" ? (
        <>
          <section className="cards">
            <MetricCard label="Followers" value={fmt(totals.followerCount)} note="Current company followers" tone="tone-blue" />
            <MetricCard label="Impressions" value={fmt(totals.impressions)} note="Organic post impressions" tone="tone-green" />
            <MetricCard label="Page Views" value={fmt(totals.pageViews)} note="Company page visibility" tone="tone-purple" />
            <MetricCard label="Engagement Rate" value={pct(totals.engagementRate)} note="Engagements / impressions" tone="tone-yellow" />
            <MetricCard label="Followers Gained" value={fmt(totals.followersGained)} note="Growth in window" tone="tone-red" />
          </section>

          <Panel title="Funnel" meta={`${data.startDate} to ${data.endDate}`}>
            <div className="funnel">
              {(data.funnel || []).map((step: AnyRow, index: number) => (
                <article className={`funnel-step step-${index + 1}`} key={step.label}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.label}</h3>
                  <strong>{fmt(step.value)}</strong>
                  <small>{step.rate === undefined ? step.note : `${pct(step.rate)} | ${step.note}`}</small>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Daily Impressions" meta={`${fmt(totals.impressions)} impressions`}>
            <div className="bar-chart">
              {(data.daily || []).map((row: AnyRow) => {
                const max = Math.max(...(data.daily || []).map((item: AnyRow) => Number(item.impressions || 0)), 1)
                return (
                  <div className="bar" key={row.date} style={{ height: `${Math.max(3, (Number(row.impressions || 0) / max) * 100)}%` }} title={`${row.date}: ${fmt(row.impressions)} impressions`}>
                    <span>{compact(row.impressions)}</span>
                  </div>
                )
              })}
            </div>
          </Panel>

          <section className="grid">
            <Panel title="Top Posts" meta="Impressions first"><RankList rows={data.posts || []} /></Panel>
            <Panel title="Engaged Posts" meta="Engagements first"><RankList rows={topPostsByEngagement} valueKey="engagements" /></Panel>
          </section>
        </>
      ) : null}

      {activeTab === "Content" ? (
        <>
          <Panel title="Post Inspector" meta="Snapshot-level post performance">
            <div className="select-row">
              <label>
                <span>Post</span>
                <select value={selectedPostId} onChange={(event) => setSelectedPostId(event.target.value)}>
                  <option value="">Top post</option>
                  {(data.posts || []).map((post: AnyRow) => (
                    <option key={post.postId} value={post.postId}>{post.title || post.postId}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedPost ? (
              <section className="cards compact-cards">
                <MetricCard label="Post Impressions" value={fmt(selectedPost.impressions)} note={selectedPost.title || selectedPost.postId} tone="tone-blue" />
                <MetricCard label="Clicks" value={fmt(selectedPost.clicks)} note="Post click count" tone="tone-green" />
                <MetricCard label="Engagements" value={fmt(selectedPost.engagements)} note="Clicks + reactions + comments + shares" tone="tone-yellow" />
                <MetricCard label="Engagement Rate" value={pct(selectedPost.engagementRate)} note="Post engagement quality" tone="tone-purple" />
              </section>
            ) : null}
            <RankList rows={data.selectedPostSnapshots || []} valueKey="impressions" />
          </Panel>
          <Panel title="Posts" meta="All stored posts">
            <div className="table-list">
              {(data.posts || []).map((post: AnyRow, index: number) => (
                <a className="post-row" href={post.url} target="_blank" rel="noreferrer" key={post.postId}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{post.title || post.postId}</strong>
                  <em>{fmt(post.impressions)} impressions</em>
                  <small>{fmt(post.likes)} likes | {fmt(post.comments)} comments | {fmt(post.shares)} shares | {fmt(post.engagements)} engagements</small>
                </a>
              ))}
            </div>
          </Panel>
        </>
      ) : null}

      {activeTab === "Growth" ? (
        <>
          <Panel title="Snapshot Growth" meta={`${fmt(growth.snapshotsCount)} stored snapshots`}>
            <section className="growth-grid">
              <article>
                <span>Impressions Growth</span>
                <strong>{growth.latestDelta ? signed(growth.latestDelta.impressions) : "-"}</strong>
                <small>{growth.latestDelta ? `${pct(growth.latestDelta.impressionsPercent)} vs previous snapshot` : "Need at least 2 snapshots"}</small>
              </article>
              <article>
                <span>Page Views Growth</span>
                <strong>{growth.latestDelta ? signed(growth.latestDelta.pageViews) : "-"}</strong>
                <small>Latest snapshot vs previous snapshot</small>
              </article>
              <article>
                <span>Engagement Growth</span>
                <strong>{growth.latestDelta ? signed(growth.latestDelta.engagements) : "-"}</strong>
                <small>Clicks + reactions + comments + shares</small>
              </article>
              <article>
                <span>Followers Growth</span>
                <strong>{growth.latestDelta ? signed(growth.latestDelta.followersGained) : "-"}</strong>
                <small>Followers gained delta</small>
              </article>
            </section>
          </Panel>
          <Panel title="Stored Snapshot Trend" meta="Latest first">
            <RankList rows={(growth.trend || []).slice().reverse()} valueKey="impressions" />
          </Panel>
        </>
      ) : null}

      {activeTab === "Strategy" ? (
        <Panel title="Strategy" meta="What to improve first">
          <div className="insight-list">
            <article><strong>Reach</strong><span>{fmt(totals.impressions)} impressions in the latest stored 30-day window.</span></article>
            <article><strong>Engagement depth</strong><span>{pct(totals.engagementRate)} engagement rate from clicks, reactions, comments, and shares.</span></article>
            <article><strong>Page visibility</strong><span>{fmt(totals.pageViews)} page views and {fmt(totals.uniqueVisitors)} unique visitors.</span></article>
            <article><strong>Growth</strong><span>{fmt(totals.followersGained)} followers gained in the selected snapshot window.</span></article>
            <article><strong>Content focus</strong><span>{topPostsByEngagement[0]?.title || "No post engagement data yet"} is currently the strongest engagement candidate.</span></article>
          </div>
        </Panel>
      ) : null}

      {activeTab === "Glossary" ? (
        <Panel title="Glossary" meta="Metric definitions">
          <div className="glossary">
            <article><strong>Snapshot</strong><span>A stored 30-day LinkedIn metrics pull. The dashboard reads this stored data only.</span></article>
            <article><strong>Impressions</strong><span>How often LinkedIn posts were displayed during the snapshot window.</span></article>
            <article><strong>Page Views</strong><span>Company page/profile visibility from LinkedIn organization page statistics.</span></article>
            <article><strong>Engagements</strong><span>Clicks, reactions, comments, and shares added together.</span></article>
            <article><strong>Engagement Rate</strong><span>Engagements divided by impressions.</span></article>
            <article><strong>Followers Gained</strong><span>Organic plus paid follower growth reported for the selected 30-day window.</span></article>
          </div>
        </Panel>
      ) : null}
    </main>
  )
}

export default App
