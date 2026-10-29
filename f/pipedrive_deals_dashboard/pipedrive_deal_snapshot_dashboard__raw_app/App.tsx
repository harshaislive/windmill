import { useEffect, useMemo, useState } from 'react'
import { backend } from './wmill'
import './index.css'

type CountValue = { count: number; value: number; weighted_value: number }
type Bucket = {
  key: string
  label: string
  owner?: string
  collective?: string
  stage?: string
  open: CountValue
  won: CountValue
  lost: CountValue
  total: CountValue
  no_activity: number
  overdue_activity: number
  stale_open: number
  expected_close_overdue: number
  avg_open_age_days: number
  win_rate_closed: number
}
type DashboardData = {
  ready: boolean
  message?: string
  generated_at: string
  snapshot_date: string
  source: { deal_count: number; stale_days: number }
  totals: Bucket
  owners: Bucket[]
  collectives: Bucket[]
  owner_collectives: Bucket[]
  stages: Bucket[]
  lost_reasons: Array<{ reason: string; count: number; value: number }>
  recent_deals: Array<Record<string, any>>
}

const emptyCount = { count: 0, value: 0, weighted_value: 0 }
const emptyBucket: Bucket = {
  key: 'all',
  label: 'All deals',
  open: emptyCount,
  won: emptyCount,
  lost: emptyCount,
  total: emptyCount,
  no_activity: 0,
  overdue_activity: 0,
  stale_open: 0,
  expected_close_overdue: 0,
  avg_open_age_days: 0,
  win_rate_closed: 0,
}
const emptyData: DashboardData = {
  ready: false,
  generated_at: '',
  snapshot_date: '',
  source: { deal_count: 0, stale_days: 14 },
  totals: emptyBucket,
  owners: [],
  collectives: [],
  owner_collectives: [],
  stages: [],
  lost_reasons: [],
  recent_deals: [],
}

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const number = new Intl.NumberFormat('en-IN')

function compact(value: unknown) {
  return number.format(Math.round(Number(value) || 0))
}

function currency(value: unknown) {
  const amount = Number(value) || 0
  if (Math.abs(amount) >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`
  if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
  return `₹${money.format(amount)}`
}

function dateTime(value?: string) {
  if (!value) return 'Not fetched'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function pct(value: unknown) {
  return `${(Number(value) || 0).toFixed(1)}%`
}

function Metric({ label, value, note, tone = 'ink' }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

function Bar({ value, max, tone = 'green' }: { value: number; max: number; tone?: string }) {
  const width = max ? Math.max(2, Math.min(100, (value / max) * 100)) : 0
  return <i className={`bar ${tone}`}><em style={{ width: `${width}%` }} /></i>
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status}`}>{status}</span>
}

function BucketTable({ rows, mode }: { rows: Bucket[]; mode: 'owner' | 'collective' | 'matrix' | 'stage' }) {
  const maxValue = Math.max(1, ...rows.map((row) => row.open.value))
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{mode === 'owner' ? 'Owner' : mode === 'collective' ? 'Collective' : mode === 'stage' ? 'Stage' : 'Owner / Collective'}</th>
            {mode === 'matrix' ? <th>Owner</th> : null}
            {mode === 'matrix' || mode === 'stage' ? <th>Collective</th> : null}
            <th>Open</th>
            <th>Open Value</th>
            <th>Won</th>
            <th>Lost</th>
            <th>No Activity</th>
            <th>Overdue</th>
            <th>Stale</th>
            <th>Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td><strong>{mode === 'stage' ? row.stage : row.label}</strong></td>
              {mode === 'matrix' ? <td>{row.owner}</td> : null}
              {mode === 'matrix' || mode === 'stage' ? <td>{row.collective}</td> : null}
              <td>{compact(row.open.count)}</td>
              <td>
                <div className="value-cell">
                  <span>{currency(row.open.value)}</span>
                  <Bar value={row.open.value} max={maxValue} />
                </div>
              </td>
              <td>{compact(row.won.count)} <small>{currency(row.won.value)}</small></td>
              <td>{compact(row.lost.count)} <small>{currency(row.lost.value)}</small></td>
              <td>{compact(row.no_activity)}</td>
              <td>{compact(row.overdue_activity)}</td>
              <td>{compact(row.stale_open)}</td>
              <td>{pct(row.win_rate_closed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LostReasons({ rows }: { rows: DashboardData['lost_reasons'] }) {
  const max = Math.max(1, ...rows.map((row) => row.count))
  return (
    <div className="reason-list">
      {rows.slice(0, 10).map((row) => (
        <div key={row.reason}>
          <span>{row.reason}</span>
          <strong>{compact(row.count)}</strong>
          <Bar value={row.count} max={max} tone="red" />
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'Owners' | 'Collectives' | 'Matrix' | 'Stages' | 'Deals'>('Owners')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await backend.fetch_dashboard({}) as DashboardData
      setData(result)
    } catch (err: any) {
      setError(err?.message || 'Unable to load dashboard snapshot')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const hotOwners = useMemo(() => data.owners.slice(0, 6), [data.owners])
  const maxOwnerValue = Math.max(1, ...hotOwners.map((row) => row.open.value))

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>Pipedrive Deal Snapshot</h1>
          <p>One daily fetch. Current pipeline health by owner, collective, stage, and loss reason.</p>
        </div>
        <div className="actions">
          <span>{loading ? 'Refreshing view' : `Fetched ${dateTime(data.generated_at)}`}</span>
          <button onClick={load} type="button">Refresh</button>
        </div>
      </header>

      {error ? <section className="notice">{error}</section> : null}
      {data.message ? <section className="notice">{data.message}</section> : null}

      <section className="metrics">
        <Metric label="Open Pipeline" value={currency(data.totals.open.value)} note={`${compact(data.totals.open.count)} active deals`} tone="green" />
        <Metric label="Weighted Pipeline" value={currency(data.totals.open.weighted_value)} note="Weighted by deal probability" tone="ink" />
        <Metric label="Won Deals" value={compact(data.totals.won.count)} note={currency(data.totals.won.value)} tone="blue" />
        <Metric label="Lost Deals" value={compact(data.totals.lost.count)} note={currency(data.totals.lost.value)} tone="red" />
        <Metric label="Needs Attention" value={compact(data.totals.no_activity + data.totals.overdue_activity)} note={`${compact(data.totals.stale_open)} stale open`} tone="amber" />
      </section>

      <section className="grid">
        <article className="panel owner-panel">
          <div className="section-heading">
            <h2>Owner Health</h2>
            <span>{compact(data.source.deal_count)} deals in snapshot</span>
          </div>
          <div className="owner-stack">
            {hotOwners.map((row) => (
              <div key={row.key} className="owner-row">
                <div>
                  <strong>{row.label}</strong>
                  <span>{compact(row.open.count)} open / {compact(row.no_activity)} no activity / {compact(row.overdue_activity)} overdue</span>
                </div>
                <em>{currency(row.open.value)}</em>
                <Bar value={row.open.value} max={maxOwnerValue} />
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="section-heading">
            <h2>Lost Reasons</h2>
            <span>Top current captured reasons</span>
          </div>
          <LostReasons rows={data.lost_reasons} />
        </article>
      </section>

      <nav className="tabs">
        {(['Owners', 'Collectives', 'Matrix', 'Stages', 'Deals'] as const).map((item) => (
          <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>
        ))}
      </nav>

      <section className="panel table-panel">
        <div className="section-heading">
          <h2>{tab === 'Matrix' ? 'Owner x Collective' : tab}</h2>
          <span>Snapshot date {data.snapshot_date || '-'}</span>
        </div>
        {tab === 'Owners' ? <BucketTable rows={data.owners} mode="owner" /> : null}
        {tab === 'Collectives' ? <BucketTable rows={data.collectives} mode="collective" /> : null}
        {tab === 'Matrix' ? <BucketTable rows={data.owner_collectives} mode="matrix" /> : null}
        {tab === 'Stages' ? <BucketTable rows={data.stages} mode="stage" /> : null}
        {tab === 'Deals' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Deal</th><th>Owner</th><th>Collective</th><th>Stage</th><th>Status</th><th>Value</th><th>Next Activity</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {data.recent_deals.map((deal) => (
                  <tr key={deal.id}>
                    <td><strong>{deal.title}</strong><small>#{deal.id}</small></td>
                    <td>{deal.owner}</td>
                    <td>{deal.collective}</td>
                    <td>{deal.stage}</td>
                    <td><StatusPill status={deal.status} /></td>
                    <td>{currency(deal.value)}</td>
                    <td>{deal.next_activity_date || '-'}</td>
                    <td>{dateTime(deal.update_time || deal.add_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  )
}
