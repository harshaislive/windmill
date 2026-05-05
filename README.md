# Beforest Windmill Automations

This repository contains the source-controlled Windmill automations for Beforest sales and collective workflows.

## What Is Included

- Windmill scripts, flows, triggers, schedules, and metadata under `f/`.
- Agent/project instructions in `AGENTS.md`, `CLAUDE.md`, `.agents/`, and `.claude/`.
- Sales workflow documentation under `workflow_sales/`.
- Windmill CLI configuration in `wmill.yaml`.

## What Is Not Committed

The following local folders are intentionally ignored because they may contain API credentials, signed meeting links, raw webhook payloads, or lead PII:

- `.env`
- `n8n_workflows/`
- `snapshots/`
- `typeform_webhook_payload/`

Use `.env.example` as the local placeholder file. Real production credentials should stay in Windmill variables/resources.

## Useful Commands

```powershell
wmill sync pull --skip-variables --skip-resources --skip-resource-types
wmill generate-metadata f\sales --yes
wmill sync push --skip-variables --skip-resources --skip-resource-types
```

Read `workflow_sales/team_handoff/README.md` before changing the sales funnel.
