import React, { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './wmill'
import './index.css'

type Summary = {
  total_tasks: number
  open_tasks: number
  in_progress_tasks: number
  closed_tasks: number
  cancelled_tasks: number
  weighted_score: number
  progress_percent: number
}

type MonthRow = { month: string; label: string; task_count: number }
type TrendRow = Summary & { month: string; label: string }
type OwnerRow = Summary & { owner_name: string }

type TaskRow = {
  id: string
  title: string
  project_name: string
  owner_name: string
  status: string
  status_group: string
  task_month: string
  due_date?: string
  start_date?: string
  percent_complete?: number
  tags?: string[]
}

type DashboardData = {
  ok: boolean
  generated_at: string
  selected_month: string
  selected_owner: string
  selected_status: string
  weights: { open: number; in_progress: number; closed: number }
  summary: Summary
  months: MonthRow[]
  owners: OwnerRow[]
  owner_options: string[]
  status_options: string[]
  trend: TrendRow[]
  tasks: TaskRow[]
}

const fmt = new Intl.NumberFormat('en-IN')
const DASHBOARD_PASSCODE = 'Beforest@internal'
const FIRST_DASHBOARD_MONTH = '2026-04'
const SEEDED_2026_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']
const tabs = ['Overview', 'Owners', 'Tasks', 'Glossary']

const glossary = [
  ['Month Tag', 'The dashboard reads month tags such as April 2026, Apr 2026, or 2026-04. If no month tag is found, it falls back to due date, start date, then created date.'],
  ['Open Weight', 'Open tasks count at 1.5 points because they are planned but not moving yet.'],
  ['In Progress Weight', 'In-progress tasks count at 5 points because execution has started.'],
  ['Closed Weight', 'Closed or done tasks count at 10 points because they represent completed work.'],
  ['Monthly Progress', 'Progress percent is weighted score divided by total possible score, where every non-cancelled task can earn up to 10 points.'],
  ['Cancelled Tasks', 'Cancelled tasks are shown separately and excluded from the progress percentage.'],
]

function compact(value: unknown) {
  return fmt.format(Math.round(Number(value || 0)))
}

function pct(value: unknown) {
  return `${Number(value || 0).toFixed(1)}%`
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

function monthLabel(month?: string) {
  if (!month) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${month}-01T00:00:00+05:30`))
}

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return year && month ? `${year}-${month}` : FIRST_DASHBOARD_MONTH
}

function statusLabel(status: string) {
  if (status === 'All Statuses') return 'All Statuses'
  if (status === 'in_progress') return 'In Progress'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function Metric({ label, value, note, tone = '' }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)))
  return (
    <div className="progress-card">
      <div className="progress-copy">
        <span>{label}</span>
        <strong>{pct(safeValue)}</strong>
      </div>
      <div className="progress-track" aria-label={`${label}: ${pct(safeValue)}`}>
        <i style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}

function TrendChart({ rows }: { rows: TrendRow[] }) {
  const visibleRows = rows.slice(-12)
  return (
    <div className="trend-chart">
      {visibleRows.map((row) => (
        <article key={row.month}>
          <div className="trend-bar">
            <i style={{ height: `${Math.max(4, Number(row.progress_percent || 0))}%` }} />
          </div>
          <b>{pct(row.progress_percent)}</b>
          <span>{row.label}</span>
        </article>
      ))}
      {!visibleRows.length ? <p className="empty">No month-tagged tasks from April 2026 onward yet.</p> : null}
    </div>
  )
}

function OwnerTable({ rows }: { rows: OwnerRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Owner</th>
            <th>Total</th>
            <th>Open</th>
            <th>In Progress</th>
            <th>Closed</th>
            <th>Cancelled</th>
            <th>Weighted Score</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.owner_name}>
              <td>{row.owner_name}</td>
              <td>{compact(row.total_tasks)}</td>
              <td>{compact(row.open_tasks)}</td>
              <td>{compact(row.in_progress_tasks)}</td>
              <td>{compact(row.closed_tasks)}</td>
              <td>{compact(row.cancelled_tasks)}</td>
              <td>{Number(row.weighted_score || 0).toFixed(1)}</td>
              <td><span className="tag progress-tag">{pct(row.progress_percent)}</span></td>
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={8}>No owner rows for this month.</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function TaskTable({ rows }: { rows: TaskRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Month</th>
            <th>Due</th>
            <th>Project</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="clip">{row.title}</td>
              <td>{row.owner_name || '-'}</td>
              <td><span className={`tag status-${row.status_group}`}>{row.status}</span></td>
              <td>{monthLabel(row.task_month)}</td>
              <td>{row.due_date || '-'}</td>
              <td>{row.project_name || '-'}</td>
              <td className="clip">{Array.isArray(row.tags) ? row.tags.join(', ') : '-'}</td>
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={7}>No tasks found for this month.</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

export default function App() {
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey())
  const [selectedOwner, setSelectedOwner] = useState('All Owners')
  const [selectedStatus, setSelectedStatus] = useState('All Statuses')
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(() => window.localStorage.getItem('beforest_task_intel_dashboard_unlocked') === 'true')
  const [activeTab, setActiveTab] = useState('Overview')
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load(month = selectedMonth, owner = selectedOwner, status = selectedStatus) {
    setLoading(true)
    setError('')
    try {
      const dashboard = await backend.fetch_dashboard({ month, owner, status })
      const parsed = dashboard as DashboardData
      setData(parsed)
      if (parsed.selected_month) setSelectedMonth(parsed.selected_month)
      if (parsed.selected_status) setSelectedStatus(parsed.selected_status)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isUnlocked) load()
  }, [isUnlocked])

  const monthOptions = useMemo(() => {
    const remoteMonths = data?.months?.map((row) => row.month) || []
    return Array.from(new Set([...SEEDED_2026_MONTHS, currentMonthKey(), ...remoteMonths])).sort()
  }, [data])

  const ownerOptions = useMemo(() => ['All Owners', ...(data?.owner_options || [])], [data])
  const statusOptions = useMemo(() => data?.status_options || ['All Statuses', 'open', 'in_progress', 'closed', 'cancelled'], [data])

  function submit(event: FormEvent) {
    event.preventDefault()
    load()
  }

  function unlockDashboard(event: FormEvent) {
    event.preventDefault()
    if (passcode.trim() === DASHBOARD_PASSCODE) {
      window.localStorage.setItem('beforest_task_intel_dashboard_unlocked', 'true')
      setIsUnlocked(true)
      setPasscodeError('')
      return
    }
    setPasscodeError('That passcode is not matching.')
  }

  const summary = data?.summary

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <span>Beforest Task Intelligence Monitor</span>
          <span>{data ? `refreshed ${dateTime(data.generated_at)}` : 'waiting for data'}</span>
        </header>

        <section className="prompt">
          <code>task_intelligence --month {selectedMonth}</code>
          <h1>Monthly Task Progress</h1>
          <p>April 2026 onward, scored by Open x 1.5, In Progress x 5, Closed x 10</p>
        </section>

        {!isUnlocked ? (
          <section className="access-panel">
            <span className="domain">beforest task intelligence</span>
            <h2>Enter Team Passcode</h2>
            <p>Open the monthly task progress dashboard.</p>
            <form onSubmit={unlockDashboard}>
              <label htmlFor="dashboard-passcode">Passcode</label>
              <div className="access-input">
                <input id="dashboard-passcode" type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoComplete="current-password" autoFocus />
                <button type="submit">Open</button>
              </div>
              {passcodeError ? <small>{passcodeError}</small> : null}
            </form>
          </section>
        ) : (
          <>
            <form className="controls monthly-controls" onSubmit={submit}>
              <label>Month
                <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                  {monthOptions.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
                </select>
              </label>
              <label>Owner
                <select value={selectedOwner} onChange={(event) => setSelectedOwner(event.target.value)}>
                  {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                </select>
              </label>
              <label>Status
                <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                  {statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                </select>
              </label>
              <span className="control-note">Only tasks from April 2026 onward are included. Month tags are preferred when available.</span>
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

            {data && summary && activeTab === 'Overview' ? (
              <>
                <section className="metrics-grid simple-metrics">
                  <Metric label="Monthly Total Tasks" value={compact(summary.total_tasks)} note={`${monthLabel(data.selected_month)} total, excluding cancelled`} tone="blue" />
                  <Metric label="In Progress" value={compact(summary.in_progress_tasks)} note={`Each task adds ${data.weights.in_progress} points`} tone="green" />
                  <Metric label="Closed" value={compact(summary.closed_tasks)} note={`Each task adds ${data.weights.closed} points`} tone="amber" />
                </section>

                <section className="panel">
                  <div className="section-head">
                    <h2>Monthly Progress</h2>
                    <span>{monthLabel(data.selected_month)} | {data.selected_owner} | {statusLabel(data.selected_status)}</span>
                  </div>
                  <ProgressBar value={summary.progress_percent} label="Weighted progress" />
                  <div className="snapshot-grid">
                    <Metric label="Open" value={compact(summary.open_tasks)} note={`Each task adds ${data.weights.open} points`} />
                    <Metric label="Weighted Score" value={Number(summary.weighted_score || 0).toFixed(1)} note={`Max score ${compact(summary.total_tasks * 10)}`} />
                    <Metric label="Cancelled" value={compact(summary.cancelled_tasks)} note="Shown separately, excluded from progress" tone="pink" />
                  </div>
                </section>

                <section className="panel">
                  <div className="section-head">
                    <h2>Monthly Trend</h2>
                    <span>April 2026 onward</span>
                  </div>
                  <TrendChart rows={data.trend} />
                </section>
              </>
            ) : null}

            {data && activeTab === 'Owners' ? (
              <section className="panel">
                <div className="section-head">
                  <h2>Owner-wise Progress</h2>
                  <span>{monthLabel(data.selected_month)}</span>
                </div>
                <OwnerTable rows={data.owners} />
              </section>
            ) : null}

            {data && activeTab === 'Tasks' ? (
              <section className="panel">
                <div className="section-head">
                  <h2>Monthly Tasks</h2>
                  <span>{monthLabel(data.selected_month)} | {data.selected_owner}</span>
                </div>
                <TaskTable rows={data.tasks} />
              </section>
            ) : null}

            {activeTab === 'Glossary' ? (
              <section className="panel docs-panel">
                <div className="section-head">
                  <h2>Glossary</h2>
                  <span>metric source of truth</span>
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
