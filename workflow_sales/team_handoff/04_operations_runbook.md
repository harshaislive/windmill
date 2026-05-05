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

## Common Test Commands

Typeform intake dry-run:

```powershell
$raw = Get-Content -Raw typeform_webhook_payload\mumbai.json
$jsonText = $raw.Substring($raw.IndexOf('{'))
$payload = $jsonText | ConvertFrom-Json
$data = @{ body = $payload; dry_run = $true } | ConvertTo-Json -Depth 100 -Compress
wmill script run f/sales/typeform_to_pipedrive_intake -d $data -s
```

1on1 calendar prebook dry-run:

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

### 1on1 Did Not Prebook

Check deal:

- Label contains `115` 1on1 TBC.
- Stage is one of the Initial Event Scheduled stages.
- Meeting datetime and meeting URL fields are empty.

Check Windmill:

- `02A` Pipedrive webhook job exists.
- `02B` did not return ignored.
- `03A` dry-run finds a slot.

If no slot:

- Deal should move to label `105` 1on1 Awaiting.
- Lead should receive booking link fallback.
- Beforest Admin should see audit activity.

### Reschedule Did Not Work

Check:

- Interakt inbound webhook signed request reached `05A`.
- Router classified action as `reschedule_requested`.
- Callback data includes `pipedrive_deal:<id>`.
- Pipedrive meeting reference ID contains a Google Calendar event reference.

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
- Check Google Calendar, Interakt, Zoom, and Pipedrive fields.
- If safe, rerun with explicit `dry_run:false` only on the narrow worker.

If duplicate Pipedrive deals exist:

- This is acceptable when the same person signs up for different collectives.
- Ensure the deal owner follows collective routing.
- Do not merge deals across collectives unless the business team explicitly wants it.
