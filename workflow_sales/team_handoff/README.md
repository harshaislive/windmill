# Beforest Sales Automations - Team Handoff

Last updated: 2026-08-05, Asia/Kolkata

This folder documents the live Windmill sales automation system for Beforest collectives. It is intended for team members who need to understand what is running, how each external system is connected, and what to do when a deal needs manual review.

Latest infrastructure handoff: [Beforest Automation Domain Migration — 31 August 2026](2026-08-31-beforest-automation-domain-migration-handoff.md)

## Read In This Order

Collective sales master email pilot: [30 sends and call priorities — 12 October 2026](../../data/tracking/collective-master-tracker-20261012/README.md). Mumbai, Hammiyala and Poomaale 2.0 tabs now show newest enquiries first for human calls. Email #1 reached the 10 oldest eligible August entries per tab through sai@beforest.co, with SMTP and Sent-folder proof. #1 sent records the completed send, not confirmed inbox delivery. This pilot does not enable recurring sends or automated follow-ups.

Mumbai churn tracker: [Live campaign progress and replies](mumbai_churn_tracker.md), public link with today's India date as the password in DDMMYYYY format; it changes daily at midnight IST.


Sales intelligence dashboard and Sales Readiness sheet: [How to choose the next conversation](sales_intelligence_dashboard.md). These are snapshot-based owner-review views; they do not send outreach or change the existing funnel.

1. [Current Vivek & Rakesh Sales Flow](current-vivek-rakesh-sales-flow.html) - simplest shareable view of the overall Windmill journey and the two owner-specific stop rules.
2. [Brochure Mermaid Flow](sales_brochure_mermaid_flow.html) - clean sales-team flowchart with exact customer-facing language for Typeform, WhatsApp, brochure, nurture, Pipedrive, and Mailchimp fallback.
3. [Sales Funnel Live Blueprint](sales_funnel_live_blueprint.html) - complete team-share flowchart for Typeform, WhatsApp, brochure, nurture, Pipedrive, and Mailchimp fallback.
4. [Brochure WhatsApp Flow Update](brochure_whatsapp_flow_update.html) - sales-team update for the Typeform-to-WhatsApp brochure flow.
5. [Sales Flow Terminal Flowchart](sales_flow_terminal_flowchart.html) - visual briefing map for sales team onboarding.
6. [01 System Overview](01_system_overview.md) - the business flow from Typeform to Pipedrive, calendars, WhatsApp, Zoom, and reminders.
7. [02 Automation Reference](02_automation_reference.md) - every live Windmill automation, trigger, schedule, and worker.
8. [03 Integration Setup](03_integration_setup.md) - external accounts, webhook URLs, Windmill variables, and credential ownership.
9. [04 Operations Runbook](04_operations_runbook.md) - how to test, monitor, troubleshoot, and safely deploy changes.
10. [05 Pipedrive Activity Audit Standard](05_pipedrive_activity_audit_standard.md) - how Pipedrive activities are used as both operational tasks and automation audit logs.

## Current Source Of Truth

Windmill workspace: `beforest-automations`

Local repo/export root: `D:\AI Apps\windmill`

Main working control sheet: [Windmill Sales Automation QA and Backlog.md](../Windmill%20Sales%20Automation%20QA%20and%20Backlog.md)

## High-Level Status

Live:

- Typeform intake for Bhopal, Mumbai, Hammiyala, Poomaale 2.0, and Hyderabad post-brochure.
- Pipedrive deal/person creation and update.
- Pipedrive product mapping from collective intake, including the prospective all-inclusive pricing launched on 2026-08-24 for Mumbai (`₹8.01 Cr`), Hammiyala Private Estate (`₹3.46 Cr`), Hammiyala Founder's District (`₹3.52 Cr`), and Poomaale 2.0 (`₹3.70 Cr`). Versioned products preserve historical deal pricing; Hyderabad product mapping still waits for a defined product/value.
- AI fit routing for 1on1 requests, with manual-review fallback.
- Collective Journey CTA for leads marked `GIS Awaiting` because they did not answer the why-join question meaningfully or were classified unfit.
- Collective Journey nurture is enabled as a daily schedule: seven alternate-day WhatsApp follow-ups. Bhopal/Mumbai and Vivek-owned Hammiyala continue until a confident Vivek Calendly booking is synced; Rakesh-owned Hammiyala and Poomaale continue until the post-Journey Typeform is submitted.
- Vivek Calendly reconciliation is live for Bhopal pipeline `4`, Mumbai pipeline `2`, and Vivek-owned Hammiyala pipeline `1`, running at 8:37 AM, 11:37 AM, 3:37 PM, and 7:37 PM IST.
- 1on1 team scheduling notice for fit leads, with team members scheduling directly.
- Owner 1on1 touchbase loop after fit-lead scheduling notices: the owner is asked after 24 hours whether the lead has been touched base with; `Yes, touched base` stops the loop, while `No, pending` queues up to two more daily reminders.
- Legacy calendar prebooking tools remain internal but are not called for fit intake leads in the GIS-only funnel.
- Interakt WhatsApp scheduling notice, reschedule, reminders, attendance confirmation, owner attendance check, and no-show rebook flows.
- GIS StoryMap open tracking through Windmill redirect links, with `GIS Opened` updates in Pipedrive.
- Qualified post-brochure Typeform requests update the same Pipedrive deal where possible, then follow the same team-managed 1on1 scheduling path.
- Pipedrive activity audit trail for major automation events.
- Early qualified-1on1 answer signal from the five embedded primary Typeforms to Meta CAPI. It uses the existing branch-destination question, does not send raw answers, and is isolated from Pipedrive/final-submit side effects. Live Test Events verification completed on 2026-08-11; campaign optimisation remains unchanged.

Live in Windmill from 2026-08-05:

- New Hammiyala primary-form deals alternate strictly between Vivek and Rakesh, beginning with Vivek. Existing Hammiyala deals remain with their current owners.
- Vivek-owned Hammiyala deals receive `https://canva.link/vjfj5yn7486ujqb` and stop nurture after a synced `utm_campaign=hammiyala` Calendly booking.
- Rakesh-owned Hammiyala deals receive `https://canva.link/sg93jjmd2i08ji3` and continue using the second Typeform as the nurture stop condition.
- Every downstream brochure, fallback, acknowledgement, and nurture worker reads the current Pipedrive deal owner instead of assuming all Hammiyala deals belong to Rakesh.

Known caveats:

- Typeform, Pipedrive, and Calendly HTTP routes are public except Interakt inbound, which has signature auth. The route logic is guarded, but public endpoint hardening should remain on the backlog.
- Legacy Calendly/Zoom webinar HTTP automation remains disabled for the GIS-only funnel. A contained manual/ops Calendly-to-Zoom registration path can be enabled with `f/sales/calendly_zoom_registration_enabled=true`; it sends confirmation/reminders but does not schedule the old attendance/prebook tail unless explicitly requested.
- Keep the Collective Journey follow-up copy tied to the post-Journey Typeform outcome; do not revert the schedule to an "unopened only" rule unless the sales process changes.
- Bhopal/Mumbai brochures use Vivek's Calendly link with `utm_campaign=bhopal` or `utm_campaign=mumbai`. Vivek-owned Hammiyala uses `utm_campaign=hammiyala`; Rakesh-owned Hammiyala and Poomaale keep the post-brochure Typeform route.
- The local folder is now connected to GitHub at `https://github.com/harshaislive/windmill`; keep committing and pushing documentation/code changes before team handoff.

Direct Meta WhatsApp status/reply webhook: live and inbound-tested on 13 October 2026; see [diagnosis and proof](../../data/tracking/collective-master-tracker-20261012/whatsapp-diagnosis-20261013.md). Incoming events are logged only; no automatic response or outreach is enabled. Outgoing failure cause still awaits a captured status event.
