import * as wmill from "windmill-client";

const ZOOM_ACCOUNT_ID_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/zoom_account_id";
const ZOOM_AUTHORIZATION_BASIC_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/zoom_authorization_basic";
const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const ZOOM_USER_EMAIL = "connect@beforest.co";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const CALENDAR_PREBOOK_SCRIPT_PATH = "f/sales/calendar_prebook_1on1";
const THIS_SCRIPT_PATH = "f/sales/sync_webinar_attendance_and_prebook";
const LEGACY_WEBINAR_ENABLED_VARIABLE_PATH = "f/sales/legacy_webinar_enabled";
const BEFOREST_ADMIN_USER_ID = 18891506;

const WEBINAR_PENDING_LABEL_ID = 111;
const WEBINAR_ATTENDED_LABEL_ID = 112;
const ONE_ON_ONE_TBC_LABEL_ID = 115;

const INITIAL_EVENT_STAGE_BY_PIPELINE: Record<number, number> = {
  1: 1,
  2: 14,
  3: 21,
  4: 30,
};

const DEAL_FIELDS = {
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
  meetingReferenceId: "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50",
};

type Mode = "ensure_meeting_jobs" | "sync_attendance" | "prebook_after_webinar";

async function legacyWebinarEnabled(): Promise<boolean> {
  return (await wmill.getVariable(LEGACY_WEBINAR_ENABLED_VARIABLE_PATH).catch(() => "")).toLowerCase() === "true";
}

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeEmail(value: unknown): string {
  return asString(value).toLowerCase();
}

function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function labelIds(deal: any): number[] {
  const values = [
    ...(Array.isArray(deal?.label_ids) ? deal.label_ids : []),
    ...(Array.isArray(deal?.labels) ? deal.labels.map((entry: any) => typeof entry === "object" ? entry.id : entry) : []),
    deal?.label,
  ];
  return Array.from(new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value))));
}

function personIdFromDeal(deal: any): number | string {
  const person = deal?.person_id;
  if (person && typeof person === "object") return person.id || person.value || "";
  return person || "";
}

function ownerIdFromDeal(deal: any): number | string {
  const owner = deal?.owner_id ?? deal?.user_id;
  if (owner && typeof owner === "object") return owner.id || owner.value || "";
  return owner || "";
}

function meetingReference(deal: any): string {
  return asString(deal?.[DEAL_FIELDS.meetingReferenceId] || deal?.custom_fields?.[DEAL_FIELDS.meetingReferenceId]);
}

function meetingUrl(deal: any): string {
  return asString(deal?.[DEAL_FIELDS.meetingUrl] || deal?.custom_fields?.[DEAL_FIELDS.meetingUrl]);
}

function pipelineId(deal: any): number {
  const raw = deal?.pipeline_id;
  if (raw && typeof raw === "object") return Number(raw.id || raw.value) || 0;
  return Number(raw) || 0;
}

async function getZoomAccessToken(): Promise<string> {
  const accountId = await wmill.getVariable(ZOOM_ACCOUNT_ID_VARIABLE_PATH);
  const authorizationBasic = await wmill.getVariable(ZOOM_AUTHORIZATION_BASIC_VARIABLE_PATH);
  const authorization = authorizationBasic.toLowerCase().startsWith("basic ")
    ? authorizationBasic
    : `Basic ${authorizationBasic}`;
  const url = new URL("https://zoom.us/oauth/token");
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", accountId);
  const response = await fetch(url, { method: "POST", headers: { Authorization: authorization } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Zoom token request failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.access_token;
}

async function zoomRequest(token: string, path: string, params: Record<string, unknown> = {}) {
  const url = new URL(`https://api.zoom.us/v2/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Zoom GET ${path} failed: ${response.status} ${JSON.stringify(payload).slice(0, 1000)}`);
  }
  return payload;
}

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>, query: Record<string, unknown> = {}) {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v1 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload).slice(0, 1000)}`);
  }
  return method === "GET" ? payload : payload.data;
}

async function pipedriveV2(method: string, path: string, body?: Record<string, unknown>) {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH));
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v2 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload).slice(0, 1000)}`);
  }
  return payload.data;
}

async function getPersonEmail(personId: unknown): Promise<string> {
  const id = typeof personId === "object" && personId ? (personId as any).id : personId;
  if (!id) return "";
  const payload = await pipedriveV1("GET", `persons/${id}`);
  const emails = payload?.data?.email;
  if (Array.isArray(emails)) {
    const primary = emails.find((entry: any) => entry?.primary) || emails[0];
    return normalizeEmail(primary?.value);
  }
  return normalizeEmail(emails);
}

async function listOpenDeals(maxDeals: number) {
  const rows: any[] = [];
  let start = 0;
  while (rows.length < maxDeals) {
    const payload = await pipedriveV1("GET", "deals", undefined, {
      status: "open",
      sort: "add_time DESC",
      start,
      limit: 500,
    });
    const batch = Array.isArray(payload.data) ? payload.data : [];
    rows.push(...batch);
    const pagination = payload?.additional_data?.pagination;
    if (!batch.length || !pagination?.more_items_in_collection) break;
    start = Number(pagination.next_start) || start + batch.length;
  }
  return rows.slice(0, maxDeals);
}

function participantRow(row: any) {
  return {
    email: normalizeEmail(row?.user_email || row?.email),
    registrant_id: asString(row?.registrant_id),
    status: asString(row?.status),
    duration: Number(row?.duration) || 0,
    name: asString(row?.name || row?.user_name),
  };
}

async function listPreviousMeetings(token: string, maxMeetings: number, recentCompletedDays: number) {
  const payload = await zoomRequest(token, `users/${encodeURIComponent(ZOOM_USER_EMAIL)}/meetings`, {
    type: "previous_meetings",
    page_size: 100,
  });
  const cutoff = Date.now() - recentCompletedDays * 24 * 60 * 60_000;
  return (payload?.meetings || [])
    .filter((meeting: any) => asString(meeting.topic).toLowerCase().includes("collective"))
    .filter((meeting: any) => {
      const start = new Date(asString(meeting.start_time)).getTime();
      return Number.isFinite(start) && start >= cutoff;
    })
    .slice(0, maxMeetings);
}

async function getMeetingDetails(token: string, meetingId: string) {
  try {
    const payload = await zoomRequest(token, `meetings/${encodeURIComponent(meetingId)}`);
    return payload;
  } catch {
    return { id: meetingId, topic: "", start_time: "" };
  }
}

async function participantsForMeeting(token: string, meeting: any) {
  const rows: any[] = [];
  let nextPageToken = "";
  do {
    const payload = await zoomRequest(token, `past_meetings/${encodeURIComponent(String(meeting.id))}/participants`, {
      page_size: 300,
      next_page_token: nextPageToken,
    });
    rows.push(...(payload?.participants || []));
    nextPageToken = asString(payload?.next_page_token);
  } while (nextPageToken);
  return rows.map(participantRow);
}

function aggregateAttendance(meeting: any, participants: any[], minDurationSeconds: number) {
  const byRegistrant = new Map<string, any>();
  const byEmail = new Map<string, any>();

  for (const row of participants) {
    const inMeetingDuration = row.status === "in_meeting" ? row.duration : 0;
    const update = (map: Map<string, any>, key: string) => {
      if (!key) return;
      const existing = map.get(key) || {
        key,
        meeting_id: meeting.id,
        meeting_topic: asString(meeting.topic),
        meeting_start_time: asString(meeting.start_time),
        email: row.email,
        registrant_id: row.registrant_id,
        total_duration: 0,
        rows: 0,
      };
      existing.total_duration += inMeetingDuration;
      existing.rows += 1;
      map.set(key, existing);
    };
    update(byRegistrant, row.registrant_id);
    update(byEmail, row.email);
  }

  for (const value of [...byRegistrant.values(), ...byEmail.values()]) {
    value.attended = value.total_duration >= minDurationSeconds;
  }
  return { byRegistrant, byEmail };
}

async function createPipedriveNote(dealId: number, content: string) {
  return await pipedriveV1("POST", "notes", { deal_id: dealId, content });
}

async function createPipedriveActivity(dealId: number, subject: string, note: string, done: 0 | 1 = 1) {
  return await pipedriveV1("POST", "activities", {
    deal_id: dealId,
    user_id: BEFOREST_ADMIN_USER_ID,
    subject,
    type: "task",
    done,
    due_date: todayInTimezone("Asia/Kolkata"),
    note,
  });
}

async function markWebinarAttended(deal: any, attendance: any) {
  const updated = await pipedriveV2("PATCH", `deals/${deal.id}`, {
    label_ids: [WEBINAR_ATTENDED_LABEL_ID],
  });
  const noteContent = [
    "<strong>Webinar attendance synced from Zoom</strong>",
    `Result: Attended`,
    `Zoom meeting: ${attendance.meeting_topic || attendance.meeting_id}`,
    `Zoom start: ${attendance.meeting_start_time || "unknown"}`,
    `Matched by: ${attendance.matched_by}`,
    `In-meeting duration: ${attendance.total_duration} seconds`,
  ].join("<br>");
  const note = await createPipedriveNote(Number(deal.id), noteContent);
  const activity = await createPipedriveActivity(
    Number(deal.id),
    "Webinar attended via Zoom",
    [
      `Lead attended ${attendance.meeting_topic || "the webinar"}.`,
      `Matched by ${attendance.matched_by}.`,
      `Post-webinar 1on1 prebook will be scheduled separately.`,
    ].join("<br>"),
  );
  return {
    updated_deal_id: Number(updated?.id) || Number(deal.id),
    note_id: Number(note?.id) || null,
    audit_activity_id: Number(activity?.id) || null,
  };
}

async function state() {
  return (await wmill.getState().catch(() => ({}))) || {};
}

async function setStatePatch(patch: Record<string, unknown>) {
  const current = await state();
  await wmill.setState({ ...current, ...patch });
}

async function schedulePrebook(dealId: number, delayHours: number, dryRun: boolean) {
  if (dryRun) {
    return {
      deal_id: dealId,
      delay_seconds: Math.round(delayHours * 3600),
      dry_run: true,
      job_id: null,
    };
  }
  const current = await state();
  const scheduled = current.prebook_scheduled_deal_ids || {};
  if (scheduled[String(dealId)]) {
    return {
      deal_id: dealId,
      already_scheduled: true,
      job_id: scheduled[String(dealId)],
    };
  }
  const jobId = await wmill.runScriptByPathAsync(
    THIS_SCRIPT_PATH,
    { mode: "prebook_after_webinar", deal_id: dealId, dry_run: false },
    Math.max(0, Math.round(delayHours * 3600)),
  );
  await setStatePatch({ prebook_scheduled_deal_ids: { ...scheduled, [String(dealId)]: jobId } });
  return {
    deal_id: dealId,
    delay_seconds: Math.round(delayHours * 3600),
    job_id: jobId,
  };
}

async function ensureMeetingJobs(args: any) {
  const meetingId = asString(args.meeting_id);
  if (!meetingId) return { status: "skipped", reason: "missing_meeting_id" };
  const start = new Date(asString(args.meeting_start_time || args.webinar_start_time));
  if (Number.isNaN(start.getTime())) return { status: "skipped", reason: "missing_meeting_start_time", meeting_id: meetingId };
  const durationMinutes = Number(args.meeting_duration_minutes) || 120;
  const dryRun = Boolean(args.dry_run);
  const runTimes = [
    { key: "after_30m", at: new Date(start.getTime() + (durationMinutes + 30) * 60_000) },
    { key: "after_6h", at: new Date(start.getTime() + (durationMinutes + 360) * 60_000) },
  ];

  const current = await state();
  const scheduled = current.attendance_scheduled_meeting_ids || {};
  if (!dryRun && scheduled[meetingId]) {
    return { status: "already_scheduled", meeting_id: meetingId, jobs: scheduled[meetingId] };
  }

  const jobs = [];
  for (const run of runTimes) {
    const delaySeconds = Math.max(0, Math.ceil((run.at.getTime() - Date.now()) / 1000));
    if (dryRun) {
      jobs.push({ ...run, at: run.at.toISOString(), delay_seconds: delaySeconds, job_id: null, dry_run: true });
    } else {
      const jobId = await wmill.runScriptByPathAsync(
        THIS_SCRIPT_PATH,
        {
          mode: "sync_attendance",
          dry_run: false,
          meeting_id: meetingId,
          meeting_topic: asString(args.meeting_topic),
          meeting_start_time: start.toISOString(),
          max_meetings: 1,
          allow_email_fallback: false,
        },
        delaySeconds,
      );
      jobs.push({ ...run, at: run.at.toISOString(), delay_seconds: delaySeconds, job_id: jobId });
    }
  }
  if (!dryRun) await setStatePatch({ attendance_scheduled_meeting_ids: { ...scheduled, [meetingId]: jobs } });
  return { status: dryRun ? "dry_run_ready" : "scheduled", meeting_id: meetingId, jobs };
}

async function candidateDeals(maxDeals: number) {
  const openDeals = await listOpenDeals(maxDeals);
  const rows = [];
  for (const deal of openDeals) {
    const labels = labelIds(deal);
    if (!labels.includes(WEBINAR_PENDING_LABEL_ID) && !labels.includes(WEBINAR_ATTENDED_LABEL_ID)) continue;
    const detail = await pipedriveV2("GET", `deals/${deal.id}`).catch(() => deal);
    const detailLabels = labelIds(detail).length ? labelIds(detail) : labels;
    const personId = personIdFromDeal(detail) || personIdFromDeal(deal);
    rows.push({
      ...detail,
      id: detail.id || deal.id,
      title: detail.title || deal.title,
      labels: detailLabels,
      person_email: await getPersonEmail(personId).catch(() => ""),
      registrant_id: meetingReference(detail) || meetingReference(deal),
      has_zoom_url: (meetingUrl(detail) || meetingUrl(deal)).toLowerCase().includes("zoom."),
      owner_id_value: ownerIdFromDeal(detail) || ownerIdFromDeal(deal),
    });
  }
  return rows;
}

async function syncAttendance(args: any) {
  const token = await getZoomAccessToken();
  const meetingId = asString(args.meeting_id);
  const meetings = meetingId
    ? [await getMeetingDetails(token, meetingId).then((meeting) => ({
        ...meeting,
        id: meetingId,
        topic: asString(args.meeting_topic) || asString(meeting.topic),
        start_time: asString(args.meeting_start_time) || asString(meeting.start_time),
      }))]
    : await listPreviousMeetings(token, Number(args.max_meetings) || 12, Number(args.recent_completed_days) || 7);

  const byRegistrant = new Map<string, any>();
  const byEmail = new Map<string, any>();
  const participantResults = [];
  const minDurationSeconds = Number(args.min_duration_seconds) || 300;

  for (const meeting of meetings) {
    const participants = await participantsForMeeting(token, meeting).catch((error) => {
      participantResults.push({
        meeting_id: meeting.id,
        topic: meeting.topic,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        participant_rows: 0,
      });
      return [];
    });
    if (!participants.length) continue;
    participantResults.push({
      meeting_id: meeting.id,
      topic: meeting.topic,
      start_time: meeting.start_time,
      ok: true,
      participant_rows: participants.length,
    });
    const aggregated = aggregateAttendance(meeting, participants, minDurationSeconds);
    for (const [key, value] of aggregated.byRegistrant.entries()) byRegistrant.set(key, value);
    for (const [key, value] of aggregated.byEmail.entries()) byEmail.set(key, value);
  }

  const dryRun = args.dry_run !== false;
  const allowEmailFallback = Boolean(args.allow_email_fallback);
  const skipTestDeals = args.skip_test_deals !== false;
  const deals = await candidateDeals(Number(args.max_deals) || 2000);
  const plannedUpdates = [];
  const completed = [];
  const skipped = [];

  for (const deal of deals) {
    const labels = Array.isArray(deal.labels) ? deal.labels : [];
    if (skipTestDeals && /(^|\b)(test|dummy)(\b|$)/i.test(asString(deal.title))) {
      skipped.push({ deal_id: deal.id, reason: "test_or_dummy_deal" });
      continue;
    }
    const registrantMatch = deal.registrant_id ? byRegistrant.get(deal.registrant_id) : null;
    const emailMatch = allowEmailFallback && deal.person_email ? byEmail.get(deal.person_email) : null;
    const match = registrantMatch || emailMatch;
    const matchedBy = registrantMatch ? "registrant_id" : emailMatch ? "email" : "";
    if (!match?.attended) {
      if (labels.includes(WEBINAR_PENDING_LABEL_ID)) skipped.push({ deal_id: deal.id, reason: "no_attendance_match" });
      continue;
    }
    if (labels.includes(WEBINAR_ATTENDED_LABEL_ID)) {
      skipped.push({ deal_id: deal.id, reason: "already_webinar_attended" });
      continue;
    }
    const plan = {
      deal_id: Number(deal.id),
      title: deal.title,
      owner_id: deal.owner_id_value,
      pipeline_id: pipelineId(deal),
      person_email: deal.person_email,
      registrant_id: deal.registrant_id,
      matched_by: matchedBy,
      meeting_id: match.meeting_id,
      meeting_topic: match.meeting_topic,
      meeting_start_time: match.meeting_start_time,
      total_duration_seconds: match.total_duration,
      label_id: WEBINAR_ATTENDED_LABEL_ID,
    };
    plannedUpdates.push(plan);
    if (!dryRun) {
      const update = await markWebinarAttended(deal, plan);
      const prebookJob = args.schedule_prebook === false
        ? null
        : await schedulePrebook(Number(deal.id), Number(args.prebook_delay_hours) || 24, false);
      completed.push({ ...plan, ...update, prebook_job: prebookJob });
    }
  }

  return {
    dry_run: dryRun,
    mode: "sync_attendance",
    min_duration_seconds: minDurationSeconds,
    allow_email_fallback: allowEmailFallback,
    skip_test_deals: skipTestDeals,
    zoom_meetings_checked: meetings.length,
    participant_results: participantResults,
    pipedrive_candidate_deals_checked: deals.length,
    planned_update_total: plannedUpdates.length,
    completed_total: completed.length,
    skipped_total: skipped.length,
    planned_updates: dryRun ? plannedUpdates : plannedUpdates.slice(0, 50),
    completed,
    skipped_sample: skipped.slice(0, 50),
  };
}

async function prebookAfterWebinar(args: any) {
  const dealId = Number(args.deal_id);
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("deal_id is required");
  const dryRun = args.dry_run !== false;
  const deal = await pipedriveV2("GET", `deals/${dealId}`);
  const initialStageId = INITIAL_EVENT_STAGE_BY_PIPELINE[pipelineId(deal)] || null;
  const plan = {
    deal_id: dealId,
    deal_title: deal.title,
    pipeline_id: pipelineId(deal),
    stage_id: initialStageId,
    label_ids: [ONE_ON_ONE_TBC_LABEL_ID],
  };
  if (dryRun) {
    const calendarPreview = await wmill.runScriptByPath(CALENDAR_PREBOOK_SCRIPT_PATH, {
      deal_id: dealId,
      dry_run: true,
    });
    return { dry_run: true, mode: "prebook_after_webinar", plan, calendar_preview: calendarPreview };
  }
  await pipedriveV2("PATCH", `deals/${dealId}`, {
    label_ids: [ONE_ON_ONE_TBC_LABEL_ID],
    ...(initialStageId ? { stage_id: initialStageId } : {}),
  });
  const calendarJobId = await wmill.runScriptByPathAsync(CALENDAR_PREBOOK_SCRIPT_PATH, {
    deal_id: dealId,
    dry_run: false,
  }, 0);
  const activity = await createPipedriveActivity(
    dealId,
    "Post-webinar 1on1 prebook queued",
    [
      "Lead attended the webinar, so the 1on1 prebook flow was queued after the 24h delay.",
      initialStageId ? `Moved to Initial Event Scheduled stage ${initialStageId}.` : "Stage not changed because pipeline mapping was missing.",
      "Label set to 1on1 - TBC.",
      `Calendar prebook job: ${calendarJobId}.`,
    ].join("<br>"),
  );
  return {
    dry_run: false,
    mode: "prebook_after_webinar",
    plan,
    calendar_job_id: calendarJobId,
    audit_activity_id: Number(activity?.id) || null,
  };
}

export async function main(
  mode: Mode = "sync_attendance",
  dry_run = true,
  meeting_id = "",
  meeting_topic = "",
  meeting_start_time = "",
  meeting_duration_minutes = 120,
  max_meetings = 12,
  recent_completed_days = 7,
  min_duration_seconds = 300,
  max_deals = 2000,
  allow_email_fallback = false,
  skip_test_deals = true,
  schedule_prebook = true,
  prebook_delay_hours = 24,
  deal_id = 0,
) {
  if (!(await legacyWebinarEnabled())) {
    return {
      dry_run,
      mode,
      status: "disabled",
      reason: "Legacy webinar attendance/prebook sync is disabled because the sales funnel now routes non-ready leads to GIS.",
    };
  }
  const args = {
    mode,
    dry_run,
    meeting_id,
    meeting_topic,
    meeting_start_time,
    meeting_duration_minutes,
    max_meetings,
    recent_completed_days,
    min_duration_seconds,
    max_deals,
    allow_email_fallback,
    skip_test_deals,
    schedule_prebook,
    prebook_delay_hours,
    deal_id,
  };
  if (mode === "ensure_meeting_jobs") return await ensureMeetingJobs(args);
  if (mode === "prebook_after_webinar") return await prebookAfterWebinar(args);
  return await syncAttendance(args);
}
