import * as wmill from "windmill-client";

type Route = "1on1" | "webinar" | "unknown";

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
  pipelineId: number;
  leadInStageId: number;
  initialEventScheduledStageId: number;
  ownerId: number;
  ownerName: string;
  oneOnOneRef: string;
  webinarCalendlyRef: string;
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
  source: "azure_openai" | "fallback";
};

const PIPEDRIVE_RESOURCE_PATH = "f/sales/typeform_to_pipedrive_intake/pipedrive";
const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const AZURE_OPENAI_VARIABLE_PATHS = {
  endpoint: "f/sales/typeform_to_pipedrive_intake/azure_openai_endpoint",
  apiKey: "f/sales/typeform_to_pipedrive_intake/azure_openai_api_key",
  deployment: "f/sales/typeform_to_pipedrive_intake/azure_openai_deployment",
  apiVersion: "f/sales/typeform_to_pipedrive_intake/azure_openai_api_version",
};
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const OWNERS = {
  Vivekanand: { id: 22251956, name: "Vivekanand" },
  Rakesh: { id: 13490118, name: "Rakesh" },
};

const LABELS = {
  oneOnOneTbc: 115,
  scheduledWebinarAwaiting: 110,
  scheduledWebinarPending: 111,
};

const REFS = {
  firstName: "3e323431-52c9-4a01-8cb2-299b3eaf8d04",
  lastName: "9a863162-3c92-4594-8c1f-c6156192da2c",
  phone: "1e1c9b87-0f9f-4e42-9852-f62aa18f482d",
  email: "74689ad2-2837-473c-a3d5-52d28f90de51",
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
  },
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
  const email = normalizeEmail(answerValue(findAnswer(answers, REFS.email)));
  const phone = normalizePhone(answerValue(findAnswer(answers, REFS.phone)));
  const firstName = answerValue(findAnswer(answers, REFS.firstName));
  const lastName = answerValue(findAnswer(answers, REFS.lastName));
  const oneOnOneReason = answerValue(findAnswer(answers, collective.oneOnOneRef));
  const calendlyUrl = answerValue(findAnswer(answers, collective.webinarCalendlyRef));
  const route: Route = calendlyUrl ? "webinar" : oneOnOneReason ? "1on1" : "unknown";

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

function azureChatCompletionsRequest(config: AzureOpenAIConfig): { url: URL; bodyBase: Record<string, unknown> } {
  const endpoint = config.endpoint.replace(/\/+$/, "");
  if (endpoint.endsWith("/openai/v1")) {
    return {
      url: new URL(`${endpoint}/chat/completions`),
      bodyBase: { model: config.deployment },
    };
  }

  const url = new URL(
    `${endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}/chat/completions`,
  );
  url.searchParams.set("api-version", config.apiVersion);
  return { url, bodyBase: {} };
}

function fallbackFitDecision(reason: string): FitDecision {
  return {
    verdict: "fit",
    confidence: 0,
    reason,
    source: "fallback",
  };
}

function fitPrompt(intake: Intake): string {
  const answers = intake.answerSummary
    .filter((answer) => answer.value)
    .map((answer) => `- ${answer.ref}: ${answer.value}`)
    .join("\n");

  return [
    `Classify this Beforest 1on1 request as fit or unfit.`,
    `Fit means the person appears ready for a 1on1 sales conversation now.`,
    `Unfit means they should be moved to the webinar nurturing path instead.`,
    ``,
    `Strong fit signals: near-term timeline, serious budget/ownership intent, specific clarifications, thoughtful reason for joining.`,
    `Unfit signals: not ready, only casually browsing, weak intent, unclear budget/timeline, wants generic education first.`,
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

  const config = await loadAzureOpenAIConfig();
  if (!config) return fallbackFitDecision("Azure OpenAI config missing or still set to dummy values.");

  const { url, bodyBase } = azureChatCompletionsRequest(config);

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
      max_tokens: 180,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return fallbackFitDecision(`Azure OpenAI request failed: ${response.status}`);
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

  const response = await fetch(url, {
    method,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
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

function personPayload(intake: Intake): Record<string, unknown> {
  const emails = intake.contact.email
    ? [{ value: intake.contact.email, primary: true, label: "work" }]
    : [];
  const phones = intake.contact.phone
    ? [{ value: intake.contact.phone, primary: true, label: "work" }]
    : [];

  return {
    name: intake.contact.fullName,
    owner_id: intake.collective.ownerId,
    emails,
    phones,
  };
}

async function createPerson(config: PipedriveConfig, intake: Intake): Promise<any> {
  const payload = await pipedriveRequest(config, "POST", "persons", { body: personPayload(intake) });
  return payload.data;
}

async function updatePerson(config: PipedriveConfig, personId: number, intake: Intake): Promise<any> {
  const payload = await pipedriveRequest(config, "PATCH", `persons/${personId}`, { body: personPayload(intake) });
  return payload.data;
}

async function getPersonDeals(config: PipedriveConfig, personId: number): Promise<any[]> {
  const payload = await pipedriveRequest(config, "GET", `persons/${personId}/deals`, {
    apiVersion: "v1",
    params: { status: "all_not_deleted", limit: 500 },
  });
  return payload.data || [];
}

function stageAndLabel(intake: Intake): { stageId: number; labelIds: number[] } {
  if (intake.route === "webinar") {
    return {
      stageId: intake.collective.leadInStageId,
      labelIds: [LABELS.scheduledWebinarPending],
    };
  }
  if (intake.fitDecision?.verdict === "unfit") {
    return {
      stageId: intake.collective.leadInStageId,
      labelIds: [LABELS.scheduledWebinarAwaiting],
    };
  }
  if (needsManualFitReview(intake)) {
    return {
      stageId: intake.collective.leadInStageId,
      labelIds: [LABELS.scheduledWebinarAwaiting],
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
    [DEAL_FIELDS.email]: intake.contact.email,
    [DEAL_FIELDS.phone]: intake.contact.phone,
    [DEAL_FIELDS.utmSource]: hiddenValue(intake, "utm_source"),
    [DEAL_FIELDS.utmMedium]: hiddenValue(intake, "utm_medium"),
    [DEAL_FIELDS.utmContent]: hiddenValue(intake, "utm_content"),
    [DEAL_FIELDS.dwellTime]: secondsFromDuration(hiddenValue(intake, "utm_time_spent")),
    [DEAL_FIELDS.timeTakenToFillTypeform]: hiddenValue(intake, "utm_time_spent"),
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

function dealPayload(intake: Intake, personId: number): Record<string, unknown> {
  const { stageId, labelIds } = stageAndLabel(intake);
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

async function createDeal(config: PipedriveConfig, personId: number, intake: Intake): Promise<any> {
  const payload = await pipedriveRequest(config, "POST", "deals", { body: dealPayload(intake, personId) });
  return payload.data;
}

async function updateDeal(config: PipedriveConfig, dealId: number, personId: number, intake: Intake): Promise<any> {
  const payload = await pipedriveRequest(config, "PATCH", `deals/${dealId}`, {
    body: dealPayload(intake, personId),
  });
  return payload.data;
}

async function enforceDealRouting(config: PipedriveConfig, dealId: number, intake: Intake): Promise<any> {
  const { stageId, labelIds } = stageAndLabel(intake);
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
    `<strong>Typeform intake</strong>`,
    `Route: ${intake.route}`,
    `Collective: ${intake.collective.collective}`,
    `Form: ${intake.formTitle || intake.formId}`,
    `Event ID: ${intake.eventId}`,
    `Response token: ${intake.responseToken}`,
    `Submitted at: ${intake.submittedAt}`,
    `Email: ${intake.contact.email}`,
    `Phone: ${intake.contact.phone}`,
    `Current page: ${hiddenValue(intake, "current_page")}`,
    `Device: ${hiddenValue(intake, "device")}`,
    `Time spent: ${hiddenValue(intake, "utm_time_spent")}`,
    `Distraction score: ${hiddenValue(intake, "distraction_score")}`,
  ];
  if (intake.calendlyUrl) lines.push(`Calendly URL: ${intake.calendlyUrl}`);
  if (intake.oneOnOneReason) lines.push(`1on1 reason: ${intake.oneOnOneReason}`);
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

export async function main(body: unknown, dry_run = false) {
  const intake = parseIntake(body);
  if (dry_run && intake.route === "1on1") {
    intake.fitDecision = fallbackFitDecision("Dry run; AI classification skipped.");
  }
  if (!dry_run && intake.route === "1on1") {
    intake.fitDecision = await classifyOneOnOneFit(intake);
  }

  const intended = {
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
    pipeline_id: intake.collective.pipelineId,
    stage_id: stageAndLabel(intake).stageId,
    label_ids: stageAndLabel(intake).labelIds,
    meeting_url: intake.calendlyUrl,
    custom_field_count: Object.keys(dealCustomFieldsPayload(intake)).length,
  };

  if (intake.route === "unknown") {
    throw new IntakeError("Could not determine route from Typeform branch answers.");
  }

  if (dry_run) {
    return {
      dry_run: true,
      intended,
      parsed: {
        submitted_at: intake.submittedAt,
        current_page: hiddenValue(intake, "current_page"),
        answer_count: intake.answerSummary.length,
      },
    };
  }

  const config = await loadPipedriveConfig();
  let person = await findPerson(config, intake);
  const createdPerson = !person;

  if (!person) {
    person = await createPerson(config, intake);
  } else {
    person = await updatePerson(config, Number(person.id), intake);
  }

  const personId = Number(person.id);
  const existingDeal = findExistingDeal(await getPersonDeals(config, personId), intake);
  const writtenDeal = existingDeal
    ? await updateDeal(config, Number(existingDeal.id), personId, intake)
    : await createDeal(config, personId, intake);
  const deal = await enforceDealRouting(config, Number(writtenDeal.id), intake);
  const note = await createNote(config, Number(deal.id), personId, intake);
  const intakeAudit = await createPipedriveActivity(
    config,
    Number(deal.id),
    "Typeform received",
    [
      `New ${intake.route} enquiry added from Typeform.`,
      `Collective: ${intake.collective.collective}`,
      `Fit: ${intake.fitDecision?.verdict || "not applicable"}`,
      `Deal: ${existingDeal ? "updated existing" : "created new"}`,
    ].join("<br>"),
    { personId },
  );
  const manualReviewActivity = needsManualFitReview(intake)
    ? await createPipedriveActivity(
        config,
        Number(deal.id),
        "Review fit manually",
        [
          "AI fit check failed. Please review the Typeform answers.",
          "If fit: set label to 1on1 TBC and move to Initial Event Scheduled.",
          "If unfit: keep the webinar-awaiting route.",
          `Failure reason: ${intake.fitDecision?.reason || "unknown"}`,
        ].join("<br>"),
        { personId, done: 0 },
      )
    : null;

  return {
    dry_run: false,
    route: intake.route,
    collective: intake.collective.collective,
    person_id: personId,
    deal_id: Number(deal.id),
    note_id: Number(note.id),
    audit_activity_id: Number(intakeAudit?.id) || null,
    manual_review_activity_id: Number(manualReviewActivity?.id) || null,
    created_person: createdPerson,
    created_deal: !existingDeal,
    updated_deal: Boolean(existingDeal),
    custom_field_count: Object.keys(dealCustomFieldsPayload(intake)).length,
    intended,
  };
}
