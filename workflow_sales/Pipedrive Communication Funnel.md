# Pipedrive Communication Funnel

This document is the canonical breakdown of the sales communication funnel described in `workflow_sales/Pipedrive  Communication Funnel.rtf`, reconciled with the current Pipedrive labels, stages, user clarifications, and the intended system responsibilities for Windmill automation.

## Goal

Move leads from Typeform submission through qualification, webinar or direct 1:1 scheduling, reminders, attendance tracking, and follow-up using:

- Typeform
- Pipedrive
- Interakt / WhatsApp
- Google Calendar
- Calendly
- Zoom
- Azure OpenAI

## Important Clarification From Current Process

Typeform already captures which path the lead selected:

- `Schedule 1on1 Call`
- `Schedule Webinar`

Canonical interpretation:

- If the user selected `Schedule 1on1 Call` in Typeform, they enter the 1:1 route.
- If the user selected `Schedule Webinar` in Typeform, they enter the webinar route directly.
- Webinar-selected leads do not need a separate webinar CTA first.
- Those webinar-selected leads should move directly into the webinar reminder flow with label `111` `Scheduled Webinar - Pending`.

AI qualification not required for people who selected schedule webinar in Tyepform.

## Source Systems

### Typeform

- Captures lead submission.
- Provides the intake payload that starts the funnel.
- Includes the answer to: `Why is joining this collective important to you?`

### Pipedrive

- System of record for:
  - deal
  - contact
  - owner
  - pipeline
  - stage
  - labels
  - activities
  - 1:1 meeting date/time

### Azure OpenAI

- Qualifies the answer into `fit` or `unfit`.

### Interakt / WhatsApp

- Sends all candidate-facing messages.
- Handles button responses such as:
  - `Confirm Attendance`
  - `Reschedule Call`
  - `Register for Webinar`
  - `Book a Slot`

### Google Calendar

- Holds the owner's actual 1:1 calendar event.
- Used for:
  - creating prebooked calls
  - canceling events when the user chooses `Reschedule Call`

### Calendly

- Used for:
  - webinar registration links
  - owner booking links for self-scheduled 1:1 calls (Vivek uses calendly but calendly doesnt allow adding regsitrant via api on paid plan, so we use calendly to check his available slots and send request to his google calendar. Rakesh completely uses google calendar only.)

### Zoom

- Webinar attendance source as webinars are hosted on Zoom. Calendly just recieves participant details as calendly is embedded as last typeform question. Once calendly participant is generated, we should use details and add the participat to appropriate zoom meeting(we create meetings for webinars not webinar module in zoom). We are doing this registration method to understand who joined webinar so we can move them to appropriate stages later in Pipedrive.
- Can be used to determine whether a registered webinar attendee actually attended.

## Pipedrive Reference

### Pipelines

- `1` Hammiyala Pipeline
- `2` Mumbai Collective Pipeline
- `3` Poomaale 2.0
- `4` Bhopal Pipeline

### Relevant Stages

These stage names exist across the collective pipelines:

- `Initial Event Scheduled`
  - pipeline 1: stage `1`
  - pipeline 2: stage `14`
  - pipeline 3: stage `21`
  - pipeline 4: stage `30`

- `Event Attended`
  - pipeline 1: stage `2`
  - pipeline 2: stage `15`
  - pipeline 3: stage `22`
  - pipeline 4: stage `31`

- `Lead In`
  - pipeline 1: stage `10`
  - pipeline 2: stage `13`
  - pipeline 3: stage `20`
  - pipeline 4: stage `37`

### Relevant Labels

- `104` `1-on-1`
- `105` `1on1 - Awaiting`
- `106` `1on1 - Pending`
- `107` `1on1 - Attended`
- `108` `1on1 - No-Show`
- `109` `1on1 - Rebooked`
- `110` `Scheduled Webinar - Awaiting`
- `111` `Scheduled Webinar - Pending`
- `112` `Scheduled Webinar - Attended`
- `113` `Scheduled Webinar - No-Show`
- `114` `Scheduled Webinar - Rebooked`
- `115` `1on1 - TBC`

### Relevant Deal Fields

- `cf9fc01d7f779c5a5f9b9c76c07cdd17cfcec470`
  - `Why is joining this collective important to you?`
- `7f1ebc80670dad0d9f6ea3d5f2585c923395305a`
  - `Phone Number`
- `2f592ab838e053d66de919b9b186e55e983747c9`
  - `Email Address`
- `d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd`
  - `1on1 Meeting Date & Time`

## Canonical Funnel

```text
Typeform Submitted
-> Create or update Pipedrive deal
-> Read user-selected path from Typeform
-> Branch:
   - Schedule 1on1 Call
   - Schedule Webinar
-> Continue into the matching route
```

## Flow 1: Intake And Qualification

### Step 1: Typeform Submission

Source:
- Typeform

Action:
- Capture lead details.
- Capture the qualification answer.

Outputs:
- name
- phone
- email
- collective / pipeline context
- answers text

### Step 2: Create Or Update Deal

Source:
- Typeform payload

Target:
- Pipedrive

Action:
- Create or update deal/person in the appropriate collective pipeline.
- Set stage to `Initial Event Scheduled` if 1on1 call is selected in typeform, if webinar is selected in typeform we add them to `Lead_in` stage.
- Store answer text in the custom field.

### Step 3: Read Preferred Path From Typeform

Source:
- Typeform payload

Action:
- Read whether the user selected:
  - `Schedule 1on1 Call`
  - `Schedule Webinar`

Branch:
- `Schedule 1on1 Call` -> direct 1:1 route
- `Schedule Webinar` -> direct webinar route

### Step 4: Qualification

Source:
- Pipedrive deal data

Systems:
- Azure OpenAI

Action:
- Analyze `Why is joining this collective important to you?`
- Return `fit` or `unfit`

Note:
- This can remain as a supporting signal.
- It should not override the direct Typeform route choice unless the business explicitly wants that behavior.

## Flow 2: Fit -> Direct 1:1

### Step 1: Prebook 1:1 With Owner

Source:
- Pipedrive owner

Systems:
- owner routing config
- Google Calendar

Action:
- Create a prebooked 1:1 event in the assigned owner's calendar.
- Store event id for future cancellation if needed.
- Write meeting date/time to Pipedrive field `1on1 Meeting Date & Time` and create activity in pipedrive as per schedule like "1on1 Scheduled with "Deal Title" | "Deal Id" as subject of the activity.

Pipedrive update:
- label = `115` `1on1 - TBC`

### Step 2: Send Prebooked Call Message

Source:
- Windmill automation

Systems:
- Interakt / WhatsApp

Action:
- Send message template configured to be sent. It requires certain input variables to be sent like Date & TIme, owners name, collective name etc

### Step 3: Wait For User Response

Source:
- Interakt callback webhook

Possible paths:
- `Confirm Attendance`
- `Reschedule Call`
- no response / unresponsive

If user doesnt respond to our message with buttons confirm Attendance, Reschedule call in 24hrs, then we will send a reminder to do so, and wait for another 6hrs and cancel the event in owners calendar and send a message to user asking them to use the link to book a  calendar 1on1 evnt with deal owner.

## Flow 3: Fit -> Confirm Attendance Path

### Step 1: User Clicks `Confirm Attendance`

Source:
- Interakt button callback

Action:
- Acknowledge response.

Pipedrive update:
- label = `106` `1on1 - Pending`

Pipedrive activity:
- log confirmation message

### Step 2: Reminder Sequence

Source:
- Windmill delayed jobs / schedules

Systems:
- Interakt
- Pipedrive

Action:
- Send reminder messages before the meeting. (3 days before, 24hrs before, 1hr Before. Only if applicable. We have templates for each already)
- Log each reminder as an activity in Pipedrive. (Activity logged as done)

### Step 3: Attendance Resolution

Source:
- owner update
- calendar-based logic
- manual reconciliation

Branch:
- attended
- not attended
- unresponsive

### Step 4: If Attended

Target:
- Pipedrive. 

Action:
- Move stage from `Initial Event Scheduled` to `Event Attended`. (Deal Owner should get a whatsapp message to ask them if the user has attended, based on their answer in message button reply, we move them to event attended, if manually moved by deal owner already, we dont treat it as error rather we add a note in pipedrive saying deal moved into event attended by Deal owner. )
- Set label = `107` `1on1 - Attended`

### Step 5: If Not Attended Or Unresponsive

Systems:
- Interakt
- Pipedrive

Action:
- Send follow-up asking user to book again. (If deal owner says usr not attended trigger a message to ask them to book again)
- Push the deal back to a rebooking state. (Move the deal back to Lead_In, label them as 1on1 no show label  )


## Flow 4: Fit -> Reschedule Call Path

This is the corrected behavior from user clarification.

### Step 1: User Clicks `Reschedule Call`

Source:
- Interakt button callback

### Step 2: Cancel Existing Prebooked Event

Source:
- stored Google Calendar event id

System:
- Google Calendar

Action:
- Cancel the already created event from the assigned owner's calendar.

### Step 3: Acknowledge The User

System:
- Interakt / WhatsApp

Action:
- Send acknowledgement message that the original slot has been released.
- Tell the user to book a new slot as soon as possible.

### Step 4: Send Owner Booking Link

Systems:
- owner routing config
- Calendly
- Interakt

Action:
- Send the assigned owner's self-booking link via whatsapp.

### Step 5: Update Pipedrive

Target:
- Pipedrive

Action:
- set label = `105` `1on1 - Awaiting`
- clear or replace `1on1 Meeting Date & Time`
- add note/activity saying:
  - user chose reschedule on "Date and time"
  - old event was canceled
  - new booking link was sent

### Step 6: User Books New Slot

Source:
- Calendly booking webhook

Systems:
- Calendly
- Google Calendar
- Pipedrive
- Interakt

Action:
- receive booked slot
- ensure event exists in owner's calendar
- update Pipedrive with the new date/time. If activity doesnt exist add activity and add appropriate time and date.
- set label = `106` `1on1 - Pending`
- send confirmation WhatsApp

## Flow 5: Direct Webinar Route

This route applies when the user already selected `Schedule Webinar` in Typeform.

### Step 1: Webinar Path Already Chosen

Source:
- Typeform submission

Action:
- The user has already opted into the webinar path.
- They should enter the webinar flow directly.

Pipedrive update:
- move stage to `Lead In`. IF user selects webinar in typeform, we usually only add them in Lead_In.
- label = `111` `Scheduled Webinar - Pending`

### Step 2: Webinar Registration / Confirmation

Source:
- Typeform path selection and/or Calendly webinar registration event

Systems:
- Calendly
- Interakt
- Pipedrive

Action:
- Confirm the webinar booking with Whatsapp Message.
- Ensure the lead is in the webinar reminder flow.

Pipedrive update:
- label = `111` `Scheduled Webinar - Pending`

### Step 3: Webinar Reminder Sequence

Systems:
- Interakt
- Pipedrive

Action:
- Send reminder sequence such as:
  - confirmation
  - 3 days before
  - 24 hours before
  - same day

Pipedrive activity:
- log reminders

### Step 4: Webinar Attendance

Potential sources:
- Zoom attendance
- webinar platform webhook
- manual update

Branch:
- attended
- not attended

### Step 5: If Webinar Attended

Target:
- Pipedrive

Action:
- move to `Initial Event Scheduled`
- set label = `112` `Scheduled Webinar - Attended`
- Wait 24hrs and send message with prebooked call for 1on1 and change label to 1on1-TBC. (Which is basically the 1on1 offer flow. Pls check that too ## Flow 7)

Then:
- wait 1 day
- move into post-webinar 1:1 offer flow

### Step 6: If Webinar Not Attended

Systems:
- Interakt
- Pipedrive

Action:
- send follow-up inviting user to register for the upcoming webinar

Recommended Pipedrive state:
- remain in `Lead In`
- set or retain webinar re-engagement label/state

## Flow 6: Webinar CTA Route

This route only applies if the business still wants a separate system-driven webinar push for leads who did not directly choose webinar in Typeform. (This is mostly not required as only two outcomes come out of our Typeform.)

### Step 1: Send Webinar CTA

Source:
- qualification or another business rule

Systems:
- Interakt
- Calendly

Action:
- Send message with `Register for Webinar` button.
- Webinar link should be pipeline-specific.

Pipedrive update:
- move stage to `Lead In`
- label = `110` `Scheduled Webinar - Awaiting`

### Step 2: Webinar Registration

Source:
- Calendly webinar registration webhook

Systems:
- Calendly
- Pipedrive

Action:
- Detect webinar registration.

Pipedrive update:
- label = `111` `Scheduled Webinar - Pending`

## Flow 7: Post-Webinar -> 1:1 Offer

This is the same 1:1 logic as the fit path, but triggered after webinar attendance.

### Step 1: Wait 1 Day

Source:
- webinar attendance event

System:
- Windmill delay / schedule

### Step 2: Prebook 1:1 With Owner

Systems:
- Google Calendar
- owner routing config
- Pipedrive

Action:
- create prebooked event
- write datetime to Pipedrive
- set label = `115` `1on1 - TBC`

### Step 3: Send Prebooked 1:1 Message

System:
- Interakt

Buttons:
- `Confirm Attendance`
- `Reschedule Call`

### Step 4: Reuse Existing 1:1 Subflows

Reuse:
- confirm attendance flow
- reschedule flow
- reminders
- attendance reconciliation

## Canonical State Model

Use these states consistently to avoid ambiguity:

- `Initial Event Scheduled`
  - lead is waiting for first event action
- `115` `1on1 - TBC`
  - a slot was prebooked by the system. TBC is bascially we asking them confirmation. TBC stands for to be confirmed.
- `105` `1on1 - Awaiting`
  - user must self-book a new slot. After they said "Reschedule the call"
- `106` `1on1 - Pending`
  - a confirmed future 1:1 exists. And it is pending to be done.
- `107` `1on1 - Attended`
  - 1:1 call happened
- `110` `Scheduled Webinar - Awaiting`
  - webinar CTA sent, waiting for registration. This only happens for 1on1 unfit leads.
- `111` `Scheduled Webinar - Pending`
  - webinar selected or registered, awaiting attendance.
- `112` `Scheduled Webinar - Attended`
  - webinar attended
- `Event Attended`
  - final attended event state in the pipeline. For 1on1, as webinar attended guys will be moved to Iitial Event Scheduled stage where they are supposed to book 1on1 slot. Or we keep them in Lead_In only and then send them to initial event scheduled once booked 1on1 call or once we prebook it??  If they say reschedule or unresponsive, we already have a flow to move them to Lead IN. We need to get certain here.

## Recommended Windmill Automation Split

Do not build this as one giant flow. Split by trigger and responsibility.

### 1. Typeform Intake

Owns:
- Typeform submission handling
- Pipedrive deal/person creation or update
- initial pipeline and stage routing

### 2. Lead Qualification

Owns:
- reading qualification answer
- AI fit/unfit decision
- optional qualification signal for downstream decisions

### 3. Fit 1:1 Kickoff

Owns:
- prebooked event creation
- Pipedrive TBC update
- sending first prebooked WhatsApp

### 4. Interakt Callback Handler

Owns:
- `Confirm Attendance`
- `Reschedule Call`
- future WhatsApp button callbacks

### 5. Reschedule Handler

Owns:
- cancel Google Calendar event
- send new owner booking link
- move label to `1on1 - Awaiting`

### 6. Calendly Booking Handler

Owns:
- receiving booked slot
- updating Pipedrive datetime
- moving label to `1on1 - Pending`
- sending booking confirmation

### 7. 1:1 Reminder And Attendance Handler

Owns:
- sending reminders
- attendance/no-show follow-up
- final move to `Event Attended`

### 8. Webinar Kickoff

Owns:
- direct webinar entry from Typeform
- or sending webinar CTA when needed
- stage move to `Lead In`
- webinar label updates

### 9. Webinar Registration Handler

Owns:
- registration confirmation
- webinar reminder scheduling
- Pipedrive pending update

### 10. Webinar Attendance Handler

Owns:
- attended / not attended resolution
- move to webinar-attended state
- handoff to post-webinar 1:1 flow

### 11. Post-Webinar 1:1 Kickoff

Owns:
- wait-1-day logic
- prebooked 1:1 after webinar
- handoff into the same 1:1 subflows

## Owner Routing Requirements

The funnel should support owner-specific configuration.

Per owner define:

- owner id / owner name in Pipedrive
- Google Calendar account/resource
- Google Calendar id
- Calendly 1:1 booking link
- display name for WhatsApp messaging

For the current use case, this should support at least:

- Vivek
- Rakesh

## Open Questions

These must be finalized before implementation:

- What exactly creates the initial Pipedrive deal today?
- What is the exact Typeform field/key that stores:
  - `Schedule 1on1 Call`
  - `Schedule Webinar`
- What is the exact source of webinar attendance?
  - Zoom
  - Calendly
  - manual owner update
  - something else
- Should missed 1:1 always move to `1on1 - Awaiting`, or sometimes back to `1on1 - TBC`?
- Which Interakt templates already exist and which must be created?
- Which Calendly links belong to which owners?
- Which Google calendars should Windmill write to for Vivek and Rakesh?

## Build Notes

When implementing in Windmill:

- keep business state in Pipedrive
- keep external credentials in Windmill resources and variables
- keep callback handlers idempotent
- store Google event ids for safe cancellation
- store Interakt callback identifiers if needed for deduplication
- isolate owner mapping in config instead of hardcoding names in logic

## Final Certainty Decisions To Lock

These are the decisions I recommend locking as the final version unless the business wants something different.

### 1. Primary Top-Level Route

- Typeform route selection is the primary entry decision.
- `Schedule 1on1 Call` -> direct 1:1 route
- `Schedule Webinar` -> direct webinar route
- AI qualification should not override this route choice.

### 2. Webinar Route Entry State

For leads who selected webinar in Typeform:

- stage = `Lead In`
- label = `111` `Scheduled Webinar - Pending`

Do not send an additional webinar CTA first.

### 3. Webinar Attendance Progression

For webinar-selected leads:

- stay in `Lead In` while webinar is pending
- if webinar attended, set label = `112` `Scheduled Webinar - Attended`
- wait 24 hours
- when the system prebooks the next 1:1, move them to `Initial Event Scheduled`
- at that moment set label = `115` `1on1 - TBC`

Recommended certainty:

- do not move to `Initial Event Scheduled` immediately after webinar attendance
- move only when the 1:1 process actually begins

### 4. 1:1 Reschedule Logic

If user clicks `Reschedule Call`:

- cancel the owner's current calendar event
- send acknowledgement message
- send owner booking link
- label = `105` `1on1 - Awaiting`
- clear or replace meeting date/time

### 5. 1:1 Confirmation Logic

If user clicks `Confirm Attendance`:

- keep the event
- label = `106` `1on1 - Pending`
- send reminder sequence

### 6. No Response To Prebooked 1:1 Message

Recommended certainty:

- wait 24 hours
- send reminder to choose `Confirm Attendance` or `Reschedule Call`
- wait another 6 hours
- if still no response:
  - cancel the calendar event
  - send booking-link message
  - label = `105` `1on1 - Awaiting`

This is cleaner than leaving an unconfirmed event on the owner's calendar.

### 7. 1:1 No-Show State

Recommended certainty:

- do not move 1:1 no-shows back to `Lead In`
- keep them in the 1:1 lifecycle
- use labels to track the state:
  - `108` `1on1 - No-Show`
  - then `105` `1on1 - Awaiting` if they need to self-book again

Reason:

- `Lead In` should stay webinar-oriented
- 1:1 no-shows are already further down the funnel than webinar leads

### 8. Owner Attendance Confirmation

Recommended certainty:

- after the scheduled 1:1 time passes, send a WhatsApp prompt to the owner asking whether the user attended
- if owner confirms attended:
  - move stage to `Event Attended`
  - label = `107` `1on1 - Attended`
- if owner confirms not attended:
  - label = `108` `1on1 - No-Show`
  - trigger rebooking flow
- if owner manually already moved the deal:
  - do not error
  - add an informational note only

### 9. Webinar Attendance Source

Recommended certainty:

- Calendly is registration capture
- Zoom is attendance source
- Windmill should create or assign the user to the correct Zoom meeting for the webinar
- webinar attendance should be resolved from Zoom participant/registrant data

### 10. Vivek And Rakesh Booking Model

Recommended certainty:

- Vivek:
  - use Calendly for booking links
  - use Google Calendar for actual event creation or reconciliation
- Rakesh:
  - use Google Calendar booking / availability flow directly

## Interakt Template Registry Placeholder

Fill this section with the actual Interakt template ids, template names, variables, and button payloads.

### Template 1: Prebooked 1:1 Offer

- Placeholder key: `interakt_1on1_prebooked_offer`
- Purpose: send the first prebooked 1:1 message
- Trigger:
  - after system prebooks a 1:1
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Buttons:
  - `Confirm Attendance`
  - `Reschedule Call`
- Variables required:
  - `deal_title`
  - `collective_name`
  - `owner_name`
  - `meeting_date`
  - `meeting_time`
  - `meeting_datetime_display`
  - `phone_number`
  - `deal_id`
  - `pipeline_id`
- Callback payload placeholders:
  - `confirm_attendance`
  - `reschedule_call`

### Template 2: 1:1 Response Reminder

- Placeholder key: `interakt_1on1_prebooked_response_reminder`
- Purpose: remind the lead to confirm or reschedule
- Trigger:
  - 24 hours after prebooked offer if no response
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Buttons:
  - `Confirm Attendance`
  - `Reschedule Call`
- Variables required:
  - `deal_title`
  - `collective_name`
  - `owner_name`
  - `meeting_date`
  - `meeting_time`
  - `meeting_datetime_display`
  - `phone_number`
  - `deal_id`

### Template 3: Reschedule Acknowledgement

- Placeholder key: `interakt_1on1_reschedule_ack`
- Purpose: acknowledge reschedule and tell user to book again
- Trigger:
  - immediately after user clicks `Reschedule Call`
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Buttons:
  - optional `Book a Slot`
- Variables required:
  - `deal_title`
  - `owner_name`
  - `old_meeting_date`
  - `old_meeting_time`
  - `booking_link`
  - `phone_number`
  - `deal_id`

### Template 4: Booking Link Message

- Placeholder key: `interakt_1on1_booking_link`
- Purpose: send self-booking link after reschedule or no response
- Trigger:
  - after reschedule acknowledgement
  - or after no response timeout cancellation
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Buttons:
  - `Book a Slot`
- Variables required:
  - `deal_title`
  - `owner_name`
  - `collective_name`
  - `booking_link`
  - `booking_deadline_text`
  - `phone_number`
  - `deal_id`

### Template 5: Booking Confirmation

- Placeholder key: `interakt_1on1_booking_confirmation`
- Purpose: confirm the newly booked 1:1 slot
- Trigger:
  - after Calendly or booking flow confirms a new slot
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Variables required:
  - `deal_title`
  - `owner_name`
  - `collective_name`
  - `meeting_date`
  - `meeting_time`
  - `meeting_datetime_display`
  - `phone_number`
  - `deal_id`

### Template 6: 1:1 Reminder 3 Days

- Placeholder key: `interakt_1on1_reminder_3d`
- Purpose: 3-day reminder before 1:1
- Trigger:
  - 3 days before meeting if applicable
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Variables required:
  - `deal_title`
  - `owner_name`
  - `meeting_date`
  - `meeting_time`
  - `meeting_datetime_display`
  - `phone_number`
  - `deal_id`

### Template 7: 1:1 Reminder 24 Hours

- Placeholder key: `interakt_1on1_reminder_24h`
- Purpose: 24-hour reminder before 1:1
- Trigger:
  - 24 hours before meeting if applicable
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Variables required:
  - `deal_title`
  - `owner_name`
  - `meeting_date`
  - `meeting_time`
  - `meeting_datetime_display`
  - `phone_number`
  - `deal_id`

### Template 8: 1:1 Reminder 1 Hour

- Placeholder key: `interakt_1on1_reminder_1h`
- Purpose: 1-hour reminder before 1:1
- Trigger:
  - 1 hour before meeting if applicable
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Variables required:
  - `deal_title`
  - `owner_name`
  - `meeting_date`
  - `meeting_time`
  - `meeting_datetime_display`
  - `phone_number`
  - `deal_id`

### Template 9: 1:1 No-Show Rebooking Prompt

- Placeholder key: `interakt_1on1_no_show_rebook`
- Purpose: ask no-show lead to book again
- Trigger:
  - owner confirms user did not attend
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Buttons:
  - `Book a Slot`
- Variables required:
  - `deal_title`
  - `owner_name`
  - `collective_name`
  - `booking_link`
  - `phone_number`
  - `deal_id`

### Template 10: Webinar Confirmation

- Placeholder key: `interakt_webinar_confirmation`
- Purpose: confirm the webinar booking / path entry
- Trigger:
  - webinar selected in Typeform
  - and/or webinar registration confirmed
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Variables required:
  - `deal_title`
  - `collective_name`
  - `webinar_name`
  - `webinar_date`
  - `webinar_time`
  - `webinar_datetime_display`
  - `join_link_or_registration_ref`
  - `phone_number`
  - `deal_id`

### Template 11: Webinar Reminder 3 Days

- Placeholder key: `interakt_webinar_reminder_3d`
- Purpose: 3-day webinar reminder
- Trigger:
  - 3 days before webinar if applicable
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Variables required:
  - `deal_title`
  - `collective_name`
  - `webinar_name`
  - `webinar_date`
  - `webinar_time`
  - `webinar_datetime_display`
  - `join_link`
  - `phone_number`
  - `deal_id`

### Template 12: Webinar Reminder 24 Hours

- Placeholder key: `interakt_webinar_reminder_24h`
- Purpose: 24-hour webinar reminder
- Trigger:
  - 24 hours before webinar if applicable
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Variables required:
  - `deal_title`
  - `collective_name`
  - `webinar_name`
  - `webinar_date`
  - `webinar_time`
  - `webinar_datetime_display`
  - `join_link`
  - `phone_number`
  - `deal_id`

### Template 13: Webinar Reminder Same Day

- Placeholder key: `interakt_webinar_reminder_same_day`
- Purpose: same-day webinar reminder
- Trigger:
  - same day before webinar
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Variables required:
  - `deal_title`
  - `collective_name`
  - `webinar_name`
  - `webinar_date`
  - `webinar_time`
  - `webinar_datetime_display`
  - `join_link`
  - `phone_number`
  - `deal_id`

### Template 14: Upcoming Webinar Reinvite

- Placeholder key: `interakt_webinar_upcoming_reinvite`
- Purpose: send user to upcoming webinar after missing the previous one
- Trigger:
  - webinar not attended
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Buttons:
  - `Register for Webinar`
- Variables required:
  - `deal_title`
  - `collective_name`
  - `upcoming_webinar_name`
  - `upcoming_webinar_date`
  - `upcoming_webinar_time`
  - `upcoming_webinar_registration_link`
  - `phone_number`
  - `deal_id`

### Template 15: Post-Webinar 1:1 Offer

- Placeholder key: `interakt_post_webinar_1on1_offer`
- Purpose: send the 1:1 prebooked offer after webinar attendance
- Trigger:
  - 24 hours after webinar attended
- Recipient:
  - lead
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Buttons:
  - `Confirm Attendance`
  - `Reschedule Call`
- Variables required:
  - `deal_title`
  - `collective_name`
  - `owner_name`
  - `meeting_date`
  - `meeting_time`
  - `meeting_datetime_display`
  - `phone_number`
  - `deal_id`

### Template 16: Owner Attendance Check

- Placeholder key: `interakt_owner_attendance_check`
- Purpose: ask owner whether the lead attended the 1:1
- Trigger:
  - after scheduled 1:1 time has passed
- Recipient:
  - deal owner
- Suggested template id: `TODO`
- Suggested template name: `TODO`
- Buttons:
  - `Attended`
  - `Not Attended`
- Variables required:
  - `owner_name`
  - `deal_title`
  - `deal_id`
  - `meeting_date`
  - `meeting_time`
  - `pipeline_name`
  - `stage_name`

## Interakt Template Metadata Checklist

For every Interakt template, fill the following:

- placeholder key
- actual Interakt template id
- actual Interakt template name
- recipient type
  - lead
  - owner
- trigger automation
- trigger condition
- button labels
- button callback payloads
- required variables
- example payload
- fallback behavior if template send fails
