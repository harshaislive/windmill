# Interakt Pending Template Review

These templates were created in Interakt on `2026-04-20` and are currently pending approval.

## 1. `collective_user_notavailable_resend_1on1_link_generic_v3`

- Slot: `interakt_1on1_reschedule_ack`
- Known WhatsApp template id: `1754399372620748`
- Purpose: acknowledge reschedule and send user to book a fresh slot
- Variables:
  1. `owner_name`
- Buttons:
  - `Book 1on1 Slot` URL CTA

## 2. `collective_1on1_prebooked_response_reminder`

- Slot: `interakt_1on1_prebooked_response_reminder`
- Purpose: remind the user that the reserved slot is still being held
- Variables:
  1. `deal_title`
  2. `owner_name`
  3. `meeting_datetime_display`
- Buttons:
  - `Confirm Attendance`
  - `Reschedule Call`

## 3. `collective_1on1_reminder_3days_before`

- Slot: `interakt_1on1_reminder_3d`
- Purpose: 3-day reminder for a confirmed 1:1
- Variables:
  1. `deal_title`
  2. `owner_name`
  3. `meeting_datetime_display`
- Buttons:
  - none

## 4. `collective_1on1_reminder_24hrs_before`

- Slot: `interakt_1on1_reminder_24h`
- Purpose: 24-hour reminder for a confirmed 1:1
- Variables:
  1. `deal_title`
  2. `owner_name`
  3. `meeting_datetime_display`
- Buttons:
  - none

## 5. `collective_1on1_reminder_1hr_before`

- Slot: `interakt_1on1_reminder_1h`
- Purpose: 1-hour reminder for a confirmed 1:1
- Variables:
  1. `deal_title`
  2. `owner_name`
  3. `meeting_time`
- Buttons:
  - none

## 6. `collective_1on1_no_show_rebook`

- Slot: `interakt_1on1_no_show_rebook`
- Purpose: graceful no-show recovery with rebooking CTA
- Variables:
  1. `deal_title`
  2. `owner_name`
- Buttons:
  - `Book 1on1 Slot` URL CTA

## 7. `collective_owner_attendance_check`

- Slot: `interakt_owner_attendance_check`
- Purpose: ask the owner for binary attendance confirmation
- Variables:
  1. `owner_name`
  2. `deal_title`
  3. `meeting_date_display`
  4. `meeting_time`
- Buttons:
  - `Attended`
  - `Not Attended`

## Note

- Interakt’s public list endpoint is not returning these pending records by name yet.
- The reschedule template id is known from the direct create response.
- The remaining pending ids should become easy to map once Interakt exposes them after approval.
