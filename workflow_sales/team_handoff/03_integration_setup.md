# 03 Integration Setup

This document lists the external systems and Windmill configuration needed to keep the automations running. Do not paste secret values into docs.

## Windmill Workspace

Workspace: `beforest-automations`

Base URL: `https://windmill.devsharsha.live`

Local export root: `D:\AI Apps\windmill`

## Public Webhook URLs

| System | Configure this URL | Notes |
| --- | --- | --- |
| Typeform | `https://windmill.devsharsha.live/api/r/typeform/pipedrive/intake` | Active on the four in-use collective forms. |
| Pipedrive | `https://windmill.devsharsha.live/api/r/pipedrive/1on1/tbc/prebook` | Deal-change webhook for label/stage changes. |
| Calendly main account | `https://windmill.devsharsha.live/api/r/calendly/webinar/pipedrive/activity` | Organization-scope `invitee.created` webhook. |
| Interakt | `https://windmill.devsharsha.live/api/r/interakt/whatsapp/inbound` | Single signed webhook for all inbound WhatsApp responses. |

## Windmill Variables

| Variable path | Secret? | Purpose |
| --- | --- | --- |
| `f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key` | Yes | Pipedrive API token. Used by most sales scripts. |
| `f/collectives/zoom_collective_to_pipedrive/zoom_account_id` | No | Zoom Server-to-Server OAuth account id. |
| `f/collectives/zoom_collective_to_pipedrive/zoom_authorization_basic` | Yes | Zoom Basic auth credential used to mint access tokens. |
| `f/sales/calendar_prebook_1on1/google_service_account_json` | Yes | Google service account JSON with domain-wide calendar delegation. |
| `f/sales/calendar_prebook_1on1/owner_calendar_map` | Yes | Maps owner aliases to calendar emails. |
| `f/sales/calendar_prebook_1on1/owner_booking_windows` | Yes | Booking windows per owner. |
| `f/sales/calendar_prebook_1on1/owner_event_title_templates` | Yes | Calendar event title templates. |
| `f/sales/calendar_prebook_1on1/owner_booking_link_map` | Yes | Owner booking links used in fallback/reschedule messages. |
| `f/sales/calendar_prebook_1on1/default_duration_minutes` | Yes | Current 1on1 duration, usually `30`. |
| `f/sales/calendar_prebook_1on1/timezone` | Yes | Usually `Asia/Kolkata`. |
| `f/sales/calendar_prebook_1on1/calendly_vivek_token` | Yes | Vivek Calendly token for availability lookup only. |
| `f/sales/calendar_prebook_1on1/calendly_vivek_event_type_uri` | Yes | Vivek 1on1 Calendly event type URI. |
| `f/sales/calendar_prebook_1on1/interakt_api_key` | Yes | Interakt Public API key. |
| `f/sales/calendar_prebook_1on1/interakt_base_url` | Yes | Interakt API base URL, normally `https://api.interakt.ai`. |
| `f/sales/interakt_whatsapp_inbound_webhook_secret` | Yes | Secret key used by the Interakt inbound signature auth resource. |
| `f/sales/calendly_main/api_token` | Yes | Main Calendly token for admin checks/webhook management. Not needed to receive webhooks. |
| `f/sales/typeform_to_pipedrive_intake/azure_openai_endpoint` | Yes | Azure OpenAI endpoint. |
| `f/sales/typeform_to_pipedrive_intake/azure_openai_api_key` | Yes | Azure OpenAI API key. |
| `f/sales/typeform_to_pipedrive_intake/azure_openai_deployment` | Yes | Azure OpenAI deployment name. |
| `f/sales/typeform_to_pipedrive_intake/azure_openai_api_version` | Yes | Azure OpenAI API version. |

## OAuth / Token Behavior

Zoom:

- Windmill stores account id and Basic auth credential.
- Scripts mint a new short-lived Zoom bearer token every run.
- The generated Zoom access token is not stored.

Google Calendar:

- Windmill stores service account JSON.
- Scripts impersonate the owner calendar email to call free/busy and create/cancel events.

Calendly:

- Main Calendly token is for admin/API checks and webhook management.
- Vivek Calendly token is separate and is used only for Vivek availability lookup.

Interakt:

- Outbound messages use Interakt API key.
- Inbound webhook uses Interakt signature verification in Windmill.

## Interakt Templates In Use

| Flow | Template | Template ID |
| --- | --- | --- |
| 1on1 prebooked call | `1on1_fit_with_prebookedcall` | `929183576282877` |
| Vivek reschedule/no-slot booking link | `collective_user_notavailable_resend_1on1_link_vivek` | `2681894292197799` |
| Rakesh reschedule/no-slot booking link | `collective_user_notavailable_resend_1on1_link_rakesh` | `901082656114581` |
| 1on1 reminder 3 days | `collective_1on1_reminder_3days_before` | `1068416189695731` |
| 1on1 reminder 24 hours | `collective_1on1_reminder_24hrs_before` | `1448524886960644` |
| 1on1 reminder 1 hour | `collective_1on1_reminder_1hr_before` | `996140132850094` |
| Lead attendance confirmation | `attendance_confirmation_1on1` | Check Interakt template list if editing |
| Owner attendance check | `collective_owner_attendance_check` | `1735882337778498` |
| 1on1 no-show rebook | `collective_1on1_no_show_rebook` | `1483962136798583` |
| Owner no-slot alert | `owner_1on1_no_slot_alert` | `1279318191033383` |
| Webinar confirmation | `collective_webinar_confirmation` | `1652138732429446` |
| Webinar reminders | `collective_webinar_reminder_*` | See Interakt template docs and script constants |

## External Webhook Hygiene

Keep only one live automation path per event type.

Before deleting old n8n webhooks:

1. Confirm equivalent Windmill route is live and has recent successful jobs.
2. Confirm the old webhook is not used by another production flow.
3. Disable first if possible.
4. Watch Windmill job logs after the next real event.
5. Delete only after successful real-event verification.

