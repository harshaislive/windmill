# Rakesh Meeting Flow: Codex Sales Companion

Last updated: 2026-06-23, Asia/Kolkata

Use this as the speaking flow for the 3 PM session with Rakesh. The HTML walkthrough lives next to this file:

```text
workflow_sales/sales_rep_companion/rakesh_codex_sales_companion_meeting.html
```

## Meeting Outcome

By the end of the meeting, Rakesh should understand:

- how Codex Sales Companion is different from ChatGPT brainstorming
- why Pipedrive / Zoho CRM remains the source of truth
- how to use Codex as a daily sales operating partner
- how per-deal folders work
- what `AGENTS.md` is and why he should not casually change it
- how to manage Codex projects and threads
- when to ask BI to add tools such as WhatsApp, Interakt, email, Sheets, or Docs
- how Maton AI can connect email, docs, sheets, and CRM work inside Codex projects

## 0. Setup Before The Meeting

Open:

- the HTML walkthrough
- the Codex project that already has Pipedrive integrated
- one safe example Pipedrive deal
- this repo folder: `workflow_sales/sales_rep_companion/`
- the main instruction file: `AGENTS.md`

Optional if available:

- a sample Google Sheet
- a sample Google Doc
- an existing email thread
- a safe Interakt / WhatsApp example

## 1. Opening Framing

Start with:

```text
We already made a Codex project with Pipedrive integrated.
This meeting is about how Rakesh should actually use it every day.
CRM remains the source of truth. Codex becomes the workbench.
```

Before jumping into Codex, establish the argument:

```text
Sales work is now too context-heavy for memory alone.
A good rep is not short of effort. The hard part is carrying live CRM state, customer intent, WhatsApp history, email threads, Typeform answers, GIS flow, next activities, and follow-up timing at the same time.
CRM stores truth, but it does not think across the whole context by itself.
Codex becomes the second brain grounded in CRM truth.
```

Explain the three options:

| Way of working | Strength | Problem |
| --- | --- | --- |
| ChatGPT brainstorming | Good for ideas and copy | Not connected to live deal truth unless copied manually |
| Manual CRM only | Clean in theory | Too much for one person across calls, WhatsApp, email, notes, activities, no-shows, and follow-ups |
| Codex Sales Companion | Reads real context, drafts, checks, remembers, writes after approval, and improves through project memory | Needs discipline: CRM first, approval before writes |

Key line:

```text
Codex is not just admin relief. It is an intelligent extension of the rep.
It can connect CRM history, customer intent, sales process, automation state, communication tone, project files, logs, decisions, and learned rules faster than one person can manually hold in working memory.
```

Highlight that this is more than chat because the project has:

- `AGENTS.md` for operating rules
- deal folders for research, drafts, notes, and evidence
- decision logs for behavior-changing choices
- incidents and learnings so mistakes are not repeated
- sales funnel docs and WhatsApp/email rules that Codex can read before acting

## 2. Core Rule

Show this clearly:

```text
CRM = source of truth
Codex = reasoning and execution workbench
Sales Companion = rep-facing assistant
Deal folder = working file cabinet
Repo learning = reusable operating memory
```

Rakesh should remember:

- if it affects the deal, it must be in CRM
- if it is draft/research/evidence, it can live in the deal folder
- if it is a reusable lesson, it goes into repo learning
- if it is an instruction for Codex, it belongs in `AGENTS.md` or linked docs, not random chat memory

## 3. Hands-On: Daily Sales Routine

Switch from the HTML to Codex.

Ask Codex:

```text
Read my Pipedrive deals and give me today's sales queue. Group by urgent, follow-up, and hygiene. Do not write anything yet.
```

Explain what Rakesh should expect:

- due or overdue activities
- deals with no next action
- fresh Typeform leads
- GIS Sent / GIS Opened leads
- 1on1 TBC deals
- no-show recovery
- WhatsApp failures
- manual-review tasks

Then ask:

```text
Pick the top 5 deals I should handle first and explain why.
```

## 4. Hands-On: One Deal Prep

Use a safe example deal.

Ask Codex:

```text
Prep and enrich Pipedrive deal <deal_id>. Read CRM first. Summarize the lead, last touch, route, risk, and best next action. If useful, research public/company/context signals and separate verified CRM facts from enrichment notes. Do not write anything.
```

Rakesh should see:

- who the lead is
- which collective they belong to
- current stage and label
- last note/activity
- last WhatsApp/email touch if available
- what automation touched it last
- enrichment notes if useful, clearly marked as research/context rather than CRM truth
- best next action

Explain:

```text
This is where Codex is better than generic chat. It is reading the actual deal before advising.
```

If enrichment finds something important, teach the boundary:

```text
Research can help the call, but CRM stays the source of truth.
If enrichment changes selling context, Codex should propose a CRM note and ask before writing it.
```

## 5. Hands-On: After-Call Note And Activity

Pretend Rakesh finished a call.

Paste rough notes:

```text
Customer wants spouse to join. Budget seems okay if phased. Asked for more details on maintenance. Follow up Friday evening.
```

Ask Codex:

```text
Turn this into a CRM note and next activity for deal <deal_id>. Show me the exact note and activity first. Do not write until I approve.
```

Teach the rule:

- Codex drafts
- Rakesh approves
- Codex writes
- Codex reads back and verifies

## 6. Hands-On: WhatsApp / Email Draft

Ask:

```text
Draft a short WhatsApp follow-up for this deal using the CRM context. Do not send.
```

Then:

```text
Draft an email follow-up for the existing thread. Do not send.
```

Explain:

- customer-facing sends always require approval
- Rakesh must see recipient, channel, and exact body
- BI can help add tools for direct Interakt, WhatsApp, or email sending when ready

## 7. The Deal Folder System

Show the folder structure:

```text
data/tracking/sales_deals/
  pipedrive_<deal_id>_<short_name>/
    README.md
    snapshots/
    research/
    drafts/
    call_notes/
    sent_messages/
    attachments/
    decisions.md
    next_actions.md
```

Explain:

- deal folder is not CRM
- it is a file cabinet for working evidence
- CRM is still the official truth
- the folder helps Codex continue deep work without rediscovering everything

Create a sample folder only if there is a real deal worth using.

Teach the important point:

```text
This convention should live in AGENTS.md or a linked rule doc.
Rakesh should not need to repeat the full folder instruction every time.
He should be able to ask: "Create a working folder for this deal."
Codex should already know the naming, README, and CRM-source-of-truth rules.
```

## 8. Codex Project And Thread Basics

Explain in simple terms:

- Project: the workspace where tools, files, instructions, and CRM integration live
- Thread: one conversation or work session inside the project
- Use separate threads for separate tasks when the work is meaningfully different
- Keep one thread for a deal if the conversation is still about that deal
- Start a new thread for a new workstream such as "daily queue", "email setup", or "Interakt tool request"

Good thread examples:

```text
Daily Sales Queue - 2026-06-23
Deal 14049 Prep And Follow-Up
No-Show Recovery Review
GIS Opened Follow-Up Batch
Email Tool Setup With BI
```

## 9. What Is AGENTS.md?

Show `AGENTS.md`.

Explain:

```text
AGENTS.md is the operating constitution for Codex in this repo.
It tells Codex what rules to follow, what source of truth to respect, and what not to break.
```

Rakesh should know:

- he should read it enough to understand the rules
- he should not casually edit it
- changes to `AGENTS.md` change how future Codex sessions behave
- if he wants a behavior change, he should ask BI / Harsha to update it carefully
- `AGENTS.md` should point Codex to the right rule paths instead of carrying every detail itself

Example:

```text
If Rakesh wants all WhatsApp drafts to be shorter and more direct, that can become an instruction.
If Rakesh changes AGENTS.md casually, Codex may start behaving differently across the whole project.
```

Suggested `AGENTS.md` map for sales companion work:

| Need | Path |
| --- | --- |
| Current sales funnel flow | `workflow_sales/team_handoff/README.md` |
| Sales automation QA and backlog | `workflow_sales/Windmill Sales Automation QA and Backlog.md` |
| Pipedrive activity/audit rules | `workflow_sales/team_handoff/05_pipedrive_activity_audit_standard.md` |
| Rakesh sales companion routine | `workflow_sales/sales_rep_companion/rakesh_codex_sales_companion_plan.md` |
| WhatsApp/email drafting rules | `workflow_sales/sales_rep_companion/` until BI splits them into separate docs |
| Durable decisions | `data/learning/decisions/` |
| Incidents and failures | `data/learning/incidents/` |
| Reusable sales patterns | `data/learning/patterns/` |
| Deal working folders | `data/tracking/sales_deals/` |

Deal-level decision log schema:

| Field | Meaning |
| --- | --- |
| `deal_id` | Pipedrive / Zoho deal ID |
| `crm_url` | Link to authoritative CRM record |
| `when_ist` | Decision timestamp in IST |
| `initiated_by` | `rakesh`, `harsha`, `codex`, `bi`, or `joint` |
| `decision` | Short decision summary |
| `reason` | Why this was decided |
| `next_action` | What should happen next |
| `crm_write_needed` | `yes` / `no` |
| `crm_write_status` | `proposed`, `approved`, `written`, `verified`, or `not_needed` |
| `evidence_path` | Deal folder, note, doc, sheet, email, or CRM activity reference |

## 10. When To Ask BI For Tools

Rakesh should ask BI when he needs Codex to do something beyond read/draft:

| Need | Ask BI for |
| --- | --- |
| Send WhatsApp templates | Interakt / WhatsApp tool |
| Read or reply to email threads | Maton Gmail / email tool |
| Work with sheets | Maton Sheets / Google Sheets tool |
| Create or edit docs | Maton Docs / Google Docs tool |
| Add CRM writeback | Pipedrive / Zoho write tools |
| Add repeatable automation | Windmill workflow |

BI should make tools available with clear boundaries:

- read first
- draft before send
- approval before writes
- verify after write

## 11. Maton AI Exercise

Use this as a practical exercise if tools are available.

### Exercise A: Sheet

Ask Codex:

```text
Open the sales follow-up sheet. Summarize rows assigned to Rakesh that need action today. Do not edit the sheet.
```

Then:

```text
Draft updates for the sheet based on the CRM state. Show me before editing.
```

### Exercise B: Doc

Ask Codex:

```text
Create a short call-prep doc for deal <deal_id> using CRM notes and deal folder research.
```

### Exercise C: Email

Ask Codex:

```text
Find the latest email thread with <lead name>. Summarize it and draft a reply based on the current CRM next action. Do not send.
```

### Exercise D: CRM Writeback

Ask Codex:

```text
Based on this approved email/WhatsApp follow-up, propose the CRM note and next activity. Do not write until I approve.
```

Close the exercise by saying:

```text
This is the loop: source context, draft, approve, send/write, verify.
```

## 12. Rakesh's Daily Minimum Routine

Give Rakesh this simple routine:

### Morning

```text
Give me today's sales queue. Group by urgent, follow-up, and hygiene.
```

### Before A Call

```text
Prep this deal for call. Give me context, risk, and suggested next step.
```

### After A Call

```text
Turn these rough notes into a CRM note and next activity. Show me before writing.
```

### Before Sending

```text
Draft a WhatsApp/email follow-up. Do not send until I approve.
```

### End Of Day

```text
Close my day. Tell me what is still open and what CRM hygiene is missing.
```

## 13. Close The Meeting

Confirm Rakesh can explain:

- CRM remains source of truth
- Codex reads before advising
- Codex drafts before writing
- sends require approval
- deal folders are working files, not CRM
- `AGENTS.md` is the project constitution
- BI can add tools like Interakt, WhatsApp, email, Sheets, and Docs

### Rakesh's Routine From Tomorrow

```text
Morning: ask Codex for today's queue.
Before calls: prep and enrich the deal.
After calls: convert rough notes into CRM note + next activity.
Before sends: ask Codex to draft, then approve.
End of day: close open loops and CRM hygiene.
```

### One Month From Now

If Rakesh uses this daily, the target state is:

- every serious deal has a clean next action
- important deals have folders with research, drafts, and call notes
- WhatsApp/email follow-ups are faster and more consistent
- no-shows and GIS Opened leads do not silently leak
- repeated manual tasks are identified for BI automation
- `AGENTS.md` and learning logs carry the operating memory, not random chats
- Rakesh spends less time remembering and more time selling

Final takeaway:

```text
Rakesh should become a CRM master and sharper sales expert, with Codex carrying context, checks, drafts, and hygiene.
```
