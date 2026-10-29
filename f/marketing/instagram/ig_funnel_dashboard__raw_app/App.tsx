import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './wmill'

type FunnelStage = {
  key: string
  label: string
  value: number
  conversion_from_previous: number
  available?: boolean
  availability_message?: string
  owner_hint: string
}

type ContentRow = {
  id: string
  timestamp: string
  media_type: string
  caption: string
  permalink?: string
  reach: number
  total_interactions: number
  likes: number
  comments: number
  shares: number
  saves: number
  views: number
  profile_visits: number | null
  follows: number | null
  profile_activity: number | null
  bio_link_clicks: number | null
  engagement_rate: number
}

type AudienceRow = {
  label: string
  value: number
  percent: number
}

type DashboardData = {
  ok: boolean
  generated_at: string
  window: { start_date: string; end_date: string; timezone: string }
  account: { page_name: string; ig_username: string; followers_count: number; media_count: number }
  warnings?: string[]
  availability?: {
    new_followers?: { available: boolean; message: string }
  }
  demographics?: {
    timeframe: string
    note: string
    gender: AudienceRow[]
    age: AudienceRow[]
    city: AudienceRow[]
    country: AudienceRow[]
  }
  funnel: FunnelStage[]
  rates: Record<string, number | null>
  engagement: Record<string, number>
  daily: Record<string, Array<{ date: string; value: number }>>
  content: ContentRow[]
}

type CommentRow = {
  comment_id: string
  username: string
  text: string
  timestamp: string
  age_hours: number
  media_type: string
  media_permalink?: string
  media_caption?: string
  suggested_owner: string
}

type CommentsData = {
  ok: boolean
  availability?: string
  message?: string
  generated_at: string
  scanned_media: number
  total_comments: number
  answered_comments: number
  unanswered_count: number
  unanswered: CommentRow[]
}

type SnapshotResponse = {
  ready: boolean
  state?: 'ready' | 'partial' | 'not_available' | 'invalid_range'
  message?: string
  canFetch?: boolean
  fetchedOnDemand?: boolean
  exactWindow?: boolean
  source?: string
  snapshotDate?: string
  generatedAt?: string
  windowStart?: string
  windowEnd?: string
  funnel?: DashboardData
  comments?: CommentsData
  requestedWindow?: { start_date: string; end_date: string }
  displayedWindow?: { start_date: string; end_date: string }
  availableSnapshots?: Array<{ snapshot_key: string; snapshot_date: string; window_start: string; window_end: string; generated_at: string }>
}

const fmt = new Intl.NumberFormat('en-IN')
const tabs = ['Overview', 'Strategy', 'Glossary']

const strategyNotes = [
  {
    title: 'Read the funnel from left to right',
    body: 'Reach tells us how many accounts saw Beforest. Profile visits show curiosity. Follows show permission to keep speaking. Website taps are the strongest Instagram-native commitment action in this dashboard.',
  },
  {
    title: 'Use variance as an ownership signal',
    body: 'If reach is weak, the content head should inspect hooks, formats, and shareability. If profile visits are weak, the post promise or profile promise is unclear. If website taps are weak, sharpen the link-in-bio path and call to action.',
  },
  {
    title: 'Separate popularity from commitment',
    body: 'Likes and comments are useful engagement signals, but saves, shares, profile visits, follows, and website taps are closer to intent. The dashboard is meant to show where attention becomes action.',
  },
  {
    title: 'Close the conversation loop',
    body: 'The unanswered comments queue shows comments where Beforest has not replied in the fetched thread. Treat it as a daily care queue, not just a moderation list.',
  },
]

const decisionRules = [
  {
    title: 'Funnel status thresholds',
    body: 'Reach is OK when it is above zero. For later steps, MISS means the step value is zero, WATCH means conversion from the previous funnel step is below 1%, SPIKE means conversion is above 20%, and OK means it sits between those bands.',
  },
  {
    title: 'Team Action logic',
    body: 'The Team Action panel shows funnel steps that are not OK first. If every step is OK, it still shows Profile Visits, New Followers, and Website Taps as the regular operating checklist.',
  },
  {
    title: 'ER benchmark logic',
    body: 'ER is calculated per post or reel as total interactions divided by reach. Use it to compare how strongly content worked after it was seen; it is different from the Accounts Engaged rate in the overview cards.',
  },
  {
    title: 'Content ranking',
    body: 'The Content Leaderboard is currently ranked by total interactions. This surfaces high-response posts first, but it is not yet an automated creative-review queue.',
  },
  {
    title: 'Manual creative review rule',
    body: 'Review a creative manually when reach is decent but ER is weak, profile visits or bio link clicks are low, saves and shares are absent, or comments show unanswered questions. These are strategy rules today, not hard auto-flags.',
  },
  {
    title: 'Comment queue rule',
    body: 'The unanswered-comments queue scans recent media from the last 30 days. A comment appears when it is from someone other than Beforest and no fetched reply from a Beforest account username is found.',
  },
  {
    title: 'Follower data limitation',
    body: 'New followers are available only for recent supported dates from Meta. Follower demographics are lifetime follower-base breakdowns, not selected-window follower gains.',
  },
  {
    title: 'Next automation candidate',
    body: 'A future creative-review queue can be added using configurable thresholds such as low ER versus account average, high reach with low profile visits, high interactions with no website taps, or unanswered comments on a post.',
  },
]

const glossary = [
  ['Reach', 'Unique Instagram accounts that saw the content in the selected window. This is the top of the funnel.'],
  ['Profile visits', 'Visits to the Beforest Instagram profile. This is the first sign that content made someone curious enough to inspect us.'],
  ['New followers', 'Followers gained in the selected window. Meta only returns this daily metric for recent supported dates, so older ranges may show a warning.'],
  ['Website taps', 'Clicks from Instagram to the website or configured link. This is currently treated as the final commitment action inside the IG funnel.'],
  ['Funnel conversion', 'The percentage shown inside each funnel step is conversion from the previous funnel step. It is not a previous-period date comparison.'],
  ['Profile visit rate', 'Profile visits divided by reach. It answers: how well did reach convert into curiosity?'],
  ['Follow rate', 'New followers divided by profile visits. It answers: how convincing was the account once people arrived?'],
  ['Website tap rate', 'Website taps divided by profile visits. It answers: how well did the profile move people toward the website?'],
  ['Reach to website', 'Website taps divided by reach. This is the overall Instagram funnel efficiency for the selected window.'],
  ['Accounts engaged', 'Instagram accounts that meaningfully engaged with content in the selected window. Read this alongside interactions, not as a replacement for funnel conversion.'],
  ['Accounts engaged rate', 'Accounts engaged divided by reach. This is the overview engagement rate shown in the Accounts Engaged card.'],
  ['Interactions', 'Total content interactions reported by Meta, including likes, comments, shares, saves, and other supported interaction types.'],
  ['ER', 'Post-level engagement rate in the Content Leaderboard: total interactions divided by that post or reel reach. If Meta does not return total interactions, the dashboard falls back to likes + comments + shares + saves.'],
  ['Likes', 'Likes reported by Meta for a post or reel. If the insight is unavailable, the dashboard uses the media like count.'],
  ['Comments', 'Comment interactions reported by Meta for a post or reel. If the insight is unavailable, the dashboard uses the media comment count.'],
  ['Saves', 'A private intent signal. People save posts they may want to revisit.'],
  ['Shares', 'A distribution signal. People share posts they think are useful or identity-relevant to someone else.'],
  ['Views', 'Views or plays reported by Meta for eligible Instagram content. This is especially useful for Reels and video-style posts.'],
  ['Story replies', 'Direct replies to Instagram stories. This is a stronger conversation signal than a passive view.'],
  ['Bio link clicks', 'Post-attributed profile activity where Meta reports that a viewer tapped the bio or profile link after engaging with that post. Some video/Reel media do not expose this metric, so the table shows N/A instead of zero.'],
  ['Profile activity', 'Post-attributed actions on the profile that Meta exposes through profile_activity. Bio link clicks are pulled from this breakdown when available.'],
  ['N/A', 'Meta did not expose that post-level attribution metric for this media type or post. It should not be read as zero.'],
  ['Daily reach', 'Daily Instagram reach values returned by Meta for the selected date window.'],
  ['Daily followers', 'Daily new follower counts where Meta supports the requested date range. Unsupported dates can trigger a warning.'],
  ['Content leaderboard', 'Recent content in the selected date window, ranked by total interactions so high-response posts surface first.'],
  ['Team action', 'Rule-based ownership hints from the funnel: weak reach points to content hooks, weak profile visits points to the profile promise, and weak website taps points to CTA/link path.'],
  ['Follower demographics', 'Aggregated lifetime follower-base age, gender, city, and country breakdowns from Meta. This is not followers gained in the selected window, and profession is not exposed by the Instagram Graph API.'],
  ['Unanswered comments', 'Top-level comments from non-Beforest users where no fetched reply from the Beforest account was found.'],
  ['Answered comments', 'Top-level non-Beforest comments where a fetched reply from one of the Beforest account usernames was found.'],
  ['Comment scan window', 'The unanswered-comments queue scans recent media from the last 30 days. It is separate from the selected dashboard date window.'],
  ['Scanned media', 'Number of recent Instagram media items checked for comments in the comment-health scan.'],
  ['Suggested owner', 'Default follow-up ownership hint shown beside each unanswered comment. Today it points to the community or content team.'],
]

function isoDate(daysBack: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysBack)
  return date.toISOString().slice(0, 10)
}

function compact(value: unknown) {
  return fmt.format(Math.round(Number(value || 0)))
}

function pct(value: unknown) {
  return `${Number(value || 0).toFixed(2)}%`
}

function metricCell(value: number | null | undefined) {
  if (value === null || value === undefined) return <span className="muted-cell" title="Meta does not expose this post-level profile attribution metric for this media type.">N/A</span>
  return compact(value)
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

function shortDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T00:00:00+05:30`))
}

function statusFor(stage: FunnelStage) {
  if (stage.available === false) return 'UNAVAILABLE'
  if (stage.key === 'reach') return stage.value > 0 ? 'OK' : 'MISS'
  if (stage.value === 0) return 'MISS'
  if (stage.conversion_from_previous < 1) return 'WATCH'
  if (stage.conversion_from_previous > 20) return 'SPIKE'
  return 'OK'
}

function Sparkline({ rows, tone = 'blue', yLabel }: { rows: Array<{ date?: string; value: number }>; tone?: string; yLabel: string }) {
  const visibleRows = rows.slice(-31)
  const values = visibleRows.map((row) => Number(row.value || 0))
  const max = Math.max(1, ...values)
  const mid = Math.round(max / 2)
  const firstDate = visibleRows[0]?.date
  const lastDate = visibleRows[visibleRows.length - 1]?.date
  return (
    <div className="chart-frame">
      <div className="axis-title">Y: {yLabel}</div>
      <div className="chart-body">
        <div className="y-axis" aria-hidden="true">
          <span>{compact(max)}</span>
          <span>{compact(mid)}</span>
          <span>0</span>
        </div>
        <div className={`spark ${tone}`} aria-label={`Daily ${yLabel} chart`}>
          {visibleRows.map((row, index) => (
            <i
              key={`${row.date || index}-${row.value}`}
              data-tip={`${row.date || `Day ${index + 1}`}: ${compact(row.value)}`}
              title={`${row.date || `Day ${index + 1}`}: ${compact(row.value)}`}
              style={{ height: `${Math.max(8, (Number(row.value || 0) / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="x-axis">
        <span>{shortDate(firstDate)}</span>
        <b>X: Date</b>
        <span>{shortDate(lastDate)}</span>
      </div>
    </div>
  )
}

function ChartPanel({ title, rows, note, tone, yLabel }: { title: string; rows: Array<{ date: string; value: number }>; note: string; tone: string; yLabel: string }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0)
  const summary = note === 'daily values' ? `${rows.length} daily values` : `${compact(total)} ${note}`
  return (
    <div className="panel mini-chart">
      <div className="section-head">
        <h2>{title}</h2>
        <span>{summary}</span>
      </div>
      <Sparkline rows={rows} tone={tone} yLabel={yLabel} />
    </div>
  )
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

function AudienceChart({ title, rows, limit = 10 }: { title: string; rows: AudienceRow[]; limit?: number }) {
  const visibleRows = rows.slice(0, limit)
  const max = Math.max(1, ...visibleRows.map((row) => Number(row.value || 0)))
  return (
    <article className="audience-chart">
      <div className="audience-title">
        <h3>{title}</h3>
        <span>{visibleRows.length ? `${visibleRows.length} groups` : 'no data'}</span>
      </div>
      <div className="audience-bars">
        {visibleRows.map((row) => (
          <div className="bar-row" key={`${title}-${row.label}`}>
            <span title={row.label}>{row.label}</span>
            <i aria-hidden="true"><b style={{ width: `${Math.max(3, (Number(row.value || 0) / max) * 100)}%` }} /></i>
            <strong>{compact(row.value)} <em>{pct(row.percent)}</em></strong>
          </div>
        ))}
        {!visibleRows.length ? <p>No demographic rows returned by Meta for this breakdown.</p> : null}
      </div>
    </article>
  )
}

function AudienceBreakdown({ demographics }: { demographics?: DashboardData['demographics'] }) {
  if (!demographics) return null
  return (
    <section className="panel audience-panel">
      <div className="section-head">
        <h2>Follower Demographics</h2>
        <span>{demographics.timeframe.replace(/_/g, ' ')} · aggregated by Meta</span>
      </div>
      <div className="audience-grid">
        <AudienceChart title="Gender" rows={demographics.gender || []} />
        <AudienceChart title="Age" rows={demographics.age || []} />
        <AudienceChart title="Top Countries" rows={demographics.country || []} />
        <AudienceChart title="Top Cities" rows={demographics.city || []} />
      </div>
      <p className="audience-note">{demographics.note}</p>
    </section>
  )
}

function Funnel({ rows }: { rows: FunnelStage[] }) {
  return (
    <div className="funnel">
      {rows.map((row, index) => {
        const status = statusFor(row)
        const stageFlex = Math.max(0.86, 1.16 - index * 0.1)
        const stageHeight = Math.max(132, 188 - index * 16)
        return (
          <article
            className={`stage ${status.toLowerCase()}`}
            key={row.key}
            title={row.owner_hint}
            style={{
              ['--step' as any]: index,
              ['--stage-flex' as any]: stageFlex,
              ['--stage-height' as any]: `${stageHeight}px`,
            }}
          >
            <div>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{row.label}</strong>
              <em>{row.available === false ? 'N/A' : compact(row.value)}</em>
              <small>{row.available === false ? row.availability_message : index === 0 ? 'base' : `${pct(row.conversion_from_previous)} from previous step`}</small>
              <b>{status}</b>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ContentTable({ rows }: { rows: ContentRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>Post</th>
            <th>Reach</th>
            <th>Bio link clicks</th>
            <th>Profile visits</th>
            <th>Follows</th>
            <th>Views</th>
            <th>Interactions</th>
            <th>Saves</th>
            <th>Shares</th>
            <th>Comments</th>
            <th>ER</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={row.id}>
              <td>{dateTime(row.timestamp)}</td>
              <td><span className="tag">{row.media_type}</span></td>
              <td className="clip">
                {row.permalink ? <a href={row.permalink} target="_blank" rel="noreferrer">{row.caption || row.id}</a> : row.caption || row.id}
              </td>
              <td>{compact(row.reach)}</td>
              <td>{metricCell(row.bio_link_clicks)}</td>
              <td>{metricCell(row.profile_visits)}</td>
              <td>{metricCell(row.follows)}</td>
              <td>{compact(row.views)}</td>
              <td>{compact(row.total_interactions)}</td>
              <td>{compact(row.saves)}</td>
              <td>{compact(row.shares)}</td>
              <td>{compact(row.comments)}</td>
              <td>{pct(row.engagement_rate)}</td>
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={13}>No content found in this date window.</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function CommentsQueue({ rows }: { rows: CommentRow[] }) {
  return (
    <div className="comments">
      {rows.slice(0, 16).map((row) => (
        <article key={row.comment_id} className="comment">
          <div className="comment-head">
            <strong>@{row.username}</strong>
            <span>{Math.round(row.age_hours)}h open</span>
            <b>{row.suggested_owner}</b>
          </div>
          <p>{row.text || '(no text)'}</p>
          <small>{dateTime(row.timestamp)} · {row.media_type} · {row.media_permalink ? <a href={row.media_permalink} target="_blank" rel="noreferrer">open post</a> : 'no link'}</small>
        </article>
      ))}
      {!rows.length ? <div className="empty">No unanswered comments found in the scanned window.</div> : null}
    </div>
  )
}

export default function App() {
  const [startDate, setStartDate] = useState(isoDate(30))
  const [endDate, setEndDate] = useState(isoDate(1))
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [activeTab, setActiveTab] = useState('Overview')
  const [data, setData] = useState<DashboardData | null>(null)
  const [comments, setComments] = useState<CommentsData | null>(null)
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotResponse | null>(null)
  const [snapshotDate, setSnapshotDate] = useState('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<'idle' | 'checking' | 'fetching' | 'ready' | 'partial' | 'unavailable' | 'invalid' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const loading = phase === 'checking' || phase === 'fetching'

  function clearDisplayedData() {
    setData(null)
    setComments(null)
    setSnapshotMeta(null)
  }

  async function callSnapshot(candidatePasscode: string, fetchIfMissing: boolean) {
    return await (backend.fetch_ig_dashboard_snapshot as any)({
      snapshot_date: snapshotDate,
      start_date: startDate,
      end_date: endDate,
      dashboard_passcode: candidatePasscode,
      fetch_if_missing: fetchIfMissing,
    }) as SnapshotResponse
  }

  function applySnapshot(snapshot: SnapshotResponse) {
    setSnapshotMeta(snapshot)
    if (!snapshot.ready) {
      setData(null)
      setComments(null)
      setPhase(snapshot.state === 'invalid_range' ? 'invalid' : 'unavailable')
      setStatusMessage(snapshot.message || 'Data is not available for this selection.')
      return
    }
    setData(snapshot.funnel || null)
    setComments(snapshot.comments || null)
    const partial = snapshot.state === 'partial' || Boolean(snapshot.funnel?.warnings?.length)
    setPhase(partial ? 'partial' : 'ready')
    const source = snapshot.fetchedOnDemand ? 'Fetched from Meta and saved for future visits.' : 'Loaded from the stored dashboard snapshot.'
    setStatusMessage(`Showing ${snapshot.windowStart} to ${snapshot.windowEnd}. ${source}`)
  }

  async function load(candidatePasscode = passcode, unlocking = false) {
    if (!candidatePasscode.trim()) {
      setPasscodeError('Enter the dashboard passcode.')
      return
    }
    setPhase('checking')
    setStatusMessage('Checking access and looking for an exact stored snapshot…')
    setError('')
    setPasscodeError('')
    clearDisplayedData()
    try {
      let snapshot = await callSnapshot(candidatePasscode, false)
      if (unlocking) setIsUnlocked(true)
      if (!snapshot.ready && snapshot.state === 'not_available' && snapshot.canFetch && !snapshotDate) {
        setSnapshotMeta(snapshot)
        setPhase('fetching')
        setStatusMessage(`No stored data exists for ${startDate} to ${endDate}. Fetching it from Meta now; this usually takes 15–40 seconds…`)
        snapshot = await callSnapshot(candidatePasscode, true)
      }
      applySnapshot(snapshot)
    } catch (err: any) {
      const message = err?.message || String(err)
      if (message.toLowerCase().includes('invalid dashboard passcode')) {
        setIsUnlocked(false)
        setPasscodeError('That passcode is not correct.')
        setPhase('idle')
        setStatusMessage('')
        return
      }
      setPhase('error')
      setError(message)
      setStatusMessage('The dashboard could not load this selection. No other date range is being shown.')
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    load()
  }

  function unlockDashboard(event: FormEvent) {
    event.preventDefault()
    load(passcode, true)
  }

  const actionRows = useMemo(() => {
    if (!data) return []
    return data.funnel.filter((stage) => statusFor(stage) !== 'OK').slice(0, 4)
  }, [data])

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <span>Instagram Funnel Dashboard</span>
          <span>{data ? `@${data.account.ig_username}` : 'waiting for data'}</span>
        </header>

        <section className="prompt">
          <code>ig_funnel --window {startDate}..{endDate}</code>
          <h1>Instagram Funnel Dashboard</h1>
          <p>New Reach &gt; Profile Visits &gt; Followers &gt; Website Taps</p>
        </section>

        {!isUnlocked ? (
          <section className="access-panel">
            <span className="domain">beforest instagram</span>
            <h2>Instagram Funnel Dashboard</h2>
            <p>Enter the team passcode to open the live Instagram funnel and comment health dashboard.</p>
            <form onSubmit={unlockDashboard}>
              <label htmlFor="dashboard-passcode">Passcode</label>
              <div className="access-input">
                <input
                  id="dashboard-passcode"
                  type="password"
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
                <button type="submit" disabled={phase === 'checking'}>{phase === 'checking' ? 'Checking…' : 'Open'}</button>
              </div>
              {passcodeError ? <small>{passcodeError}</small> : null}
            </form>
          </section>
        ) : (
          <>

        <form className="controls" onSubmit={submit}>
          <label>Snapshot
            <select value={snapshotDate} onChange={(event) => setSnapshotDate(event.target.value)} disabled={loading}>
              <option value="">Use selected dates</option>
              {(snapshotMeta?.availableSnapshots || []).map((snapshot) => (
                <option key={snapshot.snapshot_key} value={snapshot.snapshot_key}>
                  {snapshot.window_start} to {snapshot.window_end}
                </option>
              ))}
            </select>
          </label>
          <label>Start<input value={startDate} onChange={(event) => { setStartDate(event.target.value); setSnapshotDate('') }} type="date" disabled={loading} /></label>
          <label>End<input value={endDate} onChange={(event) => { setEndDate(event.target.value); setSnapshotDate('') }} type="date" max={isoDate(1)} disabled={loading} /></label>
          <span className="control-note">
            <strong>New followers:</strong> Meta provides this stat only for the latest 30 completed days—currently {shortDate(isoDate(30))} to {shortDate(isoDate(1))}. Older ranges show N/A. Other metrics support up to 30 days or one complete calendar month.
          </span>
          <button type="submit" disabled={loading}>{phase === 'fetching' ? 'Fetching…' : phase === 'checking' ? 'Checking…' : 'Load exact range'}</button>
        </form>

        <div className={`data-state ${phase}`} role="status" aria-live="polite">
          <b>{phase === 'checking' ? 'Checking data' : phase === 'fetching' ? 'Fetching from Meta' : phase === 'ready' ? 'Data available' : phase === 'partial' ? 'Data available with limitations' : phase === 'invalid' ? 'Date range not supported' : phase === 'unavailable' ? 'Data not available' : phase === 'error' ? 'Could not load data' : 'Choose a date range'}</b>
          <span>{statusMessage || 'Select a period and load the exact range.'}</span>
          {loading ? <i aria-hidden="true" /> : null}
        </div>

        <nav className="tabbar" aria-label="Dashboard sections">
          {tabs.map((tab) => (
            <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>

        {error ? <div className="error">{error}</div> : null}
        {data?.warnings?.length ? (
          <div className="warning">{data.warnings.join(' ')}</div>
        ) : null}

        {activeTab === 'Strategy' ? (
          <section className="panel docs-panel">
            <div className="section-head">
              <h2>Strategy</h2>
              <span>how to read and act on this dashboard</span>
            </div>
            <div className="docs-grid">
              {strategyNotes.map((note, index) => (
                <article key={note.title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{note.title}</h3>
                  <p>{note.body}</p>
                </article>
              ))}
            </div>
            <div className="section-head subhead">
              <h2>Decision Rules</h2>
              <span>benchmarks, thresholds, and review logic</span>
            </div>
            <div className="docs-grid">
              {decisionRules.map((note, index) => (
                <article key={note.title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{note.title}</h3>
                  <p>{note.body}</p>
                </article>
              ))}
            </div>
            <p className="rate-note">
              Snapshot discipline: the dashboard reads the latest stored Instagram snapshot. The scheduled sync handles Meta API calls, so regular dashboard viewing does not add API pressure.
            </p>
          </section>
        ) : null}

        {activeTab === 'Glossary' ? (
          <section className="panel docs-panel">
            <div className="section-head">
              <h2>Glossary</h2>
              <span>plain-English metric definitions</span>
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

        {data && activeTab === 'Overview' ? (
          <>
            <section className="panel">
              <div className="section-head">
                <h2>Funnel Efficiency</h2>
                <span>{data.window.start_date} to {data.window.end_date} · snapshot {snapshotMeta?.snapshotDate || '-'} · refreshed {dateTime(data.generated_at)}</span>
              </div>
              <Funnel rows={data.funnel} />
            </section>

            <section className="metrics-grid">
              <Metric label="Profile Visit Rate" value={pct(data.rates.profile_visit_rate)} note="Profile visits from reach" tone="blue" />
              <Metric
                label="Follow Rate"
                value={data.availability?.new_followers?.available === false ? 'N/A' : pct(data.rates.follow_rate_from_profile)}
                note={data.availability?.new_followers?.available === false
                  ? data.availability.new_followers.message
                  : 'Followers from profile visits'}
                tone="green"
              />
              <Metric label="Website Tap Rate" value={pct(data.rates.website_tap_rate_from_profile)} note="Website taps from profile visits" tone="amber" />
              <Metric label="Full Funnel Rate" value={pct(data.rates.final_reach_to_website_rate)} note="Website taps from total reach" tone="pink" />
              <Metric label="Accounts Engaged" value={compact(data.engagement.accounts_engaged)} note={`${pct(data.engagement.engagement_rate_by_reach)} of reach`} />
              <Metric label="Interactions" value={compact(data.engagement.total_interactions)} note={`${compact(data.engagement.likes)} likes · ${compact(data.engagement.comments)} comments`} />
              <Metric label="Saves / Shares" value={`${compact(data.engagement.saves)} / ${compact(data.engagement.shares)}`} note="Intent and distribution signal" />
              <Metric label="Story Replies" value={compact(data.engagement.story_replies)} note="Direct response signal" />
            </section>

            <section className="split">
              <ChartPanel title="Daily Reach" rows={data.daily.reach || []} note="daily values" tone="blue" yLabel="Reach" />
              <div className="panel">
                <div className="section-head">
                  <h2>Team Action</h2>
                  <span>{actionRows.length ? 'watch these' : 'no immediate variance'}</span>
                </div>
                <div className="actions">
                  {(actionRows.length ? actionRows : data.funnel.slice(1, 4)).map((row) => (
                    <article key={row.key}>
                      <b>{row.label}</b>
                      <span>{statusFor(row)}</span>
                      <p>{row.owner_hint}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="chart-grid">
              <ChartPanel title="Daily Profile Visits" rows={data.daily.profile_visits || []} note="profile visits" tone="violet" yLabel="Profile visits" />
              {data.availability?.new_followers?.available === false ? (
                <div className="panel mini-chart">
                  <div className="section-head">
                    <h2>Daily Followers</h2>
                    <span>not available</span>
                  </div>
                  <div className="availability-note">{data.availability.new_followers.message}</div>
                </div>
              ) : (
                <ChartPanel title="Daily Followers" rows={data.daily.followers || []} note="new followers" tone="green" yLabel="New followers" />
              )}
              <ChartPanel title="Daily Website Taps" rows={data.daily.website_clicks || []} note="website taps" tone="amber" yLabel="Website taps" />
            </section>

            <section className="panel">
              <div className="section-head">
                <h2>Content Leaderboard</h2>
                <span>ranked by interactions</span>
              </div>
              <ContentTable rows={data.content} />
            </section>
          </>
        ) : null}

        {data && activeTab === 'Overview' ? <section className="panel">
          <div className="section-head">
            <h2>Unanswered Comments</h2>
            <span>{comments?.availability === 'not_available_for_historical_window' ? 'not available for historical ranges' : comments ? `${comments.unanswered_count} open · showing first 16 · ${comments.scanned_media} posts / 30 days scanned` : 'not available'}</span>
          </div>
          {comments?.availability === 'not_available_for_historical_window' ? (
            <div className="availability-note">{comments.message}</div>
          ) : (
            <>
              <p className="queue-note">A comment enters this queue when it is a top-level comment from someone other than Beforest and none of its fetched replies are from the Beforest account.</p>
              <CommentsQueue rows={comments?.unanswered || []} />
            </>
          )}
        </section> : null}
        {activeTab === 'Overview' ? <AudienceBreakdown demographics={data?.demographics} /> : null}
          </>
        )}
      </div>
    </main>
  )
}
