# Continuous Learning System

This project uses a non-destructive learning system. `AGENTS.md` remains the operating constitution; this document explains where to write durable memory after meaningful work.

## Principles

- Preserve what already works.
- Add only missing memory, proof, or routing guidance.
- Prefer updating the existing source doc over creating a parallel explanation.
- Keep operational boundaries intact: Windmill entity changes still follow the required skills and approval rules.
- Record durable behavior changes so future Codex runs do not rediscover the same facts.

## Where To Write

- `data/learning/daily/` - dated summaries of meaningful work and follow-ups.
- `data/learning/incidents/` - failure reports, root causes, mitigations, and verification.
- `data/learning/decisions/` - user, Codex, or joint decisions that should change future execution.
- `data/learning/learnings/` - reusable lessons discovered from implementation, QA, APIs, or operations.
- `data/learning/patterns/` - reliable approaches worth reusing.
- `data/tracking/` - durable state, exports, audit inputs, reconciliation files, and other evidence that should persist across runs.

Sales automation coverage and backlog still live in `workflow_sales/Windmill Sales Automation QA and Backlog.md`. Team-facing sales documentation still starts at `workflow_sales/team_handoff/README.md`.

## When To Write Back

Write back after work that changes behavior, approval boundaries, operational state, send/no-send policy, suppressions, data mapping, QA conclusions, or future run instructions.

Good writebacks answer:

- What changed or was decided?
- Why did it matter?
- What evidence proves it?
- What should future runs now do differently?
- Which files, workflows, systems, or external tools are affected?

Skip writeback for minor exploration, unchanged checks, or disposable terminal output unless it explains a future risk.

## Decision Notes

Create a dated note in `data/learning/decisions/` for meaningful decisions, including:

- user-requested behavior changes
- workflow or process changes
- architecture or implementation choices
- approval or safety-boundary changes
- tool or integration choices
- data-handling or source-of-truth decisions
- prioritization decisions that affect later work
- campaign strategy, send/no-send, dedupe, or suppression policy changes

Each decision note should capture:

- date
- decision summary
- initiated by: `user`, `codex`, or `joint`
- reason
- affected files, workflows, or systems
- what future runs should now do differently

## Risky Work

Before risky work, read relevant source docs and recent memory first. At minimum check `AGENTS.md`, any affected workflow docs, recent incidents, related decisions, and proven patterns. Then make the smallest safe change, verify it, and write back the durable result.

Use these lenses before acting:

- engineer: correctness, tests, edge cases, rollback
- operator: Windmill reliability, observability, runbooks, handoff
- CFO: duplicate sends, avoidable spend, wasted runs, unnecessary complexity
- PM: priority, user impact, sequencing, scope control
- archivist: durable memory, traceability, future clarity
