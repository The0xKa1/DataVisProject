# AGENTS.md

This file defines the project-level workflow for AI agents and human collaborators working on the DataVisProject course assignment.

## Project Context

This repository is for a data visualization course final project. The expected deliverable is a reproducible visual analytics system with clear team contribution records, data provenance, design rationale, AI usage disclosure, and 1-2 case studies.

The current collaboration structure is intentionally lightweight:

- Project documentation lives in `docs/`.
- Session handoffs live in `docs/handoff/`.
- Personal development records live in `docs/开发记录/<name-or-id>/`.
- Do not create `obsidian-docs/` unless the team explicitly decides to migrate to a heavier collaboration protocol.

## Required Startup Routine

Before substantive work, every agent must read:

1. `docs/README.md`
2. `docs/CURRENT.md`
3. `docs/TODO.md`

If the task touches data, also read `docs/DATASET.md`.
If the task touches visualization or interaction design, also read `docs/DESIGN.md`.
If the task affects submission, presentation, or documentation, also read `docs/DIVISION.md`, `docs/AI_USAGE.md`, and `docs/CASE_STUDIES.md` as relevant.

## Work Protocol

1. Confirm the task goal, affected files, and acceptance criteria before implementing.
2. Prefer small, reviewable changes that preserve git history as contribution evidence.
3. Keep code, data processing, visualization design, and documentation decisions traceable.
4. After finishing a task, update `docs/CURRENT.md` and `docs/TODO.md`.
5. At the end of a meaningful work session, add a new handoff note under `docs/handoff/`.
6. Personal process notes, experiments, and responsibility evidence should be written under `docs/开发记录/<name-or-id>/`.

## Course Requirements To Preserve

The repository must keep enough evidence to satisfy the course requirements:

- Team size and division of work for 2-3 members.
- Data source, license, scale, and complexity.
- No use of forbidden toy datasets such as iris, titanic, or tips.
- No reuse of the exact same dataset as ChinaVis / VAST reference challenges.
- Clear visual analytics task definition.
- View choices and coordinated interaction rationale.
- References to papers, systems, or open-source projects when borrowed.
- The team's own design contribution for the selected data and tasks.
- AI usage statement explaining tools, roles, and which decisions were made by the team.
- README instructions that let a TA run the system within about 15 minutes.
- 1-2 case studies showing patterns discovered through the system.

## Safety and Hygiene

- Never commit API keys, access tokens, private credentials, or personal sensitive data.
- Never commit raw confidential data or non-public data unless the team has permission and the data is properly anonymized.
- Do not present AI-generated suggestions as final design decisions unless the team can explain and defend them.
- Do not overwrite another member's work without first understanding the current diff and coordination context.
- Do not use force push or bypass git hooks.

## Documentation Update Rules

- `docs/CURRENT.md`: keep it short and current; update project phase, confirmed decisions, recent completions, blockers, and immediate focus.
- `docs/TODO.md`: keep task ownership and acceptance criteria explicit.
- `docs/handoff/`: append one dated note per meaningful session; do not rewrite old handoffs unless correcting a factual mistake.
- `docs/开发记录/`: each member keeps their own record directory.

## Suggested Commit Style

Use clear, module-oriented commit messages, for example:

- `chore: initialize project collaboration workspace`
- `docs: record dataset source and license`
- `feat: add temporal overview visualization`
- `fix: handle missing location values in preprocessing`
- `docs: add ai usage statement`
