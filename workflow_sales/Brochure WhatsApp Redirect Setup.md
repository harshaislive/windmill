# Brochure WhatsApp Redirect Setup

Last updated: 2026-07-07, Asia/Kolkata

## Interakt Templates Required

### `collective_brochure_link_v2`

Purpose: preferred brochure send template after the Typeform WhatsApp redirect, either immediately after inbound WhatsApp or after the 5-minute fallback.

Created via Interakt public API on 2026-07-07:

- Interakt resource ID: `069949b9-1098-4376-92f2-88cb56a78493`
- WhatsApp template ID: `1408547044430751`
- Status: `APPROVED` per Interakt dashboard confirmation on 2026-07-07
- Request artifact: `D:\AI Apps\interakt_worker\data\interakt_template_create_collective_brochure_link_v2_20260707_142131.request.json`
- Response artifact: `D:\AI Apps\interakt_worker\data\interakt_template_create_collective_brochure_link_v2_20260707_142131.response.json`

Category: Marketing

Language: English

Body:

```text
Hi {{1}},

Sharing the brochure for {{2}}. It brings together the place, access, landscape, people, process, and current progress of the collective.

Please go through it. If it feels aligned, you can request a conversation with our team from the form at the end of the brochure.
```

Button:

```text
Open brochure
```

Button type: Dynamic URL

URL:

```text
https://windmill.devsharsha.live/api/r/sales/gis/open?t={{1}}
```

Variables sent by Windmill:

- `{{1}}`: lead first name
- `{{2}}`: collective label
- button `{{1}}`: signed tracking token

Active Windmill senders use this template as the primary brochure template. `collective_journey_initial_cta_v1` remains only as an API-failure fallback in `send_brochure_after_typeform`; `collective_brochure_link_v1` is not wired in active send code.

### `collective_brochure_link_v1`

Purpose: superseded brochure send template after the Typeform WhatsApp redirect.

Status: superseded by `collective_brochure_link_v2` because the old body asks the lead to "reply here" instead of using the conversation request form at the end of the brochure.

Created via Interakt public API on 2026-07-02:

- Interakt resource ID: `a1ee7f07-8965-4d2f-97f5-5174a8f17a5d`
- WhatsApp template ID: `1542679840976522`
- Status at creation/read-back: `PENDING`

Category: Marketing

Language: English

Body:

```text
Hi {{1}},

Sharing the brochure for {{2}}. It brings together the place, access, landscape, people, process, and current progress of the collective.

Please go through it and reply here if you would like help with the next step.
```

Button:

```text
Open brochure
```

Button type: Dynamic URL

URL:

```text
https://windmill.devsharsha.live/api/r/sales/gis/open?t={{1}}
```

Variables sent by Windmill:

- `{{1}}`: lead first name
- `{{2}}`: collective label
- button `{{1}}`: signed tracking token

### `collective_post_brochure_owner_followup_ack`

Purpose: acknowledge the second/post-brochure Typeform and name the owner.

Created via Interakt public API on 2026-07-02:

- Interakt resource ID: `6fd043ff-f063-4cc0-bc8c-555d702a23a2`
- WhatsApp template ID: `1727879391580250`
- Status at creation/read-back: `PENDING`

Category: Utility

Language: English

Body:

```text
Thanks {{1}}, we received your follow-up for {{2}}. {{3}} will reach out soon.
```

Variables sent by Windmill:

- `{{1}}`: lead first name
- `{{2}}`: collective label
- `{{3}}`: owner name

No button.

## Typeform WhatsApp Redirect URLs

All Typeform endings should use:

```text
https://wa.me/918977945351?text=<encoded message>
```

Use these exact URLs:

### Fit / direct-conversation endings

```text
https://wa.me/918977945351?text=Hi%20Beforest%2C%20I%20just%20submitted%20the%20collective%20form.%20I%27d%20like%20to%20speak%20with%20the%20team%20about%20the%20next%20step.
```

### Brochure-first / unfit endings

```text
https://wa.me/918977945351?text=Hi%20Beforest%2C%20I%20just%20submitted%20the%20collective%20form.%20Please%20send%20me%20the%20brochure.
```

### Post-brochure / second Typeform endings

```text
https://wa.me/918977945351?text=Hi%20Beforest%2C%20I%20just%20submitted%20the%20follow-up%20form%20after%20reading%20the%20brochure.
```

Do not add hidden tracking codes to the WhatsApp text. Windmill matches by phone number, submission time, collective, and latest open Pipedrive deal.

## Live Primary Form Ending Map

Set the ending redirect URL inside Typeform workflow/ending settings:

| Collective | Form ID | Ending ref | Current role from live logic | Redirect URL |
| --- | --- | --- | --- | --- |
| Bhopal | `CYae8hmZ` | `6ed323fa-ad72-442b-9987-d89d241c59c6` | brochure-first / unfit branch | brochure-first, verified |
| Bhopal | `CYae8hmZ` | `cf3679ae-7034-4e5e-8098-1eed8540d355` | direct-conversation branch after later questions | fit, verified |
| Hammiyala | `hbDB2ybS` | `e53c682c-5940-416a-a30c-186823652154` | brochure-first / unfit branch | brochure-first, verified |
| Hammiyala | `hbDB2ybS` | `5974485c-7bd5-4aa3-96f2-ae18b9fa3b40` | direct-conversation branch after later questions | fit, verified |
| Mumbai | `kfcjiXxR` | `53666540-d15e-4216-b818-dc239814c080` | brochure-first / unfit branch | brochure-first, verified |
| Mumbai | `kfcjiXxR` | `407177e8-6723-4965-a1c2-9b11fb35435f` | direct-conversation branch after later questions | fit, verified |
| Poomaale 2.0 | `i8eBLQkz` | `f3d4adaa-202c-4129-9fb9-955c6aab33a3` | brochure-first / unfit branch | brochure-first, verified |
| Poomaale 2.0 | `i8eBLQkz` | `3564eb99-6fa3-4810-8cd5-2a9f0b4c9baa` | later direct-conversation branch | fit, verified |
| Poomaale 2.0 | `i8eBLQkz` | `thankyou-screen` | direct-conversation branch | still old WhatsApp group link; fix needed |

Several old, unmapped endings still contain WhatsApp group invite URLs. Most are not targeted by current live logic; however Poomaale `thankyou-screen` is still targeted by one live branch and should be changed to the fit URL.

## Live Post-Brochure Form Ending Map

Set the final-question logic to jump to the post-brochure redirect ending:

| Collective | Form ID | Redirect ending ref | Typeform logic | Webhook |
| --- | --- | --- | --- | --- |
| Bhopal | `i1b6g9ZU` | `df74b15a-a40e-4b08-9eed-5a53a885d839` | `schedule_one_on_one` always jumps to redirect ending | Enabled |
| Hammiyala | `RqtSprR9` | `7711b9fe-8146-4a46-939b-53f2da50af3e` | `schedule_one_on_one` always jumps to redirect ending | Enabled |
| Mumbai | `s9YSmglR` | `27df164a-89db-4f98-b574-64968500383f` | `schedule_one_on_one` always jumps to redirect ending | Enabled |
| Poomaale 2.0 | `Prnzj8zH` | `390a9161-644e-4395-9064-e2ae1d4bc8b7` | `schedule_one_on_one` always jumps to redirect ending | Enabled |
| Hyderabad | `z1sh3mRI` | `27df164a-89db-4f98-b574-64968500383f` | `schedule_one_on_one` always jumps to redirect ending | Enabled 2026-07-02 |

Verification on 2026-07-02 found the post-brochure forms still keep older blank `Thank You` endings, but the live logic now always jumps to the WhatsApp redirect ending after the final question. Hyderabad `z1sh3mRI` originally had no Windmill webhook; this implementation added and read back one enabled webhook pointing to `https://windmill.devsharsha.live/api/r/typeform/pipedrive/intake`.

## Hyderabad Windmill Mapping

Live Pipedrive audit on 2026-07-02 confirmed:

- Pipeline: `6` / Hyderabad Collective Pipeline
- Lead In stage: `44`
- Initial Event Scheduled stage: `45`
- Owner: Vivekanand / `22251956`
- Product mapping: no Hyderabad Pipedrive product found yet; product attachment remains unsupported until a product/value is defined.

## Pipedrive Logging Contract

Windmill logs these explanatory activities:

- `Typeform received`: primary intake landed and Pipedrive was created/updated.
- `Brochure sent after WhatsApp redirect`: inbound WhatsApp happened after Typeform and brochure was sent immediately.
- `Brochure fallback sent after Typeform`: no inbound WhatsApp was seen after 5 minutes, so fallback sent the brochure.
- Brochure send notes include the lead-facing next step: after reading the brochure, the lead can request a conversation with the team from the form at the end of the brochure.
- `Brochure opened`: lead clicked the tracked brochure button.
- `Post-brochure Typeform submitted`: second form landed and follow-up should stop.
- `Review post-brochure conversation request`: owner task.
- `Post-brochure acknowledgement sent`: acknowledgement sent to the lead.
- `Send brochure manually` / `Send post-brochure acknowledgement manually`: open manual tasks when phone/template/send is missing or failed.
