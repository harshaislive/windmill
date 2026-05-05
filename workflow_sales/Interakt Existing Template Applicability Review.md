# Interakt Existing Template Applicability Review

This document answers one question:

- which existing WhatsApp templates in Interakt are already applicable to the current funnel

It uses the current funnel definition, not the older n8n assumptions.

Related docs:

- [Interakt Template Requirement Matrix.md](</D:/AI Apps/windmill/workflow_sales/Interakt%20Template%20Requirement%20Matrix.md:1>)
- [LIVE_TEMPLATE_CATALOG.md](</D:/AI Apps/windmill/snapshots/interakt/LIVE_TEMPLATE_CATALOG.md:1>)

## Decision Legend

- `Use as-is`
  - good fit for the current funnel without changing the message logic
- `Use with caution`
  - workable, but carries assumptions such as owner-specific copy, old CTA style, or slightly mismatched wording
- `Do not reuse`
  - tied to old dates, old campaigns, or the wrong flow semantics

## Best Existing Matches

| Funnel slot | Decision | Recommended existing template | WhatsApp template id | Why |
| --- | --- | --- | --- | --- |
| `interakt_1on1_request_ack` | Use as-is | `ack_1on1_withbutton` | `1409539040713434` | Directly acknowledges the 1:1 request and already fits the old workflow. |
| `interakt_1on1_request_ack` | Use as-is | `collective_1on1_ack_immediate_v2` | `25743781468597339` | Cleaner acknowledgement variant if you do not want the extra `Explore Beforest` button. |
| `interakt_1on1_prebooked_offer` | Use as-is | `1on1_fit_with_prebookedcall` | `929183576282877` | Exact match for the current prebooked 1:1 flow with `Reschedule Call` and `Confirm Attendance` buttons. |
| `interakt_1on1_booking_confirmation` | Use as-is | `attendance_confirmation_1on1` | `1614470659846965` | Confirms a 1:1 with owner and date. Good fit after rebooking succeeds. |
| `interakt_webinar_confirmation` | Use as-is | `collective_webinar_confirmation` | `1652138732429446` | Generic collective webinar confirmation with variables for name, collective, date, and time. |
| `interakt_webinar_reminder_3d` | Use as-is | `collective_webinar_reminder_3days_before` | `844830038419458` | Generic reminder template, not date-locked to a specific event. |
| `interakt_webinar_reminder_24h` | Use as-is | `collective_webinar_reminder_24hrs_before` | `1985750315304190` | Generic 24-hour webinar reminder. |
| `interakt_webinar_reminder_same_day` | Use as-is | `collective_webinar_reminder_1hr_before` | `1413104447035444` | Generic same-day webinar reminder with dynamic access link. |
| `interakt_post_webinar_1on1_offer` | Use as-is | `1on1_fit_with_prebookedcall` | `929183576282877` | Same logic as the direct prebooked 1:1 offer; should reuse this id. |

## Partial Matches

These templates are usable only if you want to preserve older assumptions.

| Funnel slot | Decision | Existing template | WhatsApp template id | Issue |
| --- | --- | --- | --- | --- |
| `interakt_1on1_booking_link` | Use with caution | `collective_user_notavailable_resend_1on1_link_vivek` | `2681894292197799` | Good content for rebooking, but hardcoded to Vivekanand. |
| `interakt_1on1_booking_link` | Use with caution | `collective_user_notavailable_resend_1on1_link_rakesh` | `901082656114581` | Good content for rebooking, but hardcoded to Sai Rakesh. |
| `interakt_webinar_confirmation` | Use with caution | `webinar_registration_confirmed` | `860043976994645` | Functionally useful, but the copy is 10% lifestyle specific rather than collective-specific. |
| `interakt_webinar_upcoming_reinvite` | Use with caution | `no_show_for_webinar` | `1365377888148096` | Right recovery intent, but the copy and link are tied to the 10% flow. |
| alternate 1:1 route | Use with caution | `collective_1on1_invite_cta` | `1873290083554845` | Useful only if you switch from prebooked 1:1 to a direct CTA scheduling model. |
| old AI-unfit route | Use with caution | `collective_unfit_webinar_cta` | `2162234634523262` | Useful only if you keep the old AI-based “unfit -> webinar” branch. Not needed for the current Typeform-first webinar route. |

## Gaps With No Good Existing Match

These should be created as new templates unless you decide to merge them into another slot.

| Funnel slot | Why a new template is recommended |
| --- | --- |
| `interakt_1on1_prebooked_response_reminder` | Existing candidates either confirm attendance or acknowledge request; none cleanly remind the user to choose `Confirm Attendance` vs `Reschedule Call`. |
| `interakt_1on1_reschedule_ack` | No existing template cleanly says “we cancelled your old slot, please book again” in a generic owner-agnostic way. |
| `interakt_1on1_reminder_3d` | No good generic 1:1 D-3 reminder found. |
| `interakt_1on1_reminder_24h` | No good generic 1:1 D-1 reminder found. |
| `interakt_1on1_reminder_1h` | No good generic 1:1 H-1 reminder found. |
| `interakt_1on1_no_show_rebook` | No good generic 1:1 no-show recovery template found. |
| `interakt_owner_attendance_check` | No owner-facing attendance confirmation template found. |
| `interakt_webinar_upcoming_reinvite` | A partial match exists, but nothing generic and collective-safe is ready as-is. |

## Templates To Avoid Reusing

These are not suitable for the new funnel because they are date-locked, event-locked, or campaign-specific.

- `hammiyala_webinar_10mins_18_04_2026`
- `hammiyala_webinar_2hrs_18_04_2026`
- `mumbai_webinar_reminder_4hrs_17_04_2026`
- `mumbai_10mins_before`
- `mumbaiwebina_2hrs_before`
- `mumbai_webinar_31_03_2026`
- `mumbai_webinar_15_03_2026`
- `poomaale_webinar_14_03_2026`
- `bhopal_webinar_1hr_reminder_18_02_2026`
- `bhpl_webinar_reminder_18_02_2026`
- `ham_1hr_webinar_reminder`
- `bhp_1hr_webinar_reminder`
- `mumbai_collective_special_session_01_2026`
- `mum_web_churn_28dec`
- `mum_web_churn_28dec_42`
- `mumbai_webinar_28th_dec_nolabelsdatabasechurn`
- `mumbai_reminder_webinar_25thdec`
- `mumbai_lastminute_webinar_webinar_`
- `mumbai_no_labels_nudge_custom_webinar`
- `mumbai_no_labels_nudge_custom_webinar_fc`
- most `10percent_*` and `10cent_*` webinar templates

Reason:

- they contain fixed dates, fixed Zoom links, specific campaign copy, or old one-off messaging that should not be embedded in a reusable Windmill automation

## Recommended Final Reuse Set

If you want the cleanest reuse strategy from what already exists, I would start with these:

1. `ack_1on1_withbutton` or `collective_1on1_ack_immediate_v2`
2. `1on1_fit_with_prebookedcall`
3. `attendance_confirmation_1on1`
4. `collective_webinar_confirmation`
5. `collective_webinar_reminder_3days_before`
6. `collective_webinar_reminder_24hrs_before`
7. `collective_webinar_reminder_1hr_before`

That gives you `7` strong reusable templates immediately.

With cautious reuse, you could also temporarily use:

1. `collective_user_notavailable_resend_1on1_link_vivek`
2. `collective_user_notavailable_resend_1on1_link_rakesh`
3. `no_show_for_webinar`

## Practical Recommendation

My recommendation is:

1. reuse the `7` strong templates immediately
2. create new templates for the missing 1:1 reminder, reschedule, no-show, and owner-attendance steps
3. do not build the new Windmill flow around date-specific webinar templates
4. only reuse owner-specific booking-link templates if you explicitly want separate Vivek and Rakesh copy

