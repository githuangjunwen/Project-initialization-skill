# Project Map Capability

Project Map is the thin requirements and traceability layer around GSD Core. It preserves the original idea, grows one branch of a recursive requirement tree at a time, blocks unconfirmed business decisions, and keeps a focused resume context. GSD remains the implementation engine.

## Ownership boundary

| Project Map owns | GSD Core owns |
| --- | --- |
| Immutable source capture | `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, and `STATE.md` |
| Project → Epic → Feature → Story → Task tree | Phase discussion and research |
| Decision authority and readiness gates | Phase plans and task execution |
| Focused `CURRENT.md` and global `PROJECT-MAP.md` | Execution summaries, verification, and shipping |
| Source/GSD/code/test links and impact review | Its own agents, Skills, and quality workflow |

Project Map does not generate a second GSD roadmap, plan, task report, or verification report.

## Model

The only valid hierarchy is:

```text
Project → Epic → Feature → Story → Task
P-001     E-001   F-001    S-001   T-001
```

Nodes move through `idea → exploring → specified → planned → implementing → verifying → done`. `blocked` and `needs-review` are independent flags. A Task cannot enter `done` without linked code, test, or document evidence.

Canonical data lives under `.planning/project-map/` in `index.json`, `sources/`, `nodes/`, and `decisions/`. `CURRENT.md`, `PROJECT-MAP.md`, and `gates/*.ready` are generated and recoverable.

> Never hand-edit generated Markdown or readiness stamps. Do not hand-edit canonical JSON either; use the CLI so hashes, indexes, impact state, and derived artifacts stay synchronized.

## Project-local setup

Requirements: Node.js 18 or newer and Git.

From a target project, install this checkout as a project-local development dependency:

```bash
npm install --save-dev /absolute/path/to/Project-initialization-skill
```

Initialize with the unmodified initial idea:

```bash
npx project-map init \
  --project-title "Team approvals" \
  --text "做一个团队审批工具"

npx project-map add project --title "审批工具" --source SRC-001
npx project-map add epic --parent P-001 --title "审批流程"
```

`init` refuses to overwrite an existing Project Map. Later clarification uses `capture`, which always creates a new `SRC-NNN`:

```bash
npx project-map capture --text "审批记录保留七年是待确认规则" --origin user
npx project-map link E-001 \
  --source SRC-002 \
  --source-excerpt "审批记录保留七年"
```

During development of this repository, replace `npx project-map` with `node bin/project-map.mjs`.

## Progressive workflow

Focus only the branch being refined:

```bash
npx project-map focus E-002
npx project-map status E-002 --json
```

With the Capability Skill installed, the natural-language request `推进 E-002` routes through `focus E-002`, reads `CURRENT.md`, and loads only its `must_read` context. Unrelated branch bodies remain excluded by default.

Add a Feature specification incrementally:

```bash
npx project-map add feature --parent E-002 --title "删除申请"
npx project-map node update F-001 \
  --summary "用户提交并追踪删除申请"
npx project-map ac add F-001 --text "用户可以提交删除申请"
```

Stories and Tasks can record their executable verification details:

```bash
npx project-map node update S-001 \
  --verification-method "提交申请并检查状态"
npx project-map node update T-001 \
  --completion-condition "接口和自动化测试通过" \
  --test-step "运行单元测试" \
  --test-step "运行审批流程集成测试"
```

## Decision authority

AI suggestions stay `proposed`. Critical categories such as approval, permissions, deletion, retention, billing, identity, security, privacy, compliance, and irreversible migration cannot be silently confirmed:

```bash
npx project-map decision create F-001 \
  --category approval \
  --question "谁批准删除？" \
  --proposal "管理员"

npx project-map decide D-001 \
  --confirm \
  --authority user \
  --evidence "产品负责人在本次任务中确认"
```

Only `user` and `authority-source` are valid confirmation or impact-review authorities.

When a confirmed rule changes, create its replacement and preserve the old decision as superseded:

```bash
npx project-map decide D-001 \
  --supersede-by D-002 \
  --authority user \
  --evidence "审批政策已变更"
```

## Readiness and GSD handoff

Focus the node, then run the deterministic gate immediately before planning or coding:

```bash
npx project-map readiness F-001 --stage plan --json
npx project-map readiness T-001 --stage code --json
```

Ready returns exit code `0`; blocked returns exit code `3` with exact blocker codes. Never start GSD planning or execution while blocked.

Link, rather than duplicate, GSD artifacts:

```bash
npx project-map link F-001 \
  --gsd-requirement DELETE-01 \
  --gsd-phase 2

npx project-map link T-001 \
  --gsd-plan .planning/phases/02-delete/02-01-PLAN.md
```

After readiness succeeds, the Skill reads its GSD handoff reference and recommends one installed GSD command such as `/gsd-discuss-phase 2`, `/gsd-plan-phase 2`, or `/gsd-execute-phase 2`. It must use the linked phase and verify the command spelling exposed by the installed GSD runtime.

## Traceability and change impact

Link only evidence observed in the actual change:

```bash
npx project-map link T-001 \
  --code src/approval/delete.mjs \
  --test test/approval/delete.test.mjs
npx project-map trace F-001 --json
```

When a parent requirement changes, mark its descendants for review without rewriting them:

```bash
npx project-map impact E-002 --json
npx project-map impact review F-001 \
  --authority user \
  --note "已按新的 Epic 边界复核"
```

Semantic changes made through `node update`, acceptance criteria, or confirmed decisions automatically propagate `needs-review` to descendants.

## Health check and recovery

Run the audit after requirement or code changes:

```bash
npx project-map check --json
```

`check` validates source hashes and metadata, node/index parity, hierarchy and cycles, source and decision references, GSD reverse links, evidence paths, generated hashes, and readiness hashes. Missing linked evidence is a warning; canonical corruption is an error.

Recovery order:

1. Run `project-map check --json`.
2. Repair canonical errors from their authoritative source. Do not reconstruct missing sources, nodes, or decisions from generated Markdown.
3. Run `project-map rebuild --json` only after canonical data passes.
4. Run `project-map check --json` again.

`rebuild` regenerates only `CURRENT.md`, `PROJECT-MAP.md`, generation hashes, and still-valid current readiness stamps.

## Capability installation status

The Capability exposes exactly one project-local Skill, `project-map`, with discovery, readiness, and GSD handoff details in separate on-demand references. Its manifest targets GSD `>=1.6.0 <2.0.0` and Codex.

The intended project-scoped installation is:

```bash
gsd capability install /absolute/path/to/capability --scope project
gsd capability list --json
```

The manifest and Skill pass repository validation. A live disposable GSD installation was attempted on 2026-08-20 but the environment's npm TLS chain failed with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`; repeat the two commands above in a certificate-healthy environment before treating runtime installation as verified.

## Deliberately deferred

The MVP intentionally defers GSD loop-level declarative gates, CoDD adapters, BMAD adapters, external plugins, and the previously cancelled requirements framework. Add loop gates only after pinning and testing the installed GSD version's official predicate contract.
