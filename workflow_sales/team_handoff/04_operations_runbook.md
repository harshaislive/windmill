# 04 Operations Runbook

This runbook is for checking, testing, deploying, and troubleshooting the Windmill sales automations.

## Safe Testing Rules

Use `dry_run: true` unless you intentionally want side effects.

Dry-run means:

- No Pipedrive writes.
- No WhatsApp messages.
- No Google Calendar create/cancel.
- No Zoom registrations.
- No reminder jobs scheduled.

Exception: some dry-runs still read live external systems such as Pipedrive, Calendly availability, Google Calendar free/busy, and Zoom meeting lists.

### Vivek Calendly reconciliation

Run `f/sales/reconcile_vivek_calendly_bookings` with `dry_run=true`, `lookback_days=7`, `lookahead_days=60`, and `max_writes=0` before changing its matching rules. A safe result lists masked invitee emails and reports matched, ambiguous, unmatched, canceled, and out-of-scope records without writing.

Live matching is restricted to open Vivek-owned deals in Mumbai pipeline `2` and Bhopal pipeline `4`. UTM campaign selects the pipeline; without UTM, exactly one eligible deal must remain. After a live run, repeat the dry-run and verify `update_deal=false`, `create_call_activity=false`, and `create_audit_activity=false` for the synced booking. Hammiyala/Poomaale must never appear as candidates.

## Common Test Commands

Typeform intake dry-run:

```powershell
$raw = Get-Content -Raw typeform_webhook_payload\mumbai.json
$jsonText = $raw.Substring($raw.IndexOf('{'))
$payload = $jsonText | ConvertFrom-Json
$data = @{ body = $payload; dry_run = $true } | ConvertTo-Json -Depth 100 -Compress
wmill script run f/sales/typeform_to_pipedrive_intake -d $data -s
```

Legacy/internal 1on1 calendar prebook dry-run (not called by the live fit-lead route):

```powershell
wmill script run f/sales/calendar_prebook_1on1 -d '{"deal_id":12662,"dry_run":true,"send_whatsapp":false}' -s
```

Reschedule worker dry-run:

```powershell
wmill script run f/sales/interakt_reschedule_requested_worker -d '{"route":{"deal_id":12662,"callback_data":"pipedrive_deal:12662:1on1_prebooked","button_text":"Reschedule Call"},"dry_run":true}' -s
```

Owner no-show worker dry-run:

```powershell
wmill script run f/sales/interakt_owner_no_show_worker -d '{"route":{"deal_id":12662,"callback_data":"pipedrive_deal:12662:owner_not_attended","button_text":"Not Attended"},"dry_run":true}' -s
```

1on1 reminders dry-run:

```powershell
wmill script run f/sales/send_1on1_reminders -d '{"dry_run":true,"max_deals":1}' -s
```

Webinar worker synthetic dry-run:

```powershell
$payload = @{
  payload = @{
    email = "qa.windmill@example.com"
    name = "Windmill QA"
    text_reminder_number = "+919999999999"
    scheduled_event = @{
      name = "Mumbai Collective Introduction - Webinar"
      start_time = "2026-05-22T14:30:00Z"
      uri = "https://api.calendly.com/scheduled_events/test"
    }
    uri = "https://api.calendly.com/scheduled_events/test/invitees/test"
  }
}
$data = @{ calendly_payload = $payload; dry_run = $true } | ConvertTo-Json -Depth 100 -Compress
wmill script run f/sales/create_webinar_activity_from_calendly -d $data -s
```

Contained Calendly-to-Zoom live run after approval:

```powershell
# Precondition: Windmill variable f/sales/calendly_zoom_registration_enabled is set to true.
# Keep schedule_attendance_checks false so only Zoom registration, Pipedrive update,
# confirmation WhatsApp, and one-off reminder jobs run.
$data = @{ calendly_payload = $payload; dry_run = $false; schedule_attendance_checks = $false } | ConvertTo-Json -Depth 100 -Compress
wmill script run f/sales/create_webinar_activity_from_calendly -d $data -s
```

Google Calendar smoke test:

```powershell
wmill script run f/sales/calendar_prebook_1on1_smoke_test -d '{}' -s
```

Zoom sync dry-run:

```powershell
wmill script run f/collectives/zoom_collective_to_pipedrive -d '{"dry_run":true}' -s
```

## Deploying Script Changes

After editing Windmill scripts locally:

```powershell
wmill generate-metadata f\sales --yes
```

Push only the touched script when possible:

```powershell
wmill script push f\sales\<script_name>.ts --message "Short deploy message"
```

For broad syncs, always dry-run first:

```powershell
wmill sync push --dry-run --skip-variables --skip-resources
```

Avoid `--show-diffs` when secrets might be present.

## Monitoring Jobs

Recent jobs:

```powershell
wmill job list
```

Inspect a job:

```powershell
wmill job get <job_id> --json
```

Read logs:

```powershell
wmill job logs <job_id>
```

Read result:

```powershell
wmill job result <job_id>
```

## Troubleshooting Playbooks

### Typeform Deal Missing Or Wrong

Check:

- Is the Typeform webhook active on the in-use form?
- Did Windmill receive a job for `f/sales/typeform_to_pipedrive_intake`?
- Did the intake route parse as `webinar` or `1on1`?
- Did Pipedrive person search find an old person by email/phone?
- Did the Typeform answer ref map to the expected custom field?

If Azure fit failed:

- Look for open Pipedrive activity subject `Review fit manually`.
- Human should inspect Typeform answers and set the correct label/stage.

### Fit 1on1 Did Not Send The Team Scheduling Notice

Check deal:

- Label contains `115` 1on1 TBC.
- Stage is one of the Initial Event Scheduled stages.
- Meeting datetime and meeting URL fields are empty.

Check Windmill:

- `02A` Pipedrive webhook job exists.
- `02B` did not return ignored.
- `02C` sent `collective_1on1_team_scheduling_notice` and logged `1on1 team scheduling notice sent`.
- The owner touchbase queue was created for 24 hours later.

Do not expect `02B` to call `03A` or prebook a calendar slot. `03A` is now internal/manual only.

### Vivek Calendly Booking Did Not Sync

Check:

- The booking uses the configured Vivek event type.
- Invitee email exactly matches a Pipedrive person attached to an open Vivek-owned deal.
- Bhopal uses `utm_campaign=bhopal` and pipeline `4`; Mumbai uses `utm_campaign=mumbai` and pipeline `2`.
- If UTM is missing, exactly one eligible Bhopal/Mumbai deal remains.
- The `14B` schedule is enabled and the latest job ran at one of 8:37 AM, 11:37 AM, 3:37 PM, or 7:37 PM IST.
- A dry-run reports the record as `matched`, not `ambiguous`, `unmatched`, or `out_of_scope`.

After a successful live sync, confirm the deal has a `calendly:` meeting reference, the meeting datetime, an open Vivek-owned activity, and the done `Vivek Calendly booking synced` admin activity. This reference is also the Bhopal/Mumbai nurture stop signal.

### Reschedule Did Not Work

Check:

- Interakt inbound webhook signed request reached `05A`.
- Router classified action as `reschedule_requested`.
- Callback data includes `pipedrive_deal:<id>`.
- For legacy Google Calendar bookings, Pipedrive meeting reference ID contains the calendar event reference. Vivek Calendly cancellations/reschedules are handled separately by `14A` using the `calendly:` reference.

If calendar event was not found, the worker still logs an admin audit activity with cancel result.

### WhatsApp Message Not Sent Or Not Delivered

Check:

- Interakt API key variable is present.
- Template name and ID still exist and are approved.
- Person/deal phone number is usable.
- For delivery failures, look for open Pipedrive activity subject `WhatsApp failed to deliver`.
- The activity note should show the Interakt error code and short reason, for example `131049`.

### Webinar Booking Did Not Register In Zoom

Check:

- Calendly event name contains supported collective name.
- Zoom has a webinar near the Calendly start time.
- Zoom credentials can mint access token.
- The invitee was not already registered under another email.

### Reminder Did Not Send

Check:

- Deal has the correct label.
- Meeting/webinar datetime is in the future.
- Current time is within the reminder window.
- A done Pipedrive activity with the same subject does not already exist.

## Manual Recovery Patterns

If automation failed before label transition:

- Set the correct Pipedrive label/stage manually.
- Let the next webhook/schedule pick it up.

If automation failed after external action but before audit:

- Do not blindly rerun without checking side effects.
- Check the relevant source first: Vivek Calendly for Bhopal/Mumbai brochure bookings, the Rakesh post-brochure Typeform for Hammiyala/Poomaale, then Interakt and Pipedrive fields. Check Google Calendar/Zoom only for legacy or explicitly gated paths.
- If safe, rerun with explicit `dry_run:false` only on the narrow worker.

If duplicate Pipedrive deals exist:

- This is acceptable when the same person signs up for different collectives.
- Ensure the deal owner follows collective routing.
- Do not merge deals across collectives unless the business team explicitly wants it.
