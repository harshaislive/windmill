# 02 Automation Reference

This is the detailed reference for live Windmill items. Paths are written exactly as they appear in Windmill/local export.

## HTTP Triggers

| Number | Windmill path | Public URL suffix | Target | Auth | Purpose |
| --- | --- | --- | --- | --- | --- |
| 01A | `f/sales/typeform_to_pipedrive_intake` | `/api/r/typeform/pipedrive/intake` | Script `f/sales/typeform_to_pipedrive_intake` | None | Receives Typeform submissions. |
| 02A | `f/sales/pipedrive_1on1_tbc_to_calendar_prebook` | `/api/r/pipedrive/1on1/tbc/prebook` | Script `f/sales/pipedrive_1on1_tbc_to_calendar_prebook` | None | Receives Pipedrive deal-change webhook for 1on1 TBC deals. |
| 04A | `f/sales/calendly_webinar_to_pipedrive_activity` | `/api/r/calendly/webinar/pipedrive/activity` | Flow `f/sales/calendly_webinar_to_pipedrive_activity` | None | Receives Calendly webinar invitee.created webhook. |
| 05A | `f/sales/interakt_whatsapp_inbound` | `/api/r/interakt/whatsapp/inbound` | Flow `f/sales/interakt_whatsapp_inbound` | Signature | Receives Interakt WhatsApp inbound button/message callbacks. |

Full URLs use host `https://windmill.devsharsha.live`.

## Scheduled Jobs

| Number | Path | Cron | Enabled | Purpose |
| --- | --- | --- | --- | --- |
| 06B | `f/sales/send_1on1_reminders` | `0 */15 * * * *` | Yes | Every 15 minutes, sends due 1on1 reminders. |
| 07B | `f/sales/send_owner_attendance_checks` | `0 */30 * * * *` | Yes | Every 30 minutes, asks owners if completed 1on1s were attended. |
| 08Z | `f/sales/send_webinar_reminders` | `0 */15 * * * *` | No | Disabled fallback webinar reminder poller. Webinar reminders are one-off jobs now. |
| 09B | `f/collectives/zoom_collective_to_pipedrive` | `0 0 */3 * * *` | Yes | Every 3 hours, syncs Zoom intro registrants into Pipedrive. |

All schedules use `Asia/Kolkata`.

## Scripts And Flows

| Number | Path | Type | Called by | Main action |
| --- | --- | --- | --- | --- |
| 01B | `f/sales/typeform_to_pipedrive_intake` | Script | 01A | Parses Typeform, maps fields, creates/updates Pipedrive person/deal, runs fit routing, logs audit/manual-review activities. |
| 02B | `f/sales/pipedrive_1on1_tbc_to_calendar_prebook` | Script | 02A | Checks eligibility, then calls 03A. |
| 03A | `f/sales/calendar_prebook_1on1` | Script | 02B or manual dry-run | Finds slot, creates calendar event, writes meeting fields, sends prebook WhatsApp, logs Pipedrive activities. |
| 04B | `f/sales/calendly_webinar_to_pipedrive_activity` | Flow | 04A | Waits 5 seconds, then calls 04C. |
| 04C | `f/sales/create_webinar_activity_from_calendly` | Script | 04B | Registers Calendly invitee into Zoom, creates/updates Pipedrive webinar activity, sends confirmation, schedules reminders. |
| 05B | `f/sales/interakt_whatsapp_inbound` | Flow | 05A | Routes inbound Interakt events by button text/callback data. |
| 05C | `f/sales/interakt_whatsapp_inbound_router` | Script | 05B | Parses inbound payload and classifies action. |
| 05D | `f/sales/interakt_reschedule_requested_worker` | Script | 05B | Handles Reschedule Call. |
| 05E | `f/sales/interakt_attendance_confirmed_worker` | Script | 05B | Handles lead Confirm Attendance. |
| 05F | `f/sales/interakt_owner_attended_worker` | Script | 05B | Handles owner Attended. |
| 05G | `f/sales/interakt_owner_no_show_worker` | Script | 05B | Handles owner Not Attended. |
| 05Z | `f/sales/interakt_ignored_message_worker` | Script | 05B | Safely ignores unknown inbound WhatsApp messages. |
| 06A | `f/sales/send_1on1_reminders` | Script | 06B | Sends 1on1 reminder templates and logs done admin activities. |
| 07A | `f/sales/send_owner_attendance_checks` | Script | 07B | Sends owner attendance check and logs done admin activity. |
| 08A | `f/sales/send_webinar_reminders` | Script | One-off jobs from 04C | Sends webinar reminder templates and logs done admin activities. |
| 09A | `f/collectives/zoom_collective_to_pipedrive` | Script | 09B | Syncs Zoom collective intro registrants to Pipedrive. |
| QA | `f/sales/calendar_prebook_1on1_smoke_test` | Script | Manual only | Checks Google Calendar service-account access. |

## Typeform Intake Logic

The Typeform worker recognizes four in-use collective forms:

| Collective | Owner | Pipeline | Webinar stage | 1on1 fit stage |
| --- | --- | --- | --- | --- |
| Bhopal | Vivekanand | `4` | Lead_In | Initial Event Scheduled |
| Mumbai | Vivekanand | `2` | Lead_In | Initial Event Scheduled |
| Hammiyala | Sai Rakesh | `1` | Lead_In | Initial Event Scheduled |
| Poomaale 2.0 | Sai Rakesh | `3` | Lead_In | Initial Event Scheduled |

Business rules:

- Webinar route gets label `111` Scheduled Webinar Pending.
- 1on1 fit route gets label `115` 1on1 TBC and remains in Initial Event Scheduled stage.
- 1on1 unfit route moves to Lead_In and gets webinar-awaiting label.
- Azure/OpenAI fallback creates an open manual-review activity owned by Beforest Admin.

## 1on1 Calendar Rules

Default duration: 30 minutes.

Timezone: Asia/Kolkata.

Owner slot windows: 1 PM to 6 PM IST, unless updated in Windmill variables.

Event title patterns:

- Rakesh/Sai: `Beforest Collectives 1-1 with Sai Rakesh`
- Vivek: `1on1 call with {deal title} | {deal ID}`

The final event is always created in Google Calendar, even when Vivek availability is sourced from Calendly.

## Webinar Rules

Calendly main account sends `invitee.created` events to Windmill.

The webinar worker:

- Detects collective from Calendly event name.
- Matches the nearest Zoom webinar by collective name and start time.
- Registers the invitee into Zoom unless already registered.
- Writes Zoom join URL to Pipedrive Meeting URL.
- Writes Zoom registration id/reference to Pipedrive Meeting Reference ID.
- Creates/updates the open webinar activity in Pipedrive.
- Sends webinar confirmation WhatsApp.
- Schedules one-off reminder jobs.

Supported collectives today:

- Bhopal
- Mumbai
- Hammiyala
- Poomaale 2.0

Hyderabad needs mapping before it should be routed into this worker.

