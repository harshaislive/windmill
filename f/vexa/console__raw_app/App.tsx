import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { backend } from './wmill'
import './index.css'
import MeetingDrawer, { type DrawerTarget } from './MeetingDrawer'

type Meeting = {
  id: number
  meeting_key: string
  platform: string
  meeting_url: string
  title: string
  organizer: string
  start_at: string | null
  end_at: string | null
  calendars: string[]
  attendee_count: number
  has_external: boolean
  source: string
  status: string
  skip_reason: string | null
  attempts: number
  last_error: string | null
  vexa_status: string | null
  requested_by: string | null
  bot_name: string | null
  outcome: string | null
  outcome_detail: string | null
  dispatched_at: string | null
}

type Calendar = {
  email: string
  display_name: string
  enabled: boolean
  access_status: string
  source: string
  last_scanned_at: string | null
  last_scan_ok: boolean | null
  last_error: string | null
  meetings_found: number
}

type EventRow = { id: number; at: string; kind: string; meeting_key: string | null; detail: string }

type Overview = {
  now: string
  settings: Record<string, string>
  meetings: Meeting[]
  calendars: Calendar[]
  sources: { name: string; maton_key_path: string; expected_identity: string; verified_identity: string | null; last_checked_at: string | null; last_status: string | null }[]
  events: EventRow[]
  last_scan: { at: string; detail: string } | null
  alerts: { kind: string; active_since: string; last_sent_at: string | null; last_detail: string }[]
  live_bots: any[]
  live_error: string | null
}

type Tab = 'queue' | 'transcripts' | 'live' | 'calendars' | 'activity' | 'settings'

type LibraryMeeting = {
  id: number
  platform: string
  native_meeting_id: string
  status: string
  title: string
  start_time: string | null
  end_time: string | null
  created_at: string
  calendar_managed: boolean
  completion_reason: string | null
  audio_bytes: number
  recording_status: string | null
}

const PLATFORM: Record<string, string> = { google_meet: 'Meet', zoom: 'Zoom', teams: 'Teams' }
const OUTCOME_LABEL: Record<string, [string, string]> = {
  joining: ['Joining…', 'dispatching'],
  waiting_admission: ['Waiting to be admitted', 'dispatching'],
  recording: ['Recording', 'dispatched'],
  recorded: ['Recorded', 'dispatched'],
  not_admitted: ['Not admitted', 'failed'],
  rejected: ['Rejected', 'failed'],
  join_failed: ['Failed to join', 'failed'],
  already_active: ['Bot already in meeting', 'dispatched'],
}

/** What the queue should show: the bot's real outcome once it was sent. */
function displayStatus(m: { status: string; outcome: string | null }): [string, string] {
  if ((m.status === 'dispatched' || m.status === 'stopped') && m.outcome && OUTCOME_LABEL[m.outcome]) return OUTCOME_LABEL[m.outcome]
  return [STATUS_LABEL[m.status] || m.status, m.status]
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  dispatching: 'Sending…',
  dispatched: 'Bot sent',
  skipped: 'Skipped',
  failed: 'Failed',
  missed: 'Missed',
  cancelled: 'Cancelled',
  stopped: 'Stopped',
}

const call = (action: string, payload: Record<string, any> = {}) => (backend as any).console_api({ action, payload })

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function relative(iso: string | null) {
  if (!iso) return ''
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (Math.abs(mins) < 1) return 'now'
  const abs = Math.abs(mins)
  const text = abs < 60 ? `${abs}m` : `${Math.floor(abs / 60)}h ${abs % 60}m`
  return mins > 0 ? `in ${text}` : `${text} ago`
}

export default function App() {
  const [data, setData] = useState<Overview | null>(null)
  const [tab, setTab] = useState<Tab>('queue')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [brand, setBrand] = useState<'beforest' | 'bewild'>('beforest')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [calSearch, setCalSearch] = useState('')
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const [library, setLibrary] = useState<{ meetings: LibraryMeeting[]; offset: number; has_more: boolean; error?: string } | null>(null)
  const [libLoading, setLibLoading] = useState(false)
  const [libSearch, setLibSearch] = useState('')
  const [libFilter, setLibFilter] = useState('with_content')
  const [draft, setDraft] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await call('overview', { hours_back: 12, hours_ahead: 36 })
      setData(result)
    } catch (error: any) {
      setToast({ kind: 'err', text: `Load failed: ${error?.message || error}` })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  async function act(label: string, action: string, payload: Record<string, any>, after?: (r: any) => void) {
    setBusy(label)
    try {
      const result = await call(action, payload)
      if (result?.error) setToast({ kind: 'err', text: result.error })
      else if (result?.result === 'failed' || result?.result === 'retry' || result?.result === 'rate_limited' || result?.result === 'not_claimed')
        setToast({ kind: 'err', text: `${result.result.replace('_', ' ')}: ${result.detail || ''}` })
      else setToast({ kind: 'ok', text: result?.result === 'already_active' ? 'A bot is already in that meeting.' : 'Done.' })
      after?.(result)
      await refresh()
    } catch (error: any) {
      setToast({ kind: 'err', text: String(error?.message || error) })
    } finally {
      setBusy(null)
    }
  }

  async function sendNow(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    await act('send', 'send_now', { meeting_url: url.trim(), title: title.trim() || undefined, brand }, (r) => {
      if (r?.result === 'dispatched' || r?.result === 'already_active') {
        setUrl('')
        setTitle('')
      }
    })
  }

  function openTranscript(meeting: Meeting) {
    setDrawer({ id: meeting.id, title: meeting.title })
  }

  const loadLibrary = useCallback(async (offset = 0) => {
    setLibLoading(true)
    try {
      const result = await call('library', { limit: 50, offset })
      setLibrary((prev) => ({
        meetings: offset && prev ? [...prev.meetings, ...(result.meetings || [])] : result.meetings || [],
        offset,
        has_more: !!result.has_more,
        error: result.error,
      }))
    } catch (error: any) {
      setLibrary({ meetings: [], offset: 0, has_more: false, error: String(error?.message || error) })
    } finally {
      setLibLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'transcripts' && !library) loadLibrary(0)
  }, [tab, library, loadLibrary])

  const libRows = useMemo(() => {
    const q = libSearch.trim().toLowerCase()
    return (library?.meetings || []).filter((m) => {
      if (libFilter === 'with_content' && !(m.audio_bytes > 0 || m.status === 'completed' || m.status === 'active')) return false
      if (libFilter === 'audio' && !(m.audio_bytes > 0)) return false
      return !q || `${m.title} ${m.native_meeting_id}`.toLowerCase().includes(q)
    })
  }, [library, libSearch, libFilter])

  const meetings = useMemo(() => {
    const list = data?.meetings || []
    const q = search.trim().toLowerCase()
    return list.filter((m) => {
      if (statusFilter === 'active' && !['pending', 'dispatching', 'dispatched'].includes(m.status)) return false
      if (statusFilter !== 'active' && statusFilter !== 'all' && m.status !== statusFilter) return false
      if (!q) return true
      return [m.title, m.organizer, ...(m.calendars || [])].join(' ').toLowerCase().includes(q)
    })
  }, [data, statusFilter, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of data?.meetings || []) c[m.status] = (c[m.status] || 0) + 1
    return c
  }, [data])

  const outcomes = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of data?.meetings || []) if (m.outcome && (m.status === 'dispatched' || m.status === 'stopped')) c[m.outcome] = (c[m.outcome] || 0) + 1
    return c
  }, [data])

  const nextUp = useMemo(
    () => (data?.meetings || []).find((m) => m.status === 'pending' && m.start_at && new Date(m.start_at).getTime() > Date.now() - 60000),
    [data],
  )

  const settings = data?.settings || {}
  const autoOn = settings.auto_dispatch_enabled === 'true'
  const enabledCals = (data?.calendars || []).filter((c) => c.enabled).length
  const scanSummary = useMemo(() => {
    try { return data?.last_scan ? JSON.parse(data.last_scan.detail) : null } catch { return null }
  }, [data])

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>Vexa Console</h1>
          <p className="sub">Meeting bots for Beforest calendars · scans hourly · sends {settings.dispatch_lead_minutes || 2} min before start</p>
        </div>
        <div className="top-actions">
          <button className={`switch ${autoOn ? 'on' : 'off'}`} disabled={!!busy}
            onClick={() => act('auto', 'set_setting', { key: 'auto_dispatch_enabled', value: autoOn ? 'false' : 'true' })}>
            <span className="dot" /> Auto-send {autoOn ? 'ON' : 'OFF'}
          </button>
          <button disabled={!!busy} onClick={() => act('scan', 'scan_now', {}, () => setTimeout(refresh, 70000))}>
            {busy === 'scan' ? 'Starting…' : 'Scan calendars now'}
          </button>
          <button className="ghost" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </header>

      {(data?.alerts || []).map((a) => (
        <div key={a.kind} className="banner err">
          <b>{a.kind === 'vexa_out_of_credit' ? 'Vexa is out of credit: no bots are being sent.' : a.kind}</b>{' '}
          Since {fmtTime(a.active_since)}.{a.last_sent_at ? ` Alert emailed ${relative(a.last_sent_at)}.` : ''}
        </div>
      ))}

      {data?.live_error && (
        <div className="banner err">Vexa API unavailable — {data.live_error}</div>
      )}

      <section className="kpis">
        <div className="kpi"><span>Queued</span><b>{counts.pending || 0}</b></div>
        <div className="kpi"><span>Recording now</span><b>{outcomes.recording || 0}</b></div>
        <div className="kpi"><span>Recorded</span><b>{outcomes.recorded || 0}</b></div>
        <div className="kpi bad"><span>Not let in</span><b>{(outcomes.not_admitted || 0) + (outcomes.rejected || 0)}</b></div>
        <div className="kpi"><span>Failed / missed</span><b>{(outcomes.join_failed || 0) + (counts.failed || 0) + (counts.missed || 0)}</b></div>
        <div className="kpi wide">
          <span>Next bot</span>
          <b className="small">{nextUp ? `${nextUp.title} · ${relative(nextUp.start_at)}` : 'Nothing queued'}</b>
        </div>
      </section>

      <form className="send" onSubmit={sendNow}>
        <div className="send-label">Send a bot now</div>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij  ·  Zoom  ·  Teams link" />
        <input className="title-in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Label (optional)" />
        <select value={brand} onChange={(e) => setBrand(e.target.value as 'beforest' | 'bewild')} title="Bot name">
          <option value="beforest">{settings.bot_name || 'Beforest Notetaker'}</option>
          <option value="bewild">{settings.bot_name_bewild || "Bewild's Notetaker"}</option>
        </select>
        <button type="submit" className="primary" disabled={!url.trim() || !!busy}>{busy === 'send' ? 'Sending…' : 'Send bot'}</button>
      </form>

      <nav className="tabs">
        {(['queue', 'transcripts', 'live', 'calendars', 'activity', 'settings'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'queue' ? `Queue (${data?.meetings.length ?? 0})` : t === 'live' ? `Live bots (${data?.live_bots.length ?? 0})` : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <span className="scan-note">
          {data?.last_scan ? `Last scan ${relative(data.last_scan.at)}${scanSummary ? ` · ${scanSummary.meetings_found} meetings · ${scanSummary.calendars_failed} calendar errors` : ''}` : 'No scan yet'}
        </span>
      </nav>

      {tab === 'queue' && (
        <section className="panel">
          <div className="filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="active">Upcoming & sent</option>
              <option value="all">All</option>
              {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({counts[s] || 0})</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, organizer, calendar" />
          </div>
          <table>
            <thead>
              <tr><th>When (IST)</th><th>Meeting</th><th>Where</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {meetings.length === 0 && <tr><td colSpan={5} className="empty">No meetings match.</td></tr>}
              {meetings.map((m) => (
                <tr key={m.id} className={`row-${m.status}`}>
                  <td className="when">{fmtTime(m.start_at)}<small>{relative(m.start_at)}</small></td>
                  <td>
                    <div className="mtitle">{m.title}</div>
                    <small>
                      {m.source === 'manual' ? `manual · ${m.requested_by || ''}` : `${m.organizer || 'unknown organizer'} · ${m.calendars?.length || 0} calendar${m.calendars?.length === 1 ? '' : 's'}`}
                      {m.has_external && <span className="tag ext">external guests</span>}
                    </small>
                  </td>
                  <td><a href={m.meeting_url} target="_blank" rel="noreferrer" className="tag">{PLATFORM[m.platform] || m.platform}</a></td>
                  <td>
                    {(() => { const [label, cls] = displayStatus(m); return <span className={`pill ${cls}`}>{label}</span> })()}
                    {m.bot_name && (m.status === 'dispatched' || m.status === 'stopped') && <small className="block">{m.bot_name}{m.outcome_detail ? ` · ${m.outcome_detail}` : ''}</small>}
                    {(m.last_error || m.skip_reason) && <small className="block err-text" title={m.last_error || m.skip_reason || ''}>{(m.last_error || m.skip_reason || '').slice(0, 80)}</small>}
                  </td>
                  <td className="actions">
                    {m.status !== 'dispatched' && m.status !== 'dispatching' && (
                      <button disabled={!!busy} onClick={() => act(`send-${m.id}`, 'send_queued', { id: m.id })}>Send now</button>
                    )}
                    {['pending', 'failed', 'missed'].includes(m.status) && (
                      <button className="ghost" disabled={!!busy} onClick={() => act(`skip-${m.id}`, 'skip', { id: m.id })}>Skip</button>
                    )}
                    {['skipped', 'cancelled'].includes(m.status) && (
                      <button className="ghost" disabled={!!busy} onClick={() => act(`unskip-${m.id}`, 'unskip', { id: m.id })}>Re-queue</button>
                    )}
                    {m.status === 'dispatched' && (
                      <>
                        <button className="ghost" disabled={!!busy} onClick={() => openTranscript(m)}>Transcript</button>
                        <button className="danger" disabled={!!busy} onClick={() => confirm(`Remove the bot from "${m.title}"?`) && act(`stop-${m.id}`, 'stop_bot', { id: m.id })}>Stop</button>
                      </>
                    )}
                    {m.status === 'stopped' && (
                      <button className="ghost" disabled={!!busy} onClick={() => openTranscript(m)}>Transcript</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'transcripts' && (
        <section className="panel">
          <div className="filters">
            <select value={libFilter} onChange={(e) => setLibFilter(e.target.value)}>
              <option value="with_content">Recorded or live</option>
              <option value="audio">Has audio</option>
              <option value="all">All bot sessions</option>
            </select>
            <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder="Search meetings" />
            <button className="ghost" disabled={libLoading} onClick={() => loadLibrary(0)}>{libLoading ? 'Loading…' : 'Reload'}</button>
            <span className="muted">Everything recorded in Vexa, including meetings Vexa joined from its own calendar sync.</span>
          </div>
          {library?.error && <p className="err-text">{library.error}</p>}
          <table>
            <thead><tr><th>When (IST)</th><th>Meeting</th><th>Bot status</th><th>Audio</th><th /></tr></thead>
            <tbody>
              {!libLoading && libRows.length === 0 && <tr><td colSpan={5} className="empty">No recorded meetings yet.</td></tr>}
              {libRows.map((m) => (
                <tr key={m.id}>
                  <td className="when">{fmtTime(m.start_time || m.created_at)}<small>{relative(m.start_time || m.created_at)}</small></td>
                  <td>
                    <div className="mtitle">{m.title}</div>
                    <small>{PLATFORM[m.platform] || m.platform} · {m.calendar_managed ? 'Vexa calendar sync' : 'sent from console'}</small>
                  </td>
                  <td>
                    <span className={`pill ${m.status === 'completed' ? 'dispatched' : m.status === 'failed' ? 'failed' : m.status === 'active' ? 'pending' : ''}`}>{m.status.replace(/_/g, ' ')}</span>
                    {m.completion_reason && <small className="block">{String(m.completion_reason).replace(/_/g, ' ')}</small>}
                  </td>
                  <td>{m.audio_bytes ? `${(m.audio_bytes / 1_000_000).toFixed(1)} MB${m.recording_status === 'in_progress' ? ' · recording' : ''}` : '—'}</td>
                  <td className="actions">
                    <button onClick={() => setDrawer({ vexa_meeting_id: m.id, title: m.title })}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {library?.has_more && (
            <div className="more"><button className="ghost" disabled={libLoading} onClick={() => loadLibrary((library?.meetings.length || 0))}>Load more</button></div>
          )}
        </section>
      )}

      {tab === 'live' && (
        <section className="panel">
          {data?.live_error ? <p className="empty">{data.live_error}</p> : data?.live_bots.length ? (
            <table>
              <thead><tr><th>Platform</th><th>Meeting</th><th>Status</th><th>Started</th></tr></thead>
              <tbody>
                {data.live_bots.map((b: any, i: number) => (
                  <tr key={i}>
                    <td>{PLATFORM[b.platform] || b.platform}</td>
                    <td className="mono">{b.native_meeting_id || b.meeting_id || '—'}</td>
                    <td><span className="pill dispatched">{b.status || b.meeting_status || 'running'}</span></td>
                    <td>{fmtTime(b.start_time || b.created_at || null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">No bots running right now.</p>}
        </section>
      )}

      {tab === 'calendars' && (
        <section className="panel">
          <div className="sources">
            {(data?.sources || []).map((src) => (
              <div key={src.name} className={`source ${src.last_status === 'ok' ? 'ok' : 'warn'}`}>
                <div><b>{src.name}</b> <small>{src.verified_identity || src.expected_identity}</small></div>
                <small className="block">{src.last_status === 'ok' ? `Connected · checked ${relative(src.last_checked_at)}` : src.last_status || 'Not checked yet'}</small>
                <small className="block muted mono">{src.maton_key_path}</small>
                <button disabled={!!busy} onClick={() => act(`chk-${src.name}`, 'check_access', { source: src.name }, () => setTimeout(refresh, 20000))}>
                  {busy === `chk-${src.name}` ? 'Starting…' : 'Check access'}
                </button>
              </div>
            ))}
          </div>
          <div className="filters">
            <input value={calSearch} onChange={(e) => setCalSearch(e.target.value)} placeholder="Search people" />
            <span className="muted">{enabledCals} of {data?.calendars.length || 0} calendars are scanned. Each calendar is read through its source's Maton account; ones it can't read stay off.</span>
          </div>
          <table>
            <thead><tr><th>Scan</th><th>Person</th><th>Source</th><th>Access</th><th>Last scan</th><th>Meetings</th></tr></thead>
            <tbody>
              {(data?.calendars || []).filter((c) => `${c.email} ${c.display_name}`.toLowerCase().includes(calSearch.toLowerCase())).map((c) => (
                <tr key={c.email}>
                  <td>
                    <input type="checkbox" checked={c.enabled} disabled={!!busy}
                      onChange={(e) => act(`cal-${c.email}`, 'toggle_calendar', { email: c.email, enabled: e.target.checked })} />
                  </td>
                  <td><div className="mtitle">{c.display_name}</div><small>{c.email}</small></td>
                  <td><span className="tag">{c.source}</span></td>
                  <td><span className={`pill ${c.access_status === 'readable' ? 'dispatched' : 'failed'}`}>{c.access_status.replace(/_/g, ' ')}</span></td>
                  <td>{c.last_scanned_at ? relative(c.last_scanned_at) : '—'}{c.last_error && <small className="block err-text">{c.last_error}</small>}</td>
                  <td>{c.meetings_found}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'activity' && (
        <section className="panel">
          <table>
            <thead><tr><th>When</th><th>Event</th><th>Detail</th></tr></thead>
            <tbody>
              {(data?.events || []).map((e) => (
                <tr key={e.id}>
                  <td className="when">{fmtTime(e.at)}</td>
                  <td><span className="tag">{e.kind}</span></td>
                  <td className="mono small-text">{e.meeting_key ? `${e.meeting_key} — ` : ''}{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'settings' && (
        <section className="panel settings">
          {[
            ['bot_name', 'Bot name for Beforest meetings'],
            ['bot_name_bewild', 'Bot name for Bewild meetings (bewild.life organizer or only on bewild.life calendars)'],
            ['dispatch_lead_minutes', 'Send bot this many minutes before start'],
            ['late_join_minutes', 'Still join if meeting started up to (minutes)'],
            ['lookahead_hours', 'Hourly scan looks ahead (hours)'],
            ['skip_keyword', 'Skip meetings whose title/description contains'],
            ['watchdog_enabled', 'Stale-bot watchdog on (true/false)'],
            ['silence_during_minutes', 'Leave after this many minutes without speech (during scheduled time)'],
            ['silence_after_end_minutes', 'Leave after this many minutes without speech (past scheduled end)'],
            ['hard_cap_after_end_minutes', 'Always leave this many minutes after scheduled end'],
            ['manual_max_minutes', 'Max minutes for bots with no scheduled end (manual sends)'],
            ['leave_alone_seconds', 'Vexa: leave when alone in the meeting for (seconds)'],
            ['alert_email_to', 'Send ops alerts (e.g. Vexa out of credit) to — comma-separated'],
            ['alert_repeat_hours', 'Repeat an unresolved alert every (hours)'],
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <div className="row">
                <input value={draft[key] ?? settings[key] ?? ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                <button disabled={!!busy || draft[key] === undefined || draft[key] === settings[key]}
                  onClick={() => act(`set-${key}`, 'set_setting', { key, value: draft[key] }, () => setDraft((d) => { const n = { ...d }; delete n[key]; return n }))}>
                  Save
                </button>
              </div>
            </label>
          ))}
          <p className="muted">Schedules: f/vexa/scan_calendars (hourly) and f/vexa/dispatch_bots (every 2 min). The Auto-send switch pauses sending without touching schedules.</p>
        </section>
      )}

      {drawer && <MeetingDrawer target={drawer} call={call} onClose={() => setDrawer(null)} />}

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  )
}
