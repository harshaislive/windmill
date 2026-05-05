# Interakt Template Requirement Matrix

This document lists the WhatsApp templates required for the current Pipedrive communication funnel build.

It is meant to answer three questions clearly:

1. how many template slots exist in the flow
2. how many unique Interakt template ids are actually needed
3. where each template is used in the funnel

Generated from:

- [Pipedrive Communication Funnel.md](</D:/AI Apps/windmill/workflow_sales/Pipedrive%20Communication%20Funnel.md:1>)
- [WORKFLOW_TEMPLATE_MAPPING.md](</D:/AI Apps/windmill/snapshots/interakt/WORKFLOW_TEMPLATE_MAPPING.md:1>)
- [LIVE_TEMPLATE_CATALOG.md](</D:/AI Apps/windmill/snapshots/interakt/LIVE_TEMPLATE_CATALOG.md:1>)

## Count Summary

### Recommended full build

- Template slots in the automation registry: `16`
- Unique Interakt template ids needed: `15`
- Reason:
  - `interakt_post_webinar_1on1_offer` should reuse the same template id as `interakt_1on1_prebooked_offer`

### Optional extra slot

- Add `1` extra slot if you want an immediate acknowledgement right after the user selects `Schedule 1on1 Call` in Typeform and before any review / prebooking happens.
- That makes:
  - template slots: `17`
  - unique template ids: `16`

### Lean build if you aggressively reuse templates

- You can reduce unique template ids further if:
  - `interakt_1on1_reschedule_ack` and `interakt_1on1_booking_link` are merged into one template
  - all 1:1 reminders reuse one generic reminder template
  - all webinar reminders reuse one generic webinar reminder template
- In that case the practical minimum is about `10` to `12` unique ids.

Recommendation:

- keep the registry at the full `16` slots for clarity
- allow id reuse where appropriate
- decide later whether any slots should intentionally share the same Interakt template id

## Flow-Level Breakdown

### Flow 1: Typeform -> Direct 1:1 Route

This applies when the user selects `Schedule 1on1 Call` in Typeform.

Required slots:

1. `interakt_1on1_prebooked_offer`
2. `interakt_1on1_prebooked_response_reminder`

Optional slot:

3. `interakt_1on1_request_ack`

### Flow 2: User Clicks `Reschedule Call`

Required slots:

1. `interakt_1on1_reschedule_ack`
2. `interakt_1on1_booking_link`

### Flow 3: User Self-Books New 1:1 Slot

Required slots:

1. `interakt_1on1_booking_confirmation`

### Flow 4: Future 1:1 Reminder Cadence

Required slots:

1. `interakt_1on1_reminder_3d`
2. `interakt_1on1_reminder_24h`
3. `interakt_1on1_reminder_1h`

### Flow 5: 1:1 Outcome Handling

Required slots:

1. `interakt_1on1_no_show_rebook`
2. `interakt_owner_attendance_check`

### Flow 6: Typeform -> Webinar Route

This applies when the user selects `Schedule Webinar` in Typeform.

Required slots:

1. `interakt_webinar_confirmation`
2. `interakt_webinar_reminder_3d`
3. `interakt_webinar_reminder_24h`
4. `interakt_webinar_reminder_same_day`
5. `interakt_webinar_upcoming_reinvite`

### Flow 7: Webinar Attended -> Post-Webinar 1:1 Route

Required slot:

1. `interakt_post_webinar_1on1_offer`

Reuse rule:

- this should reuse the same Interakt template id as `interakt_1on1_prebooked_offer`

## Master Template Matrix

| Slot key | Required now | Flow | Where used | Trigger | Recipient | Unique id needed | Reuse / note | Existing live candidate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `interakt_1on1_request_ack` | Optional | Typeform -> 1:1 | immediate acknowledgement after form submit | user selected `Schedule 1on1 Call` | lead | Optional | only needed if there is a delay before prebooking | `ack_1on1_withbutton`, `collective_1on1_ack_immediate_v2` |
| `interakt_1on1_prebooked_offer` | Yes | Direct 1:1 | first actual 1:1 message | after system prebooks the call | lead | Yes | also reused after webinar attendance | `1on1_fit_with_prebookedcall` |
| `interakt_1on1_prebooked_response_reminder` | Yes | Direct 1:1 | no-response follow-up | if user has not clicked anything after prebooked offer | lead | Yes | created on `2026-04-20`; pending approval | `collective_1on1_prebooked_response_reminder` |
| `interakt_1on1_reschedule_ack` | Yes | Reschedule | acknowledge old slot cancellation | immediately after `Reschedule Call` click | lead | Yes | generic template created; pending approval | `collective_user_notavailable_resend_1on1_link_generic_v3` (`1754399372620748`) |
| `interakt_1on1_booking_link` | Yes | Reschedule / no-response | send self-book link | after reschedule ack or after timeout handoff | lead | Yes | dynamic CTA preferred; owner-specific static templates are brittle | `collective_user_notavailable_resend_1on1_link_vivek`, `collective_user_notavailable_resend_1on1_link_rakesh` or new |
| `interakt_1on1_booking_confirmation` | Yes | Rebooked 1:1 | confirm the new self-booked slot | after Calendly or booking flow confirms slot | lead | Yes | should confirm owner, date, and time | `attendance_confirmation_1on1` or new |
| `interakt_1on1_reminder_3d` | Yes | 1:1 reminders | D-3 reminder | 3 days before meeting | lead | Yes | approved; id `1068416189695731`; used by `f/sales/send_1on1_reminders` | `collective_1on1_reminder_3days_before` |
| `interakt_1on1_reminder_24h` | Yes | 1:1 reminders | D-1 reminder | 24 hours before meeting | lead | Yes | approved; id `1448524886960644`; used by `f/sales/send_1on1_reminders` | `collective_1on1_reminder_24hrs_before` |
| `interakt_1on1_reminder_1h` | Yes | 1:1 reminders | H-1 reminder | 1 hour before meeting | lead | Yes | approved; id `996140132850094`; used by `f/sales/send_1on1_reminders` | `collective_1on1_reminder_1hr_before` |
| `interakt_1on1_no_show_rebook` | Yes | 1:1 outcome | no-show recovery | owner confirms not attended | lead | Yes | approved; id `1483962136798583`; ready for no-show worker | `collective_1on1_no_show_rebook` |
| `interakt_owner_attendance_check` | Yes | 1:1 outcome | owner-side confirmation | after meeting end time passes | owner | Yes | approved; id `1735882337778498`; variables are owner, deal title, date, time; buttons `Attended` / `Not Attended` | `collective_owner_attendance_check` |
| `interakt_webinar_confirmation` | Yes | Webinar route | webinar confirmation | webinar chosen in Typeform or registration confirmed | lead | Yes | should carry webinar date / time / join link or registration context | `webinar_registration_confirmed`, `collective_webinar_confirmation` |
| `interakt_webinar_reminder_3d` | Yes | Webinar reminders | early webinar reminder | 3 days before webinar | lead | Yes | can reuse one generic webinar reminder id if copy is neutral | generic preferred; existing live templates are mostly event-specific |
| `interakt_webinar_reminder_24h` | Yes | Webinar reminders | D-1 reminder | 24 hours before webinar | lead | Yes | can reuse one generic webinar reminder id if copy is neutral | generic preferred; existing live templates are mostly event-specific |
| `interakt_webinar_reminder_same_day` | Yes | Webinar reminders | same-day reminder | same day before webinar | lead | Yes | can reuse one generic webinar reminder id if copy is neutral | `collective_webinar_reminder_1hr_before` or new generic |
| `interakt_webinar_upcoming_reinvite` | Yes | Webinar outcome | missed webinar recovery | webinar not attended | lead | Yes | should include new registration link | `no_show_for_webinar` or new |
| `interakt_post_webinar_1on1_offer` | Yes | Webinar attended -> 1:1 | 1:1 offer after webinar attendance | 24h after webinar attendance | lead | No | should reuse `interakt_1on1_prebooked_offer` id | reuse `1on1_fit_with_prebookedcall` |

## What I Recommend You Lock First

These are the highest-priority template slots because the automation cannot be built cleanly without them:

1. `interakt_1on1_prebooked_offer`
2. `interakt_1on1_reschedule_ack`
3. `interakt_1on1_booking_link`
4. `interakt_1on1_booking_confirmation`
5. `interakt_1on1_no_show_rebook`
6. `interakt_webinar_confirmation`
7. `interakt_webinar_upcoming_reinvite`
8. `interakt_owner_attendance_check`

These already have good live candidates or strong reuse options:

1. `interakt_1on1_prebooked_offer`
2. `interakt_1on1_request_ack`
3. `interakt_webinar_confirmation`
4. `interakt_post_webinar_1on1_offer`
5. `interakt_1on1_reschedule_ack` = `collective_user_notavailable_resend_1on1_link_generic_v3` (`1754399372620748`, pending)
6. `interakt_1on1_prebooked_response_reminder` = `collective_1on1_prebooked_response_reminder` (pending)
7. `interakt_1on1_reminder_3d` = `collective_1on1_reminder_3days_before` / `1068416189695731`
8. `interakt_1on1_reminder_24h` = `collective_1on1_reminder_24hrs_before` / `1448524886960644`
9. `interakt_1on1_reminder_1h` = `collective_1on1_reminder_1hr_before` / `996140132850094`
10. `interakt_1on1_no_show_rebook` = `collective_1on1_no_show_rebook` / `1483962136798583`
11. `interakt_owner_attendance_check` = `collective_owner_attendance_check` / `1735882337778498`

## Current Best Guess For Reuse

These are the reuse decisions I would make unless you want separate copy:

1. `interakt_post_webinar_1on1_offer` = same id as `interakt_1on1_prebooked_offer`
2. `interakt_1on1_request_ack` = use existing `ack_1on1_withbutton` if you keep an acknowledgement step
3. `interakt_webinar_confirmation` = likely use `webinar_registration_confirmed` or `collective_webinar_confirmation`

These I would not reuse blindly:

1. owner-specific booking-link templates for Vivek and Rakesh
2. one-off collective webinar reminder templates tied to specific dates
3. any old webinar CTA templates that assume system-classified `unfit` routing

## Data You Can Fill For Each Slot

For each slot above, send me:

1. placeholder key
2. Interakt template id
3. Interakt template name
4. whether the slot reuses another slot’s id
5. required variables in order
6. button labels
7. button callback payloads
8. whether the template is lead-facing or owner-facing
9. any owner-specific split such as Vivek vs Rakesh

## Immediate Next Step

The fastest way to close this is:

1. fill the `8` high-priority slots first
2. confirm whether `interakt_1on1_request_ack` stays or is removed
3. confirm whether reminder cadences need unique copy or one generic reminder template per channel is enough
