import React, { useEffect, useMemo, useState } from 'react'
import { backend } from './wmill'

type Snapshot = {
  received_at: string
  monitor_timestamp: string
  server: string
  hostname: string
  loadavg: Array<number | null>
  memory_used_percent: number
  root_disk_used_percent: number
  docker_disk_used_percent: number
  docker_container_count: number
  suspicious_count: number
}

type ProjectRow = {
  project_key: string
  project_name: string
  resource_name: string
  display: string
  coolify_type: string
  environment_name: string
  public_domains: string[]
  container_count: number
  cpu_percent_sum: number
  memory_percent_max: number
  suspicious_count: number
  suspicious_reasons: string[]
}

type ContainerRow = {
  name: string
  project_key: string
  project_name: string
  resource_name: string
  service_name: string
  coolify_type: string
  environment_name: string
  image: string
  status: string
  running: boolean
  cpu_percent: number
  memory_percent: number
  memory_usage: string
  network_io: string
  block_io: string
  pids: string
  restart_count: number
  network_mode: string
  privileged: boolean
  public_domains: string[]
  suspicious_reasons: string[]
}

type HistoryRow = {
  received_at: string
  load_1m: number
  memory_used_percent: number
  root_disk_used_percent: number
  docker_container_count: number
  suspicious_count: number
}

type DashboardData = {
  ready: boolean
  message?: string
  snapshot?: Snapshot
  health?: {
    level: string
    stale_minutes: number | null
    warnings: string[]
  }
  host?: {
    top_processes: string[]
    auth: Record<string, unknown>
    open_ports: string
  }
  projects: ProjectRow[]
  containers: ContainerRow[]
  selected_project?: ProjectRow | null
  all_container_count: number
  history: HistoryRow[]
}

const ALL_PROJECTS = 'all'

function fmtNumber(value: unknown, digits = 1) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '-'
}

function fmtPct(value: unknown) {
  return `${fmtNumber(value, 1)}%`
}

function fmtTime(value?: string) {
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

function cleanDomain(domains: string[] = []) {
  const first = domains.find(Boolean)
  return first ? first.replace(/^https?:\/\//, '') : '-'
}

function statusTone(row?: { suspicious_count?: number; memory_percent_max?: number; cpu_percent_sum?: number } | null) {
  if (!row) return 'neutral'
  if ((row.suspicious_count || 0) > 0) return 'watch'
  if ((row.memory_percent_max || 0) >= 70 || (row.cpu_percent_sum || 0) >= 70) return 'warn'
  return 'ok'
}

function Metric({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  )
}

function App() {
  const [projectKey, setProjectKey] = useState(ALL_PROJECTS)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(nextProject = projectKey) {
    setLoading(true)
    setError('')
    try {
      const result = await backend.get_hetzner_monitor_dashboard({ days: 2, project_key: nextProject })
      setData(result as DashboardData)
    } catch (err: any) {
      setError(err?.message || 'Unable to load monitor data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(ALL_PROJECTS)
  }, [])

  const selectedProject = useMemo(() => {
    if (!data || projectKey === ALL_PROJECTS) return null
    return data.projects.find((project) => project.project_key === projectKey) || data.selected_project || null
  }, [data, projectKey])

  const projectsByMemory = useMemo(() => {
    return [...(data?.projects || [])].sort((a, b) => b.memory_percent_max - a.memory_percent_max).slice(0, 6)
  }, [data])

  const watchRows = useMemo(() => {
    return (data?.containers || []).filter((row) => row.suspicious_reasons.length || row.privileged)
  }, [data])

  const snapshot = data?.snapshot
  const projectSummary = selectedProject || {
    project_name: 'All projects',
    resource_name: `${data?.projects.length || 0} projects`,
    public_domains: [],
    container_count: data?.all_container_count || 0,
    cpu_percent_sum: data?.projects.reduce((sum, row) => sum + Number(row.cpu_percent_sum || 0), 0) || 0,
    memory_percent_max: Math.max(0, ...(data?.projects || []).map((row) => Number(row.memory_percent_max || 0))),
    suspicious_count: data?.containers.filter((row) => row.suspicious_reasons.length).length || 0,
  }

  return (
    <main className="page">
      <section className="shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">Beforest server monitor</span>
            <h1>Hetzner Container Pulse</h1>
          </div>
          <div className={`status ${data?.health?.level || 'neutral'}`}>
            {loading ? 'loading' : data?.health?.level || 'unknown'}
          </div>
        </header>

        <div className="toolbar">
          <label>
            <span>Project</span>
            <select
              value={projectKey}
              onChange={(event) => {
                const next = event.target.value
                setProjectKey(next)
                load(next)
              }}
            >
              <option value={ALL_PROJECTS}>All projects</option>
              {(data?.projects || []).map((project) => (
                <option key={project.project_key} value={project.project_key}>
                  {project.project_name} / {project.resource_name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => load()} disabled={loading}>
            Refresh
          </button>
        </div>

        {error ? <div className="notice danger">{error}</div> : null}
        {!error && data && !data.ready ? <div className="notice">{data.message || 'No monitor data yet.'}</div> : null}

        <section className="metrics-grid">
          <Metric label="Last received" value={fmtTime(snapshot?.received_at)} sub={snapshot?.server || '-'} tone={data?.health?.level || 'neutral'} />
          <Metric label="Load" value={(snapshot?.loadavg || []).map((value) => fmtNumber(value, 2)).join(' / ') || '-'} sub="1m / 5m / 15m" />
          <Metric label="Memory" value={fmtPct(snapshot?.memory_used_percent)} sub="host used" tone={(snapshot?.memory_used_percent || 0) >= 70 ? 'warn' : 'ok'} />
          <Metric label="Disk" value={fmtPct(snapshot?.root_disk_used_percent)} sub="root volume" tone={(snapshot?.root_disk_used_percent || 0) >= 75 ? 'warn' : 'ok'} />
          <Metric label="Containers" value={String(snapshot?.docker_container_count || 0)} sub={`${data?.projects.length || 0} projects`} />
          <Metric label="Watch" value={String(snapshot?.suspicious_count || 0)} sub="security/runtime flags" tone={(snapshot?.suspicious_count || 0) ? 'watch' : 'ok'} />
        </section>

        <section className="project-panel">
          <div className="section-title">
            <span>Project Summary</span>
            <code>{projectSummary.resource_name}</code>
          </div>
          <div className="project-grid">
            <div className={`project-card ${statusTone(projectSummary)}`}>
              <span>{projectSummary.project_name}</span>
              <strong>{projectSummary.container_count} containers</strong>
              <small>{cleanDomain(projectSummary.public_domains as string[])}</small>
            </div>
            <Metric label="CPU Total" value={fmtPct(projectSummary.cpu_percent_sum)} />
            <Metric label="Memory Max" value={fmtPct(projectSummary.memory_percent_max)} tone={(projectSummary.memory_percent_max || 0) >= 70 ? 'warn' : 'ok'} />
            <Metric label="Watch Items" value={String(projectSummary.suspicious_count || 0)} tone={(projectSummary.suspicious_count || 0) ? 'watch' : 'ok'} />
          </div>
        </section>

        <section className="split">
          <div className="panel">
            <div className="section-title">
              <span>Projects By Memory</span>
              <code>top {projectsByMemory.length}</code>
            </div>
            <div className="rank-list">
              {projectsByMemory.map((project) => (
                <button className="rank-row" key={project.project_key} onClick={() => { setProjectKey(project.project_key); load(project.project_key) }}>
                  <span>{project.project_name}</span>
                  <strong>{fmtPct(project.memory_percent_max)}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="section-title">
              <span>Watch Items</span>
              <code>{watchRows.length}</code>
            </div>
            <div className="watch-list">
              {watchRows.length ? watchRows.map((row) => (
                <article key={row.name}>
                  <strong>{row.service_name}</strong>
                  <span>{row.project_name}</span>
                  <code>{row.suspicious_reasons.join(', ') || (row.privileged ? 'privileged' : 'watch')}</code>
                </article>
              )) : <div className="empty">No container watch items in this view.</div>}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <span>Containers</span>
            <code>{data?.containers.length || 0} rows</code>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Service</th>
                  <th>CPU</th>
                  <th>Memory</th>
                  <th>Network</th>
                  <th>Block IO</th>
                  <th>Status</th>
                  <th>Watch</th>
                </tr>
              </thead>
              <tbody>
                {(data?.containers || []).map((row) => (
                  <tr key={row.name}>
                    <td>
                      <strong>{row.project_name}</strong>
                      <small>{row.resource_name}</small>
                    </td>
                    <td>
                      <strong>{row.service_name}</strong>
                      <small>{row.image}</small>
                    </td>
                    <td>{fmtPct(row.cpu_percent)}</td>
                    <td>
                      <strong>{fmtPct(row.memory_percent)}</strong>
                      <small>{row.memory_usage}</small>
                    </td>
                    <td>{row.network_io}</td>
                    <td>{row.block_io}</td>
                    <td><span className={row.running ? 'pill ok' : 'pill warn'}>{row.status || '-'}</span></td>
                    <td>{row.suspicious_reasons.length ? <span className="pill watch">{row.suspicious_reasons.join(', ')}</span> : <span className="pill ok">ok</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="split bottom">
          <div className="panel">
            <div className="section-title">
              <span>Recent Snapshots</span>
              <code>2 days</code>
            </div>
            <div className="history">
              {(data?.history || []).slice(0, 18).map((row) => (
                <div key={row.received_at} title={fmtTime(row.received_at)}>
                  <span style={{ height: `${Math.max(8, Math.min(100, Number(row.memory_used_percent || 0)))}%` }} />
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="section-title">
              <span>Host Processes</span>
              <code>top</code>
            </div>
            <ol className="processes">
              {(data?.host?.top_processes || []).slice(0, 6).map((process, index) => (
                <li key={`${index}-${process}`}>{process}</li>
              ))}
            </ol>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
