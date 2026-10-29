import React, { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { backend } from "./wmill"
import "./index.css"

type AnyRow = Record<string, any>

const tabs = ["Overview", "Videos", "Strategy", "Quality", "Glossary"] as const
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

function RankList({ rows, valueKey = "views", suffix = "" }: { rows: AnyRow[]; valueKey?: string; suffix?: string }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1)
  if (!rows.length) return <div className="rank-list"><article><strong>No data</strong><span>-</span><em style={{ "--w": "2%" } as React.CSSProperties} /></article></div>
  return (
    <div className="rank-list">
      {rows.slice(0, 6).map((row) => {
        const value = Number(row[valueKey] || 0)
        return (
          <article key={`${row.key || row.label}-${valueKey}`}>
            <strong>{row.label}</strong>
            <span>{fmt(value)}{suffix}</span>
            <em style={{ "--w": `${Math.max(2, (value / max) * 100)}%` } as React.CSSProperties} />
          </article>
        )
      })}
    </div>
  )
}

function DetailList({
  rows,
  valueKey = "views",
  main,
  detail,
}: {
  rows: AnyRow[]
  valueKey?: string
  main: (row: AnyRow) => string
  detail: (row: AnyRow) => string
}) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1)
  if (!rows.length) return <div className="detail-list"><article><strong>No data</strong><span>-</span><small>-</small><em style={{ "--w": "2%" } as React.CSSProperties} /></article></div>
  return (
    <div className="detail-list">
      {rows.slice(0, 8).map((row, index) => {
        const value = Number(row[valueKey] || 0)
        return (
          <article key={`${main(row)}-${index}`}>
            <strong>{String(index + 1).padStart(2, "0")} {main(row)}</strong>
            <span>{fmt(value)}</span>
            <small>{detail(row)}</small>
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
  const [isUnlocked, setIsUnlocked] = useState(() => window.localStorage.getItem("beforest_youtube_dashboard_unlocked") === "true")
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [snapshotDate, setSnapshotDate] = useState("")
  const [selectedVideoId, setSelectedVideoId] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const result = await backend.fetch_youtube_dashboard({
        snapshot_date: snapshotDate,
        selected_video_id: selectedVideoId,
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
  }, [isUnlocked, snapshotDate, selectedVideoId])

  function unlockDashboard(event: FormEvent) {
    event.preventDefault()
    if (passcode.trim() === DASHBOARD_PASSCODE) {
      window.localStorage.setItem("beforest_youtube_dashboard_unlocked", "true")
      setIsUnlocked(true)
      setPasscodeError("")
      return
    }
    setPasscodeError("That passcode is not matching.")
  }

  const sortedQualityVideos = useMemo(() => {
    return [...(data?.topVideos || [])].sort((a, b) => Number(b.qualityScore || 0) - Number(a.qualityScore || 0))
  }, [data])

  const audienceRows = useMemo(() => {
    return (data?.reporting?.audience || []).map((row: AnyRow) => ({
      ...row,
      label: row.type === "age_group" ? `Age ${row.label}` : row.label,
    }))
  }, [data])

  if (!isUnlocked) {
    return (
      <main className="shell">
        <section className="access-panel">
          <span className="domain">beforest youtube</span>
          <h2>YouTube Dashboard</h2>
          <p>Enter the team passcode to open the YouTube funnel, video quality, and audience dashboard.</p>
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
    return <main className="shell"><section className="status">Loading YouTube dashboard...</section></main>
  }

  if (error || !data?.ready) {
    return (
      <main className="shell">
        <header className="hero">
          <div>
            <span className="badge">YouTube Analytics</span>
            <h1>YouTube Dashboard</h1>
            <p>{error || data?.message || "No successful sync has run yet."}</p>
          </div>
          <button type="button" onClick={load}>Refresh</button>
        </header>
        <section className="status">Add `f/marketing/youtube_maton_api_key` or `f/marketing/maton_api_key`, then run the sync once.</section>
      </main>
    )
  }

  const totals = data.totals || {}
  const reporting = data.reporting || {}
  const growth = data.growth || {}
  const selectedVideo = data.selectedVideo

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="badge">YouTube Analytics</span>
          <h1>YouTube Funnel Dashboard</h1>
          <p>Track channel views, watch time, engagement, subscriber conversion, traffic quality, audience, devices, geography, and video quality.</p>
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

      <section className="filter-bar" aria-label="Date filters">
        <label>
          <span>Snapshot</span>
          <select value={snapshotDate} onChange={(event) => {
            setSnapshotDate(event.target.value)
            setSelectedVideoId("")
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

      <section className="status">
        Snapshot: {data.snapshotDate}. Showing the latest 30-day YouTube metrics for {data.startDate} to {data.endDate}. Source: {data.source}.
      </section>

      {activeTab === "Overview" ? (
        <>
          <section className="cards">
            <MetricCard label="Views" value={fmt(totals.views)} note="Channel views" tone="tone-blue" />
            <MetricCard label="Watch Time" value={`${fmt(data.display?.watchHours)}h`} note="Hours watched" tone="tone-green" />
            <MetricCard label="Avg View Duration" value={data.display?.averageViewDuration || "-"} note="Weighted by views" tone="tone-purple" />
            <MetricCard label="Subscribers" value={fmt(totals.subscribersGained)} note="Gained in window" tone="tone-yellow" />
            <MetricCard label="Engagement Rate" value={pct(totals.engagementRate)} note="Likes + comments + shares" tone="tone-red" />
          </section>

          <Panel title="Snapshot Growth" meta={`${fmt(growth.snapshotsCount)} stored snapshots`}>
            <section className="growth-grid">
              <article>
                <span>Views Growth</span>
                <strong>{growth.latestDelta ? signed(growth.latestDelta.views) : "-"}</strong>
                <small>{growth.latestDelta ? `${pct(growth.latestDelta.viewsPercent)} vs previous snapshot` : "Need at least 2 snapshots"}</small>
              </article>
              <article>
                <span>Watch Hours Growth</span>
                <strong>{growth.latestDelta ? signed(growth.latestDelta.watchHours, "h") : "-"}</strong>
                <small>{growth.latestDelta ? `${pct(growth.latestDelta.watchHoursPercent)} vs previous snapshot` : "Need at least 2 snapshots"}</small>
              </article>
              <article>
                <span>Average Views / Snapshot</span>
                <strong>{signed(growth.averageDelta?.views)}</strong>
                <small>Average change across stored snapshots</small>
              </article>
              <article>
                <span>Average Engagements / Snapshot</span>
                <strong>{signed(growth.averageDelta?.engagements)}</strong>
                <small>Average change across stored snapshots</small>
              </article>
            </section>
          </Panel>

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

          <Panel title="Daily Views" meta={`${fmt(totals.views)} views`}>
            <div className="bar-chart">
              {(data.daily || []).map((row: AnyRow) => {
                const max = Math.max(...(data.daily || []).map((item: AnyRow) => Number(item.views || 0)), 1)
                return (
                  <div className="bar" key={row.date} style={{ height: `${Math.max(3, (Number(row.views || 0) / max) * 100)}%` }} title={`${row.date}: ${fmt(row.views)} views`}>
                    <span>{compact(row.views)}</span>
                  </div>
                )
              })}
            </div>
          </Panel>

          <section className="grid three">
            <Panel title="Traffic Sources" meta="Discovery"><RankList rows={reporting.trafficSources || []} /></Panel>
            <Panel title="Audience" meta="Age / Gender"><RankList rows={audienceRows} valueKey="viewerPercentage" suffix="%" /></Panel>
            <Panel title="Devices" meta="Viewing device"><RankList rows={reporting.devices || []} /></Panel>
          </section>

          <Panel title="Geography" meta="Country level">
            <DetailList rows={reporting.countries || []} main={(row) => row.label} detail={(row) => `${fmt(row.views)} views | ${fmt(row.estimatedMinutesWatched)} mins watched | ${row.averageViewDuration}s avg duration`} />
          </Panel>

          <section className="grid">
            <Panel title="Top Videos" meta="Views first">
              <div className="select-row">
                <label>
                  <span>Video</span>
                  <select value={selectedVideoId} onChange={(event) => setSelectedVideoId(event.target.value)}>
                    <option value="">Top video</option>
                    {(data.topVideos || []).map((video: AnyRow) => (
                      <option key={video.videoId} value={video.videoId}>{video.title || video.videoId}</option>
                    ))}
                  </select>
                </label>
              </div>
              {selectedVideo ? (
                <div className="video-spotlight">
                  <strong>{selectedVideo.title || selectedVideo.videoId}</strong>
                  <span>{fmt(selectedVideo.views)} views | {fmt(selectedVideo.watchTimeMinutes)} mins watched | score {fmt(selectedVideo.qualityScore)}</span>
                </div>
              ) : null}
              <div className="table-list">
                {(data.topVideos || []).slice(0, 5).map((video: AnyRow, index: number) => (
                  <a className="video-row" href={video.url} target="_blank" rel="noreferrer" key={video.videoId}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{video.title || video.videoId}</strong>
                    <em>{fmt(video.views)} views</em>
                    <small>{video.videoId} | score {fmt(video.qualityScore)} | {fmt(video.watchTimeMinutes)} mins watched | {fmt(video.engagements)} engagements</small>
                  </a>
                ))}
              </div>
            </Panel>
            <Panel title="Subscriber Split" meta="Viewer status"><RankList rows={reporting.subscribedStatus || []} /></Panel>
          </section>
        </>
      ) : null}

      {activeTab === "Videos" ? (
        <>
          <Panel title="Video Inspector" meta="Snapshot-level video metrics">
            <div className="select-row">
              <label>
                <span>Video</span>
                <select value={selectedVideoId} onChange={(event) => setSelectedVideoId(event.target.value)}>
                  <option value="">Top video</option>
                  {(data.topVideos || []).map((video: AnyRow) => (
                    <option key={video.videoId} value={video.videoId}>{video.title || video.videoId}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedVideo ? (
              <section className="cards compact-cards">
                <MetricCard label="Video Views" value={fmt(selectedVideo.views)} note={selectedVideo.title || selectedVideo.videoId} tone="tone-blue" />
                <MetricCard label="Watch Time" value={`${fmt(selectedVideo.watchTimeMinutes)}m`} note="Minutes watched" tone="tone-green" />
                <MetricCard label="Engagements" value={fmt(selectedVideo.engagements)} note="Likes + comments + shares" tone="tone-yellow" />
                <MetricCard label="Quality Score" value={fmt(selectedVideo.qualityScore)} note="Balanced ranking" tone="tone-purple" />
              </section>
            ) : null}
            <DetailList rows={data.selectedVideoSnapshots || []} valueKey="views" main={(row) => row.snapshotDate} detail={(row) => `${fmt(row.views)} views | ${fmt(row.watchTimeMinutes)} mins watched | ${fmt(row.engagements)} engagements | score ${fmt(row.qualityScore)}`} />
          </Panel>
          <Panel title="Videos" meta="Views and quality score">
            <div className="table-list">
              {(data.topVideos || []).map((video: AnyRow, index: number) => (
                <a className="video-row" href={video.url} target="_blank" rel="noreferrer" key={video.videoId}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{video.title || video.videoId}</strong>
                  <em>{fmt(video.views)} views</em>
                  <small>{video.videoId} | score {fmt(video.qualityScore)} | {fmt(video.watchTimeMinutes)} mins watched | {fmt(video.engagements)} engagements</small>
                </a>
              ))}
            </div>
          </Panel>
        </>
      ) : null}

      {activeTab === "Strategy" ? (
        <>
          <Panel title="Strategy" meta="What to improve first">
            <div className="insight-list">
              <article><strong>Subscriber conversion</strong><span>{pct((Number(totals.subscribersGained || 0) / Number(totals.views || 1)) * 100)} of views became subscribers in this window.</span></article>
              <article><strong>Engagement depth</strong><span>{pct(totals.engagementRate)} engagement rate from likes, comments, and shares.</span></article>
              <article><strong>Watch quality</strong><span>{data.display?.averageViewDuration} average view duration across {fmt(totals.views)} views.</span></article>
              <article><strong>Discovery source</strong><span>{reporting.trafficSources?.[0]?.label || "-"} is the largest source with {fmt(reporting.trafficSources?.[0]?.views)} views.</span></article>
              <article><strong>Viewing device</strong><span>{reporting.devices?.[0]?.label || "-"} is the largest device segment with {fmt(reporting.devices?.[0]?.views)} views.</span></article>
            </div>
          </Panel>
          <section className="grid three">
            <Panel title="Playback" meta="Where watched"><RankList rows={reporting.playbackLocations || []} /></Panel>
            <Panel title="Subscribed" meta="Viewer status"><RankList rows={reporting.subscribedStatus || []} /></Panel>
            <Panel title="Operating Systems" meta="OS split"><RankList rows={reporting.operatingSystems || []} /></Panel>
          </section>
        </>
      ) : null}

      {activeTab === "Quality" ? (
        <>
          <section className="grid">
            <Panel title="Traffic Quality" meta="Source quality">
              <DetailList rows={reporting.trafficSources || []} main={(row) => row.label} detail={(row) => `${fmt(row.views)} views | ${fmt(row.estimatedMinutesWatched)} mins watched | ${row.averageViewDuration}s avg duration`} />
            </Panel>
            <Panel title="Subscriber Quality" meta="Viewer status">
              <DetailList rows={reporting.subscribedStatus || []} main={(row) => row.label} detail={(row) => `${fmt(row.views)} views | ${fmt(row.estimatedMinutesWatched)} mins watched`} />
            </Panel>
          </section>
          <Panel title="Video Quality Score" meta="Balanced ranking">
            <DetailList rows={sortedQualityVideos} valueKey="qualityScore" main={(row) => row.title} detail={(row) => `${fmt(row.views)} views | ${fmt(row.watchTimeMinutes)} mins watched | ${fmt(row.engagements)} engagements | ${fmt(row.subscribersGained)} subs gained`} />
          </Panel>
        </>
      ) : null}

      {activeTab === "Glossary" ? (
        <Panel title="Glossary" meta="Metric definitions">
          <div className="glossary">
            <article><strong>Views</strong><span>Total channel video views in the selected date window.</span></article>
            <article><strong>Watch Time</strong><span>Total estimated minutes watched, converted to hours on the summary card.</span></article>
            <article><strong>Avg View Duration</strong><span>Weighted average seconds watched per view.</span></article>
            <article><strong>Engaged Views</strong><span>Likes, comments, and shares added together.</span></article>
            <article><strong>Subscribers</strong><span>Subscribers gained during the selected date window.</span></article>
            <article><strong>Traffic Source</strong><span>Where views came from, such as Shorts feed, YouTube Search, external URL, or related videos.</span></article>
            <article><strong>Playback Location</strong><span>Where the video was watched, such as Shorts feed, watch page, embedded player, channel page, or browse.</span></article>
            <article><strong>Quality Score</strong><span>Local score across views, watch time, average duration, subscribers gained, and engagement.</span></article>
          </div>
        </Panel>
      ) : null}
    </main>
  )
}

export default App
