import * as wmill from "windmill-client";

type EventRow = {
  automation_name: string;
  message_name: string;
  button_text: string;
  next_step: string;
  subscriber_id: string;
  first_name: string;
  instagram_username: string;
  click_count: number;
  last_received_at_ist: string;
};

type JourneyRow = {
  subscriber_id: string;
  first_name: string;
  instagram_username: string;
  steps: string;
  clicks: number;
  last_seen_ist: string;
};

type ButtonSummary = {
  message_name: string;
  button_text: string;
  next_step: string;
  unique_people: number;
  clicks: number;
};

function datatable() {
  return wmill.datatable("main");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function displayName(row: Pick<EventRow, "first_name" | "instagram_username" | "subscriber_id">) {
  return row.first_name || row.instagram_username || row.subscriber_id || "Unknown";
}

async function fetchDashboardData() {
  const sql = datatable();

  await sql`
    DELETE FROM manychat_button_click_events
    WHERE subscriber_id IN ('test_manychat_subscriber', 'test_manychat_route')
  `.execute();

  const summary = await sql`
    SELECT
      COUNT(DISTINCT subscriber_id)::int AS unique_people,
      COALESCE(SUM(click_count), 0)::int AS total_clicks,
      COUNT(*)::int AS tracked_events,
      MAX(last_received_at_ist)::text AS last_updated_ist
    FROM manychat_button_click_events
  `.fetchOne();

  const buttonSummary = (await sql`
    SELECT
      message_name,
      button_text,
      next_step,
      COUNT(DISTINCT subscriber_id)::int AS unique_people,
      COALESCE(SUM(click_count), 0)::int AS clicks
    FROM manychat_button_click_events
    GROUP BY message_name, button_text, next_step
    ORDER BY clicks DESC, message_name ASC, button_text ASC
  `.fetch()) as ButtonSummary[];

  const recentEvents = (await sql`
    SELECT
      automation_name,
      message_name,
      button_text,
      next_step,
      subscriber_id,
      first_name,
      instagram_username,
      click_count,
      last_received_at_ist::text AS last_received_at_ist
    FROM manychat_button_click_events
    ORDER BY last_received_at DESC
    LIMIT 50
  `.fetch()) as EventRow[];

  const journeyRows = (await sql`
    SELECT
      subscriber_id,
      COALESCE(MAX(NULLIF(first_name, '')), '') AS first_name,
      COALESCE(MAX(NULLIF(instagram_username, '')), '') AS instagram_username,
      STRING_AGG(message_name || ' -> ' || button_text, ' / ' ORDER BY last_received_at ASC) AS steps,
      COALESCE(SUM(click_count), 0)::int AS clicks,
      MAX(last_received_at_ist)::text AS last_seen_ist
    FROM manychat_button_click_events
    GROUP BY subscriber_id
    ORDER BY MAX(last_received_at) DESC
    LIMIT 30
  `.fetch()) as JourneyRow[];

  return { summary, buttonSummary, recentEvents, journeyRows };
}

function renderButtonSummary(rows: ButtonSummary[]) {
  if (!rows.length) {
    return `<div class="empty">No button clicks captured yet.</div>`;
  }
  return rows
    .map(
      (row, index) => `
        <tr>
          <td>${String(index + 1).padStart(2, "0")}</td>
          <td>${escapeHtml(row.message_name)}</td>
          <td>${escapeHtml(row.button_text)}</td>
          <td>${escapeHtml(row.next_step)}</td>
          <td>${row.unique_people}</td>
          <td>${row.clicks}</td>
        </tr>
      `,
    )
    .join("");
}

function renderRecentEvents(rows: EventRow[]) {
  if (!rows.length) {
    return `<div class="empty">No recent events.</div>`;
  }
  return rows
    .map(
      (row) => `
        <div class="event-row">
          <div>
            <strong>${escapeHtml(row.button_text)}</strong>
            <span>${escapeHtml(row.message_name)} -> ${escapeHtml(row.next_step)}</span>
          </div>
          <div>
            <strong>${escapeHtml(displayName(row))}</strong>
            <span>${escapeHtml(row.instagram_username || row.subscriber_id)}</span>
          </div>
          <time>${escapeHtml(row.last_received_at_ist)}</time>
        </div>
      `,
    )
    .join("");
}

function renderJourneys(rows: JourneyRow[]) {
  if (!rows.length) {
    return `<div class="empty">No journeys captured yet.</div>`;
  }
  return rows
    .map(
      (row) => `
        <div class="journey">
          <div class="journey-head">
            <strong>${escapeHtml(row.first_name || row.instagram_username || row.subscriber_id)}</strong>
            <span>${row.clicks} clicks</span>
          </div>
          <p>${escapeHtml(row.steps)}</p>
          <small>Last seen: ${escapeHtml(row.last_seen_ist)}</small>
        </div>
      `,
    )
    .join("");
}

function html(data: Awaited<ReturnType<typeof fetchDashboardData>>) {
  const summary = data.summary ?? {};
  const lastUpdated = summary.last_updated_ist || "No clicks yet";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ManyChat Journey Dashboard</title>
  <style>
    :root {
      --ink: #111;
      --muted: #5b5b5b;
      --paper: #fdfbf7;
      --line: #222;
      --blue: #e8f1fb;
      --green: #edf8e8;
      --yellow: #fff2cf;
      --pink: #fde7e7;
      --shadow: rgba(20, 20, 20, 0.14);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    }
    .shell { max-width: 1480px; margin: 0 auto; padding: 30px; }
    header {
      border-bottom: 1px solid var(--line);
      padding-bottom: 28px;
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
    }
    .eyebrow {
      display: inline-block;
      background: var(--ink);
      color: white;
      padding: 10px 14px;
      font-weight: 800;
      margin-bottom: 22px;
    }
    h1 { font-size: clamp(42px, 7vw, 92px); line-height: 0.95; margin: 0; letter-spacing: 0; }
    .sub { color: var(--muted); max-width: 740px; font-size: 18px; line-height: 1.45; margin-top: 16px; }
    .refresh {
      color: var(--ink);
      border: 1px solid var(--line);
      background: var(--green);
      padding: 15px 22px;
      font: inherit;
      font-weight: 800;
      box-shadow: 5px 5px 0 var(--shadow);
      cursor: pointer;
      white-space: nowrap;
    }
    .status { margin-top: 14px; color: var(--muted); font-size: 14px; text-align: right; }
    .cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin: 28px 0;
    }
    .card {
      border: 1px solid var(--line);
      padding: 22px;
      min-height: 150px;
      box-shadow: 6px 6px 0 var(--shadow);
    }
    .card:nth-child(1) { background: var(--blue); }
    .card:nth-child(2) { background: var(--green); }
    .card:nth-child(3) { background: var(--yellow); }
    .card:nth-child(4) { background: var(--pink); }
    .label { color: var(--muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0; }
    .value { font-size: 48px; font-weight: 900; margin-top: 18px; }
    .note { color: var(--muted); margin-top: 12px; font-weight: 700; }
    .grid {
      display: grid;
      grid-template-columns: 1.35fr 1fr;
      gap: 22px;
      align-items: start;
    }
    section {
      border: 1px solid var(--line);
      background: #fffefb;
      margin-bottom: 22px;
      box-shadow: 6px 6px 0 var(--shadow);
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 18px 22px;
      border-bottom: 1px solid var(--line);
      background: #f4f1e9;
    }
    h2 { margin: 0; font-size: 28px; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border-bottom: 1px solid #ddd6ca;
      padding: 15px 18px;
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--muted); text-transform: uppercase; font-size: 14px; }
    td { font-weight: 700; }
    .event-row, .journey {
      display: grid;
      gap: 12px;
      padding: 17px 20px;
      border-bottom: 1px solid #ddd6ca;
    }
    .event-row {
      grid-template-columns: 1.1fr 0.8fr auto;
      align-items: center;
    }
    .event-row span, .journey small, .journey p { color: var(--muted); }
    .event-row span { display: block; margin-top: 5px; }
    .journey-head { display: flex; justify-content: space-between; gap: 16px; }
    .journey p { margin: 0; line-height: 1.45; }
    .empty { padding: 28px; color: var(--muted); font-weight: 800; }
    @media (max-width: 1000px) {
      .cards, .grid { grid-template-columns: 1fr; }
      header { flex-direction: column; }
      .status { text-align: left; }
      .event-row { grid-template-columns: 1fr; }
      table { min-width: 860px; }
      .table-wrap { overflow-x: auto; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div>
        <span class="eyebrow">MANYCHAT JOURNEY</span>
        <h1>Instagram DM Click Dashboard</h1>
        <p class="sub">Tracks which path each follower chooses inside the #0_New_Followers DM automation, including website clicks, go-back behavior, and second choices after returning to the menu.</p>
      </div>
      <div>
        <button class="refresh" onclick="location.reload()">Refresh</button>
        <div class="status">Last updated: ${escapeHtml(lastUpdated)} IST</div>
      </div>
    </header>

    <div class="cards">
      <div class="card"><div class="label">Unique People</div><div class="value">${summary.unique_people ?? 0}</div><div class="note">Contacts with tracked clicks</div></div>
      <div class="card"><div class="label">Total Clicks</div><div class="value">${summary.total_clicks ?? 0}</div><div class="note">All tracked button clicks</div></div>
      <div class="card"><div class="label">Tracked Events</div><div class="value">${summary.tracked_events ?? 0}</div><div class="note">Unique journey rows</div></div>
      <div class="card"><div class="label">Automation</div><div class="value">01</div><div class="note">#0_New_Followers DM</div></div>
    </div>

    <div class="grid">
      <section>
        <div class="section-head">
          <h2>Button Performance</h2>
          <strong>Clicks first</strong>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Message</th>
                <th>Button</th>
                <th>Next Step</th>
                <th>People</th>
                <th>Clicks</th>
              </tr>
            </thead>
            <tbody>${renderButtonSummary(data.buttonSummary)}</tbody>
          </table>
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2>Recent Clicks</h2>
          <strong>Latest first</strong>
        </div>
        ${renderRecentEvents(data.recentEvents)}
      </section>
    </div>

    <section>
      <div class="section-head">
        <h2>Follower Journeys</h2>
        <strong>Per contact</strong>
      </div>
      ${renderJourneys(data.journeyRows)}
    </section>
  </main>
</body>
</html>`;
}

export async function main() {
  const data = await fetchDashboardData();
  return {
    windmill_content_type: "text/html; charset=utf-8",
    result: html(data),
  };
}
