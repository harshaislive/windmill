# Using the sales intelligence dashboard

[Open dashboard](https://flows.ops.beforest.co/public/beforest-automations/5d8a0522f38402de3e3704710aaa7190)

The dashboard now opens as a compact, neutral table. Conversation priorities shows Fit, Capacity, a short source excerpt, the Jev LinkedIn lead, and contact status in each row. Use the fit and LinkedIn filters above the table; open a row for full evidence and contact details. The Beforest fit sheet and Beforest Members remain separate tabs. LinkedIn suggestions are still unconfirmed identities.

## Access code — effective 25 September 2026

Enter the current **India date as DDMMYYYY**. On 25 September 2026 the code is `25092026`; on 26 September it becomes `26092026`. The five server-side dashboard routes compute it in `Asia/Kolkata` on every request, so the old code stops working at **12:00 a.m. IST** without a scheduled job. A tab left open across midnight returns to the code screen within 15 seconds or when focused. Refreshing the app also requires the current day's code. The former encrypted `f/sales_intelligence/dashboard_password` variable is no longer used by this app.

The Conversation priorities page places fit and the conversation list first. Missing profile/contact work is available through the **Research filter** beside the list filters and in each person's detail; it is not a separate main-page queue or a claim about permission to contact.

The **Beforest Members** tab keeps the 39 Pipedrive-won deals in the three working collectives and Anuj Agarwal (deal 8889, member status confirmed by Harsha) outside the sales worklist. All 40 have Jev fit/capacity assessments of saved deal-linked CRM evidence. LinkedIn discovery finished for all 40: 23 have search candidates and Jev rankings, but only one candidate scored at least 50%; none is a confirmed identity. Open a row to see source evidence and up to five candidates. Names with insufficient identity clues or no search result retain that honest status. Moving Anuj does not change his open Pipedrive deal. Future member corrections must be added deliberately.

For candidate-bearing records, the list shows one LinkedIn research lead only when Jev assigned that candidate at least 50% probability. A Jev `uncertain` answer can still have a top candidate; it stays labelled unconfirmed. Lower scores say no credible match and do not link the first search result in the list. Open the deal to compare all five saved candidates. “Research first” means Jev assessed the CRM history but could not establish Beforest fit from the available evidence; it is not a low-fit verdict.

The two sales tabs now open with **Credible Jev matches** selected in the LinkedIn filter. This narrows the displayed rows to saved LinkedIn person URLs scored at least 50% by Jev; it does not change the fit counts or confirm anyone's identity. Select **All LinkedIn results** or **All candidate results** to see the complete worklist. Beforest Members opens with all member records for research review and shows candidate counts and Jev top probability even below 50%, labelled unconfirmed.

Conversation Priorities now separates the saved search-candidate count from Jev's match verdict. Its detail uses the current saved candidate and Jev result for the profile status. Older profile-gap and ambiguous-search flags were calculated before the later TinyFish/Jev run and are no longer shown as current work. A Jev suggestion still requires owner identity confirmation; CRM phone/email on file does not mean a provider verified them.

This date code is predictable and provides limited access control for a public link. Share the link only within the intended team and do not treat the code as protection against someone who knows the format.

## September 24 release status — fit pass complete, contact research limited

The live tabs are **Conversation Priorities** and **Beforest fit sheet**. Both show the saved Jev Beforest-fit category, a separate capacity-evidence category, and the supporting CRM excerpt. Conversation Priorities does not use a “Needs review” outcome; missing evidence is shown as Research first. The older percentile and recent-call assessment are historical context, not fit or affordability verdicts.

The open-deal Jev backfill is complete: 3,811 of 3,811 open deals, grouped into 3,185 assessed open interests. At the final import, 177 deals were strong fit, 2,677 plausible, 954 research first, two weak and one incompatible. A quality audit found that broad nature/community answers had been overstated as strong fit, so strong now requires a concrete step in the supporting source. Do not use earlier strong-fit counts. Review the exact source before outreach. Capacity remains unknown for 3,785 deals; 25 have a professional clue and one has a recorded transaction. Unconfirmed LinkedIn candidates and MCA company data are not evidence of a person's available funds.

The **Beforest fit sheet** separates CRM values from provider outcomes. “CRM email/phone on file” means the original value exists; “Not checked” means Treg has not checked it. Only 20 open deals have any saved provider-check status, and 19 runs completed or partially completed. The email and phone filters separately distinguish on file, missing, not checked and checked outcomes. Jev suggested a LinkedIn URL for 100 open deals, but those identities remain unconfirmed; 1,861 candidate-bearing deals have no Jev suggestion. Search result #1 is no longer linked directly from the list when Jev has not suggested it; open View to compare candidates. The last provider run column shows a date only if a run occurred.

This is suitable for **internal fit and evidence review**. It is not a verified contact list or affordability ranking. No Pipedrive record is changed and no outreach is sent from these tabs.

## Sales Readiness sheet — 23 September 2026

The 23 September `sales_ready` label answers a recent-call question and must not be used to decide Beforest fit. A separate Jev pass is assessing each open deal's relevance and capacity evidence from saved form answers and CRM notes. It keeps missing evidence as `Research first` and records the supporting CRM source. The Conversation Priorities percentile remains historical context. Professional roles and MCA company financials require corroborated identity; neither by itself proves personal purchasing funds.

After entering the daily team code, choose **Beforest fit sheet** in the header. This is a deal-by-deal snapshot with 11,963 rows. Search a name or deal ID, then filter by collective, owner, deal status, fit, capacity evidence, profile check, email check, or phone check. The default view is open deals. Click a name to read the dated source evidence and open the original Pipedrive deal.

For an open deal without a contact restriction, use **Verify contact** on its row. The sheet shows completion or a partial-result message. Select **View** for the exact provider error. In the detail panel, you can supply a known LinkedIn person-profile URL before running the same action. The result fills separate LinkedIn, email and phone check columns and saves an older Jev call-readiness assessment alongside the initial one. It does not rerun the new Beforest-fit assessment. Partial provider results remain labelled partial; a missing or ambiguous profile is not marked verified. A recent completed check is reused for 24 hours unless a different LinkedIn URL is supplied.

LinkedIn name agreement is only a possible identity and requires owner confirmation. Email deliverability does not establish consent. Phone validity does not establish reachability or ownership. An old call request remains historical. Do not treat `sales_ready_now=false` as a negative qualification decision. No button writes to Pipedrive or sends outreach.

The sheet starts from the 23 September export; later CRM changes are not yet imported automatically. Person-only notes, email bodies and attachments are outside this pass. The existing Conversation priorities view continues to use its separately published grouped sales intelligence snapshot.

Conversation Priorities now also displays the saved LinkedIn search candidates alongside each grouped person and collective interest. Use the **LinkedIn candidates** filter to see records with candidates, no candidate, or no search. Select **View** for up to five links and Jev's per-candidate probabilities when an assessment exists. A Jev choice or percentage is an identity suggestion for owner review, never a confirmed profile. Candidate discovery and Jev identity matching do not change the conversation priority band, evidence, or permission to contact. Jev matching currently covers open Sales Readiness people with candidates; other grouped records can show candidate links without a Jev assessment.

Both tabs now put one LinkedIn link directly on each row with candidates. **Jev selected candidate** means Jev chose it from the saved search evidence, but identity remains unconfirmed. **Search result #1** is only the search engine's first result and is explicitly **not pinned** when Jev is pending or uncertain. Do not copy it to Pipedrive or use it as this person's professional history without owner review. The tabs refresh saved results about every 30 seconds. A Jev identity result does not change the conversation priority or readiness category.

September 24 correction: the Sales Readiness **recent explicit call request** count is a strict, date-sensitive measure, not a Beforest fit or affordability category. It was previously titled **Sales ready now**, which overstated what the sheet answered. The sheet now shows the 28 open deals in the existing Top 10% conversation-priority band, links to that first tab, and shows dated next steps. Its banner states that capacity is **not assessed**. The first tab's ranking considers CRM interest, collective alignment and engagement, not capacity. Contact-provider checks have only been run on selected deals, so **Not checked** means no provider call was made. This release does not establish that someone can afford a collective.

The public link opens without a Windmill login. Every dashboard data and verification function checks the daily code on the server. Harsha manages who receives the link and the code format. To revoke a recipient's access, change the access scheme or restrict the app link; waiting for the next day does not revoke anyone who knows the date rule.

1. Choose Mumbai, Hammiyala or Poomaale 2.0.
2. Choose your name under Owner and Open or Lost under status.
3. Start with Top 10%, then 50–90th percentile. Open View to read the reason, next step and dated source before calling.
4. Reconfirm old interest and timing. A high historical rank is not a current call request. Address recorded objections or requested information first.
5. Do not contact entries with a recorded restriction. Needs review means missing/uncertain information, a contact problem, identity ambiguity or a history requiring manual review—not a poor prospect.
6. Use the linked Pipedrive deal to record the actual conversation and agreed next step. This dashboard does not write CRM notes, change owners or send outreach.

## Meaning of the bands

Ranks compare evidence-supported prospects within each collective. They do not change when filtered by owner or status. Intent contributes 40%, alignment 35% and engagement 25%; each requires sufficient source evidence. Equal scores receive equal percentiles, so the Top 10% bucket need not contain exactly 10% of the eligible people. Customers, restrictions, invalid contacts and insufficient evidence are excluded. The score does not estimate wealth or probability of purchasing.

## Coverage

The release uses the 22 September 2026 Pipedrive snapshot: 10,279 deals grouped into 10,154 person/collective interests. Deals with the same Pipedrive person ID in one collective are grouped; this is not independent verification that different person records belong to different humans.

Imported notes and activity descriptions remain inspectable. Prior automated opinions are separated and excluded from scoring. Email bodies and attachments are not included. The separate archive endpoint returned zero deals during the release audit. New Pipedrive changes are not imported automatically by this release; the page shows its snapshot date.

The original professional-context release used LinkedIn URLs recorded in the CRM. Treg fetched 23 unique profile URLs. The later TinyFish search candidates and Jev probabilities are shown separately as unconfirmed identity suggestions. Name agreement does not independently verify identity; professional background does not influence rank.

The page refreshes server results every 30 seconds. Nothing is sent automatically.

The header's `awaiting assessment` count refers only to the initial Pipedrive/TypeSafe ranking pass. A zero there does not mean profile enrichment is complete; use the separate Free profile enrichment banner and the individual Treg candidate check for that work.

## Released shortlist — 22 September 2026

| Collective | Top band | 50–90th | Below 50th | Needs review | Do not contact |
|---|---:|---:|---:|---:|---:|
| Mumbai | 9 | 33 | 42 | 4,839 | 136 |
| Hammiyala | 11 | 41 | 52 | 2,406 | 26 |
| Poomaale 2.0 | 6 | 24 | 29 | 2,425 | 36 |

There are also 39 customer-history groups, kept outside the prospect ranking. All normal processing is complete; four classification exceptions remain in manual review. Review queues also include sparse histories and missing contacts, so they are much larger than the shortlist.

## What needs attention

Use the new buttons to filter by missing information. The flags overlap and are independent of the priority bands:

- **Needs profile enrichment:** professional context is missing. This can also appear on a ranked prospect; a profile is not required to recognise interest recorded in CRM.
- **Needs contact details:** the saved phone is missing or fails the calling-list checks. No replacement phone is guessed from web search.
- **Needs sales clarification:** recorded interest, collective alignment, engagement, permission or supporting evidence needs clarification. A job title cannot resolve this.
- **Needs identity check:** CRM identity is uncertain, a recorded profile mismatches, or discovered profiles are ambiguous.
- **Processing exception:** an assessment was unavailable; review the source manually.

Targeted public profile search now uses Treg/AnyAPI, followed by a Harvest profile lookup only when a unique search result agrees with the CRM name and an email-domain company clue. Search results without corroboration appear as possible profiles, explicitly unconfirmed. Enriched context shows its source, check date and matching caveat. These results do not change calling ranks or overwrite CRM contact details. The footer reports current coverage; not every record has been searched.

The first targeted pass added context for 50 people across 52 collective records. There are possible profiles for 218 other people, and 147 searches found no usable match. No result does not establish that a profile does not exist. Remaining missing-profile records have not all been searched. This pass added $0.503 in Treg costs; no additional Jev calls.

## Free profile expansion — started September 23

TinyFish completed the search/fetch queue for the 9,850 profile-gap records (9,751 CRM identities) on Windmill. The Free profile enrichment banner shows zero pending when the pass is complete. Some records lacked a usable full name or other identity clues and remain for owner review; a completed search does not imply a confirmed profile.

The backfill used nine separately supplied TinyFish account credentials with a shared queue and cache. Each account was held below 450 searches/hour and 900 fetches per rolling 24 hours. A successful fetch can still be an ambiguous identity; the sales review requirement is unchanged.

Possible profiles may now include a public-page description and expandable excerpt. They are explicitly unconfirmed; do not treat another person's work history as this lead's background. Public LinkedIn pages can be incomplete or unavailable. Only independently corroborated clues can attach profile context; this run does not change the existing calling ranks or send outreach.

Treg now follows finished TinyFish candidate URLs in a separate Windmill worker. The dashboard shows a **Treg candidate check** in the lead detail when a fetched public profile supplies a name and company. Most candidate URLs remain unconfirmed because a matching name alone does not prove identity. Treg results do not change priority bands, overwrite Pipedrive, or authorize a call. The worker reuses saved profile URLs, runs under a cumulative $8.90 Treg cap, and waits for TinyFish to finish more searches. Its budget includes earlier Treg work; the visible profile check is not a new verified lead count.
