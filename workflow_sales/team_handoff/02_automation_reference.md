# 02 Automation Reference

This is the detailed reference for live Windmill items. Paths are written exactly as they appear in Windmill/local export.

## HTTP Triggers

| Number | Windmill path | Public URL suffix | Target | Auth | Purpose |
| --- | --- | --- | --- | --- | --- |
| 01A | `f/sales/typeform_to_pipedrive_intake` | `/api/r/typeform/pipedrive/intake` | Script `f/sales/typeform_to_pipedrive_intake` | None | Receives Typeform submissions. |
| 02A | `f/sales/pipedrive_1on1_tbc_to_calendar_prebook` | `/api/r/pipedrive/1on1/tbc/prebook` | Script `f/sales/pipedrive_1on1_tbc_to_calendar_prebook` | None | Receives Pipedrive deal-change webhook for 1on1 TBC deals. |
| 04A | `f/sales/calendly_webinar_to_pipedrive_activity` | `/api/r/calendly/webinar/pipedrive/activity` | Flow `f/sales/calendly_webinar_to_pipedrive_activity` | None | Disabled legacy Calendly webinar invitee.created webhook route. |
| 05A | `f/sales/interakt_whatsapp_inbound` | `/api/r/interakt/whatsapp/inbound` | Flow `f/sales/interakt_whatsapp_inbound` | Signature | Receives Interakt WhatsApp inbound button/message callbacks. |

Full URLs use host `https://windmill.devsharsha.live`.

## Scheduled Jobs

| Number | Path | Cron | Enabled | Purpose |
| --- | --- | --- | --- | --- |
| 06B | `f/sales/send_1on1_reminders` | `0 */15 * * * *` | Yes | Every 15 minutes, sends due 1on1 reminders. |
| 07B | `f/sales/send_owner_attendance_checks` | `0 */30 * * * *` | No | Owner attendance-check schedule is currently disabled. |
| 08Z | `f/sales/send_webinar_reminders` | `0 */15 * * * *` | No | Disabled fallback webinar reminder poller. Webinar reminders are one-off jobs now. |
| 09B | `f/collectives/zoom_collective_to_pipedrive` | `0 0 */3 * * *` | No | Disabled legacy Zoom intro registrant sync. |
| 11A | `f/sales/send_mailchimp_fallback_after_whatsapp_failure` | `0 0 8,12,19,22 * * *` | Yes | Four daily Mailchimp fallback pickup windows for Typeform leads where WhatsApp failed and no inbound WhatsApp was received. |
| 12A | `f/sales/send_mailchimp_fallback_after_nurture_whatsapp_failure` | `0 0 10 * * *` | Yes | Daily Mailchimp fallback for failed Collective Journey day-wise nurture WhatsApps, grouped by collective and nurture day. |
| 10D | `f/sales/send_collective_story_unopened_nurture` | `0 0 21 * * *` | Yes | Sends the Day 2/4/6/8/10/12/14 Collective Journey sequence and applies the collective-specific stop rule. |
| 14B | `f/sales/reconcile_vivek_calendly_bookings` | `0 37 8,11,15,19 * * *` | Yes | Reconciles Vivek's Bhopal/Mumbai bookings and, after the pending split deployment, Vivek-owned Hammiyala bookings to Pipedrive four times daily in `Asia/Kolkata`. |

All schedules use `Asia/Kolkata`.

## Scripts And Flows

| Number | Path | Type | Called by | Main action |
| --- | --- | --- | --- | --- |
| 01B | `f/sales/typeform_to_pipedrive_intake` | Script | 01A | Parses Typeform, maps fields, creates/updates Pipedrive person/deal, runs GIS/fit routing, and logs audit/manual-review activities. |
| 02B | `f/sales/pipedrive_1on1_tbc_to_calendar_prebook` | Script | 02A | Checks eligibility, then sends the lead-facing team scheduling notice for fit 1on1 leads. |
| 02C | `f/sales/send_1on1_team_scheduling_notice` | Script | 02B | Sends the lead WhatsApp that a team member will reach out, logs `1on1 team scheduling notice sent`, and queues the owner touchbase loop. |
| 03A | `f/sales/calendar_prebook_1on1` | Script | Internal/manual only | Legacy prebook worker that can find a slot, create a calendar event, write meeting fields, and send the prebook WhatsApp. It is not called by the live fit-lead route. |
| 04B | `f/sales/calendly_webinar_to_pipedrive_activity` | Flow | 04A | Disabled legacy flow. Waits 5 seconds, then calls 04C when the route is deliberately re-enabled. |
| 04C | `f/sales/create_webinar_activity_from_calendly` | Script | Manual/ops run or 04B if legacy route is re-enabled | Registers Calendly invitee into Zoom, creates/updates Pipedrive webinar activity, sends confirmation, schedules one-off reminders. Requires `f/sales/calendly_zoom_registration_enabled=true` for the contained path or `f/sales/legacy_webinar_enabled=true` for the full legacy path. Attendance/prebook checks are skipped unless `schedule_attendance_checks=true`. |
| 05B | `f/sales/interakt_whatsapp_inbound` | Flow | 05A | Routes inbound Interakt events by button text/callback data. |
| 05C | `f/sales/interakt_whatsapp_inbound_router` | Script | 05B | Parses inbound payload and classifies action. |
| 05D | `f/sales/interakt_reschedule_requested_worker` | Script | 05B | Handles Reschedule Call. |
| 05E | `f/sales/interakt_attendance_confirmed_worker` | Script | 05B | Handles lead Confirm Attendance. |
| 05F | `f/sales/interakt_owner_attended_worker` | Script | 05B | Handles owner Attended. |
| 05G | `f/sales/interakt_owner_no_show_worker` | Script | 05B | Handles owner Not Attended. |
| 05H | `f/sales/owner_touchbase/handle_owner_touchbase_response` | Script | 05B | Handles owner `Yes, touched base` / `No, pending` responses, logs Pipedrive audit activities, and queues the next reminder when pending. |
| 05Z | `f/sales/interakt_ignored_message_worker` | Script | 05B | Safely ignores unknown inbound WhatsApp messages. |
| 06A | `f/sales/send_1on1_reminders` | Script | 06B | Sends 1on1 reminder templates and logs done admin activities. |
| 07A | `f/sales/send_owner_attendance_checks` | Script | 07B | Sends owner attendance check and logs done admin activity. |
| 07C | `f/sales/owner_touchbase/schedule_owner_touchbase_check` | Script | 02C or 05H | Logs and schedules the delayed owner touchbase check. |
| 07D | `f/sales/owner_touchbase/send_owner_touchbase_check` | Script | 07C delayed job | Sends `owner_1on1_touchbase_check`, with stop conditions for closed deals, scheduled meetings, duplicate attempts, existing confirmation, and reminder limit. |
| 08A | `f/sales/send_webinar_reminders` | Script | One-off jobs from 04C | Sends webinar reminder templates and logs done admin activities. |
| 09A | `f/collectives/zoom_collective_to_pipedrive` | Script | 09B | Syncs Zoom collective intro registrants to Pipedrive. |
| 11A | `f/sales/send_mailchimp_fallback_after_whatsapp_failure` | Script | 11A schedule | Batches eligible WhatsApp-failed/no-inbound Typeform leads into Mailchimp campaigns by route and collective; logs campaign IDs back to Pipedrive. Mailchimp config is live. |
| 12A | `f/sales/send_mailchimp_fallback_after_nurture_whatsapp_failure` | Script | 12A schedule | Batches eligible failed day-wise nurture WhatsApps into Mailchimp campaigns by collective and nurture day; skips inbound/manual/post-brochure/later success cases and logs campaign IDs back to Pipedrive. |
| 10D | `f/sales/send_collective_story_unopened_nurture` | Script | 10D schedule | Sends age-based Day 2/4/6/8/10/12/14 WhatsApps. It reads the current deal owner before every Hammiyala send: Vivek path stops on Calendly; Rakesh path stops on the second Typeform. |
| 14A | `f/sales/reconcile_vivek_calendly_bookings` | Script | 14B schedule | Reads only Vivek's configured Calendly event type; matches exact email plus Bhopal/Mumbai/Hammiyala UTM and accepts only open Vivek-owned eligible deals. Writes meeting fields, an open Vivek activity, and a completed admin audit. Cancellations clear only the same current reference. |
| QA | `f/sales/calendar_prebook_1on1_smoke_test` | Script | Manual only | Checks Google Calendar service-account access. |

## Typeform Intake Logic

Hammiyala split status as of 2026-08-05: implemented and Bun-build verified locally; Windmill metadata generation, sync push, and live two-lead QA are still pending.

The Typeform worker recognizes the four primary collective forms plus the post-brochure Typeforms linked from the Collective Journey/brochure CTA, including Hyderabad `z1sh3mRI`:

| Collective | Owner | Pipeline | Webinar stage | 1on1 fit stage |
| --- | --- | --- | --- | --- |
| Bhopal | Vivekanand | `4` | Lead_In | Initial Event Scheduled |
| Mumbai | Vivekanand | `2` | Lead_In | Initial Event Scheduled |
| Hammiyala | Strict new-deal round-robin: Vivekanand first, then Sai Rakesh | `1` | Lead_In | Initial Event Scheduled |
| Poomaale 2.0 | Sai Rakesh | `3` | Lead_In | Initial Event Scheduled |
| Hyderabad | Vivekanand | `6` | Lead_In | Initial Event Scheduled |

Business rules:

- Primary webinar/GIS or unfit route moves to Lead_In and gets `GIS Awaiting`.
- 1on1 fit route gets label `115` 1on1 TBC and remains in Initial Event Scheduled stage.
- Hammiyala post-GIS submissions preserve the existing deal owner. A Rakesh-owned submission stops nurture and creates the owner review task; a Vivek-owned deal remains on the Calendly stop rule. Poomaale remains on the second-Typeform stop rule.
- Bhopal/Mumbai brochure leads do not need the second Typeform to stop nurture; nurture stops only after `14A` confidently syncs their Vivek Calendly booking.
- Azure/OpenAI fallback routes the deal to Lead_In with `GIS Awaiting` and creates an open manual-review activity owned by Beforest Admin.

## Current 1on1 Scheduling Rules

Fit leads with label `115` receive the team-managed scheduling notice. The owner touchbase loop checks after 24 hours and can repeat up to three total attempts. No calendar slot is automatically prebooked by this route.

For Bhopal, Mumbai, and Vivek-owned Hammiyala brochure leads:

- Canva links point to Vivek's Calendly with `utm_campaign=bhopal`, `utm_campaign=mumbai`, or `utm_campaign=hammiyala`.
- `14A` accepts only the configured Vivek event type and matches the invitee's exact email to an open Vivek-owned deal in pipeline `4`, `2`, or `1`.
- UTM selects the pipeline. Without a usable UTM, sync occurs only when exactly one eligible deal remains.
- The Pipedrive meeting datetime is stored in UTC, display/audit text is rendered in `Asia/Kolkata`, and the stable reference uses `calendly:<invitee-id>`.
- Active bookings create an open Vivek-owned meeting activity plus a completed Beforest Admin audit activity.
- Cancellation clears fields and closes the open meeting activity only when the canceled reference is still the current booking, making reschedules safe.

For Rakesh-owned Hammiyala and all Poomaale deals, the brochure continues to the Rakesh post-brochure Typeform. A submission stops nurture and returns the deal to team-managed scheduling.

Legacy `f/sales/calendar_prebook_1on1` remains internal/manual. Its default duration is 30 minutes and its timezone is `Asia/Kolkata`, but it is not part of the live fit-lead path.

## Webinar Rules

The legacy Calendly HTTP route is disabled. For the contained path, run `f/sales/create_webinar_activity_from_calendly` with a Calendly payload after setting `f/sales/calendly_zoom_registration_enabled=true`.

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

Hyderabad uses Pipedrive pipeline `6` and owner Vivekanand for the contained webinar worker. Keep the worker gated behind `f/sales/calendly_zoom_registration_enabled=true` until a Hyderabad webinar dry-run has passed.

