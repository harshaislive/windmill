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

const tabs = ['Overview', 'Full Funnel', 'Best To Call & Close', 'Drop-offs', 'Lead Queue', 'Acquisition', 'Data Traces', 'Data Quality']
const DASHBOARD_PASSCODE = 'Beforest@internal'
const fmt = new Intl.NumberFormat('en-IN')

const dataSources = [
  {
    label: 'Live walkthrough analytics',
    system: 'Supabase',
    project: 'mtzcvknnkeepgyyfntod',
    schema: 'analytics',
    powers: 'Live walkthrough funnel, lead queue, campaign signals, questions, FAQ and slide engagement.',
    tables: [
      'beforest_session_signals',
      'beforest_slide_metrics',
      'beforest_faq_metrics',
      'beforest_questions',
      'beforest_hot_leads_v',
      'beforest_invites',
      'beforest_subscribe_leads',
    ],
  },
  {
    label: 'Booking-site funnel truth',
    system: 'Supabase',
    project: 'isdbyvwocudnlwzghphw',
    schema: 'tencent',
    powers: 'Trial modal, date selection, room selection, checkout, payment, eZee status, and follow-up audit context.',
    tables: [
      'trial_requests',
      'trial_funnel_events',
      'trial_followup_messages',
    ],
  },
  {
    label: 'Page acquisition context',
    system: 'Google Analytics 4',
    project: 'GA4 property from Windmill variable',
    schema: 'GA4 Data API',
    powers: 'Reach, sessions, acquisition source, device, geography, and page-level engagement context.',
    tables: [
      'runReport: summary metrics',
      'runReport: acquisition dimensions',
      'runReport: device dimensions',
      'runReport: geography dimensions',
      'runReport: daily trend',
    ],
  },
]

const emptyData: DashboardData = {
  ok: false,
  generated_at: '',
  ga4: { summary: {}, acquisition: [], device: [], geography: [], events: [], daily: [] },
  supabase: { summary: {}, funnel: [], intent_signals: [], slides: [], events: [], hot_leads: [], campaigns: [], invite_sources: [] },
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
            <th>Name</th><th>Email</th><th>Phone</th><th>Temp</th><th>Score</th><th>Live trial CTA</th><th>Campaign</th><th>Last seen</th>
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

function CallCloseTable({ rows }: { rows: any[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th><th>Name</th><th>Phone</th><th>Email</th><th>Temp</th><th>Lead score</th><th>Why now</th><th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lead: any, index: number) => {
            const reasons = Array.isArray(lead.reasons) ? lead.reasons : []
            const score = num(lead.lead_score)
            const contact = lead.invitee_phone || lead.phone || lead.invitee_email || lead.email || ''
            return (
              <tr key={`${lead.session_id || contact}-${index}`}>
                <td>{index + 1}</td>
                <td>{lead.invitee_name || lead.listener_name || '-'}</td>
                <td>{lead.invitee_phone || lead.phone || '-'}</td>
                <td>{lead.invitee_email || lead.email || '-'}</td>
                <td><span className={`pill ${lead.lead_temperature}`}>{lead.lead_temperature || '-'}</span></td>
                <td>
                  <span className="score-hover" tabIndex={0}>
                    score
                    <span className="score-card">
                      <b>Lead score: {score}</b>
                      <small>{reasons.length ? reasons.join(' | ') : 'No score reasons available'}</small>
                    </span>
                  </span>
                </td>
                <td>
                  {[
                    lead.clicked_trial_stay ? 'clicked live CTA' : '',
                    lead.subscribed_for_updates ? 'shared contact details' : '',
                    lead.next_30_days ? 'near-term timing' : '',
                    reasons.slice(0, 2).join(', '),
                  ].filter(Boolean).join(' | ') || '-'}
                </td>
                <td>{time(lead.last_seen_at)}</td>
              </tr>
            )
          })}
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

function DataTraceCards() {
  return (
    <div className="trace-grid">
      {dataSources.map((source) => (
        <article className="trace-card" key={source.label}>
          <div className="trace-head">
            <span>{source.system}</span>
            <strong>{source.label}</strong>
          </div>
          <dl>
            <div><dt>Project</dt><dd>{source.project}</dd></div>
            <div><dt>Schema</dt><dd>{source.schema}</dd></div>
          </dl>
          <p>{source.powers}</p>
          <div className="trace-list">
            {source.tables.map((table) => <code key={table}>{table}</code>)}
          </div>
        </article>
      ))}
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
  const callQueue = useMemo(() => {
    return [...(data.supabase?.hot_leads || [])]
      .filter((lead: any) => lead.invitee_phone || lead.phone || lead.invitee_email || lead.email)
      .sort((a: any, b: any) => num(b.lead_score) - num(a.lead_score))
      .slice(0, 30)
  }, [data.supabase?.hot_leads])

  const overviewKpis = useMemo(() => [
    { label: 'Live walkthrough reach', value: compact(k.ga4_sessions), note: `${compact(k.ga4_users)} users reached live.10percent.beforest.co` },
    { label: 'Live walkthrough starts', value: compact(k.tracked_sessions), note: `${compact(live.presentation_started_sessions)} started the video walkthrough` },
    { label: 'Total trial intent signals', value: compact(num(k.live_trial_clicks) + num(k.trial_modal_opens)), note: `${compact(k.trial_modal_opens)} booking-site modal opens + ${compact(k.live_trial_clicks)} live CTA clicks`, tone: 'amber' },
    { label: 'Lead queue', value: compact(live.lead_queue_leads), note: `${compact(live.hot_leads)} hot, ${compact(live.warm_leads)} warm, ${compact(live.nurture_leads)} nurture`, tone: 'amber' },
    { label: 'Booking-site modal opens', value: compact(k.trial_modal_opens), note: 'Trial popup opened on 10percent.beforest.co', tone: 'clay' },
    { label: 'Paid / confirmed', value: `${compact(k.paid)} / ${compact(k.confirmed)}`, note: 'Payment truth and eZee confirmation', tone: 'ink' },
  ], [k, live])

  if (!isUnlocked) {
    return (
      <main className="access-shell">
        <section className="access-card">
          <span className="domain">live walkthrough + booking site</span>
          <h1>Beforest 10percent Funnel</h1>
          <p>Enter the shared team passcode to open the two-Supabase funnel dashboard.</p>
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
          <span className="domain">live walkthrough + booking site truth</span>
          <h1>Beforest 10percent Funnel</h1>
          <p>Live.10percent is the video walkthrough. Booking modal, dates, rooms, checkout, payment and eZee happen downstream on 10percent.beforest.co.</p>
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
            <Section title="Signal Bridge" note="How live walkthrough intent connects to booking-site truth.">
              <div className="bridge-grid">
                <article><b>BRIDGE</b><strong>{compact(bridge.linked_live_hot_leads_to_booking)}</strong><span>live hot leads linked to booking-site rows</span></article>
                <article><b>LIVE</b><strong>{compact(bridge.unlinked_live_hot_leads)}</strong><span>live hot leads not yet seen in booking-site rows</span></article>
                <article><b>BOOK</b><strong>{compact(bridge.unlinked_booking_requests)}</strong><span>booking-site requests unlinked to live walkthrough signal</span></article>
                <article><b>DONE</b><strong>{compact(booking.confirmed_bookings)}</strong><span>confirmed trial bookings</span></article>
              </div>
            </Section>
            <Section title="Current Booking-Site Truth" note="Read-only from tencent Supabase. These are downstream of the live walkthrough.">
              <RankList rows={[
                { label: 'Booking-site trial requests', count: booking.trial_requests },
                { label: 'Booking-site checkout unpaid', count: data.booking.dropoffs?.find((r: any) => r.stage === 'Booking checkout unpaid')?.count || 0 },
                { label: 'Booking-site expired unpaid', count: booking.expired_unpaid_requests },
                { label: 'Booking-site paid', count: booking.paid_requests },
                { label: 'Booking-site eZee confirmed', count: booking.confirmed_bookings },
              ]} />
            </Section>
          </section>
        </>
      ) : null}

      {tab === 'Full Funnel' ? (
        <section className="two-lane">
          <Section title="Live Walkthrough Funnel" note="True same-session progression on live.10percent.beforest.co. Parallel intent signals are kept outside this funnel.">
            <StageList rows={data.full_funnel.live_lane || []} tone="live" />
          </Section>
          <Section title="Booking-Site Funnel" note="True same-cohort progression from trial modal to payment and eZee on 10percent.beforest.co.">
            <StageList rows={data.full_funnel.booking_lane || []} tone="booking" />
          </Section>
          <Section title="Useful Signals, Not Funnel Stages" note="These can happen in parallel, so they are tracked separately and should not be read as sequential conversion.">
            <RankList rows={data.supabase.intent_signals || []} />
          </Section>
        </section>
      ) : null}

      {tab === 'Best To Call & Close' ? (
        <section className="dashboard-grid">
          <Section title="Best To Call First" note="Sorted by live walkthrough lead score. Hover or focus the score pill to reveal the full score and reasons.">
            <CallCloseTable rows={callQueue} />
          </Section>
          <Section title="Booking-Site Close Now" note="People already inside booking-site flow. Treat these as action context, not lead-score ranking.">
            <RequestsTable rows={data.booking.dropoff_requests || data.booking.requests || []} />
          </Section>
        </section>
      ) : null}

      {tab === 'Drop-offs' ? (
        <section className="dashboard-grid">
          <Section title="Booking-Site Drop-offs" note="These are downstream booking actions after someone reaches 10percent.beforest.co.">
            <RankList rows={data.booking.dropoffs || []} />
          </Section>
          <Section title="Booking-Site Drop-off Requests" note="Masked contact fields; full truth remains in Supabase.">
            <RequestsTable rows={data.booking.dropoff_requests || []} />
          </Section>
        </section>
      ) : null}

      {tab === 'Lead Queue' ? (
        <section className="dashboard-grid">
          <Section title="Live Walkthrough Lead Review Queue" note="Includes hot, warm, and nurture leads from the video walkthrough. The Hot Leads KPI is strict hot only.">
            <LeadsTable rows={data.supabase.hot_leads || []} />
          </Section>
          <Section title="Recent Booking-Site Trial Requests" note="Requests from 10percent.beforest.co with payment/eZee/follow-up status.">
            <RequestsTable rows={data.booking.requests || []} />
          </Section>
        </section>
      ) : null}

      {tab === 'Acquisition' ? (
        <section className="dashboard-grid thirds">
          <Section title="GA4 Acquisition"><RankList rows={data.ga4.acquisition || []} valueKey="sessions" labelKey="sessionSourceMedium" /></Section>
          <Section title="Device"><RankList rows={data.ga4.device || []} valueKey="activeUsers" labelKey="deviceCategory" /></Section>
          <Section title="Live Walkthrough Campaigns"><RankList rows={data.supabase.campaigns || []} /></Section>
        </section>
      ) : null}

      {tab === 'Data Traces' ? (
        <section className="dashboard-grid">
          <Section title="Source Map" note="Read-only data provenance for the dashboard. Secrets and service-role keys are never shown.">
            <DataTraceCards />
          </Section>
          <Section title="Metric Ownership" note="Use this to avoid mixing live walkthrough signals with booking-site truth.">
            <div className="trace-rules">
              <p><b>Live walkthrough lane</b> comes from `analytics` tables and represents education-layer behavior on live.10percent.beforest.co.</p>
              <p><b>Booking-site lane</b> comes from `tencent` tables and represents downstream booking behavior on 10percent.beforest.co.</p>
              <p><b>Total trial intent signals</b> is a combined signal count, not a single sequential funnel stage: booking-site modal opens plus live walkthrough CTA clicks.</p>
              <p><b>Suppression rules</b> remove internal/test rows before operational counts are shown.</p>
            </div>
          </Section>
        </section>
      ) : null}

      {tab === 'Data Quality' ? (
        <section className="dashboard-grid">
          <Section title="Source Freshness" note="Last observed timestamps by source.">
            <div className="quality-list">
              <p><b>OK</b> Live walkthrough signals: {time(data.data_quality.freshness?.live?.signals_latest)}</p>
              <p><b>OK</b> Live walkthrough lead queue: {time(data.data_quality.freshness?.live?.hot_leads_latest)}</p>
              <p><b>OK</b> Booking-site events: {time(data.data_quality.freshness?.booking?.events_latest)}</p>
              <p><b>OK</b> Booking-site trial requests: {time(data.data_quality.freshness?.booking?.requests_latest)}</p>
            </div>
          </Section>
          <Section title="Suppression and Linking" note="Internal/test rows are excluded from operational counts.">
            <RankList rows={[
              { label: 'Excluded live walkthrough rows', count: data.data_quality.exclusions?.live_rows || 0 },
              { label: 'Excluded live walkthrough test sessions', count: data.data_quality.exclusions?.live_test_sessions || 0 },
              { label: 'Excluded booking-site requests', count: data.data_quality.exclusions?.booking_request_rows || 0 },
              { label: 'Excluded booking-site events', count: data.data_quality.exclusions?.booking_event_rows || 0 },
              { label: 'Unlinked live hot leads', count: bridge.unlinked_live_hot_leads || 0 },
              { label: 'Unlinked booking-site requests', count: bridge.unlinked_booking_requests || 0 },
            ]} />
          </Section>
        </section>
      ) : null}
    </main>
  )
}
