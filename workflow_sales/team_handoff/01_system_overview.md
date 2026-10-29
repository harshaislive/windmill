# 01 System Overview

This document explains the sales automation flow in business terms. See [02 Automation Reference](02_automation_reference.md) for exact Windmill paths.

## Systems Involved

| System | Role |
| --- | --- |
| Typeform | Primary collective intake plus the Hammiyala/Poomaale post-brochure conversation-request forms. |
| Windmill | Automation runtime and orchestrator. |
| Pipedrive | CRM source of truth for people, deals, labels, stages, notes, and activities. |
| Azure OpenAI | Fit/unfit classification for 1on1 requests after deterministic fit/unfit guardrails. |
| Google Calendar | Legacy/internal calendar-prebook tooling and calendar operations for already-booked meetings; it is not the default fit-lead path. |
| Calendly | Vivek's live booking destination for Bhopal/Mumbai and, after the pending split deployment, Vivek-owned Hammiyala brochure leads; also a gated source for legacy webinar operations. |
| Zoom | Webinar registration system. |
| Interakt | WhatsApp templates, buttons, reminders, and inbound message webhooks. |

## Owner Routing

| Collective | Owner | Pipedrive owner ID | Brochure next step | Nurture stops when |
| --- | --- | --- | --- | --- |
| Bhopal | Vivekanand | `22251956` | Vivek Calendly with `utm_campaign=bhopal` | A confident Calendly booking is synced to the open Bhopal deal |
| Mumbai | Vivekanand | `22251956` | Vivek Calendly with `utm_campaign=mumbai` | A confident Calendly booking is synced to the open Mumbai deal |
| Hammiyala — Vivek turn | Vivekanand | `22251956` | Vivek brochure → Calendly with `utm_campaign=hammiyala` | A confident Calendly booking is synced to the open Vivek-owned Hammiyala deal |
| Hammiyala — Rakesh turn | Sai Rakesh | `13490118` | Rakesh brochure → post-brochure Typeform | The post-brochure Typeform is submitted |
| Poomaale 2.0 | Sai Rakesh | `13490118` | Rakesh's post-brochure Typeform | The post-brochure Typeform is submitted |

## Route A: Typeform To Pipedrive

```mermaid
flowchart TD
  A["Lead submits active Typeform"] --> B["Windmill 01A Typeform HTTP trigger"]
  B --> C["01B Typeform to Pipedrive intake"]
  C --> D["Match existing Pipedrive deal before assigning owner"]
  D -->|"Existing Hammiyala deal"| E["Preserve current owner"]
  D -->|"New primary Hammiyala deal"| E2["Locked round-robin: Vivek first, then Rakesh"]
  D -->|"Other collective"| E3["Use collective owner"]
  E --> F
  E2 --> F
  E3 --> F
  F["Create or update Pipedrive person/deal"] --> F2{"Route selected in Typeform"}
  F2 -->|"Brochure / GIS"| G["Set Lead_In and GIS Awaiting"]
  F2 -->|"1on1"| H["Rule guardrails, then Azure OpenAI fit classification"]
  H -->|"Fit"| I["Set label 115 1on1 TBC and Initial Event Scheduled stage"]
  H -->|"Unfit"| J["Set Lead_In and GIS Awaiting"]
  H -->|"Azure failure or bad response"| K["Set GIS Awaiting and create open manual-review activity"]
  G --> L["Create Beforest Admin audit activity"]
  I --> L
  J --> L
  K --> L
```

Important rule: if Azure classification fails, Windmill does not silently schedule a 1on1. The deal follows the GIS/brochure route.

Important rule: obvious greeting/filler 1on1 reasons such as `Hi` are unfit, while ready/near-ready clarification answers and specific commercial/legal/visit/booking questions are fit before Azure is called.

## Route B: Current Scheduling Paths

```mermaid
flowchart TD
  A["Pipedrive deal has label 115 1on1 TBC"] --> B["02A Pipedrive webhook"]
  B --> C["02B eligibility guard"]
  C --> D{"Eligible?"}
  D -->|"No"| E["Ignored safely"]
  D -->|"Yes"| F["02C sends team scheduling notice"]
  F --> G["Owner touchbase check is queued for 24 hours"]
  G --> H{"Owner response"}
  H -->|"Yes, touched base"| I["Log confirmation and stop"]
  H -->|"No, pending"| J["Queue next daily check, maximum 3 attempts"]

  K["Bhopal/Mumbai or Vivek-owned Hammiyala lead books Vivek Calendly"] --> L["14B polls four times daily"]
  L --> M["14A matches exact email and UTM to Vivek-owned open deal"]
  M --> N["Write meeting datetime, URL, and calendly reference"]
  N --> O["Create open Vivek meeting activity and done admin audit"]
  O --> P["Stop that Vivek-path nurture"]

  Q["Rakesh-owned Hammiyala or Poomaale brochure lead"] --> R["Submit Rakesh post-brochure Typeform"]
  R --> S["Update same deal and stop nurture"]
```

`f/sales/calendar_prebook_1on1` remains available for controlled internal/manual use, but `02B` no longer calls it for fit intake leads.

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
  E["After meeting window passes"] --> F["07B schedule every 30 minutes - currently disabled"]
  F --> G["Send owner attendance check WhatsApp"]
  G --> H["Owner clicks Attended or Not Attended"]
  H -->|"Attended"| I["05F labels 107 and moves to Event Attended stage"]
  H -->|"Not Attended"| J["05G labels 108 and sends no-show rebook WhatsApp"]
  I --> K["Create Beforest Admin audit activity"]
  J --> K
```

## Route E: Gated Legacy Webinar Booking To Zoom And Reminders

```mermaid
flowchart TD
  A["Approved manual/ops Calendly payload"] --> B["04C webinar worker with feature flag enabled"]
  B --> E["Find or create Pipedrive person/deal"]
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
| `110` | Scheduled Webinar Awaiting | Legacy/gated webinar route |
| `111` | Scheduled Webinar Pending | Legacy/gated webinar booking/reminder route |
| `115` | 1on1 TBC | Fit lead awaiting team-managed scheduling |

