import { useEffect, useMemo, useState } from 'react'
import { backend } from './wmill'

type MetricDef = { key: string; label: string }
type SnapshotRow = {
  id: number
  timestamp: string
  created_at?: string
  [key: string]: unknown
}
type ProjectDef = {
  key: string
  label: string
  ref: string
  url: string
}
type DashboardData = {
  ok: boolean
  generated_at: string
  project: ProjectDef
  projects: ProjectDef[]
  row_count: number
  available_metrics: MetricDef[]
  latest: SnapshotRow | null
  previous: SnapshotRow | null
  rows: SnapshotRow[]
}

const numberFmt = new Intl.NumberFormat('en-IN')
const PROJECTS: ProjectDef[] = [
  { key: '10cent', label: '10Cent', ref: 'nsrndpwoohjylxgknghr', url: 'https://nsrndpwoohjylxgknghr.supabase.co' },
  { key: 'beforest_audience', label: 'Beforest Audience', ref: 'gvmlbkfmumywwlwsesqp', url: 'https://gvmlbkfmumywwlwsesqp.supabase.co' },
  { key: 'experiences', label: 'Experiences', ref: 'isdbyvwocudnlwzghphw', url: 'https://isdbyvwocudnlwzghphw.supabase.co' },
  { key: 'dropbox', label: 'Dropbox', ref: 'mtzcvknnkeepgyyfntod', url: 'https://mtzcvknnkeepgyyfntod.supabase.co' },
  { key: 'n8n_workflows', label: 'N8N Workflows', ref: 'fjnkpphjtlaeijjcbejb', url: 'https://fjnkpphjtlaeijjcbejb.supabase.co' },
  { key: 'snippets_spaces', label: 'Snippets & Spaces', ref: 'zacboxnjmvhbeaxfunmi', url: 'https://zacboxnjmvhbeaxfunmi.supabase.co' },
]

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  if (key.includes('percent')) return `${numeric.toFixed(2)}%`
  if (key.includes('gb')) return `${numeric.toFixed(2)} GB`
  if (Math.abs(numeric) >= 1000) return numberFmt.format(Math.round(numeric))
  return Number.isInteger(numeric) ? numberFmt.format(numeric) : numeric.toFixed(2)
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

function delta(key: string, latest?: SnapshotRow | null, previous?: SnapshotRow | null) {
  const current = Number(latest?.[key])
  const before = Number(previous?.[key])
  if (!Number.isFinite(current) || !Number.isFinite(before)) return 'new'
  const diff = current - before
  if (Math.abs(diff) < 0.001) return 'flat'
  const sign = diff > 0 ? '+' : ''
  return `${sign}${formatValue(key, diff)}`
}

function Sparkline({ rows, metric }: { rows: SnapshotRow[]; metric: MetricDef }) {
  const values = rows.map((row) => Number(row[metric.key])).filter(Number.isFinite)
  const max = Math.max(1, ...values)
  return (
    <div className="spark" aria-label={`${metric.label} trend`}>
      {rows.map((row) => {
        const value = Number(row[metric.key])
        const height = Number.isFinite(value) ? Math.max(8, (value / max) * 100) : 0
        return (
          <i
            key={`${metric.key}-${row.id}`}
            title={`${dateTime(row.timestamp)}: ${formatValue(metric.key, row[metric.key])}`}
            style={{ height: `${height}%` }}
          />
        )
      })}
    </div>
  )
}

function MetricCard({ metric, latest, previous }: { metric: MetricDef; latest: SnapshotRow | null; previous: SnapshotRow | null }) {
  return (
    <article className="metric">
      <span>{metric.label}</span>
      <strong>{formatValue(metric.key, latest?.[metric.key])}</strong>
      <p>{delta(metric.key, latest, previous)} since previous snapshot</p>
    </article>
  )
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [projectKey, setProjectKey] = useState(PROJECTS[0].key)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(nextProjectKey = projectKey) {
    setLoading(true)
    setError('')
    try {
      const result = await backend.get_metrics({ limit: 60, project_key: nextProjectKey })
      setData(result as DashboardData)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(projectKey)
  }, [projectKey])

  const chartMetrics = useMemo(() => data?.available_metrics.slice(0, 5) ?? [], [data])
  const selectedProject = data?.project ?? PROJECTS.find((project) => project.key === projectKey) ?? PROJECTS[0]

  return (
    <main>
      <section className="shell">
        <div className="topbar">
          <span>Supabase Metrics</span>
          <div className="actions">
            <label>
              Project
              <select
                value={projectKey}
                onChange={(event) => {
                  setData(null)
                  setProjectKey(event.target.value)
                }}
                disabled={loading}
              >
                {(data?.projects ?? PROJECTS).map((project) => (
                  <option key={project.key} value={project.key}>{project.label}</option>
                ))}
              </select>
            </label>
            <button onClick={() => load(projectKey)} disabled={loading}>{loading ? 'Loading' : 'Refresh'}</button>
          </div>
        </div>

        <header className="prompt">
          <code>project: {selectedProject.ref}</code>
          <h1>Supabase health snapshot</h1>
          <p>
            Daily project usage and infrastructure signals from <b>project_metrics_snapshots</b> for {selectedProject.label}. Empty metrics are hidden.
          </p>
          <p className="project-url">{selectedProject.url}</p>
        </header>

        {error && <div className="notice error">{error}</div>}
        {loading && !data && <div className="notice">Fetching latest snapshots...</div>}

        {data && (
          <>
            <div className="summary">
              <div>
                <span>Latest snapshot</span>
                <strong>{dateTime(data.latest?.timestamp)}</strong>
              </div>
              <div>
                <span>Rows visible</span>
                <strong>{numberFmt.format(data.row_count)}</strong>
              </div>
              <div>
                <span>Refreshed</span>
                <strong>{dateTime(data.generated_at)}</strong>
              </div>
            </div>

            <section className="metrics">
              {data.available_metrics.map((metric) => (
                <MetricCard key={metric.key} metric={metric} latest={data.latest} previous={data.previous} />
              ))}
            </section>

            <section className="charts">
              {chartMetrics.map((metric) => (
                <article className="panel" key={metric.key}>
                  <div className="section-head">
                    <h2>{metric.label}</h2>
                    <span>{data.rows.length} pts</span>
                  </div>
                  <Sparkline rows={data.rows} metric={metric} />
                </article>
              ))}
            </section>

            <section className="panel table-panel">
              <div className="section-head">
                <h2>Recent snapshots</h2>
                <span>newest first</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      {data.available_metrics.map((metric) => <th key={metric.key}>{metric.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.rows].reverse().slice(0, 12).map((row) => (
                      <tr key={row.id}>
                        <td>{dateTime(row.timestamp)}</td>
                        {data.available_metrics.map((metric) => (
                          <td key={`${row.id}-${metric.key}`}>{formatValue(metric.key, row[metric.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  )
}
