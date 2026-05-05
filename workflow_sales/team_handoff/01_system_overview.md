# 01 System Overview

This document explains the sales automation flow in business terms. See [02 Automation Reference](02_automation_reference.md) for exact Windmill paths.

## Systems Involved

| System | Role |
| --- | --- |
| Typeform | Intake source for collective leads. User chooses webinar or 1on1 route. |
| Windmill | Automation runtime and orchestrator. |
| Pipedrive | CRM source of truth for people, deals, labels, stages, notes, and activities. |
| Azure OpenAI | Fit/unfit classification for 1on1 requests. |
| Google Calendar | Final calendar booking system for owner 1on1 calls. |
| Calendly | Source of webinar booking webhooks and Vivek availability lookup. |
| Zoom | Webinar registration system. |
| Interakt | WhatsApp templates, buttons, reminders, and inbound message webhooks. |

## Owner Routing

| Collective | Owner | Pipedrive owner ID | 1on1 slot source | Booking calendar |
| --- | --- | --- | --- | --- |
| Bhopal | Vivekanand | `22251956` | Vivek Calendly availability | `Vivekanand@beforest.co` |
| Mumbai | Vivekanand | `22251956` | Vivek Calendly availability | `Vivekanand@beforest.co` |
| Hammiyala | Sai Rakesh | `13490118` | Google Calendar free/busy | `sai@beforest.co` |
| Poomaale 2.0 | Sai Rakesh | `13490118` | Google Calendar free/busy | `sai@beforest.co` |

## Route A: Typeform To Pipedrive

```mermaid
flowchart TD
  A["Lead submits active Typeform"] --> B["Windmill 01A Typeform HTTP trigger"]
  B --> C["01B Typeform to Pipedrive intake"]
  C --> D["Find or create Pipedrive person"]
  D --> E["Create or update Pipedrive deal"]
  E --> F{"Route selected in Typeform"}
  F -->|"Webinar"| G["Set webinar stage and label 111 Scheduled Webinar Pending"]
  F -->|"1on1"| H["Azure OpenAI fit classification"]
  H -->|"Fit"| I["Set label 115 1on1 TBC and Initial Event Scheduled stage"]
  H -->|"Unfit"| J["Set Lead_In stage and webinar-awaiting label"]
  H -->|"Azure failure or bad response"| K["Create open Beforest Admin manual-review activity"]
  G --> L["Create Beforest Admin audit activity"]
  I --> L
  J --> L
  K --> L
```

Important rule: if Azure classification fails, Windmill does not silently prebook the 1on1. It creates a manual-review activity for Beforest Admin.

## Route B: 1on1 Fit To Calendar Prebook

```mermaid
flowchart TD
  A["Pipedrive deal has label 115 1on1 TBC"] --> B["02A Pipedrive webhook"]
  B --> C["02B eligibility guard"]
  C --> D{"Eligible?"}
  D -->|"No"| E["Ignored safely"]
  D -->|"Yes"| F["03A Calendar prebook action"]
  F --> G{"Deal owner"}
  G -->|"Vivekanand"| H["Read Vivek available slots from Calendly"]
  G -->|"Sai Rakesh"| I["Read Google Calendar free/busy"]
  H --> J{"Slot found?"}
  I --> J
  J -->|"Yes"| K["Create Google Calendar event in owner calendar"]
  K --> L["Write meeting date, URL, and calendar reference to Pipedrive"]
  L --> M["Create owner-owned open meeting activity"]
  M --> N["Send Interakt prebooked 1on1 WhatsApp"]
  N --> O["Create Beforest Admin audit activities"]
  J -->|"No"| P["Label deal 105 1on1 Awaiting"]
  P --> Q["Send lead booking-link fallback WhatsApp"]
  Q --> R["Send owner no-slot alert if template is available"]
  R --> S["Create Beforest Admin audit activities"]
```

## Route C: Reschedule Button

```mermaid
flowchart TD
  A["Lead clicks Reschedule Call in WhatsApp"] --> B["05A Interakt inbound signed webhook"]
  B --> C["05B router flow"]
  C --> D["05D reschedule worker"]
  D --> E["Resolve Pipedrive deal from callback data or phone"]
  E --> F["Find Google Calendar event from Pipedrive reference or calendar search"]
  F --> G["Cancel calendar event when found"]
  G --> H["Clear meeting fields in Pipedrive"]
  H --> I["Apply label 105 1on1 Awaiting"]
  I --> J["Send owner booking link to lead"]
  J --> K["Create Beforest Admin audit activities"]
```

## Route D: 1on1 Reminder And Attendance Loop

```mermaid
flowchart TD
  A["Deal labelled 106 1on1 Pending with future meeting datetime"] --> B["06B schedule every 15 minutes"]
  B --> C["Send due 3d, 24h, or 1h WhatsApp reminder"]
  C --> D["Create done Beforest Admin activity for dedupe"]
  E["After meeting window passes"] --> F["07B schedule every 30 minutes"]
  F --> G["Send owner attendance check WhatsApp"]
  G --> H["Owner clicks Attended or Not Attended"]
  H -->|"Attended"| I["05F labels 107 and moves to Event Attended stage"]
  H -->|"Not Attended"| J["05G labels 108 and sends no-show rebook WhatsApp"]
  I --> K["Create Beforest Admin audit activity"]
  J --> K
```

## Route E: Webinar Booking To Zoom And Reminders

```mermaid
flowchart TD
  A["Calendly webinar booking created"] --> B["04A Calendly HTTP trigger"]
  B --> C["04B flow waits 5 seconds for Typeform intake/deal creation"]
  C --> D["04C webinar worker"]
  D --> E["Find or create Pipedrive person/deal"]
  E --> F["Find matching Zoom webinar by collective and time"]
  F --> G["Register invitee to Zoom if not already registered"]
  G --> H["Create or update owner-owned webinar activity in Pipedrive"]
  H --> I["Send webinar confirmation WhatsApp"]
  I --> J["Create Beforest Admin confirmation audit activity"]
  J --> K["Schedule one-off 3d, 24h, and 1h webinar reminder jobs"]
  K --> L["08A sends reminders and logs admin audit activities"]
```

## Pipedrive Labels Used

| Label ID | Meaning | Used by |
| --- | --- | --- |
| `105` | 1on1 Awaiting | Reschedule flow and no-slot fallback |
| `106` | 1on1 Pending | Lead confirmed attendance; reminder and owner-check loop |
| `107` | 1on1 Attended | Owner marked attended |
| `108` | 1on1 No Show | Owner marked not attended |
| `110` | Scheduled Webinar Awaiting | Unfit/manual webinar route |
| `111` | Scheduled Webinar Pending | Webinar booking/reminder route |
| `115` | 1on1 TBC | 1on1 fit route and calendar prebook trigger |

