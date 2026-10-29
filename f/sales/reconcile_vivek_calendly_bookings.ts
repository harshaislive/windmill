import * as wmill from "windmill-client";

const CALENDLY_TOKEN_PATH = "f/sales/calendar_prebook_1on1/calendly_vivek_token";
const CALENDLY_EVENT_TYPE_PATH = "f/sales/calendar_prebook_1on1/calendly_vivek_event_type_uri";
const PIPEDRIVE_TOKEN_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const PIPEDRIVE_DOMAIN = "beforest";
const VIVEK_USER_ID = 22251956;
const BEFOREST_ADMIN_USER_ID = 18891506;
const TIMEZONE = "Asia/Kolkata";
const SYNC_SUBJECT = "Vivek Calendly booking synced";
const CANCEL_SUBJECT = "Vivek Calendly booking canceled";

const DEAL_FIELDS = {
  meetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
  meetingReference: "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50",
};

const PIPELINE_BY_CAMPAIGN: Record<string, number> = { mumbai: 2, bhopal: 4, hammiyala: 1 };
const SUPPORTED_PIPELINES = new Set(Object.values(PIPELINE_BY_CAMPAIGN));

type CalendlyEvent = Record<string, any> & {
  uri?: string;
  name?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  location?: Record<string, unknown> | string;
};

type Invitee = Record<string, any> & {
  uri?: string;
  email?: string;
  name?: string;
  status?: string;
  tracking?: Record<string, unknown>;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number | null {
  if (value && typeof value === "object" && "id" in (value as Record<string, unknown>)) {
    return number((value as Record<string, unknown>).id);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dealOwnerId(deal: any): number | null {
  return number(deal?.owner_id ?? deal?.user_id);
}

function collectiveName(pipelineId: number | null): string {
  if (pipelineId === 1) return "Hammiyala";
  if (pipelineId === 2) return "Mumbai";
  if (pipelineId === 4) return "Bhopal";
  return `pipeline ${pipelineId || "unknown"}`;
}

function html(value: unknown): string {
  return text(value).replace(/[<>&]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[character] || character));
}

function maskEmail(value: string): string {
  const [local, domain] = value.split("@");
  return domain ? `${local.slice(0, 2)}***@${domain}` : "(missing)";
}

function campaignOf(invitee: Invitee): string {
  return text(invitee.tracking?.utm_campaign).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function referenceOf(invitee: Invitee): string {
  const uri = text(invitee.uri);
  return `calendly:${uri.split("/").filter(Boolean).pop() || uri}`;
}

function meetingUrl(event: CalendlyEvent): string | null {
  if (typeof event.location === "string") return /^https?:\/\//i.test(event.location) ? event.location : null;
  const location = event.location || {};
  for (const candidate of [location.join_url, location.location, location.url]) {
    const value = text(candidate);
    if (/^https?:\/\//i.test(value)) return value;
  }
  return null;
}

function istParts(date: Date): { due_date: string; due_time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return { due_date: `${parts.year}-${parts.month}-${parts.day}`, due_time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

function istDisplay(date: Date): string {
  return `${date.toLocaleString("en-IN", { timeZone: TIMEZONE, dateStyle: "medium", timeStyle: "short" })} IST`;
}

async function calendlyGet(token: string, initialUrl: string): Promise<any> {
  const response = await fetch(initialUrl, { headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Calendly read failed (${response.status}): ${text(payload?.message || payload?.title || "unknown error")}`);
  return payload;
}

async function calendlyCollection(token: string, initialUrl: URL, limit: number): Promise<any[]> {
  const rows: any[] = [];
  let next = initialUrl.toString();
  while (next && rows.length < limit) {
    const payload = await calendlyGet(token, next);
    rows.push(...(Array.isArray(payload.collection) ? payload.collection : []));
    next = text(payload.pagination?.next_page);
  }
  return rows.slice(0, limit);
}

async function listEvents(token: string, eventType: string, userUri: string, status: "active" | "canceled", min: Date, max: Date, limit: number) {
  const url = new URL("https://api.calendly.com/scheduled_events");
  url.searchParams.set("event_type", eventType);
  url.searchParams.set("user", userUri);
  url.searchParams.set("status", status);
  url.searchParams.set("min_start_time", min.toISOString());
  url.searchParams.set("max_start_time", max.toISOString());
  url.searchParams.set("count", "100");
  return calendlyCollection(token, url, limit) as Promise<CalendlyEvent[]>;
}

async function listInvitees(token: string, event: CalendlyEvent, limit = 100): Promise<Invitee[]> {
  const url = new URL(`${text(event.uri)}/invitees`);
  url.searchParams.set("count", "100");
  return calendlyCollection(token, url, limit) as Promise<Invitee[]>;
}

async function pipedrive(method: string, path: string, body?: Record<string, unknown>, query: Record<string, unknown> = {}, version = "v1") {
  const token = await wmill.getVariable(PIPEDRIVE_TOKEN_PATH);
  const url = new URL(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/${version}/${path}`);
  url.searchParams.set("api_token", token);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(`Pipedrive ${method} ${path} failed (${response.status}): ${text(payload.error || "unknown error")}`);
  return payload.data;
}

async function personIdsByExactEmail(email: string): Promise<number[]> {
  const data = await pipedrive("GET", "persons/search", undefined, { term: email, fields: "email", exact_match: true, limit: 20 }, "v2");
  const items = Array.isArray(data?.items) ? data.items : [];
  return [...new Set(items.map((item: any) => number(item?.item?.id || item?.id)).filter(Boolean))] as number[];
}

async function dealsForPerson(personId: number): Promise<any[]> {
  const data = await pipedrive("GET", `persons/${personId}/deals`, undefined, { status: "all_not_deleted", limit: 500 });
  return Array.isArray(data) ? data : [];
}

function eligibleDeal(deal: any): boolean {
  return text(deal.status).toLowerCase() === "open" && dealOwnerId(deal) === VIVEK_USER_ID && SUPPORTED_PIPELINES.has(number(deal.pipeline_id) || 0);
}

async function matchDeal(invitee: Invitee) {
  const email = text(invitee.email).toLowerCase();
  const campaign = campaignOf(invitee);
  const campaignPipeline = PIPELINE_BY_CAMPAIGN[campaign] || null;
  if (!email || !email.includes("@")) return { status: "unmatched", reason: "missing_invitee_email", candidates: [] as any[] };
  const personIds = await personIdsByExactEmail(email);
  const deals = (await Promise.all(personIds.map(dealsForPerson))).flat().filter(eligibleDeal);
  const uniqueDeals = [...new Map(deals.map((deal) => [number(deal.id), deal])).values()];
  const candidates = campaignPipeline ? uniqueDeals.filter((deal) => number(deal.pipeline_id) === campaignPipeline) : uniqueDeals;
  if (candidates.length === 1) return { status: "matched", reason: campaignPipeline ? "exact_email_and_utm" : "exact_email_single_eligible_deal", deal: candidates[0], candidates };
  const reference = referenceOf(invitee);
  const referenceMatches = candidates.filter((deal) => text(deal.custom_fields?.[DEAL_FIELDS.meetingReference] ?? deal[DEAL_FIELDS.meetingReference]) === reference);
  if (referenceMatches.length === 1) return { status: "matched", reason: "existing_calendly_reference", deal: referenceMatches[0], candidates: referenceMatches };
  return {
    status: candidates.length > 1 ? "ambiguous" : "unmatched",
    reason: campaignPipeline ? (uniqueDeals.length ? "utm_pipeline_has_no_unique_deal" : "no_eligible_vivek_deal") : (uniqueDeals.length > 1 ? "missing_or_unknown_utm_with_multiple_deals" : "no_eligible_vivek_deal"),
    candidates,
  };
}

async function dealActivities(dealId: number): Promise<any[]> {
  const [open, done] = await Promise.all([
    pipedrive("GET", `deals/${dealId}/activities`, undefined, { done: 0, limit: 500 }).catch(() => []),
    pipedrive("GET", `deals/${dealId}/activities`, undefined, { done: 1, limit: 500 }).catch(() => []),
  ]);
  return [...(Array.isArray(open) ? open : []), ...(Array.isArray(done) ? done : [])];
}

function activityHasReference(activity: any, reference: string): boolean {
  return text(activity.note).includes(reference);
}

async function syncActive(event: CalendlyEvent, invitee: Invitee, deal: any, dryRun: boolean) {
  const dealId = number(deal.id)!;
  const start = new Date(text(event.start_time));
  if (Number.isNaN(start.getTime())) return { status: "skipped", reason: "invalid_start_time", deal_id: dealId };
  const reference = referenceOf(invitee);
  const joinUrl = meetingUrl(event);
  const subject = `1-on-1 call with ${text(deal.title) || `deal ${dealId}`}`;
  const activities = await dealActivities(dealId);
  const call = activities.find((activity) => text(activity.subject) === subject && activityHasReference(activity, reference));
  const audit = activities.find((activity) => text(activity.subject) === SYNC_SUBJECT && activityHasReference(activity, reference));
  const currentReference = text(deal.custom_fields?.[DEAL_FIELDS.meetingReference] ?? deal[DEAL_FIELDS.meetingReference]);
  const currentDate = text(deal.custom_fields?.[DEAL_FIELDS.meetingDateTime] ?? deal[DEAL_FIELDS.meetingDateTime]);
  const dealCurrent = currentReference === reference && new Date(currentDate).getTime() === start.getTime();
  const planned = { deal_id: dealId, pipeline_id: number(deal.pipeline_id), start_utc: start.toISOString(), start_ist: istDisplay(start), reference, meeting_url_present: Boolean(joinUrl), create_call_activity: !call, create_audit_activity: !audit, update_deal: !dealCurrent };
  if (dryRun) return { status: "would_sync", ...planned };
  if (dealCurrent && call && audit) return { status: "unchanged", ...planned };

  if (!dealCurrent) await pipedrive("PATCH", `deals/${dealId}`, { custom_fields: { [DEAL_FIELDS.meetingDateTime]: start.toISOString(), [DEAL_FIELDS.meetingUrl]: joinUrl, [DEAL_FIELDS.meetingReference]: reference } }, {}, "v2");
  const { due_date, due_time } = istParts(start);
  const createdCall = call ? null : await pipedrive("POST", "activities", { deal_id: dealId, user_id: VIVEK_USER_ID, subject, type: "meeting", done: 0, due_date, due_time, note: [`Synced from Vivek's Calendly.`, `When: ${html(istDisplay(start))}`, joinUrl ? `Meeting link: ${html(joinUrl)}` : "Vivek will contact the lead directly.", `Calendly invitee: ${html(reference)}`].join("<br>") });
  const createdAudit = audit ? null : await pipedrive("POST", "activities", { deal_id: dealId, user_id: BEFOREST_ADMIN_USER_ID, subject: SYNC_SUBJECT, type: "task", done: 1, due_date: istParts(new Date()).due_date, note: [`Matched exact Calendly invitee email to Vivek's open ${collectiveName(number(deal.pipeline_id))} deal.`, `When: ${html(istDisplay(start))}`, `UTM campaign: ${html(campaignOf(invitee) || "missing")}`, `Calendly invitee: ${html(reference)}`].join("<br>") });
  return { status: "synced", ...planned, call_activity_id: number(createdCall?.id), audit_activity_id: number(createdAudit?.id) };
}

async function syncCanceled(event: CalendlyEvent, invitee: Invitee, deal: any, dryRun: boolean) {
  const dealId = number(deal.id)!;
  const reference = referenceOf(invitee);
  const currentReference = text(deal.custom_fields?.[DEAL_FIELDS.meetingReference] ?? deal[DEAL_FIELDS.meetingReference]);
  const activities = await dealActivities(dealId);
  const openCalls = activities.filter((activity) => Number(activity.done) !== 1 && activityHasReference(activity, reference));
  const audit = activities.find((activity) => text(activity.subject) === CANCEL_SUBJECT && activityHasReference(activity, reference));
  const planned = { deal_id: dealId, reference, clear_deal: currentReference === reference, close_activity_ids: openCalls.map((activity) => number(activity.id)).filter(Boolean), create_audit_activity: !audit };
  if (dryRun) return { status: "would_cancel", ...planned };
  if (currentReference !== reference && openCalls.length === 0 && audit) return { status: "unchanged", ...planned };
  if (currentReference === reference) await pipedrive("PATCH", `deals/${dealId}`, { custom_fields: { [DEAL_FIELDS.meetingDateTime]: null, [DEAL_FIELDS.meetingUrl]: null, [DEAL_FIELDS.meetingReference]: null } }, {}, "v2");
  for (const activity of openCalls) await pipedrive("PUT", `activities/${number(activity.id)}`, { done: 1, note: `${text(activity.note)}<br><br>Closed because the Calendly booking was canceled.<br>Calendly invitee: ${html(reference)}` });
  const createdAudit = audit ? null : await pipedrive("POST", "activities", { deal_id: dealId, user_id: BEFOREST_ADMIN_USER_ID, subject: CANCEL_SUBJECT, type: "task", done: 1, due_date: istParts(new Date()).due_date, note: [`Calendly booking canceled.`, `Deal fields cleared only if this was still the deal's current booking.`, `Calendly invitee: ${html(reference)}`].join("<br>") });
  return { status: "canceled", ...planned, audit_activity_id: number(createdAudit?.id) };
}

export async function main(dry_run = true, lookback_days = 7, lookahead_days = 60, max_events = 250, max_writes = 50) {
  const [token, eventType] = await Promise.all([wmill.getVariable(CALENDLY_TOKEN_PATH), wmill.getVariable(CALENDLY_EVENT_TYPE_PATH)]);
  if (!text(token) || !text(eventType)) throw new Error("Vivek Calendly token or event type URI is missing.");
  const currentUser = await calendlyGet(token, "https://api.calendly.com/users/me");
  const userUri = text(currentUser?.resource?.uri);
  if (!userUri) throw new Error("Calendly token is valid but did not return a current user URI.");
  const now = Date.now();
  const min = new Date(now - Math.max(0, Number(lookback_days)) * 86_400_000);
  const max = new Date(now + Math.max(1, Number(lookahead_days)) * 86_400_000);
  const [canceledEvents, activeEvents] = await Promise.all([
    listEvents(token, eventType, userUri, "canceled", min, max, Math.max(1, Number(max_events))),
    listEvents(token, eventType, userUri, "active", min, max, Math.max(1, Number(max_events))),
  ]);
  const results: any[] = [];
  let writes = 0;
  for (const [eventStatus, events] of [["canceled", canceledEvents], ["active", activeEvents]] as const) {
    for (const event of events) {
      const invitees = await listInvitees(token, event);
      for (const invitee of invitees) {
        const email = text(invitee.email).toLowerCase();
        const base = { event_status: eventStatus, invitee_status: text(invitee.status), email: maskEmail(email), campaign: campaignOf(invitee) || null, event_start: text(event.start_time) || null };
        const match = await matchDeal(invitee);
        if (match.status !== "matched") {
          results.push({ ...base, status: match.status, reason: match.reason, candidate_deal_ids: match.candidates.map((deal: any) => number(deal.id)) });
          continue;
        }
        const isCanceled = eventStatus === "canceled" || text(invitee.status).toLowerCase() === "canceled";
        if (!dry_run && writes >= Math.max(0, Number(max_writes))) {
          results.push({ ...base, status: "write_cap_reached", deal_id: number(match.deal.id) });
          continue;
        }
        const outcome = isCanceled ? await syncCanceled(event, invitee, match.deal, dry_run) : await syncActive(event, invitee, match.deal, dry_run);
        if (!dry_run && ["synced", "canceled"].includes(outcome.status)) writes += 1;
        results.push({ ...base, match_reason: match.reason, ...outcome });
      }
    }
  }
  const counts = results.reduce<Record<string, number>>((acc, result) => { acc[result.status] = (acc[result.status] || 0) + 1; return acc; }, {});
  return { dry_run, timezone: TIMEZONE, window: { min: min.toISOString(), max: max.toISOString() }, calendly_event_type_verified: true, events_seen: { active: activeEvents.length, canceled: canceledEvents.length }, invitees_seen: results.length, writes, counts, results };
}
