import React, { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './wmill'
import './index.css'

type FunnelStage = {
  key: string
  label: string
  value: number
  conversion_from_previous: number
  owner_hint: string
}

type Metrics = {
  spend: number
  reach: number
  impressions: number
  link_clicks: number
  website_visits: number
  typeform_submits: number
  shares: number
  comments: number
  frequency: number
  ctr: number
  cpc: number
  cpm: number
  cpl: number | null
  click_rate: number
  website_visit_rate: number
  typeform_submit_rate: number
}

type CampaignRow = Metrics & {
  campaign_id: string
  campaign_name: string
  status: string
}

type CreativeRow = Metrics & {
  ad_id: string
  ad_name: string
  campaign_name: string
  creative_name: string
  thumbnail_url?: string
}

type CommunityRow = {
  comment_id: string
  creative_name: string
  username: string
  text: string
  created_time: string
  lead_intent: boolean
  risk: boolean
}

type DashboardData = {
  ok: boolean
  generated_at: string
  window: { start_date: string; end_date: string; timezone: string }
  previous_window: { start_date: string; end_date: string }
  funnel: FunnelStage[]
  totals: Metrics
  previous_totals: Metrics
  deltas: Record<string, { value: number | null; good: boolean | null }>
  daily: Record<string, Array<{ date: string; value: number }>>
  campaigns: CampaignRow[]
  creatives: CreativeRow[]
  top_creatives: CreativeRow[]
  creatives_to_review: CreativeRow[]
  insights: Array<{ title: string; body: string; tone: string }>
  community: {
    comments_checked: number
    answered_comments: number
    unanswered_count: number
    response_rate: number
    lead_intent_comments: number
    risk_comments: number
    top_creative_needing_replies: { creative_name: string; unanswered_count: number } | null
    unanswered: CommunityRow[]
  }
}

const fmt = new Intl.NumberFormat('en-IN')
const moneyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const DASHBOARD_PASSCODE = 'Beforest@internal'
const tabs = ['Overview', 'Strategy', 'Campaigns', 'Creatives', 'Community', 'Glossary']

const strategyNotes = [
  {
    title: 'Start with Typeform submits',
    body: 'The dashboard is optimized around real inquiry intent. Reach, clicks, website visits, CTR, CPC, and CPM are diagnostic steps, but the main outcome is Typeform submits and the cost of getting them.',
  },
  {
    title: 'Read the funnel as a drop-off map',
    body: 'Reach shows delivery, link clicks show ad interest, website visits show landing-page arrival, and Typeform submits show lead capture. A weak step tells the team where to inspect first: delivery, creative, landing page, or form journey.',
  },
  {
    title: 'Use previous period as context',
    body: 'Deltas compare the selected window with the immediately previous window of the same length. They are directional signals, not absolute targets. Spend and CPL are treated as better when lower; most volume metrics are better when higher.',
  },
  {
    title: 'Treat review queues as prompts',
    body: 'Campaign Status, Insight Cards, and Creatives To Review do not pause, scale, or edit ads automatically. They identify what a marketer should inspect inside Meta Ads Manager before changing budgets, audiences, or creatives.',
  },
]

const decisionRules = [
  {
    title: 'Funnel status thresholds',
    body: 'Reach is OK when it is above zero. Later steps show MISS when the value is zero, WATCH when conversion from the previous funnel step is below 2%, SPIKE when it is above 35%, and OK when it sits between those bands.',
  },
  {
    title: 'Campaign status rules',
    body: 'Scale means campaign CPL is at or below the account average CPL and the campaign has at least 2 Typeform submits. Weak means spend is above INR 1,000 with zero Typeform submits. Fatigue means frequency is above 3 and CTR is down more than 15% versus the previous period. Watch means CTR is down more than 15% or CPL is up more than 15%. Healthy means none of these rules fired.',
  },
  {
    title: 'Creative review thresholds',
    body: 'A creative is protected from review when it has at least average creative-level Typeform submits and CPL is at or below account CPL. It enters Creatives To Review when spend is at least INR 500, submits are below average, CPL is above account CPL, or its CTR is below 65% of account CTR.',
  },
  {
    title: 'Review queue ordering',
    body: 'Creatives To Review is sorted by highest spend first, then fewest Typeform submits, then weakest CTR. The dashboard shows the top 8 so the team sees the clearest budget-risk items first.',
  },
  {
    title: 'Insight card triggers',
    body: 'Weak Creative or Hook appears when CTR is below 0.8%. Landing Page or Typeform Issue appears when website visits exist but fewer than 2% become Typeform submits. Strong Scale Candidate appears when submits rise and CPL falls versus the previous period. Delivery or Budget Issue appears when reach drops more than 20%. Content Resonance Signal appears when shares are present.',
  },
  {
    title: 'Benchmark discipline',
    body: 'These thresholds are operating benchmarks chosen to surface likely action areas. They should start a review, not end one. Before acting, compare the ad objective, date range, audience size, spend maturity, comments, and lead quality.',
  },
]

const glossary = [
  ['Spend', 'Total Meta ad spend in INR for the selected date window.'],
  ['Reach', 'Unique people reached by Facebook ads in the selected date window.'],
  ['Impressions', 'Total ad views. One person can create multiple impressions.'],
  ['Link Clicks', 'Ad link clicks. This dashboard does not use inline link clicks as the click source.'],
  ['Website Visits', 'Landing page views from Meta action types landing_page_view or omni_landing_page_view.'],
  ['Typeform Submits', 'Meta pixel custom conversion offsite_conversion.fb_pixel_custom.TypeformSubmit.'],
  ['CTR', 'Link clicks divided by impressions.'],
  ['CPC', 'Spend divided by link clicks.'],
  ['CPM', 'Spend per 1,000 impressions.'],
  ['CPL', 'Spend divided by Typeform submits.'],
  ['Frequency', 'Weighted average frequency by reach.'],
  ['Previous Period Delta', 'Change versus the immediately preceding date window of the same length. For spend and CPL, lower is treated as better.'],
  ['Funnel Status', 'Rule-based label on each funnel stage. MISS means no volume, WATCH means below-threshold conversion, SPIKE means unusually high conversion, and OK means the step is inside the normal band.'],
  ['Campaign Status', 'Rule-based label: Scale means efficient leads, Weak means spend without submits, Fatigue means high frequency with falling CTR, Watch means declining CTR or rising CPL, and Healthy means no immediate issue.'],
  ['Insight Cards', 'Rule-based prompts for likely action areas such as weak creative, landing-page drop-off, delivery drop, or scale candidates.'],
  ['Benchmark Thresholds', 'Internal operating cutoffs used to trigger review prompts. They guide inspection and do not automatically change campaigns.'],
  ['Top Creatives', 'Creatives ranked by Typeform submits first, then lower CPL.'],
  ['Creatives To Review', 'Creatives flagged when spend is meaningful but submits are weak, CPL is above account average, or CTR is much lower than account CTR.'],
  ['Shares', 'Meta-reported post share actions attributed to ads.'],
  ['Comments', 'Meta-reported comment actions attributed to ads.'],
  ['Unanswered Comments', 'Comments where Beforest has not replied in the fetched comment thread.'],
  ['Response Rate', 'Answered comments divided by all fetched comments in the latest community snapshot.'],
  ['Lead Intent Comments', 'Unanswered comments containing interest signals such as price, details, visit, call, booking, or brochure.'],
  ['Risk Comments', 'Unanswered comments containing trust, complaint, or negative-risk keywords that should be checked quickly.'],
  ['Community Snapshot', 'Latest fetched ad and page comment snapshot. It is not strictly filtered by the selected dashboard date window.'],
]

function isoDate(daysBack: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysBack)
  return date.toISOString().slice(0, 10)
}

function compact(value: unknown) {
  return fmt.format(Math.round(Number(value || 0)))
}

function money(value: unknown) {
  return moneyFmt.format(Number(value || 0))
}

function pct(value: unknown) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`
}

function ratePct(value: unknown) {
  return `${Number(value || 0).toFixed(2)}%`
}

function decimal(value: unknown) {
  return Number(value || 0).toFixed(2)
}

function dateTime(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function shortDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T00:00:00+05:30`))
}

function deltaLabel(delta?: { value: number | null; good: boolean | null }) {
  if (!delta || delta.value === null) return 'new'
  const sign = delta.value >= 0 ? '+' : ''
  return `${sign}${(delta.value * 100).toFixed(1)}%`
}

function statusFor(stage: FunnelStage) {
  if (stage.key === 'reach') return stage.value > 0 ? 'OK' : 'MISS'
  if (stage.value === 0) return 'MISS'
  if (stage.conversion_from_previous < 2) return 'WATCH'
  if (stage.conversion_from_previous > 35) return 'SPIKE'
  return 'OK'
}

function Sparkline({ rows, tone = 'blue', yLabel }: { rows: Array<{ date?: string; value: number }>; tone?: string; yLabel: string }) {
  const visibleRows = rows.slice(-18)
  const values = visibleRows.map((row) => Number(row.value || 0))
  const max = Math.max(1, ...values)
  const mid = Math.round(max / 2)
  const firstDate = visibleRows[0]?.date
  const lastDate = visibleRows[visibleRows.length - 1]?.date
  return (
    <div className="chart-frame">
      <div className="axis-title">Y: {yLabel}</div>
      <div className="chart-body">
        <div className="y-axis" aria-hidden="true">
          <span>{compact(max)}</span>
          <span>{compact(mid)}</span>
          <span>0</span>
        </div>
        <div className={`spark ${tone}`} aria-label={`Daily ${yLabel} chart`}>
          {visibleRows.map((row, index) => (
            <i
              key={`${row.date || index}-${row.value}`}
              data-tip={`${row.date || `Day ${index + 1}`}: ${compact(row.value)}`}
              title={`${row.date || `Day ${index + 1}`}: ${compact(row.value)}`}
              style={{ height: `${Math.max(8, (Number(row.value || 0) / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="x-axis">
        <span>{shortDate(firstDate)}</span>
        <b>X: Date</b>
        <span>{shortDate(lastDate)}</span>
      </div>
    </div>
  )
}

function ChartPanel({ title, rows, note, tone, yLabel }: { title: string; rows: Array<{ date: string; value: number }>; note: string; tone: string; yLabel: string }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0)
  return (
    <div className="panel mini-chart">
      <div className="section-head">
        <h2>{title}</h2>
        <span>{compact(total)} {note}</span>
      </div>
      <Sparkline rows={rows} tone={tone} yLabel={yLabel} />
    </div>
  )
}

function Metric({ label, value, note, delta, tone = '' }: { label: string; value: string; note: string; delta?: { value: number | null; good: boolean | null }; tone?: string }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
      {delta ? <b className={delta.good === false ? 'bad' : 'good'}>{deltaLabel(delta)} vs prev</b> : null}
    </article>
  )
}

function Funnel({ rows }: { rows: FunnelStage[] }) {
  return (
    <div className="funnel">
      {rows.map((row, index) => {
        const status = statusFor(row)
        const stageFlex = Math.max(0.86, 1.16 - index * 0.1)
        const stageHeight = Math.max(132, 188 - index * 16)
        return (
          <article
            className={`stage ${status.toLowerCase()}`}
            key={row.key}
            title={row.owner_hint}
            style={{
              ['--step' as any]: index,
              ['--stage-flex' as any]: stageFlex,
              ['--stage-height' as any]: `${stageHeight}px`,
            }}
          >
            <div>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{row.label}</strong>
              <em>{compact(row.value)}</em>
              <small>{index === 0 ? 'base' : `${ratePct(row.conversion_from_previous)} from prev`}</small>
              <b>{status}</b>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Spend</th>
            <th>Reach</th>
            <th>Impressions</th>
            <th>Link Clicks</th>
            <th>CTR</th>
            <th>Website Visits</th>
            <th>Typeform Submits</th>
            <th>CPL</th>
            <th>Frequency</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.campaign_id}>
              <td className="clip">{row.campaign_name}</td>
              <td>{money(row.spend)}</td>
              <td>{compact(row.reach)}</td>
              <td>{compact(row.impressions)}</td>
              <td>{compact(row.link_clicks)}</td>
              <td>{pct(row.ctr)}</td>
              <td>{compact(row.website_visits)}</td>
              <td>{compact(row.typeform_submits)}</td>
              <td>{row.cpl === null ? '-' : money(row.cpl)}</td>
              <td>{decimal(row.frequency)}</td>
              <td><span className={`tag status-${row.status.toLowerCase()}`}>{row.status}</span></td>
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={11}>No campaigns found in this date window.</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function CreativeTable({ rows }: { rows: CreativeRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Creative</th>
            <th>Campaign</th>
            <th>Spend</th>
            <th>Reach</th>
            <th>Link Clicks</th>
            <th>CTR</th>
            <th>Website Visits</th>
            <th>Typeform Submits</th>
            <th>CPL</th>
            <th>Shares</th>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ad_id}>
              <td className="creative-cell">
                {row.thumbnail_url ? <img src={row.thumbnail_url} alt="" /> : <span className="thumb-empty" />}
                <span>{row.creative_name || row.ad_name}</span>
              </td>
              <td className="clip">{row.campaign_name}</td>
              <td>{money(row.spend)}</td>
              <td>{compact(row.reach)}</td>
              <td>{compact(row.link_clicks)}</td>
              <td>{pct(row.ctr)}</td>
              <td>{compact(row.website_visits)}</td>
              <td>{compact(row.typeform_submits)}</td>
              <td>{row.cpl === null ? '-' : money(row.cpl)}</td>
              <td>{compact(row.shares)}</td>
              <td>{compact(row.comments)}</td>
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={11}>No creatives found in this date window.</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function CommentsQueue({ rows }: { rows: CommunityRow[] }) {
  return (
    <div className="comments">
      {rows.slice(0, 16).map((row) => (
        <article key={row.comment_id} className="comment">
          <div className="comment-head">
            <strong>{row.username}</strong>
            <span>{row.lead_intent ? 'lead intent' : 'comment'}</span>
            <b>{row.risk ? 'risk' : row.creative_name}</b>
          </div>
          <p>{row.text || '(no text)'}</p>
          <small>{dateTime(row.created_time)}</small>
        </article>
      ))}
      {!rows.length ? <div className="empty">No unanswered comments found in the fetched snapshot.</div> : null}
    </div>
  )
}

export default function App() {
  const [startDate, setStartDate] = useState(isoDate(6))
  const [endDate, setEndDate] = useState(isoDate(0))
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(() => window.localStorage.getItem('beforest_fb_ads_dashboard_unlocked') === 'true')
  const [activeTab, setActiveTab] = useState('Overview')
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const dashboard = await backend.fetch_dashboard({
        start_date: startDate,
        end_date: endDate,
      })
      setData(dashboard as DashboardData)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isUnlocked) load()
  }, [isUnlocked])

  function submit(event: FormEvent) {
    event.preventDefault()
    load()
  }

  function unlockDashboard(event: FormEvent) {
    event.preventDefault()
    if (passcode.trim() === DASHBOARD_PASSCODE) {
      window.localStorage.setItem('beforest_fb_ads_dashboard_unlocked', 'true')
      setIsUnlocked(true)
      setPasscodeError('')
      return
    }
    setPasscodeError('That passcode is not matching.')
  }

  const actionRows = useMemo(() => {
    if (!data) return []
    return data.insights.slice(0, 4)
  }, [data])

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <span>Beforest Facebook Ads Monitor</span>
          <span>{data ? `refreshed ${dateTime(data.generated_at)}` : 'waiting for data'}</span>
        </header>

        <section className="prompt">
          <code>facebook_ads --window {startDate}..{endDate}</code>
          <h1>Reach to Typeform Control Room</h1>
          <p>Reach &gt; Link Clicks &gt; Website Visits &gt; Typeform Submits</p>
        </section>

        {!isUnlocked ? (
          <section className="access-panel">
            <span className="domain">beforest facebook ads</span>
            <h2>Enter Team Passcode</h2>
            <p>Open the live Facebook ads funnel, creative, and comment health dashboard.</p>
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
        ) : (
          <>
            <form className="controls" onSubmit={submit}>
              <label>Start<input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" /></label>
              <label>End<input value={endDate} onChange={(event) => setEndDate(event.target.value)} type="date" /></label>
              <span className="control-note">Refresh reads stored Windmill data. Meta sync runs daily at 8:00 AM IST. Typeform Submits come from the Meta TypeformSubmit conversion, not CRM data.</span>
              <button type="submit" disabled={loading}>{loading ? 'Loading' : 'Refresh'}</button>
            </form>

            <nav className="tabbar" aria-label="Dashboard sections">
              {tabs.map((tab) => (
                <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
                  {tab}
                </button>
              ))}
            </nav>

            {error ? <div className="error">{error}</div> : null}

            {data && activeTab === 'Overview' ? (
              <>
                <section className="panel">
                  <div className="section-head">
                    <h2>Funnel Efficiency</h2>
                    <span>{data.window.start_date} to {data.window.end_date}</span>
                  </div>
                  <Funnel rows={data.funnel} />
                </section>

                <section className="metrics-grid">
                  <Metric label="Spend" value={money(data.totals.spend)} note="Meta ad spend" delta={data.deltas.spend} tone="blue" />
                  <Metric label="Reach" value={compact(data.totals.reach)} note="Unique people reached" delta={data.deltas.reach} tone="green" />
                  <Metric label="Link Clicks" value={compact(data.totals.link_clicks)} note="Facebook link clicks" delta={data.deltas.link_clicks} tone="amber" />
                  <Metric label="Typeform Submits" value={compact(data.totals.typeform_submits)} note="Meta TypeformSubmit conversions" delta={data.deltas.typeform_submits} tone="pink" />
                  <Metric label="CTR" value={pct(data.totals.ctr)} note="Link clicks / impressions" delta={data.deltas.ctr} />
                  <Metric label="CPC" value={money(data.totals.cpc)} note="Spend / link clicks" />
                  <Metric label="CPM" value={money(data.totals.cpm)} note="Spend per 1,000 impressions" />
                  <Metric label="CPL" value={data.totals.cpl === null ? '-' : money(data.totals.cpl)} note="Spend / Typeform submits" delta={data.deltas.cpl} />
                </section>

                <section className="split">
                  <ChartPanel title="Daily Reach" rows={data.daily.reach || []} note="daily-sum reach" tone="blue" yLabel="Reach" />
                  <div className="panel">
                    <div className="section-head">
                      <h2>Insight Cards</h2>
                      <span>{actionRows.length ? 'rule-based signals' : 'no immediate signals'}</span>
                    </div>
                    <div className="actions">
                      {(actionRows.length ? actionRows : [{ title: 'No Watch Item', body: 'The selected window does not currently trigger a dashboard insight.', tone: 'green' }]).map((row) => (
                        <article key={row.title}>
                          <b>{row.title}</b>
                          <span>{row.tone}</span>
                          <p>{row.body}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="chart-grid">
                  <ChartPanel title="Daily Typeform Submits" rows={data.daily.typeform_submits || []} note="submits" tone="green" yLabel="Typeform submits" />
                  <ChartPanel title="Daily CPL" rows={data.daily.daily_cpl || []} note="daily CPL points" tone="amber" yLabel="CPL" />
                  <ChartPanel title="Daily Link Clicks" rows={data.daily.link_clicks || []} note="link clicks" tone="violet" yLabel="Link clicks" />
                </section>
              </>
            ) : null}

            {activeTab === 'Strategy' ? (
              <section className="panel docs-panel">
                <div className="section-head">
                  <h2>Strategy</h2>
                  <span>benchmarks, thresholds, and review logic</span>
                </div>
                <div className="docs-grid">
                  {strategyNotes.map((note, index) => (
                    <article key={note.title}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <h3>{note.title}</h3>
                      <p>{note.body}</p>
                    </article>
                  ))}
                </div>
                <div className="section-head subhead">
                  <h2>Decision Rules</h2>
                  <span>how dashboard flags are decided</span>
                </div>
                <div className="docs-grid">
                  {decisionRules.map((note, index) => (
                    <article key={note.title}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <h3>{note.title}</h3>
                      <p>{note.body}</p>
                    </article>
                  ))}
                </div>
                <p className="rate-note">
                  Operating rule: use this tab to decide what to inspect, then validate inside Meta Ads Manager before changing spend, pausing creatives, or scaling a campaign.
                </p>
              </section>
            ) : null}

            {data && activeTab === 'Campaigns' ? (
              <section className="panel">
                <div className="section-head">
                  <h2>Campaign Performance</h2>
                  <span>highest Typeform submits, then lowest CPL</span>
                </div>
                <CampaignTable rows={data.campaigns} />
              </section>
            ) : null}

            {data && activeTab === 'Creatives' ? (
              <>
                <section className="panel">
                  <div className="section-head">
                    <h2>Top Creatives</h2>
                    <span>Typeform submits descending</span>
                  </div>
                  <CreativeTable rows={data.top_creatives} />
                </section>
                <section className="panel">
                  <div className="section-head">
                    <h2>Creatives To Review</h2>
                    <span>high spend, low submits, or weak CTR</span>
                  </div>
                  <CreativeTable rows={data.creatives_to_review} />
                </section>
              </>
            ) : null}

            {data && activeTab === 'Community' ? (
              <>
                <section className="metrics-grid">
                  <Metric label="Unanswered Comments" value={compact(data.community.unanswered_count)} note="Fetched ad/page comment backlog" tone="pink" />
                  <Metric label="Response Rate" value={pct(data.community.response_rate)} note={`${compact(data.community.answered_comments)} answered / ${compact(data.community.comments_checked)} checked`} tone="green" />
                  <Metric label="Lead Intent Comments" value={compact(data.community.lead_intent_comments)} note="Interest keywords found" tone="amber" />
                  <Metric label="Risk Comments" value={compact(data.community.risk_comments)} note="Trust or complaint keywords found" tone="blue" />
                </section>
                <section className="panel">
                  <div className="section-head">
                    <h2>Unanswered Comments</h2>
                    <span>{data.community.top_creative_needing_replies ? `${data.community.top_creative_needing_replies.creative_name}: ${data.community.top_creative_needing_replies.unanswered_count}` : 'no top creative'}</span>
                  </div>
                  <p className="queue-note">This queue is the latest fetched comment snapshot, not a strict dashboard date-window filter.</p>
                  <CommentsQueue rows={data.community.unanswered || []} />
                </section>
              </>
            ) : null}

            {activeTab === 'Glossary' ? (
              <section className="panel docs-panel">
                <div className="section-head">
                  <h2>Glossary</h2>
                  <span>dashboard source of truth</span>
                </div>
                <div className="glossary-grid">
                  {glossary.map(([term, definition]) => (
                    <article key={term}>
                      <h3>{term}</h3>
                      <p>{definition}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
