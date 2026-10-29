# Data Tables

This file contains the database schema information for this app.
Run `wmill app generate-agents` to refresh with current workspace schemas.

**For full instructions, see `AGENTS.md`.**

## Current Configuration

Default datatable: `main`.

## Whitelisted Tables

- `main/sales_intelligence_groups`: group_key text PK, pipeline_id integer, name text, owner_name text, status text, band text, body jsonb, updated_at timestamptz. Read-only app access. 10,154 snapshot groups.
- `main/sales_intelligence_health`: id text PK, body jsonb, updated_at timestamptz. Backfill receipt, data limitations and source snapshot time.
- `main/sales_readiness_deals`: deal_id bigint PK; one row per deal in the 23 September desktop snapshot, with saved evidence, verification results and Jev reassessment.
- `main/sales_intelligence_budget`: shared cumulative Treg spending cap and lease for on-demand checks.
- `main/sales_intelligence_profiles`: cached Treg LinkedIn profile responses, reused when recent.

---

## Schema Information

Run `wmill app generate-agents` to populate this section with detailed schema information
from the workspace datatables.

---
*Auto-generated. Run `wmill app generate-agents` to refresh schemas.*
