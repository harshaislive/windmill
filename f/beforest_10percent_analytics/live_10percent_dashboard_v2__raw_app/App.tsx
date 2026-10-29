import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './wmill'

type DashboardData = {
  ok: boolean
  generated_at: string
  errors?: any[]
  ga4: any
  supabase: any
  booking: any
  full_funnel: any
  data_quality: any
}

const ranges = [
  { label: 'Today', short: 'Today', start: 'today', end: 'today' },
  { label: 'Yesterday', short: 'Yday', start: 'yesterday', end: 'yesterday' },
  { label: 'Last 7 days', short: '7D', start: '7daysAgo', end: 'today' },
  { label: 'Last 30 days', short: '30D', start: '30daysAgo', end: 'today' },
  { label: 'Last 90 days', short: '90D', start: '90daysAgo', end: 'today' },
]

const tabs = ['Overview', 'Full Funnel', 'Drop-offs', 'Hot Leads', 'Acquisition', 'Data Quality']
const DASHBOARD_PASSCODE = 'Beforest@internal'
const fmt = new Intl.NumberFormat('en-IN')

const emptyData: DashboardData = {
  ok: false,
  generated_at: '',
  ga4: { summary: {}, acquisition: [], device: [], geography: [], events: [], daily: [] },
  supabase: { summary: {}, funnel: [], slides: [], events: [], hot_leads: [], campaigns: [], invite_sources: [] },
  booking: { summary: {}, funnel: [], dropoffs: [], requests: [], dropoff_requests: [], payment_statuses: [], ezee_statuses: [] },
  full_funnel: { live_lane: [], booking_lane: [], bridge: {}, combined_kpis: {} },
  data_quality: { errors: [], freshness: {}, exclusions: {}, bridge: {} },
}

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function compact(value: unknown) {
  return fmt.format(Math.round(num(value)))
}

function pct(value: unknown) {
  return `${num(value).toFixed(1)}%`
}

function time(value?: string) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function Kpi({ label, value, note, tone = 'moss' }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <article className={`kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="section-title">
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function StageList({ rows, tone = 'live' }: { rows: any[]; tone?: 'live' | 'booking' }) {
  const max = Math.max(1, ...rows.map((row) => num(row.count)))
  return (
    <div className={`stage-list ${tone}`}>
      {rows.map((row, index) => (
        <article key={`${row.stage}-${index}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{row.stage}</strong>
          <em>{compact(row.count)}</em>
          <small>{pct(row.rate)}</small>
          <i style={{ width: `${Math.max(2, Math.min(100, (num(row.count) / max) * 100))}%` }} />
        </article>
      ))}
    </div>
  )
}

function RankList({ rows, valueKey = 'count', labelKey = 'label' }: { rows: any[]; valueKey?: string; labelKey?: string }) {
  const max = Math.max(1, ...rows.map((row) => num(row[valueKey])))
  return (
    <div className="rank-list">
      {rows.slice(0, 16).map((row, index) => (
        <div className="rank-row" key={`${row[labelKey]}-${index}`}>
          <div>
            <strong>{row[labelKey] || row.stage || 'Unknown'}</strong>
            {row.action ? <span>{row.action}</span> : null}
          </div>
          <em>{compact(row[valueKey])}</em>
          <i style={{ width: `${Math.max(2, Math.min(100, (num(row[valueKey]) / max) * 100))}%` }} />
        </div>
      ))}
    </div>
  )
}

function LeadsTable({ rows }: { rows: any[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Phone</th><th>Temp</th><th>Score</th><th>Trial click</th><th>Campaign</th><th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lead: any) => (
            <tr key={lead.session_id}>
              <td>{lead.invitee_name || lead.listener_name || '-'}</td>
              <td>{lead.invitee_email || '-'}</td>
              <td>{lead.invitee_phone || '-'}</td>
              <td><span className={`pill ${lead.lead_temperature}`}>{lead.lead_temperature || '-'}</span></td>
              <td>{lead.lead_score || 0}</td>
              <td>{lead.clicked_trial_stay ? 'Yes' : 'No'}</td>
              <td>{lead.campaign || '-'}</td>
              <td>{time(lead.last_seen_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RequestsTable({ rows }: { rows: any[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Guest</th><th>Email</th><th>Phone</th><th>Dates</th><th>Room</th><th>Payment</th><th>eZee</th><th>Follow-up</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => (
            <tr key={row.request_id}>
              <td>{row.name || '-'}</td>
              <td>{row.email || '-'}</td>
              <td>{row.phone || '-'}</td>
              <td>{row.check_in_date || '-'} to {row.check_out_date || '-'}</td>
              <td>{row.selected_room_name || '-'}</td>
              <td>{row.payment_status || '-'}</td>
              <td>{row.ezee_booking_status || '-'}</td>
              <td>{row.has_followup ? 'Logged' : 'None'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rangeIndex, setRangeIndex] = useState(4)
  const [tab, setTab] = useState('Overview')
  const [passcode, setPasscode] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(() => window.localStorage.getItem('beforest_10percent_dashboard_v2_unlocked') === 'true')

  const selectedRange = ranges[rangeIndex]

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await backend.get_dashboard_data({
        start_date: selectedRange.start,
        end_date: selectedRange.end,
        dashboard_passcode: DASHBOARD_PASSCODE,
      }) as DashboardData
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isUnlocked) load()
  }, [rangeIndex, isUnlocked])

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (passcode.trim() === DASHBOARD_PASSCODE) {
      window.localStorage.setItem('beforest_10percent_dashboard_v2_unlocked', 'true')
      setIsUnlocked(true)
      return
    }
    setError('That passcode is not matching.')
  }

  const k = data.full_funnel?.combined_kpis || {}
  const live = data.supabase?.summary || {}
  const booking = data.booking?.summary || {}
  const bridge = data.full_funnel?.bridge || {}

  const overviewKpis = useMemo(() => [
    { label: 'GA4 sessions', value: compact(k.ga4_sessions), note: `${compact(k.ga4_users)} users reached the live walkthrough` },
    { label: 'Tracked live sessions', value: compact(k.tracked_sessions), note: `${compact(live.presentation_started_sessions)} started the guided experience` },
    { label: 'Live trial clicks', value: compact(k.live_trial_clicks), note: 'CTA intent on live.10percent.beforest.co', tone: 'amber' },
    { label: 'Trial modal opens', value: compact(k.trial_modal_opens), note: 'Booking-site trial popup behavior', tone: 'clay' },
    { label: 'Paid / confirmed', value: `${compact(k.paid)} / ${compact(k.confirmed)}`, note: 'Payment truth and eZee confirmation', tone: 'ink' },
  ], [k, live])

  if (!isUnlocked) {
    return (
      <main className="access-shell">
        <section className="access-card">
          <span className="domain">10percent full funnel</span>
          <h1>Beforest 10percent Funnel</h1>
          <p>Enter the shared team passcode to open the staged two-Supabase dashboard.</p>
          <form onSubmit={unlock}>
            <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoFocus />
            <button type="submit">Open</button>
          </form>
          {error ? <small>{error}</small> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="domain">live + booking truth</span>
          <h1>Beforest 10percent Funnel</h1>
          <p>Full path from walkthrough attention to trial booking, payment and eZee confirmation.</p>
        </div>
        <div className="toolbar">
          <div className="range-chips">
            {ranges.map((range, index) => (
              <button key={range.label} className={index === rangeIndex ? 'active' : ''} onClick={() => setRangeIndex(index)}>{range.short}</button>
            ))}
          </div>
          <button className="icon-button" onClick={load} disabled={loading} title="Refresh">R</button>
        </div>
      </header>

      <div className="status-row">
        <span>{selectedRange.label}</span>
        <span>Updated {time(data.generated_at)}</span>
        <span>{loading ? 'Refreshing' : data.ok ? 'All sources OK' : 'Partial data'}</span>
      </div>

      {error ? <section className="notice"><strong>!</strong><span>{error}</span></section> : null}
      {data.errors?.length ? <section className="notice"><strong>!</strong><span>{data.errors.map((item: any) => `${item.source}: ${item.message}`).join(' | ')}</span></section> : null}

      <nav className="tabbar">
        {tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      {tab === 'Overview' ? (
        <>
          <section className="kpi-strip">{overviewKpis.map((item) => <Kpi key={item.label} {...item} />)}</section>
          <section className="dashboard-grid">
            <Section title="Signal Bridge" note="How live intent connects to booking truth.">
              <div className="bridge-grid">
                <article><b>BRIDGE</b><strong>{compact(bridge.linked_live_hot_leads_to_booking)}</strong><span>hot leads linked to booking rows</span></article>
                <article><b>HOT</b><strong>{compact(bridge.unlinked_live_hot_leads)}</strong><span>hot leads still unlinked to booking</span></article>
                <article><b>BOOK</b><strong>{compact(bridge.unlinked_booking_requests)}</strong><span>booking requests unlinked to live signal</span></article>
                <article><b>DONE</b><strong>{compact(booking.confirmed_bookings)}</strong><span>confirmed trial bookings</span></article>
              </div>
            </Section>
            <Section title="Current Booking Truth" note="Read-only from tencent Supabase.">
              <RankList rows={[
                { label: 'Trial requests', count: booking.trial_requests },
                { label: 'Checkout unpaid', count: data.booking.dropoffs?.find((r: any) => r.stage === 'Checkout unpaid')?.count || 0 },
                { label: 'Expired unpaid', count: booking.expired_unpaid_requests },
                { label: 'Paid', count: booking.paid_requests },
                { label: 'eZee confirmed', count: booking.confirmed_bookings },
              ]} />
            </Section>
          </section>
        </>
      ) : null}

      {tab === 'Full Funnel' ? (
        <section className="two-lane">
          <Section title="Live Education Lane" note="GA4 reach is in the KPI strip; this lane is deep live Supabase behavior.">
            <StageList rows={data.full_funnel.live_lane || []} tone="live" />
          </Section>
          <Section title="Booking Lane" note="Trial popup, checkout, payment and eZee truth from tencent.">
            <StageList rows={data.full_funnel.booking_lane || []} tone="booking" />
          </Section>
        </section>
      ) : null}

      {tab === 'Drop-offs' ? (
        <section className="dashboard-grid">
          <Section title="Booking Drop-offs" note="The action column is the next operational nudge.">
            <RankList rows={data.booking.dropoffs || []} />
          </Section>
          <Section title="Drop-off Requests" note="Masked contact fields; full truth remains in Supabase.">
            <RequestsTable rows={data.booking.dropoff_requests || []} />
          </Section>
        </section>
      ) : null}

      {tab === 'Hot Leads' ? (
        <section className="dashboard-grid">
          <Section title="Live Hot Leads" note="Live walkthrough intent; use with booking context before outreach.">
            <LeadsTable rows={data.supabase.hot_leads || []} />
          </Section>
          <Section title="Recent Trial Requests" note="Booking-site requests with payment/eZee/follow-up status.">
            <RequestsTable rows={data.booking.requests || []} />
          </Section>
        </section>
      ) : null}

      {tab === 'Acquisition' ? (
        <section className="dashboard-grid thirds">
          <Section title="GA4 Acquisition"><RankList rows={data.ga4.acquisition || []} valueKey="sessions" labelKey="sessionSourceMedium" /></Section>
          <Section title="Device"><RankList rows={data.ga4.device || []} valueKey="activeUsers" labelKey="deviceCategory" /></Section>
          <Section title="Live Campaigns"><RankList rows={data.supabase.campaigns || []} /></Section>
        </section>
      ) : null}

      {tab === 'Data Quality' ? (
        <section className="dashboard-grid">
          <Section title="Source Freshness" note="Last observed timestamps by source.">
            <div className="quality-list">
              <p><b>OK</b> Live signals: {time(data.data_quality.freshness?.live?.signals_latest)}</p>
              <p><b>OK</b> Hot leads: {time(data.data_quality.freshness?.live?.hot_leads_latest)}</p>
              <p><b>OK</b> Booking events: {time(data.data_quality.freshness?.booking?.events_latest)}</p>
              <p><b>OK</b> Trial requests: {time(data.data_quality.freshness?.booking?.requests_latest)}</p>
            </div>
          </Section>
          <Section title="Suppression and Linking" note="Internal/test rows are excluded from operational counts.">
            <RankList rows={[
              { label: 'Excluded live rows', count: data.data_quality.exclusions?.live_rows || 0 },
              { label: 'Excluded live test sessions', count: data.data_quality.exclusions?.live_test_sessions || 0 },
              { label: 'Excluded booking requests', count: data.data_quality.exclusions?.booking_request_rows || 0 },
              { label: 'Excluded booking events', count: data.data_quality.exclusions?.booking_event_rows || 0 },
              { label: 'Unlinked hot leads', count: bridge.unlinked_live_hot_leads || 0 },
              { label: 'Unlinked booking requests', count: bridge.unlinked_booking_requests || 0 },
            ]} />
          </Section>
        </section>
      ) : null}
    </main>
  )
}
