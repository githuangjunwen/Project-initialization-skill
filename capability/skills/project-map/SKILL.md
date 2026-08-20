---
name: project-map
description: Use when a repository has .planning/project-map and the user asks to start or resume a node such as “推进 E-002” or “完善 F-006”, inspect project status, capture requirement changes or business decisions, prepare implementation, or reconnect requirements with GSD plans, code, and tests.
---

# Project Map

Treat Project Map files as durable project memory and the CLI as their only writer. Keep GSD responsible for its roadmap, phase plans, execution, and verification.

## Route intent

| Intent | First action |
| --- | --- |
| `推进 <ID>` / `完善 <ID>` | Run `project-map focus <ID> --json` |
| Check status | Run `project-map status [ID] --json` |
| Record a new requirement source | Run `project-map capture ... --json` |
| Explore ambiguity | Focus, then read [discovery](references/discovery.md) |
| Prepare planning or coding | Read [readiness](references/readiness.md) |
| Requirement changed | Run `project-map impact <ID> --json` |
| Hand off to GSD | Read [GSD handoff](references/gsd-handoff.md) |

## Workflow

1. Locate the repository root, verify `.planning/project-map/index.json` exists, and confirm the project-local `project-map` executable is available. If the executable is absent, stop and point to project-local setup; do not edit storage directly.
2. For resume or refinement intent, run `project-map focus <ID> --json`.
3. Read `CURRENT.md` and only the paths/IDs in its `must_read` set. Treat `may_need` as optional and do not load excluded branches by default.
4. If details are missing, use `references/discovery.md`; write facts, proposals, acceptance criteria, and decisions through CLI commands. Never turn an AI proposal into a confirmed business rule.
5. Run `project-map readiness <ID> --stage plan|code --json`.
6. Never invoke GSD planning or execution when readiness is blocked. Resolve the reported blocker or ask the user for the missing authority.
7. When ready, read `references/gsd-handoff.md`, verify the installed GSD command surface, and recommend one exact next command.
8. After code changes, link only observed code/tests. For requirement changes, capture and link the new source before running `project-map impact <ID> --json`. Then run `project-map check --json`.

Never edit sources, canonical node/decision JSON, generated maps, or readiness stamps by hand. Never rewrite unrelated nodes to make documents appear synchronized.
