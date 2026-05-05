# Typeform to Pipedrive Intake Mapping

Working spec for the first Windmill migration: Typeform webhook intake into Pipedrive.

## Scope

This automation should only:

- Receive Typeform webhook payloads from the active collective forms.
- Detect whether the submission is for `1on1` or `webinar`.
- Create/update the person in Pipedrive.
- Create/update the deal in the correct collective pipeline.
- Set the first Pipedrive stage/label needed for downstream automations.
- Store raw webhook identifiers and relevant Typeform answers for traceability.

This automation should not yet:

- Send WhatsApp messages via Interakt.
- Book, cancel, or inspect Google Calendar events.
- Touch Calendly beyond preserving submitted Calendly invitee URLs for webinar submissions.
- Trigger Zoom attendance checks.
- Run AI synthesis.

## Active Typeform Forms

| Collective | Typeform ID | Title | Pipeline ID |
|---|---:|---|---:|
| Bhopal | `CYae8hmZ` | `Bhopal Collective [In-use]` | `4` |
| Hammiyala | `hbDB2ybS` | `Hammiyala Collective [In-use]` | `1` |
| Mumbai | `kfcjiXxR` | `Mumbai Collective [In-use]` | `2` |
| Poomaale 2.0 | `i8eBLQkz` | `Poomaale 2.0 Collective [In-use]` | `3` |

Local snapshots:

- `snapshots/typeform/forms_index.json`
- `snapshots/typeform/in_use_forms_index.json`
- `snapshots/typeform/in_use_forms/*.definition.json`
- `snapshots/typeform/in_use_forms/*.webhooks.json`
- `typeform_webhook_payload/*.json`

## Route Detection

The captured webhook payloads do not include the `Next Steps...` answer directly. Route should be inferred from the branch-specific answer present in the payload.

Rule:

- If the submission has a `calendly` answer for `Select Your Slot for the Webinar`, route as `webinar`.
- Else if the submission has an answer for `Why is joining this collective important to you?`, route as `1on1`.
- Else mark route as `unknown` and do not create/update a deal unless explicitly allowed in dry-run output.

## Branch Fields

| Collective | Route Field Ref | 1on1 Answer Ref | Webinar Calendly Ref |
|---|---|---|---|
| Bhopal | `a50ae324-f0c7-4534-a4f6-f64a1ed2d134` | `113a9ad4-4d43-4165-9bf7-62f82b1352ab` | `a2ff21bd-fc13-4d10-a3ab-f92a46e1864c` |
| Hammiyala | `635490eb-1089-4b60-aa73-496c3b0b081e` | `f8e95240-2bd9-4522-8eac-53860c400950` | `a2ff21bd-fc13-4d10-a3ab-f92a46e1864c` |
| Mumbai | `717045a6-1120-409f-a88d-1ee0ff018f2d` | `1292d853-e1d7-438a-8f82-70fbad90e914` | `fb9d0477-730b-486c-8e9b-59b07ded1583` |
| Poomaale 2.0 | `df3211c5-7fd2-4b55-92ee-6bd655cf6721` | `4c30971d-c15d-42f8-90d1-94c19a475c4d` | `717327eb-16b7-42ec-bee1-cdbb5cbea73d` |

## Sample Payload Resolution

| File | Form | Route | Evidence |
|---|---|---|---|
| `bhopal.json` | Bhopal | `1on1` | Has 1on1 answer ref `113a9ad4-4d43-4165-9bf7-62f82b1352ab`; no Calendly answer |
| `hammiyala.json` | Hammiyala | `webinar` | Has Calendly answer ref `a2ff21bd-fc13-4d10-a3ab-f92a46e1864c` |
| `mumbai.json` | Mumbai | `1on1` | Has 1on1 answer ref `1292d853-e1d7-438a-8f82-70fbad90e914`; no Calendly answer |
| `poomaale2.json` | Poomaale 2.0 | `webinar` | Has Calendly answer ref `717327eb-16b7-42ec-bee1-cdbb5cbea73d` |

## Pipedrive Stage Mapping

| Collective | Pipeline ID | Lead In | Initial Event Scheduled | Event Attended |
|---|---:|---:|---:|---:|
| Hammiyala | `1` | `10` | `1` | `2` |
| Mumbai | `2` | `13` | `14` | `15` |
| Poomaale 2.0 | `3` | `20` | `21` | `22` |
| Bhopal | `4` | `37` | `30` | `31` |

Final first-stage behavior:

- `webinar`: create/update deal in `Lead In`, label `111 Scheduled Webinar - Pending`.
- `1on1`: create/update deal in `Initial Event Scheduled`, label `115 1on1 - TBC`.

## Pipedrive Labels

| Label ID | Meaning |
|---:|---|
| `105` | `1on1 - Awaiting` |
| `106` | `1on1 - Pending` |
| `107` | `1on1 - Attended` |
| `110` | `Scheduled Webinar - Awaiting` |
| `111` | `Scheduled Webinar - Pending` |
| `112` | `Scheduled Webinar - Attended` |
| `115` | `1on1 - TBC` |

## Confirmed Decisions

1. Windmill path: `/f/sales/typeform_to_pipedrive_intake`.
2. `1on1` initial label: `115 1on1 - TBC`.
3. First automation sends no WhatsApp; Typeform to Pipedrive only.
4. Duplicate matching: person by email first, then phone.
5. Webinar Calendly invitee URL should be saved into Pipedrive `Meeting URL`.

`105 1on1 - Awaiting` is reserved for the WhatsApp reschedule path, after the user taps/sends the reschedule intent.

## Typeform Webhook

Created on all four active `[In-use]` forms:

- Tag: `windmill_pipedrive_intake`
- URL: `https://windmill.devsharsha.live/api/r/typeform/pipedrive/intake`
- Enabled: `false` while fixing first-run validation
- SSL verification: `true`
- Windmill trigger should be `async`, not `sync`, so Typeform receives an immediate response and does not cancel jobs after its HTTP timeout.

Existing Phoenix webhooks were left untouched.
