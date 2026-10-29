# Beforest Automation Domain Migration — Handoff Report

Date: 31 August 2026  
Canonical Windmill hostname: `https://flows.ops.beforest.co`  
Overall status: **Operationally complete for current Beforest sales flows; monitor before retiring the legacy hostname.**

## Executive Summary

The active Beforest sales-automation integrations have been moved from `windmill.devsharsha.live` to `flows.ops.beforest.co`. Typeform and Pipedrive were verified through their APIs, the active Interakt templates and Windmill sender scripts were read back after deployment, and Harsha confirmed the Windmill dashboard, Interakt inbound webhook, and live website signal changes.

The disabled legacy Calendly webhook was intentionally not migrated. Calendly remains in use through booking links and the separate Vivek booking-reconciliation schedule; those do not depend on the old Windmill webhook hostname.

Do not remove the old hostname yet. Keep it available until access logs show no legitimate traffic for at least 14 consecutive days and a real lead has completed each critical path on the new hostname.

## Completed Migration

| Component | New destination/state | Verification |
| --- | --- | --- |
| DNS | `*.ops.beforest.co` points to `5.78.124.244` | Confirmed by Harsha in GoDaddy |
| Windmill dashboard/base URL | `https://flows.ops.beforest.co` | Confirmed by Harsha; login page loaded successfully |
| Typeform | 10 enabled intake webhooks use the new hostname | Typeform API read-back: 10/10 enabled, SSL verification preserved |
| Pipedrive | Deal-change webhook uses `https://flows.ops.beforest.co/api/r/pipedrive/1on1/tbc/prebook` | Replacement webhook `1788421` read back before old webhook `1652218` was removed |
| Interakt inbound | `https://flows.ops.beforest.co/api/r/interakt/whatsapp/inbound` | Confirmed by Harsha; signature authentication remains enabled in Windmill |
| Interakt brochure/Journey templates | Nine approved templates use the new tracking URL | Interakt template inventory read-back and API campaign usability checks passed; no test WhatsApp was sent |
| Windmill brochure/Journey senders | Three deployed scripts use the new templates and hostname | Fresh remote script read-back found the new references, button index `0`, and no superseded references |
| Qualified 1on1 website signal | `https://flows.ops.beforest.co/api/r/sales/typeform/qualified-1on1-signal` | Live website update confirmed by Harsha; eight matching local HTML/shared-snippet copies updated, with zero matching old references |

## Intentional Exceptions

| Item | Current state | Required action |
| --- | --- | --- |
| Calendly webinar webhook | Legacy Windmill HTTP trigger is disabled; the external webhook still references the old hostname | Do not migrate while disabled. Remove the obsolete external subscription when confirmed unnecessary, or migrate it before re-enabling the flow |
| Vivek Calendly reconciliation | Live four times daily through the Calendly API | Continue monitoring; it does not use the old Windmill webhook URL |
| Bewild Rice unsubscribe | Local staged scripts still use the old hostname | Change before enabling the Rice nurture/email launch |
| Old documentation and dashboard notes | Some historical/reference files still show the old hostname | Documentation cleanup only; not a current runtime blocker |
| `collective_brochure_link_v3` | Malformed migration draft | Never wire it. Live brochure template is `collective_brochure_link_v4` |

## Monitoring Checklist

### Automations specialist

Daily for the first 14 days:

- Check Windmill failed jobs for `typeform_to_pipedrive_intake`, `pipedrive_1on1_tbc_to_calendar_prebook`, `send_brochure_after_typeform`, `send_gis_story_cta`, `send_collective_story_unopened_nurture`, and `interakt_whatsapp_inbound`.
- Confirm each real Typeform submission creates or updates the expected Pipedrive person/deal within five minutes.
- Confirm brochure/Journey WhatsApps use the v4/v2 templates and that their buttons open through `flows.ops.beforest.co`.
- Check Interakt inbound button/text responses reach Windmill and do not produce signature-authentication failures.
- Confirm qualified website journeys create the expected `Qualified1on1AnswerSignal` processing record without duplicating Pipedrive/final-submit effects.
- Review Pipedrive audit activities for missing or repeated automation events.

Weekly after stabilization:

- Review Typeform webhook delivery failures and Pipedrive webhook delivery failures.
- Review Interakt send failures, rejected templates, and unusual inbound-signature failures.
- Confirm the Vivek Calendly reconciliation schedule continues to succeed at 08:37, 11:37, 15:37, and 19:37 IST.
- Confirm no active automation has reverted to a v1 Journey template or `collective_brochure_link_v2`.

### Systems engineer

Continuous or daily:

- Monitor `https://flows.ops.beforest.co/api/health/status` for availability and non-200 responses.
- Alert on repeated 5xx responses, worker unavailability, growing Windmill queues, database-health failures, or restart loops.
- Monitor Traefik/Coolify access logs for the new and legacy hostnames. Record the path, status, source, and user agent for legitimate legacy-host requests.
- Monitor TLS renewal and alert before the certificate has fewer than 21 days remaining.
- Monitor disk, memory, CPU, database storage, and backup completion on `5.78.124.244`.
- Confirm DNS for `flows.ops.beforest.co` continues resolving to the intended server and no unexpected wildcard hosts are exposed.

Suggested alert thresholds:

- Health endpoint fails twice consecutively.
- HTTP 5xx exceeds 1% over five minutes or any critical webhook returns repeated 5xx responses.
- A webhook-backed lead is missing its expected Pipedrive update after five minutes.
- Windmill queue age exceeds ten minutes during normal operation.
- TLS certificate has fewer than 21 days remaining.
- Any legitimate request still reaches the old hostname after the planned retirement window.

## Security Notes

Changing the hostname reduces obvious naming exposure but is not itself a security boundary. A public login page, response headers, or application assets can still reveal the underlying software.

Recommended next security phase:

- Keep public webhook routes reachable, but place the administrative dashboard behind an IP allowlist, VPN/Tailscale, SSO, or reverse-proxy access policy.
- Keep Interakt signature verification enabled and add equivalent verification/authentication wherever the source platform supports it.
- Rate-limit unauthenticated public routes and alert on repeated invalid tokens, signatures, or deal IDs.
- Do not expose Coolify or other infrastructure dashboards on easily discoverable public hostnames without a separate access-control layer.
- Maintain tested server/database backups before removing the legacy hostname.

## Retirement and Rollback

Retire `windmill.devsharsha.live` only after all of the following are true:

1. At least one real lead has completed Typeform → Windmill → Pipedrive on the new hostname.
2. At least one brochure/Journey message button has successfully opened through the new tracking route.
3. At least one Interakt inbound response has reached Windmill on the new hostname.
4. At least one qualified website signal has been observed on the new endpoint.
5. Legacy-host access logs show no legitimate traffic for 14 consecutive days.

If a critical path fails, retain DNS for both hostnames, identify the failing caller from logs, and restore only that caller or script to its last verified configuration. Do not broadly roll back unrelated integrations.

## Remaining Actions

1. Observe the next real lead end to end and record the relevant Windmill job and Pipedrive activity.
2. Start a 14-day legacy-host traffic review.
3. Add an access-control layer for the Windmill administrative interface.
4. Update the Bewild Rice unsubscribe hostname before launch.
5. Remove the disabled Calendly webhook subscription when the team confirms it will not be re-enabled.
6. Clean historical documentation after runtime monitoring is stable.

## Supporting Records

- `workflow_sales/Windmill Sales Automation QA and Backlog.md`
- `workflow_sales/team_handoff/03_integration_setup.md`
- `data/tracking/interakt_template_domain_migration_20260831.md`
- `data/learning/daily/2026-08-31-typeform-windmill-domain-migration.md`
- `data/learning/daily/2026-08-31-interakt-template-domain-migration.md`
