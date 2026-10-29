import React, { useEffect, useState } from 'react'
import { backend } from './wmill'
import './index.css'

type Summary = {
  active_workflows: number
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  avg_runtime_seconds: number
  time_saved_hours: number
}

type Workflow = {
  workflow_name: string
  workflow_path: string
  workflow_kind: string
  trigger_type: string
  category: string
  owner: string
  criticality: string
  expected_run_frequency?: string
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  avg_runtime_seconds: number
  time_saved_hours: number
  last_run_at?: string
  last_success_at?: string
  last_failure_at?: string
  latest_error?: string
  consecutive_failures: number
  health_status: string
}

type Failure = {
  job_id: string
  failed_at: string
  workflow_name: string
  workflow_path: string
  error_message?: string
  duration_seconds: number
}

type BusinessMetric = {
  detail: string
  count: number
  source: string
}

type Trend = {
  metric_date: string
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  avg_runtime_seconds: number
  time_saved_hours: number
}

type DashboardData = {
  ready: boolean
  message?: string
  metric_date?: string
  start_date?: string
  summary: Summary
  workflows: Workflow[]
  failures: Failure[]
  business_metrics?: BusinessMetric[]
  trends?: Trend[]
}

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00+05:30`)
}

function addDays(value: string, days: number) {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function daysBetween(start: string, end: string) {
  const ms = parseDate(end).getTime() - parseDate(start).getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseDate(value))
}

function formatDateInputLabel(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}-${month}-${year}`
}

function monthTitle(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    year: 'numeric',
  }).format(parseDate(value))
}

function formatDateTime(value?: string) {
  if (!value) return 'No run'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function pct(value: unknown) {
  return `${numberValue(value).toFixed(1)}%`
}

function runtime(value: unknown) {
  const seconds = numberValue(value)
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${(seconds / 60).toFixed(1)}m`
}

function shortDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  }).format(parseDate(value))
}

function textValue(value?: string) {
  return value && String(value).trim() ? value : 'None'
}

function healthClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, '-')
}

const presets = [
  { label: 'Today', getRange: () => ({ start: today(), end: today() }) },
  { label: 'Yesterday', getRange: () => {
    const day = addDays(today(), -1)
    return { start: day, end: day }
  } },
  { label: 'Today and yesterday', getRange: () => ({ start: addDays(today(), -1), end: today() }) },
  { label: 'Last 7 days', getRange: () => ({ start: addDays(today(), -6), end: today() }) },
  { label: 'Last 14 days', getRange: () => ({ start: addDays(today(), -13), end: today() }) },
  { label: 'Last 28 days', getRange: () => ({ start: addDays(today(), -27), end: today() }) },
  { label: 'Last 30 days', getRange: () => ({ start: addDays(today(), -29), end: today() }) },
]

const emptyData: DashboardData = {
  ready: false,
  summary: {
    active_workflows: 0,
    total_runs: 0,
    successful_runs: 0,
    failed_runs: 0,
    success_rate: 0,
    avg_runtime_seconds: 0,
    time_saved_hours: 0,
  },
  workflows: [],
  failures: [],
}

const App = () => {
  const initialEnd = today()
  const initialStart = addDays(initialEnd, -29)
  const [rangeStart, setRangeStart] = useState(initialStart)
  const [rangeEnd, setRangeEnd] = useState(initialEnd)
  const [pendingStart, setPendingStart] = useState(initialStart)
  const [pendingEnd, setPendingEnd] = useState(initialEnd)
  const [activePreset, setActivePreset] = useState('Last 30 days')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [liveRefresh, setLiveRefresh] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')

  const rangeDays = daysBetween(rangeStart, rangeEnd)
  const metricDate = rangeEnd
  const rangeLabel = `${activePreset}: ${formatDateLabel(rangeStart)} - ${formatDateLabel(rangeEnd)}`

  async function collectRange(collectAllDays: boolean) {
    if (!collectAllDays) {
      await backend.collect_workflow_metrics({
        metric_date: rangeEnd,
        timezone: 'Asia/Kolkata',
      })
      return
    }

    for (let index = 0; index < rangeDays; index += 1) {
      await backend.collect_workflow_metrics({
        metric_date: addDays(rangeStart, index),
        timezone: 'Asia/Kolkata',
      })
    }
  }

  async function load({ silent = false, collectAllDays = true } = {}) {
    if (!silent) setLoading(true)
    setError('')
    try {
      await collectRange(collectAllDays)
      const result = await backend.get_dashboard_metrics({
        metric_date: rangeEnd,
        days: rangeDays,
        timezone: 'Asia/Kolkata',
      }) as DashboardData
      setData(result)
      setLastUpdated(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [rangeStart, rangeEnd])

  useEffect(() => {
    if (!liveRefresh || rangeEnd !== today()) return
    const timer = window.setInterval(() => {
      load({ silent: true, collectAllDays: false })
    }, 60000)
    return () => window.clearInterval(timer)
  }, [liveRefresh, rangeStart, rangeEnd])

  function choosePreset(label: string) {
    const preset = presets.find((item) => item.label === label)
    if (!preset) return
    const next = preset.getRange()
    setPendingStart(next.start)
    setPendingEnd(next.end)
    setActivePreset(label)
  }

  function updateRange() {
    const start = pendingStart <= pendingEnd ? pendingStart : pendingEnd
    const end = pendingStart <= pendingEnd ? pendingEnd : pendingStart
    setRangeStart(start)
    setRangeEnd(end)
    setPickerOpen(false)
  }

  const summaryCards = [
    ['Active workflows', data.summary.active_workflows],
    ['Executions', data.summary.total_runs],
    ['Successful', data.summary.successful_runs],
    ['Success rate', pct(data.summary.success_rate)],
    ['Failures', data.summary.failed_runs],
    ['Avg runtime', runtime(data.summary.avg_runtime_seconds)],
  ]

  const sortedWorkflows = [...data.workflows].sort((left, right) => {
    const leftHasRuns = numberValue(left.total_runs) > 0
    const rightHasRuns = numberValue(right.total_runs) > 0
    if (leftHasRuns !== rightHasRuns) return leftHasRuns ? -1 : 1
    return 0
  })
  const performanceRows = sortedWorkflows.filter((workflow) => {
    return statusFilter === 'All' || workflow.health_status === statusFilter
  })

  const metricRows = data.business_metrics || []
  const metricCount = (detail: string) => numberValue(metricRows.find((row) => row.detail === detail)?.count)
  const typeformLeads = metricCount('Typeform leads')
  const webinarProcessed = metricCount('Webinar bookings')
  const oneOnOneProcessed = metricCount('1on1 prebook processed')
  const oneOnOneSent = metricCount('1on1 delivery sent')
  const oneOnOneFailed = metricCount('1on1 delivery failed')
  const webinarFailed = metricCount('Webinar delivery failed')
  const whatsappFailed = oneOnOneFailed + webinarFailed
  const unroutedLeads = Math.max(0, typeformLeads - webinarProcessed - oneOnOneProcessed)
  const leadRoutingTotal = Math.max(webinarProcessed + oneOnOneProcessed + unroutedLeads, 1)
  const webinarPct = (webinarProcessed / leadRoutingTotal) * 100
  const oneOnOnePct = (oneOnOneProcessed / leadRoutingTotal) * 100
  const unroutedPct = (unroutedLeads / leadRoutingTotal) * 100
  const leadDonut = `conic-gradient(var(--forest-3) 0 ${webinarPct}%, var(--gold) ${webinarPct}% ${webinarPct + oneOnOnePct}%, var(--sand) ${webinarPct + oneOnOnePct}% ${webinarPct + oneOnOnePct + unroutedPct}%, var(--line) ${webinarPct + oneOnOnePct + unroutedPct}% 100%)`
  const deliveryTotal = Math.max(oneOnOneProcessed, oneOnOneSent + oneOnOneFailed, 1)
  const healthCounts = data.workflows.reduce((counts, workflow) => {
    const key = workflow.health_status || 'No runs'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {} as Record<string, number>)
  const topWorkflows = [...data.workflows]
    .filter((workflow) => numberValue(workflow.total_runs) > 0)
    .sort((left, right) => numberValue(right.total_runs) - numberValue(left.total_runs))
    .slice(0, 5)
  const maxTopRuns = Math.max(1, ...topWorkflows.map((workflow) => numberValue(workflow.total_runs)))
  const businessCards = [
    ['Typeform leads', typeformLeads],
    ['Webinar bookings', webinarProcessed],
    ['1on1 prebook', oneOnOneProcessed],
    ['WhatsApp failed', whatsappFailed],
  ]
  const statusFilters = ['All', 'Healthy', 'Warning', 'Failing', 'No runs']
  const failureGroups = Object.values(
    data.failures.reduce((acc, failure) => {
      const key = failure.workflow_path
      if (!acc[key]) {
        acc[key] = {
          workflow_name: failure.workflow_name,
          workflow_path: failure.workflow_path,
          count: 0,
          latest_at: failure.failed_at,
          latest_error: failure.error_message || '',
        }
      }
      acc[key].count += 1
      if (String(failure.failed_at) > String(acc[key].latest_at)) {
        acc[key].latest_at = failure.failed_at
        acc[key].latest_error = failure.error_message || ''
      }
      return acc
    }, {} as Record<string, { workflow_name: string; workflow_path: string; count: number; latest_at: string; latest_error: string }>),
  ).sort((left, right) => right.count - left.count)

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <span>Beforest Automation Monitor</span>
          <span>{lastUpdated ? `refreshed ${formatDateTime(lastUpdated)}` : 'waiting for data'}</span>
        </header>

        <section className="prompt">
          <code>automations --window {rangeStart}..{rangeEnd}</code>
          <h1>Automation Performance Dashboard</h1>
          <p>
            {data.summary.active_workflows} active workflows observed across {data.summary.total_runs} executions
          </p>
        </section>

        <form className="controls" onSubmit={(event) => {
          event.preventDefault()
          load()
        }}>
          {lastUpdated ? (
            <div className="refresh-badge">
              <span>Last refreshed</span>
              <strong>{formatDateTime(lastUpdated)}</strong>
            </div>
          ) : null}
          <label className="live-toggle">
            <input
              type="checkbox"
              checked={liveRefresh}
              onChange={(event) => setLiveRefresh(event.target.checked)}
              disabled={rangeEnd !== today()}
            />
            Live
          </label>
          <div className="date-range-control">
            <button
              className="date-range-button"
              type="button"
              onClick={() => {
                setPendingStart(rangeStart)
                setPendingEnd(rangeEnd)
                setPickerOpen(!pickerOpen)
              }}
            >
              <span className="date-icon">Date</span>
              {rangeLabel}
              <span className="chevron">v</span>
            </button>
            {pickerOpen ? (
              <div className="date-popover">
                <aside className="preset-list">
                  <strong>Recently used</strong>
                  {presets.slice(0, 3).map((preset) => (
                    <button key={`recent-${preset.label}`} className={`preset ${activePreset === preset.label ? 'selected' : ''}`} type="button" onClick={() => choosePreset(preset.label)}>
                      <span />
                      {preset.label}
                    </button>
                  ))}
                  <hr />
                  {presets.map((preset) => (
                    <button key={preset.label} className={`preset ${activePreset === preset.label ? 'selected' : ''}`} type="button" onClick={() => choosePreset(preset.label)}>
                      <span />
                      {preset.label}
                    </button>
                  ))}
                </aside>
                <section className="range-panel">
                  <div className="range-title">
                    <strong>{activePreset}</strong>
                    <span>{formatDateLabel(pendingStart)} - {formatDateLabel(pendingEnd)}</span>
                  </div>
                  <div className="month-pair">
                    {[pendingStart, pendingEnd].map((month, monthIndex) => {
                      const first = `${month.slice(0, 8)}01`
                      const offset = parseDate(first).getDay()
                      const daysInMonth = new Date(parseDate(first).getFullYear(), parseDate(first).getMonth() + 1, 0).getDate()
                      return (
                        <div className="month" key={`${month}-${monthIndex}`}>
                          <div className="month-heading">{monthTitle(first)}</div>
                          <div className="weekdays">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
                          </div>
                          <div className="calendar-grid">
                            {Array.from({ length: offset }).map((_, index) => <i key={`blank-${index}`} />)}
                            {Array.from({ length: daysInMonth }).map((_, index) => {
                              const day = String(index + 1).padStart(2, '0')
                              const value = `${first.slice(0, 8)}${day}`
                              const inRange = value >= pendingStart && value <= pendingEnd
                              const isEdge = value === pendingStart || value === pendingEnd
                              return (
                                <button key={value} className={`${inRange ? 'in-range' : ''} ${isEdge ? 'edge' : ''}`} type="button" onClick={() => {
                                  const fromStart = Math.abs(parseDate(value).getTime() - parseDate(pendingStart).getTime())
                                  const fromEnd = Math.abs(parseDate(value).getTime() - parseDate(pendingEnd).getTime())
                                  if (fromStart < fromEnd) setPendingStart(value)
                                  else setPendingEnd(value)
                                  setActivePreset('Custom range')
                                }}>
                                  {index + 1}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="range-fields">
                    <label className="date-field-shell">
                      <input type="date" value={pendingStart} aria-label="Start date" onChange={(event) => {
                        setPendingStart(event.target.value)
                        setActivePreset('Custom range')
                      }} />
                      <span>{formatDateInputLabel(pendingStart)}</span>
                    </label>
                    <span>-</span>
                    <label className="date-field-shell">
                      <input type="date" value={pendingEnd} aria-label="End date" onChange={(event) => {
                        setPendingEnd(event.target.value)
                        setActivePreset('Custom range')
                      }} />
                      <span>{formatDateInputLabel(pendingEnd)}</span>
                    </label>
                  </div>
                  <div className="range-footer">
                    <span>Dates are shown in Kolkata Time</span>
                    <div>
                      <button type="button" className="secondary" onClick={() => setPickerOpen(false)}>Cancel</button>
                      <button type="button" onClick={updateRange}>Update</button>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </form>

      {error ? <div className="notice error">{error}</div> : null}
      {!data.ready && !loading ? (
        <div className="notice">
          {data.message || 'Run the collector once to create dashboard metrics.'}
        </div>
      ) : null}

      <section className="summary-grid">
        {summaryCards.map(([label, value]) => (
          <article className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="insight-grid">
        <article className="insight-card lead-card">
          <div className="insight-heading">
            <h2><span>01A</span> Lead Routing</h2>
            <strong>{typeformLeads}</strong>
          </div>
          <div className="donut-wrap">
            <div className="donut-chart" style={{ background: leadDonut }}>
              <div>
                <strong>{leadRoutingTotal}</strong>
                <span>routed</span>
              </div>
            </div>
          </div>
          <div className="chart-legend">
            <span><i className="webinar" /> Webinar {webinarProcessed}</span>
            <span><i className="one-on-one" /> 1on1 {oneOnOneProcessed}</span>
            {unroutedLeads ? <span><i className="unrouted" /> Other {unroutedLeads}</span> : null}
          </div>
        </article>

        <article className="insight-card delivery-card">
          <div className="insight-heading">
            <h2><span>01B</span> 1on1 Delivery</h2>
            <strong>{oneOnOneProcessed}</strong>
          </div>
          <div className="delivery-strip">
            <i className="sent" style={{ width: `${Math.min(100, (oneOnOneSent / deliveryTotal) * 100)}%` }} />
            <i className="failed" style={{ width: `${Math.min(100, (oneOnOneFailed / deliveryTotal) * 100)}%` }} />
          </div>
          <div className="delivery-outcomes">
            <div><span>Sent</span><strong>{oneOnOneSent}</strong></div>
            <div><span>Failed</span><strong>{oneOnOneFailed}</strong></div>
          </div>
        </article>

        <article className="insight-card health-card">
          <div className="insight-heading">
            <h2><span>01C</span> Workflow Health</h2>
            <strong>{data.workflows.length}</strong>
          </div>
          <div className="health-grid">
            {['Healthy', 'Warning', 'Failing', 'No runs'].map((status) => (
              <div className={`health-tile ${healthClass(status)}`} key={status}>
                <span>{status}</span>
                <strong>{healthCounts[status] || 0}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="insight-card top-workflows-card">
          <div className="insight-heading">
            <h2><span>02A</span> Top Workflows by Runs</h2>
            <strong>{topWorkflows.length}</strong>
          </div>
          <div className="top-workflow-list">
            {topWorkflows.map((workflow) => (
              <div className="top-workflow-row" key={workflow.workflow_path}>
                <span>{workflow.workflow_name}</span>
                <b>{workflow.total_runs}</b>
                <i><em style={{ width: `${Math.max(5, (numberValue(workflow.total_runs) / maxTopRuns) * 100)}%` }} /></i>
              </div>
            ))}
            {!topWorkflows.length ? <div className="empty">No workflow runs available.</div> : null}
          </div>
        </article>

        <article className="insight-card business-card-panel">
          <div className="insight-heading">
            <h2><span>02B</span> Business Snapshot</h2>
            <strong>{metricRows.length}</strong>
          </div>
          <div className="business-card-grid">
            {businessCards.map(([label, value]) => (
              <div className="business-mini-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2><span>01</span> Workflow Performance</h2>
          <span>{performanceRows.length} of {data.workflows.length} active</span>
        </div>
        <div className="table-toolbar">
          {statusFilters.map((status) => (
            <button
              type="button"
              className={`filter-chip ${statusFilter === status ? 'selected' : ''}`}
              key={status}
              onClick={() => setStatusFilter(status)}
            >
              {status}
              <span>{status === 'All' ? data.workflows.length : healthCounts[status] || 0}</span>
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Kind</th>
                <th>Trigger</th>
                <th>Category</th>
                <th>Owner</th>
                <th>Criticality</th>
                <th>Expected frequency</th>
                <th>Status</th>
                <th>Runs</th>
                <th>Success</th>
                <th>Failed</th>
                <th>Success rate</th>
                <th>Avg runtime</th>
                <th>Last run</th>
                <th>Last success</th>
                <th>Last failure</th>
                <th>Consecutive failures</th>
                <th>Latest error</th>
              </tr>
            </thead>
            <tbody>
              {performanceRows.map((workflow) => (
                <tr key={workflow.workflow_path}>
                  <td>
                    <div className="workflow-name">{workflow.workflow_name}</div>
                    <div className="workflow-path">{workflow.workflow_path}</div>
                  </td>
                  <td>{workflow.workflow_kind}</td>
                  <td>{workflow.trigger_type}</td>
                  <td>{workflow.category}</td>
                  <td>{workflow.owner}</td>
                  <td>
                    <span className={`priority ${workflow.criticality.toLowerCase()}`}>
                      {workflow.criticality}
                    </span>
                  </td>
                  <td>{textValue(workflow.expected_run_frequency)}</td>
                  <td>
                    <span className={`status ${healthClass(workflow.health_status)}`}>
                      {workflow.health_status}
                    </span>
                  </td>
                  <td>{workflow.total_runs}</td>
                  <td>{workflow.successful_runs}</td>
                  <td>{workflow.failed_runs}</td>
                  <td>{pct(workflow.success_rate)}</td>
                  <td>{runtime(workflow.avg_runtime_seconds)}</td>
                  <td>{formatDateTime(workflow.last_run_at)}</td>
                  <td>{formatDateTime(workflow.last_success_at)}</td>
                  <td>{formatDateTime(workflow.last_failure_at)}</td>
                  <td>{workflow.consecutive_failures}</td>
                  <td className="error-cell">{textValue(workflow.latest_error)}</td>
                </tr>
              ))}
              {!performanceRows.length ? (
                <tr>
                  <td colSpan={18} className="empty">No workflows match this filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="split">
        <div className="section">
          <div className="section-heading">
            <h2><span>02</span> Failures</h2>
            <span>
              {data.start_date || 'Range start'} to {data.metric_date || metricDate}
            </span>
          </div>
          <div className="failure-list">
            {failureGroups.map((failure) => (
              <article className="failure" key={failure.workflow_path}>
                <div>
                  <strong>{failure.workflow_name}</strong>
                  <span>{failure.count} run{failure.count === 1 ? '' : 's'} failed</span>
                </div>
                <p>{failure.latest_error || 'No error message captured.'}</p>
                <code>Latest failure: {formatDateTime(failure.latest_at)}</code>
              </article>
            ))}
            {!failureGroups.length ? (
              <div className="empty panel quote">
                <strong>When every flow runs without failure, it's no longer automation - it becomes rhythm.</strong>
              </div>
            ) : null}
          </div>
        </div>

        <div className="section">
          <div className="section-heading">
            <h2><span>03</span> Business Metrics</h2>
            <span>{rangeLabel}</span>
          </div>
          <div className="business-table">
            <table>
              <thead>
                <tr>
                  <th>Detail</th>
                  <th>Count</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {metricRows.map((row) => (
                  <tr key={row.detail}>
                    <td>{row.detail}</td>
                    <td className="business-count">{numberValue(row.count)}</td>
                    <td>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      </div>
    </main>
  )
}

export default App
