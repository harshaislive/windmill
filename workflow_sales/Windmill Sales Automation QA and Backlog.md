## Collective sales master created — 12 October 2026

- 13October WhatsApp diagnosis: live app Quickstart explicitly warns Missing valid payment method; linked WABA1440894261469053 and sending WABA1655245455970812 both expose senderphone1446727738515570/+918977945351 on fresh API reads. Sender/template/Flow permissions and health pass, app Published, no throttling. Live app Configuration callback/verify token blank; app un-subscribed, only Business Agent listed. Billing is a concrete platform-reported sending blocker, exact per-message failure code remains unobserved. Fresh financial detail requires Harsha's passkey/2FA handoff. Resolve exact billing then signed Meta-to-Windmill webhook before one controlled test. No sends or provider mutations this turn. Evidence: data/tracking/collective-master-tracker-20261012/whatsapp-diagnosis-20261013.md.

- Email #1 pilot completed: Harsha authorized 10 oldest eligible August leads each in Mumbai, Hammiyala and Poomaale 2.0, from sai@beforest.co; signature Rakesh and +91 89779 45351, reply-to sai@beforest.co. Current Templates copy rendered without changing the template library. Read-only SMTP/IMAP and active-campaign/stop review selected 30 unique recipients; two Mumbai entries excluded. Windmill preview send job 01a13045-ea7a-e168-fd3a-5815e120f938 verified all 30 in Gmail Sent Mail, 18:51–18:53 IST 12 October 2026; durable journal readback confirms 30 SENT_FOLDER_VERIFIED attempts. Harsha separately approved exact 152-request Sheets write: clean 119 Name cells retaining full names, sort complete rows newest-first in those three tabs, mark exactly 30 Email sent cells #1 sent. Maton harsha connection returned 152 replies; stable-key readback verifies all 367 leads and every other value preserved. Calls are human and newest-first; latest source dates Mumbai12Oct, Hammiyala9Oct, Poomaale2.0 11Oct. No recurring sender or follow-up activation, CRM writes or other collective changes. Recipient delivery, subsequent bounces/replies and continuous Sheet synchronization not proven by this batch. Evidence: data/tracking/collective-master-tracker-20261012/email-pilot-{send-job.json,ledger-readback.json,sheet-verification.json,send-log.csv,calls-newest-first.csv}.

- Provider correction from Harsha: Interakt webhook no longer serves the current +91 89779 45351 direct-Meta setup. Existing direct-send audit remains valid; delivery/reply capture must use a new verified Meta callback rather than the legacy Interakt event parser. Fresh WABA read still lists only Business Agent, not WA Message To Leads. Direct Meta-to-Windmill webhook remains required and not deployed. No legacy route, subscription, schedule or external sending change. Evidence: data/tracking/collective-master-tracker-20261012/whatsapp-direct-meta-subscriptions-current.json.

- Latest four-person WhatsApp test: Harsha authorized template 1 only to 919573020839, 919154565175, 918374283166 and 919000605120. Windmill job 01a13029-75fb-b85c-6a09-901c2cf398be returns four HTTP200 acceptances with unique wamids, independently confirmed by durable-journal readback job 01a13029-f059-f7d3-ca73-2fb38e65307d. New parent batch first-call-four-test-20261012-01, per-recipient journal keys, pre-send claims, no retries, detailed request/response/time/Flow/provider-ID audit. No prospect sends, Sheet/CRM writes or schedule changes. Fresh WABA subscription read lists only Business Agent; delivery/read/Flow capture remains unavailable in Windmill. Runner preview-only. Evidence: data/tracking/collective-master-tracker-20261012/whatsapp-four-test-audit.json and whatsapp-four-test-send-log.csv.

- Enquiry dates exposed: Harsha approved one 41-request Maton write through harsha@beforest.co. Existing hidden First received moved to A as Enquiry date (IST), actual date/time values, dd mmm yyyy hh:mm. All 443 dates verified by stable key/source IDs against 455 original Typeform/LinkedIn submissions. Meaning: earliest matched submission in imported 12 August–12 October 2026 window, not verified CRM deal creation. Current manual Mumbai Site Visit/closing layout preserved (20 visible columns); other collectives 17, all 24px rows, Date/Name/Phone/Email frozen. Row order and remaining values preserved; original responses/templates unchanged. No outreach or automation changes. Current Mumbai manual layout lacks Meeting booked and has a pre-existing #REF booked highlight; inspect current stop semantics before automation release. Evidence: data/tracking/collective-master-tracker-20261012/lead-date-update-verification.json and lead-date-source-verification.json.

- Latest single WhatsApp test accepted: Harsha reported removing sender +91 89779 45351 from Zoho CRM and authorized fresh single batch first-call-meta-only-test-20261012-01 to 918374283166. Saved token matches secure variable; phone/template/Flow reads passed. Windmill preview job 01a1301b-f68e-cfda-9bf7-3c172f80f801 returned HTTP200 / PROVIDER_ACCEPTED with one wamid for template 1, independently read back. Delivery and picker response handling unverified. No templates 2/3 or prospect sends, CRM/Sheet writes, registration/subscription/billing or schedule changes. Earlier rejected batches preserved. Precise permission cause remains unproved. Evidence: data/tracking/collective-master-tracker-20261012/whatsapp-meta-only-execute-result.json.

- Current WhatsApp test: Harsha's correctly generated SYSTEM_USER token passes exact phone/templates/Flow checks, but actual Windmill job 01a12feb-82dc-1f4d-c1d1-4b532de3ee73 rejects template 1 HTTP403/#200 with no message ID; 2/3 unattempted. Zero accepted messages across three batches. Updated only secure test variable; source is local preview-only. User now asks to test through native Zoho CRM; existing Harsha tester Contact found, no create/import. Cause of remaining send denial and native Flow/API support unverified. Prospect outreach remains held.
- Token handoff update: Harsha saved a replacement from WA Message To Leads, but debug_token shows granular messaging/management access to two other WABAs, excluding target 1440894261469053. Target phone/templates/Flow reads fail or return empty. No third send run or secret replacement; user must select the target in Meta authorization or use the owning profile. Proof: whatsapp-replacement-token-access-debug.json.
- Subsequent saved-token check still excludes the target account; no additional sends. Existing Harsha system user has Full access to WA Message To Leads and Beforest WABA 1655245455970812. System-user token generation is now staged for user handoff, with no asset reassignment. Verify the generated credential before replacing Windmill secret or retrying. Evidence: whatsapp-new-token-preflight.json and whatsapp-system-user-token-handoff.png.
- Latest supplied token is a USER token from access_token, scoped to a different WABA; no further sends. Correct system-token wizard is now prepared through final permission selection (WA Message To Leads, 60 days, two WhatsApp scopes). Final Generate token awaits Harsha; it also installs the app for his system user. No credential issuance or install performed. Proof: whatsapp-provided-token-preflight.json and whatsapp-system-token-final-step.png.
- WhatsApp approved, test sends blocked / outreach held: Harsha approved the exact three test requests to 918374283166, then requested his saved desktop token. Both Windmill executions rejected template 1 with HTTP 403 / Meta #200 and no message ID; templates 2/3 were not attempted. Maton job 01a12fce-a765-7d4e-60d8-ea964eb9c810 and direct-token job 01a12fd4-ba20-99eb-519f-6acb3563ded8 are journaled without retry. All three templates are verified APPROVED, picker PUBLISHED. Token scopes are granted, but its app access_token has no WhatsApp setup; existing WA Message To Leads API Setup is staged for user credential generation, with the exact target phone selected. Folder sales_tracker and one secure test-token variable were created; test runners ran as previews, not persistent prospect scripts/schedules. No Sheet, CRM, WABA subscription or billing changes. Full source mirror, Sheet status sync, reply/preference capture, owner notices and booked-meeting suppression remain undeployed. See data/tracking/collective-master-tracker-20261012/whatsapp-test-status.md.
- WhatsApp picker published and templates submitted: after Harsha explicitly approved all four exact Maton POSTs, Flow 29171201925810813 is PUBLISHED, JSON 7.0, with zero validation errors. Created beforest_first_call_01 (2162634267940311), beforest_first_call_02 (2914917522213659) and beforest_first_call_03 (1405463721752588); all are PENDING / In review, en_US, MARKETING. Independent final GET verified every component matches the approved bodies, exactly six total templates and the original three unchanged. Meta UI confirms all three In review. Browser picker preview verified date selection, all 19 half-hour choices from 10 AM–7 PM IST and enabled submission. No messages, CRM records, webhook changes or Windmill entities were created. Native Zoho CRM Flow sending remains unverified; preference handling, Sheet sync, owner notifications and booked-meeting suppression remain undeployed. Meta health reports the Maton app is not subscribed to inbound messages; existing Business Agent and Zoho Social subscriptions were preserved. The static date minimum requires future past-date validation. Evidence: data/tracking/collective-master-tracker-20261012/whatsapp-published-templates-verification.json and whatsapp-templates-submitted.png. Do not recreate these templates or treat PENDING as approved.
- Latest: Harsha approved initializing the new tracker's three Message and three Email statuses to Not sent: 2,658 cells across all 443 prospects. Independent read-back compared all seven affected/read tabs and verified all other values unchanged. This is pending state for these new tracker touches, not a statement about earlier campaigns. Future appends initialize new touches only; repeat submissions must never reset actual sends/errors/stops. Three revised WhatsApp drafts are local in data/tracking/collective-master-tracker-20261012/whatsapp-templates-draft-v2.md; no Zoho submission or outreach.
- Harsha confirmed LinkedIn and Typeform sources, a two-month backfill, one collective tab per workbook, new leads appended at the bottom, and f/sales_tracker for new Windmill entities. Sheets writes use Maton connected to harsha@beforest.co.
- Live read-only backfill fetched all 424 completed Typeform submissions and 31 non-test LinkedIn responses from 12 August through 12 October 2026. Current published connected LinkedIn form is Mumbai-only. Prepared 443 prospect rows and retained all 455 submissions; four shared-phone rows were separately flagged.
- With explicit creation approval, created https://docs.google.com/spreadsheets/d/1MuhXeDttrZCy6yOolrGNvwU8hlAHD6JbvLOJW80_ni0/edit. Maton read-back verified six collective tab counts, all 57 collective headers, 455 Form Responses rows and six Templates drafts.
- Draft touches share one CTA: preferred date and time for a first conversation about fit. Qualification claims need recorded review. Historical send/call/meeting values are Unknown; owner assignment remains manual.
- Automatic append/status sync and optional sidebar are not deployed. No new Windmill entity, CRM write or outreach was created. Evidence and next-work runbook: data/tracking/collective-master-tracker-20261012/README.md.
- Harsha approved the compact sales layout: six live collective tabs now expose 24 fields with 24-pixel body rows, clickable/hoverable source answers, three message/email/call pairs, owner and booked dropdowns. Read-back verified 443 prospects, 455 unchanged original submissions and six unchanged templates. The 34 supporting fields remain hidden. Future f/sales_tracker sync must map headers (58 total columns), preserve manual values and suppress every pending WhatsApp/email when Meeting booked is Booked; this stop enforcement is not deployed. One independent hidden qualification-cell change was preserved and recorded for review in compact-verification.json.

## Poomaale 1.0 enquiry form and Hyderabad ad preparation — 9 October 2026

Created public Poomaale 1.0 enquiry Typeform `jfnFyUQF` from the current Hyderabad primary form: 17 fields, 13 logic blocks, Poomaale wording throughout, and the product question removed at Harsha's direction. Responses stay in Typeform; no webhook, Poomaale CRM mapping or automated sends were enabled. Corrected stray Bhopal wording in Hyderabad `leXyUOuT` next-step and thank-you descriptions, with original IDs, logic, settings, theme and webhook verified unchanged. Harsha subsequently authorized INR 500/day each: activated refreshed Secondary Hyderabad campaign `120255234348090558` and new Poomaale 1.0 campaign `120255234530890558`. Hyderabad ad is ACTIVE; Poomaale 1.0 ad is pending Meta review. Installed native Facebook pixel on Poomaale 1.0's direct form and verified API/public configuration. No spend reported at final read-back. Existing Poomaale 2.0 remains ACTIVE at INR 500/day. Evidence: `data/tracking/hyderabad-poomaale-20261009/two-campaigns-final-verification.json`. No Windmill entities changed.

## Mumbai nurture authentication released — 5 October 2026, 16:10 IST

Harsha applied the exact combined SPF policy, preserving Google/Zoho/Campaigns/Mailchimp includes. Authoritative/public DNS now shows one SPF record, seven include lookups. One fresh internal Community-to-Harsha email actually received16:07IST shows SPF PASS and aligned DMARC PASS for beforest.co. Set sender_domain_verified=true under the existing campaign approval and read back all four enabled schedules plus public dashboard SCHEDULED. Start6October08:00IST; first-day allowance5newpeople/mailbox, target4November for full six-step eligible cohort. Reply/stop/source safeguards and manual Zoho decisions retained; uncertain332 remains quarantined without resend. No prospect dispatch during release; total verified286,pending1 unchanged. Proof: data/tracking/mumbai-30-day-enable-20261005/domain-release-result.json and receiver-auth-pass.json. This supersedes the earlier domain hold below.

## Mumbai nurture independent queues — deployed, dispatch held, 5 October 2026

Harsha explicitly authorized enabling the modeled 30-day plan. Deployed in existing f/old_leads_churn: inline sender/admission/inbox/reconciliation helpers, four independently leased mailbox schedules every3minutes08:00–19:00IST, atomic shared/per-mailbox first-contact budgets and current eligible cohort1,592; daily source/tracker upkeep06:30IST. Per-mailbox first-contact ramp5/8/12/17/23/25; hard limits650global/160mailbox/320Sai+Community/100newglobal. Existing uncertain332 quarantined without retry/reservation reset. All four actual scheduled monitoring runs succeeded in7–10seconds with zero nested children.42tests/247assertions pass. Public dashboard shows planned6Oct/4Nov and actual authentication hold; date-password access and anonymous empty-table policy preserved. Increased dispatch remains blocked by sender_domain_verified=false, rechecked before network submission; no emails sent during rollout. Exact received QA: SPF SOFTFAIL, DKIM PASS for unaligned Google domain, DMARC FAIL. Authoritative DNS has twoSPF policies; current GoDaddy account lacks beforest.co. Domain access/fix remains outstanding, and delayed release must reset ramp start/target. Evidence: data/tracking/mumbai-30-day-enable-20261005/README.md and dns-fix.md. Do not describe full sending as live until domain gate is verified/opened.

## Mumbai nurture 30-day capacity plan — 5 October 2026

Harsha asked for a better sender structure and the shortest plausible completion timeline. A read-only simulation of the current READY cohort (1,592 people excluding internal QA, 1,515 first contacts pending, 9,318 remaining touches) supports first-contact coverage on day19 and six-step completion on day29, using four independent queues and a per-mailbox new-contact ramp5/8/12/17/23/25 daily with160/mailbox/day and650global/day guardrails. Peak600/day,150/mailbox; exact48-hour gaps modeled. Recommend30days with explicit health/availability assumptions. All four exact SMTP/Sent read-only checks passed; no emails sent. Concrete prerequisites: eliminate nested-job worker starvation, quarantine unresolved332 without retry, and correct confirmed duplicate SPF records after checking all providers and actual DKIM. Existing production caps/scheduler/DNS were not changed; proposal is not live. Evidence: data/tracking/mumbai-30-day-plan-20261005/README.md and capacity-proof.json.

## Mumbai churn tracker notice panel — 7 October 2026

Harsha requested that the audience/sending notice and 30-day campaign-plan notice move into a compact panel. Published the existing raw app ID22, version324, with a native Campaign updates disclosure above the KPI cards, closed by default. Public route hash8f74641112004746 embeds the exact rebuilt assets; route logic and protected reader hash2ce049001b2686c5 remain identical, with unchanged app policy and public SQL permissions. Build and access tests pass (11 tests, 35 assertions); live API rejects missing/wrong/previous-day codes and accepts today's code with read-only data. Browser verified the 48px closed panel, both notice bodies when expanded, keyboard collapse, mobile fit at390px and six visible KPI cards, with no console warnings/errors. Evidence: data/tracking/mumbai-notice-panel-20261007/verification.json and dashboard-collapsed.jpg. Presentation only; no nurture control, schedule, queue or CRM changes.

## Mumbai churn tracker daily password — 5 October 2026

Harsha corrected the password expectation: it should be the current India date DDMMYYYY, automatically changing every day. Deployed: replaced the fixed digest check with per-request Asia/Kolkata date validation, updated password-screen instructions and relock at India date rollover. Eleven access tests pass (35 assertions), including the18:30UTC/00:00IST boundary, previous-day rejection, header-only access and no data reads on denial. Live anonymous requests: current-date HTTP200/read_only/1,622 recipients; missing/former-fixed/previous-day HTTP422/no data. App bundle built and deployed. Source/send/queue policy unchanged. Evidence: data/tracking/mumbai-daily-password-20261005/.
## Mumbai nurture operational check — 5 October 2026

286 verified sends including217 imported history;53 more than the1Oct233 snapshot. Daily verified sends:2Oct15,3Oct15,4Oct22,5Oct1. Seventeen mail-only Sheet people started (five-new-starts/day cap unchanged). No new genuine reply; the existing Ajay Rajani reply is14Sep. Today root reported success=true but batch_halted=true after legacy CRM send332/Nikhil Agarwal remained uncertain. Fresh exact CRM read returned zero matching sent records; no resend or state override performed. Sender waited almost189minutes for a queued reply-check child; worker contention and rejected API response remain unconfirmed. Next run6Oct09:15IST remains queued and will block dispatch unless reconciliation resolves the uncertainty. Follow-up: investigate/resolve send332 without resend and inspect long worker waits. Evidence: data/tracking/mumbai-status-20261005/README.md and data/learning/incidents/2026-10-05-mumbai-crm-uncertain-and-worker-queue-delay.md.
## Mumbai churn tracker public access — 1 October 2026

Completed, explicitly requested by Harsha: published the existing read-only Mumbai tracker at `https://flows.ops.beforest.co/api/r/mumbai-churn/dashboard` with the fixed team password held as a secret SHA-256 digest. Password must be checked server-side before every data read, transported by header rather than URL, and absent from the public bundle. Public app SQL permissions are empty. Existing audience, sender controls, schedules, CRM policy and Sheet data are unchanged. Six access-gate tests pass (20 assertions). Anonymous HTML is HTTP 200 with no lead data or password; missing/wrong codes return HTTP 422; correct code returns HTTP 200 read-only data for 1,622 queue recipients with Cache-Control: no-store, private. Signed-out browser verified password prompt, wrong-code rejection, successful unlock, reply-stopped record and Lock dashboard. App ID22 is preserved; anonymous execution policy contains only the protected tracker reader and no direct public SQL tables. Deployed reader hash a7b976087a37aa3a and public route hash cdce9ef9bc2d89ca match local sources.
# Windmill Sales Automation QA and Backlog

## 12 October 2026 — approved WhatsApp copy and matching email drafts in master Sheet

Harsha approved the exact five-request Maton update to Templates!A1:G7. Three WhatsApp rows now match live Meta-approved bodies/names/IDs and record the Choose call time Flow, variables and status. Three email rows are matching first-call drafts with a reply-for-date/time CTA; no Meta approval or email deployment is claimed. All 49 values verified; collective/source tabs unchanged. Readability formatting applies only to Templates. No outreach, schedule, worker or provider template was changed. Evidence: data/tracking/collective-master-tracker-20261012/template-library-update-verification.json.

## 12 October 2026 — collective master simplified to 16 visible columns

Harsha approved single-channel-call-meeting-request.json, superseding the pending call-only layout proposal. Verified six collective tabs with one WhatsApp sent dropdown (E) and one Email sent dropdown (F), latest completed #1/#2/#3 step; blank means pending. Call status fields became free-text notes H/J/L; 1,329 Unknown placeholders cleared. Call dates record completed calls. Owner M and booking N retain their dropdowns. Meeting Notes O and existing Meeting date P end the visible view; date format dd mmm yyyy. Stable Lead key AV and Source response IDs AW must be resolved by header. All 443 prospects and retained values preserved, original response/template tabs unchanged, 24px rows and hidden supports retained, filters/highlighting corrected. Keep per-touch attempt/delivery history independently; never advance summary for uncertain/failed sends. No automation or outreach state changed, confirmed-meeting stop remains undeployed. Proof: data/tracking/collective-master-tracker-20261012/single-channel-verification.json.

## 12 October 2026 — sales master message/email status columns removed

Harsha approved the exact Maton batchUpdate through harsha@beforest.co. All six collective tabs now have 18 visible columns; Message 1/2/3 status and Email 1/2/3 status were deleted. Only fill touch-entry cells after completing a touch; blank means pending, and proposed template codes must not be prefilled. Preserve transport-level acceptance/delivery evidence independently. Verified all 443 prospects and every remaining value retained, Form Responses/Templates unchanged, 24px rows and owner/meeting dropdowns preserved. Meeting booked moved to R, owner Q, stable key AY and source IDs AZ. Filters and booked-row highlighting were adjusted. Future tracker integration must resolve headers rather than old indices. No automation, message send or meeting-stop enforcement was enabled. Evidence: data/tracking/collective-master-tracker-20261012/remove-touch-status-verification.json and remove-touch-status-after-format.json.

## 1 October 2026 — full Mumbai Sheet audience, manual CRM after reply

- Harsha corrected the campaign scope: churn the complete 1,600+ Mumbai leads in the existing Sheet. The 20-row proposal and separate manual approval per fresh recipient were an incorrect narrowing of the task and are superseded. A reply is surfaced in the dashboard; the team decides whether to add the responder to Zoho manually. No automatic Lead, Note or Task creation.
- Live source read: 1,657 Mumbai rows, 1,634 valid email rows, 1,605 distinct valid addresses, 29 duplicate email groups, 23 missing/invalid email rows, seven ambiguous names and one changed source address. Preserve duplicate protection, identity/source holds, stops, original copy, 48-hour gaps and sending limits.
- Community-to-Harsha original Email 01 QA is SENT and REPLY_VERIFIED; its approval key is closed. Full Sheet campaign authorization and additive mail-only enrollment are now live, without asserting individual consent/Sales review facts. Final queue: 1,533 mail-only READY, eight fresh identity/address holds, two suppressed fresh/internal rows; whole queue 1,555 READY, 64 HELD, three SUPPRESSED. Two new Gmail sends, IDs 277–278, are VERIFIED_SENT with no Zoho Lead IDs and each advanced once to step two exactly 48 hours later. Total verified sends 233; zero pending or uncertain sends. CRM handoff remains false.
- First production run exposed three-worker starvation through the redundant generic sender wrapper. Corrected coordinator hash `170b95ba3934ba42` dispatches Gmail directly. Canceled the stalled run and checked its descendants; one before-network cancellation was restored only after proving zero attempts/no message marker, with its original capacity reservation preserved. No uncertain send was retried. Twenty-eight local tests pass, 203 assertions. The next daily job is queued for 2 October 09:15 IST with the corrected hash. Current limits remain 40 total/10 sender/20 combined Rakesh/five new starts per day; this first-send limit makes full-list coverage slow and must not be described as a recipient approval restriction. Exact evidence and incident: `data/tracking/mumbai-full-sheet-20261001/`, `data/learning/incidents/2026-10-01-mumbai-gmail-worker-starvation.md`.

## 1 October 2026 — Mumbai immediate dispatch reconciliation fix

- Root reported that today's 09:15 IST coordinator job `01a0f24c-1b67-495b-0a9c-602bbf78a2c9` accepted ten existing-Lead dispatches, sends 267–276, but left their journals UNCERTAIN because reconciliation ran only before sending. Root owns those exact-ID reconciliations and tracker repair; this task did not repeat them.
- Deployed coordinator hash `24146ab73ef9b4cd`: after every attempted dispatch, invoke the exact production reconciler once and read back that send's local VERIFIED_SENT journal and CRM/Gmail message evidence before the next claim. Delayed/ambiguous evidence, reconciliation exceptions, or an inconsistent journal halt further claims. Previously unresolved attempts also block new dispatches. No sender retry is introduced. A proved before-network cancellation keeps consumed capacity and may continue with another eligible row; inbox/tracker processing remains available when a batch is held.
- Seven local tests, 85 assertions pass for immediate logs, delayed logs plus a later no-resend run, sender timeout adopted from exact evidence, unavailable log, inconsistent journal, before-network cancellation, and Gmail evidence. Live source exactly matches local, parses and exports main. Read-only config proof: daily enabled 09:15 Asia/Kolkata, overlap blocked, CRM handoff=false and fresh sending=false. No live coordinator run, send, root-owned reconciliation, tracker write or flag/schedule mutation occurred during this fix. Evidence: `data/tracking/mumbai-immediate-reconcile-20261001/deployment-report.json`. Live exercise of this changed orchestration remains for an authorized scheduled run; SMTP QA approval is still pending.

## 29 September 2026 — Mumbai Collective nurture, no-send deployment in progress

- 30 September final Gmail QA preparation: staged one fixed additional original Email 01 from Community to Harsha, exact payload hash `2deab050b301305df8db941f3f6f1d19b9880dfa86442621ee9e4d78f2f95188`, QA key `mumbai-gmail-community-harsha-20260930-01`. Default preview is read-only; an absent/unmatched separate approval key or hash prevents dispatch, and a durable fixed key forbids uncertain-result resend. Exact Sent and correlated manual reply phases use only a separate QA journal and read-only mailboxes, with no CRM/prospect queue writes. Four QA gate tests and a real-library MIME round trip of the full original passed. This task sent no email and did not activate transport or create the approval variable. A 20-row fresh proposal (five per sender) passed current Sheets name/source and exact cached-token CRM Lead/Contact absence checks; 31 screened, 11 excluded. All 20 remain HELD; consent, active-Sales clearance and decision are blank. Evidence and exact approval scope: `data/tracking/mumbai-final-gmail-qa-20260930/README.md`. Actual SMTP delivery/Sent/reply proof and a bounded reviewed fresh-send check remain outstanding; deployment is not closed.
- 30 September 12:49 UTC policy change, superseding CRM-first admission and automatic reply handoff: Harsha requested that new prospects stay outside Zoho and that he decide whether to promote a responder. New Lead creation is blocked even with an old allow_crm_create approval. `crm_handoff_writes_enabled=false`; both Note and Task workers return AWAITING_HARSHA_REVIEW before database/OAuth access. Coordinator keeps inbox suppression and existing legacy sends guarded without requiring that CRM-write switch. Reply evidence now includes subject and manual-review status. The direct Gmail SMTP path, exact Sent readback, and additive journal columns are deployed; `non_crm_sending_enabled=false` deliberately stages this new transport for root-owned release. Four sender SMTP 587 authentication/Sent read-only checks passed, 13 unit tests passed, and an in-memory MIME round trip passed. No actual SMTP email, CRM record, Note, Task or Sheets write was made during this change; no fresh candidate was admitted. Live readback: 221 verified sends, no pending sends, four existing READY, zero reviewed held fresh candidates, one genuine reply. Evidence: `data/tracking/mumbai-manual-crm-review-20260930/audit-report.json`. Root owns the tracker app/backend and sender release switches.
- 30 September 12:14 UTC cache source audit: after the parent's hourly checker repair, all six deployed cached-helper scripts match local source, parse successfully, export main, and have one identical nonrecursive auth helper. Fresh schedule read confirms enabled daily 09:15 IST, dry_run=false, no_flow_overlap=true. Audit performed source/schedule reads only, with no script executions, OAuth refreshes, sends or CRM/Sheets writes. Evidence: `data/tracking/mumbai-cache-source-audit-20260930/audit-report.json`. New Lead layout blocker remains unchanged.
- 30 September live legacy launch, superseding prior no-send status: Harsha authorized starting eligible existing legacy nurture. Root dispatched original Email 02 from Sai to four existing Leads; sends 263–266 are `VERIFIED_SENT` with exact CRM message IDs. This task independently read the journal: next_step=5, next_due exactly 48 hours after each verified send, and no pending RESERVED/ATTEMPTING/UNCERTAIN sends. Live daily schedule read-back: enabled, `0 15 9 * * *`, Asia/Kolkata, `dry_run=false`, overlap disabled. Delivery, legacy continuation and CRM handoff write gates are true. Queue: 1,615 HELD, four READY, three SUPPRESSED (includes internal QA). New Lead creation remains held while Beforest layout is unavailable to Standard users; approved Exploration Link is `https://beforest.co/the-mumbai-collective/`. Hourly layout detection is separate from authorization to admit new candidates. Do not independently dispatch, refresh credentials during OAuth backoff, or retry uncertain sends. Evidence: `data/tracking/mumbai-legacy-launch-20260930/`.
- 30 September owner routing decision: Harsha explicitly approved creating new Leads through Rakesh's Zoho account and assigning Harish/Yogesh according to their sender lane. Deployed admission now uses Rakesh for duplicate search, creation metadata and Lead POST, with the exact target Owner ID; the assigned owner's token must read the Lead before READY. Live access audit passes all four lanes under this architecture. Harish recipient 80 and Yogesh recipient 81 dry runs identify Rakesh as creator and correct owners, with no CRM/email write. Four synthetic tests pass for both owner assignments, owner visibility failure/no duplicate, and unchanged consent requirements. The prior owner metadata scope blocker no longer applies to this route. Real new-Lead creation/read-back and first candidate approvals still need a reviewed cohort; delivery and three schedules remain off.
- 30 September final QA checkpoint: two explicitly approved Email 01 internal tests went only to Harsha and Seshu; both exact CRM sent logs and both human replies were verified. Seshu's source recipient is `SUPPRESSED`; its actual reply event produced one verified CRM Lead Note and one owner-assigned Task, with no duplicate on reconciliation. The imported 79 Leads were mapped to `The Mumbai Collective` after full-field backup while preserving `Not Contacted`, owner and 217 exact historical messages. Queue read-back: 1,619 `HELD`, two `SUPPRESSED`, zero admission approvals. The revised claim function passed concurrent/cap/48-hour/uncertain/suppression and blocked-lane tests. One soft bounce is an identity hold; clean sender lanes remain eligible. Maton mirror wrote only tracker `R54:Z54` after backup and verified all 79 rows plus unchanged A:Q. Sender access metadata passed for Sai/community; Yogesh and Harish returned `OAUTH_SCOPE_MISMATCH` on Leads module metadata, so their new-Lead creation rights are unverified. Production admission remains consent and active-Sales reviewed, with zero approvals; no prospect send, delivery switch or schedule activation occurred. Do not present the setup as launch-ready until the two scope checks and first admission decisions are resolved.
- 30 September latest live checkpoint: **NO-GO; no prospect send or schedule activation.** Harsha confirmed the current offer claims (₹6.9Cr + GST, 10 homes, maintenance through 2033); approved Email 01/02/03 hashes reverified and `offer_claims_verified=true`. Four sender accounts authenticated to Gmail IMAP read-only; the new All Mail scanner ran for recipient 1 and returned UIDVALIDITY 12 with zero post-baseline inbound. The send worker now performs exact copy, Zoho Lead/From and IMAP checks and returns a payload hash during dry run, but no eligible current reservation exists to test the full path. Claim function now scans past a capped sender; the remote synthetic test confirmed Yogesh proceeds after Rakesh's shared cap fills, plus concurrent reservation, 48-hour and suppression behavior. Tracker mirror now previews new Lead row append and preserved original 79 rows; live preview found zero new rows and zero changed cells. Live candidate read found 1,657 Mumbai source rows, 1,605 unique emails, 23 missing emails, seven ambiguous name emails, and one deal/email conflict. Internal CRM preview found Harsha already has 14 Contacts, so an arbitrary duplicate test Lead is prohibited. Lead admission, CRM Note/Task/send/log internal tests, all-lane reply evidence and release orchestration remain unverified. The live switch read back `false`; both folder schedules read back disabled.
- 30 September: Harsha approved the original full Email 01/02/03 copy. Exact Zoho draft HTML is saved in Windmill and subject+HTML SHA-256 read-back passed for all three; sequence maps 3/2/1. `email_copy_approved=true`, while `offer_claims_verified=false` keeps dated price/availability/delivery claims separate and sending blocked. `setup_mumbai_mail_connections` deployed with generated `dry_run` boolean default true; authenticated read-only discovery found two active Maton Google Mail connections and zero exact matches to sai/community/yogesh/harish, so no connection variable was written. Harsha handles Maton OAuth; script will verify `users/me/profile` then bind exact IDs only after all four exist. Synthetic six-step test passed for all four fixed owner lanes, 48-hour gaps, completion, and collective-change holds; no CRM/customer send. Delivery and schedules remain disabled.
- Follow-up: tracker machine columns R:Z populated and read back for all 79 legacy Leads with A:Q unchanged; 138 historical step timestamps corrected from exact CRM messages. Guarded send, exact CRM-log reconciliation, sender-inbox reply inspection/suppression, and CRM Note handoff scripts deployed. No-send dry run blocked historical send ID 1, inbox check held for missing sender connection, CRM log dry run found the exact message. Final queue remained 1,620 held/one suppressed with 217 prior sends, false delivery switch and disabled schedules. Sender inboxes, approved copy, owner notification and live internal end-to-end QA still block launch.
- Owner fallback: deployed `handoff_mumbai_reply_task` with live CRM Task duplicate search, exact Lead/owner preview, unique event-key journal and no retry on uncertain outcome. A synthetic reply fixture dry run proposed one owner-assigned CRM Task, then was removed. The separate CRM Task write gate remains closed; no Task or Note was created. Controlled internal Task/Note write and owner visibility checks remain required.
- Independent no-send safety review: send worker now enforces exact sender/owner lanes and live allowed-From/Reply-To checks (community requires org-email type); final atomic attempt checks IST claim day, due/48-hour timing, suppression, identity, owner and all cap scopes. Reply scanner excludes pre-send correspondence and holds auto/list or malformed/ambiguous mail. Remote dry runs still blocked sending and missing inbox visibility. Live connected-inbox and internal Send Mail tests remain outstanding.
- `f/old_leads_churn` is live with `delivery_enabled=false`, six nonsecret settings, ten encrypted credential variables, five isolated `main` datatable tables, 79 imported legacy recipients and 217 exact verified historical CRM sends. Repeat import made no changes. Controlled Maton Sheet backfill added `Email` in N and populated 1,634 exact Mumbai cells; 11 conflicts and 12 missing addresses remain blank. Held-only intake has 1,621 recipients and 1,649 source links; a repeat run kept totals fixed. Both inspection and intake schedules are disabled. A read-only CRM audit found 120 exact Lead matches, 193 Contact matches and 41 owner mismatches among held recipients. Synthetic no-send claim tests passed for concurrent capacity, uncertain-state no-retry and the 48-hour minimum. No prospect mail or Zoho Lead was created. See `docs/mumbai-nurture-implementation-2026-09-29.md` for read-back evidence and blocking gates.


## 25 September 2026 — Beforest Members enrichment

- Completed: raw app ID 21/version 315 labels the separate tab **Beforest Members** and shows saved fit/capacity evidence, LinkedIn candidate counts, and Jev top candidate probability without presenting a low-score suggestion as a confirmed profile. All 40 rows (39 won deals in the three working collectives plus Anuj Agarwal #8889) now have saved fit/capacity assessments: 4 strong, 21 plausible, 15 research first; 3 transaction evidence, 1 professional clue, 36 capacity unknown. TinyFish search pass completed for all 40 member identities using its existing nine-account, cached, free-only worker. Twenty-three rows have search candidates and current Jev rankings; only one candidate reached the dashboard's 50% research-link threshold, and no identity is confirmed. Remaining outcomes are no result or insufficient identity clues. A bounded retry fix for uncertain TinyFish calls was deployed as hash `44bc4f88d426da04`; final search job `01a0d970-24c0-b27a-c358-7c0dfb7d97b1` completed with zero pending. Member Jev job `01a0d971-ccbf-2f19-da01-ec1566281a10` completed with zero pending/errors. Frontend build and live app policy check passed; no CRM or outreach writes.

## 25 September 2026 — conversation page cleanup

- Raw app ID 21 version 309 resolves stale profile-gap labels in Conversation priorities. Audit of open groups in the three working collectives found 3,155 old profile-gap flags; 1,927 already had saved search candidates and 101 also had a Jev suggestion at 50% or above. Those flags came from the older `update_review_work` producer and did not read later TinyFish/Jev results. The app no longer presents or filters on those stale research flags. Detail now reports current candidate/Jev status, CRM contact values, and the separate owner identity-confirmation need; earlier public-page research is labelled as historical context. Live browser QA opened Sunzu Bachaspatimayum and confirmed the 55% suggestion appears without `Needs profile enrichment`, `Needs identity check`, or `Profile search: ambiguous`. Frontend build and live policy read-back passed. The old stored flags remain in source history and must not be used as current operational counts. No CRM or outreach writes.

- Raw app ID 21 version 307 clarifies the **Candidates found** filter: the Conversation priorities row now displays the saved search-candidate count separately from the Jev verdict, and offers **Compare candidates** when no candidate scored at least 50%. Its detail opens the saved candidate list expanded with Jev probabilities. Browser QA with the filter selected showed Vikram Katkar's five search candidates, `No credible Jev match`, and an expanded comparison including the 2% top candidate. Frontend build and live access-policy read-back passed. Candidate discovery and Jev identity confidence remain distinct; no CRM or outreach writes.

- Raw app ID 21 version 306 now opens both sales tabs on **Credible Jev matches**. The server filter requires a valid LinkedIn person URL among the first five saved candidates and a matching Jev probability of at least 50%; users can choose All to restore the full list. Members / history still opens unfiltered. Preview QA returned 23 Mumbai grouped people and 102 open deals with credible matches, and sampled rows matched the displayed profile rule. Frontend build, live read-back, and browser QA passed; the live page showed the selected filter, 23 Mumbai people and 102 fit-sheet deals. These are unconfirmed identity suggestions. No source, CRM, outreach or access-policy change.

- Raw app `f/sales_intelligence/dashboard` (ID 21) deployed as version 303. Removed the prominent Research gaps queue, the profile-discovery banner, and repeated research badges from the Conversation priorities table. The same research categories remain in a compact list filter and in person detail, without implying contact permission. Frontend bundle built; live read-back confirmed version 303, daily-code guards, fit/contact filters, sandbox isolation, and anonymous execution. No source data or sales automation changed.

Last verified: 2026-08-31, Asia/Kolkata

This is the working control sheet for Beforest sales automations in Windmill. Keep this file current whenever a script, trigger, schedule, or flow is added.

## Local prospect discovery pilot — 2026-09-21

### Sales readiness sheet — 2026-09-23

- September 24 fit/capacity correction in progress: Harsha confirmed that old-deal recency and booked calls must not define Beforest relevance. New Jev assessment reads person-specific form answers and substantive CRM notes, separates fit (`strong`, `plausible`, `weak`, `incompatible`, `unknown`) from capacity evidence (`transaction`, `budget`, `clue`, `unknown`, `barrier`), and saves exact source IDs/text. Empty histories are `unknown`, not low fit. Refunded advances are excluded from transaction evidence. The grouped Conversation Priorities view will use these categories and label its legacy unscored band `Research first`, with the earlier percentile retained only as context. AI Gateway rate limits require resumable batched calls; do not claim full coverage until the 3,811 open-deal import and live app checks complete. MCA/company facts remain absent without a corroborated person-company identity; do not infer personal budget from a LinkedIn title or company scale.

- September 24 release-speed follow-up in progress: prioritize the remaining Jev matching queue by existing conversation band (Top 10%, middle, lower, then unscored), pace at 2.5 seconds/request, and show a single top search result or Jev-preferred profile in both tabs with an explicit unconfirmed identity label. TinyFish queue is complete. At the audit there were 957 open-deal candidate people pending Jev, including 16 Top 10% and 47 middle-band prospects; 17 provider 503 errors remained for review. Preserve the existing $5 Jev cap and do not treat any top search result as confirmed identity.
- September 24 Conversation Priorities follow-up deployed in raw app ID 21/version 294. Live mapping audit: 10,154 priority groups, 9,847 joined to the TinyFish queue by group-key suffix, 5,967 with candidates. The list shows candidate count and any saved Jev choice; a new filter separates found, no candidate, and not searched. Lead detail shows up to five candidate URLs and Jev probabilities, explicitly unconfirmed, without duplicating the older search list. Source joins are read-only; ranking, CRM identity and Sales Readiness results remain unchanged. Live Mumbai backend QA returned 5,073 groups, 3,242 with candidates, 50 paginated rows, and five candidates with Jev status in a sampled detail. Browser QA confirmed the column, filter, links and probabilities. Password-protected backend calls, sandbox and anonymous execution policy remained intact.
- September 24 follow-up deployed: existing Sales Readiness app ID 21/version 291 joins the saved TinyFish queue by CRM person ID, shows up to five unconfirmed LinkedIn candidates with Jev choice probabilities, and adds a candidate-match filter. Both list and detail retain server-side password checks; public sandbox and anonymous execution policy read back intact. `f/sales_intelligence/linkedin_match_batch` hash `d07026a52112fd60` processes one CRM identity once per source version, saves its decision across that person's open deals in `linkedin_match`, and self-queues while candidates arrive. No Pipedrive identity or sales readiness label is overwritten. The existing $5 Jev budget row reserves at most $0.001 per request and settles measured cost; the free promotion charged $0 in the two-person pilot. Live overlap audit: 3,811 open deals, 3,790 with person IDs, 3,207 linked to TinyFish queue, 1,961 with candidates at audit time. Pilot saved one uncertain and one 53% candidate needing review, both `identity_confirmed:false`. Initial continuous job `01a0d26b-8f4e-946b-6ccd-9665968feec1` completed 25 more without errors and queued `01a0d26b-adce-0769-3741-668ce5a16c64`; remaining then 1,895 candidate-bearing people. Live backend QA returned 3,811 open rows, 50 paginated, and one candidate detail. Follow-up: monitor autonomous jobs and final counts; owner review is required before treating any likely profile as verified.
- Provider rate-limit follow-up: the second Jev batch completed eight more identities, then received three HTTP 429 responses and stopped. The three conservative $0.001 reservations were refunded after confirming all errors were 429. Worker hash `2c0417e952eb6b95` now spaces calls by three seconds and writes an explicit retry state with a five-minute delayed continuation on 429. App version 292 shows retry status; initial recovery job `01a0d26e-81bb-a4b3-36af-a93a12437844` queued. Final completion is pending; monitor the chain before promising full coverage or an ETA.
- Recovery job `01a0d26e-81bb-a4b3-36af-a93a12437844` completed 25/25 with zero errors and queued successor `01a0d26f-c157-aacb-e28f-d6b6e6eae613`; 1,865 candidate-bearing people remained at this read-back, while TinyFish still had 183 pending search/fetch records. Batch matching and candidate collection are now confirmed running concurrently.

- Response-state repair deployed in raw app version 290: Debashish Dhar (#15599) saved a partial verification and Jev nurture reassessment in roughly two seconds, while the old button continued to show `Checking…`. The frontend now polls the saved deal status every two seconds, releases the button when the saved check finishes, and shows a visible partial-result message. Live browser QA: Debashish's 24-hour cached check cleared immediately with a saved-result message; a fresh bounded check on Dr Vibhuti Sharma (#15596) cleared promptly and showed partial details. Email was deliverable and phone had valid format; Treg `people.enrich` returned HTTP 502, leaving LinkedIn unavailable. This provider failure remains visible and does not imply verified identity. App ID 21, server-side password, sandbox and anonymous execution policy were preserved.
- Extended existing password-protected sales intelligence raw app ID 21 in `f/sales_intelligence` to version 289 with a separate spreadsheet-style Sales Readiness view. Public app shell and server-side password checks remain; sandbox and anonymous execution policy read back unchanged.
- Imported the desktop Pipedrive/Jev snapshot into new `sales_readiness_deals` table: 11,963 unique deal IDs, 3,811 open. The initial labels remain a 23 September snapshot, separate from the existing grouped sales-priority release. Deal rows include selected dated deal-linked form answers, notes and activities; email bodies, attachments and person-only notes are not assessed.
- Row action `Verify & reassess` checks a known or team-supplied LinkedIn URL through cached/recent Treg evidence or a fresh profile lookup, checks email deliverability through MillionVerifier, checks phone validity through Tomba with TrestleIQ fallback, and submits compact sourced evidence to Jev via Vercel AI Gateway. LinkedIn name agreement remains a possible identity requiring owner confirmation; valid phone does not prove reachability or ownership. Results and original labels are both retained. No Pipedrive or outreach writes.
- Backend checks passed password denial, pagination, literal search, 3,811 open rows, detail evidence and no-cost dry run. Live bounded pilots returned email `deliverable`/`catch_all`, phone `valid_format`, one `possible` LinkedIn profile from saved Treg evidence, and Jev `nurture`/`needs_review`; transient Treg routes returned explicit partial results. Existing Treg cumulative budget and lease were reused; no schedule or bulk enrichment was added. AI Gateway credit check stayed $5 balance/$0 used during the promotion.
- Follow-up: inspect the team view after signing in, review candidate identity and pilot rows, and plan an incremental Pipedrive refresh. This snapshot is not a live CRM mirror. Treg profile search from email can return 502; a known URL or existing cached evidence is preferable. The action is limited to open non-restricted deals, one check per deal per 24 hours unless a new LinkedIn URL is supplied.

### Collective CRM prioritization backfill — 2026-09-22

- September 23: Sales intelligence raw app ID 21 deployed as version 273 with anonymous public access and sandbox isolation, at the app's secret public URL. Both `list_leads` and `lead_detail` require the server-side `f/sales_intelligence/dashboard_password` secret before reading data; the frontend displays a password form. Wrong password was rejected, correct password loaded 5,073 Mumbai records, and the public app metadata was readable without a Windmill login. Access link/password handed to Harsha; rotate the secret if it spreads beyond the intended team. No CRM or other automation changed.

- TinyFish expansion authorized September 23 IST: key saved only in ignored `.env` and encrypted `f/sales_intelligence/tinyfish_api_key`, exact read-back verified. Search, public LinkedIn Fetch and wallet-account checks succeeded. `tinyfish_enrich` hash `5d2e4e79b4eac923` owns dedicated queue/call-cache/control tables; 9,850 profile-gap records deduplicate into 9,751 identities. Pilot completed 50 records (33 searches, 28 fetch attempts, seven usable unconfirmed public pages, zero newly confirmed profiles). Full-run root `01a0caa5-5aee-420f-2207-bb97c09b08fb` completed its next 25 and dispatched `01a0caa7-50ac-0099-c7fd-3cac27cc07ab`, verified running. App version 272 displays live progress and unconfirmed public-page excerpts. Free-only requests, at most 450 search attempts/hour and 900 fetches/rolling 24 hours. Saved progress, shared lease, bounded transient search retries and delayed quota continuation. Reconcile active/scheduled successor before any new root. Unknown names/CRM identity, reused searches, candidate pages and corroborated profiles remain distinct. Paid Treg/Jev fallback disabled; budgets unchanged. No existing funnel schedule or CRM write changed.

- **Review-gap follow-up completed:** app version 269 adds overlapping profile/contact/sales/identity/processing filters and live profile-coverage counts. Targeted pass covered 416 people/431 collective records using 413 cached query identities: 50 people/52 records gained professional context, 218/225 have ambiguous candidates, 147/153 no usable result, one placeholder excluded. Additional Treg cost $0.502700; cumulative $0.647500. Jev unchanged at $2.093947. `discover_profiles` hash `a48744fdeb1a912a`; final repeat job `01a0ca41-db0f-8761-fee7-c16427927e42` performed zero searches/fetches with zero eligible remainder in the targeted scope. Not an all-lead enrichment pass. `update_review_work` yields 9,850 profile gaps, 2,713 contact gaps, 9,493 sales clarifications, 586 identity checks and four processing exceptions; counts overlap. Live filters, unchanged ranks, budget ledger equality and app policy verified. TinyFish has no project key or catalog route; no account/subscription created. Other automations and CRM records preserved.

- **Sales-review release complete (supersedes pending milestones below):** app ID 21/version 267, authenticated and sandboxed. 10,279 deals / 10,154 person-collective groups; 10,103 assessed, four provider exceptions held for review, eight groups without evidence and 39 customer groups. Released 247 evidence-supported ranks: Hammiyala 11/41/52, Mumbai 9/33/42, Poomaale 2.0 6/24/29 (top/middle/lower). 9,670 need review; 198 contact-restricted. Owner filters, source detail, all collective counts and rank invariants pass live QA. Release job `01a0ca11-30da-e5c5-0a65-e168d9fb7cf5`.
- Treg fetched all 23 recorded unique LinkedIn URLs, 17 name-consistent links; name agreement is not verified identity. Cumulative ledger: Treg $0.144800, Jev $2.093947 including uncertain reservations, each below its $5 cap. Cleaned legacy TARS/AI opinions from 944 evidence groups and reclassified affected histories. Archive audit returned zero deals. No production schedules, CRM ownership, outreach or access changed; Harsha handles sharing. This is a September 22 snapshot; incremental CRM refresh remains backlog. Team guide: `workflow_sales/team_handoff/sales_intelligence_dashboard.md`.

- Server handoff deployed: `f/sales_intelligence/classify_batch`, hash `a711d9040b4b06ff`, dependencies ready. Migrated 1,504 local call records and 334,479 microdollars of consumed/reserved Jev budget into dedicated server tables. Local worker stopped; local classification/publishing blocked after handoff. Dry-run passed; first full server batch completed 48, deferred 2, and successfully queued its next batch. Job `01a0c9f4-9593-dace-7ad4-a3683f211a29`, successor `01a0c9f4-bc06-d0f2-23b3-196e9888d624`. No recurring schedule or other production automation changed. UI version 266 refreshes counts every 30 seconds. Treg, final rankings, archives and incremental import still pending.

- Harsha explicitly authorized copying project .env credentials to Windmill. Created encrypted variables `f/sales_intelligence/pipedrive_api_key`, `f/sales_intelligence/treg_token`, and `f/sales_intelligence/typesafe_api_key`; read-back verified is_secret=true and exact value equality in memory without logging values. Provisioner allowlists these three only. Server worker/checkpoint migration and scheduling are not implemented by this credential step; no existing automations changed.

- Follow-up dashboard diagnosis: local classification exited on an HTTP timeout while its progress file still said running; results were never published. Added source-hash-matched provisional assessments and complete imported contact data to publisher, visible provisional detail panel/counts in dashboard version 265. Resume defers uncertain requests with their budget reservation retained. Local wrapper publishes after classifier exits, even on error; final priority bands remain withheld. No unrelated Windmill items changed.

- Execution resumed at Harsha's request: all 10,037 linked persons, five organizations and field/stage/user metadata imported. Import total 208 calls / 2,330 estimated tokens; only 330 additional tokens for this resume. Local rolling allowance increased from 2,000 to 3,000, not a claim about account quota. Derived metadata fields with null IDs remain preserved in page cache and are omitted from ID-keyed records.
- Decoded custom-field option labels from live metadata; rebuilt all 10,154 evidence groups. Four regression tests pass. Started local `crm_score.ts --full`, PID 22452, with a persisted $5 Jev cap and request-hash reuse. Progress and logs live under `local/lead_pipeline/.state/planning/jev-backfill-*`. This classifies eligible saved histories only; oversized cases are deferred explicitly, rankings are not automatically published, and Treg/archive audit/incremental scheduling remain pending. Existing production automations untouched.

- App milestone: authenticated `f/sales_intelligence/dashboard` (ID 21) deployed with sandbox isolation and two dedicated main datatable tables. 10,154 person/collective groups published; collective counts, pagination, literal search and detail passed backend QA; signed-in browser list/search/history verified. No existing CRM records, production sales schedules or flows changed. All rankings remain awaiting validation. See `data/learning/daily/2026-09-22-sales-intelligence-app.md` for CLI compatibility fixes and strict deployment scope.
- Jev revised pilot cumulative cost estimate ~$0.03425; no Treg spend. Legacy AI financial-capacity notes separated from primary scoring evidence after browser QA. Full contacts/metadata/archive scope, long history handling, reliable scoring, Treg worker and incremental refresh are still pending.

- User authorized `f/sales_intelligence`, $5 Treg plus separate $5 Jev. Initial local-only phase completed; app milestone above supersedes the earlier initialization blocker.
- Runbook: `local/lead_pipeline/CRM_IMPORT.md`. Reused 10,279-deal snapshot; bulk reads saved to PostgreSQL with page cache, checkpoints and durable request-cost reservations.
- All saved deal counters reconciled: 8,138 notes and 50,612 activities, zero shortfalls. Related context totals: 9,086 notes and 55,262 activities. Persons partial (3,815); archives, organization/field metadata and incremental refresh pending.
- Import paused at its own 2,000 estimated-token rolling-24h quota, after 179 calls with zero 429s. This is not the account's daily remaining allowance. Repeat run made no additional requests.
- Jev pilot: 87 completed, 3 oversized histories deferred; 390,754 input tokens, estimated $0.016412 (conservative ledger $0.016458). No Treg spend for this backfill. Initial judgments not sales-ready: improve outbound/inbound discrimination, identity-review gates and action uncertainty before bulk ranking. Revised rubric written; not yet rerun.
- Three targeted tests pass for collective separation, duplicate grouping, evidence preservation, unknown/won routing and response validation. No CRM writeback, sales outreach or production deployment.

- Local-only implementation: `local/lead_pipeline/README.md`; no Windmill deployment, schedules, CRM writes or outreach.
- Treg Exa semantic LinkedIn people search → Harvest profile fetch → one TypeSafe Jev classification batch. Initial Mumbai discovery sample: 3 profiles, with separate judgments for Mumbai, Hammiyala and Poomaale 2.0. These are exploratory candidates, not qualified buyers.
- Real local UTF-8 PostgreSQL stores searches, profiles, source evidence, classifications and call history. Default search/profile refresh intervals: 7/30 days. Evidence/rubric/model fingerprints avoid repeated classification.
- Live repeat-run QA: same 3 profiles reused; zero network calls and zero new classifications. First sample Treg total: $0.0262. Jev request: 23,128 input tokens and 492 reported output tokens; no settled dollar charge asserted.
- First-run recovery: Bun certificate-chain issue reconciled against Treg call ledger; switched runner to Node 24 system certificates. Windows default database encoding rejected emoji; migrated local pilot tables into UTF-8 and recovered original search with confirmed Treg idempotent replay. Postgres shutdown is graceful.
- Pending scope: native filter/pagination adapter, confirmed collective-specific search criteria, larger human-labeled quality review, and contact enrichment only after shortlist review. No automated daily task exists.

## Pipedrive Activity Audit Standard

Automation audit activities use consistent subjects of the form `[Windmill][event.name] description`.

| Activity kind | Owner | Done? | Purpose |
| --- | --- | --- | --- |
| WhatsApp sent/received, calendar create/cancel, Typeform intake, automation bookkeeping | Beforest Admin / `connect@beforest.co` / user ID `18891506` | Yes, except manual-review tasks | Immutable audit trail with template/payload/context in the activity note |
| Manual review needed, for example Azure/OpenAI fit classification fallback | Beforest Admin / `18891506` | No | Human task to review the deal and set the correct label/stage so Windmill can continue |
| Actual scheduled 1on1 call or webinar meeting | Deal owner | No until the business event is completed | The real operational activity visible to the owner |

Reminder activity subjects were kept backward-compatible to preserve dedupe against already-sent reminders, but their notes now include the Interakt payload summary and are explicitly owned by Beforest Admin.

## Live Automation Map

Isolated addition verified 2026-09-09: `f/bewild_lead_magnet/honey_popup` exposes POST `bewild/honey/popup` for the Beforest Coffee Blossom Honey popup. Both variants use approved Bewild `bewild_honey_promised_story_v1` after per-send approval/content checks. Separate Postgres ledger, explicit consent, expiring proof challenge, rate limits and atomic phone/campaign dedupe; no sales funnel, schedule, nurture or existing secret changed. Public non-sending checks passed; zero real WhatsApp QA sends. Full contract and operations: [Honey popup webhook](../docs/bewild-honey-popup-webhook.md). Frontend installation and approved real-message QA remain separate.

| Area | Windmill item | Trigger/source | Covered now | Status |
| --- | --- | --- | --- | --- |
| Typeform intake | `f/sales/typeform_to_pipedrive_intake` | Typeform HTTP webhook | Creates/updates Pipedrive person/deal, maps custom fields, routes brochure/GIS vs 1on1, and logs audit activities. The 2026-08-05 change adds a locked, response-token-idempotent Hammiyala allocator for genuinely new primary-form deals only, seeded Vivek first and alternating with Rakesh; matched/retried/post-brochure deals preserve their existing Pipedrive owner. | Live; Hammiyala dry-run verified Vivek as the seeded first owner with no allocation consumed |
| Product mapping | `f/sales/map_deal_product_from_collective` | Called by Typeform intake or manual backfill | Ensures the matching Bhopal/Mumbai/Hammiyala/Poomaale product exists in Pipedrive and attaches it to the deal so deal value is not 0 INR. Hyderabad is intentionally unsupported until a Hyderabad product/value is defined. | Live |
| 1on1 / GIS label guard | `f/sales/pipedrive_1on1_tbc_to_calendar_prebook` | Pipedrive deal `change` webhook | Checks label `115`, Initial Event Scheduled stage, no meeting fields, then sends the team scheduling notice; checks `GIS Awaiting` and calls Collective Journey CTA | Live |
| 1on1 team scheduling notice | `f/sales/send_1on1_team_scheduling_notice` | Pipedrive label guard for `1on1 TBC` | Sends Interakt template `collective_1on1_team_scheduling_notice`, logs `1on1 team scheduling notice sent`, then queues the owner touchbase check; no calendar slot is prebooked | Live |
| 1on1 owner touchbase loop | `f/sales/owner_touchbase/schedule_owner_touchbase_check` / `f/sales/owner_touchbase/send_owner_touchbase_check` / `f/sales/owner_touchbase/handle_owner_touchbase_response` | Queued after a successful team scheduling notice; Interakt inbound buttons | Sends approved owner template `owner_1on1_touchbase_check` after 24 hours. `Yes, touched base` logs confirmation and stops. `No, pending` logs pending and queues the next 24-hour reminder until max 3 attempts. Stop conditions skip closed/deleted deals, deals no longer `1on1 TBC`, existing meeting fields, duplicates, and already-confirmed touchbase. | Live |
| 1on1 calendar prebook | `f/sales/calendar_prebook_1on1` | Internal script call only | Legacy/internal calendar prebook worker. It is not called for fit intake leads in the GIS-only funnel. | Internal |
| Vivek Calendly booking reconciliation | `f/sales/reconcile_vivek_calendly_bookings` | Four staggered polling windows daily at 8:37 AM, 11:37 AM, 3:37 PM, and 7:37 PM IST | Reads only Vivek's configured Calendly event type and matches exact email plus brochure UTM. The Hammiyala split adds `utm_campaign=hammiyala` → pipeline `1`, while retaining the Vivek-owner and open-deal guards; Rakesh-owned Hammiyala deals remain ineligible. | Live for Bhopal, Mumbai, and Vivek-owned Hammiyala; production dry-run verified Calendly event type and Pipedrive access with zero writes |
| 1on1 WhatsApp inbound | `f/sales/interakt_whatsapp_inbound` | Interakt HTTP webhook | Routes `Reschedule Call`, `Confirm Attendance`, owner attendance, and owner touchbase buttons to dedicated workers; normal inbound text after Typeform queues brochure resolution by phone/deal context | Live |
| 1on1 reschedule worker | `f/sales/interakt_reschedule_requested_worker` | Called by Interakt inbound flow | Resolves deal, cancels owner calendar event when found, clears meeting fields, labels `105`, sends booking-link acknowledgement, logs admin audit activities | Live internal |
| 1on1 attendance worker | `f/sales/interakt_attendance_confirmed_worker` | Called by Interakt inbound flow | Resolves deal, labels `106`, sends `attendance_confirmation_1on1`, writes Pipedrive note, logs admin audit activities | Live internal |
| 1on1 reminder dispatcher | `f/sales/send_1on1_reminders` | Schedule every 15 minutes IST | Sends approved Interakt 3d, 24h, and 1h reminders for open deals labelled `106` with a future booked 1on1 meeting datetime; logs each send as a done admin-owned Pipedrive activity for dedupe | Live |
| 1on1 owner attendance check | `f/sales/send_owner_attendance_checks` | Schedule every 30 minutes IST | After a confirmed 1on1 meeting window passes, sends the owner `Attended` / `Not Attended` buttons and logs a done admin-owned Pipedrive activity for dedupe | Temporarily disabled on 2026-07-20 pending deployment of Sravani offboarding code cleanup |
| 1on1 owner attended worker | `f/sales/interakt_owner_attended_worker` | Called by Interakt inbound flow | Labels the deal `107`, moves it to the pipeline's Event Attended stage, logs admin audit activity | Live internal |
| 1on1 owner no-show worker | `f/sales/interakt_owner_no_show_worker` | Called by Interakt inbound flow | Labels the deal `108`, sends the lead the no-show rebook template with owner booking link, writes a note, logs admin audit activities | Live internal |
| Brochure CTA | `f/sales/send_gis_story_cta` / `f/sales/send_brochure_after_typeform` | Pipedrive label guard for `GIS Awaiting`, Typeform fallback, or Interakt inbound | Sends a signed tracking URL to the owner-specific Hammiyala brochure: Vivek `https://canva.link/vjfj5yn7486ujqb`, Rakesh `https://canva.link/sg93jjmd2i08ji3`. Other collectives remain unchanged. | Live; remote code read-back verified both approved brochure links |
| Email fallback for WhatsApp failures | `f/sales/send_mailchimp_fallback_after_whatsapp_failure` | Schedule at 8 AM, 12 PM, 7 PM, and 10 PM IST | Finds Typeform leads where WhatsApp delivery failed and no later success exists. Hammiyala candidates are resolved and batched by current deal owner/path so one campaign cannot mix Vivek and Rakesh brochure URLs. | Live with Hammiyala owner split |
| Nurture email fallback for WhatsApp failures | `f/sales/send_mailchimp_fallback_after_nurture_whatsapp_failure` | Daily schedule at 10 AM IST | Uses the same owner-specific goal as WhatsApp nurture. Vivek-owned Hammiyala stops only after Calendly sync; Rakesh-owned Hammiyala and Poomaale stop after the second Typeform. Hammiyala campaigns are split by next-step path to prevent mixed brochure content. | Live with Hammiyala owner split |
| Brochure open tracker | `f/sales/track_gis_story_open` | Public HTTP GET `sales/gis/open` | Validates signed tracking token, allows approved Canva brochure URLs, redirects the lead, and best-effort logs `Brochure opened` / adds `GIS Opened`; old ArcGIS tokens are still accepted for already-sent links | Live |
| Collective Journey conversation request redirects | `f/sales/story_request_1on1_*` | Public HTTP GET `sales/gis/request-1on1/{collective}` | Fixed Journey bottom CTA redirects to the correct post-GIS Typeform and forwards hidden fields `collective`, `source`, and `story_cta` | Live |
| Collective Journey second-form nurture | `f/sales/send_collective_story_unopened_nurture` | Daily schedule `10D` | Sends Day 2/4/6/8/10/12/14 WhatsApps. It re-reads the live deal owner before every send: Vivek-owned Hammiyala uses the Vivek brochure and stops only on Calendly; Rakesh-owned Hammiyala uses the Rakesh brochure and stops on the second Typeform. Poomaale remains unchanged. | Live with Hammiyala owner split |
| Webinar activity | `f/sales/calendly_webinar_to_pipedrive_activity` / `f/sales/create_webinar_activity_from_calendly` | Manual/ops run with Calendly payload; legacy HTTP trigger remains disabled | Contained Calendly-to-Zoom registration path can be enabled with `f/sales/calendly_zoom_registration_enabled=true`: registers invitee into Zoom, updates Pipedrive, sends confirmation, and schedules one-off reminders. It does not enqueue old attendance/prebook jobs unless `schedule_attendance_checks=true`. Full legacy path still requires `f/sales/legacy_webinar_enabled=true`. | Ready; gated |
| Webinar reminder worker | `f/sales/send_webinar_reminders` | One-off jobs from contained Calendly worker / disabled fallback schedule | Targeted one-off reminders can run under `f/sales/calendly_zoom_registration_enabled=true`; broad fallback polling schedule remains disabled and still requires explicit `fallback_enabled=true` for non-dry-run polling without a deal id. | Ready; gated |
| Zoom intro registrant import | `f/collectives/zoom_collective_to_pipedrive` | `09B Schedule - Zoom intro registrant sync every 3h` | Legacy Zoom collective registrant import; schedule disabled for GIS-only funnel | Disabled |
| Calendar access check | `f/sales/calendar_prebook_1on1_smoke_test` | Manual only | Verifies Google Calendar service-account free/busy access | Helper |

## Verified External Wiring

| System | Wiring | Status | Note |
| --- | --- | --- | --- |
| Typeform | 5 primary forms plus Bhopal/Mumbai/Hammiyala/Poomaale/Hyderabad post-Journey/post-brochure forms have enabled Windmill intake hooks | OK | All 10 enabled hooks were migrated to `flows.ops.beforest.co` and individually read back on 2026-08-31; disabled n8n hooks were left untouched. Hyderabad primary retains its distinct `windmill_pipedrive_intake_hyderabad` tag and legacy job-route path. |
| Typeform consent | All five primary `[In-use]` collective forms: Bhopal `CYae8hmZ`, Hammiyala `hbDB2ybS`, Mumbai `kfcjiXxR`, Poomaale 2.0 `i8eBLQkz`, and Hyderabad `leXyUOuT` | OK | Required consent checkbox added immediately after contact information on 2026-08-04. Privacy Policy and Terms & Conditions are linked; each form's original brochure-first/direct-conversation actions were moved unchanged to the consent gate. Hyderabad received rendered fit-path QA; the remaining four passed atomic API comparison and live read-back, including public state and unchanged active Windmill webhooks. |
| Pipedrive | `Windmill - 1on1 TBC calendar prebook` webhook active at `https://flows.ops.beforest.co/api/r/pipedrive/1on1/tbc/prebook` | OK | Replacement webhook `1788421` preserved deal `change`, user `18891506`, and webhook v2; read back before old webhook `1652218` was removed on 2026-08-31. The name is legacy; the route now sends the 1on1 team scheduling notice for fit leads. |
| Pipedrive | Legacy `Windmill owner-wise deal summary` webhook | Cleaned | Deleted from Pipedrive on 2026-05-05 |
| Calendly | Main `social@beforest.co` account has active org webhook to Windmill | OK | `invitee.created` posts to `https://windmill.devsharsha.live/api/r/calendly/webinar/pipedrive/activity`; dry-run HTTP job `019df7ed-effc-89a4-6ad1-dbeebfc6bc68` passed |
| Zoom | Webinar booking worker uses existing Zoom server-to-server credentials | OK | Matches upcoming Zoom meeting by collective and nearest Calendly start time |
| Interakt | 1on1 team scheduling notice uses `collective_1on1_team_scheduling_notice` / `1536020268131936` | Approved | Variables are first name and collective; tells the lead a team member will message directly to schedule the 1on1 |
| Interakt | Owner 1on1 touchbase check uses `owner_1on1_touchbase_check` / `1027519250252756` | Approved and live in Windmill | Body values are owner name, lead first name, collective, and Pipedrive deal link. Buttons are `Yes, touched base` and `No, pending`; callback data is `pipedrive_deal:<deal_id>:owner_touchbase_check:<attempt>`. |
| Interakt | Inbound webhook route `https://flows.ops.beforest.co/api/r/interakt/whatsapp/inbound` | OK, signed | Single endpoint routes button/text messages and requires `Interakt-Signature` HMAC-SHA256 verification; hostname updated by Harsha during the 2026-08-31 migration. |
| Interakt | Reschedule acknowledgement uses owner-specific templates | OK | Vivek: `collective_user_notavailable_resend_1on1_link_vivek`; Rakesh: `collective_user_notavailable_resend_1on1_link_rakesh` |
| Interakt | Attendance confirmation uses `attendance_confirmation_1on1` | OK | Body values are deal title, owner display name, meeting datetime |
| Interakt | Webinar confirmation uses `collective_webinar_confirmation` / `1652138732429446` | OK | Body values are invitee first name, collective, webinar date, webinar time |
| Interakt | 1on1 reminder templates are approved | OK | 3d `1068416189695731`, 24h `1448524886960644`, 1h `996140132850094` |
| Interakt | Collective Journey CTA templates | Approved and live on new hostname | `collective_journey_initial_cta_v2` (`1635073731614782`), `collective_journey_day_02_v2` (`1072974968796539`), `collective_journey_day_04_v2` (`1408168268172858`), `collective_journey_day_06_v2` (`1730560394852959`), `collective_journey_day_08_v2` (`2417962418734002`), `collective_journey_day_10_v2` (`1639375957613553`), `collective_journey_day_12_v2` (`1096514256241736`), and `collective_journey_day_14_v2` (`1048517414737004`). All eight were read back as `APPROVED`; their button URL is `https://flows.ops.beforest.co/api/r/sales/gis/open?t={{1}}`. The three affected Windmill scripts were deployed and remotely read back on 2026-08-31 with no old hostname or v1 template references. |
| Interakt | Brochure and post-brochure templates | Brochure v4 approved and live | New-host brochure template `collective_brochure_link_v4` / `1574357340225840` was read back as `APPROVED`; its `Open brochure` URL is `https://flows.ops.beforest.co/api/r/sales/gis/open?t={{1}}`. Both active brochure senders were deployed and remotely verified on v4. `collective_brochure_link_v3` is an unused malformed migration draft and must never be wired. `collective_post_brochure_owner_followup_ack` remains unchanged. See `workflow_sales/Brochure WhatsApp Redirect Setup.md`. |
| Interakt | Previous Story-route templates | Approved legacy fallback | Old `collective_story_*` templates are no longer selected by the Journey sender scripts |
| Windmill variable | `f/sales/gis_label_ids` | Done | `{"gisAwaiting":120,"gisSent":121,"gisOpened":122}`; Pipedrive uses these as replacing state labels, not additive labels |
| Windmill variable | `f/sales/gis_tracking_token_secret` | Optional | If absent, the sender/tracker use the Interakt API key as the HMAC secret |
| Windmill resource | `f/sales/mailchimp_fallback` | OK | Mailchimp Marketing API resource with `api_key` and `server` for email fallback batches |
| Windmill variable | `f/sales/mailchimp_fallback/audience_id` | OK | Mailchimp audience/list ID used by `f/sales/send_mailchimp_fallback_after_whatsapp_failure` |
| Windmill variables | `f/sales/mailchimp_fallback/from_name`, `f/sales/mailchimp_fallback/reply_to` | OK | Configured as `Team Beforest` and `connect@beforest.co` |
| Mailchimp Mumbai revisit test | Campaign `7b906235c5`, static segment `40192056` | Test requested 2026-08-04 | Draft is restricted to `harsha@beforest.co`; campaign-level sender overrides are `Vivekanand Sharma` and `Vivekanand@beforest.co`. Mailchimp accepted the HTML test action. No Mumbai production contacts were imported or sent. |
| Mailchimp Mumbai revisit production | Campaign `68c5b3104c`, static segment `40192135` | Sent 2026-08-05 at 08:54 IST | Live scope rechecked at 647 open Mumbai Initial Event Scheduled deals / 643 unique emails. Mailchimp sent 636; it preserved 3 unsubscribed and 1 cleaned suppression and rejected 3 invalid addresses. From name `Vivekanand Sharma`, Reply-To `Vivekanand@beforest.co`. Initial report: 0 hard bounces, 0 soft bounces, 0 unsubscribes, 0 abuse reports. |
| Windmill variable | `f/sales/calendly_zoom_registration_enabled` | Needed to enable contained webinar path | Set to `true` only when ops wants Calendly registrations to be pushed into Zoom and receive confirmation/reminder WhatsApps while keeping the legacy HTTP trigger, fallback poller, and attendance/prebook tail off |
| Windmill variable / Maton Gmail | `f/sales/maton_api_key` | Secret configured; Vivek Gmail verified | Read-only lookup through the Windmill secret returned active verified account `Vivekanand@beforest.co`, Maton connection `47d771f0-8ebe-4549-9d94-ef07e44506cd`. One Mumbai Collective HTML test was sent to `harsha@beforest.co` on 2026-08-04 and read back with Gmail label `SENT`, message ID `19fccc9a42c8b70d`. Bulk sending remains unconfigured and must retain explicit approval, dedupe, pacing, and resume state. |

### Hammiyala Vivek/Rakesh Split - 2026-08-05

| Check | Expected | Current result |
| --- | --- | --- |
| New-deal scope | Allocate only a genuinely new `hbDB2ybS` primary-form deal | Live after duplicate/existing-deal matching; post-brochure `RqtSprR9` never consumes a turn |
| Sequence | First new deal Vivek, second Rakesh, then alternate | Allocator state seeds `22251956`, rotates under a datatable row lock, and stores the Typeform response key for retry idempotency |
| Existing deals | Never reassign an existing Hammiyala deal | Matched deal owner is read from Pipedrive and reused; existing persons are updated without changing person owner |
| Brochure routing | Vivek and Rakesh receive their respective Hammiyala Canva designs | Implemented across initial CTA, label-triggered CTA, nurture, initial Mailchimp fallback, and nurture Mailchimp fallback |
| Stop goal | Vivek stops on Calendly; Rakesh stops on second Typeform | Implemented in WhatsApp nurture and Mailchimp nurture fallback using current deal owner |
| Calendly | `utm_campaign=hammiyala` updates only open Vivek-owned pipeline `1` deals | Live in the reconciler campaign map with exact-email, owner, pipeline, idempotency, cancellation, and reschedule guards retained |
| Tracking redirect | Both new `canva.link` slugs are accepted and logged as brochure opens | Live in the explicit destination allowlist |
| TypeScript build | All affected Bun scripts parse and bundle | Pass locally for nine affected scripts on 2026-08-05 |
| Windmill deployment and live dry-run | Push scripts without changing schedules/triggers/resources, then verify non-writing production execution | Pass on 2026-08-05: nine per-script pushes, exact remote/local read-back for all nine, intake preview selected Vivek first without consuming a turn, and Calendly/Pipedrive preview completed with `writes: 0`. First two real new leads remain the operational confirmation of Vivek then Rakesh. |
| Interakt | No-slot owner alert template `owner_1on1_no_slot_alert` / `1279318191033383` | Pending Meta approval | Script treats owner alert failure as non-blocking |
| Windmill sync | `wmill sync pull --dry-run` | OK | 0 pending local/remote drift on 2026-05-05 |

## QA Results

### Mumbai Collective Mailchimp Production - 2026-08-05

| Test | Expected | Result |
| --- | --- | --- |
| Live Pipedrive scope | Mumbai pipeline `2`, Initial Event Scheduled stage `14`, open deals only | Pass: 647 live open deals, 646 people, 643 unique eligible emails |
| Domain authentication | `beforest.co` verified and authenticated in Mailchimp | Pass before send |
| Existing suppressions | Do not resubscribe cleaned or unsubscribed contacts | Pass: 3 unsubscribed and 1 cleaned contact excluded |
| Invalid contacts | Retry transient failures, then exclude permanent rejects | Pass: 3 addresses remained HTTP 400 after exponential backoff and were excluded |
| Campaign isolation | Dedicated static segment equals subscribed send count | Pass: segment `40192135`, 636 members |
| Send checklist | Campaign must be ready and recipient count must reconcile before send | Pass |
| Final read-back | Campaign status `sent` with report count matching segment | Pass: campaign `68c5b3104c`, 636 emails sent at 08:54 IST |

### Mumbai Collective Mailchimp Test - 2026-08-04

| Test | Expected | Result |
| --- | --- | --- |
| Recipient isolation | Only `harsha@beforest.co` is eligible for the test draft | Pass: static segment `40192056` contains the single subscribed test contact |
| Campaign identity | Use the approved subject and route replies to Vivekanand | Pass: campaign `7b906235c5`, From name `Vivekanand Sharma`, Reply-To `Vivekanand@beforest.co` |
| Test send request | Ask Mailchimp to send HTML test without triggering the campaign audience | Pass: Mailchimp accepted `actions/test`; campaign remains in saved draft state |
| External Gmail test | Send the same saved draft only to `mudumbaharsha@gmail.com` | Pass: Mailchimp accepted `actions/test` on 2026-08-05 at 08:36 IST; sender and Reply-To remained Vivekanand |
| Production safety | Do not import or contact the 643 Mumbai send candidates | Pass: production contacts touched `0` |

### Mumbai Collective Maton Gmail Test - 2026-08-04

| Test | Expected | Result |
| --- | --- | --- |
| Windmill secret account lookup | `f/sales/maton_api_key` resolves to Vivek's active Gmail connection without exposing the key | Pass: `Vivekanand Sharma <Vivekanand@beforest.co>`, verified OAuth2 connection `47d771f0-8ebe-4549-9d94-ef07e44506cd` |
| Exact HTML test send | Send one copy of the approved Mumbai Collective HTML to `harsha@beforest.co` from Vivek | Pass: Gmail message `19fccc9a42c8b70d`, thread `19fccc9a42c8b70d` |
| Sent-mail read-back | From, To, subject, and `SENT` label match the approved payload | Pass: From `Vivekanand Sharma <Vivekanand@beforest.co>`, To `harsha@beforest.co`, subject `Your Future Won't Wait Forever. Revisit the Mumbai Collective Before 14th August.`, label `SENT` |

### Owner 1on1 Touchbase Loop - 2026-07-09

| Test | Expected | Result |
| --- | --- | --- |
| Template approval | Interakt template exists and is approved before wiring Windmill sends | Approved by dashboard confirmation: `owner_1on1_touchbase_check`, WhatsApp template ID `1027519250252756` |
| Lead notice dry-run | Existing lead-facing notice should now also plan the owner touchbase queue | Pass: remote dry-run on deal `11629` returned `owner_touchbase_queue.status=would_queue` for `f/sales/owner_touchbase/schedule_owner_touchbase_check` |
| Queue dry-run | Queue worker should schedule the sender 24 hours later without side effects | Pass: remote dry-run on deal `11629` returned `status=would_queue`, `delay_hours=24`, `attempt=1` |
| Sender stop condition | Sender should not message an ineligible deal | Pass: remote dry-run on deal `11629` returned `status=skipped`, `reason=deal_no_longer_1on1_tbc` |
| Owner confirms touched base | Inbound route should log confirmation and stop reminders | Pass: remote dry-run returned `subject=Owner confirmed lead touched base` and `next_reminder=null` |
| Owner marks pending | Inbound route should log pending and queue next reminder | Pass: remote flow dry-run returned `action=owner_touchbase_pending` and next queue args `attempt=2`, `delay_hours=24` |

### Owner Daily Sales Digest Update - 2026-06-24

| Area | Observation | Action | Result |
| --- | --- | --- | --- |
| Owner digest actionability | The 9 AM owner digest showed new-deal and activity-health counts, but did not separate Lead-In from Initial Event Scheduled or tell owners what to handle next | Updated `f/sales/send_owner_daily_sales_digest` to append stage breakdown to the collective line and replace the final operational line with activities, open-stage counts, and `Next: attend Initial Event Scheduled ... immediately; close failed WhatsApp ...` | Dry-run previews passed for Vivek and Rakesh/Sravani without sending WhatsApp; failed WhatsApp counts are derived from open Pipedrive manual-failure activities (`WhatsApp failed - send manually` / `WhatsApp failed to deliver`) matched back to each owner’s open deals |

### Post-GIS Typeform Webhook Fix - 2026-06-16

| Area | Observation | Action | Result |
| --- | --- | --- | --- |
| GIS open tracker redirect | A valid Journey tracking link could show a raw Windmill error if the embedded Pipedrive deal had been deleted before the lead clicked it | Updated `f/sales/track_gis_story_open` so token and ArcGIS destination validation remain strict, while Pipedrive label/activity writes are best-effort | Valid links should still redirect to the StoryMap even when Pipedrive tracking fails |
| Collective Journey stale-deal guard | Deleted or closed Pipedrive deals could remain in the nurture queue and still be considered for 9pm follow-up sends | Updated `f/sales/send_collective_story_unopened_nurture` to verify the deal before sending: deleted/unavailable deals stop, non-open deals stop, submitted second-form deals complete, and activity-read uncertainty retries instead of sending | Future scheduled nurture runs should avoid wasting Interakt sends on deleted/closed deals while preserving active leads |
| Post-GIS Typeform webhooks | The four second-form conversation request Typeforms had no active webhooks, so bottom-of-Journey submissions were not reaching Windmill/Pipedrive | Added `windmill_pipedrive_intake` webhooks to Bhopal `i1b6g9ZU`, Mumbai `s9YSmglR`, Poomaale 2.0 `Prnzj8zH`, and Hammiyala `RqtSprR9`, all pointing to `https://windmill.devsharsha.live/api/r/typeform/pipedrive/intake` | Verified each form now has one enabled webhook |
| Post-GIS Typeform parser refs | The second forms use refs such as `full_name`, `mobile_number`, `email_address`, `unanswered_questions`, and `schedule_one_on_one`, while the intake worker only read the primary-form UUID refs | Updated `f/sales/typeform_to_pipedrive_intake` to support post-GIS refs and deployed it to Windmill | Mumbai dry-run parsed as `1on1`, owner Vivekanand, stage `14`, label `115`, with rule-override fit decision |
| Historical post-GIS submissions | Mumbai, Poomaale 2.0, and Hammiyala each had one second-form response that had not been processed because the webhooks were missing | Backfilled the three responses through the deployed intake worker | Mumbai updated existing deal `14049`; Poomaale updated existing deal `13744`; Hammiyala created deal `14052`; all three received `Post-GIS Typeform submitted` and owner `Review post-Journey conversation request` activities |
| Product mapping after backfill | Product mapping needed to remain attached after backfilled post-GIS submissions | Verified product mapping jobs | Mumbai and Poomaale were already attached; Hammiyala attached product `Hammiyala #2 AC` |
| Collective Journey nurture cadence | The queue-backed nurture worker advanced by the next stored step, so old leads with missed/retry-later early sends could receive Day 2/4 instead of the current age-based touchpoint | Updated `f/sales/send_collective_story_unopened_nurture` to choose the current age-based step from original `GIS story link sent` time and to advance from the actual sent step | Dry-run showed due rows jumping directly to current markers such as Day 8 and Day 10, while still stopping once `Post-GIS Typeform submitted` exists |

### Fit Classifier Guardrails - 2026-06-03

| Area | Observation | Action | Result |
| --- | --- | --- | --- |
| 1on1 fit/unfit classification | Azure could over-interpret high-intent clarification answers as unfit, while greeting/filler answers such as `Hi` needed to be rejected deterministically | Added rule overrides in `f/sales/typeform_to_pipedrive_intake`: greeting/filler-only 1on1 reasons become unfit; ready/near-ready clarification language, direct ownership/investment intent, and specific commercial/legal/visit/booking questions become fit before Azure is called | Dry-run now previews the rule override result without calling Azure; ambiguous 1on1 answers still go to Azure in live runs |
| Post-GIS Typeform nurture stop | The nurture worker originally stopped at Journey open, but sales wanted follow-up to continue until the second Typeform is submitted | Post-GIS Typeform intake logs `Post-GIS Typeform submitted`; the nurture worker now includes `GIS Sent` and `GIS Opened` deals and skips only after that activity | Stop condition is explicit: Collective Journey nurture stops after second Typeform submission |

### Runtime Incident - 2026-05-20

| Area | Observation | Action | Result |
| --- | --- | --- | --- |
| Default worker saturation | Windmill dashboards were stuck loading because the 3 default Bun/flow workers were saturated by stale sales webhook jobs and queued dashboard app scripts could not start | Cancelled the stale child jobs and deployed a non-blocking Pipedrive usage logging guard across sales scripts that call `f/pipedrive_tokens_dashboard/log_pipedrive_api_usage`; logging now waits up to 1.5s and then lets the business flow continue | Default worker 15s occupancy returned to near idle, and `f/supabase/get_project_metrics_snapshots` plus `f/task_intelligence_system/fetch_dashboard_v2` returned live data |
| Post-webinar prebook worker deadlock | Three `f/sales/sync_webinar_attendance_and_prebook` jobs in `prebook_after_webinar` mode occupied all 3 default Bun workers from 2026-05-20 18:44 IST into 2026-05-21, while each waited on `f/sales/calendar_prebook_1on1`; Typeform, Calendly, Interakt, dashboard, and scheduled jobs queued behind them | Cancelled the 3 stuck running jobs plus the remaining sibling queued prebook job, then changed `prebook_after_webinar` to enqueue `calendar_prebook_1on1` asynchronously and return the child job ID instead of waiting inside the parent worker | Default workers can drain backlog without the parent/child worker-pool deadlock recurring; calendar prebook remains tracked through the returned job ID and Pipedrive audit activity |
| Sales webhook child-job deadlock | After the first stuck jobs were cancelled, live default workers saturated again with `create_webinar_activity_from_calendly` and `typeform_to_pipedrive_intake` parent jobs waiting on queued child scripts; `pipedrive_1on1_tbc_to_calendar_prebook` had the same synchronous child-call pattern for calendar prebook and webinar CTA | Changed Typeform product mapping, Pipedrive label-guard calendar/CTA calls, and Calendly webinar attendance scheduling to enqueue child scripts asynchronously and return child job IDs; dry-run preview paths remain synchronous for QA visibility | Parent webhook workers no longer hold scarce Bun slots while waiting for child automation jobs, reducing the risk that a burst of webhooks halts all automations |
| Dedicated sales webhook worker group | A separate queue is needed so sales webhook bursts cannot consume every default Bun worker again | Created Windmill worker group config `sales-webhook` with worker tag `sales-webhook`; did not assign live scripts yet because `wmill workers` shows `sales-webhook (0 workers)` | Safe staging state: production still runs on default workers until the server/orchestrator starts at least one worker with `WORKER_GROUP=sales-webhook` |

### Owner Routing

| Collective | Applies to | Pipedrive owner | Calendar path for 1on1 fit |
| --- | --- | --- | --- |
| Bhopal | Webinar and 1on1 | Vivekanand, owner ID `22251956` | Vivek Calendly availability, books `Vivekanand@beforest.co` |
| Mumbai | Webinar and 1on1 | Vivekanand, owner ID `22251956` | Vivek Calendly availability, books `Vivekanand@beforest.co` |
| Hammiyala | New primary-form deals after split cutover | Strict round-robin: Vivekanand `22251956` first, then Rakesh `13490118` | Vivek-owned: Vivek brochure → Calendly; Rakesh-owned: Rakesh brochure → second Typeform. Existing deals are not reassigned. |
| Poomaale 2.0 | Webinar and 1on1 | Rakesh, owner ID `13490118` | Google Calendar free/busy, books `sai@beforest.co` |
| Hyderabad | Post-brochure and webinar mapping | Vivekanand, owner ID `22251956` | Team-managed scheduling notice path; no calendar prebook |

### Typeform Intake Dry Runs

Command shape:

```powershell
wmill script run f/sales/typeform_to_pipedrive_intake -d '{"body": <payload>, "dry_run": true}' -s
```

| Sample | Route | Collective | Pipeline | Stage | Labels | Custom fields | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `typeform_webhook_payload/bhopal.json` | `1on1` | Bhopal | `4` | `30` | `115` | `26` | Pass, owner Vivekanand |
| `typeform_webhook_payload/hammiyala.json` | `gis` | Hammiyala | `1` | `10` | `120` | `28` | Pass on deployed 2026-08-05 code; seeded allocation preview owner Vivekanand, no turn consumed |
| `typeform_webhook_payload/mumbai.json` | `1on1` | Mumbai | `2` | `14` | `115` | `25` | Pass, owner Vivekanand |
| `typeform_webhook_payload/poomaale2.json` | `webinar` | Poomaale 2.0 | `3` | `20` | `111` | `27` | Pass, owner Rakesh |

### Typeform Product Mapping

| Collective | Typeform product answer | Pipedrive product |
| --- | --- | --- |
| Bhopal | Current `₹3.33 Cr` private-estate answer | `Bhopal #2AC`, `BHPL_2AC`, INR `3,33,00,000` |
| Mumbai | `₹8.01 Cr` all-inclusive offer | `Mumbai #Earth Home — Aug 2026`, `MUM_EARTH_HOME_2026_08`, INR `8,01,00,000` |
| Hammiyala | `Private Estate — ₹3.46 Cr` | `Hammiyala #Private Estate — Aug 2026`, `HAMM_PRIVATE_ESTATE_2026_08`, INR `3,46,00,000` |
| Hammiyala | `Founder's District — ₹3.52 Cr` | `Hammiyala #Founder's District — Aug 2026`, `HAMM_FOUNDERS_DISTRICT_2026_08`, INR `3,52,00,000` |
| Poomaale 2.0 | `Yes — I understand the all-inclusive price is ₹3.70 Cr.` | `Poomaale 2.0 #2.5AC — Aug 2026`, `POO_2_0_2_5AC_2026_08`, INR `3,70,00,000` |

The revised Mumbai, Hammiyala and Poomaale 2.0 pricing went live prospectively on 2026-08-24. Versioned products preserve historical deal products. Old affirmative labels remain supported for cached/in-progress forms, while `Not ready` / `Not sure` answers attach no priced product. If an existing deal already carries a managed historical product, the prospective resolver preserves it instead of replacing it.

The product worker first searches Pipedrive by code/name, creates the product if missing, then attaches one product row to the deal if the same product is not already attached.

On 2026-08-28, post-cutover deal QA found one Bhopal mapper child job failing after it had already attached the correct `BHPL_2AC` product. Pipedrive correctly derived the INR `3,33,00,000` deal value from that product row, then rejected the worker's redundant `PUT deals/{id}` value update with `ERR_DEAL_WITH_PRODUCTS_CANT_UPDATE_VALUE`. The mapper now treats the attached product as the value source, never performs that forbidden post-attachment value write, and repairs a stale Bhopal deal-product price by removing and reattaching the row. Focused tests pass `9/9` with `37` assertions, including initial attachment, idempotent retry, and stale-price repair. Deployed script hash `4ed395af4b91c76b`; non-writing production dry-run job `01a04724-7d68-4be2-3435-d15cc675e1f1` succeeded against the affected deal as `already_attached` with no stale product rows.

Backfill on 2026-05-06:

| Scope | Result |
| --- | --- |
| Recent deals `12782` through `12811` | `29` product rows attached; deal `12810` skipped as already attached |
| Spot checks | Deals `12811`, `12808`, `12807`, and `12782` returned `already_attached` with exactly `1` deal product |

### 1on1 Prebook Dry Runs

| Test | Input | Expected | Result |
| --- | --- | --- | --- |
| Eligible 1on1 deal | Deal `12662` | `dry_run_ready`, owner Vivekanand, Calendly slot | Pass |
| Webinar deal guard | Deal `12663` | `ignored`, not eligible | Pass |
| Direct calendar + WhatsApp preview | Deal `12662` | Calendly slot preview plus Interakt payload, no event/message created | Pass: Vivek payload uses Bhopal, `Vivekanand`, `2:00 PM IST` |
| Direct calendar + WhatsApp preview | Deal `12414` | Google free/busy slot preview plus Interakt payload, no event/message created | Pass: Rakesh payload uses Poomaale, `Sai Rakesh`, `1:30 PM IST` |
| Forced no-slot fallback | Deal `12662`, `force_no_slot=true` | No event/message created in dry-run; plans label `105`, Pipedrive note, lead booking-link WhatsApp, owner alert | Pass: Vivek lead template uses `collective_user_notavailable_resend_1on1_link_vivek` with Vivek Calendly link |
| Forced no-slot fallback | Deal `12414`, `force_no_slot=true` | No event/message created in dry-run; plans label `105`, Pipedrive note, lead booking-link WhatsApp, owner alert | Pass: Rakesh lead template uses Google Appointment Schedule link |
| Direct calendar preview on webinar deal | Deal `12663` | Preview works | Pass with caveat |

Caveat: `calendar_prebook_1on1` does not itself check labels/stages. It is no longer called by the fit-lead label guard in the GIS-only funnel and should be treated as an internal privileged script.

Latest observed 1on1 slot preview:

```text
2026-05-13 14:00-14:30 IST
Calendar: Vivekanand@beforest.co
Source: Calendly
WhatsApp: `1on1_fit_with_prebookedcall`, values `Harsha Mudumba`, `Bhopal Collective`, `Vivekanand`, `13 May 2026`, `2:00 PM IST`
```

### 1on1 Interakt Inbound Dry Runs

| Test | Expected | Result |
| --- | --- | --- |
| Local flow preview, `Reschedule Call`, deal `12662` | Plans calendar cancel, label `105`, clear meeting fields, send Vivek booking link template | Pass |
| Local flow preview, `Confirm Attendance`, deal `12662` | Plans label `106`, Pipedrive note, `attendance_confirmation_1on1` | Pass |
| Remote flow run, `Reschedule Call`, deal `12662` | Same as local preview with deployed handlers | Pass |
| Remote flow run, `Confirm Attendance`, deal `12662` | Same as local preview with deployed handlers | Pass |
| Public HTTP trigger dry-run, `Reschedule Call`, deal `12662` | Route wraps body correctly and returns dry-run plan with no side effects | Pass: job `019df791-ad8b-64f5-20a3-c043adb3c0dc` |
| Public HTTP trigger unsigned request | Reject request before flow starts | Pass: HTTP `400` |
| Public HTTP trigger signed request | Accept signature and route to reschedule dry-run | Pass: job `019df79a-214d-62e8-0a37-9a66ae825c08` |

Caveat: test deal `12662` has no current Pipedrive meeting date, so the attendance dry-run displayed `the scheduled time`. New prebooked deals will write the meeting date and Google event reference during `calendar_prebook_1on1`.

### 1on1 Reminder Dispatcher Dry Runs

| Test | Expected | Result |
| --- | --- | --- |
| Current-window remote dry-run | Scan open deals without sending; no due reminders unless a booked call is within a reminder window | Pass: checked `500` open deals, planned `0` reminders |
| Simulated D-3 dry-run on old pending deal `11629` | Build Interakt payload only; no WhatsApp send and no activity creation | Pass: template `collective_1on1_reminder_3days_before`, id `1068416189695731`, values `Artha Nirmiti`, `Vivekanand`, `3 March 2026`, `7:00 PM IST` |
| Simulated D-1 dry-run on old pending deal `11629` | Build Interakt payload only; no WhatsApp send and no activity creation | Pass: template `collective_1on1_reminder_24hrs_before`, id `1448524886960644`, values `Artha Nirmiti`, `Vivekanand`, `3 March 2026`, `7:00 PM IST` |
| Simulated H-1 dry-run on old pending deal `11629` | Build Interakt payload only; no WhatsApp send and no activity creation | Pass: template `collective_1on1_reminder_1hr_before`, id `996140132850094`, values `Artha Nirmiti`, `Vivekanand`, `7:00 PM IST` |
| Remote schedule config | Enabled every 15 minutes IST, live args `dry_run=false` | Pass: `0 */15 * * * *`, `Asia/Kolkata`, `u/harsha` |

### 1on1 Owner Attendance Check Dry Runs

| Test | Expected | Result |
| --- | --- | --- |
| Remote current-window dry-run | Scan open deals without sending; no checks unless a confirmed 1on1 has passed its meeting window | Pass: checked `500` open deals, planned `0` checks |
| Remote Interakt flow dry-run, owner clicks `Attended`, deal `11629` | Route to owner-attended worker; plan label `107` and Event Attended stage | Pass: planned stage `15`, label `107` |
| Remote Interakt flow dry-run, owner clicks `Not Attended`, deal `11629` | Route to no-show worker; plan label `108` and no-show rebook WhatsApp | Pass: template `collective_1on1_no_show_rebook`, id `1483962136798583`, body values `Artha Nirmiti`, `Vivekanand`, Vivek booking link |
| Remote schedule config | Enabled every 30 minutes IST, live args `dry_run=false` | Pass: `0 */30 * * * *`, `Asia/Kolkata`, `u/harsha` |

### Webinar Activity Dry Runs

| Test | Expected | Result |
| --- | --- | --- |
| Existing Calendly booking to worker script | Finds deal `12790`, existing activity `52972`, action `update_existing_activity` | Pass |
| Existing Calendly booking through flow | Same as worker script after 5s wait | Pass |
| Synthetic unknown invitee | Plans person/deal/activity creation without writing | Pass |

Reverified on 2026-05-05 after Windmill renaming:

| Test | Result |
| --- | --- |
| `04 Flow - Calendly webinar booking to Pipedrive activity` with real payload | Pass: dry-run action `update_existing_activity`, deal `12790`, activity `52972` |
| `05 Action - create/update webinar activity` with same real payload | Pass: dry-run action `update_existing_activity`, deal `12790`, activity `52972` |
| `05 Action - create/update webinar activity` with synthetic unknown invitee | Pass: dry-run plans person/deal/activity creation without writing |

Zoom layer added on 2026-05-05:

| Test | Result |
| --- | --- |
| Deployed worker dry-run with real Mumbai Calendly payload | Pass: matched Zoom meeting `84230819541`, topic `Mumbai Collective Introduction Webinar`, start delta `0` minutes |
| Deployed flow dry-run with real Mumbai Calendly payload | Pass: same Zoom match, deal `12790`, activity `52972` |
| Local worker preview with synthetic Mumbai invitee | Pass: dry-run plans Zoom registration without writing to Zoom or Pipedrive |
| Deployed worker dry-run after confirmation wiring | Pass: builds `collective_webinar_confirmation` / `1652138732429446` with values `Windmill`, `Mumbai Collective`, `22 May 2026`, `8:00 PM IST`, then plans reminder jobs |

Runtime behavior: non-dry runs register the invitee into the matching Zoom webinar, write Zoom `join_url` to Pipedrive Meeting URL, write Zoom registrant id to Meeting Reference ID, use the Zoom join URL in the activity note, send `collective_webinar_confirmation`, and log that confirmation as a done Pipedrive activity for dedupe.

Correction on 2026-05-06: Calendly fallback-created webinar deals now use only the invitee name as the deal title and assign the collective owner. Fixed existing deal `12808` from `Rashhmi - Poomaale Collective Webinar` / Beforest Admin to `Rashhmi` / Rakesh, and moved its webinar activity `53030` to Rakesh.

### Webinar Reminder Dispatcher Dry Runs

| Test | Expected | Result |
| --- | --- | --- |
| Remote targeted dry-run | Targeted worker can still preview due reminders for a deal without sending | Pass |
| Remote fallback schedule config | Disabled; no recurring Pipedrive polling | Pass: `enabled=false`; one queued run from before disable completed once at `2026-05-05 16:30 IST` |
| Event-driven enqueue | `create_webinar_activity_from_calendly` sends webinar confirmation, then schedules one-off reminder jobs after the Zoom registration and Pipedrive activity update succeeds | Ready behind `f/sales/calendly_zoom_registration_enabled=true`; old attendance/prebook checks are skipped by default |
| 08Z duplicate-send guard | Disabled fallback poller is clearly marked `DISABLED DO NOT ENABLE` and broad non-dry-run polling requires explicit `fallback_enabled=true` | Added 2026-05-20 after one-off reminder jobs became the live path |

### Zoom Sync Dry Run

Command:

```powershell
wmill script run f/collectives/zoom_collective_to_pipedrive -d '{"dry_run": true}' -s
```

Result on 2026-05-05:

| Metric | Value |
| --- | --- |
| Meeting count | `4` |
| Registrants seen | `84` |
| Existing deals skipped | `78` |
| Deals that would be created | `6` |
| Activities that would be created | `6` |
| Errors | `0` |
| State persisted | No |

### Calendar Smoke Test

| Calendar | Result |
| --- | --- |
| `Vivekanand@beforest.co` | Free/busy OK |
| `sai@beforest.co` | Free/busy OK |

## Risks To Fix

| Risk | Why it matters | Proposed action |
| --- | --- | --- |
| Public Windmill HTTP routes use `authentication_method: none` | Anyone with a valid deal ID could trigger guarded automations | Interakt inbound fixed with signature auth; review other public routes separately |
| Calendar script lacks direct eligibility guard | Direct manual misuse could book wrong deal type | Add optional guard or keep access restricted |
| Owner no-slot Interakt template is pending approval | Owner alert may be skipped until Meta approves template `owner_1on1_no_slot_alert` | Monitor approval before relying on owner WhatsApp alerts |
| Webinar flow relies on timing between Calendly and Typeform | Earlier failures happened before person/deal existed | Current retry/create logic helps; keep monitoring |
| Main Calendly still has 3 active n8n user webhooks | New bookings may still trigger old n8n automations in parallel | Confirm and delete old n8n webhook subscriptions if Windmill is now source of truth |
| Main Calendly has upcoming Hyderabad webinar | Hyderabad Pipedrive mapping is now known: pipeline `6`, owner Vivekanand | Worker mapping updated locally; run dry-run before enabling Hyderabad webinar automation live |
| No git repo in `D:\AI Apps\windmill` | Windmill sync exists, but no durable code history | Initialize/private git when ready |

## Live: Typeform qualified 1on1 answer signal to Meta CAPI

Status on 2026-08-11: live for all five primary collectives. The isolated worker, HTTP trigger, and idempotency table are deployed; the three encrypted Meta variables are populated. A synthetic Bhopal Test Event was acknowledged by Meta and independently read back in Events Manager as `Qualified1on1AnswerSignal` / `Processed` / `Server`. No Typeform or Meta campaign/ad-set optimisation setting was changed.

| Area | Staged behavior | Verification / blocker |
| --- | --- | --- |
| Canonical qualification | `typeform-primary-1on1-destination-v2-2026-08-06` treats display of each live form's existing `Why is joining this collective important to you?` destination as the canonical branch outcome; no second score or answer classifier exists | Exact live form/ref pairs verified for Bhopal `CYae8hmZ`, Mumbai `kfcjiXxR`, Hammiyala `hbDB2ybS`, Poomaale 2.0 `i8eBLQkz`, and Hyderabad `leXyUOuT` |
| Partial response isolation | `f/sales/typeform_to_pipedrive_intake` ignores `form_response_partial` and returns before Pipedrive, AI-fit, note, product, brochure, acknowledgement, or audit side effects | Windmill local preview returned `partial_response_ignored_embed_transport_enabled`, `pipedrive_side_effects: skipped`, and `final_submit_side_effects: skipped` |
| Completed response compatibility | Completed responses queue the same signal worker as a fallback and continue through the existing intake | Deployed-vs-local synthetic dry-run matched route `1on1`, pipeline `4`, stage `30`, label `115`, and owner `22251956`; local output only added `qualified_1on1_signal: would_queue` |
| Privacy | No raw answers are sent. Consented email/phone/name are normalized and SHA-256 hashed. `fbp`/`fbc` are preserved when present; `fbc` can be derived from `fbclid`. Custom data is limited to collective, rule version, and non-empty UTMs | Synthetic tests assert raw identity and the access token are absent from request URL/body previews |
| Idempotency and retry | Stable Meta `event_id` is derived from event name, rule version, form ID, and Typeform response ID. An atomic unique-key claim blocks duplicate embed/retry/final delivery; retryable Meta failures use bounded retries. Global database-backed request limits reduce public-endpoint abuse | Live table verified; unit suite: 13 pass / 0 fail, 63 assertions. Live duplicate returned `already_sent`; a controlled terminal Meta 400 was recorded as `failed`, proving the claim becomes retryable instead of remaining pending |
| Revised launch transport | Typeform Embed SDK `onStarted` captures the response ID and `onQuestionChanged` emits only for the exact qualified destination. The public preprocessor permits only HTTPS `beforest.co` origins/source URLs and exact form/ref pairs | Self-installing helper preserves existing popup callbacks/hidden values. Three supplied HTML files contain one inline deployment copy; BeBuilder block supports Poomaale and Hyderabad Live alias. All scripts parse; runtime harness passed. No Typeform edits required. Trigger lint: 1 valid / 0 invalid |
| Deployment | Managed-table migration, `f/sales/handle_typeform_qualified_1on1_signal`, and its public HTTP trigger are live. Existing Typeform/Pipedrive final-submit automation was not included in the deployment | Deployed worker content hash matched local source; public non-qualified smoke job returned `ignored`; qualified Test Event returned HTTP 200 / `events_received=1`; duplicate returned `duplicate_ignored` / `already_sent`; Events Manager showed the event as processed server activity |
| Matching-quality constraint | The embed page can pass available `fbp`, `fbc`/`fbclid`, UTMs, and page URL without reading Typeform answers | Never place a secret in browser code; send no raw answers or contact fields from the embed callback |

## Staged: Bewild Rice Finder nurture catch-up

Status on 2026-08-18: dispatcher and recurring schedule are deployed for review, but the schedule is disabled and its stored arguments remain `dry_run: true`. No delivery has been enabled.

| Area | Verification |
| --- | --- |
| Catch-up policy | Stages already overdue at the `2026-08-19` IST boundary are assigned deterministically across 19-21 August. Newly due leads bypass the catch-up buckets and continue on normal stage timing. Only the latest due stage is selected; older overdue stages remain backfill-skipped in a live run. |
| Channels | Email remains a Shopify Flow handoff via due tags. WhatsApp is `false` in the deployed schedule and remains behind Interakt approval/sync. |
| Safety | Buyer exit, channel consent, idempotent lead/stage/channel dispatch rows, five-day spacing, three-attempt cap, channel windows and the fail-closed delivery-variable check remain in place. Catch-up selects at most one channel touchpoint per lead/day. |
| Deployment | Scoped sync added only `f/bewild_lead_magnet/dispatch_rice_nurture` script/schema/lock and its disabled schedule. Remote script hash: `a191c19a94ae1d18`. |
| Dry run | Job `01a01484-cda8-996b-9c07-0e1f7f52c22f` succeeded: 42 checked, 25 staged email handoffs, 17 channel-ineligible skips, 0 completions, 0 failures, WhatsApp disabled. Daily totals: 10 on Aug 19, 6 on Aug 20, 9 on Aug 21. |
| Launch blocker | `f/bewild_lead_magnet/rice_nurture_delivery_enabled` does not yet exist remotely. The dispatcher treats missing as false, so it is fail-closed. Create/set it only during a separately approved launch, after reviewing this dry run. |

### 2026-08-21 Maton Gmail and unsubscribe staging

| Area | Verification |
| --- | --- |
| Direct email route | Local dispatcher now supports an explicit `maton_gmail` provider for the verified `orders@bewild.life` connection while retaining `shopify_flow` as the default. Per-run sends are capped at 25 and default to 10. |
| Rendering | All seven Rice nurture stages are rendered from explicit lead/result values. The sender rejects any remaining `{{ ... }}` placeholder before Gmail is called. |
| Unsubscribe | Added a signed two-step public unsubscribe handler. GET displays confirmation only, protecting against email-link scanners; POST sets Postgres `email_opt_in=false`, suppresses future email dispatches, changes Shopify email consent to `UNSUBSCRIBED`, and adds `rice_nurture_email_unsubscribed`. |
| Idempotency | Gmail send is recorded as `sent` before Shopify sent-tag work. A read-back or tag failure cannot cause the same email to be retried; verified sends receive the exact stage sent tag. |
| Secrets | Maton orders key and unsubscribe-signing secret now exist as encrypted Windmill variables. `rice_nurture_delivery_enabled` exists remotely and is explicitly `false`. Values were not printed or committed. |
| Validation | Both TypeScript files bundle successfully. Windmill lint: 6 valid files, 0 invalid, 0 warnings. |
| Deployment | Local staging only. The updated dispatcher, new unsubscribe script and GET trigger still require scoped metadata generation and deployment. The existing recurring schedule remains disabled and `dry_run=true`; no lead email was sent. |

## Automation Backlog

### 2026-09-23 TinyFish account capacity for sales intelligence

Harsha offered six additional authorized TinyFish accounts (nine total) and asked to shorten the candidate-search backfill. The old worker held a single lease and spaced all searches globally, so extra keys alone would not increase search throughput. The change was scoped to bounded per-account lanes inside the existing worker, preserving its queue, request hashes, account-level rate limits, uncertain-call holds, and free-only behavior. No separate copy of the single-lease worker was started.

Staging record: `tinyfish_enrich.ts` was changed to discover up to nine distinct encrypted account variables, assign queued people across per-account lanes, space searches per account, and claim request hashes before concurrent calls. It kept the shared lease, queue, cache, free-only mode, and conservative 450-search/hour and 900-fetch/day allowance for each key. Bun bundle passed. On September 24, empty encrypted Windmill variables `_4` through `_9` were created and metadata verified `is_secret=true` for Harsha to fill. No values were printed or saved in source.

September 24 live update: Harsha filled `_4` through `_9`; account 9 initially duplicated 8, then was corrected. All nine secret values passed uniqueness checks, and accounts 4-9 passed authenticated TinyFish Search calls without printing values. The previous backfill had stalled on job `01a0cd43-3b2a-91b8-cef0-2f9db0e06daf`: `text.slice(0,6000)` cut an emoji surrogate pair in a fetched public-page excerpt, causing PostgreSQL JSON rejection. Local worker now slices by code point and sanitizes lone surrogates before JSON writes. A nine-record live preview passed (five searches, four fetches). Scoped worker deployment changed hash `c5d8b9f0629626dc` to `6d59cc8c6d6d2c69`; exact content and input schema read-back passed. Restarted the existing saved queue with no new queue or schedule. Three successive jobs processed 25, 45, and 45 people, each queued its successor; latest successor `01a0d22d-1caf-0d26-656b-175d8a2c036b`. Recent call ledger shows both search and fetch attempts on all nine account slots. Pending count fell from 4,843 after pilot to 4,728. No paid fallback, CRM write, outreach, or Jev-to-sheet matching was added. Continue to monitor the chain and treat candidate identities as unconfirmed.

Harsha supplied three distinct TinyFish account keys and authorized using them for the existing `f/sales_intelligence/tinyfish_enrich` backfill. The change is scoped to that worker and two new encrypted variables in `f/sales_intelligence`; it does not add a second queue, schedule, paid API, CRM write, or outreach. Existing request hashes and account-one usage stay in the ledger. The worker selects an account with remaining conservative allowance (450 searches/hour, 900 fetches/24h per account), and blocks a key after a known 401/403/429 response. Uncertain requests remain unretried. All three secrets passed authenticated Search reads. Live verification after scoped deployment `c5d8b9f0629626dc`: account one retained 900 completed fetches; account two had 14 completed and one in progress; the queue remained enabled with no blocked accounts. The first deployment had an interval-parameter serialization error, repaired before restart. Continue watching the chain until the current job and its successor complete.

### 2026-09-23 Treg follow-up for finished TinyFish candidates

Harsha authorized a parallel Treg pass under $9 total. Live scope at design time: 1,205 finished TinyFish people with a first candidate URL (1,137 unique), but almost all are ambiguous and none of the new results had a company clue. A five-URL TikHub pilot cost $0.005 but returned two timeout-shaped provider errors inside HTTP 200 responses, so the follow-up switched to AnyAPI. Its five-URL pilot returned two found profiles for $0.0016 total and three unbilled misses. The shared cumulative Treg ledger now caps at $8.90, below Harsha's $9 ceiling. Candidate summaries are shown in the password-protected dashboard as unconfirmed; they do not change ranks or verified CRM profile facts. The scoped worker uses the existing profile URL cache, reserves a worst-case $0.0012 before each call, and preserves uncertain requests without retry. Dashboard version 274 retains anonymous sandbox policy and both server-side password checks. The older `verify_dashboard.ts` helper predates the password gate and fails with `Invalid dashboard password`; inspect the deployed policy and use current password-aware checks instead.

Dashboard clarity follow-up: the header's `0 awaiting processing` referred only to the completed CRM assessment, while TinyFish still had thousands queued. Relabel the header as assessment status and explicitly point to the live profile-enrichment banner. Preserve rankings, password checks, app policy, and all other automations.

Scoped dashboard version 280 deployed. Read-back against the immediately preceding version 274 confirmed only the intended header-copy replacement; both backend password scripts and the app policy were byte-for-byte unchanged. TinyFish and Treg workers remained active.

### Current City Capture - 2026-08-21

| Component | Scope | Status |
| --- | --- | --- |
| Typeform question | Required `Which city do you currently live in?` immediately before contact information on all five active primary collective forms | Published; 2026-08-24 routing correction verified one entry route and zero direct skips on all five forms. Fresh backups/readbacks: `snapshots/typeform_city_logic_fix_20260824/` |
| Pipedrive field | Deal-level varchar `Current City`, key `7a56106207f7c86104eeec332138ec8159ee2ec2` | Created and read back |
| Windmill intake mapping | Shared ref `beforest_current_city_2026` → `Current City` | Deployed and remotely read back; dry-run verified 2026-08-21 |
| Historical data | Backfill existing deals | Not included |

### Next Build: WhatsApp / Interakt 1on1 Communication

| Automation | Trigger | Outcome | Status |
| --- | --- | --- | --- |
| 1on1 prebooked WhatsApp message | Calendar prebook succeeds | Send prebooked call message with reschedule and attendance buttons | Live inside `calendar_prebook_1on1` |
| Reschedule button handler | Interakt webhook button text `Reschedule Call` or callback data | Cancel owner calendar event, label `1on1 - Awaiting`, clear meeting fields, send owner booking link | Live |
| Confirm attendance handler | Interakt webhook button text `Confirm Attendance` or callback data | Label `1on1 - Pending`, send attendance confirmation, write Pipedrive note | Live |
| 1on1 reminder 3d | Scheduled relative to meeting time | Send WhatsApp reminder and log done activity | Live in `f/sales/send_1on1_reminders` |
| 1on1 reminder 24h | Scheduled relative to meeting time | Send WhatsApp reminder and log done activity | Live in `f/sales/send_1on1_reminders` |
| 1on1 reminder 1h | Scheduled relative to meeting time | Send WhatsApp reminder and log done activity | Live in `f/sales/send_1on1_reminders` |
| Owner attendance check | After confirmed 1on1 meeting window | Ask owner if candidate attended; buttons route through the single Interakt webhook | Live |
| Owner marks attended | Owner clicks `Attended` | Label `1on1 - Attended` and move deal to Event Attended stage | Live |
| 1on1 no-show rebook | Owner clicks `Not Attended` | Label `1on1 - No-Show`, send rebook message with owner booking link, write note | Live |

### Webinar Lifecycle

| Automation | Trigger | Outcome | Status |
| --- | --- | --- | --- |
| Unfit 1on1 webinar CTA | Deal label changes to `Scheduled Webinar Awaiting` (`110`) | Send `collective_unfit_webinar_cta` with Bhopal/Mumbai/Hammiyala/Poomaale Calendly webinar link; log short done activity | Live; backfilled deals `12810`, `12801`, `12800`, `12799`, `12798`, `12797`, `12796` |
| Webinar confirmation | Calendly-to-Zoom/Pipedrive worker succeeds | Send `collective_webinar_confirmation`; log done activity for dedupe | Live |
| Webinar reminder sequence | Calendly-to-Zoom/Pipedrive worker schedules one-off jobs | Send 3d, 24h, and 1h reminders; log done activities for dedupe | Live |
| Webinar attendance sync | Zoom past meeting attendance via `f/sales/sync_webinar_attendance_and_prebook` | Move attended leads to Event Attended, update labels, and use registrant IDs from the Calendly-to-Zoom path where available | Live; one-off checks scheduled by 04C plus 13B fallback reconciliation |
| Webinar no-show follow-up | Zoom absence | Send follow-up/rebook message | Pending |
| Webinar post-attendance next step | Attendance confirmed | Prompt 1on1 or next sales action | Pending |

### Platform Hygiene

| Automation/task | Status |
| --- | --- |
| Add HTTP auth/signature to Interakt inbound trigger | Done: `authentication_method=signature`, `Interakt-Signature`, `sha256=` |
| Remove obsolete Pipedrive webhook if confirmed | Done: deleted `Windmill owner-wise deal summary` |
| Remove obsolete Bhopal n8n webhook if confirmed | Done: disabled in Typeform |
| Initialize private git repo and commit Windmill export | Done: connected to `https://github.com/harshaislive/windmill` |
| Add repeatable local test runner script | Pending |

September 24 Sales Intelligence team-share QA: app version 295 is live with Conversation Priorities and Sales Readiness in one password-protected dashboard. Both tabs display one unconfirmed LinkedIn link per candidate-bearing row and show Jev's selection separately from the top search result. Live browser QA loaded 3,811 open deals and the candidate statuses; backend preview tests passed. The Jev worker now prioritizes ranked prospects and retries transient gateway errors (hash `2991bf733151f1c9`). Eighteen stranded HTTP 503 identities were requeued with exact budget refunds. Full assessment of remaining unscored identities is still running; preserve the unconfirmed labels and monitor until the queue and retries clear. No CRM or outreach write was made.

September 25 member separation and profile-display QA: app ID 21 version 305 is live. Conversation Priorities excludes customer groups and user-confirmed member Anuj Agarwal (`deal_id=8889`, group `2:person-6244`), leaving 696 Mumbai open people and 41 strong-fit there. Beforest fit sheet has 3,810 sales-lane open deals. Members / history has 40 deals from Mumbai, Hammiyala and Poomaale 2.0: 39 won plus Anuj, whose Pipedrive record remains open. Saved research is retained. Both sales lists show at most one highest-scoring Jev LinkedIn candidate when its score is at least 50%; otherwise `No credible Jev match`. This is an unconfirmed suggestion, not a verified identity. Browser QA confirmed Tejas Baldev 51%, Anuj's no-match state, all 40 member rows, and daily-code access; backend tests and live policy check passed. Remaining gap: the 39 won deals were not part of the open-deal fit/TinyFish/Jev workers, so they show `Not assessed`/`Not searched`. A separate, budgeted historical validation run is needed before claiming member-enrichment reliability. No Pipedrive, Zoho or outreach writes.

September 24 Beforest-fit correction QA: raw app ID 21/version 299 is live with fit/capacity categories and saved CRM source excerpts on both tabs. Local bundle and backend previews passed; server read-back confirmed password checks, sandbox and anonymous execution. The open-deal Jev backfill uses Vercel AI Gateway and is still incomplete. Sample audit caught generic nature/community form answers in the strong category. The importer now downgrades strong to plausible unless its source records a concrete step; live reimport reduced strong from 522 to 125 across 2,643 assessed open deals, with 1,168 pending at that checkpoint. Grouped Conversation Priorities was synced from the corrected deal rows. Dashboard copy now distinguishes pending from missing evidence. Capacity remains unknown for nearly all records; unconfirmed search profiles and MCA were excluded. Do not distribute as a final calling list until the backfill, final category/source audit, and handoff update are complete. Contact verification still uses the historical call-readiness Jev path and does not rerun new fit/capacity.

September 24 field/filter audit: final Jev fit import completed for all 3,811 open deals and all 3,185 grouped open interests, with no unsupported fit source or refunded transaction passing the guard. Final categories: 177 strong, 2,677 plausible, 954 research first, two weak, one incompatible; capacity 3,785 unknown, 25 professional clue, one recorded transaction. A live data audit found 2,922 CRM emails and 2,925 CRM phones on file, but provider check status on only 20 deals (19 complete/partial). The combined Contact check filter was misleading: missing CRM values could not be selected, and email/phone outcomes were conflated. It was replaced with separate Email and Phone filters; missing, on file and unchecked counts were independently verified (email missing 889, phone missing 886, email/phone unchecked 3,791). Jev candidate filter now separates 100 suggested URLs from 1,861 uncertain cases, with 1,246 no usable candidate and 604 not searched. Table rows no longer link an unpinned first search result. An audit matrix covered fit, capacity, profile, email, phone, candidate, pipeline, deal status, search, and combined filters; first-tab fit/rank/research/candidate filters were also checked. Use latest deployed app read-back and browser refresh for release verification. Contact verification remains manual per deal and does not rerun the new fit verdict.

Final source read-back: raw app ID 21/version 301 retained server-side password guards, sandbox and anonymous execution. The local frontend bundle passed. Live backend filter matrices and saved-fit audit passed after deployment. The user's already-open browser tab may keep the prior iframe bundle until refresh; reenter the team password after refreshing if prompted. The public page was not refreshed by Codex to avoid interrupting the user's open session.

September 24 rubric correction after Harsha's review: the old `sales_ready` definition required a recent explicit call request and did not classify Beforest fit or purchasing-capacity evidence. Source audit: 3,811 open deals, only 89 with a cited source in the preceding 30 days and 35 with a call next step. Of 28 Top 10% open deals, 23 have TinyFish search candidates but zero Jev-selected profiles and zero verified professional profiles. Across all groups, only 73 have professional profile context and 804 have unconfirmed public-page excerpts. Do not infer personal affordability from an unverified job title or company financials. App version 297 relabels the strict metric as `Recent explicit call request`, adds a 28-deal Top priority review card and dated next steps, says capacity is unassessed, and labels search result #1 as unpinned. Server tests returned 3,811 rows, 28 top-band open deals, and 19 completed contact checks; sandbox/password policy preserved. A short capped pilot checked eight additional top-band deals after the initial 11, then was stopped when Harsha corrected the objective. One interrupted job was marked needs-attention and its stale Treg lease released after verifying no active verification job. Treg budget used 1,132,320 micro of 8,900,000; no CRM writes or outreach. Next: design a separate evidence-backed Beforest fit and capacity-signal assessment, match identities before using LinkedIn/MCA data, and confirm MCA data access/cost before bulk use.
# 25 September 2026 — sales intelligence dashboard access

- Compact dashboard design: raw app `f/sales_intelligence/dashboard` (ID 21) version 311 is live. Conversation priorities now uses a dense neutral table, short evidence and LinkedIn cells, separate Fit and Capacity columns, and a compact fit filter. The fit and member views share the same pastel/charcoal theme. CSS references Inter and ABC Arizona Flare from `10percent.beforest.co`; embedded font copies provide fallback because the font CDN response lacks cross-origin headers. Bundle, live policy check, and browser read-back of all three tabs passed. No deal assessments, contact checks, or CRM records changed.

- Raw app `f/sales_intelligence/dashboard` (ID 21) deployed as version 302. All five backend routes now accept only the current Asia/Kolkata date in `DDMMYYYY` format; checks are computed on each request, so no midnight schedule is needed. The frontend relocks an open tab after the date changes (within 15 seconds or on focus). A backend preview accepted today's code and rejected yesterday's and malformed codes on all five routes; a boundary test confirmed the change at midnight IST. Live app source read-back confirmed the guards and preserved `sandbox=true` and anonymous execution. The former password variable is unused. This code scheme is predictable; restrict the public link to the intended team.


30 September Mumbai nurture mutation QA: live tracker append and exact cleanup PASSED; original79rows unchanged. ActualLeadcreationblockedHTTP400INVALID_DATA Layout: BeforestLeadLayout visiblefalse/adminonly, RakeshStandard. StandardlayoutlacksCollectiveName, nofallback. Admissionnow requiresreviewedExplorationLink HTTPS. No createdCRMLead/no prospectemail. InternalfailedtestfixtureSuppressed. Awaitadminlayoutprofileassignment+HarshaURLbeforeboundedcreationQA.


## 30 September — queued rollout and hourly layout gate
Harsha approved https://beforest.co/the-mumbai-collective/ for Exploration_Link and explicitly requested queueing while the administrator fixes layout access, with hourly permission checks. The namespaced Windmill URL variable is deployed. check_mumbai_layout_gate runs at minute00 everyhour in Asia/Kolkata, enabled, and only reads CRM/records local gate status; it creates no CRM records, writes no Sheets and sends no email. Initial live result: configuredBeforestlayoutactive butvisiblefalse, QUEUED_WAITING_LAYOUT_ACCESS, approved_pending0,deliveryfalse. Three preexisting intake/delivery schedules remaindisabled. Admission now checks the selected layout's live visibility before CREATE and holds without changing layout or issuing a rejected POST. Once an administrator enables access, the hourly check automatically detects availability; actual admission remains subject to recipient review, and delivery to final launch approval. Failed/uncertain internal attempts are never automatically retried.

## 30 September — read-only Mumbai tracker app preparation
Harsha requested a quick Windmill tracker app. Folder f/old_leads_churn carries prior authorization. Deployed read_mumbai_nurture_dashboard read-only data script; live result verified221sent/4today/0pending, layoutunavailable and1622queue rows. Frontend draft data/tracking/mumbai_tracker_app_draft/App.tsx and index.css bundle passed. Uses searchable/paginated recipients, owner/batch/state filters, E01/E02/E03counts, nextdue, reply/hold events and limits; internal QA labels are explicit. No CRM/Sheets/mail mutations. Raw app scaffolding/deployment pending user wmill app new step required by AGENTS.md; async request sent. Do not claim app deployed or fabricate app URL.

## 30 September — Mumbai tracker dashboard deployed
Harsha explicitly requested dashboard deployment and confirmed database tracking without new Zoho Lead creation. Root scaffolded/deployed private raw app f/old_leads_churn/mumbai_nurture_tracker (appID22) using existingfolderauthorization. App references only read_mumbai_nurture_dashboard, with publisher execution and login required. UI has verified sends today/total, enrollment, due, replies, pending sends, sixstep counts, owner/batch/state/search filters, pagination and minute refresh. Backend only reads queue/journal and exactLeadID+email-matched names from HarshaMaton Sheets; no CRM write, Sheet write or email send. Live browser loaded4today/221total/79enrolled/0uncertain and originalsequence48h/caps40/10. Sourcequeue is separate from approvednurture. InternalQA excluded from replycount and labelled in events. Newprospect database-only workflow change is owned by existing Windmill chat; root did not assert SMTP newrecipient release tested. Build/lint passed and scopedapp push succeeded. URL https://flows.ops.beforest.co/apps/get/f/old_leads_churn/mumbai_nurture_tracker?workspace=beforest-automations

## Latest authorized single WhatsApp resend — 12 October 2026

Harsha explicitly requested a fresh single resend to 919573020839 after confirming the previous four-recipient batch did not arrive, while the earlier first test to 918374283166 did arrive. New batch first-call-single-retry-20261012-9573020839-01; job 01a13032-99ad-cd33-d2b6-6dba17a9c2f7. Template 1 with there / The Mumbai Collective and unique Flow token. HTTP200 PROVIDER_ACCEPTED at 12 October 2026 18:29:46 IST, unique wamid; independent completed-job readback verified. Delivery unconfirmed. Only one recipient, no automatic retry or other outreach. Evidence: whatsapp-single-retry-9573020839-job.json.

## Latest authorized single WhatsApp resend — 18:31 IST, 12 October 2026

Harsha confirms the 18:29 IST single resend to 919573020839 did not arrive, then explicitly authorized one fresh test to 918374283166. New batch first-call-single-retry-20261012-8374283166-01, job 01a13034-071a-8346-3d59-621c05193fbb. Template 1, variables there / The Mumbai Collective. HTTP200 PROVIDER_ACCEPTED at 12 October 2026 18:31:20 IST, unique wamid; independent completed-job readback verified. Delivery remains unconfirmed. No other recipients or schedules, Sheet/CRM changes. Evidence: whatsapp-single-retry-8374283166-job.json.

## Harish internal email test — 12 October 2026

Harsha authorized one email test from harish@beforest.co to harsha@beforest.co. Existing f/old_leads_churn/harish_gmail_app_password authenticated via Gmail SMTP STARTTLS; preview-only f/sales_tracker/test_harish_email.ts claimed durable sales_tracker_email_tests key harish-harsha-email-test-20261012-01 before send. Subject Beforest | Windmill email test, short receipt-confirmation copy. SMTP accepted at 12 October 2026 18:35:54 IST and exact Message-ID verified read-only in Harish Sent Mail UID246. Job 01a13038-2e4d-fc59-ae87-71cdfeaa64cb independently read back. Recipient inbox arrival not independently verified. Credentials unexposed, no queues, schedules, CRM or Sheet changes. Evidence: data/tracking/collective-master-tracker-20261012/harish-email-test-job.json. No automatic resend.

## Post-payment test — 13 October 2026, 11:45 AM IST
- Fresh Meta billing UI confirmed payment method present on exact sending WABA 1655245455970812.
- Harsha explicitly authorized one message #1 to 918374283166.
- Windmill preview job 01a133e6-6037-0111-c11d-7a7fa4fc1450 sent only that recipient from +918977945351.
- Meta HTTP 200, PROVIDER_ACCEPTED; message ID wamid.HBgMOTE4Mzc0MjgzMTY2FQIAERgSQzk3NkUyQzk2RDdBNDAwRkY5AA==.
- Payload, HTTP status, request/trace IDs, timestamps and response persisted in sales_tracker_whatsapp_test_attempts and whatsapp-post-payment-result.json.
- Delivery remains unverified; messages webhook setup remains outstanding. No prospect campaign enabled or Sheets changed.

## Direct Meta webhook setup — 13 October 2026
- Harsha authorized adding a Windmill webhook after both post-payment tests failed to arrive.
- Created f/sales_tracker/meta_whatsapp_webhook via Windmill API, deployed hash 44f6f07f4d6ad6bc; dependency lock read-back ready.
- Created encrypted verification variable and live GET route https://flows.ops.beforest.co/api/r/sales-tracker/meta/whatsapp.
- Verification test returned exact challenge with HTTP200; wrong token returned HTTP403. Proof: meta-webhook-verification-proof.json.
- Receiver source implements HMAC-SHA256 verification of original raw body, exact sender/WABA allowlists, durable event deduplication, status/error/inbound/Flow logging. It sends no messages and writes no Sheet/CRM data.
- POST signature resource and route prepared locally but not deployed: Meta App Secret not available in Windmill or requested desktop file. Waiting on Harsha to save existing app secret for app753047219826746 into whatsapp-meta-app-secret.txt; never reuse WhatsApp access token as HMAC key.
- Meta callback, messages subscription and WABA app subscription remain unconfigured. Do not describe webhook as fully live until signed-event rejection/acceptance, Meta verification, subscription readback and actual callback capture pass.

## Meta webhook connected and live capture verified — 13 October 2026
- Stored Harsha-supplied existing Meta App Secret as encrypted f/sales_tracker/meta_webhook_app_secret; never printed or committed the value.
- Created dedicated Meta signature_auth resource and signed synchronous POST route. Unsigned request rejected HTTP400 by native auth; valid signed empty event acknowledged HTTP200 EVENT_RECEIVED.
- Meta app753047219826746 subscriptions read-back: whatsapp_business_account, callback https://flows.ops.beforest.co/api/r/sales-tracker/meta/whatsapp, active=true, messages v21.0 only.
- WABA1655245455970812 subscribed_apps read-back includes WA Message To Leads753047219826746; existing Business Agent subscription preserved.
- Harsha sent inbound "webhook test" from918374283166. Captured 2026-10-13T06:45:49.588568Z (12:15:49 PM IST), Windmill job01a13402-9f64-9e5d-d057-2368b8f0da7d. Durable sales_tracker_meta_whatsapp_events row verified with exact message text and wamid.
- Receiver records statuses, errors, inbound messages and Flow response payloads with deduplication; readonly reader joins outgoing statuses to test journal by wamid.
- Live inbound capture verified; outgoing delivery/failure status has not yet been observed. Do not infer historical failure codes or delivery from this inbound test. No outgoing send or automated response, Sheet write, CRM creation, or prospect schedule enabled.
- Proof: meta-webhook-signature-proof.json, meta-app-subscriptions-after.json, meta-waba-subscriptions-after-webhook.json, meta-whatsapp-events-current.json. Preview-only read_meta_whatsapp_events.ts provides internal event readback.

## Confirmed outbound failure — 13 October 2026, 12:18:54 PM IST
- Harsha authorized one template #1 test to918374283166 with webhook observation.
- Sendjob01a13405-66cc-527e-8e4b-c4095655537e returned HTTP200 accepted at06:48:52.916Z.
- Signed Meta webhookjob01a13405-70f0-7159-206e-b694724ffa4f captured matching wamid.HBgMOTE4Mzc0MjgzMTY2FQIAERgSMDQ3Rjg2RDYxMDQzQ0E2RTgxAA== at06:48:54.325984Z.
- Provider status FAILED; error131042, Business eligibility payment issue. Exact details: Message failed to send because there were one or more errors related to your payment method.
- This is now confirmed payment failure for this exact attempt, not a payload/token/recipient diagnosis. Prior accepted-only attempts retain their original evidence; do not retroactively invent failure events.
- Fresh selected WhatsApp Payment methods page forWABA1655245455970812 shows No payment methods added, conflicting with earlier Accounts summary displaying Visa0135. Account billing activation/association remains unresolved; no financial changes performed.
- Send proof whatsapp-webhook-diagnosis-send-result.json; correlated failure proof meta-whatsapp-events-current.json. No additional sends attempted.
- Further billing readback: account-specific Payment settings confirms Visa0135 present. Transaction history has a ₹3.00 Paid Visa0135 entry and a corresponding Processing refund entry; an earlier card7006 entry Failed. The generic Payment methods view said none, so do not assert card absent. No explicit restriction/activation message is shown on account details. Saved card does not yet establish sending eligibility: exact attempt still failed131042. Next action is billing eligibility resolution/Meta support if persistent, not blind repeat sends or duplicate card setup.

## Kapso credential and account verified — 13 October 2026
- Harsha ran local key helper. Windmill f/sales_tracker/kapso_api_key exists and is_secret=true; Windows-encrypted local copy exists. No secret printed.
- Authenticated GET Kapso /platform/v1/whatsapp/phone_numbers returned200.
- Sender+918977945351 is VERIFIED and CONNECTED, phoneID1442794468912067, WABA1463107219009320, dedicated Cloud API (is_coexistence=false), display name PENDING_REVIEW, quality GREEN.
- New Kapso identity replaces previously inspected pending/removed sender identities for future preparation. Do not reuse old phoneIDs/WABA/Flow/template IDs without verifying them in this account.
- Existing Windmill sends and Meta callback were not retargeted. Templates, billing readiness, Kapso-to-Windmill callbacks and a controlled delivery test still require verification/setup. No messages sent.
- Proof kapso-phone-inventory.json.

## Three first-call templates recreated in Kapso-connected account — 13 October 2026
- User authorized recreating yesterday's three templates. WABA1463107219009320 preflight contained hello_test only; no matching templates/Flows.
- Created picker Flow2046533519395088 via Kapso, no validation errors. Kapso Flow-ID read/publish routes returned404 configuration not found; used existing authorized Meta token to read and publish exact existing draft directly. Verified PUBLISHED with empty validation_errors; no duplicate Flow created.
- Same 19 time choices10AM–7PMIST, preferred date/time requiring human confirmation; min-date updated from12Oct to13Oct2026. Static minimum requires maintenance if reused later.
- Created templates via Kapso: beforest_first_call_01 ID1434766811954300; _02 ID1825207522139981; _03 ID1874283313933410. All en_US MARKETING, initially PENDING. Live readback verified exact body copy and new Flow reference.
- Proof kapso-first-call-templates-readback.json and kapso-call-flow-published.json; per-request bodies/responses preserved. Old templates/Flow remain untouched. No sends, Sheets writes or outreach schedules enabled.

## Direct-call option added to WhatsApp #2 and #3 — 13 October 2026
- Harsha authorized adding: Or call us directly on +91 89779 45351 between 9 AM and 9 PM IST.
- Updated existing Kapso WABA1463107219009320 templates via hsm_id, retaining names/IDs and Choose call time Flow2046533519395088. Exact live copy read-back passed.
- Template01 remains APPROVED and wording unchanged. Updated02 ID1825207522139981 and03 ID1874283313933410 are PENDING review.
- Prepared Templates!A2:G4 synchronization with revised WhatsApp copy, current template IDs/statuses/new Flow ID. Exact Maton write approval requested; Sheet not yet changed. Email rows unchanged; no sends.
- Proof kapso-updated-first-call-templates-readback.json and kapso-template-sheet-sync-request.json.

- Approved Kapso template Sheet sync applied 13 October 2026 through harsha Maton connection. Templates!A2:G4 (21 cells) exact read-back verified against approved request. #2/#3 include direct-call number/time; all three rows use current Kapso template IDs and Flow2046533519395088. Status snapshot #1APPROVED/#2PENDING/#3PENDING. Proof kapso-template-sheet-sync-proof.json. No outreach sent.

## Kapso first-template two-recipient test delivered — 13 October 2026, 3:32 PM IST
- Harsha explicitly authorized one template01 test each to919573020839 and918374283166.
- Preview-only Windmill test_first_call_whatsapp_kapso_two.ts uses encrypted Kapso variable, current phone1442794468912067/WABA1463107219009320/template1434766811954300/Flow2046533519395088. Exact template approval/published Flow preflight; fixed allowlist, durable journal, no auto retry.
- Initial preflight blocked before sends because Kapso returns flow_id numerically. Normalized toString while retaining exact-ID check; no duplicate requests.
- Sendjob01a134b6-b61f-cb0c-bd74-c020ef1ec22f returned HTTP200 with two wamids, payloads/time/requestIDs saved in sales_tracker_whatsapp_test_attempts.
- Fresh Kapso message history matched exact two wamids: 919573020839 statusREAD; 918374283166 statusDELIVERED. Delivery verified through Kapso provider history, not merely acceptance or user report.
- Proof kapso-two-test-send-result.json and kapso-two-test-delivery-readback.json. No Sheet/CRM changes or prospect schedule enabled; Kapso events forwarding to Windmill remains separate outstanding setup.

## Call preference captured through Kapso — 13 October 2026
- Harsha reported submitting the picker. Fresh authenticated inbound message history confirms Flow nfm_reply from918374283166.
- preferred_date2026-10-14, preferred_time14:30, timezoneAsia/Kolkata; preference14October2026 2:30PMIST.
- context.id matches exact outgoing two-recipient test wamid; flow_token matches first-call-kapso-two-test-20261013-01:918374283166:beforest_first_call_01. End-to-end test correlation verified.
- Kapso response saved in kapso-call-preferences-readback.json. This is preferred time, not confirmed meeting booking; no calendar/Sheet/CRM updates or automatic replies performed. Continuous Kapso-to-Windmill/Sheet preference synchronization still outstanding.
