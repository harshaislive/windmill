import React, { useEffect, useMemo, useState } from 'react'
import { backend } from './wmill'
import './index.css'

type WorkflowRow = {
  workflow_path: string
  calls: number
  runs: number
  tokens_spent: number
  failed_calls: number
  avg_latency_ms: number
  tokens_per_run: number
  calls_per_run: number
  failure_rate: number
}

type EndpointRow = {
  method: string
  normalized_endpoint: string
  count: number
  tokens_spent: number
  cost_per_call: number
  avg_latency_ms: number
  success_rate: number
  rate_limit_hits: number
}

type ErrorRow = {
  timestamp: string
  workflow_path: string
  method: string
  normalized_endpoint: string
  status_code?: number
  error_message?: string
  tokens_spent: number
}

type RateLimitRow = {
  run_id: string
  workflow_path: string
  method: string
  normalized_endpoint: string
  signal_calls: number
  actual_429_calls: number
  retry_after_calls: number
  low_remaining_calls: number
  first_seen: string
  last_seen: string
}

type DuplicateRow = {
  workflow_path: string
  method: string
  normalized_endpoint: string
  request_fingerprint: string
  calls: number
  tokens_spent: number
  first_seen: string
  last_seen: string
}

type HeavyRunRow = {
  run_id: string
  workflow_path: string
  calls: number
  tokens_spent: number
  failed_calls: number
  started_at: string
  last_seen: string
}

type RunEndpointRow = {
  run_id: string
  workflow_path: string
  method: string
  normalized_endpoint: string
  calls: number
  cost_per_call: number
  tokens_spent: number
  first_seen: string
  last_seen: string
  unique_fingerprints: number
}

type RunEndpointGroup = {
  workflow_path: string
  rows: RunEndpointRow[]
  calls: number
  tokens_spent: number
  endpoint_count: number
  latest_seen: string
}

type OptimizationInsight = {
  finding: string
  workflow_path: string
  run_id?: string
  normalized_endpoint?: string
  calls: number
  tokens_spent: number
  suggestion: string
}

type DashboardData = {
  ok: boolean
  ready: boolean
  message?: string
  generated_at: string
  window: { start_date: string; end_date: string; timezone: string }
  totals: {
    calls: number
    failed_calls: number
    actual_429_calls: number
    rate_limit_warnings: number
    tokens_spent: number
    avg_latency_ms: number
    success_rate: number
    top_workflow: { workflow_path: string; tokens_spent: number; calls: number } | null
  }
  daily_tokens: Array<{ date: string; tokens: number; calls: number; failed_calls: number }>
  workflows: WorkflowRow[]
  endpoints: EndpointRow[]
  recent_errors: ErrorRow[]
  rate_limit_events: RateLimitRow[]
  duplicate_fetches: DuplicateRow[]
  heavy_runs: HeavyRunRow[]
  run_endpoints: RunEndpointRow[]
  optimization_insights: OptimizationInsight[]
}

const fmt = new Intl.NumberFormat('en-IN')
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'runs', label: 'Runs' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'optimization', label: 'Optimization' },
]
const LIVE_REFRESH_MS = 300000

function tabFromHash() {
  const hash = window.location.hash.replace('#', '').toLowerCase()
  return tabs.some((tab) => tab.id === hash) ? hash : 'overview'
}

function isDashboardData(value: any): value is DashboardData {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.window &&
      value.totals &&
      Array.isArray(value.daily_tokens) &&
      Array.isArray(value.workflows) &&
      Array.isArray(value.endpoints) &&
      Array.isArray(value.recent_errors) &&
      Array.isArray(value.rate_limit_events) &&
      Array.isArray(value.duplicate_fetches) &&
      Array.isArray(value.heavy_runs) &&
      Array.isArray(value.run_endpoints) &&
      Array.isArray(value.optimization_insights),
  )
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Dashboard cache request timed out. Refresh the cache and try again.')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function isoDate(daysBack: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysBack)
  return date.toISOString().slice(0, 10)
}

function compact(value: unknown) {
  return fmt.format(Math.round(Number(value || 0)))
}

function decimal(value: unknown) {
  return Number(value || 0).toFixed(1)
}

function pct(value: unknown) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

function timestampValue(value?: string) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function groupRunEndpointsByWorkflow(rows: RunEndpointRow[]): RunEndpointGroup[] {
  const groups = new Map<string, RunEndpointRow[]>()
  rows.forEach((row) => {
    const current = groups.get(row.workflow_path) || []
    current.push(row)
    groups.set(row.workflow_path, current)
  })

  return Array.from(groups.entries())
    .map(([workflow_path, groupRows]) => {
      const sortedRows = [...groupRows].sort((a, b) => {
        const latestOrder = timestampValue(b.last_seen) - timestampValue(a.last_seen)
        if (latestOrder !== 0) return latestOrder
        if (b.tokens_spent !== a.tokens_spent) return b.tokens_spent - a.tokens_spent
        return b.calls - a.calls
      })
      const endpointKeys = new Set(sortedRows.map((row) => `${row.method}-${row.normalized_endpoint}`))
      return {
        workflow_path,
        rows: sortedRows,
        calls: sortedRows.reduce((sum, row) => sum + Number(row.calls || 0), 0),
        tokens_spent: sortedRows.reduce((sum, row) => sum + Number(row.tokens_spent || 0), 0),
        endpoint_count: endpointKeys.size,
        latest_seen: sortedRows[0]?.last_seen || '',
      }
    })
    .sort((a, b) => {
      const latestOrder = timestampValue(b.latest_seen) - timestampValue(a.latest_seen)
      if (latestOrder !== 0) return latestOrder
      return b.tokens_spent - a.tokens_spent
    })
}

function dateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function endpointLabel(method: string, endpoint: string) {
  const prefix = `${method} `
  return endpoint.startsWith(prefix) ? endpoint.slice(prefix.length) : endpoint
}

function shortDate(value?: string) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00+05:30`)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function sampleData(startDate: string, endDate: string): DashboardData {
  const workflows: WorkflowRow[] = [
    { workflow_path: 'f/sales/typeform_to_pipedrive_intake', calls: 186, runs: 42, tokens_spent: 2180, failed_calls: 3, avg_latency_ms: 412, tokens_per_run: 51.9, calls_per_run: 4.4, failure_rate: 0.016 },
    { workflow_path: 'f/sales/send_1on1_reminders', calls: 124, runs: 31, tokens_spent: 1430, failed_calls: 1, avg_latency_ms: 358, tokens_per_run: 46.1, calls_per_run: 4.0, failure_rate: 0.008 },
    { workflow_path: 'f/sales/map_deal_product_from_collective', calls: 94, runs: 18, tokens_spent: 950, failed_calls: 0, avg_latency_ms: 291, tokens_per_run: 52.8, calls_per_run: 5.2, failure_rate: 0 },
  ]
  const endpoints: EndpointRow[] = [
    { method: 'GET', normalized_endpoint: '/api/v2/deals/search', count: 74, tokens_spent: 1480, cost_per_call: 20, avg_latency_ms: 446, success_rate: 0.973, rate_limit_hits: 1 },
    { method: 'GET', normalized_endpoint: '/api/v1/deals/{id}/activities', count: 44, tokens_spent: 880, cost_per_call: 20, avg_latency_ms: 392, success_rate: 1, rate_limit_hits: 0 },
    { method: 'PATCH', normalized_endpoint: '/api/v2/deals/{id}', count: 61, tokens_spent: 305, cost_per_call: 5, avg_latency_ms: 338, success_rate: 0.984, rate_limit_hits: 0 },
    { method: 'POST', normalized_endpoint: '/api/v1/activities', count: 52, tokens_spent: 260, cost_per_call: 5, avg_latency_ms: 310, success_rate: 1, rate_limit_hits: 0 },
  ]
  return {
    ok: true,
    ready: false,
    message: 'Sample view shown locally. Windmill will populate live values from main/pipedrive_api_usage_events.',
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, timezone: 'Asia/Kolkata' },
    totals: {
      calls: 404,
      failed_calls: 4,
      actual_429_calls: 0,
      rate_limit_warnings: 1,
      tokens_spent: 4560,
      avg_latency_ms: 382,
      success_rate: 0.99,
      top_workflow: { workflow_path: workflows[0].workflow_path, tokens_spent: workflows[0].tokens_spent, calls: workflows[0].calls },
    },
    daily_tokens: [
      { date: isoDate(6), tokens: 520, calls: 44, failed_calls: 0 },
      { date: isoDate(5), tokens: 610, calls: 52, failed_calls: 1 },
      { date: isoDate(4), tokens: 480, calls: 39, failed_calls: 0 },
      { date: isoDate(3), tokens: 760, calls: 70, failed_calls: 0 },
      { date: isoDate(2), tokens: 695, calls: 61, failed_calls: 1 },
      { date: isoDate(1), tokens: 840, calls: 78, failed_calls: 1 },
      { date: isoDate(0), tokens: 655, calls: 60, failed_calls: 1 },
    ],
    workflows,
    endpoints,
    recent_errors: [
      { timestamp: new Date().toISOString(), workflow_path: 'f/sales/typeform_to_pipedrive_intake', method: 'GET', normalized_endpoint: '/api/v2/deals/search', status_code: 429, error_message: 'Rate limit warning from Pipedrive response.', tokens_spent: 20 },
    ],
    rate_limit_events: [
      { run_id: 'sample-run-1', workflow_path: workflows[0].workflow_path, method: 'GET', normalized_endpoint: 'GET /api/v2/deals/search', signal_calls: 1, actual_429_calls: 0, retry_after_calls: 1, low_remaining_calls: 0, first_seen: new Date().toISOString(), last_seen: new Date().toISOString() },
    ],
    duplicate_fetches: [
      { workflow_path: 'f/sales/send_1on1_reminders', method: 'GET', normalized_endpoint: '/api/v2/deals/{id}', request_fingerprint: 'deal:123', calls: 3, tokens_spent: 3, first_seen: new Date().toISOString(), last_seen: new Date().toISOString() },
    ],
    heavy_runs: [
      { run_id: 'sample-run-1', workflow_path: workflows[0].workflow_path, calls: 18, tokens_spent: 260, failed_calls: 1, started_at: new Date().toISOString(), last_seen: new Date().toISOString() },
    ],
    run_endpoints: [
      { run_id: 'sample-run-1', workflow_path: workflows[0].workflow_path, method: 'GET', normalized_endpoint: 'GET /api/v2/deals/search', calls: 8, cost_per_call: 20, tokens_spent: 160, first_seen: new Date().toISOString(), last_seen: new Date().toISOString(), unique_fingerprints: 1 },
    ],
    optimization_insights: [
      { finding: 'High token run', workflow_path: workflows[0].workflow_path, run_id: 'sample-run-1', calls: 18, tokens_spent: 260, suggestion: 'Most tokens came from repeated deal lookups in this run. Cache the first matched deal or switch to a narrower ID-based fetch before calling Pipedrive again.' },
    ],
  }
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

function TokenChart({ rows }: { rows: DashboardData['daily_tokens'] }) {
  const visibleRows = rows.slice(-14)
  const max = Math.max(1, ...visibleRows.map((row) => Number(row.tokens || 0)))
  return (
    <div className="chart-frame">
      <div className="axis-title">Y: Tokens spent</div>
      <div className="chart-body">
        <div className="y-axis" aria-hidden="true">
          <span>{compact(max)}</span>
          <span>{compact(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="spark" aria-label="Daily Pipedrive token usage chart">
          {visibleRows.map((row) => (
            <i
              key={row.date}
              title={`${row.date}: ${compact(row.tokens)} tokens, ${compact(row.calls)} calls`}
              style={{ height: `${Math.max(8, (Number(row.tokens || 0) / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="x-axis">
        <span>{shortDate(visibleRows[0]?.date)}</span>
        <b>X: Date</b>
        <span>{shortDate(visibleRows[visibleRows.length - 1]?.date)}</span>
      </div>
    </div>
  )
}

function WorkflowTable({ rows }: { rows: WorkflowRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Workflow</th>
            <th>Calls</th>
            <th>Runs</th>
            <th>Calls / Run</th>
            <th>Tokens</th>
            <th>Tokens / Run</th>
            <th>Failure</th>
            <th>Latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.workflow_path}>
              <td><b>{row.workflow_path}</b></td>
              <td>{compact(row.calls)}</td>
              <td>{compact(row.runs)}</td>
              <td>{decimal(row.calls_per_run)}</td>
              <td>{compact(row.tokens_spent)}</td>
              <td>{decimal(row.tokens_per_run)}</td>
              <td>{pct(row.failure_rate)}</td>
              <td>{compact(row.avg_latency_ms)} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EndpointTable({ rows }: { rows: EndpointRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Method</th>
            <th>Cost / Call</th>
            <th>Count</th>
            <th>Tokens</th>
            <th>Success</th>
            <th>Latency</th>
            <th>429</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.method}-${row.normalized_endpoint}`}>
              <td><b>{endpointLabel(row.method, row.normalized_endpoint)}</b></td>
              <td><span className="pill">{row.method}</span></td>
              <td>{decimal(row.cost_per_call)}</td>
              <td>{compact(row.count)}</td>
              <td>{compact(row.tokens_spent)}</td>
              <td>{pct(row.success_rate)}</td>
              <td>{compact(row.avg_latency_ms)} ms</td>
              <td>{compact(row.rate_limit_hits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ErrorTable({ rows }: { rows: ErrorRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Workflow</th>
            <th>Endpoint</th>
            <th>Status</th>
            <th>Tokens</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.timestamp}-${index}`}>
              <td>{dateTime(row.timestamp)}</td>
              <td><b>{row.workflow_path}</b></td>
              <td>{row.method} {endpointLabel(row.method, row.normalized_endpoint)}</td>
              <td>{row.status_code || '-'}</td>
              <td>{compact(row.tokens_spent)}</td>
              <td>{row.error_message || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DuplicateTable({ rows }: { rows: DuplicateRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Workflow</th>
            <th>Endpoint</th>
            <th>Fingerprint</th>
            <th>Calls</th>
            <th>Tokens</th>
            <th>First</th>
            <th>Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.workflow_path}-${row.request_fingerprint}`}>
              <td><b>{row.workflow_path}</b></td>
              <td>{row.method} {endpointLabel(row.method, row.normalized_endpoint)}</td>
              <td>{row.request_fingerprint}</td>
              <td>{compact(row.calls)}</td>
              <td>{compact(row.tokens_spent)}</td>
              <td>{dateTime(row.first_seen)}</td>
              <td>{dateTime(row.last_seen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeavyRuns({ rows }: { rows: HeavyRunRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Workflow</th>
            <th>Calls</th>
            <th>Tokens</th>
            <th>Failed</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.run_id}-${row.workflow_path}`}>
              <td>{row.run_id}</td>
              <td><b>{row.workflow_path}</b></td>
              <td>{compact(row.calls)}</td>
              <td>{compact(row.tokens_spent)}</td>
              <td>{compact(row.failed_calls)}</td>
              <td>{dateTime(row.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RunEndpointTable({ rows, groupByWorkflow = false }: { rows: RunEndpointRow[]; groupByWorkflow?: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Workflow</th>
            <th>Endpoint</th>
            <th>Calls</th>
            <th>Cost / Call</th>
            <th>Tokens</th>
            <th>First</th>
            <th>Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const showWorkflowGroup = groupByWorkflow && row.workflow_path !== rows[index - 1]?.workflow_path
            return (
              <React.Fragment key={`${row.run_id}-${row.workflow_path}-${row.normalized_endpoint}-${index}`}>
                {showWorkflowGroup ? (
                  <tr className="workflow-group">
                    <td colSpan={8}>{row.workflow_path}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>{row.run_id}</td>
                  <td><b>{row.workflow_path}</b></td>
                  <td>{row.method} {endpointLabel(row.method, row.normalized_endpoint)}</td>
                  <td>{compact(row.calls)}</td>
                  <td>{decimal(row.cost_per_call)}</td>
                  <td>{compact(row.tokens_spent)}</td>
                  <td>{dateTime(row.first_seen)}</td>
                  <td>{dateTime(row.last_seen)}</td>
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RunEndpointWorkflowGroups({ groups }: { groups: RunEndpointGroup[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function toggle(workflowPath: string) {
    setExpanded((current) => ({ ...current, [workflowPath]: !current[workflowPath] }))
  }

  return (
    <div className="run-groups">
      {groups.map((group) => {
        const isExpanded = Boolean(expanded[group.workflow_path])
        return (
          <section className="run-group" key={group.workflow_path}>
            <button
              type="button"
              className="workflow-summary"
              aria-expanded={isExpanded}
              onClick={() => toggle(group.workflow_path)}
            >
              <span className="workflow-name">{group.workflow_path}</span>
              <span>{compact(group.calls)} calls</span>
              <span>{compact(group.tokens_spent)} tokens</span>
              <span>{compact(group.endpoint_count)} endpoints</span>
              <span>Latest {dateTime(group.latest_seen)}</span>
              <b>{isExpanded ? 'Hide' : 'Show'}</b>
            </button>
            {isExpanded ? <RunEndpointTable rows={group.rows} /> : null}
          </section>
        )
      })}
    </div>
  )
}

function OptimizationTable({ rows }: { rows: OptimizationInsight[] }) {
  return (
    <div className="table-wrap">
      <table className="optimization-table">
        <thead>
          <tr>
            <th>Finding</th>
            <th>Workflow</th>
            <th>Run</th>
            <th>Calls</th>
            <th>Tokens</th>
            <th>Scope for Optimization</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.finding}-${row.run_id || index}`}>
              <td><b>{row.finding}</b></td>
              <td>{row.workflow_path}</td>
              <td>{row.run_id || '-'}</td>
              <td>{compact(row.calls)}</td>
              <td>{compact(row.tokens_spent)}</td>
              <td>{row.suggestion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RateLimitTable({ rows }: { rows: RateLimitRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Workflow</th>
            <th>Run</th>
            <th>Endpoint</th>
            <th>Signals</th>
            <th>Actual 429</th>
            <th>Retry-After</th>
            <th>Low Remaining</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.run_id}-${row.workflow_path}-${row.normalized_endpoint}-${index}`}>
              <td><b>{row.workflow_path}</b></td>
              <td>{row.run_id}</td>
              <td>{row.method} {endpointLabel(row.method, row.normalized_endpoint)}</td>
              <td>{compact(row.signal_calls)}</td>
              <td>{compact(row.actual_429_calls)}</td>
              <td>{compact(row.retry_after_calls)}</td>
              <td>{compact(row.low_remaining_calls)}</td>
              <td>{dateTime(row.last_seen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyRows({ label }: { label: string }) {
  return <div className="empty">{label}</div>
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => tabFromHash())
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState('')
  const [error, setError] = useState('')
  const [data, setData] = useState<DashboardData>(() => sampleData(isoDate(0), isoDate(0)))

  const topEndpoint = useMemo(() => data.endpoints[0], [data.endpoints])
  const workflowRunGroups = useMemo(() => groupRunEndpointsByWorkflow(data.run_endpoints), [data.run_endpoints])

  async function load() {
    const today = isoDate(0)
    const startDate = isoDate(6)
    setLoading(true)
    setError('')
    try {
      const payload = await withTimeout(backend.fetch_dashboard({ start_date: startDate, end_date: today }), 12000)
      if (isDashboardData(payload)) {
        setData(payload)
      } else {
        setError('Dashboard backend returned an unexpected payload. Showing the local sample view.')
        setData(sampleData(today, today))
      }
      setLastLoadedAt(new Date().toISOString())
    } catch (err: any) {
      setError(err?.message || 'Unable to load Windmill backend data. Showing local sample view.')
      setData(sampleData(today, today))
      setLastLoadedAt(new Date().toISOString())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const syncTab = () => setActiveTab(tabFromHash())
    window.addEventListener('hashchange', syncTab)
    return () => window.removeEventListener('hashchange', syncTab)
  }, [])

  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => {
      load()
    }, LIVE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [live])

  return (
    <main>
      <section className="shell">
        <div className="topbar">
          <span>Beforest / Sales Ops</span>
          <span>{data.ready ? `Generated ${dateTime(data.generated_at)}` : 'Telemetry setup pending'} / {live ? 'Live' : 'Paused'}</span>
        </div>
        <header className="prompt">
          <code>PIPEDRIVE TOKEN WATCH</code>
          <h1>Pipedrive API Usage Dashboard</h1>
          <p>Track Pipedrive API usage by workflow run, endpoint, call count, token cost, and optimization scope.</p>
        </header>

        <div className="controls">
          <div className="control-note">
            Live window: Today, {shortDate(data.window.end_date)} / {data.window.timezone}
            <br />
            Last app refresh: {lastLoadedAt ? dateTime(lastLoadedAt) : '-'}
          </div>
          <button type="button" className={live ? 'live-toggle active' : 'live-toggle'} onClick={() => setLive((value) => !value)}>
            {live ? 'Live On' : 'Live Off'}
          </button>
          <button type="button" disabled={loading} onClick={() => load()}>{loading ? 'Loading' : 'Refresh'}</button>
        </div>

        <nav className="tabbar" aria-label="Dashboard sections">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              href={`#${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </a>
          ))}
        </nav>

        {error ? <div className="error">{error}</div> : null}
        {data.message ? <div className="notice">{data.message}</div> : null}

        {activeTab === 'overview' ? (
          <>
            <section className="metrics-grid">
              <Metric label="Total Calls" value={compact(data.totals.calls)} note="Pipedrive requests logged" tone="blue" />
              <Metric label="Tokens Spent" value={compact(data.totals.tokens_spent)} note="Calculated from endpoint cost map" tone="green" />
              <Metric label="Failed Calls" value={compact(data.totals.failed_calls)} note={`${pct(1 - data.totals.success_rate)} failure rate`} tone="pink" />
              <Metric label="Actual 429" value={compact(data.totals.actual_429_calls)} note={`${compact(data.totals.rate_limit_warnings)} rate limit signals`} tone="amber" />
              <Metric label="Top Workflow" value={data.totals.top_workflow ? compact(data.totals.top_workflow.tokens_spent) : '0'} note={data.totals.top_workflow?.workflow_path || 'No workflow data'} tone="violet" />
              <Metric label="Top Endpoint" value={topEndpoint ? compact(topEndpoint.tokens_spent) : '0'} note={topEndpoint ? `${topEndpoint.method} ${endpointLabel(topEndpoint.method, topEndpoint.normalized_endpoint)}` : 'No endpoint data'} tone="amber" />
            </section>

            <section className="split">
              <div className="panel">
                <div className="section-head">
                  <h2>Daily Token Burn</h2>
                  <span>{compact(data.totals.tokens_spent)} tokens</span>
                </div>
                <TokenChart rows={data.daily_tokens} />
              </div>
              <div className="panel">
                <div className="section-head">
                  <h2>Heaviest Run Endpoints</h2>
                  <span>run &gt; workflow &gt; endpoint &gt; tokens</span>
                </div>
                {data.run_endpoints.length ? <RunEndpointTable rows={data.run_endpoints.slice(0, 8)} /> : <EmptyRows label="No run endpoint usage logged yet." />}
              </div>
            </section>
          </>
        ) : null}

        {activeTab === 'runs' ? (
          <section className="panel">
            <div className="section-head">
              <h2>Run Endpoint Usage</h2>
              <span>latest workflow activity first</span>
            </div>
            {workflowRunGroups.length ? <RunEndpointWorkflowGroups groups={workflowRunGroups} /> : <EmptyRows label="No run endpoint usage logged yet." />}
          </section>
        ) : null}

        {activeTab === 'workflows' ? (
          <section className="panel">
            <div className="section-head">
              <h2>Workflow Usage</h2>
              <span>calls, calls/run, tokens/run, failure rate</span>
            </div>
            {data.workflows.length ? <WorkflowTable rows={data.workflows} /> : <EmptyRows label="No workflow usage logged yet." />}
          </section>
        ) : null}

        {activeTab === 'endpoints' ? (
          <section className="panel">
            <div className="section-head">
              <h2>Endpoint Usage</h2>
              <span>endpoint cost and success rate</span>
            </div>
            {data.endpoints.length ? <EndpointTable rows={data.endpoints} /> : <EmptyRows label="No endpoint usage logged yet." />}
          </section>
        ) : null}

        {activeTab === 'optimization' ? (
          <section className="stack">
            <div className="panel">
              <div className="section-head">
                <h2>Scope for Optimization</h2>
                <span>highest token runs first</span>
              </div>
              {data.optimization_insights.length ? <OptimizationTable rows={data.optimization_insights} /> : <EmptyRows label="No optimization findings in this window." />}
            </div>
            <div className="panel">
              <div className="section-head">
                <h2>Rate Limit Signals</h2>
                <span>workflow, run, endpoint, actual 429 vs retry-after</span>
              </div>
              {data.rate_limit_events.length ? <RateLimitTable rows={data.rate_limit_events} /> : <EmptyRows label="No rate limit signals in this window." />}
            </div>
            <div className="panel">
              <div className="section-head">
                <h2>Repeated Fetch Calls</h2>
                <span>same workflow, endpoint, fingerprint</span>
              </div>
              {data.duplicate_fetches.length ? <DuplicateTable rows={data.duplicate_fetches} /> : <EmptyRows label="No repeated fetch fingerprints detected yet." />}
            </div>
            <div className="panel">
              <div className="section-head">
                <h2>Heavy Runs</h2>
                <span>highest token jobs</span>
              </div>
              {data.heavy_runs.length ? <HeavyRuns rows={data.heavy_runs} /> : <EmptyRows label="No run-level usage logged yet." />}
            </div>
          </section>
        ) : null}

      </section>
    </main>
  )
}

