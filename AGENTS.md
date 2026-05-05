# Windmill AI Agent Instructions

You are a helpful assistant that can help with Windmill scripts, flows, apps, and resources management.

## Important Notes
- Every new entity MUST be created using the skills listed below.
- Every modification of an entity MUST be done using the skills listed below.
- User MUST be asked where to create the entity. It can be in its user folder, under u/{user_name} folder, or in a new folder, /f/{folder_name}/. folder_name and user_name must be provided by the user.
- Current sales automation coverage, QA results, and backlog are tracked in `workflow_sales/Windmill Sales Automation QA and Backlog.md`. Check and update that file before adding or changing sales automations.
- Team-facing sales automation documentation lives in `workflow_sales/team_handoff/`. Start with `workflow_sales/team_handoff/README.md` before changing the sales funnel.

## Live Sales Automation Index

The current Beforest sales funnel is split into these Windmill items:

- `01A` trigger / `01B` action: Typeform to Pipedrive intake at `f/sales/typeform_to_pipedrive_intake`.
- `02A` trigger / `02B` guard: Pipedrive `1on1 - TBC` webhook to calendar prebook at `f/sales/pipedrive_1on1_tbc_to_calendar_prebook`.
- `03A` action: owner calendar prebook and 1on1 WhatsApp at `f/sales/calendar_prebook_1on1`.
- `04A` trigger / `04B` flow / `04C` action: Calendly webinar booking to Zoom/Pipedrive/confirmation at `f/sales/calendly_webinar_to_pipedrive_activity` and `f/sales/create_webinar_activity_from_calendly`.
- `05A` trigger / `05B` flow / `05C-05G` workers: Interakt inbound WhatsApp router and 1on1 response handlers.
- `06A/06B`: 1on1 reminder worker and schedule at `f/sales/send_1on1_reminders`.
- `07A/07B`: owner attendance check worker and schedule at `f/sales/send_owner_attendance_checks`.
- `08A`: webinar reminder worker at `f/sales/send_webinar_reminders`; fallback schedule `08Z` is disabled.
- `09A/09B`: Zoom intro registrants to Pipedrive sync at `f/collectives/zoom_collective_to_pipedrive`.

Pipedrive activity standard: automation audit activities belong to Beforest Admin (`connect@beforest.co`, user ID `18891506`) and use short, human-readable subjects such as `Typeform received`, `Calendar invite created`, and `WhatsApp failed to deliver`. Real scheduled calls/webinars remain owner-owned open activities.

## Script Writing Guide

You MUST use the `write-script-<language>` skill to write or modify scripts in the language specified by the user. Use bun by default.

## Flow Writing Guide

You MUST use the `write-flow` skill to create or modify flows.

## Raw App Development

You MUST use the `raw-app` skill to create or modify raw apps.
Whenever a new app needs to be created you MUST ask the user to run `wmill app new` in its terminal first.

## Triggers

You MUST use the `triggers` skill to configure HTTP routes, WebSocket, Kafka, NATS, SQS, MQTT, GCP, or Postgres CDC triggers.

## Schedules

You MUST use the `schedules` skill to configure cron schedules.

## Resources

You MUST use the `resources` skill to manage resource types and credentials.

## CLI Reference

You MUST use the `cli-commands` skill to use the CLI.

## Skills

For specific guidance, ALWAYS use the skills listed below.

- `.claude/skills/write-script-bash/SKILL.md` - MUST use when writing Bash scripts.
- `.claude/skills/write-script-bigquery/SKILL.md` - MUST use when writing BigQuery queries.
- `.claude/skills/write-script-bun/SKILL.md` - MUST use when writing Bun/TypeScript scripts.
- `.claude/skills/write-script-bunnative/SKILL.md` - MUST use when writing Bun Native scripts.
- `.claude/skills/write-script-csharp/SKILL.md` - MUST use when writing C# scripts.
- `.claude/skills/write-script-deno/SKILL.md` - MUST use when writing Deno/TypeScript scripts.
- `.claude/skills/write-script-duckdb/SKILL.md` - MUST use when writing DuckDB queries.
- `.claude/skills/write-script-go/SKILL.md` - MUST use when writing Go scripts.
- `.claude/skills/write-script-graphql/SKILL.md` - MUST use when writing GraphQL queries.
- `.claude/skills/write-script-java/SKILL.md` - MUST use when writing Java scripts.
- `.claude/skills/write-script-mssql/SKILL.md` - MUST use when writing MS SQL Server queries.
- `.claude/skills/write-script-mysql/SKILL.md` - MUST use when writing MySQL queries.
- `.claude/skills/write-script-nativets/SKILL.md` - MUST use when writing Native TypeScript scripts.
- `.claude/skills/write-script-php/SKILL.md` - MUST use when writing PHP scripts.
- `.claude/skills/write-script-postgresql/SKILL.md` - MUST use when writing PostgreSQL queries.
- `.claude/skills/write-script-powershell/SKILL.md` - MUST use when writing PowerShell scripts.
- `.claude/skills/write-script-python3/SKILL.md` - MUST use when writing Python scripts.
- `.claude/skills/write-script-rlang/SKILL.md` - MUST use when writing R scripts.
- `.claude/skills/write-script-rust/SKILL.md` - MUST use when writing Rust scripts.
- `.claude/skills/write-script-snowflake/SKILL.md` - MUST use when writing Snowflake queries.
- `.claude/skills/write-flow/SKILL.md` - MUST use when creating flows.
- `.claude/skills/raw-app/SKILL.md` - MUST use when creating raw apps.
- `.claude/skills/triggers/SKILL.md` - MUST use when configuring triggers.
- `.claude/skills/schedules/SKILL.md` - MUST use when configuring schedules.
- `.claude/skills/resources/SKILL.md` - MUST use when managing resources.
- `.claude/skills/cli-commands/SKILL.md` - MUST use when using the CLI.
