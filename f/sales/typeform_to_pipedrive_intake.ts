import * as wmill from "windmill-client";


type PipedriveUsageLogArgs = {
  method: string;
  rawEndpoint: string;
  statusCode?: number;
  success: boolean;
  durationMs?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  retryAfter?: string;
  errorMessage?: string;
  requestFingerprint?: string;
};

async function logPipedriveApiUsage(_args: PipedriveUsageLogArgs) {
  return;
}

function pipedriveRateLimitRemaining(response: Response): number | undefined {
  const value = Number(response.headers.get("x-ratelimit-remaining") || response.headers.get("x-rate-limit-remaining"));
  return Number.isFinite(value) ? value : undefined;
}

function pipedriveEndpointForLog(url: URL): string {
  return url.pathname;
}

type Route = "1on1" | "gis" | "webinar" | "unknown";

type TypeformAnswer = {
  type?: string;
  text?: string;
  email?: string;
  phone_number?: string;
  url?: string;
  choice?: { label?: string; other?: string };
  choices?: { labels?: string[] | null; other?: string };
  field?: {
    id?: string;
    ref?: string;
    type?: string;
  };
};

type TypeformPayload = {
  event_id?: string;
  event_type?: string;
  form_response?: {
    form_id?: string;
    token?: string;
    landed_at?: string;
    submitted_at?: string;
    hidden?: Record<string, unknown>;
    definition?: {
      id?: string;
      title?: string;
    };
    answers?: TypeformAnswer[];
  };
};

type PipedriveConfig = {
  apiToken: string;
  companyDomain?: string;
};

type AzureOpenAIConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
};

type CollectiveConfig = {
  collective: string;
  formId: string;
  primaryFormId?: string;
  postGis?: boolean;
  pipelineId: number;
  leadInStageId: number;
  initialEventScheduledStageId: number;
  ownerId: number;
  ownerName: string;
  oneOnOneRef: string;
  webinarCalendlyRef: string;
  productAnswerRef: string;
  productName: string;
};

type Intake = {
  eventId: string;
  responseToken: string;
  formId: string;
  formTitle: string;
  submittedAt: string;
  landedAt: string;
  route: Route;
  collective: CollectiveConfig;
  contact: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
  };
  productAnswer: string;
  currentCity: string;
  oneOnOneReason: string;
  calendlyUrl: string;
  hidden: Record<string, unknown>;
  answerSummary: Array<{
    ref: string;
    type: string;
    value: string;
  }>;
  fitDecision?: FitDecision;
};

type FitDecision = {
  verdict: "fit" | "unfit";
  confidence: number;
  reason: string;
  source: "azure_openai" | "rule_override" | "fallback";
};

const PIPEDRIVE_RESOURCE_PATH = "f/sales/typeform_to_pipedrive_intake/pipedrive";
const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const PRODUCT_MAPPING_SCRIPT_PATH = "f/sales/map_deal_product_from_collective";
const BROCHURE_FOLLOWUP_SCRIPT_PATH = "f/sales/send_brochure_after_typeform";
const POST_BROCHURE_ACK_SCRIPT_PATH = "f/sales/send_post_brochure_acknowledgement";
const QUALIFIED_1ON1_SIGNAL_SCRIPT_PATH = "f/sales/handle_typeform_qualified_1on1_signal";
const GIS_LABEL_IDS_VARIABLE_PATH = "f/sales/gis_label_ids";
const AZURE_OPENAI_VARIABLE_PATHS = {
  endpoint: "f/sales/typeform_to_pipedrive_intake/azure_openai_endpoint",
  apiKey: "f/sales/typeform_to_pipedrive_intake/azure_openai_api_key",
  deployment: "f/sales/typeform_to_pipedrive_intake/azure_openai_deployment",
  apiVersion: "f/sales/typeform_to_pipedrive_intake/azure_openai_api_version",
};
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const POST_GIS_TYPEFORM_SUBMITTED_ACTIVITY_SUBJECT = "Post-GIS Typeform submitted";
const POST_BROCHURE_TYPEFORM_SUBMITTED_ACTIVITY_SUBJECT = "Post-brochure Typeform submitted";
const BROCHURE_FOLLOWUP_DELAY_SECONDS = 300;
const DUPLICATE_INTAKE_WINDOW_HOURS = 48;
const RECENT_DEAL_SCAN_LIMIT = 500;
const FINAL_DUPLICATE_LOOKUP_ATTEMPTS = 6;
const FINAL_DUPLICATE_LOOKUP_DELAY_MS = 5000;
const HAMMIYALA_PRIMARY_FORM_ID = "hbDB2ybS";
const HAMMIYALA_PIPELINE_ID = 1;
const HAMMIYALA_ASSIGNMENT_ACTIVITY_SUBJECT = "Hammiyala owner assigned";
const OWNERS = {
  Vivekanand: { id: 22251956, name: "Vivekanand" },
  Rakesh: { id: 13490118, name: "Rakesh" },
};

type OwnerAssignment = {
  ownerId: number;
  ownerName: string;
  responseKey: string;
  reused: boolean;
};

const LABELS = {
  oneOnOneTbc: 115,
  scheduledWebinarAwaiting: 110,
  scheduledWebinarPending: 111,
};

type GisLabelIds = {
  gisAwaiting: number;
  gisSent: number;
  gisOpened: number;
};

const REFS = {
  firstName: "3e323431-52c9-4a01-8cb2-299b3eaf8d04",
  lastName: "9a863162-3c92-4594-8c1f-c6156192da2c",
  phone: "1e1c9b87-0f9f-4e42-9852-f62aa18f482d",
  email: "74689ad2-2837-473c-a3d5-52d28f90de51",
};

const CURRENT_CITY_REF = "beforest_current_city_2026";

const POST_GIS_REFS = {
  fullName: "full_name",
  phone: "mobile_number",
  email: "email_address",
  whatResonated: "what_resonated",
  whyCollectiveMatters: "why_collective_matters",
  unansweredQuestions: "unanswered_questions",
  scheduleOneOnOne: "schedule_one_on_one",
};

const DEAL_FIELDS = {
  contextLedToFind: "46cfa94fdedfb3774a05d957645221c5b9a118b4",
  investmentHorizon: "69d6858e6d37494e9bb3071b42e52c07ddbb1687",
  motivation: "8f498f1556792f1153e10c7093e25da491147c60",
  localArchitecture: "e285b674e27b01c94d0125d63a983ac63ea85650",
  caughtAttention: "d0fcb559d53d555a5dafef583501276906e6bad3",
  curiousAspects: "4037a223e67a517cb398e2ec6af5362922c76ce7",
  joiningJourney: "3e696ca795b810d5a5b7c145398448ea7d398961",
  searchingDuration: "44f2f24c7755ade7e67b73e5b92283bdab78b60e",
  joiningTimeline: "424828659a3b1c06dabdefbd99934eca9aa0e18a",
  familiarity: "eebb37e264955ef2bbd3586e7cb1ed098f4ef33f",
  sustainabilityProfile: "aa6cd8a5c81b948c7dc1dea6b61f45d172b1f1fe",
  beforeBeforestPlan: "2f98a2aad11770dcc6b8eee9f49fc48d669aaeba",
  initialEventCalendlyLink: "d05a896b54bd98d72748efcfe2ffe0f588851256",
  oneOnOneReason: "cf9fc01d7f779c5a5f9b9c76c07cdd17cfcec470",
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
  email: "2f592ab838e053d66de919b9b186e55e983747c9",
  utmSource: "cb54d93a5681001707fd6976cd47bb9a24192ca4",
  utmMedium: "1b69322bc0548794459e0a3a60fa8ff81f532ab0",
  utmContent: "9b1ccbaa2a51bcd10ae8524587a38794e7caa7b7",
  dwellTime: "4a293cd83f60d6a2783ebd31c6b9fc532afba76b",
  timeTakenToFillTypeform: "d8d76010c6a29236c8fde3f3c7e6c3286060ddac",
  distractionScore: "172d9955f789201330bc962e7503d3f2b5379d21",
  currentPage: "41259152d5d87a08599c6897bcf8750a9466f354",
  behavioralJourney: "7b2122b4e95d5ca1b6fce5a5e3052c8fb0ea083f",
  device: "96127352313e205db3cc8ba81f977345b9bbb7a2",
  firstVisit: "d337cd4762160ca5b6c611a4f612d23e162ea054",
  totalVisits: "5f9a97741164c7ecbad1fc1a7d43c1da1a74a652",
  intentCopy: "438b6a662a7d503c27ecd05191329cbe50cc7aef",
  rageClicks: "331445973474871c99c9c26bcbfa333d73f47090",
  confusionScore: "6c098c2350c74a9dddb3dd09c3282d7d27bad342",
  currentCity: "7a56106207f7c86104eeec332138ec8159ee2ec2",
  meetingReferenceId: "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50",
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
};

const TYPEFORM_REF_TO_DEAL_FIELD: Record<string, string> = {
  "01J6Z82HCN0C5ZH8EXKJF57JY1": DEAL_FIELDS.contextLedToFind,
  "b1cb1fa4-4921-4b8e-82ca-c9bab08926c6": DEAL_FIELDS.investmentHorizon,
  "bb190f58-c307-4fe4-82e0-18bd05c20b8c": DEAL_FIELDS.investmentHorizon,
  "66c4437c-14d1-4e28-8614-95304998a358": DEAL_FIELDS.investmentHorizon,
  "0fdd2e09-a8ae-455b-bad3-ff6d370c4ab8": DEAL_FIELDS.motivation,
  "980bf1e4-3f84-46a9-a233-584cff52ce4a": DEAL_FIELDS.localArchitecture,
  "ae7d9e26-fb2a-489f-b08e-f9910bc674fc": DEAL_FIELDS.localArchitecture,
  "8f00897f-9466-42ad-8fe9-ffa859347459": DEAL_FIELDS.localArchitecture,
  "661c523a-afbd-430f-a6b0-79bcc5a62531": DEAL_FIELDS.caughtAttention,
  "3acc5520-20d6-4825-9ac5-20efff77dd49": DEAL_FIELDS.curiousAspects,
  "863981d1-87cf-4418-991e-c1ca40a3c51f": DEAL_FIELDS.joiningJourney,
  "4e85fbe4-42f8-4db9-b462-9c4c61f56922": DEAL_FIELDS.joiningJourney,
  "33224c7f-c701-423b-a07e-60fd1755e3c5": DEAL_FIELDS.searchingDuration,
  "39868b6d-bf42-42cd-82d9-58d095b8fe28": DEAL_FIELDS.joiningTimeline,
  "81d4415d-87e4-49d2-b4b1-cc29825d268d": DEAL_FIELDS.familiarity,
  "de9a890b-140b-43af-be8b-6ddbe02a459c": DEAL_FIELDS.sustainabilityProfile,
  "a3e7d6b0-3e09-4a4c-b5f3-cb39ebffb0e7": DEAL_FIELDS.beforeBeforestPlan,
  "113a9ad4-4d43-4165-9bf7-62f82b1352ab": DEAL_FIELDS.oneOnOneReason,
  "f8e95240-2bd9-4522-8eac-53860c400950": DEAL_FIELDS.oneOnOneReason,
  "1292d853-e1d7-438a-8f82-70fbad90e914": DEAL_FIELDS.oneOnOneReason,
  "4c30971d-c15d-42f8-90d1-94c19a475c4d": DEAL_FIELDS.oneOnOneReason,
  "a2ff21bd-fc13-4d10-a3ab-f92a46e1864c": DEAL_FIELDS.initialEventCalendlyLink,
  "fb9d0477-730b-486c-8e9b-59b07ded1583": DEAL_FIELDS.initialEventCalendlyLink,
  "717327eb-16b7-42ec-bee1-cdbb5cbea73d": DEAL_FIELDS.initialEventCalendlyLink,
};

const COLLECTIVES: Record<string, CollectiveConfig> = {
  CYae8hmZ: {
    collective: "Bhopal",
    formId: "CYae8hmZ",
    pipelineId: 4,
    leadInStageId: 37,
    initialEventScheduledStageId: 30,
    ownerId: OWNERS.Vivekanand.id,
    ownerName: OWNERS.Vivekanand.name,
    oneOnOneRef: "113a9ad4-4d43-4165-9bf7-62f82b1352ab",
    webinarCalendlyRef: "a2ff21bd-fc13-4d10-a3ab-f92a46e1864c",
    productAnswerRef: "863981d1-87cf-4418-991e-c1ca40a3c51f",
    productName: "Bhopal #1AC",
  },
  hbDB2ybS: {
    collective: "Hammiyala",
    formId: "hbDB2ybS",
    pipelineId: 1,
    leadInStageId: 10,
    initialEventScheduledStageId: 1,
    ownerId: OWNERS.Rakesh.id,
    ownerName: OWNERS.Rakesh.name,
    oneOnOneRef: "f8e95240-2bd9-4522-8eac-53860c400950",
    webinarCalendlyRef: "a2ff21bd-fc13-4d10-a3ab-f92a46e1864c",
    productAnswerRef: "863981d1-87cf-4418-991e-c1ca40a3c51f",
    productName: "Hammiyala #2 AC",
  },
  kfcjiXxR: {
    collective: "Mumbai",
    formId: "kfcjiXxR",
    pipelineId: 2,
    leadInStageId: 13,
    initialEventScheduledStageId: 14,
    ownerId: OWNERS.Vivekanand.id,
    ownerName: OWNERS.Vivekanand.name,
    oneOnOneRef: "1292d853-e1d7-438a-8f82-70fbad90e914",
    webinarCalendlyRef: "fb9d0477-730b-486c-8e9b-59b07ded1583",
    productAnswerRef: "4e85fbe4-42f8-4db9-b462-9c4c61f56922",
    productName: "Mumbai #Earth Home",
  },
  i8eBLQkz: {
    collective: "Poomaale 2.0",
    formId: "i8eBLQkz",
    pipelineId: 3,
    leadInStageId: 20,
    initialEventScheduledStageId: 21,
    ownerId: OWNERS.Rakesh.id,
    ownerName: OWNERS.Rakesh.name,
    oneOnOneRef: "4c30971d-c15d-42f8-90d1-94c19a475c4d",
    webinarCalendlyRef: "717327eb-16b7-42ec-bee1-cdbb5cbea73d",
    productAnswerRef: "4e85fbe4-42f8-4db9-b462-9c4c61f56922",
    productName: "Poomaale 2.0 #2.5AC",
  },
  z1sh3mRI: {
    collective: "Hyderabad",
    formId: "z1sh3mRI",
    primaryFormId: "z1sh3mRI",
    postGis: true,
    pipelineId: 6,
    leadInStageId: 44,
    initialEventScheduledStageId: 45,
    ownerId: OWNERS.Vivekanand.id,
    ownerName: OWNERS.Vivekanand.name,
    oneOnOneRef: "",
    webinarCalendlyRef: "",
    productAnswerRef: "",
    productName: "Hyderabad Collective",
  },
};

COLLECTIVES.i1b6g9ZU = {
  ...COLLECTIVES.CYae8hmZ,
  formId: "i1b6g9ZU",
  primaryFormId: "CYae8hmZ",
  postGis: true,
};

COLLECTIVES.RqtSprR9 = {
  ...COLLECTIVES.hbDB2ybS,
  formId: "RqtSprR9",
  primaryFormId: "hbDB2ybS",
  postGis: true,
};

COLLECTIVES.s9YSmglR = {
  ...COLLECTIVES.kfcjiXxR,
  formId: "s9YSmglR",
  primaryFormId: "kfcjiXxR",
  postGis: true,
};

COLLECTIVES.Prnzj8zH = {
  ...COLLECTIVES.i8eBLQkz,
  formId: "Prnzj8zH",
  primaryFormId: "i8eBLQkz",
  postGis: true,
};

class IntakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntakeError";
  }
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown): string {
  return asString(value).toLowerCase();
}

function normalizePhone(value: unknown): string {
  return asString(value).replace(/[^\d+]/g, "");
}

function normalizeName(value: unknown): string {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhoneDigits(value: unknown): string {
  const digits = asString(value).replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(-10);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function emailLocalPart(value: unknown): string {
  return normalizeEmail(value).split("@", 1)[0] || "";
}

function emailDomain(value: unknown): string {
  return normalizeEmail(value).split("@")[1] || "";
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
}

function emailsLikelySame(left: string, right: string): boolean {
  const normalizedLeft = normalizeEmail(left);
  const normalizedRight = normalizeEmail(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  const leftLocal = emailLocalPart(normalizedLeft);
  const rightLocal = emailLocalPart(normalizedRight);
  if (!leftLocal || leftLocal !== rightLocal) return false;
  return editDistanceAtMostOne(emailDomain(normalizedLeft), emailDomain(normalizedRight));
}

function answerValue(answer: TypeformAnswer | undefined): string {
  if (!answer) return "";
  if (answer.type === "email") return asString(answer.email);
  if (answer.type === "phone_number") return asString(answer.phone_number);
  if (answer.type === "url") return asString(answer.url);
  if (answer.type === "choice") return asString(answer.choice?.label || answer.choice?.other);
  if (answer.type === "choices") {
    const labels = answer.choices?.labels || [];
    return [...labels, asString(answer.choices?.other)].filter(Boolean).join(", ");
  }
  return asString(answer.text);
}

function findAnswer(answers: TypeformAnswer[], ref: string): TypeformAnswer | undefined {
  return answers.find((answer) => answer.field?.ref === ref);
}

function findAnswerAny(answers: TypeformAnswer[], refs: string[]): TypeformAnswer | undefined {
  return refs.map((ref) => findAnswer(answers, ref)).find(Boolean);
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function buildFullName(firstName: string, lastName: string, email: string): string {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  if (email) return email.split("@", 1)[0];
  return "Typeform Lead";
}

function unwrapPayload(body: unknown): TypeformPayload {
  if (typeof body === "string") {
    const jsonStart = body.indexOf("{");
    if (jsonStart === -1) throw new IntakeError("Request body does not contain JSON.");
    return JSON.parse(body.slice(jsonStart)) as TypeformPayload;
  }

  if (body && typeof body === "object" && "body" in body) {
    const wrapped = body as { body?: unknown };
    if (wrapped.body && typeof wrapped.body === "object" && "form_response" in wrapped.body) {
      return wrapped.body as TypeformPayload;
    }
  }

  return body as TypeformPayload;
}

function parseIntake(body: unknown): Intake {
  const payload = unwrapPayload(body);
  const response = payload.form_response;
  if (!response) throw new IntakeError("Missing Typeform form_response.");

  const formId = asString(response.form_id || response.definition?.id);
  const collective = COLLECTIVES[formId];
  if (!collective) throw new IntakeError(`Unsupported Typeform form_id: ${formId || "(missing)"}`);

  const answers = response.answers || [];
  const isPostGis = Boolean(collective.postGis);
  const email = normalizeEmail(answerValue(findAnswerAny(answers, [REFS.email, POST_GIS_REFS.email])));
  const phone = normalizePhone(answerValue(findAnswerAny(answers, [REFS.phone, POST_GIS_REFS.phone])));
  const fullNameAnswer = isPostGis ? answerValue(findAnswer(answers, POST_GIS_REFS.fullName)) : "";
  const splitName = splitFullName(fullNameAnswer);
  const firstName = answerValue(findAnswer(answers, REFS.firstName)) || splitName.firstName;
  const lastName = answerValue(findAnswer(answers, REFS.lastName)) || splitName.lastName;
  const oneOnOneReason =
    answerValue(findAnswer(answers, collective.oneOnOneRef)) ||
    (isPostGis
      ? answerValue(
          findAnswerAny(answers, [
            POST_GIS_REFS.unansweredQuestions,
            POST_GIS_REFS.whyCollectiveMatters,
            POST_GIS_REFS.whatResonated,
          ]),
        )
      : "");
  const calendlyUrl = answerValue(findAnswer(answers, collective.webinarCalendlyRef));
  const productAnswer = answerValue(findAnswer(answers, collective.productAnswerRef));
  const currentCity = answerValue(findAnswer(answers, CURRENT_CITY_REF));
  const postGisRequestsOneOnOne = /^(yes|y)$/i.test(
    answerValue(findAnswer(answers, POST_GIS_REFS.scheduleOneOnOne)),
  );
  const route: Route = oneOnOneReason || postGisRequestsOneOnOne ? "1on1" : "gis";

  if (!email && !phone) {
    throw new IntakeError("Submission has neither email nor phone; cannot match/create Pipedrive person.");
  }

  const answerSummary = answers.map((answer) => ({
    ref: asString(answer.field?.ref),
    type: asString(answer.field?.type || answer.type),
    value: answerValue(answer),
  }));

  return {
    eventId: asString(payload.event_id),
    responseToken: asString(response.token),
    formId,
    formTitle: asString(response.definition?.title),
    submittedAt: asString(response.submitted_at),
    landedAt: asString(response.landed_at),
    route,
    collective,
    contact: {
      firstName,
      lastName,
      fullName: buildFullName(firstName, lastName, email),
      email,
      phone,
    },
    productAnswer,
    currentCity,
    oneOnOneReason,
    calendlyUrl,
    hidden: response.hidden || {},
    answerSummary,
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
    throw new IntakeError(
      `Missing Pipedrive credentials. Create resource ${PIPEDRIVE_RESOURCE_PATH} or secret variable ${PIPEDRIVE_VARIABLE_PATH}.`,
    );
  }
  return { apiToken, companyDomain: DEFAULT_PIPEDRIVE_DOMAIN };
}

async function loadGisLabelIds(): Promise<GisLabelIds> {
  const raw = await wmill.getVariable(GIS_LABEL_IDS_VARIABLE_PATH).catch(() => "");
  if (!raw) {
    throw new IntakeError(
      `Missing GIS label IDs. Create Pipedrive labels GIS Awaiting, GIS Sent, GIS Opened, then set ${GIS_LABEL_IDS_VARIABLE_PATH} to {"gisAwaiting":123,"gisSent":124,"gisOpened":125}.`,
    );
  }

  let parsed: Partial<GisLabelIds>;
  try {
    parsed = JSON.parse(raw) as Partial<GisLabelIds>;
  } catch {
    throw new IntakeError(`${GIS_LABEL_IDS_VARIABLE_PATH} must be valid JSON.`);
  }

  const ids = {
    gisAwaiting: Number(parsed.gisAwaiting),
    gisSent: Number(parsed.gisSent),
    gisOpened: Number(parsed.gisOpened),
  };
  if (!ids.gisAwaiting || !ids.gisSent || !ids.gisOpened) {
    throw new IntakeError(
      `${GIS_LABEL_IDS_VARIABLE_PATH} must include numeric gisAwaiting, gisSent, and gisOpened IDs.`,
    );
  }
  return ids;
}

async function loadAzureOpenAIConfig(): Promise<AzureOpenAIConfig | null> {
  const [endpoint, apiKey, deployment, apiVersion] = await Promise.all([
    wmill.getVariable(AZURE_OPENAI_VARIABLE_PATHS.endpoint).catch(() => ""),
    wmill.getVariable(AZURE_OPENAI_VARIABLE_PATHS.apiKey).catch(() => ""),
    wmill.getVariable(AZURE_OPENAI_VARIABLE_PATHS.deployment).catch(() => ""),
    wmill.getVariable(AZURE_OPENAI_VARIABLE_PATHS.apiVersion).catch(() => ""),
  ]);

  const config = {
    endpoint: asString(endpoint),
    apiKey: asString(apiKey),
    deployment: asString(deployment),
    apiVersion: asString(apiVersion || "2024-10-21"),
  };

  if (
    !config.endpoint ||
    !config.apiKey ||
    !config.deployment ||
    config.endpoint.startsWith("dummy") ||
    config.apiKey.startsWith("dummy") ||
    config.deployment.startsWith("dummy")
  ) {
    return null;
  }

  return config;
}

function azureChatCompletionsRequest(config: AzureOpenAIConfig): {
  url: URL;
  bodyBase: Record<string, unknown>;
  tokenLimitParam: "max_tokens" | "max_completion_tokens";
} {
  const endpoint = config.endpoint.replace(/\/+$/, "");
  if (endpoint.endsWith("/openai/v1")) {
    return {
      url: new URL(`${endpoint}/chat/completions`),
      bodyBase: { model: config.deployment },
      tokenLimitParam: "max_completion_tokens",
    };
  }

  const url = new URL(
    `${endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}/chat/completions`,
  );
  url.searchParams.set("api-version", config.apiVersion);
  return { url, bodyBase: {}, tokenLimitParam: "max_tokens" };
}

function fallbackFitDecision(reason: string): FitDecision {
  return {
    verdict: "fit",
    confidence: 0,
    reason,
    source: "fallback",
  };
}

function ruleFitDecision(verdict: "fit" | "unfit", confidence: number, reason: string): FitDecision {
  return {
    verdict,
    confidence,
    reason,
    source: "rule_override",
  };
}

function normalizedLeadText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function isGreetingOrFillerOnly(value: string): boolean {
  const normalized = normalizedLeadText(value);
  if (!normalized) return true;
  const words = normalized.split(" ").filter(Boolean);
  const compact = normalized.replace(/\s+/g, "");
  const filler = new Set([
    "hi",
    "hii",
    "hiii",
    "hello",
    "hey",
    "heyy",
    "ok",
    "okay",
    "k",
    "yes",
    "no",
    "na",
    "n/a",
    "none",
    "nothing",
    "nil",
    "test",
    "testing",
    "asdf",
    "qwerty",
  ]);
  if (filler.has(normalized) || filler.has(compact)) return true;
  return words.length <= 2 && words.every((word) => filler.has(word));
}

function deterministicFitDecision(intake: Intake): FitDecision | null {
  if (intake.route !== "1on1") return null;

  const reason = normalizedLeadText(intake.oneOnOneReason);
  const context = normalizedLeadText(
    [
      intake.oneOnOneReason,
      hiddenValue(intake, "intent_copy"),
      hiddenValue(intake, "behavioral_journey"),
      hiddenValue(intake, "current_page"),
    ].join(" "),
  );

  if (isGreetingOrFillerOnly(intake.oneOnOneReason)) {
    return ruleFitDecision("unfit", 0.98, "1on1 reason is only a greeting or filler text.");
  }

  if (
    hasPattern(reason, [
      /\b(i am|im|i m|we are|ready|serious|almost ready|move forward|go ahead|finali[sz]e|commit|decide|decision)\b/,
    ]) &&
    hasPattern(reason, [
      /\b(clarif|detail|question|discuss|understand|explain|call|talk|speak|before deciding|before finali[sz]ing)\b/,
    ])
  ) {
    return ruleFitDecision("fit", 0.98, "Lead says they are ready or near-ready and only need clarifications.");
  }

  if (
    hasPattern(context, [
      /\b(want|looking|planning|ready|interested|considering|serious)\b.{0,40}\b(invest|join|buy|own|ownership|book|reserve)\b/,
      /\b(invest|join|buy|own|ownership|book|reserve)\b.{0,40}\b(now|soon|this month|next week|immediate|immediately|ready)\b/,
      /\b(ready to invest|ready to join|want to invest|want to join|looking to invest|looking to buy|interested in ownership)\b/,
    ])
  ) {
    return ruleFitDecision("fit", 0.96, "Lead states direct ownership, joining, booking, or investment intent.");
  }

  if (
    hasPattern(reason, [
      /\b(price|pricing|cost|payment|emi|installment|investment amount|budget|loan|finance|legal|agreement|document|registry|ownership|returns?|roi|resale|maintenance|next steps?|site visit|visit|how to book|booking process|reserve)\b/,
    ])
  ) {
    return ruleFitDecision("fit", 0.94, "Lead asks a specific commercial, legal, visit, or booking-process question.");
  }

  if (
    hasPattern(reason, [
      /\b(call me|please call|schedule a call|talk to|speak to|discuss with|connect with|need a call)\b/,
    ]) &&
    hasPattern(context, [
      /\b(invest|join|buy|own|ownership|collective|beforest|bhopal|mumbai|hammiyala|poomaale|hyderabad|clarif|detail|question|decision)\b/,
    ])
  ) {
    return ruleFitDecision("fit", 0.93, "Lead requests a call to discuss a relevant collective or decision question.");
  }

  if (
    hasPattern(reason, [
      /\b(just browsing|only browsing|casually browsing|just curious|only curious|not ready|not now|no budget|dont have budget|do not have budget|cant afford|cannot afford|general info|general information|for education|for knowledge|student research|research purpose)\b/,
    ])
  ) {
    return ruleFitDecision("unfit", 0.9, "Lead explicitly says they are browsing, not ready, or only seeking generic information.");
  }

  return null;
}

function fitPrompt(intake: Intake): string {
  const answers = intake.answerSummary
    .filter((answer) => answer.value)
    .map((answer) => `- ${answer.ref}: ${answer.value}`)
    .join("\n");

  return [
    `Classify this Beforest 1on1 request as fit or unfit.`,
    `Fit means the person appears ready for a 1on1 sales conversation now.`,
    `Unfit means they should be moved to the GIS story nurturing path instead.`,
    ``,
    `Strong fit signals: near-term timeline, serious budget/ownership intent, specific clarifications, thoughtful reason for joining.`,
    `Unfit signals: not ready, only casually browsing, weak intent, unclear budget/timeline, wants generic education first.`,
    `Hard fit override: if they say they are ready/near-ready and only need clarifications, or ask specific pricing/payment/legal/visit/booking questions, classify fit.`,
    `Hard unfit override: if the 1on1 reason is only a greeting/filler such as "Hi", or they clearly say they are only browsing/not ready/no budget, classify unfit.`,
    ``,
    `Return only JSON with keys: verdict, confidence, reason.`,
    `verdict must be "fit" or "unfit". confidence must be 0 to 1.`,
    ``,
    `Collective: ${intake.collective.collective}`,
    `Name: ${intake.contact.fullName}`,
    `1on1 reason: ${intake.oneOnOneReason}`,
    `Hidden current_page: ${hiddenValue(intake, "current_page")}`,
    `Hidden behavioral_journey: ${hiddenValue(intake, "behavioral_journey")}`,
    `Answers:`,
    answers,
  ].join("\n");
}

function parseFitDecision(raw: string): FitDecision {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallbackFitDecision("Azure OpenAI response did not contain JSON.");

  try {
    const parsed = JSON.parse(match[0]) as Partial<FitDecision>;
    const verdict = parsed.verdict === "unfit" ? "unfit" : "fit";
    const confidence = Number(parsed.confidence);
    return {
      verdict,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      reason: asString(parsed.reason) || "No reason returned.",
      source: "azure_openai",
    };
  } catch {
    return fallbackFitDecision("Azure OpenAI response JSON could not be parsed.");
  }
}

async function classifyOneOnOneFit(intake: Intake): Promise<FitDecision> {
  if (intake.route !== "1on1") {
    return fallbackFitDecision("Not a 1on1 route; AI fit classification not required.");
  }

  const override = deterministicFitDecision(intake);
  if (override) return override;

  const config = await loadAzureOpenAIConfig();
  if (!config) return fallbackFitDecision("Azure OpenAI config missing or still set to dummy values.");

  const { url, bodyBase, tokenLimitParam } = azureChatCompletionsRequest(config);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": config.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...bodyBase,
      messages: [
        {
          role: "system",
          content:
            "You are a strict CRM qualification assistant for Beforest. Return compact JSON only.",
        },
        { role: "user", content: fitPrompt(intake) },
      ],
      temperature: 0,
      [tokenLimitParam]: 180,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage =
      asString(payload?.error?.message) || asString(payload?.message) || response.statusText;
    return fallbackFitDecision(`Azure OpenAI request failed: ${response.status} ${providerMessage}`);
  }

  return parseFitDecision(asString(payload?.choices?.[0]?.message?.content));
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

  const startedAt = Date.now();

  const response = await fetch(url, {
    method,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  await logPipedriveApiUsage({
    method,
    rawEndpoint: pipedriveEndpointForLog(url),
    statusCode: response.status,
    success: response.ok && payload?.success !== false,
    durationMs: Date.now() - startedAt,
    rateLimitRemaining: pipedriveRateLimitRemaining(response),
    rateLimitReset: response.headers.get("x-ratelimit-reset") || response.headers.get("x-rate-limit-reset") || "",
    retryAfter: response.headers.get("retry-after") || "",
    errorMessage: response.ok && payload?.success !== false ? "" : JSON.stringify(payload).slice(0, 800),
    requestFingerprint: method.toUpperCase() + " " + pipedriveEndpointForLog(url),
  });
  if (!response.ok || payload?.success === false) {
    throw new IntakeError(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function searchPerson(config: PipedriveConfig, term: string, field: "email" | "phone"): Promise<any | null> {
  if (!term) return null;
  const payload = await pipedriveRequest(config, "GET", "persons/search", {
    params: {
      term,
      fields: field,
      exact_match: "true",
      limit: 1,
    },
  });
  const items = payload?.data?.items || [];
  if (!items.length) return null;
  return items[0].item || items[0];
}

async function findPerson(config: PipedriveConfig, intake: Intake): Promise<any | null> {
  return (
    (await searchPerson(config, intake.contact.email, "email")) ||
    (await searchPerson(config, intake.contact.phone, "phone"))
  );
}

async function getPerson(config: PipedriveConfig, personId: number): Promise<any | null> {
  const payload = await pipedriveRequest(config, "GET", `persons/${personId}`);
  return payload.data || null;
}

function personIdFromDeal(deal: any): number | null {
  const raw =
    deal?.person_id?.value ??
    deal?.person_id?.id ??
    deal?.person?.id ??
    deal?.person_id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function personEmails(person: any): string[] {
  return uniqueStrings([
    person?.email,
    ...(Array.isArray(person?.email) ? person.email.map((entry: any) => entry?.value ?? entry) : []),
    ...(Array.isArray(person?.emails) ? person.emails.map((entry: any) => entry?.value ?? entry) : []),
  ].map(normalizeEmail));
}

function personPhones(person: any): string[] {
  return uniqueStrings([
    person?.phone,
    ...(Array.isArray(person?.phone) ? person.phone.map((entry: any) => entry?.value ?? entry) : []),
    ...(Array.isArray(person?.phones) ? person.phones.map((entry: any) => entry?.value ?? entry) : []),
  ].map(normalizePhoneDigits));
}

async function getPipelineDeals(config: PipedriveConfig, pipelineId: number): Promise<any[]> {
  const payload = await pipedriveRequest(config, "GET", "deals", {
    apiVersion: "v1",
    params: {
      status: "all_not_deleted",
      pipeline_id: pipelineId,
      limit: RECENT_DEAL_SCAN_LIMIT,
      sort: "add_time DESC",
    },
  });
  return (payload.data || []).sort((a: any, b: any) => dealTimestampMs(b) - dealTimestampMs(a));
}

function ownerIdFromDeal(deal: any): number | null {
  const raw = deal?.owner_id?.id ?? deal?.owner_id?.value ?? deal?.owner_id ?? deal?.user_id?.id ?? deal?.user_id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ownerNameFromId(ownerId: number): string {
  if (ownerId === OWNERS.Vivekanand.id) return OWNERS.Vivekanand.name;
  if (ownerId === OWNERS.Rakesh.id) return OWNERS.Rakesh.name;
  return `Pipedrive owner ${ownerId}`;
}

function assignIntakeOwner(intake: Intake, ownerId: number, ownerName = ownerNameFromId(ownerId)) {
  intake.collective = {
    ...intake.collective,
    ownerId,
    ownerName,
  };
}

function isPrimaryHammiyalaIntake(intake: Intake): boolean {
  return intake.formId === HAMMIYALA_PRIMARY_FORM_ID && !intake.collective.postGis;
}

async function ensureHammiyalaOwnerAllocator() {
  const sql = wmill.datatable("main");
  await sql`
    CREATE TABLE IF NOT EXISTS hammiyala_owner_allocator_state (
      allocator_key TEXT PRIMARY KEY,
      next_owner_id BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS hammiyala_owner_assignments (
      response_key TEXT PRIMARY KEY,
      owner_id BIGINT NOT NULL,
      owner_name TEXT NOT NULL,
      deal_id BIGINT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`
    INSERT INTO hammiyala_owner_allocator_state (allocator_key, next_owner_id)
    VALUES ('hammiyala_primary', ${OWNERS.Vivekanand.id}::BIGINT)
    ON CONFLICT (allocator_key) DO NOTHING
  `.execute();
}

async function allocateHammiyalaOwner(intake: Intake): Promise<OwnerAssignment> {
  const responseKey = intakeReferenceId(intake);
  if (!responseKey) throw new IntakeError("Hammiyala owner allocation requires a Typeform response token or event id.");
  await ensureHammiyalaOwnerAllocator();
  const sql = wmill.datatable("main");
  const rows = await sql`
    WITH locked AS (
      SELECT next_owner_id
      FROM hammiyala_owner_allocator_state
      WHERE allocator_key = 'hammiyala_primary'
      FOR UPDATE
    ), inserted AS (
      INSERT INTO hammiyala_owner_assignments (response_key, owner_id, owner_name)
      SELECT
        ${responseKey},
        next_owner_id,
        CASE
          WHEN next_owner_id = ${OWNERS.Vivekanand.id}::BIGINT THEN ${OWNERS.Vivekanand.name}
          ELSE ${OWNERS.Rakesh.name}
        END
      FROM locked
      ON CONFLICT (response_key) DO NOTHING
      RETURNING response_key, owner_id, owner_name
    ), rotated AS (
      UPDATE hammiyala_owner_allocator_state
      SET next_owner_id = CASE
            WHEN next_owner_id = ${OWNERS.Vivekanand.id}::BIGINT THEN ${OWNERS.Rakesh.id}::BIGINT
            ELSE ${OWNERS.Vivekanand.id}::BIGINT
          END,
          updated_at = NOW()
      WHERE allocator_key = 'hammiyala_primary'
        AND EXISTS (SELECT 1 FROM inserted)
      RETURNING next_owner_id
    )
    SELECT response_key, owner_id, owner_name, FALSE AS reused
    FROM inserted
    UNION ALL
    SELECT response_key, owner_id, owner_name, TRUE AS reused
    FROM hammiyala_owner_assignments
    WHERE response_key = ${responseKey}
      AND NOT EXISTS (SELECT 1 FROM inserted)
    LIMIT 1
  `.fetch();
  const row = Array.isArray(rows) ? rows[0] : null;
  const ownerId = Number(row?.owner_id);
  if (![OWNERS.Vivekanand.id, OWNERS.Rakesh.id].includes(ownerId)) {
    throw new IntakeError("Hammiyala owner allocator returned no valid owner; deal creation stopped for manual review.");
  }
  return {
    ownerId,
    ownerName: asString(row.owner_name) || ownerNameFromId(ownerId),
    responseKey,
    reused: row.reused === true || asString(row.reused).toLowerCase() === "true",
  };
}

async function linkHammiyalaAssignmentToDeal(assignment: OwnerAssignment, dealId: number) {
  const sql = wmill.datatable("main");
  await sql`
    UPDATE hammiyala_owner_assignments
    SET deal_id = ${dealId}::BIGINT, updated_at = NOW()
    WHERE response_key = ${assignment.responseKey}
      AND owner_id = ${assignment.ownerId}::BIGINT
  `.execute();
}

function personPayload(intake: Intake, includeOwner: boolean): Record<string, unknown> {
  const emails = intake.contact.email
    ? [{ value: intake.contact.email, primary: true, label: "work" }]
    : [];
  const phones = intake.contact.phone
    ? [{ value: intake.contact.phone, primary: true, label: "work" }]
    : [];

  return {
    name: intake.contact.fullName,
    ...(includeOwner ? { owner_id: intake.collective.ownerId } : {}),
    emails,
    phones,
  };
}

async function createPerson(config: PipedriveConfig, intake: Intake): Promise<any> {
  const payload = await pipedriveRequest(config, "POST", "persons", { body: personPayload(intake, true) });
  return payload.data;
}

async function updatePerson(config: PipedriveConfig, personId: number, intake: Intake): Promise<any> {
  const payload = await pipedriveRequest(config, "PATCH", `persons/${personId}`, { body: personPayload(intake, false) });
  return payload.data;
}

async function getPersonDeals(config: PipedriveConfig, personId: number): Promise<any[]> {
  const payload = await pipedriveRequest(config, "GET", `persons/${personId}/deals`, {
    apiVersion: "v1",
    params: { status: "all_not_deleted", limit: 500 },
  });
  return payload.data || [];
}

async function getDeal(config: PipedriveConfig, dealId: number): Promise<any | null> {
  const payload = await pipedriveRequest(config, "GET", `deals/${dealId}`);
  return payload.data || null;
}

function stageAndLabel(intake: Intake, gisLabels: GisLabelIds): { stageId: number; labelIds: number[] } {
  if (intake.route === "webinar") {
    return {
      stageId: intake.collective.leadInStageId,
      labelIds: [gisLabels.gisAwaiting],
    };
  }
  if (intake.fitDecision?.verdict === "unfit") {
    return {
      stageId: intake.collective.leadInStageId,
      labelIds: [gisLabels.gisAwaiting],
    };
  }
  if (needsManualFitReview(intake)) {
    return {
      stageId: intake.collective.leadInStageId,
      labelIds: [gisLabels.gisAwaiting],
    };
  }
  if (intake.route === "gis") {
    return {
      stageId: intake.collective.leadInStageId,
      labelIds: [gisLabels.gisAwaiting],
    };
  }
  return {
    stageId: intake.collective.initialEventScheduledStageId,
    labelIds: [LABELS.oneOnOneTbc],
  };
}

function needsManualFitReview(intake: Intake): boolean {
  return (
    intake.route === "1on1" &&
    intake.fitDecision?.source === "fallback" &&
    !intake.fitDecision.reason.toLowerCase().startsWith("dry run")
  );
}

function hiddenValue(intake: Intake, key: string): string {
  return asString(intake.hidden[key]);
}

function hiddenNumber(intake: Intake, key: string): number | undefined {
  const value = Number(hiddenValue(intake, key));
  return Number.isFinite(value) ? value : undefined;
}

function secondsFromDuration(value: string): number | undefined {
  const match = value.match(/(\d+(?:\.\d+)?)\s*s/i);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function typeformFillDuration(intake: Intake): string {
  const landedAt = Date.parse(intake.landedAt);
  const submittedAt = Date.parse(intake.submittedAt);
  if (!Number.isFinite(landedAt) || !Number.isFinite(submittedAt) || submittedAt < landedAt) return "";

  const totalSeconds = Math.round((submittedAt - landedAt) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function hiddenDate(intake: Intake, key: string): string {
  const value = hiddenValue(intake, key);
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function nonEmptyFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function dealCustomFieldsPayload(intake: Intake): Record<string, unknown> {
  const answerFields = Object.fromEntries(
    intake.answerSummary
      .map((answer) => [TYPEFORM_REF_TO_DEAL_FIELD[answer.ref], answer.value] as const)
      .filter(([fieldKey, value]) => fieldKey && value),
  );

  return nonEmptyFields({
    ...answerFields,
    [DEAL_FIELDS.oneOnOneReason]: intake.oneOnOneReason,
    [DEAL_FIELDS.currentCity]: intake.currentCity,
    [DEAL_FIELDS.email]: intake.contact.email,
    [DEAL_FIELDS.phone]: intake.contact.phone,
    [DEAL_FIELDS.utmSource]: hiddenValue(intake, "utm_source"),
    [DEAL_FIELDS.utmMedium]: hiddenValue(intake, "utm_medium"),
    [DEAL_FIELDS.utmContent]: hiddenValue(intake, "utm_content"),
    [DEAL_FIELDS.dwellTime]: secondsFromDuration(hiddenValue(intake, "utm_time_spent")),
    [DEAL_FIELDS.timeTakenToFillTypeform]: typeformFillDuration(intake),
    [DEAL_FIELDS.distractionScore]: hiddenNumber(intake, "distraction_score"),
    [DEAL_FIELDS.currentPage]: hiddenValue(intake, "current_page"),
    [DEAL_FIELDS.behavioralJourney]: hiddenValue(intake, "behavioral_journey"),
    [DEAL_FIELDS.device]: hiddenValue(intake, "device"),
    [DEAL_FIELDS.firstVisit]: hiddenDate(intake, "first_visit"),
    [DEAL_FIELDS.totalVisits]: hiddenNumber(intake, "total_visits"),
    [DEAL_FIELDS.intentCopy]: hiddenValue(intake, "intent_copy"),
    [DEAL_FIELDS.rageClicks]: hiddenValue(intake, "rage_clicks"),
    [DEAL_FIELDS.confusionScore]: hiddenValue(intake, "confusion_score"),
    [DEAL_FIELDS.meetingReferenceId]: intake.responseToken || intake.eventId,
    [DEAL_FIELDS.initialEventCalendlyLink]: intake.calendlyUrl,
    [DEAL_FIELDS.meetingUrl]: intake.calendlyUrl,
  });
}

function dealPayload(intake: Intake, personId: number, gisLabels: GisLabelIds): Record<string, unknown> {
  const { stageId, labelIds } = stageAndLabel(intake, gisLabels);
  const customFields = dealCustomFieldsPayload(intake);
  return nonEmptyFields({
    title: intake.contact.fullName,
    owner_id: intake.collective.ownerId,
    person_id: personId,
    pipeline_id: intake.collective.pipelineId,
    stage_id: stageId,
    label_ids: labelIds,
    custom_fields: Object.keys(customFields).length ? customFields : undefined,
  });
}

function intakeReferenceId(intake: Intake): string {
  return intake.responseToken || intake.eventId;
}

function findExistingDeal(deals: any[], intake: Intake): any | null {
  const referenceId = intakeReferenceId(intake);
  if (!referenceId) return null;
  return deals.find((deal) => asString(deal[DEAL_FIELDS.meetingReferenceId]) === referenceId) || null;
}

async function findHiddenPipedriveDeal(config: PipedriveConfig, intake: Intake): Promise<any | null> {
  const dealId = Number(hiddenValue(intake, "pipedrive_deal_id"));
  if (!Number.isFinite(dealId) || dealId <= 0) return null;
  const deal = await getDeal(config, dealId).catch(() => null);
  if (!deal) return null;
  if (Number(deal?.pipeline_id) !== intake.collective.pipelineId) return null;

  const intakePhone = normalizePhoneDigits(intake.contact.phone);
  const dealPhones = dealContactPhones(deal);
  if (intakePhone && dealPhones.includes(intakePhone)) return deal;

  const intakeEmail = normalizeEmail(intake.contact.email);
  const dealEmails = dealContactEmails(deal);
  if (intakeEmail && dealEmails.some((email) => emailsLikelySame(email, intakeEmail))) return deal;

  if (dealTitleMatches(deal, intake)) return deal;
  return null;
}

function normalizeComparable(value: unknown): string {
  return asString(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function dealCustomFieldValue(deal: any, fieldKey: string): string {
  return asString(deal?.[fieldKey] ?? deal?.custom_fields?.[fieldKey]);
}

function dealAddedWithinWindow(deal: any, now: Date, hours: number): boolean {
  const timestamp = dealTimestampMs(deal);
  if (!timestamp) return false;
  const ageMs = now.getTime() - timestamp;
  return ageMs >= 0 && ageMs <= hours * 60 * 60 * 1000;
}

function dealTimestampMs(deal: any): number {
  const rawDate = asString(deal?.add_time || deal?.update_time);
  if (!rawDate) return 0;
  const timestamp = new Date(rawDate).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function routeFieldsMatch(deal: any, intake: Intake): boolean {
  if (intake.route === "webinar") {
    const intakeCalendlyUrl = normalizeComparable(intake.calendlyUrl);
    if (!intakeCalendlyUrl) return false;
    const existingUrls = [
      dealCustomFieldValue(deal, DEAL_FIELDS.meetingUrl),
      dealCustomFieldValue(deal, DEAL_FIELDS.initialEventCalendlyLink),
    ].map(normalizeComparable).filter(Boolean);
    return existingUrls.some((existingUrl) => existingUrl === intakeCalendlyUrl);
  }

  if (intake.route === "1on1") {
    return normalizeComparable(dealCustomFieldValue(deal, DEAL_FIELDS.oneOnOneReason)) === normalizeComparable(intake.oneOnOneReason);
  }

  return false;
}

function findRecentDuplicateIntakeDeal(deals: any[], intake: Intake, now = new Date()): any | null {
  return (
    deals.find((deal) => {
      if (Number(deal?.pipeline_id) !== intake.collective.pipelineId) return false;
      if (!dealAddedWithinWindow(deal, now, DUPLICATE_INTAKE_WINDOW_HOURS)) return false;
      return routeFieldsMatch(deal, intake);
    }) || null
  );
}

function findPostGisSameCollectiveDeal(deals: any[], person: any, intake: Intake): any | null {
  if (!intake.collective.postGis) return null;
  return (
    sortDealsNewestFirst(deals).find((deal) => {
      if (Number(deal?.pipeline_id) !== intake.collective.pipelineId) return false;
      return Boolean(broadDuplicateReason(deal, person, intake) || dealTitleMatches(deal, intake));
    }) || null
  );
}

function dealTitleMatches(deal: any, intake: Intake): boolean {
  const intakeName = normalizeName(intake.contact.fullName);
  if (!intakeName) return false;
  return [
    deal?.title,
    deal?.person_name,
    deal?.person_id?.name,
  ].map(normalizeName).some((name) => name === intakeName);
}

function dealContactEmails(deal: any): string[] {
  return uniqueStrings([
    dealCustomFieldValue(deal, DEAL_FIELDS.email),
    deal?.person_id?.email,
  ].map(normalizeEmail));
}

function dealContactPhones(deal: any): string[] {
  return uniqueStrings([
    dealCustomFieldValue(deal, DEAL_FIELDS.phone),
    deal?.person_id?.phone,
  ].map(normalizePhoneDigits));
}

function labelIds(deal: any): number[] {
  const raw = deal?.label_ids ?? deal?.labels ?? deal?.label;
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((value) => typeof value === "object" && value !== null ? [value.id] : [value])
    .map(numberValue)
    .filter((value): value is number => value !== null);
}

function broadDuplicateReason(deal: any, person: any, intake: Intake): string | null {
  const intakePhone = normalizePhoneDigits(intake.contact.phone);
  const candidatePhones = uniqueStrings([...dealContactPhones(deal), ...personPhones(person)]);
  if (intakePhone && candidatePhones.includes(intakePhone)) return "normalized_phone_same_collective";

  const intakeEmail = normalizeEmail(intake.contact.email);
  const candidateEmails = uniqueStrings([...dealContactEmails(deal), ...personEmails(person)]);
  if (intakeEmail && candidateEmails.some((email) => emailsLikelySame(email, intakeEmail))) {
    return "email_or_email_typo_same_collective";
  }

  return null;
}

function recentPersonDuplicateReason(deal: any, person: any, intake: Intake, now = new Date()): string | null {
  if (Number(deal?.pipeline_id) !== intake.collective.pipelineId) return null;
  if (!dealAddedWithinWindow(deal, now, DUPLICATE_INTAKE_WINDOW_HOURS)) return null;

  if (routeFieldsMatch(deal, intake)) {
    return `same person, same collective, same ${intake.route} fields`;
  }

  const broadReason = broadDuplicateReason(deal, person, intake);
  if (broadReason) return broadReason;

  if (
    intake.route === "webinar" &&
    labelIds(deal).includes(LABELS.scheduledWebinarPending)
  ) {
    return "same_person_recent_webinar_pending_deal";
  }

  return null;
}

function sortDealsNewestFirst(deals: any[]): any[] {
  return [...deals].sort((a, b) => dealTimestampMs(b) - dealTimestampMs(a));
}

async function findRecentPersonDuplicateDeal(
  config: PipedriveConfig,
  personId: number,
  person: any,
  intake: Intake,
  now = new Date(),
): Promise<{ deal: any; reason: string } | null> {
  const deals = sortDealsNewestFirst(await getPersonDeals(config, personId));
  for (const deal of deals) {
    const reason = recentPersonDuplicateReason(deal, person, intake, now);
    if (reason) return { deal, reason };
  }
  return null;
}

async function findRecentPersonDuplicateDealWithRetry(
  config: PipedriveConfig,
  personId: number,
  person: any,
  intake: Intake,
): Promise<{ deal: any; reason: string } | null> {
  const attempts = intake.route === "webinar" ? FINAL_DUPLICATE_LOOKUP_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const match = await findRecentPersonDuplicateDeal(config, personId, person, intake);
    if (match) return match;
    if (attempt < attempts) await sleep(FINAL_DUPLICATE_LOOKUP_DELAY_MS);
  }
  return null;
}

async function findRecentPipelineDuplicateDeal(
  config: PipedriveConfig,
  intake: Intake,
  now = new Date(),
): Promise<{ deal: any; person: any; reason: string } | null> {
  const recentDeals = (await getPipelineDeals(config, intake.collective.pipelineId))
    .filter((deal) => dealAddedWithinWindow(deal, now, DUPLICATE_INTAKE_WINDOW_HOURS));

  for (const deal of recentDeals) {
    const personId = personIdFromDeal(deal);
    if (!personId) continue;
    const person = await getPerson(config, personId).catch(() => null);
    if (!person) continue;
    const reason = broadDuplicateReason(deal, person, intake);
    if (reason) return { deal, person, reason };
  }

  const nameMatches = recentDeals.filter((deal) => dealTitleMatches(deal, intake));
  if (nameMatches.length === 1) {
    const personId = personIdFromDeal(nameMatches[0]);
    const person = personId ? await getPerson(config, personId).catch(() => null) : null;
    if (person) return { deal: nameMatches[0], person, reason: "unique_name_same_collective_recent" };
  }

  return null;
}

async function createDeal(config: PipedriveConfig, personId: number, intake: Intake, gisLabels: GisLabelIds): Promise<any> {
  const payload = await pipedriveRequest(config, "POST", "deals", { body: dealPayload(intake, personId, gisLabels) });
  return payload.data;
}

async function updateDeal(config: PipedriveConfig, dealId: number, personId: number, intake: Intake, gisLabels: GisLabelIds, existingDeal?: any): Promise<any> {
  const fullExistingDeal = await getDeal(config, dealId).catch(() => existingDeal || null);
  const payloadBody = dealPayload(intake, personId, gisLabels);
  const customFields = payloadBody.custom_fields as Record<string, unknown> | undefined;
  const existingMeetingUrl =
    dealCustomFieldValue(fullExistingDeal, DEAL_FIELDS.meetingUrl) ||
    dealCustomFieldValue(existingDeal, DEAL_FIELDS.meetingUrl);
  if (customFields && /zoom\.us/i.test(existingMeetingUrl)) {
    customFields[DEAL_FIELDS.meetingUrl] = existingMeetingUrl;
  }
  const payload = await pipedriveRequest(config, "PATCH", `deals/${dealId}`, {
    body: payloadBody,
  });
  return payload.data;
}

async function enforceDealRouting(config: PipedriveConfig, dealId: number, intake: Intake, gisLabels: GisLabelIds): Promise<any> {
  const { stageId, labelIds } = stageAndLabel(intake, gisLabels);
  const payload = await pipedriveRequest(config, "PATCH", `deals/${dealId}`, {
    body: {
      owner_id: intake.collective.ownerId,
      pipeline_id: intake.collective.pipelineId,
      stage_id: stageId,
      label_ids: labelIds,
    },
  });
  return payload.data;
}

function buildNoteContent(intake: Intake): string {
  const lines = [
    intake.collective.postGis ? `<strong>Post-Journey Typeform intake</strong>` : `<strong>Typeform intake</strong>`,
    `Route: ${intake.route}`,
    `Collective: ${intake.collective.collective}`,
    `Owner: ${intake.collective.ownerName}`,
    `Form: ${intake.formTitle || intake.formId}`,
    `Event ID: ${intake.eventId}`,
    `Response token: ${intake.responseToken}`,
    `Submitted at: ${intake.submittedAt}`,
    `Email: ${intake.contact.email}`,
    `Phone: ${intake.contact.phone}`,
    `Current page: ${hiddenValue(intake, "current_page")}`,
    `Device: ${hiddenValue(intake, "device")}`,
    `Website engagement time: ${hiddenValue(intake, "utm_time_spent")}`,
    `Typeform fill time: ${typeformFillDuration(intake)}`,
    `Distraction score: ${hiddenValue(intake, "distraction_score")}`,
  ];
  if (intake.calendlyUrl) lines.push(`Calendly URL: ${intake.calendlyUrl}`);
  if (intake.oneOnOneReason) lines.push(`${intake.collective.postGis ? "Conversation request" : "1on1 reason"}: ${intake.oneOnOneReason}`);
  if (intake.fitDecision) {
    lines.push(`AI fit verdict: ${intake.fitDecision.verdict}`);
    lines.push(`AI fit confidence: ${intake.fitDecision.confidence}`);
    lines.push(`AI fit reason: ${intake.fitDecision.reason}`);
    lines.push(`AI fit source: ${intake.fitDecision.source}`);
  }
  if (hiddenValue(intake, "behavioral_journey")) {
    lines.push(`Behavioral journey: ${hiddenValue(intake, "behavioral_journey")}`);
  }
  return lines.filter(Boolean).join("<br>");
}

async function createNote(config: PipedriveConfig, dealId: number, personId: number, intake: Intake): Promise<any> {
  const payload = await pipedriveRequest(config, "POST", "notes", {
    apiVersion: "v1",
    body: {
      content: buildNoteContent(intake),
      deal_id: dealId,
      person_id: personId,
    },
  });
  return payload.data;
}

async function createPipedriveActivity(
  config: PipedriveConfig,
  dealId: number,
  subject: string,
  note: string,
  options: {
    personId?: number | null;
    userId?: number;
    done?: 0 | 1;
    type?: string;
  } = {},
): Promise<any> {
  const payload = await pipedriveRequest(config, "POST", "activities", {
    apiVersion: "v1",
    body: {
      deal_id: dealId,
      ...(options.personId ? { person_id: options.personId } : {}),
      user_id: options.userId ?? BEFOREST_ADMIN_USER_ID,
      subject,
      type: options.type || "task",
      done: options.done ?? 1,
      due_date: todayInTimezone("Asia/Kolkata"),
      note,
    },
  });
  return payload.data;
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

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectiveKey(intake: Intake): string {
  const value = intake.collective.collective.toLowerCase();
  if (value.includes("hammiyala")) return "hammiyala";
  if (value.includes("mumbai")) return "mumbai";
  if (value.includes("poomaale")) return "poomaale2";
  if (value.includes("bhopal")) return "bhopal";
  if (value.includes("hyderabad")) return "hyderabad";
  return "";
}

async function queueBrochureFollowup(dealId: number, intake: Intake) {
  try {
    const jobId = await wmill.runScriptByPathAsync(
      BROCHURE_FOLLOWUP_SCRIPT_PATH,
      {
        deal_id: dealId,
        phone: intake.contact.phone,
        collective_key: collectiveKey(intake),
        submitted_at: intake.submittedAt || new Date().toISOString(),
        source: "typeform_fallback",
        dry_run: false,
      },
      BROCHURE_FOLLOWUP_DELAY_SECONDS,
    );
    return { status: "queued", job_id: jobId, scheduled_in_seconds: BROCHURE_FOLLOWUP_DELAY_SECONDS };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function queuePostBrochureAcknowledgement(dealId: number) {
  try {
    const jobId = await wmill.runScriptByPathAsync(
      POST_BROCHURE_ACK_SCRIPT_PATH,
      { deal_id: dealId, dry_run: false },
      0,
    );
    return { status: "queued", job_id: jobId };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function queueQualified1on1Signal(body: unknown, useTestEvent = false) {
  try {
    const jobId = await wmill.runScriptByPathAsync(
      QUALIFIED_1ON1_SIGNAL_SCRIPT_PATH,
      { body, dry_run: false, use_test_event: useTestEvent },
      0,
    );
    return { status: "queued", job_id: jobId };
  } catch (error) {
    return {
      status: "failed_to_queue",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function intendedPlan(intake: Intake, gisLabels: GisLabelIds) {
  return {
    route: intake.route,
    fit_decision: intake.fitDecision,
    collective: intake.collective.collective,
    form_id: intake.formId,
    event_id: intake.eventId,
    response_token: intake.responseToken,
    person_match: "email_then_phone",
    deal_title: intake.contact.fullName,
    owner_id: intake.collective.ownerId,
    owner_name: intake.collective.ownerName,
    owner_assignment: isPrimaryHammiyalaIntake(intake) ? "strict_round_robin_for_new_deal_only" : "collective_default_or_existing_deal",
    pipeline_id: intake.collective.pipelineId,
    stage_id: stageAndLabel(intake, gisLabels).stageId,
    label_ids: stageAndLabel(intake, gisLabels).labelIds,
    product: {
      name: intake.collective.productName,
      answer: intake.productAnswer,
    },
    meeting_url: intake.calendlyUrl,
    custom_field_count: Object.keys(dealCustomFieldsPayload(intake)).length,
  };
}

export async function main(body: unknown, dry_run = false) {
  const payload = unwrapPayload(body);
  const eventType = asString(payload.event_type);
  if (eventType === "form_response_partial") {
    return {
      dry_run,
      status: "partial_response_ignored_embed_transport_enabled",
      event_type: eventType,
      qualified_1on1_signal: "not_queued",
      pipedrive_side_effects: "skipped",
      final_submit_side_effects: "skipped",
    };
  }

  const intake = parseIntake(payload);
  const gisLabels = await loadGisLabelIds();
  if (dry_run && intake.route === "1on1") {
    intake.fitDecision =
      deterministicFitDecision(intake) || fallbackFitDecision("Dry run; AI classification skipped.");
  }
  if (!dry_run && intake.route === "1on1") {
    intake.fitDecision = await classifyOneOnOneFit(intake);
  }

  if (intake.route === "unknown") {
    throw new IntakeError("Could not determine route from Typeform branch answers.");
  }

  if (dry_run) {
    if (isPrimaryHammiyalaIntake(intake)) {
      assignIntakeOwner(intake, OWNERS.Vivekanand.id, OWNERS.Vivekanand.name);
    }
    return {
      dry_run: true,
      intended: intendedPlan(intake, gisLabels),
      allocation_preview: isPrimaryHammiyalaIntake(intake)
        ? "Vivek is the seeded first owner. Dry-run does not consume or inspect the live allocator turn."
        : null,
      parsed: {
        submitted_at: intake.submittedAt,
        current_page: hiddenValue(intake, "current_page"),
        answer_count: intake.answerSummary.length,
      },
      qualified_1on1_signal: {
        status: eventType === "form_response" ? "would_queue" : "not_queued_without_completed_event_type",
        worker: QUALIFIED_1ON1_SIGNAL_SCRIPT_PATH,
      },
    };
  }

  const qualifiedSignal = eventType === "form_response"
    ? await queueQualified1on1Signal(payload)
    : { status: "not_queued_without_completed_event_type" };
  const config = await loadPipedriveConfig();
  const hiddenDeal = await findHiddenPipedriveDeal(config, intake);
  const pipelineDuplicateDeal = await findRecentPipelineDuplicateDeal(config, intake);
  let person = pipelineDuplicateDeal?.person || await findPerson(config, intake);
  const createdPerson = !person;
  const existingPersonId = Number(person?.id) || null;
  const personDeals = existingPersonId ? await getPersonDeals(config, existingPersonId) : [];
  const exactReferenceDeal = findExistingDeal(personDeals, intake);
  const recentDuplicateDeal = exactReferenceDeal ? null : findRecentDuplicateIntakeDeal(personDeals, intake);
  const postGisSameCollectiveDeal = exactReferenceDeal || recentDuplicateDeal
    ? null
    : findPostGisSameCollectiveDeal(personDeals, person, intake);
  const recentPersonDuplicateDeal = exactReferenceDeal || recentDuplicateDeal
    ? null
    : existingPersonId
      ? await findRecentPersonDuplicateDealWithRetry(config, existingPersonId, person, intake)
      : null;
  const matchedDeal = hiddenDeal || exactReferenceDeal || recentDuplicateDeal || postGisSameCollectiveDeal || recentPersonDuplicateDeal?.deal || pipelineDuplicateDeal?.deal || null;
  let ownerAssignment: OwnerAssignment | null = null;
  if (matchedDeal && Number(matchedDeal.pipeline_id?.id ?? matchedDeal.pipeline_id) === HAMMIYALA_PIPELINE_ID) {
    const existingOwnerId = ownerIdFromDeal(matchedDeal);
    if (!existingOwnerId) {
      throw new IntakeError(`Matched Hammiyala deal ${Number(matchedDeal.id)} has no readable Pipedrive owner; refusing to overwrite it.`);
    }
    assignIntakeOwner(intake, existingOwnerId);
  } else if (!matchedDeal && isPrimaryHammiyalaIntake(intake)) {
    ownerAssignment = await allocateHammiyalaOwner(intake);
    assignIntakeOwner(intake, ownerAssignment.ownerId, ownerAssignment.ownerName);
  }
  const intended = intendedPlan(intake, gisLabels);

  if (exactReferenceDeal) {
    return {
      dry_run: false,
      status: "duplicate_intake_ignored",
      reason: "This Typeform response token/event id has already been processed for this person.",
      route: intake.route,
      collective: intake.collective.collective,
      person_id: existingPersonId,
      deal_id: Number(exactReferenceDeal.id),
      created_person: false,
      created_deal: false,
      updated_deal: false,
      duplicate_guard: {
        matched: true,
        reason: "same Typeform response token/event id already processed",
        matched_deal_id: Number(exactReferenceDeal.id),
      },
      intended,
    };
  }

  if (!person) {
    person = await createPerson(config, intake);
  } else {
    person = await updatePerson(config, Number(person.id), intake);
  }
  const personId = Number(person.id);
  const duplicateGuard = hiddenDeal || recentDuplicateDeal || postGisSameCollectiveDeal || recentPersonDuplicateDeal || pipelineDuplicateDeal
    ? {
        matched: true,
        reason: hiddenDeal
          ? "hidden_pipedrive_deal_id_same_collective_contact_context"
          : recentDuplicateDeal
          ? `same person, same collective, same ${intake.route} fields within ${DUPLICATE_INTAKE_WINDOW_HOURS} hours`
          : postGisSameCollectiveDeal
            ? "post_gis_same_person_same_collective_existing_deal"
          : recentPersonDuplicateDeal
            ? `${recentPersonDuplicateDeal.reason} within ${DUPLICATE_INTAKE_WINDOW_HOURS} hours`
            : `${pipelineDuplicateDeal?.reason} within ${DUPLICATE_INTAKE_WINDOW_HOURS} hours`,
        matched_deal_id: Number((hiddenDeal || recentDuplicateDeal || postGisSameCollectiveDeal || recentPersonDuplicateDeal?.deal || pipelineDuplicateDeal?.deal)?.id),
      }
    : {
        matched: false,
        reason: "",
        matched_deal_id: null,
      };
  const writtenDeal = matchedDeal
    ? await updateDeal(config, Number(matchedDeal.id), personId, intake, gisLabels, matchedDeal)
    : await createDeal(config, personId, intake, gisLabels);
  const deal = await enforceDealRouting(config, Number(writtenDeal.id), intake, gisLabels);
  let allocationLinkError = "";
  if (ownerAssignment) {
    await linkHammiyalaAssignmentToDeal(ownerAssignment, Number(deal.id)).catch((error) => {
      allocationLinkError = error instanceof Error ? error.message : String(error);
    });
  }
  let productMapping: any = null;
  try {
    const productMappingJobId = await wmill.runScriptByPathAsync(PRODUCT_MAPPING_SCRIPT_PATH, {
      deal_id: Number(deal.id),
      dry_run: false,
      product_answer: intake.productAnswer,
    }, 0);
    productMapping = {
      status: "queued",
      job_id: productMappingJobId,
    };
  } catch (error) {
    productMapping = {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const note = await createNote(config, Number(deal.id), personId, intake);
  const intakeAudit = await createPipedriveActivity(
    config,
    Number(deal.id),
    intake.collective.postGis ? POST_BROCHURE_TYPEFORM_SUBMITTED_ACTIVITY_SUBJECT : "Typeform received",
    [
      `New ${intake.route} enquiry added from Typeform.`,
      `Collective: ${intake.collective.collective}`,
      ...(intake.collective.postGis ? ["Source: post-brochure Typeform. Stop brochure/Journey follow-up for this deal."] : []),
      `Fit: ${intake.fitDecision?.verdict || "not applicable"}`,
      `Deal: ${matchedDeal ? "updated existing" : "created new"}`,
      ...(duplicateGuard.matched
        ? [`Duplicate guard: merged into deal ${duplicateGuard.matched_deal_id} because ${duplicateGuard.reason}.`]
        : []),
    ].join("<br>"),
    { personId },
  );
  const ownerAssignmentAudit = ownerAssignment
    ? await createPipedriveActivity(
        config,
        Number(deal.id),
        HAMMIYALA_ASSIGNMENT_ACTIVITY_SUBJECT,
        [
          "New Hammiyala deal assigned by strict Vivek/Rakesh round-robin.",
          `Assigned owner: ${ownerAssignment.ownerName} (${ownerAssignment.ownerId}).`,
          `Typeform response: ${ownerAssignment.responseKey}.`,
          `Allocator assignment reused: ${ownerAssignment.reused ? "yes" : "no"}.`,
          ...(allocationLinkError ? [`Allocator deal-link warning: ${allocationLinkError}`] : []),
        ].join("<br>"),
        { personId },
      )
    : null;
  const ownerNotificationActivity = intake.collective.postGis
    ? await createPipedriveActivity(
        config,
        Number(deal.id),
        "Review post-brochure conversation request",
        [
          "The lead submitted the post-brochure Typeform and is asking to move the conversation forward.",
          `Collective: ${intake.collective.collective}`,
          `Owner: ${intake.collective.ownerName}`,
          `Conversation request: ${intake.oneOnOneReason || "See Typeform note on this deal."}`,
          "Deal fields and labels have been updated by the intake automation.",
          "An acknowledgement WhatsApp is queued; if it fails, the acknowledgement worker will create a manual task.",
        ].join("<br>"),
        { personId, userId: intake.collective.ownerId, done: 0 },
      )
    : null;
  const manualReviewActivity = needsManualFitReview(intake)
    ? await createPipedriveActivity(
        config,
        Number(deal.id),
        "Review fit manually",
        [
          "AI fit check failed. Please review the Typeform answers.",
          "If fit: set label to 1on1 TBC and move to Initial Event Scheduled.",
          "If unfit: keep the GIS Awaiting route.",
          `Failure reason: ${intake.fitDecision?.reason || "unknown"}`,
        ].join("<br>"),
        { personId, done: 0 },
      )
    : null;
  const productReviewActivity =
    productMapping?.status === "failed"
      ? await createPipedriveActivity(
          config,
          Number(deal.id),
          "Review product mapping",
          [
            "Could not map the collective product automatically.",
            `Expected product: ${intake.collective.productName}`,
            `Failure reason: ${productMapping.error || "unknown"}`,
          ].join("<br>"),
          { personId, done: 0 },
        )
      : null;
  const brochureFollowup = intake.collective.postGis
    ? null
    : await queueBrochureFollowup(Number(deal.id), intake);
  const postBrochureAcknowledgement = intake.collective.postGis
    ? await queuePostBrochureAcknowledgement(Number(deal.id))
    : null;

  return {
    dry_run: false,
    route: intake.route,
    collective: intake.collective.collective,
    person_id: personId,
    deal_id: Number(deal.id),
    note_id: Number(note.id),
    audit_activity_id: Number(intakeAudit?.id) || null,
    owner_assignment_activity_id: Number(ownerAssignmentAudit?.id) || null,
    owner_assignment: ownerAssignment,
    owner_notification_activity_id: Number(ownerNotificationActivity?.id) || null,
    manual_review_activity_id: Number(manualReviewActivity?.id) || null,
    product_review_activity_id: Number(productReviewActivity?.id) || null,
    brochure_followup: brochureFollowup,
    post_brochure_acknowledgement: postBrochureAcknowledgement,
    product_mapping: productMapping,
    created_person: createdPerson,
    created_deal: !matchedDeal,
    updated_deal: Boolean(matchedDeal),
    duplicate_guard: duplicateGuard,
    custom_field_count: Object.keys(dealCustomFieldsPayload(intake)).length,
    intended,
    qualified_1on1_signal: qualifiedSignal,
  };
}
