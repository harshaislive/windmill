# Beforest Coffee Blossom Honey popup webhook

Deployed 2026-09-09. Harsha installs the frontend separately. No website code is included or changed.

## Endpoint and ownership

`POST https://flows.ops.beforest.co/api/r/bewild/honey/popup`

Script and trigger: `f/bewild_lead_magnet/honey_popup`. Deployed script hash: `63edd60a56333e5a`.
The public URL has no credential. No authorization header or cookies are required; use `credentials: omit`.
Send `Content-Type: application/json`. Browser Origin must be `https://beforest.co` or `https://www.beforest.co`.

This is a two-step challenge/submit contract, not a single unrestricted form POST. A challenge never sends a message or creates a submission. Only a valid completed submit can send.

## Exact request contract

All fields below are required for `action: challenge`. Unknown fields are rejected.

```json
{
  "action": "challenge",
  "name": "Asha Rao",
  "whatsapp": "+12025550123",
  "whatsapp_consent": true,
  "consent_version": "honey_whatsapp_v1_2026-09-09",
  "copy_variant": "landscape_return",
  "source_page": "https://beforest.co/",
  "request_id": "c16865c9-8222-4b66-a6c3-9c9a07c319c9",
  "website": ""
}
```

The number above is a fictional example; use the visitor's validated international number. Fields:

| Field | Requirement |
| --- | --- |
| action | Exactly `challenge` or `submit` |
| name | String, 2–80 characters after normalization; letters, combining marks, spaces, apostrophes, dots and hyphens only |
| whatsapp | Valid E.164 string with explicit country code, e.g. `+12025550123`; no spaces or punctuation other than leading `+`; no default country inferred server-side |
| whatsapp_consent | Literal boolean `true`, resulting from an explicit unchecked-by-default checkbox |
| consent_version | Exactly `honey_whatsapp_v1_2026-09-09` |
| copy_variant | Exactly `landscape_return` or `honey_unplanned`; both send the promised-story template |
| source_page | Absolute HTTPS page URL on the same origin as the request; no query string, fragment, username or password; maximum 1024 characters |
| request_id | Client-generated UUID v4, stable across retries/double clicks for the same normalized payload |
| website | Honeypot string; must be empty; exclude it from normal user interaction/autofill |
| challenge_id | Required only for `submit`; UUID v4 from the challenge response |
| proof_nonce | Required only for `submit`; decimal string of 1–12 digits solving the challenge |

Maximum encoded JSON request size: 4096 bytes. Do not send template names, credentials, image URLs, consent text, dry_run flags, or extra fields.

Render this consent text alongside the checkbox, with the site's appropriate privacy link:

> I agree to receive the Coffee Blossom Honey story and purchase link from Bewild on WhatsApp.

The backend stores this exact consent text/version and its own UTC receipt timestamp. This does not enroll the visitor in general nurture or historical campaigns.

### Challenge response: HTTP 200

```json
{
  "ok": true,
  "status": "challenge",
  "request_id": "c16865c9-8222-4b66-a6c3-9c9a07c319c9",
  "challenge_id": "66504c32-16a2-4ae2-adc1-3eec2fb120f0",
  "challenge": "a0714c1f0806bc5477993eb903d4d346833260ce378c4dc56473e029ef94c77882",
  "algorithm": "SHA-256",
  "difficulty_bits": 18,
  "minimum_wait_ms": 2000,
  "expires_in_seconds": 300
}
```

Find a decimal nonce string such that SHA-256 of the UTF-8 string `challenge + ":" + proof_nonce` starts with 18 zero bits. In hexadecimal, the first four characters must be `0000` and the fifth must be `0`, `1`, `2` or `3`. The challenge string is hashed as literal text, not decoded hexadecimal bytes. Compute off the UI thread or yield work regularly. This is computational abuse protection, not proof of human identity or phone ownership.

Wait at least 2000 milliseconds after receiving the challenge. Within 300 seconds, POST the **identical original field values** with `action` changed to `submit` and the two proof fields added:

```json
{
  "action": "submit",
  "name": "Asha Rao",
  "whatsapp": "+12025550123",
  "whatsapp_consent": true,
  "consent_version": "honey_whatsapp_v1_2026-09-09",
  "copy_variant": "landscape_return",
  "source_page": "https://beforest.co/",
  "request_id": "c16865c9-8222-4b66-a6c3-9c9a07c319c9",
  "website": "",
  "challenge_id": "66504c32-16a2-4ae2-adc1-3eec2fb120f0",
  "proof_nonce": "482193"
}
```

The challenge and nonce above are illustrative, not a valid solution. The server binds a challenge to the normalized submission including name, phone, consent, variant, page and request ID. Edits require a new request ID and challenge. Challenges expire and are consumed atomically.

### Accepted response: HTTP 202

```json
{
  "ok": true,
  "status": "accepted",
  "request_id": "c16865c9-8222-4b66-a6c3-9c9a07c319c9",
  "message": "Interakt accepted the WhatsApp request. Delivery is not confirmed."
}
```

This means Interakt returned a positive response and message ID, which is stored server-side. It does not mean delivered or read. There is no asynchronous nurture queue or delivery receipt integration in this endpoint.

### Duplicate response: HTTP 200

```json
{
  "ok": true,
  "status": "duplicate",
  "request_id": "c16865c9-8222-4b66-a6c3-9c9a07c319c9",
  "submission_status": "provider_accepted",
  "message": "This campaign submission is already recorded. No additional WhatsApp was requested."
}
```

`submission_status` may instead be `claimed`, `sending`, `provider_rejected`, `send_unknown`, `blocked_template`, `blocked_quota` or `blocked_configuration`. A duplicate does not imply delivery or even provider acceptance. `claimed`/`sending` mean still processing or interrupted; a failure/blocked/unknown status must not be displayed as a successful WhatsApp send.

### Error examples

HTTP 400:

```json
{"ok":false,"status":"error","code":"whatsapp_consent_required","retryable":false}
```

HTTP 409:

```json
{"ok":false,"status":"error","code":"request_id_conflict","retryable":false}
```

HTTP 429 (with `Retry-After: 60`):

```json
{"ok":false,"status":"error","code":"rate_limited","retryable":true}
```

HTTP 502, or 503 if the final ledger update fails:

```json
{"ok":false,"status":"error","code":"send_outcome_unknown","request_id":"c16865c9-8222-4b66-a6c3-9c9a07c319c9","retryable":false}
```

Other errors include 403 `origin_not_allowed` / `invalid_or_expired_challenge`, 413 `payload_too_large`, 415 `unsupported_media_type`, 503 `template_unavailable`, `sender_unavailable`, `campaign_rate_limited` or `service_unavailable`, and 502 `provider_rejected`.

Windmill can reject malformed JSON or infrastructure requests before the script executes; these may be plain-text HTTP errors. The frontend must tolerate non-JSON errors, timeouts and non-2xx responses. Never promise delivery, regenerate IDs to evade errors, or blindly loop submissions. On an ambiguous client timeout, preserve the same request ID; a deliberate repeat can return the recorded status and will not initiate another send for that phone/campaign. Do not add automatic periodic polling or resending.

## CORS and frontend requirements

- Use the exact POST URL above with no secret/token query parameters and no Authorization header.
- Both Beforest origins passed OPTIONS and POST challenge tests. Windmill's existing global preflight allows `*`; the actual handler validates Origin and emits the matching origin for allowed requests. Foreign-origin POSTs return 403. Global CORS settings were not changed.
- Use an explicit country selector/validated E.164 number, explicit consent checkbox, correct variant and stable UUID v4.
- Set source_page to the page's origin plus pathname, excluding query and fragment.
- Disable duplicate button clicks; keep all normalized values stable while solving and submitting.
- Implement challenge solving and timing. This endpoint will not send from a bare single-step payload.
- Distinguish challenge, accepted, duplicate and error states. An HTTP 200 by itself is not a success notification.
- Do not embed the Interakt key, template parameters or backend credentials in HTML.

## Operator notes

Credential: existing `f/bewild_lead_magnet/interakt_api_key` only. No secrets were added or changed.
Both variants use `bewild_honey_promised_story_v1`, language `en`, Meta template ID `952096320544710` for verification only. Sends use the NAME, one first-name `bodyValues` entry and the user-specified Shopify image in `headerValues`. The purchase button is inherited unchanged; no `buttonValues`.

The live approval check occurs before **every** provider POST. APPROVED status, Meta ID, language, header type, body and static button must all match. A missing/unavailable/mutated template blocks the record without sending. The GET inventory uses the same Bewild credential as the sender.

Database: existing Windmill `datatable://main`, PostgreSQL `dashboard_metrics`, public schema. New isolated objects:

- `bewild_honey_submissions`: one canonical row per campaign and phone, consent, selected template, timestamps, status, Interakt message ID and sanitized errors.
- `bewild_honey_requests`: unique request IDs with each accepted normalized request and its consent metadata, linked to the canonical submission.
- `bewild_honey_challenges`: one-time payload-bound challenge fingerprints with issue/expiry/use timestamps.
- `bewild_honey_limits`: atomic rate buckets.
- `bewild_honey_claim` and `bewild_honey_take_limit`: transaction-scoped claiming and rate-limit functions.

Campaign identity remains `coffee_blossom_honey_202609` across both popup variants. Phone/campaign uniqueness and unique request IDs prevent resend even when variants change. PostgreSQL advisory transaction locks and unique constraints make the claim concurrency-safe. A compare-and-set transition to `sending` commits before the only provider POST. Any crash after that point can leave `sending`; it MUST be treated as ambiguous, never blindly reset or retried.

Limits: 120 total valid-origin POST attempts/minute; 20/minute per IP hint; 30 challenges/minute globally; 6 challenge requests/phone/hour; 10 new provider attempts/minute and 200/day (UTC buckets). IP headers are supplementary hints, not trusted identity; global caps, proof-of-work and phone/campaign uniqueness remain authoritative. These are application controls after Windmill receives the request, not a perimeter DDoS service.

No worker schedule, historical replay, nurture flow, CRM update or website change was added. Template/quota/configuration failures remain blocked. Provider 5xx, HTTP 408, invalid success bodies and transport timeouts become `send_unknown`. No automatic provider retry exists. Reconcile a blocked/unknown/interrupted row manually in Interakt using its ID or callbackData `honey:<submission UUID>` before considering a separately approved remedy. Do not delete phone dedupe history to force a resend.

Submission/request ledgers are retained until a separately agreed retention policy; deleting them also removes duplicate-send protection. Expired challenge and rate rows are pruned during later challenge requests. Job args/results are configured to expire after one hour; authorized operators can still access the durable ledger. This route does not claim final delivery/read status: inspect Interakt for delivery outcomes.

## Verification

- 12 unit tests, 60 assertions passed; content drift, IDs, strict types, consent, phone parsing, proof and ambiguous provider responses covered.
- Isolated PostgreSQL transaction tests passed and rolled back.
- Mocked-provider integration against a disposable Postgres schema passed: 8 concurrent identical submits => one provider call and seven duplicate responses; same phone with new request ID => no resend; ambiguous timeout => unknown status and no retry. No real provider POST occurred; QA schema was dropped.
- Live public OPTIONS, disallowed origin, consent false, invalid variant/type, public-bypass rejection, oversized valid JSON, malformed JSON, both-origin challenges and invalid proof checks passed.
- Live honey ledger after QA: 0 submissions and 0 send attempts. No real WhatsApp QA message was sent.
- Before/after inventory: 106 existing scripts, 5 flows, 28 schedules, 22 HTTP routes, 141 variables and 9 resources were unchanged (311 items).
- Evidence: `data/tracking/honey-webhook-2026-09-09/`; unit/integration test harnesses: `tmp/honey-build/`.

No backend deployment blocker remains. Frontend installation and an explicitly approved real WhatsApp QA message remain separate steps. A BI closeout task may be created if wanted; Harsha must provide owner/start/end dates first.
