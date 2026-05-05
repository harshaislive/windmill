# Windmill Sales Automation QA and Backlog

Last verified: 2026-05-05, Asia/Kolkata

This is the working control sheet for Beforest sales automations in Windmill. Keep this file current whenever a script, trigger, schedule, or flow is added.

## Pipedrive Activity Audit Standard

Automation audit activities use consistent subjects of the form `[Windmill][event.name] description`.

| Activity kind | Owner | Done? | Purpose |
| --- | --- | --- | --- |
| WhatsApp sent/received, calendar create/cancel, Typeform intake, automation bookkeeping | Beforest Admin / `connect@beforest.co` / user ID `18891506` | Yes, except manual-review tasks | Immutable audit trail with template/payload/context in the activity note |
| Manual review needed, for example Azure/OpenAI fit classification fallback | Beforest Admin / `18891506` | No | Human task to review the deal and set the correct label/stage so Windmill can continue |
| Actual scheduled 1on1 call or webinar meeting | Deal owner | No until the business event is completed | The real operational activity visible to the owner |

Reminder activity subjects were kept backward-compatible to preserve dedupe against already-sent reminders, but their notes now include the Interakt payload summary and are explicitly owned by Beforest Admin.

## Live Automation Map

| Area | Windmill item | Trigger/source | Covered now | Status |
| --- | --- | --- | --- | --- |
| Typeform intake | `f/sales/typeform_to_pipedrive_intake` | Typeform HTTP webhook | Creates/updates Pipedrive person/deal, maps custom fields, routes webinar vs 1on1, runs 1on1 fit/unfit, applies labels/stages, logs admin audit activity; Azure fallback creates open admin manual-review activity | Live |
| 1on1 calendar prebook guard | `f/sales/pipedrive_1on1_tbc_to_calendar_prebook` | Pipedrive deal `change` webhook | Checks label `115`, Initial Event Scheduled stage, no meeting fields, then calls calendar prebook | Live |
| 1on1 calendar prebook | `f/sales/calendar_prebook_1on1` | Internal script call | Uses Calendly availability for Vivek, Google Calendar for other owners, creates owner calendar event, writes meeting fields plus Google event reference, creates owner-owned open call activity, logs admin audit activities, sends Interakt prebooked-call WhatsApp, or falls back to Awaiting if no slot exists | Live internal |
| 1on1 WhatsApp inbound | `f/sales/interakt_whatsapp_inbound` | Interakt HTTP webhook | Routes `Reschedule Call` and `Confirm Attendance` button/text responses to dedicated workers | Live |
| 1on1 reschedule worker | `f/sales/interakt_reschedule_requested_worker` | Called by Interakt inbound flow | Resolves deal, cancels owner calendar event when found, clears meeting fields, labels `105`, sends booking-link acknowledgement, logs admin audit activities | Live internal |
| 1on1 attendance worker | `f/sales/interakt_attendance_confirmed_worker` | Called by Interakt inbound flow | Resolves deal, labels `106`, sends `attendance_confirmation_1on1`, writes Pipedrive note, logs admin audit activities | Live internal |
| 1on1 reminder dispatcher | `f/sales/send_1on1_reminders` | Schedule every 15 minutes IST | Sends approved Interakt 3d, 24h, and 1h reminders for open deals labelled `106` with a future booked 1on1 meeting datetime; logs each send as a done admin-owned Pipedrive activity for dedupe | Live |
| 1on1 owner attendance check | `f/sales/send_owner_attendance_checks` | Schedule every 30 minutes IST | After a confirmed 1on1 meeting window passes, sends the owner `Attended` / `Not Attended` buttons and logs a done admin-owned Pipedrive activity for dedupe | Live |
| 1on1 owner attended worker | `f/sales/interakt_owner_attended_worker` | Called by Interakt inbound flow | Labels the deal `107`, moves it to the pipeline's Event Attended stage, logs admin audit activity | Live internal |
| 1on1 owner no-show worker | `f/sales/interakt_owner_no_show_worker` | Called by Interakt inbound flow | Labels the deal `108`, sends the lead the no-show rebook template with owner booking link, writes a note, logs admin audit activities | Live internal |
| Webinar activity | `f/sales/calendly_webinar_to_pipedrive_activity` | Calendly HTTP webhook | Waits 5s, finds/creates Pipedrive person/deal, registers invitee to Zoom webinar, creates/updates webinar activity, sends confirmation, enforces label `111` | Live |
| Webinar activity worker | `f/sales/create_webinar_activity_from_calendly` | Called by webinar flow | `04C Action - webinar Zoom/Pipedrive + confirmation`; creates/updates deal-owner webinar activity, sends webinar confirmation with admin-owned audit activity, then schedules one-off 3d/24h/1h webinar reminder jobs for that deal | Live internal |
| Webinar reminder worker | `f/sales/send_webinar_reminders` | One-off jobs scheduled by `create_webinar_activity_from_calendly` | Sends approved Interakt 3d, 24h, and 1h webinar reminders from the target deal's webinar activity; logs each send as a done admin-owned Pipedrive activity for dedupe | Live worker |
| Zoom intro sync | `f/collectives/zoom_collective_to_pipedrive` | `09B Schedule - Zoom intro registrant sync every 3h` | Reads Zoom collective introduction registrants and syncs to Pipedrive | Live |
| Calendar access check | `f/sales/calendar_prebook_1on1_smoke_test` | Manual only | Verifies Google Calendar service-account free/busy access | Helper |

## Verified External Wiring

| System | Wiring | Status | Note |
| --- | --- | --- | --- |
| Typeform | 4 active forms have only `windmill_pipedrive_intake` enabled | OK | Old Bhopal n8n webhook disabled on 2026-05-05 |
| Pipedrive | `Windmill - 1on1 TBC calendar prebook` webhook active | OK | Last observed HTTP status `201` |
| Pipedrive | Legacy `Windmill owner-wise deal summary` webhook | Cleaned | Deleted from Pipedrive on 2026-05-05 |
| Calendly | Main `social@beforest.co` account has active org webhook to Windmill | OK | `invitee.created` posts to `https://windmill.devsharsha.live/api/r/calendly/webinar/pipedrive/activity`; dry-run HTTP job `019df7ed-effc-89a4-6ad1-dbeebfc6bc68` passed |
| Zoom | Webinar booking worker uses existing Zoom server-to-server credentials | OK | Matches upcoming Zoom meeting by collective and nearest Calendly start time |
| Interakt | 1on1 prebook uses template `1on1_fit_with_prebookedcall` / `929183576282877` | OK | Variables are deal title, collective, owner/team member, date, time |
| Interakt | Inbound webhook route `https://windmill.devsharsha.live/api/r/interakt/whatsapp/inbound` | OK, signed | Single endpoint routes button/text messages and requires `Interakt-Signature` HMAC-SHA256 verification |
| Interakt | Reschedule acknowledgement uses owner-specific templates | OK | Vivek: `collective_user_notavailable_resend_1on1_link_vivek`; Rakesh: `collective_user_notavailable_resend_1on1_link_rakesh` |
| Interakt | Attendance confirmation uses `attendance_confirmation_1on1` | OK | Body values are deal title, owner display name, meeting datetime |
| Interakt | Webinar confirmation uses `collective_webinar_confirmation` / `1652138732429446` | OK | Body values are invitee first name, collective, webinar date, webinar time |
| Interakt | 1on1 reminder templates are approved | OK | 3d `1068416189695731`, 24h `1448524886960644`, 1h `996140132850094` |
| Interakt | No-slot owner alert template `owner_1on1_no_slot_alert` / `1279318191033383` | Pending Meta approval | Script treats owner alert failure as non-blocking |
| Windmill sync | `wmill sync pull --dry-run` | OK | 0 pending local/remote drift on 2026-05-05 |

## QA Results

### Owner Routing

| Collective | Applies to | Pipedrive owner | Calendar path for 1on1 fit |
| --- | --- | --- | --- |
| Bhopal | Webinar and 1on1 | Vivekanand, owner ID `22251956` | Vivek Calendly availability, books `Vivekanand@beforest.co` |
| Mumbai | Webinar and 1on1 | Vivekanand, owner ID `22251956` | Vivek Calendly availability, books `Vivekanand@beforest.co` |
| Hammiyala | Webinar and 1on1 | Rakesh, owner ID `13490118` | Google Calendar free/busy, books `sai@beforest.co` |
| Poomaale 2.0 | Webinar and 1on1 | Rakesh, owner ID `13490118` | Google Calendar free/busy, books `sai@beforest.co` |

### Typeform Intake Dry Runs

Command shape:

```powershell
wmill script run f/sales/typeform_to_pipedrive_intake -d '{"body": <payload>, "dry_run": true}' -s
```

| Sample | Route | Collective | Pipeline | Stage | Labels | Custom fields | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `typeform_webhook_payload/bhopal.json` | `1on1` | Bhopal | `4` | `30` | `115` | `26` | Pass, owner Vivekanand |
| `typeform_webhook_payload/hammiyala.json` | `webinar` | Hammiyala | `1` | `10` | `111` | `28` | Pass, owner Rakesh |
| `typeform_webhook_payload/mumbai.json` | `1on1` | Mumbai | `2` | `14` | `115` | `25` | Pass, owner Vivekanand |
| `typeform_webhook_payload/poomaale2.json` | `webinar` | Poomaale 2.0 | `3` | `20` | `111` | `27` | Pass, owner Rakesh |

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

Caveat: `calendar_prebook_1on1` does not itself check labels/stages. It is safe when called through `pipedrive_1on1_tbc_to_calendar_prebook`, but should be treated as an internal privileged script.

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

### Webinar Reminder Dispatcher Dry Runs

| Test | Expected | Result |
| --- | --- | --- |
| Remote targeted dry-run | Targeted worker can still preview due reminders for a deal without sending | Pass |
| Remote fallback schedule config | Disabled; no recurring Pipedrive polling | Pass: `enabled=false`; one queued run from before disable completed once at `2026-05-05 16:30 IST` |
| Event-driven enqueue | `create_webinar_activity_from_calendly` sends webinar confirmation, then schedules one-off reminder jobs after the Zoom registration and Pipedrive activity update succeeds | Live in worker |

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
| Main Calendly has upcoming Hyderabad webinar | Current Windmill webinar worker recognizes Bhopal, Mumbai, Hammiyala, and Poomaale only | Add Hyderabad mapping or avoid routing Hyderabad bookings into this worker |
| No git repo in `D:\AI Apps\windmill` | Windmill sync exists, but no durable code history | Initialize/private git when ready |

## Automation Backlog

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
| Webinar confirmation | Calendly-to-Zoom/Pipedrive worker succeeds | Send `collective_webinar_confirmation`; log done activity for dedupe | Live |
| Webinar reminder sequence | Calendly-to-Zoom/Pipedrive worker schedules one-off jobs | Send 3d, 24h, and 1h reminders; log done activities for dedupe | Live |
| Webinar attendance sync | Zoom meeting attendance | Move attended leads to Event Attended, update labels | Pending |
| Webinar no-show follow-up | Zoom absence | Send follow-up/rebook message | Pending |
| Webinar post-attendance next step | Attendance confirmed | Prompt 1on1 or next sales action | Pending |

### Platform Hygiene

| Automation/task | Status |
| --- | --- |
| Add HTTP auth/signature to Interakt inbound trigger | Done: `authentication_method=signature`, `Interakt-Signature`, `sha256=` |
| Remove obsolete Pipedrive webhook if confirmed | Done: deleted `Windmill owner-wise deal summary` |
| Remove obsolete Bhopal n8n webhook if confirmed | Done: disabled in Typeform |
| Initialize private git repo and commit Windmill export | Pending |
| Add repeatable local test runner script | Pending |
