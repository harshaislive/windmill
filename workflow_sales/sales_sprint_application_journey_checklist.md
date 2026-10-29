# Sales Sprint Implementation Checklist

**Owners:** Harsha, Sai Rakesh V, Harish, deal owners, BI  
**Scope:** Beforest collective application journey, CRM follow-up, historical lead profiling, and LinkedIn planning  
**Collectives:** Bhopal, Mumbai, Hammiyala, Poomaale 2.0, Hyderabad  
**Execution rule:** Complete and verify one phase before starting the next. No live write or send without the relevant review/approval gate.

## Status Legend

- [x] Confirmed completed
- [ ] Not started
- [ ] **REVIEW GATE** Approval required before live changes

## Phase 0 — Confirmed Completed

- [x] Add the Current City question to all five primary collective Typeforms.
- [x] Map Current City into the Pipedrive deal field through the Windmill intake.
- [x] Update the revised pricing and offerings in the collective Typeforms.
- [x] Update the revised pricing and offerings on the collective landing pages.
- [x] Add/version the corresponding Pipedrive products and update prospective Windmill product mapping.
- [ ] Run a final read-only consistency audit of the completed city and pricing work.
- [ ] Verify recent submissions carry Current City and the correct prospective product/price into Pipedrive.

## Phase 1 — Premium Application Journey Copy

- [x] Create one premium master narrative that frames `Request an Invite` as an application.
- [x] Define the four-step journey consistently:
  - [x] Application
  - [x] Review
  - [x] 1-on-1 in-person conversation
  - [x] Closure and next steps
- [x] Produce a compact landing-page version.
- [x] Produce a shorter Typeform welcome-screen version.
- [x] Produce collective-specific variations where necessary.
- [x] Check tone, claims, spelling, pricing references, mobile length, and call-to-action consistency.
- [x] Save the review copy pack at `workflow_sales/copy_proposals/2026-08-28-collective-application-journey-copy-for-review.md`.
- [ ] **REVIEW GATE:** Harsha approves the master and collective-specific copy.

## Phase 2 — Website Journey Presentation

- [x] Prepare local process-modal previews for Mumbai, Hammiyala, and Poomaale 2.0 under `lp_28aug/`; no live publication.
- [x] Verify the local modal at desktop and mobile sizes for all three collectives.
- [x] Verify the inner application button retains the correct Typeform ID, collective hidden field, and time-spent attribution.
- [ ] Back up/export the current live landing-page implementations.
- [ ] Add the approved journey block immediately above each Typeform button/embed.
- [ ] Update the available HTML implementations for:
  - [ ] Bhopal
  - [ ] Mumbai
  - [ ] Hammiyala / Co-Forest
- [ ] Prepare and apply BeBuilder blocks for:
  - [ ] Poomaale 2.0
  - [ ] Hyderabad
- [ ] Verify desktop and mobile rendering on all five public URLs.
- [ ] Verify every Typeform button/embed still opens the correct form.
- [ ] Confirm no analytics, embed signal, pricing, layout, or qualification behavior was disturbed.
- [ ] **REVIEW GATE:** Harsha approves the page previews before publication where a live write is still pending.

## Phase 3 — Typeform Welcome Screens

- [ ] Export and retain backups of all five live Typeform schemas.
- [ ] Update only the welcome/start screen with the approved application journey copy.
- [ ] Do not change question order, required settings, field refs, logic jumps, endings, webhooks, or qualification routing.
- [ ] Verify the welcome screen and Start/Application button on desktop and mobile.
- [ ] Re-read each live schema after the update and compare its logic with the backup.
- [ ] Submit controlled tests for all five forms and verify the existing Windmill/Pipedrive behavior remains intact.
- [ ] **REVIEW GATE:** Review the read-back and test evidence before closing this phase.

## Phase 4 — Application Confirmation Email

- [ ] Confirm whether the current Mailchimp account includes Mailchimp Transactional.
- [ ] Confirm the applicant-consent rule for operational acknowledgement emails.
- [ ] Finalise the premium application-received email template.
- [ ] Include the collective name, four-step journey, expected response time, and next step.
- [ ] Resolve the reply-to address dynamically from the Pipedrive deal owner.
- [ ] Choose the delivery design:
  - [ ] Preferred: Mailchimp Transactional called by Windmill.
  - [ ] Alternative: owner-specific Mailchimp Customer Journeys for consented subscribers.
- [ ] Add a dedicated Windmill worker triggered only after completed Typeform intake succeeds.
- [ ] Add deterministic idempotency using the Typeform response token and a Pipedrive audit activity.
- [ ] Add structured, secret-safe success/failure logging.
- [ ] Add dry-run and test-recipient support.
- [ ] Test one controlled submission per owner/collective route without contacting a real prospect.
- [ ] Verify Mailchimp delivery/read-back and the Pipedrive activity.
- [ ] **REVIEW GATE:** Harsha approves the template and test before enabling live delivery.

## Phase 5 — Manual Qualified-Prospect Availability Request

- [ ] Approve the manual Pipedrive command label name: `Send 1on1 availability request`.
- [ ] Approve the completion label name: `1on1 availability requested`.
- [ ] Finalise the premium email asking for preferred meeting dates/times and meeting location/city.
- [ ] Confirm deal owners own replies and subsequent scheduling.
- [ ] Configure a narrow Pipedrive deal-change webhook trigger.
- [ ] Add a Windmill worker that reacts only to the command-label transition.
- [ ] Verify the deal is eligible and has a valid owner/contact before sending.
- [ ] Set reply-to to the current deal owner.
- [ ] Prevent duplicates using the command transition and a Pipedrive audit activity.
- [ ] Replace the command label only after confirmed send success.
- [ ] Create a visible manual-action activity when delivery fails.
- [ ] Document a one-line sales instruction: apply the command label only after reviewing the prospect.
- [ ] Test with a controlled deal and verify the email, labels, activity, and reply-to behavior.
- [ ] **REVIEW GATE:** Harsha approves the controlled test before live enablement.

## Phase 6 — Cross-System Consistency Audit

- [ ] Establish the current Typeform/Windmill qualification route as the canonical qualification source.
- [ ] Keep original intake route, revised-price fit, persona fit, and current CRM state as separate dimensions.
- [ ] Build a comparison matrix for:
  - [ ] Website language and journey
  - [ ] Typeform wording, order, pricing, refs, and branching
  - [ ] Windmill form IDs, qualification logic, and product mapping
  - [ ] Pipedrive pipelines, stages, labels, products, fields, and owners
  - [ ] Mailchimp templates, consent, collective names, and owner reply-to
  - [ ] Sales-team documentation and instructions
- [ ] Record mismatches with evidence and severity.
- [ ] Correct only approved mismatches through narrowly scoped changes.
- [ ] Re-run the matrix and retain final verification evidence.

## Phase 7 — Historical Initial Event Scheduled Lead Extraction

**Included:** Mumbai, Hammiyala, Poomaale 2.0, Hyderabad  
**Excluded:** Bhopal  
**Time scope:** All history since Pipedrive started  
**Deal scope:** Open, won, and lost deals that ever entered `Initial Event Scheduled`

- [ ] Read the live Pipedrive pipelines/stages and confirm the exact stage IDs per collective.
- [ ] Use deal flow/history to identify deals that ever entered the stage; do not rely on current stage alone.
- [ ] Fetch the complete scoped deal set with token-efficient pagination and caching.
- [ ] Save a timestamped local source export for audit/restart purposes.
- [ ] Include all relevant deal custom fields, person/organisation context, owner, status, products, price, activities, notes, and Typeform question-answer evidence.
- [ ] Deduplicate people/deals without deleting source records.
- [ ] Reconcile the extracted count independently before enrichment.
- [ ] Produce counts by collective, owner, current status, and current stage.

## Phase 8 — Qualification, Price, Persona, and LinkedIn Enrichment

- [ ] Agree the revised target-persona rubric before scoring.
- [ ] Preserve the original Typeform qualification route separately.
- [ ] Calculate revised-price fit from recorded answers/products without rewriting historical deals.
- [ ] Recheck the live Maton LinkedIn connection and its current permissions.
- [ ] Use existing verified LinkedIn URLs first.
- [ ] Resolve missing profiles using name, company, role, city, and other permitted evidence.
- [ ] Never guess an ambiguous LinkedIn match; mark it `Needs manual verification`.
- [ ] Capture permitted enrichment fields:
  - [ ] LinkedIn profile URL
  - [ ] Current role and organisation
  - [ ] Seniority/function
  - [ ] Current location
  - [ ] Founder/leadership indicators
  - [ ] Persona-fit signals
- [ ] Assign separate ratings for:
  - [ ] Qualification
  - [ ] Revised-price fit
  - [ ] Persona fit
  - [ ] Identity/data confidence
- [ ] Add evidence-based reasons and a recommended next action.
- [ ] Manually review high-value and ambiguous profiles before delivery.

## Phase 9 — Google Sheets Delivery

- [ ] Create the final spreadsheet through Maton/API Gateway using `harsha@beforest.co`.
- [ ] Create tabs for:
  - [ ] Executive Summary
  - [ ] All Matching Profiles
  - [ ] Mumbai
  - [ ] Hammiyala
  - [ ] Poomaale 2.0
  - [ ] Hyderabad
  - [ ] Needs Manual Review
  - [ ] Scoring Rubric and Sources
- [ ] Apply filters, frozen headers, readable widths, dropdowns/status fields, and conditional formatting.
- [ ] Keep sensitive internal data access-controlled.
- [ ] Validate totals and sample rows against the local source export.
- [ ] Share with the approved recipients, including Rakesh and Harish.
- [ ] Verify access after sharing.
- [ ] Record the final sheet link in the relevant BI Zoho task after approval.

## Phase 10 — LinkedIn Outreach Decision for Monday

- [ ] Prepare a decision brief; do not launch outreach yet.
- [ ] Define proposed target segments and exclusions.
- [ ] Decide which deal owner/founder/account sends outreach.
- [ ] Compare manual personalised outreach with permitted paid LinkedIn options.
- [ ] Draft connection, first-message, and follow-up copy.
- [ ] Propose a conservative cadence and stop rules.
- [ ] Define Pipedrive logging and owner handoff.
- [ ] Define success as qualified conversations, not raw connections/messages.
- [ ] Document LinkedIn permission, privacy, consent, and brand-safety constraints.
- [ ] Monday discussion produces a go/no-go decision and, if approved, a small pilot specification.

## Documentation and Rollback Requirements

- [ ] Update `workflow_sales/Windmill Sales Automation QA and Backlog.md` for every sales-automation change.
- [ ] Update `workflow_sales/team_handoff/` when live sales-team behavior changes.
- [ ] Write durable decisions/incidents/learnings under `data/learning/` after meaningful implementation.
- [ ] Preserve backups and exact previous Windmill hashes/configuration for rollback.
- [ ] Deploy only exact scoped files/entities.
- [ ] Perform remote read-back after every live change.
- [ ] Do not change campaign optimisation or unrelated sales automations.

## Zoho Projects Tracking — Pending Explicit Dates

- [ ] Create or update a BI task for website/Typeform application journey and confirmation email.
- [ ] Create or update a BI task for historical lead extraction, qualification, LinkedIn enrichment, and Google Sheets delivery.
- [ ] Create or update a BI task for the LinkedIn outreach decision/pilot plan.
- [ ] Obtain explicit start and end dates from Harsha before any Zoho write.
- [ ] Search live Zoho state for duplicates and verify each written task after creation/update.

## Recommended First Work Item

- [ ] Start Phase 1: draft the premium master application-journey copy for Harsha's review.
