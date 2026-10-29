# Mumbai churn tracker

Open [Mumbai churn tracker](https://flows.ops.beforest.co/api/r/mumbai-churn/dashboard) and enter today's date in **DDMMYYYY**, using India time (IST). The code changes automatically at midnight IST. No Windmill login is needed.

The dashboard is read-only and refreshes every minute. Search by name or email, filter by owner or state, and open Replies to see responders. A reply stops follow-ups. The team decides manually whether to add that person to Zoho.

Campaign status notes and the 30-day plan are under **Campaign updates**, above the metrics. The panel starts collapsed; click it to open or close the notices.

Nurture shows enrolled people and their Email 01/02/03 progress. Source queue also includes held records that need attention. Historical sends are included in the total. Use Lock dashboard when done; it clears access from that tab.
# 5 October 2026: independent sender queues and 30-day target

Four mailbox schedules are enabled, one tick every3minutes08:00–19:00IST. New-contact ramp per mailbox:5,8,12,17,23,then25/day; separate follow-up capacity, minimum48hours between verified sends. Daily06:30IST source/tracker upkeep replaces the former09:15dispatch batch. Existing uncertain send remains quarantined without a retry. Replies continue to stop nurture and appear for manual Zoho decisions.

Authentication verified and released5October16:10IST. Harsha corrected SPF; one fresh received internal test shows SPF PASS and DMARC PASS. All four mailbox queues are scheduled to start6October08:00IST, beginning with5newpeople/mailbox/day. Full sequence target4November remains a target subject to delivery, replies and exceptions. Dashboard shows scheduled start; monitoring remains active. Zoho additions stay manual after reply. Proof: `data/tracking/mumbai-30-day-enable-20261005/domain-release-result.json` and `receiver-auth-pass.json`.
