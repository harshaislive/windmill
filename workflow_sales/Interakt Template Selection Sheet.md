# Interakt Template Selection Sheet

Use this as the working shortlist for the new funnel.

## Summary

- Reuse as-is: `7`
- Reuse with caution: `3`
- Created now / pending: `7`
- Create new: `0`
- Optional: `1`

## Reuse As-Is

| Slot key | Use this template | WhatsApp template id | Notes |
| --- | --- | --- | --- |
| `interakt_1on1_request_ack` | `ack_1on1_withbutton` | `1409539040713434` | Use only if you want an immediate 1:1 acknowledgement step. |
| `interakt_1on1_prebooked_offer` | `1on1_fit_with_prebookedcall` | `929183576282877` | Main prebooked 1:1 offer. |
| `interakt_1on1_booking_confirmation` | `attendance_confirmation_1on1` | `1614470659846965` | Best fit after successful rebooking. |
| `interakt_webinar_confirmation` | `collective_webinar_confirmation` | `1652138732429446` | Good generic webinar confirmation. |
| `interakt_webinar_reminder_3d` | `collective_webinar_reminder_3days_before` | `844830038419458` | Generic and reusable. |
| `interakt_webinar_reminder_24h` | `collective_webinar_reminder_24hrs_before` | `1985750315304190` | Generic and reusable. |
| `interakt_webinar_reminder_same_day` | `collective_webinar_reminder_1hr_before` | `1413104447035444` | Good same-day reminder. |


## Reuse With Caution

| Slot key | Candidate template | WhatsApp template id | Why caution |
| --- | --- | --- | --- |
| `interakt_1on1_booking_link` | `collective_user_notavailable_resend_1on1_link_vivek` | `2681894292197799` | Hardcoded to Vivek. |
| `interakt_1on1_booking_link` | `collective_user_notavailable_resend_1on1_link_rakesh` | `901082656114581` | Hardcoded to Rakesh. |
| `interakt_webinar_upcoming_reinvite` | `no_show_for_webinar` | `1365377888148096` | Right intent, wrong 10% copy/link. |

## Created Now

| Slot key | Created template | WhatsApp template id | Status | Notes |
| --- | --- | --- | --- | --- |
| `interakt_1on1_reschedule_ack` | `collective_user_notavailable_resend_1on1_link_generic_v3` | `1754399372620748` | `PENDING` | Uses the Vivek template copy, but makes the sign-off name dynamic so the same template can work for Vivek or Rakesh. |
| `interakt_1on1_prebooked_response_reminder` | `collective_1on1_prebooked_response_reminder` | `948001261152533` | `APPROVED` | Live template with `Confirm Attendance` and `Reschedule Call` buttons. |
| `interakt_1on1_reminder_3d` | `collective_1on1_reminder_3days_before` | `1068416189695731` | `APPROVED` | Used by `f/sales/send_1on1_reminders`; variables: deal title, owner, datetime display. |
| `interakt_1on1_reminder_24h` | `collective_1on1_reminder_24hrs_before` | `1448524886960644` | `APPROVED` | Used by `f/sales/send_1on1_reminders`; variables: deal title, owner, datetime display. |
| `interakt_1on1_reminder_1h` | `collective_1on1_reminder_1hr_before` | `996140132850094` | `APPROVED` | Used by `f/sales/send_1on1_reminders`; variables: deal title, owner, meeting time. |
| `interakt_1on1_no_show_rebook` | `collective_1on1_no_show_rebook` | `1483962136798583` | `APPROVED` | Ready for owner no-show path; dynamic `Book 1on1 Slot` CTA. |
| `interakt_owner_attendance_check` | `collective_owner_attendance_check` | `1735882337778498` | `APPROVED` | Ready for post-call owner check; variables are owner, deal title, date, time; buttons are `Attended` / `Not Attended`. |

## Reuse By Intentional ID Sharing

| Slot key | Reuse this slot’s template | Template id |
| --- | --- | --- |
| `interakt_post_webinar_1on1_offer` | `interakt_1on1_prebooked_offer` | `929183576282877` |

## Superseded Drafts

| Template name | WhatsApp template id | Why not use |
| --- | --- | --- |
| `collective_user_notavailable_resend_1on1_link_generic` | `1462384122282939` | First draft; bad body formatting. |
| `collective_user_notavailable_resend_1on1_link_generic_v2` | `3089825894553347` | Generic wording, but not the same copy as the existing Vivek template. |

## Pending Visibility Note

- The missing templates were created on `2026-04-20`.
- Interakt’s public template-list endpoint is not returning those pending records back by name yet.
- Because of that, only the reschedule template id is currently available in the repo from the direct create response.

## Optional Alternate

| Slot key | Alternate template | WhatsApp template id | When to use |
| --- | --- | --- | --- |
| `interakt_1on1_request_ack` | `collective_1on1_ack_immediate_v2` | `25743781468597339` | Use this instead of `ack_1on1_withbutton` if you want a simpler acknowledgement with no extra button. |

## Final Recommended Set

### Reuse now

1. `ack_1on1_withbutton`  > This is as soon as someone booking 1on1 via typeform. Basically Acknowledgement message.
2. `1on1_fit_with_prebookedcall` > This is when we pre-book a call in deal owners calendar and send a confirmation message. With two buttons "Reschdule call" and "Confirm Attendance". Has 5 variables.
3. `attendance_confirmation_1on1` > When user says "Confirm attendance". Has 3 variables.
4. `collective_webinar_confirmation` > When user schedules a webinar from Typeform. Has 4 variables.
5. `collective_webinar_reminder_3days_before` > Webinar reminder 3 days before if applicable
6. `collective_webinar_reminder_24hrs_before` > Webinar reminder 24hs before if applicable
7. `collective_webinar_reminder_1hr_before` > Webinar reminder 1hr before if applicable.

### Create next

1. none for the current 1:1 gap set; those templates are now created and pending approval
