# Interakt 1on1 Live Template Body Audit

Last checked: 2026-05-05, Asia/Kolkata

Purpose: confirm that Windmill body/button values match the live Interakt templates, not just the template ids.

## Live / Wired Now

| Windmill use | Template | Live vars | Windmill values | Result |
| --- | --- | --- | --- | --- |
| Prebooked 1on1 message | `1on1_fit_with_prebookedcall` / `929183576282877` | `{{1}}` deal title, `{{2}}` collective, `{{3}}` owner, `{{4}}` date, `{{5}}` time | `deal.title`, `collectiveName`, `ownerDisplayName`, date, time | OK |
| Reschedule / no-slot lead link, Vivek | `collective_user_notavailable_resend_1on1_link_vivek` / `2681894292197799` | no body vars; URL button `{{1}}` | no body values; button value Vivek Calendly link | OK |
| Reschedule / no-slot lead link, Rakesh | `collective_user_notavailable_resend_1on1_link_rakesh` / `901082656114581` | no body vars; URL button `{{1}}` | no body values; button value Rakesh Google appointment link | OK |
| Owner no-slot alert | `owner_1on1_no_slot_alert` / `1279318191033383` | owner, deal title, collective, search days, deal id, owner calendar | exact six values in that order | OK |
| Lead attendance confirmation | `attendance_confirmation_1on1` / `1614470659846965` | deal title, owner, meeting datetime text | exact three values in that order | OK |
| 1on1 reminder D-3 | `collective_1on1_reminder_3days_before` / `1068416189695731` | deal title, owner, date, time | fixed to four values | OK |
| 1on1 reminder D-1 | `collective_1on1_reminder_24hrs_before` / `1448524886960644` | deal title, owner, date, time | fixed to four values | OK |
| 1on1 reminder H-1 | `collective_1on1_reminder_1hr_before` / `996140132850094` | deal title, owner, time | exact three values | OK |

## Ready But Not Wired Yet

| Future use | Template | Live vars/buttons | Wiring note |
| --- | --- | --- | --- |
| Prebooked response reminder with buttons | `collective_1on1_prebooked_response_reminder` / `948001261152533` | deal title, owner, date, time; buttons `Confirm Attendance`, `Reschedule Call` | Can be used if we want a second confirm/reschedule nudge. Current prebook uses `1on1_fit_with_prebookedcall`. |
| Owner attendance check | `collective_owner_attendance_check` / `1735882337778498` | owner, deal title, date, time; buttons `Attended`, `Not Attended` | Wired via `f/sales/send_owner_attendance_checks`; router handles exact `Attended` and `Not Attended` text. |
| Lead no-show rebook | `collective_1on1_no_show_rebook` / `1483962136798583` | deal title, owner; URL button `{{1}}` | Wired via `f/sales/interakt_owner_no_show_worker`; sends body values plus owner booking link in button value. |
| Generic reschedule link | `collective_user_notavailable_resend_1on1_link_generic_v3` / `1754399372620748` | sign-off name; URL button `{{1}}` | Not currently used because live scripts use owner-specific Vivek/Rakesh templates. |

## Findings

- Fixed: reminder D-3 and D-1 were briefly wired as three variables with combined datetime, but live Interakt expects separate date and time. `f/sales/send_1on1_reminders` now sends four values.
- Documentation corrected: owner attendance check button is `Not Attended`, not `Did Not Attend`.
- Copy note: `1on1_fit_with_prebookedcall` is functionally relevant, but the body has a small grammar issue: "if this suit your calendar". It is approved and live; changing it would require a replacement template.
