import * as wmill from "windmill-client";

const PIPEDRIVE_RESOURCE_PATH = "f/sales/typeform_to_pipedrive_intake/pipedrive";
const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const SCHEDULED_WEBINAR_PENDING_LABEL_ID = 111;
const ACTIVITY_TYPE = "meeting";
const DEAL_MEETING_URL_FIELD = "c818768b64d54270c74b931b4581082b543c8571";
const DEAL_MEETING_REFERENCE_ID_FIELD = "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50";
const DEAL_LOOKUP_ATTEMPTS = 12;
const DEAL_LOOKUP_DELAY_MS = 5000;
const ZOOM_ACCOUNT_ID_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/zoom_account_id";
const ZOOM_AUTHORIZATION_BASIC_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/zoom_authorization_basic";
const ZOOM_USER_EMAIL = "connect@beforest.co";
const ZOOM_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const WEBINAR_CONFIRMATION_TEMPLATE_NAME = "collective_webinar_confirmation";
const WEBINAR_CONFIRMATION_TEMPLATE_ID = "1652138732429446";
const WEBINAR_REMINDER_SCRIPT_PATH = "f/sales/send_webinar_reminders";
const WEBINAR_REMINDER_OFFSETS = [
  { key: "3d", label: "3 days before", offsetMinutes: 72 * 60 },
  { key: "24h", label: "24 hours before", offsetMinutes: 24 * 60 },
  { key: "1h", label: "1 hour before", offsetMinutes: 60 },
];

type PipedriveConfig = {
  apiToken: string;
  companyDomain?: string;
};

type CollectiveConfig = {
  label: string;
  subject: string;
  pipelineId: number;
  ownerId: number;
};

type ZoomMeeting = {
  id: number | string;
  topic?: string;
  start_time?: string;
  join_url?: string;
};

type ZoomRegistration = {
  status: "already_registered" | "existing_registrant" | "registered" | "would_register";
  meeting_id: number | string | null;
  meeting_topic: string;
  meeting_start_time: string;
  match_delta_minutes: number | null;
  registrant_id: string;
  join_url: string;
};

const COLLECTIVES: CollectiveConfig[] = [
  { label: "Mumbai", subject: "Mumbai Collective Webinar", pipelineId: 2, ownerId: 22251956 },
  { label: "Bhopal", subject: "Bhopal Collective Webinar", pipelineId: 4, ownerId: 22251956 },
  { label: "Hammiyala", subject: "Hammiyala Collective Webinar", pipelineId: 1, ownerId: 13490118 },
  { label: "Poomaale", subject: "Poomaale Collective Webinar", pipelineId: 3, ownerId: 13490118 },
];

class WebinarActivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebinarActivityError";
  }
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function normalizeEmail(value: unknown): string {
  return asString(value).toLowerCase();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed && parsed > 0 ? parsed : null;
}

function idNumber(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed && parsed > 0 ? parsed : null;
}

function unwrapPayload(input: unknown): any {
  if (typeof input === "string") {
    const jsonStart = input.indexOf("{");
    if (jsonStart === -1) throw new WebinarActivityError("Calendly payload does not contain JSON.");
    return JSON.parse(input.slice(jsonStart));
  }

  if (Array.isArray(input)) {
    if (input.length !== 1) {
      throw new WebinarActivityError(`Expected one Calendly event, received ${input.length}.`);
    }
    return unwrapPayload(input[0]);
  }

  if (input && typeof input === "object" && "body" in input) {
    const wrapped = input as { body?: unknown };
    return unwrapPayload(wrapped.body);
  }

  return input;
}

function nestedValues(input: any): any[] {
  const payload = input?.payload ?? input;
  return [
    payload,
    payload?.event,
    payload?.invitee,
    payload?.scheduled_event,
    payload?.event_type,
    payload?.tracking,
    input?.payload,
  ].filter(Boolean);
}

function firstString(values: unknown[]): string {
  for (const value of values) {
    const stringValue = asString(value);
    if (stringValue) return stringValue;
  }
  return "";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(asString).filter(Boolean)));
}

function calendlyIdentifiers(values: string[]): string[] {
  const identifiers = values.flatMap((value) => {
    const matches = asString(value).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
    return matches || [];
  });
  return uniqueStrings(identifiers.map((value) => value.toLowerCase()));
}

function extractCalendlyDetails(input: unknown) {
  const root = unwrapPayload(input);
  const payload = root?.payload ?? root;
  const candidates = nestedValues(root);

  const email = normalizeEmail(firstString(candidates.flatMap((item) => [
    item?.email,
    item?.invitee_email,
    item?.invitee?.email,
  ])));

  const phone = firstString(candidates.flatMap((item) => [
    item?.text_reminder_number,
    item?.phone,
    item?.phone_number,
    item?.invitee?.phone,
    item?.questions_and_answers?.find?.((answer: any) => asString(answer?.question).toLowerCase().includes("phone"))?.answer,
  ]));

  const name = firstString(candidates.flatMap((item) => [
    item?.name,
    [item?.first_name, item?.last_name].map(asString).filter(Boolean).join(" "),
    item?.invitee?.name,
  ])) || email;

  const eventName = firstString(candidates.flatMap((item) => [
    item?.scheduled_event?.name,
    item?.event?.name,
    item?.event_type?.name,
    item?.event_name,
    item?.event_type_name,
    item?.name,
  ]));

  const startTime = firstString(candidates.flatMap((item) => [
    item?.start_time,
    item?.start_time_pretty,
    item?.scheduled_event?.start_time,
    item?.event?.start_time,
  ]));

  const eventUri = firstString(candidates.flatMap((item) => [
    item?.scheduled_event?.uri,
    item?.event?.uri,
    item?.event,
    item?.uri,
  ]));

  const inviteeUri = firstString([
    payload?.uri,
    payload?.invitee?.uri,
    payload?.invitee_uri,
  ]);

  const relatedUrls = uniqueStrings([
    eventUri,
    inviteeUri,
    payload?.cancel_url,
    payload?.reschedule_url,
  ].map(asString));

  if (!email) throw new WebinarActivityError("Missing invitee email in Calendly payload.");
  if (!eventName) throw new WebinarActivityError("Missing event name in Calendly payload.");
  if (!startTime) throw new WebinarActivityError("Missing event start time in Calendly payload.");

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    throw new WebinarActivityError(`Calendly start time is not parseable: ${startTime}`);
  }

  return { email, phone, name, eventName, start, eventUri, inviteeUri, relatedUrls };
}

function detectCollective(eventName: string): CollectiveConfig {
  const lower = eventName.toLowerCase();
  const collective = COLLECTIVES.find((item) => lower.includes(item.label.toLowerCase()));
  if (!collective) {
    throw new WebinarActivityError(
      `Could not detect collective from Calendly event name: ${eventName}`,
    );
  }
  return collective;
}

function pipedriveDueDateTimeParts(date: Date): { dueDate: string; dueTime: string } {
  const iso = date.toISOString();
  return {
    dueDate: iso.slice(0, 10),
    dueTime: iso.slice(11, 19),
  };
}

async function loadPipedriveConfig(): Promise<PipedriveConfig> {
  const resource = await wmill.getResource(PIPEDRIVE_RESOURCE_PATH, true);
  if (resource?.apiToken) {
    return {
      apiToken: resource.apiToken,
      companyDomain: resource.companyDomain || DEFAULT_PIPEDRIVE_DOMAIN,
    };
  }

  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  if (!apiToken) {
    throw new WebinarActivityError(
      `Missing Pipedrive credentials. Create resource ${PIPEDRIVE_RESOURCE_PATH} or secret variable ${PIPEDRIVE_VARIABLE_PATH}.`,
    );
  }
  return { apiToken, companyDomain: DEFAULT_PIPEDRIVE_DOMAIN };
}

async function pipedriveRequest(
  config: PipedriveConfig,
  method: string,
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown>; apiVersion?: "v1" | "v2" } = {},
): Promise<any> {
  const apiVersion = options.apiVersion || "v2";
  const url = new URL(`https://${config.companyDomain || DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/${apiVersion}/${path}`);
  url.searchParams.set("api_token", config.apiToken);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new WebinarActivityError(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function findPersons(config: PipedriveConfig, term: string, field: "email" | "phone"): Promise<any[]> {
  if (!term) return [];
  const payload = await pipedriveRequest(config, "GET", "persons/search", {
    params: {
      term,
      fields: field,
      exact_match: "true",
      limit: 100,
    },
  });
  const items = payload?.data?.items || [];
  return items.map((entry: any) => entry?.item || entry).filter((person: any) => person?.id);
}

async function findCandidatePersons(config: PipedriveConfig, calendly: ReturnType<typeof extractCalendlyDetails>): Promise<any[]> {
  const people = [
    ...(await findPersons(config, calendly.email, "email")),
    ...(await findPersons(config, calendly.phone, "phone")),
  ];
  const seen = new Set<number>();
  return people.filter((person) => {
    const id = asNumber(person.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function createPerson(
  config: PipedriveConfig,
  calendly: ReturnType<typeof extractCalendlyDetails>,
  collective: CollectiveConfig,
): Promise<any> {
  const body: Record<string, unknown> = {
    name: calendly.name || calendly.email,
    owner_id: collective.ownerId,
    emails: [{ value: calendly.email, primary: true, label: "work" }],
  };
  if (calendly.phone) {
    body.phones = [{ value: calendly.phone, primary: true, label: "mobile" }];
  }

  const payload = await pipedriveRequest(config, "POST", "persons", { body });
  return payload.data;
}

async function findCandidatePersonsWithRetry(
  config: PipedriveConfig,
  calendly: ReturnType<typeof extractCalendlyDetails>,
): Promise<any[]> {
  for (let attempt = 1; attempt <= DEAL_LOOKUP_ATTEMPTS; attempt += 1) {
    const people = await findCandidatePersons(config, calendly);
    if (people.length) return people;
    if (attempt === DEAL_LOOKUP_ATTEMPTS) break;
    await sleep(DEAL_LOOKUP_DELAY_MS);
  }
  return [];
}

async function ensurePerson(
  config: PipedriveConfig,
  calendly: ReturnType<typeof extractCalendlyDetails>,
  collective: CollectiveConfig,
  dryRun: boolean,
): Promise<{ person: any; created: boolean; plannedCreate: boolean }> {
  const people = await findCandidatePersonsWithRetry(config, calendly);
  if (people.length) return { person: people[0], created: false, plannedCreate: false };

  if (dryRun) {
    return {
      person: {
        id: null,
        name: calendly.name || calendly.email,
        email: calendly.email,
        phone: calendly.phone,
      },
      created: false,
      plannedCreate: true,
    };
  }

  return { person: await createPerson(config, calendly, collective), created: true, plannedCreate: false };
}

async function getPersonDeals(config: PipedriveConfig, personId: number): Promise<any[]> {
  const payload = await pipedriveRequest(config, "GET", `persons/${personId}/deals`, {
    apiVersion: "v1",
    params: { status: "all_not_deleted", limit: 500 },
  });
  return payload.data || [];
}

function labelIds(deal: any): number[] {
  const raw = deal.label_ids ?? deal.labels ?? deal.label;
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((value) => typeof value === "object" && value !== null ? [value.id] : [value])
    .map(asNumber)
    .filter((value): value is number => value !== null);
}

function dealTimestamp(deal: any): number {
  const value = asString(deal.update_time || deal.add_time || deal.created_at);
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function dealMeetingUrl(deal: any): string {
  return asString(deal?.[DEAL_MEETING_URL_FIELD] ?? deal?.custom_fields?.[DEAL_MEETING_URL_FIELD]);
}

function dealMeetingReferenceId(deal: any): string {
  return asString(deal?.[DEAL_MEETING_REFERENCE_ID_FIELD] ?? deal?.custom_fields?.[DEAL_MEETING_REFERENCE_ID_FIELD]);
}

function pickMatchingDeal(deals: any[], collective: CollectiveConfig, calendly: ReturnType<typeof extractCalendlyDetails>): any {
  const pipelineMatches = deals.filter((deal) => asNumber(deal.pipeline_id) === collective.pipelineId);
  const identifiers = calendlyIdentifiers(calendly.relatedUrls);
  const dealsWithCalendlyMeetingUrl = pipelineMatches.filter((deal) => {
    const meetingUrl = dealMeetingUrl(deal).toLowerCase();
    return meetingUrl.includes("calendly.com") || identifiers.some((identifier) => meetingUrl.includes(identifier));
  });
  const urlMatches = identifiers.length
    ? dealsWithCalendlyMeetingUrl.filter((deal) => {
      const meetingUrl = dealMeetingUrl(deal).toLowerCase();
      return identifiers.some((identifier) => meetingUrl.includes(identifier));
    })
    : [];
  if (identifiers.length && dealsWithCalendlyMeetingUrl.length && !urlMatches.length) {
    throw new WebinarActivityError(
      `No ${collective.label} pipeline deal has the matching Calendly booking ID for this invitee.`,
    );
  }
  const pendingMatches = pipelineMatches.filter((deal) => labelIds(deal).includes(SCHEDULED_WEBINAR_PENDING_LABEL_ID));
  const candidates = urlMatches.length ? urlMatches : pendingMatches.length ? pendingMatches : pipelineMatches;

  if (!candidates.length) {
    throw new WebinarActivityError(
      `No Pipedrive deal found in ${collective.label} pipeline for the Calendly invitee.`,
    );
  }

  return [...candidates].sort((a, b) => dealTimestamp(b) - dealTimestamp(a))[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dealOwnerId(...deals: any[]): number | null {
  for (const deal of deals) {
    const id = positiveNumber(deal?.owner_id?.id) ??
      positiveNumber(deal?.owner_id?.value) ??
      positiveNumber(deal?.owner?.id) ??
      positiveNumber(deal?.user_id?.id) ??
      positiveNumber(deal?.user_id?.value) ??
      positiveNumber(deal?.owner_id) ??
      positiveNumber(deal?.user_id);

    if (id) return id;
  }

  return null;
}

async function getDeal(config: PipedriveConfig, dealId: number): Promise<any> {
  const payload = await pipedriveRequest(config, "GET", `deals/${dealId}`);
  return payload.data;
}

async function getDealActivities(config: PipedriveConfig, dealId: number): Promise<any[]> {
  const payload = await pipedriveRequest(config, "GET", `deals/${dealId}/activities`, {
    apiVersion: "v1",
    params: { done: 0, limit: 500 },
  });
  return payload.data || [];
}

function activityMatchesCalendly(activity: any, calendly: Pick<ReturnType<typeof extractCalendlyDetails>, "eventUri" | "inviteeUri">): boolean {
  const haystack = [
    activity?.note,
    activity?.public_description,
    activity?.description,
  ].map(asString).join("\n");
  return Boolean(
    (calendly.inviteeUri && haystack.includes(calendly.inviteeUri)) ||
    (calendly.eventUri && haystack.includes(calendly.eventUri)),
  );
}

function activityNote(
  deal: any,
  calendly: Pick<ReturnType<typeof extractCalendlyDetails>, "eventName" | "eventUri" | "inviteeUri">,
  zoomRegistration?: ZoomRegistration | null,
): string {
  const url = zoomRegistration?.join_url || dealMeetingUrl(deal) || calendly.inviteeUri || calendly.eventUri;
  const parts = [`${calendly.eventName} : ${url}`];
  if (zoomRegistration?.meeting_id) parts.push(`Zoom meeting ID: ${zoomRegistration.meeting_id}`);
  if (zoomRegistration?.registrant_id) parts.push(`Zoom registrant ID: ${zoomRegistration.registrant_id}`);
  return parts.join("\n");
}

function findExistingActivity(
  activities: any[],
  subject: string,
  dueDate: string,
  dueTime: string,
  calendly: Pick<ReturnType<typeof extractCalendlyDetails>, "eventUri" | "inviteeUri">,
): any | null {
  return activities.find((activity) =>
    asString(activity.subject) === subject &&
    asString(activity.due_date) === dueDate &&
    asString(activity.due_time).slice(0, 5) === dueTime.slice(0, 5)
  ) || activities.find((activity) =>
    asString(activity.subject) === subject && activityMatchesCalendly(activity, calendly)
  ) || null;
}

function isMissingDealError(error: unknown): boolean {
  if (!(error instanceof WebinarActivityError)) return false;
  return error.message.startsWith("No Pipedrive deal found in ") ||
    (error.message.startsWith("No ") && error.message.includes(" pipeline deal has the matching Calendly booking ID "));
}

function dealTitle(calendly: ReturnType<typeof extractCalendlyDetails>, collective: CollectiveConfig): string {
  return calendly.name || calendly.email;
}

async function createDeal(
  config: PipedriveConfig,
  personId: number,
  collective: CollectiveConfig,
  calendly: ReturnType<typeof extractCalendlyDetails>,
): Promise<any> {
  const meetingUrl = calendly.inviteeUri || calendly.eventUri;
  const payload = await pipedriveRequest(config, "POST", "deals", {
    body: {
      title: dealTitle(calendly, collective),
      person_id: personId,
      owner_id: collective.ownerId,
      pipeline_id: collective.pipelineId,
      status: "open",
      label_ids: [SCHEDULED_WEBINAR_PENDING_LABEL_ID],
      custom_fields: meetingUrl ? { [DEAL_MEETING_URL_FIELD]: meetingUrl } : undefined,
    },
  });
  return payload.data;
}

async function ensureDeal(
  config: PipedriveConfig,
  person: any,
  collective: CollectiveConfig,
  calendly: ReturnType<typeof extractCalendlyDetails>,
  dryRun: boolean,
): Promise<{ dealSummary: any; created: boolean; plannedCreate: boolean }> {
  const personId = idNumber(person.id);
  if (personId) {
    for (let attempt = 1; attempt <= DEAL_LOOKUP_ATTEMPTS; attempt += 1) {
      try {
        return {
          dealSummary: pickMatchingDeal(await getPersonDeals(config, personId), collective, calendly),
          created: false,
          plannedCreate: false,
        };
      } catch (error) {
        if (!isMissingDealError(error)) throw error;
        if (attempt === DEAL_LOOKUP_ATTEMPTS) break;
        await sleep(DEAL_LOOKUP_DELAY_MS);
      }
    }
  }

  if (dryRun) {
    return {
      dealSummary: {
        id: null,
        title: dealTitle(calendly, collective),
        person_id: personId || null,
        owner_id: collective.ownerId,
        pipeline_id: collective.pipelineId,
        label_ids: [SCHEDULED_WEBINAR_PENDING_LABEL_ID],
        [DEAL_MEETING_URL_FIELD]: calendly.inviteeUri || calendly.eventUri,
      },
      created: false,
      plannedCreate: true,
    };
  }

  if (!personId) {
    throw new WebinarActivityError(`Cannot create Pipedrive deal without a person ID for ${calendly.email}.`);
  }

  return { dealSummary: await createDeal(config, personId, collective, calendly), created: true, plannedCreate: false };
}

async function createActivity(
  config: PipedriveConfig,
  deal: any,
  dealSummary: any,
  personId: number,
  subject: string,
  dueDate: string,
  dueTime: string,
  calendly: Pick<ReturnType<typeof extractCalendlyDetails>, "eventName" | "eventUri" | "inviteeUri">,
  zoomRegistration?: ZoomRegistration | null,
): Promise<any> {
  const ownerId = dealOwnerId(deal, dealSummary);
  if (!ownerId) {
    throw new WebinarActivityError(`Could not determine owner for Pipedrive deal ${deal.id}.`);
  }

  const payload = await pipedriveRequest(config, "POST", "activities", {
    apiVersion: "v1",
    body: {
      subject,
      type: ACTIVITY_TYPE,
      user_id: ownerId,
      deal_id: asNumber(deal.id),
      person_id: personId,
      due_date: dueDate,
      due_time: dueTime,
      note: activityNote(deal, calendly, zoomRegistration),
    },
  });
  return payload.data;
}

async function updateActivity(
  config: PipedriveConfig,
  activityId: number,
  deal: any,
  dealSummary: any,
  personId: number,
  subject: string,
  dueDate: string,
  dueTime: string,
  calendly: Pick<ReturnType<typeof extractCalendlyDetails>, "eventName" | "eventUri" | "inviteeUri">,
  zoomRegistration?: ZoomRegistration | null,
): Promise<any> {
  const ownerId = dealOwnerId(deal, dealSummary);
  if (!ownerId) {
    throw new WebinarActivityError(`Could not determine owner for Pipedrive deal ${deal.id}.`);
  }

  const payload = await pipedriveRequest(config, "PUT", `activities/${activityId}`, {
    apiVersion: "v1",
    body: {
      subject,
      type: ACTIVITY_TYPE,
      user_id: ownerId,
      deal_id: asNumber(deal.id),
      person_id: personId,
      due_date: dueDate,
      due_time: dueTime,
      note: activityNote(deal, calendly, zoomRegistration),
    },
  });
  return payload.data;
}

async function getZoomAccessToken(): Promise<string> {
  const accountId = await wmill.getVariable(ZOOM_ACCOUNT_ID_VARIABLE_PATH);
  const authorizationBasic = await wmill.getVariable(ZOOM_AUTHORIZATION_BASIC_VARIABLE_PATH);
  if (!accountId || !authorizationBasic) {
    throw new WebinarActivityError(
      `Missing Zoom credentials. Set ${ZOOM_ACCOUNT_ID_VARIABLE_PATH} and ${ZOOM_AUTHORIZATION_BASIC_VARIABLE_PATH}.`,
    );
  }

  const authorization = authorizationBasic.toLowerCase().startsWith("basic ")
    ? authorizationBasic
    : `Basic ${authorizationBasic}`;
  const url = new URL("https://zoom.us/oauth/token");
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", accountId);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: authorization },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new WebinarActivityError(`Zoom token request failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.access_token;
}

async function zoomRequest(
  token: string,
  method: string,
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown> } = {},
): Promise<any> {
  const url = new URL(`https://api.zoom.us/v2/${path}`);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new WebinarActivityError(`Zoom ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function listUpcomingZoomMeetings(token: string): Promise<ZoomMeeting[]> {
  const meetings: ZoomMeeting[] = [];
  let nextPageToken = "";
  do {
    const payload = await zoomRequest(token, "GET", `users/${encodeURIComponent(ZOOM_USER_EMAIL)}/meetings`, {
      params: {
        type: "scheduled",
        page_size: 300,
        next_page_token: nextPageToken,
      },
    });
    meetings.push(...(payload?.meetings || []));
    nextPageToken = payload?.next_page_token || "";
  } while (nextPageToken);
  return meetings;
}

function zoomMeetingStart(meeting: ZoomMeeting): Date | null {
  const parsed = new Date(asString(meeting.start_time));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findZoomMeetingForCollective(
  meetings: ZoomMeeting[],
  collective: CollectiveConfig,
  calendlyStart: Date,
): { meeting: ZoomMeeting; deltaMinutes: number | null } {
  const collectiveMatches = meetings.filter((meeting) =>
    asString(meeting.topic).toLowerCase().includes(collective.label.toLowerCase()),
  );
  if (!collectiveMatches.length) {
    throw new WebinarActivityError(`No upcoming Zoom meeting topic matched ${collective.label}.`);
  }

  const datedMatches = collectiveMatches
    .map((meeting) => {
      const start = zoomMeetingStart(meeting);
      return {
        meeting,
        deltaMs: start ? Math.abs(start.getTime() - calendlyStart.getTime()) : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => a.deltaMs - b.deltaMs);

  const best = datedMatches[0];
  if (Number.isFinite(best.deltaMs) && best.deltaMs <= ZOOM_MATCH_WINDOW_MS) {
    return { meeting: best.meeting, deltaMinutes: Math.round(best.deltaMs / 60000) };
  }
  if (collectiveMatches.length === 1 && !Number.isFinite(best.deltaMs)) {
    return { meeting: best.meeting, deltaMinutes: null };
  }

  throw new WebinarActivityError(
    `Nearest ${collective.label} Zoom meeting is more than ${Math.round(ZOOM_MATCH_WINDOW_MS / 3600000)}h from the Calendly start.`,
  );
}

function splitInviteeName(name: string, email: string): { firstName: string; lastName: string } {
  const parts = asString(name).split(/\s+/).filter(Boolean);
  if (!parts.length && email) return { firstName: email.split("@", 1)[0], lastName: "." };
  return {
    firstName: parts[0] || "Beforest",
    lastName: parts.slice(1).join(" ") || ".",
  };
}

async function findExistingZoomRegistrant(
  token: string,
  meetingId: number | string,
  email: string,
): Promise<any | null> {
  let nextPageToken = "";
  do {
    const payload = await zoomRequest(token, "GET", `meetings/${meetingId}/registrants`, {
      params: { page_size: 300, next_page_token: nextPageToken },
    });
    const match = (payload?.registrants || []).find((registrant: any) =>
      normalizeEmail(registrant?.email) === email,
    );
    if (match) return match;
    nextPageToken = payload?.next_page_token || "";
  } while (nextPageToken);
  return null;
}

function zoomRegistrationFromRegistrant(
  status: ZoomRegistration["status"],
  meeting: ZoomMeeting,
  deltaMinutes: number | null,
  registrant: any,
): ZoomRegistration {
  return {
    status,
    meeting_id: meeting.id ?? null,
    meeting_topic: asString(meeting.topic),
    meeting_start_time: asString(meeting.start_time),
    match_delta_minutes: deltaMinutes,
    registrant_id: asString(registrant?.registrant_id || registrant?.id),
    join_url: asString(registrant?.join_url || meeting.join_url),
  };
}

function interaktRecipient(rawPhone: string) {
  const cleaned = asString(rawPhone).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return {};
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

function primaryPhoneFromPerson(person: any): string {
  const phone = person?.phone;
  const phones = person?.phones;
  const candidates = [
    phone,
    phone?.value,
    ...(Array.isArray(phone) ? phone.map((entry: any) => entry?.value ?? entry) : []),
    ...(Array.isArray(phones) ? phones.map((entry: any) => entry?.value ?? entry) : []),
  ];
  return firstString(candidates);
}

function isPlaceholder(value: string): boolean {
  return !value || /dummy|placeholder|changeme|replace/i.test(value);
}

function formatDateForWhatsApp(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTimeForWhatsApp(date: Date): string {
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).toUpperCase()} IST`;
}

function firstNameFromInviteeName(name: string, email: string): string {
  return asString(name).split(/\s+/, 1)[0] || email.split("@", 1)[0] || "there";
}

function webinarConfirmationSubject(activityId: number, webinarIso: string): string {
  return "Webinar confirmation sent";
}

async function webinarConfirmationAlreadyLogged(
  config: PipedriveConfig,
  dealId: number,
  activityId: number,
  webinarIso: string,
) {
  const payload = await pipedriveRequest(config, "GET", "activities", {
    apiVersion: "v1",
    params: {
      deal_id: dealId,
      done: 1,
      limit: 500,
    },
  });
  const activities = Array.isArray(payload.data) ? payload.data : [];
  return activities.some((activity: any) =>
    asString(activity.subject) === webinarConfirmationSubject(activityId, webinarIso) &&
    asString(activity.note).includes(`Webinar activity: ${activityId}`),
  );
}

async function createWebinarConfirmationActivity(
  config: PipedriveConfig,
  dealId: number,
  activityId: number,
  webinarIso: string,
  plan: ReturnType<typeof buildWebinarConfirmationPlan>,
) {
  const now = new Date();
  const payload = await pipedriveRequest(config, "POST", "activities", {
    apiVersion: "v1",
    body: {
      deal_id: dealId,
      user_id: BEFOREST_ADMIN_USER_ID,
      subject: webinarConfirmationSubject(activityId, webinarIso),
      type: "task",
      done: 1,
      due_date: now.toISOString().slice(0, 10),
      note: [
        "Sent webinar confirmation on WhatsApp.",
        `Webinar activity: ${activityId}`,
      ].join("<br>"),
    },
  });
  return payload.data;
}

function buildWebinarConfirmationPlan(
  deal: any,
  calendly: ReturnType<typeof extractCalendlyDetails>,
  collective: CollectiveConfig,
  fallbackPhone: string,
) {
  const rawPhone = calendly.phone || fallbackPhone;
  return {
    template_name: WEBINAR_CONFIRMATION_TEMPLATE_NAME,
    whatsapp_template_id: WEBINAR_CONFIRMATION_TEMPLATE_ID,
    template_category: "marketing" as const,
    recipient: interaktRecipient(rawPhone),
    raw_phone_present: Boolean(rawPhone),
    body_values: [
      firstNameFromInviteeName(calendly.name, calendly.email),
      `${collective.label} Collective`,
      formatDateForWhatsApp(calendly.start),
      formatTimeForWhatsApp(calendly.start),
    ],
    callback_data: `pipedrive_deal:${deal.id}:webinar_confirmation`,
  };
}

async function sendInteraktTemplate(plan: ReturnType<typeof buildWebinarConfirmationPlan>) {
  if (!plan.raw_phone_present || (!("fullPhoneNumber" in plan.recipient) && !("phoneNumber" in plan.recipient))) {
    return { sent: false, skipped: true, reason: "missing_lead_phone" };
  }

  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  if (!apiKey || isPlaceholder(apiKey)) {
    throw new WebinarActivityError(`Interakt API key is missing or still dummy at ${INTERAKT_API_KEY_PATH}.`);
  }

  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai")) || "https://api.interakt.ai";
  const authorization = apiKey.toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`;
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/public/message/`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      ...plan.recipient,
      callbackData: plan.callback_data,
      template_category: plan.template_category,
      type: "Template",
      template: {
        name: plan.template_name,
        languageCode: "en",
        bodyValues: plan.body_values,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new WebinarActivityError(`Interakt webinar confirmation failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { sent: true, response: payload };
}

async function sendWebinarConfirmationIfNeeded(
  config: PipedriveConfig,
  deal: any,
  calendly: ReturnType<typeof extractCalendlyDetails>,
  collective: CollectiveConfig,
  activityId: number,
  fallbackPhone: string,
  dryRun: boolean,
) {
  const plan = buildWebinarConfirmationPlan(deal, calendly, collective, fallbackPhone);
  const webinarIso = calendly.start.toISOString();
  const alreadyLogged = activityId
    ? await webinarConfirmationAlreadyLogged(config, Number(deal.id), activityId, webinarIso).catch(() => false)
    : false;

  if (dryRun) {
    return {
      dry_run: true,
      already_logged: alreadyLogged,
      whatsapp: plan,
      would_send: !alreadyLogged,
    };
  }
  if (alreadyLogged) {
    return { sent: false, skipped: true, reason: "already_logged", whatsapp: plan };
  }

  const whatsapp = await sendInteraktTemplate(plan);
  const activity = (whatsapp as any)?.sent
    ? await createWebinarConfirmationActivity(config, Number(deal.id), activityId, webinarIso, plan)
    : null;
  return {
    ...whatsapp,
    whatsapp: plan,
    activity_id: activity?.id ? Number(activity.id) : null,
  };
}

async function registerZoomRegistrant(
  token: string,
  meeting: ZoomMeeting,
  deltaMinutes: number | null,
  calendly: ReturnType<typeof extractCalendlyDetails>,
): Promise<ZoomRegistration> {
  const existing = await findExistingZoomRegistrant(token, meeting.id, calendly.email);
  if (existing) return zoomRegistrationFromRegistrant("existing_registrant", meeting, deltaMinutes, existing);

  const { firstName, lastName } = splitInviteeName(calendly.name, calendly.email);
  try {
    const registrant = await zoomRequest(token, "POST", `meetings/${meeting.id}/registrants`, {
      body: {
        email: calendly.email,
        first_name: firstName,
        last_name: lastName,
      },
    });
    return zoomRegistrationFromRegistrant("registered", meeting, deltaMinutes, registrant);
  } catch (error) {
    const racedExisting = await findExistingZoomRegistrant(token, meeting.id, calendly.email);
    if (racedExisting) return zoomRegistrationFromRegistrant("existing_registrant", meeting, deltaMinutes, racedExisting);
    throw error;
  }
}

async function ensureZoomRegistration(
  collective: CollectiveConfig,
  calendly: ReturnType<typeof extractCalendlyDetails>,
  deal: any,
  dryRun: boolean,
): Promise<ZoomRegistration> {
  const existingReference = dealMeetingReferenceId(deal);
  const existingUrl = dealMeetingUrl(deal);
  if (existingReference && existingUrl.toLowerCase().includes("zoom.")) {
    return {
      status: "already_registered",
      meeting_id: null,
      meeting_topic: "",
      meeting_start_time: "",
      match_delta_minutes: null,
      registrant_id: existingReference,
      join_url: existingUrl,
    };
  }

  const token = await getZoomAccessToken();
  const { meeting, deltaMinutes } = findZoomMeetingForCollective(
    await listUpcomingZoomMeetings(token),
    collective,
    calendly.start,
  );

  if (dryRun) {
    return {
      status: "would_register",
      meeting_id: meeting.id ?? null,
      meeting_topic: asString(meeting.topic),
      meeting_start_time: asString(meeting.start_time),
      match_delta_minutes: deltaMinutes,
      registrant_id: "",
      join_url: asString(meeting.join_url),
    };
  }

  return await registerZoomRegistrant(token, meeting, deltaMinutes, calendly);
}

async function updateDealMeetingFields(
  config: PipedriveConfig,
  deal: any,
  zoomRegistration: ZoomRegistration,
): Promise<any> {
  const customFields: Record<string, string> = {};
  if (zoomRegistration.join_url) customFields[DEAL_MEETING_URL_FIELD] = zoomRegistration.join_url;
  if (zoomRegistration.registrant_id) customFields[DEAL_MEETING_REFERENCE_ID_FIELD] = zoomRegistration.registrant_id;
  if (!Object.keys(customFields).length) return deal;

  const payload = await pipedriveRequest(config, "PATCH", `deals/${deal.id}`, {
    body: { custom_fields: customFields },
  });
  return payload.data;
}

async function enforceDealBasics(
  config: PipedriveConfig,
  deal: any,
  collective: CollectiveConfig,
  calendly: ReturnType<typeof extractCalendlyDetails>,
) {
  const existingLabels = labelIds(deal);
  const nextLabels = Array.from(new Set([...existingLabels, SCHEDULED_WEBINAR_PENDING_LABEL_ID]));
  const payload = await pipedriveRequest(config, "PATCH", `deals/${deal.id}`, {
    body: {
      title: dealTitle(calendly, collective),
      owner_id: collective.ownerId,
      pipeline_id: collective.pipelineId,
      label_ids: nextLabels,
    },
  });
  return payload.data;
}

async function scheduleWebinarReminderJobs(
  dealId: number | null,
  webinarStart: Date,
  dryRun: boolean,
) {
  if (!dealId) return [];

  const now = Date.now();
  const plans = WEBINAR_REMINDER_OFFSETS.map((reminder) => {
    const targetAt = new Date(webinarStart.getTime() - reminder.offsetMinutes * 60_000);
    const delaySeconds = Math.max(0, Math.ceil((targetAt.getTime() - now) / 1000));
    return {
      ...reminder,
      target_at: targetAt.toISOString(),
      delay_seconds: delaySeconds,
      skipped: targetAt.getTime() <= now,
      skip_reason: targetAt.getTime() <= now ? "reminder_time_already_passed" : null,
    };
  });

  if (dryRun) return plans.map((plan) => ({ ...plan, job_id: null, dry_run: true }));

  const scheduled = [];
  for (const plan of plans) {
    if (plan.skipped) {
      scheduled.push({ ...plan, job_id: null });
      continue;
    }
    const jobId = await wmill.runScriptByPathAsync(
      WEBINAR_REMINDER_SCRIPT_PATH,
      {
        dry_run: false,
        deal_id: dealId,
        max_late_minutes: 180,
        max_deals: 1,
      },
      plan.delay_seconds,
    );
    scheduled.push({ ...plan, job_id: jobId });
  }
  return scheduled;
}

export async function main(calendly_payload: unknown, dry_run = false) {
  const calendly = extractCalendlyDetails(calendly_payload);
  const collective = detectCollective(calendly.eventName);
  const { dueDate, dueTime } = pipedriveDueDateTimeParts(calendly.start);
  const config = await loadPipedriveConfig();
  const ensuredPerson = await ensurePerson(config, calendly, collective, dry_run);
  const person = ensuredPerson.person;
  const leadPhone = primaryPhoneFromPerson(person);
  const personId = idNumber(person.id);
  const ensuredDeal = await ensureDeal(config, person, collective, calendly, dry_run);
  const dealSummary = ensuredDeal.dealSummary;
  const dealId = idNumber(dealSummary.id);
  if (!dealId && !(dry_run && ensuredDeal.plannedCreate)) {
    throw new WebinarActivityError(`Pipedrive deal was not created or found for ${calendly.email}.`);
  }
  const deal = dry_run && ensuredDeal.plannedCreate ? dealSummary : await getDeal(config, dealId as number);
  const zoomRegistration = await ensureZoomRegistration(collective, calendly, deal, dry_run);
  const existingActivity = findExistingActivity(
    dry_run && ensuredDeal.plannedCreate ? [] : await getDealActivities(config, Number(deal.id)),
    collective.subject,
    dueDate,
    dueTime,
    calendly,
  );

  const planned = {
    invitee_email: calendly.email,
    collective: collective.label,
    subject: collective.subject,
    due_date: dueDate,
    due_time: dueTime,
    person_id: personId,
    deal_id: idNumber(deal.id),
    deal_owner_id: dry_run ? collective.ownerId : dealOwnerId(deal, dealSummary) || collective.ownerId,
    existing_activity_id: existingActivity?.id ? Number(existingActivity.id) : null,
    created_person: ensuredPerson.created,
    planned_create_person: ensuredPerson.plannedCreate,
    created_deal: ensuredDeal.created,
    planned_create_deal: ensuredDeal.plannedCreate,
    zoom: zoomRegistration,
  };

  if (!dry_run && !planned.deal_owner_id) {
    throw new WebinarActivityError(`Could not determine owner for Pipedrive deal ${deal.id}.`);
  }

  if (dry_run) {
    return {
      dry_run: true,
      action: existingActivity ? "update_existing_activity" : "create_activity",
      planned: {
        ...planned,
        webinar_confirmation: await sendWebinarConfirmationIfNeeded(
          config,
          deal,
          calendly,
          collective,
          Number(existingActivity?.id) || 0,
          leadPhone,
          true,
        ),
        reminder_jobs: await scheduleWebinarReminderJobs(planned.deal_id, calendly.start, true),
      },
    };
  }

  if (existingActivity) {
    const activity = await updateActivity(
      config,
      Number(existingActivity.id),
      deal,
      dealSummary,
      personId,
      collective.subject,
      dueDate,
      dueTime,
      calendly,
      zoomRegistration,
    );
    const dealWithMeetingFields = await updateDealMeetingFields(config, deal, zoomRegistration);
    const updatedDeal = await enforceDealBasics(config, dealWithMeetingFields, collective, calendly);
    const webinarConfirmation = await sendWebinarConfirmationIfNeeded(
      config,
      updatedDeal,
      calendly,
      collective,
      Number(activity.id),
      leadPhone,
      false,
    );
    const reminderJobs = await scheduleWebinarReminderJobs(Number(updatedDeal.id), calendly.start, false);
    return {
      dry_run: false,
      status: "updated_existing_activity",
      activity_id: Number(activity.id),
      updated_deal_id: Number(updatedDeal.id),
      webinar_confirmation: webinarConfirmation,
      reminder_jobs: reminderJobs,
      ...planned,
    };
  }

  const activity = await createActivity(config, deal, dealSummary, personId, collective.subject, dueDate, dueTime, calendly, zoomRegistration);
  const dealWithMeetingFields = await updateDealMeetingFields(config, deal, zoomRegistration);
  const updatedDeal = await enforceDealBasics(config, dealWithMeetingFields, collective, calendly);
  const webinarConfirmation = await sendWebinarConfirmationIfNeeded(
    config,
    updatedDeal,
    calendly,
    collective,
    Number(activity.id),
    leadPhone,
    false,
  );
  const reminderJobs = await scheduleWebinarReminderJobs(Number(updatedDeal.id), calendly.start, false);

  return {
    dry_run: false,
    status: "created",
    activity_id: Number(activity.id),
    updated_deal_id: Number(updatedDeal.id),
    webinar_confirmation: webinarConfirmation,
    reminder_jobs: reminderJobs,
    ...planned,
  };
}
