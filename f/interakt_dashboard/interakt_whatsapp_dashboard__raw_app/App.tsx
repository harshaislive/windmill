import React, { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './wmill'
import './index.css'

type FunnelStage = {
  key: string
  label: string
  value: number | null
  conversion_from_previous: number | null
  dropoff_from_previous: number | null
  source: string
}

type Totals = {
  campaigns: number
  attempted: number
  sent: number
  delivered: number
  read: number
  replies: number
  delivery_rate: number | null
  read_rate: number | null
  reply_rate: number | null
  delivered_to_read_rate: number | null
  read_to_reply_rate: number | null
  qualified_conversations: number | null
  meetings: number | null
  deals: number | null
  revenue: number | null
  average_response_time_minutes: number | null
  unanswered_conversations: number | null
  pending_followups: number | null
}

type CampaignRow = {
  campaign_id: string
  campaign_name: string
  category?: string
  status?: string
  set_live_date?: string
  attempted?: number
  sent?: number
  delivered?: number
  read?: number
  replies?: number
  delivery_rate?: number
  delivered_rate?: number
  read_rate?: number
  reply_rate?: number
  geography?: string
  campaign_type?: string
  audience_type?: string
  campaign_objective?: string
}

type SegmentRow = Totals & { name: string }

type DashboardData = {
  ok: boolean
  ready: boolean
  message?: string
  generated_at: string
  window: { start_date: string; end_date: string; timezone: string }
  previous_window: { start_date: string; end_date: string }
  totals: Totals
  previous_totals: Totals
  deltas: Record<string, { value: number | null; good: boolean | null }>
  funnel: FunnelStage[]
  daily: Record<string, Array<{ date: string; value: number }>>
  campaigns: CampaignRow[]
  segments: Record<string, SegmentRow[]>
  sync: any
  webhook_sync?: any
}

const fmt = new Intl.NumberFormat('en-IN')
const tabs = ['Overview', 'Campaigns', 'Segments', 'Glossary']

function isoDate(daysBack: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysBack)
  return date.toISOString().slice(0, 10)
}

function compact(value: unknown) {
  if (value === null || value === undefined) return 'Not connected'
  return fmt.format(Math.round(Number(value || 0)))
}

function pct(value: unknown) {
  if (value === null || value === undefined) return 'Not connected'
  return `${(Number(value || 0) * 100).toFixed(2)}%`
}

function metricRate(value: unknown) {
  if (value === null || value === undefined) return 'No source rows'
  return pct(value)
}

function shortDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }).format(new Date(`${value.slice(0, 10)}T00:00:00+05:30`))
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

function deltaLabel(delta?: { value: number | null; good: boolean | null }) {
  if (!delta || delta.value === null) return 'new'
  const sign = delta.value >= 0 ? '+' : ''
  return `${sign}${(delta.value * 100).toFixed(1)}%`
}

function Sparkline({ rows, tone, label }: { rows: Array<{ date: string; value: number }>; tone: string; label: string }) {
  const values = rows.slice(-18)
  const max = Math.max(1, ...values.map((row) => Number(row.value || 0)))
  const mid = Math.round(max / 2)
  return (
    <div className="chart-frame">
      <div className="axis-title">Y: {label}</div>
      <div className="chart-body">
        <div className="y-axis" aria-hidden="true">
          <span>{compact(max)}</span>
          <span>{compact(mid)}</span>
          <span>0</span>
        </div>
        <div className={`spark ${tone}`} aria-label={`${label} trend`}>
          {values.map((row) => (
            <i
              key={`${row.date}-${row.value}`}
              data-tip={`${row.date}: ${compact(row.value)}`}
              title={`${row.date}: ${compact(row.value)}`}
              style={{ height: `${Math.max(8, (Number(row.value || 0) / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="x-axis">
        <span>{shortDate(values[0]?.date)}</span>
        <b>X: Date</b>
        <span>{shortDate(values[values.length - 1]?.date)}</span>
      </div>
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
        const status = row.value === null ? 'miss' : Number(row.conversion_from_previous ?? 1) < 0.3 && index > 0 ? 'watch' : 'healthy'
        const stageFlex = Math.max(0.86, 1.16 - index * 0.1)
        const stageHeight = Math.max(132, 188 - index * 16)
        return (
          <article
            className={`stage ${status}`}
            key={row.key}
            style={{
              ['--stage-flex' as any]: stageFlex,
              ['--stage-height' as any]: `${stageHeight}px`,
            }}
          >
            <div>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{row.label}</strong>
              <em>{compact(row.value)}</em>
              <small>{index === 0 ? row.source : `${pct(row.conversion_from_previous)} from prev`}</small>
              <b>{row.source}</b>
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
            <th>Status</th>
            <th>Sent</th>
            <th>Delivered</th>
            <th>Read</th>
            <th>Replies</th>
            <th>Read Rate</th>
            <th>Reply Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.campaign_id}>
              <td>
                <b>{row.campaign_name}</b>
                <span>{row.geography || 'Mixed'} · {row.campaign_type || 'Unknown'}</span>
              </td>
              <td>{row.status || '-'}</td>
              <td>{compact(row.sent)}</td>
              <td>{compact(row.delivered)}</td>
              <td>{compact(row.read)}</td>
              <td>{compact(row.replies)}</td>
              <td>{pct(row.read_rate)}</td>
              <td>{pct(row.reply_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SegmentTable({ title, rows }: { title: string; rows: SegmentRow[] }) {
  return (
    <section className="panel">
      <div className="section-head">
        <h2>{title}</h2>
        <span>{rows.length} segments</span>
      </div>
      <div className="table-wrap compact-table">
        <table>
          <thead>
            <tr>
              <th>Segment</th>
              <th>Campaigns</th>
              <th>Sent</th>
              <th>Read Rate</th>
              <th>Reply Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td><b>{row.name}</b></td>
                <td>{compact(row.campaigns)}</td>
                <td>{compact(row.sent)}</td>
                <td>{pct(row.read_rate)}</td>
                <td>{pct(row.reply_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function App() {
  const [startDate, setStartDate] = useState(isoDate(29))
  const [endDate, setEndDate] = useState(isoDate(0))
  const [activeTab, setActiveTab] = useState(tabs[0])
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(event?: FormEvent) {
    event?.preventDefault()
    setLoading(true)
    setError('')
    try {
      setData(await backend.fetch_dashboard({ start_date: startDate, end_date: endDate }) as DashboardData)
    } catch (err: any) {
      setError(err?.message || 'Unable to load Interakt dashboard data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const totals = data?.totals
  const hasRows = Boolean(data?.ready && data.campaigns.length)
  const syncError = data?.sync?.status === 'failed' && data?.webhook_sync?.status !== 'success' ? String(data.sync?.error_message || '') : ''

  const glossary = useMemo(() => [
    ['Attempted', 'Contacts Interakt attempted to send a campaign to.'],
    ['Sent', 'Messages successfully sent by Interakt.'],
    ['Delivered', 'Sent messages delivered to WhatsApp users.'],
    ['Read', 'Sent messages read by users. Interakt-style read rate is Read / Sent.'],
    ['Replies', 'Users who replied to the campaign.'],
    ['Business Outcomes', 'Qualified conversations, meetings, sales, revenue, response time, and pending follow-ups are intentionally not estimated. They require a connected API/source table.'],
  ], [])

  return (
    <main>
      <div className="shell">
        <div className="topbar">
          <span>Beforest // Interakt WhatsApp</span>
          <span>{data?.generated_at ? `Generated ${dateTime(data.generated_at)}` : 'Campaign intelligence'}</span>
        </div>
        <section className="prompt">
          <code>WhatsApp Intelligence</code>
          <h1>Campaign Intelligence Dashboard</h1>
          <p>Campaign delivery, read, and reply metrics sourced from Interakt API data stored in Windmill datatables.</p>
        </section>
        <form className="controls" onSubmit={load}>
          <label>
            From
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <p className="control-note">
            Data flow: Interakt API to sync script to Windmill datatables to dashboard backend. If the sync path is wrong, this dashboard will show an empty state instead of modeled values.
          </p>
          <button type="submit">{loading ? 'Loading' : 'Refresh'}</button>
        </form>

        <nav className="tabbar">
          {tabs.map((tab) => (
            <button className={activeTab === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </nav>

        {error ? <section className="error">{error}</section> : null}
        {!loading && syncError ? <section className="error">Latest sync failed: {syncError}</section> : null}
        {!loading && data?.message ? <section className="empty">{data.message}</section> : null}

        {loading ? <section className="empty">Loading Interakt metrics…</section> : null}

        {!loading && data && activeTab === 'Overview' ? (
          <>
          <section className="metrics-grid">
            <Metric label="Campaigns" value={compact(totals?.campaigns)} note="Campaign rows in selected window" tone="blue" />
            <Metric label="Sent" value={compact(totals?.sent)} note="Webhook-derived message events" delta={data.deltas.sent} />
            <Metric label="Delivered" value={compact(totals?.delivered)} note={metricRate(totals?.delivery_rate)} delta={data.deltas.delivered} tone="green" />
            <Metric label="Read" value={compact(totals?.read)} note={metricRate(totals?.read_rate)} delta={data.deltas.read} tone="violet" />
            <Metric label="Replies" value={compact(totals?.replies)} note={metricRate(totals?.reply_rate)} delta={data.deltas.replies} tone="amber" />
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>WhatsApp Funnel</h2>
              <span>{data.window.start_date} to {data.window.end_date}</span>
            </div>
            <Funnel rows={data.funnel} />
          </section>

          <section className="chart-grid">
            <div className="panel mini-chart"><div className="section-head"><h2>Sent</h2><span>{compact(totals?.sent)}</span></div><Sparkline rows={data.daily.sent || []} tone="blue" label="Sent" /></div>
            <div className="panel mini-chart"><div className="section-head"><h2>Delivered</h2><span>{compact(totals?.delivered)}</span></div><Sparkline rows={data.daily.delivered || []} tone="green" label="Delivered" /></div>
            <div className="panel mini-chart"><div className="section-head"><h2>Read</h2><span>{compact(totals?.read)}</span></div><Sparkline rows={data.daily.read || []} tone="violet" label="Read" /></div>
            <div className="panel mini-chart"><div className="section-head"><h2>Replies</h2><span>{compact(totals?.replies)}</span></div><Sparkline rows={data.daily.replies || []} tone="amber" label="Replies" /></div>
          </section>
          </>
        ) : null}

        {!loading && data && activeTab === 'Campaigns' ? (
        <section className="panel">
          <div className="section-head">
            <h2>Campaign Performance</h2>
            <span>{hasRows ? `${data.campaigns.length} rows` : 'no rows'}</span>
          </div>
          <CampaignTable rows={data.campaigns} />
        </section>
        ) : null}

        {!loading && data && activeTab === 'Segments' ? (
        <section className="segment-grid">
          <SegmentTable title="Geography" rows={data.segments.geography || []} />
          <SegmentTable title="Campaign Type" rows={data.segments.campaign_type || []} />
          <SegmentTable title="Audience Type" rows={data.segments.audience_type || []} />
          <SegmentTable title="Campaign Objective" rows={data.segments.campaign_objective || []} />
        </section>
        ) : null}

        {!loading && activeTab === 'Glossary' ? (
        <section className="panel docs-panel">
          <div className="section-head">
            <h2>Metric Glossary</h2>
            <span>API-sourced only</span>
          </div>
          <div className="glossary-grid">
            {glossary.map(([term, body]) => (
              <article key={term}>
                <h3>{term}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        ) : null}
      </div>
    </main>
  )
}
