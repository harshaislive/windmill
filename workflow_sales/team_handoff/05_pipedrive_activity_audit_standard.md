# 05 Pipedrive Activity Audit Standard

Pipedrive activities now serve two purposes:

1. Real operational activities that a deal owner should act on.
2. Completed audit activities that prove an automation did something.

Keeping these separate is important.

## Ownership Rules

| Activity type | Pipedrive owner | Done? |
| --- | --- | --- |
| Real scheduled 1on1 call | Deal owner | No |
| Real scheduled webinar/introduction activity | Deal owner | No |
| WhatsApp sent | Beforest Admin, ID `18891506` | Yes |
| WhatsApp delivery failed | Beforest Admin, ID `18891506` | No |
| WhatsApp inbound button received | Beforest Admin, ID `18891506` | Yes |
| Calendar created/cancelled by automation | Beforest Admin, ID `18891506` | Yes |
| Typeform intake processed | Beforest Admin, ID `18891506` | Yes |
| Manual review needed | Beforest Admin, ID `18891506` | No |

Beforest Admin is `connect@beforest.co`.

## Subject Format

Activity subjects should read like a deal-owner timeline, not system logs.

Examples:

```text
Typeform received
Prebooked call message sent
WhatsApp failed to deliver
Calendar invite created
Review fit manually
1on1 reminder sent - 24h
Webinar reminder sent - 1h
```

## What Goes In The Note

Audit activity notes should be short and useful to the owner:

- What happened.
- The customer-facing outcome.
- The owner/meeting time/link when relevant.
- For failed WhatsApp delivery, include Interakt error code and reason.

Never include API keys, bearer tokens, Basic auth strings, private keys, or webhook secrets.

Avoid dumping raw payload JSON into Pipedrive. Windmill logs are for engineering detail; Pipedrive is for deal context.

## Manual Review Activities

Manual review activities are open tasks owned by Beforest Admin.

Current manual-review case:

- Azure/OpenAI fit classification failed, returned invalid JSON, or was missing config.
- Interakt reports outbound WhatsApp delivery failure, for example error `131049`.

Expected human action:

1. Open the deal.
2. Read Typeform answers and the manual-review activity note.
3. Decide if the lead is fit for 1on1.
4. If fit, apply label `115` 1on1 TBC and keep/move to Initial Event Scheduled stage.
5. If unfit, keep/move into the webinar route with the appropriate webinar label/stage.
6. Let Windmill pick up the next automation from the label/stage.

## Dedupe Strategy

For reminders and confirmation messages, Windmill checks a done Pipedrive activity by short subject plus a small marker in the note, such as reminder key, meeting time, or source webinar activity.

Do not casually rename existing reminder subjects or note markers unless you also update dedupe logic.

For business event activities such as webinar activities, Windmill updates existing open activities when it can match the same webinar/date/context.

## Team Review Checklist

When checking a deal, you should be able to answer:

- Which route did this lead enter from?
- Which automation touched it last?
- Was a WhatsApp template sent?
- Did WhatsApp deliver, or did Interakt report an error?
- Was a calendar or Zoom event created?
- Is there an open human task?
- Is the next automation waiting on a label/stage?

The Pipedrive activity timeline should answer these without opening Windmill logs for every case.
