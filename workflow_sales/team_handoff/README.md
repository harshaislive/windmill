# Beforest Sales Automations - Team Handoff

Last updated: 2026-05-06, Asia/Kolkata

This folder documents the live Windmill sales automation system for Beforest collectives. It is intended for team members who need to understand what is running, how each external system is connected, and what to do when a deal needs manual review.

## Read In This Order

1. [Sales Flow Terminal Flowchart](sales_flow_terminal_flowchart.html) - visual briefing map for sales team onboarding.
2. [01 System Overview](01_system_overview.md) - the business flow from Typeform to Pipedrive, calendars, WhatsApp, Zoom, and reminders.
3. [02 Automation Reference](02_automation_reference.md) - every live Windmill automation, trigger, schedule, and worker.
4. [03 Integration Setup](03_integration_setup.md) - external accounts, webhook URLs, Windmill variables, and credential ownership.
5. [04 Operations Runbook](04_operations_runbook.md) - how to test, monitor, troubleshoot, and safely deploy changes.
6. [05 Pipedrive Activity Audit Standard](05_pipedrive_activity_audit_standard.md) - how Pipedrive activities are used as both operational tasks and automation audit logs.

## Current Source Of Truth

Windmill workspace: `beforest-automations`

Local repo/export root: `D:\AI Apps\windmill`

Main working control sheet: [Windmill Sales Automation QA and Backlog.md](../Windmill%20Sales%20Automation%20QA%20and%20Backlog.md)

## High-Level Status

Live:

- Typeform intake for Bhopal, Mumbai, Hammiyala, and Poomaale 2.0.
- Pipedrive deal/person creation and update.
- AI fit routing for 1on1 requests, with manual-review fallback.
- 1on1 prebooking into owner calendar.
- Vivek slot lookup through Calendly availability, then booking into Google Calendar.
- Rakesh/Sai slot lookup through Google Calendar free/busy, then booking into Google Calendar.
- Interakt WhatsApp prebook, reschedule, reminders, attendance confirmation, owner attendance check, and no-show rebook flows.
- Calendly webinar booking to Zoom registration, Pipedrive webinar activity, webinar confirmation, and one-off webinar reminders.
- Zoom intro registrant sync every 3 hours.
- Pipedrive activity audit trail for major automation events.

Known caveats:

- Typeform, Pipedrive, and Calendly HTTP routes are public except Interakt inbound, which has signature auth. The route logic is guarded, but public endpoint hardening should remain on the backlog.
- Main Calendly still had old n8n user-scope webhooks during the last check. Remove them only after confirming Windmill is the sole source of truth.
- Hyderabad webinar exists in Calendly but is not mapped in the current Windmill webinar worker.
- The local folder is now connected to GitHub at `https://github.com/harshaislive/windmill`; keep committing and pushing documentation/code changes before team handoff.
