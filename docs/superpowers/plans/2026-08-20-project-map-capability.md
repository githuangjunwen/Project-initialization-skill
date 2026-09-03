# Project Map 能力包 MVP 实施计划

> **历史实施计划，不是安装或运行手册。** 当前安装入口见项目根目录 `README.md`，完整安装、更新和排障说明见 `docs/安装部署与更新.md`。本文保留的命令代表当时计划或验证尝试，可能已经失效，不得直接复制到当前环境执行。

> **供智能体执行者使用：** 必须使用子技能：推荐使用 `superpowers:subagent-driven-development`，或使用 `superpowers:executing-plans`，按任务逐项执行本计划。使用复选框（`- [ ]`）跟踪步骤。

**目标：** 构建项目本地 Project Map CLI 和一个 GSD/Codex Skill，以保留原始意图、管理 `P→E→F→S→T` 树、执行已确认的业务决策、生成聚焦的恢复上下文，并维护追踪与影响元数据，同时不重复 GSD 计划产物。

**架构：** 零运行时依赖的 Node.js CLI 负责 `.planning/project-map/` 下的确定性状态。一个 GSD Feature Capability 拥有一个 `project-map` 命名空间 Skill，将用户意图转换为 CLI 操作，并将就绪节点交给既有 GSD 工作流。规范 JSON／来源文件与生成的 Markdown 和就绪标记相互分离。

**技术栈：** Node.js 18+ ESM、Node 标准库、`node:test`、GSD Core Capability 清单及 Codex Skill Markdown。

**设计规格：** `docs/design/2026-08-20-project-map-capability-design.md`

## 全局约束

- `Manage Project Requirements` is excluded from runtime dependencies, implementation sources, templates, and workflow behavior.
- Runtime dependencies must remain zero.
- Canonical project state lives only under `.planning/project-map/`; GSD owns the rest of `.planning/`.
- Source files are append-only and protected by SHA-256 integrity checks.
- Logical hierarchy is exactly `Project → Epic → Feature → Story → Task`.
- AI-created critical business decisions remain `proposed`; only explicit user or authority-source confirmation can set `confirmed`.
- No command automatically invokes GSD, Git, an external plugin, or a remote service.
- All canonical JSON writes use same-directory temporary files followed by atomic rename.
- MVP exposes exactly one Capability Skill stem: `project-map`.
- Third-party GSD internal query modules are out of scope; use the CLI through the owned Skill.

---

## Planned file structure

```text
package.json                              # package metadata and test scripts
bin/project-map.mjs                       # executable CLI entry
src/cli.mjs                               # argument parsing and command dispatch
src/errors.mjs                            # typed user-facing errors and exit codes
src/paths.mjs                             # repository discovery and path confinement
src/json.mjs                              # stable JSON and atomic writes
src/hash.mjs                              # SHA-256 helpers
src/store.mjs                             # canonical state persistence
src/model.mjs                             # node/decision enums and validation
src/sources.mjs                           # append-only source capture and checking
src/nodes.mjs                             # IDs, tree mutation, lifecycle state
src/decisions.mjs                         # decision creation and confirmation
src/readiness.mjs                         # plan/code gates and readiness stamps
src/context.mjs                           # focused context resolution
src/render.mjs                            # CURRENT.md and PROJECT-MAP.md generation
src/trace.mjs                             # trace graph queries
src/impact.mjs                            # downstream needs-review propagation
src/check.mjs                             # complete deterministic audit/rebuild check
capability/capability.json                # GSD third-party Feature Capability manifest
capability/skills/project-map/SKILL.md    # single Codex/GSD namespace Skill
capability/skills/project-map/references/discovery.md
capability/skills/project-map/references/readiness.md
capability/skills/project-map/references/gsd-handoff.md
test/helpers/repo.mjs                     # isolated fixture repository helper
test/cli.test.mjs
test/sources.test.mjs
test/nodes.test.mjs
test/decisions-readiness.test.mjs
test/context-render.test.mjs
test/trace-impact.test.mjs
test/check.test.mjs
test/capability.test.mjs
test/e2e.test.mjs
README.md
```

### Task 1: CLI and safe filesystem foundation

**Requirements:** PMAP-012.

**Files:**
- Create: `package.json`
- Create: `bin/project-map.mjs`
- Create: `src/cli.mjs`
- Create: `src/errors.mjs`
- Create: `src/paths.mjs`
- Create: `src/json.mjs`
- Create: `src/hash.mjs`
- Create: `test/helpers/repo.mjs`
- Create: `test/cli.test.mjs`

**Interfaces:**
- Produces: `run(argv, io) -> Promise<number>` in `src/cli.mjs`.
- Produces: `findProjectRoot(startDir)`, `projectMapPaths(root)`, `assertConfined(root, candidate)`.
- Produces: `readJson(path)`, `writeJsonAtomic(path, value)`, `stableStringify(value)`.
- Produces: `sha256(text)`.

- [x] **Step 1: Write failing CLI and confinement tests**

```js
// test/cli.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.mjs';

test('unknown command exits 2 with stable JSON error', async () => {
  const output = [];
  const code = await run(['unknown', '--json'], {
    cwd: process.cwd(), stdout: value => output.push(value), stderr: value => output.push(value)
  });
  assert.equal(code, 2);
  assert.deepEqual(JSON.parse(output.join('')), {
    ok: false,
    error: { code: 'UNKNOWN_COMMAND', message: 'Unknown command: unknown' }
  });
});
```

Add a second test that calls `assertConfined('/tmp/repo', '/tmp/outside')` and expects error code `PATH_OUTSIDE_PROJECT_MAP`.

- [x] **Step 2: Run the tests and confirm the expected import failure**

Run: `node --test test/cli.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/cli.mjs`.

- [x] **Step 3: Implement typed errors, stable JSON, hashing, paths, and dispatch**

```js
// src/errors.mjs
export class ProjectMapError extends Error {
  constructor(code, message, exitCode = 1, details = undefined) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}
```

```js
// src/json.mjs
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
  }
  return value;
}

export const stableStringify = value => `${JSON.stringify(sortValue(value), null, 2)}\n`;
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(temporary, stableStringify(value), { flag: 'wx' });
  await rename(temporary, path);
}
```

Implement `run()` as a command table. Unknown commands throw `ProjectMapError('UNKNOWN_COMMAND', ..., 2)`. In `--json` mode emit exactly `{ok:false,error:{code,message}}`; otherwise write the message to stderr.

- [x] **Step 4: Add executable entry and package scripts**

```js
#!/usr/bin/env node
// bin/project-map.mjs
import { run } from '../src/cli.mjs';
process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value)
});
```

`package.json` must declare `"type":"module"`, `"engines":{"node":">=18"}`, `"bin":{"project-map":"bin/project-map.mjs"}`, and `"test":"node --test test/*.test.mjs"`.

- [x] **Step 5: Run the focused tests**

Run: `node --test test/cli.test.mjs`

Expected: PASS.

- [x] **Step 6: Commit the foundation**

```bash
git add package.json bin/project-map.mjs src/errors.mjs src/paths.mjs src/json.mjs src/hash.mjs src/cli.mjs test/helpers/repo.mjs test/cli.test.mjs
git commit -m "feat: add project map cli foundation"
```

### Task 2: Initialize storage and preserve immutable source input

**Requirements:** PMAP-001, PMAP-012.

**Files:**
- Create: `src/store.mjs`
- Create: `src/sources.mjs`
- Create: `test/sources.test.mjs`
- Modify: `src/cli.mjs`

**Interfaces:**
- Consumes: `projectMapPaths`, `writeJsonAtomic`, `readJson`, `sha256`.
- Produces: `initializeStore(root, {title, rawSource, origin, now})`.
- Produces: `captureSource(root, {text, origin, now}) -> SourceRecord`.
- Produces: `verifySources(root) -> {ok, errors}`.
- Produces: `loadIndex(root)` and `saveIndex(root, index)`.

- [x] **Step 1: Write failing initialization and tamper tests**

```js
test('init preserves raw bytes and refuses overwrite', async () => {
  const repo = await createFixtureRepo();
  await initializeStore(repo, { title: 'Demo', rawSource: '模糊想法\n第二行', origin: 'user', now: fixedNow });
  const source = await readFile(join(repo, '.planning/project-map/sources/SRC-001.md'), 'utf8');
  assert.match(source, /模糊想法\n第二行/);
  await assert.rejects(
    initializeStore(repo, { title: 'Again', rawSource: 'other', origin: 'user', now: fixedNow }),
    error => error.code === 'ALREADY_INITIALIZED'
  );
});

test('check detects a modified source body', async () => {
  const repo = await initializedRepo();
  await appendFile(join(repo, '.planning/project-map/sources/SRC-001.md'), '\nchanged');
  const result = await verifySources(repo);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SOURCE_HASH_MISMATCH');
});
```

- [x] **Step 2: Run and confirm failure**

Run: `node --test test/sources.test.mjs`

Expected: FAIL because `src/sources.mjs` does not exist.

- [x] **Step 3: Implement the initial index and source envelope**

Initial `index.json`:

```json
{
  "schema_version": 1,
  "project_title": "Demo",
  "current_node_id": null,
  "counters": {"P": 0, "E": 0, "F": 0, "S": 0, "T": 0, "SRC": 1, "D": 0},
  "nodes": {},
  "sources": {
    "SRC-001": {"path": "sources/SRC-001.md", "sha256": "the lower-case hex returned by sha256(rawSource)", "raw_bytes": 0, "origin": "user"}
  },
  "gsd_reverse": {},
  "generation": {"project_map_sha256": null, "current_sha256": null}
}
```

Source files use a metadata header followed by the raw body through end-of-file:

```md
# SRC-001

- Captured: 2026-08-20T00:00:00.000Z
- Origin: user
- Raw-Bytes: exact UTF-8 byte length
- SHA-256: the lower-case hex returned by sha256(rawSource)

## Raw input

the exact unmodified raw input continues to end-of-file
```

There is deliberately no closing fence: the input may contain arbitrary Markdown fences. Compute the byte length and hash before adding the envelope. `captureSource` allocates a new ID and opens the file with `flag:'wx'`; no update-source operation is added.

- [x] **Step 4: Wire `init` and `capture` commands**

`init` requires `--project-title` and exactly one of `--source <file>` or `--text <value>`. `capture` requires exactly one of those input forms. Both support `--origin`, defaulting to `user`.

- [x] **Step 5: Run source and CLI tests**

Run: `node --test test/sources.test.mjs test/cli.test.mjs`

Expected: PASS.

- [x] **Step 6: Commit immutable source storage**

```bash
git add src/store.mjs src/sources.mjs src/cli.mjs test/sources.test.mjs
git commit -m "feat: preserve immutable project sources"
```

### Task 3: Add stable IDs and the recursive requirement tree

**Requirements:** PMAP-002, PMAP-003, PMAP-004.

**Files:**
- Create: `src/model.mjs`
- Create: `src/nodes.mjs`
- Create: `test/nodes.test.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/store.mjs`

**Interfaces:**
- Produces: `NODE_TYPES`, `NODE_STATUS`, `allowedParentType(type)`.
- Produces: `addNode(root, input) -> Node`.
- Produces: `updateNode(root, id, patch) -> {node, changedFields}`.
- Produces: `loadNode(root, id)`, `listChildren(root, id)`, `listAncestors(root, id)`.

- [x] **Step 1: Write failing hierarchy tests**

```js
test('allocates stable IDs and permits an incomplete tree', async () => {
  const repo = await initializedRepo();
  const project = await addNode(repo, { type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow });
  const epic = await addNode(repo, { type: 'epic', parentId: project.id, title: 'Auth', now: fixedNow });
  assert.equal(project.id, 'P-001');
  assert.equal(epic.id, 'E-001');
});

test('rejects skipped levels and duplicate project roots', async () => {
  const repo = await repoWithProject();
  await assert.rejects(
    addNode(repo, { type: 'story', parentId: 'P-001', title: 'Invalid', now: fixedNow }),
    error => error.code === 'INVALID_PARENT_TYPE'
  );
  await assert.rejects(
    addNode(repo, { type: 'project', title: 'Second', sourceIds: ['SRC-001'], now: fixedNow }),
    error => error.code === 'PROJECT_ALREADY_EXISTS'
  );
});
```

- [x] **Step 2: Run and confirm failure**

Run: `node --test test/nodes.test.mjs`

Expected: FAIL because `src/nodes.mjs` does not exist.

- [x] **Step 3: Implement node validation and ID allocation**

Use exact maps:

```js
export const NODE_PREFIX = { project: 'P', epic: 'E', feature: 'F', story: 'S', task: 'T' };
export const PARENT_TYPE = { project: null, epic: 'project', feature: 'epic', story: 'feature', task: 'story' };
export const NODE_STATUS = ['idea', 'exploring', 'specified', 'planned', 'implementing', 'verifying', 'done'];
```

Every node uses the schema from the design spec. For non-Project nodes, inherit traceability from the parent but do not copy source text. Save the node before updating the index only through a storage transaction helper that writes both temporary files and renames the node first, index last.

- [x] **Step 4: Invalidate derived artifacts on every mutation**

Add `invalidateDerived(root, affectedNodeIds)` to delete only these recoverable files when present:

```text
.planning/project-map/CURRENT.md
.planning/project-map/PROJECT-MAP.md
.planning/project-map/gates/current-plan.ready
.planning/project-map/gates/current-code.ready
```

It must never delete canonical source, node, decision, index, or event files.

- [x] **Step 5: Wire `add` and `node update` commands**

`add` supports `--parent`, `--title`, repeated `--source`, and `--json`. `node update <ID>` supports `--title`, `--summary`, and `--status`; unsupported fields exit with `INVALID_PATCH_FIELD`.

- [x] **Step 6: Run focused tests**

Run: `node --test test/nodes.test.mjs test/sources.test.mjs`

Expected: PASS.

- [x] **Step 7: Commit the tree model**

```bash
git add src/model.mjs src/nodes.mjs src/store.mjs src/cli.mjs test/nodes.test.mjs
git commit -m "feat: add recursive project requirement tree"
```

### Task 4: Add decisions, acceptance criteria, and readiness gates

**Requirements:** PMAP-003, PMAP-005, PMAP-012.

**Files:**
- Create: `src/decisions.mjs`
- Create: `src/readiness.mjs`
- Create: `test/decisions-readiness.test.mjs`
- Modify: `src/nodes.mjs`
- Modify: `src/cli.mjs`

**Interfaces:**
- Produces: `createDecision(root, input) -> Decision`.
- Produces: `confirmDecision(root, id, {authority, evidence, now})`.
- Produces: `addAcceptanceCriterion(root, nodeId, text) -> Node`.
- Produces: `evaluateReadiness(root, nodeId, stage) -> ReadinessResult`.
- Produces: `writeReadinessStamp(root, result) -> string`.

- [x] **Step 1: Write failing decision-boundary tests**

```js
test('AI proposal cannot become confirmed without authority', async () => {
  const repo = await repoWithFeature();
  const decision = await createDecision(repo, {
    nodeId: 'F-001', category: 'permission', question: 'Who can delete?',
    proposal: 'Admins', critical: true, actor: 'ai', now: fixedNow
  });
  assert.equal(decision.status, 'proposed');
  await assert.rejects(
    confirmDecision(repo, decision.id, { authority: 'ai', evidence: 'model choice', now: fixedNow }),
    error => error.code === 'INVALID_CONFIRMATION_AUTHORITY'
  );
});

test('critical proposed decision blocks feature planning', async () => {
  const repo = await readyFeatureExceptDecision();
  const result = await evaluateReadiness(repo, 'F-001', 'plan');
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers.map(item => item.code), ['CRITICAL_DECISION_UNCONFIRMED']);
});
```

- [x] **Step 2: Run and confirm failure**

Run: `node --test test/decisions-readiness.test.mjs`

Expected: FAIL because decision modules do not exist.

- [x] **Step 3: Implement decision state and confirmation history**

Use exact critical categories:

```js
export const CRITICAL_CATEGORIES = new Set([
  'deletion', 'permission', 'approval', 'retention', 'billing',
  'identity', 'security', 'privacy', 'compliance', 'irreversible-migration'
]);
export const CONFIRMATION_AUTHORITIES = new Set(['user', 'authority-source']);
```

When `category` is in this set, force `critical:true`. Confirmation appends `{from:'proposed',to:'confirmed',authority,evidence,at}` and never removes prior history.

- [x] **Step 4: Implement exact readiness blockers**

Plan blockers:

```text
MISSING_SOURCE
MISSING_SUMMARY
MISSING_ACCEPTANCE_CRITERIA
EMPTY_ACCEPTANCE_CRITERION
CRITICAL_DECISION_UNCONFIRMED
BLOCKING_QUESTION_OPEN
ANCESTOR_NEEDS_REVIEW
NODE_NEEDS_REVIEW
```

Code blockers add:

```text
PARENT_FEATURE_NOT_READY
MISSING_VERIFICATION_METHOD
MISSING_COMPLETION_CONDITION
MISSING_TEST_STEPS
MISSING_GSD_PLAN
```

Write a readiness stamp only when `ready:true`. The stamp JSON contains `node_id`, `stage`, `state_sha256`, and `checked_at`. Failed evaluation removes the matching current stamp.

- [x] **Step 5: Wire `decision create`, `decide`, `ac add`, and `readiness` commands**

`decide <D-ID> --confirm` requires `--authority user|authority-source` and `--evidence`. `readiness` exits `0` when ready and `3` when blocked.

- [x] **Step 6: Run focused tests**

Run: `node --test test/decisions-readiness.test.mjs test/nodes.test.mjs`

Expected: PASS.

- [x] **Step 7: Commit the decision gate**

```bash
git add src/decisions.mjs src/readiness.mjs src/nodes.mjs src/cli.mjs test/decisions-readiness.test.mjs
git commit -m "feat: enforce confirmed business decisions"
```

### Task 5: Generate the global map and focused resume context

**Requirements:** PMAP-004, PMAP-006, PMAP-007, PMAP-011.

**Files:**
- Create: `src/context.mjs`
- Create: `src/render.mjs`
- Create: `test/context-render.test.mjs`
- Modify: `src/cli.mjs`

**Interfaces:**
- Produces: `resolveContext(root, nodeId) -> ContextManifest`.
- Produces: `renderCurrent(context) -> string`.
- Produces: `renderProjectMap(snapshot) -> string`.
- Produces: `focusNode(root, nodeId) -> {contextPath, nextAction}`.

- [x] **Step 1: Write failing progressive-loading tests**

```js
test('focus includes ancestors and direct children but excludes sibling bodies', async () => {
  const repo = await repoWithTwoEpics();
  const context = await resolveContext(repo, 'F-001');
  assert.deepEqual(context.must_read.nodes.map(node => node.id), ['P-001', 'E-001', 'F-001']);
  assert.deepEqual(context.may_need.children.map(node => node.id), ['S-001']);
  assert.equal(context.do_not_read_by_default.nodes.includes('E-002'), true);
  assert.equal(JSON.stringify(context).includes('E-002 private body'), false);
});

test('project map exposes current work and one next action', async () => {
  const repo = await repoWithTwoEpics();
  await focusNode(repo, 'E-001');
  const text = await readFile(join(repo, '.planning/project-map/PROJECT-MAP.md'), 'utf8');
  assert.match(text, /Current node: E-001/);
  assert.equal((text.match(/Recommended next action:/g) ?? []).length, 1);
});
```

- [x] **Step 2: Run and confirm failure**

Run: `node --test test/context-render.test.mjs`

Expected: FAIL because context modules do not exist.

- [x] **Step 3: Implement the bounded context manifest**

The return value must have this stable top-level shape:

```js
{
  schema_version: 1,
  current_node: node,
  must_read: { nodes: ancestorsAndCurrent, confirmed_decisions: [], source_excerpts: [], gsd: {} },
  may_need: { children: [], source_files: [], code: [], tests: [] },
  do_not_read_by_default: { nodes: [], reason: 'unrelated branch' },
  blockers: [],
  recommended_next_action: { kind: 'refine|discuss|plan|execute|verify|review-impact|done', command: '...' }
}
```

The resolver must never read a sibling node file to build `must_read`; sibling IDs and summaries come from `index.json` only.

- [x] **Step 4: Implement deterministic Markdown renderers**

`CURRENT.md` headings: `Current Node`, `Why It Exists`, `Ancestor Constraints`, `Confirmed Decisions`, `Open Decisions`, `Children`, `GSD Handoff`, `Evidence`, `Context Manifest`, `Recommended Next Action`.

`PROJECT-MAP.md` headings: `Original Motivation`, `Tree`, `Progress`, `Current Work`, `Next Action`, `Blocking Decisions`, `Open Questions`, `Needs Review`, `Artifact Health`.

- [x] **Step 5: Wire `focus` and `status` commands**

`focus <ID>` sets `current_node_id`, generates both Markdown files, and prints the recommended next action. `status [ID]` is read-only and does not change current focus.

- [x] **Step 6: Run focused tests**

Run: `node --test test/context-render.test.mjs test/nodes.test.mjs`

Expected: PASS.

- [x] **Step 7: Commit context and map generation**

```bash
git add src/context.mjs src/render.mjs src/cli.mjs test/context-render.test.mjs
git commit -m "feat: generate focused context and project map"
```

### Task 6: Add traceability, impact propagation, audit, and rebuild

**Requirements:** PMAP-008, PMAP-009, PMAP-012.

**Files:**
- Create: `src/trace.mjs`
- Create: `src/impact.mjs`
- Create: `src/check.mjs`
- Create: `test/trace-impact.test.mjs`
- Create: `test/check.test.mjs`
- Modify: `src/nodes.mjs`
- Modify: `src/cli.mjs`

**Interfaces:**
- Produces: `linkEvidence(root, nodeId, link)` and `linkGsd(root, nodeId, link)`.
- Produces: `traceNode(root, nodeId) -> {forward, reverse}`.
- Produces: `markImpact(root, changedNodeId, changedFields, now) -> ImpactRecord[]`.
- Produces: `reviewImpact(root, nodeId, {authority, note, now})`.
- Produces: `checkProject(root) -> AuditResult` and `rebuildDerived(root)`.

- [x] **Step 1: Write failing trace and impact tests**

```js
test('trace returns source through test evidence', async () => {
  const repo = await tracedFeatureRepo();
  const result = await traceNode(repo, 'F-001');
  assert.deepEqual(result.forward.map(edge => edge.kind), [
    'source', 'epic', 'feature', 'gsd-requirement', 'gsd-phase', 'gsd-plan', 'task', 'code', 'test'
  ]);
});

test('changing an epic marks descendants and evidence for review', async () => {
  const repo = await tracedFeatureRepo();
  await updateNode(repo, 'E-001', { summary: 'Changed boundary' });
  const feature = await loadNode(repo, 'F-001');
  assert.equal(feature.review.state, 'needs-review');
  assert.equal(feature.review.reasons[0].changed_node, 'E-001');
});
```

- [x] **Step 2: Run and confirm failure**

Run: `node --test test/trace-impact.test.mjs test/check.test.mjs`

Expected: FAIL because trace and audit modules do not exist.

- [x] **Step 3: Implement explicit trace edge construction**

Supported evidence kinds are `code`, `test`, and `document`. Paths must be repository-relative, cannot contain `..`, and do not need to exist when first linked; `check` reports missing evidence as `EVIDENCE_PATH_MISSING`.

GSD links support `requirement`, `milestone`, `phase`, and `plan`. Update `index.gsd_reverse` for reverse queries without copying full node content.

- [x] **Step 4: Implement impact propagation on semantic fields**

Trigger fields are exactly:

```js
export const IMPACT_FIELDS = new Set([
  'title', 'summary', 'parent_id', 'source_links',
  'acceptance_criteria', 'decision_ids', 'confirmed_decision'
]);
```

For each descendant, append a deduplicated reason containing `changed_node`, `affected_id`, `path`, `reason`, and `detected_at`. Do not mutate descriptions, criteria, decisions, GSD artifacts, code, or tests.

- [x] **Step 5: Implement comprehensive check and rebuild**

`checkProject` validates source hashes, JSON schemas, ID/index parity, one Project root, parent types, acyclic ancestry, source references, decision references, GSD reverse mappings, evidence paths, generated-file hashes, and readiness-stamp hashes.

`rebuildDerived` may regenerate only `CURRENT.md`, `PROJECT-MAP.md`, `index.generation`, and valid current readiness stamps. It must refuse to reconstruct missing canonical nodes or sources.

- [x] **Step 6: Wire `link`, `trace`, `impact`, `impact review`, `check`, and `rebuild`**

`check --json` returns `{ok, errors, warnings, stats}`. Structural or integrity errors exit `1`; warnings alone exit `0`. `impact review` requires `--authority user|authority-source` and `--note`.

- [x] **Step 7: Run focused tests**

Run: `node --test test/trace-impact.test.mjs test/check.test.mjs test/decisions-readiness.test.mjs`

Expected: PASS.

- [x] **Step 8: Commit trace and impact controls**

```bash
git add src/trace.mjs src/impact.mjs src/check.mjs src/nodes.mjs src/cli.mjs test/trace-impact.test.mjs test/check.test.mjs
git commit -m "feat: add traceability and change impact audit"
```

### Task 7: Package the thin GSD/Codex Capability Skill

**Requirements:** PMAP-005, PMAP-007, PMAP-010, PMAP-011.

**Files:**
- Create: `capability/capability.json`
- Create: `capability/skills/project-map/SKILL.md`
- Create: `capability/skills/project-map/references/discovery.md`
- Create: `capability/skills/project-map/references/readiness.md`
- Create: `capability/skills/project-map/references/gsd-handoff.md`
- Create: `test/capability.test.mjs`

**Interfaces:**
- Consumes: `project-map` CLI commands.
- Produces: one GSD Capability with Skill stem `project-map`.
- Produces: natural-language routing for `推进 <ID>`.

- [x] **Step 1: Write failing manifest and Skill-surface tests**

```js
test('capability exposes one project-map skill and no internal command module', async () => {
  const manifest = JSON.parse(await readFile('capability/capability.json', 'utf8'));
  assert.equal(manifest.id, 'project-map');
  assert.deepEqual(manifest.runtimeCompat.supported, ['codex']);
  assert.deepEqual(manifest.skills, ['project-map']);
  assert.equal('commands' in manifest, false);
  assert.equal('module' in manifest, false);
});

test('skill routes Chinese resume intent through focus before GSD handoff', async () => {
  const skill = await readFile('capability/skills/project-map/SKILL.md', 'utf8');
  assert.match(skill, /推进.*focus/);
  assert.match(skill, /readiness/);
  assert.match(skill, /Never invoke GSD planning or execution when readiness is blocked/);
});
```

- [x] **Step 2: Run and confirm failure**

Run: `node --test test/capability.test.mjs`

Expected: FAIL because the manifest does not exist.

- [x] **Step 3: Create the minimal third-party manifest**

```json
{
  "id": "project-map",
  "role": "feature",
  "version": "0.1.0",
  "title": "Project Map",
  "description": "Adds recursive requirements, focused resume context, decision gates, and trace links around the GSD phase loop.",
  "tier": "standard",
  "requires": [],
  "engines": {"gsd": ">=1.6.0 <2.0.0"},
  "runtimeCompat": {
    "supported": ["codex"],
    "unsupported": [],
    "notes": {"codex": "MVP is verified only against the Codex runtime projection."}
  },
  "skills": ["project-map"],
  "agents": [],
  "hooks": [],
  "config": {},
  "steps": [],
  "contributions": [],
  "gates": [],
  "license": "MIT",
  "keywords": ["requirements", "traceability", "context", "project-management"]
}
```

The empty loop arrays are intentional for MVP: GSD does not permit arbitrary third-party query modules, and loop-level declarative gates will be added only after a separate compatibility test proves the exact stable predicate contract.

- [x] **Step 4: Write the thin Skill router**

The Skill frontmatter must name `project-map` and describe explicit triggers including `推进 E-002`, `完善 F-006`, project status, requirement changes, and preparing implementation. The body must enforce this sequence:

```text
1. Locate the repository root and verify .planning/project-map/index.json.
2. For resume/refine intent run project-map focus <ID> --json.
3. Read CURRENT.md plus only its must_read paths.
4. If the node is not ready, use discovery.md and update Project Map state; do not invoke GSD planning or execution.
5. Run project-map readiness <ID> --stage plan|code --json.
6. When ready, read gsd-handoff.md and recommend the exact existing GSD command.
7. After code changes, link only observed changed code/tests, run impact and check, and never rewrite unrelated nodes.
```

Keep the three reference files independent: discovery questions, deterministic readiness interpretation, and GSD phase mapping. The main Skill links to them and does not duplicate their contents.

- [x] **Step 5: Validate with the repository tests**

Run: `node --test test/capability.test.mjs`

Expected: PASS.

- [ ] **Step 6: Validate against an installed GSD Core 1.6+ in a disposable directory**

Blocked on 2026-08-20 by the environment npm certificate chain (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`). The disposable install was attempted without weakening TLS verification; repeat in a certificate-healthy environment.

Run after the user authorizes dependency installation:

> 历史记录：下面是 2026-08-20 当时拟验证但未完成的命令，当前 GSD 1.11.0 不应照抄执行。现行命令见 [`docs/安装部署与更新.md`](../../安装部署与更新.md#gsd-capability-安装)。

```text
gsd capability install ./capability --scope project
gsd capability list
```

Expected: installation succeeds; the list contains enabled `project-map`; Codex receives exactly one project-local `project-map` Skill. If the installed GSD CLI uses a different documented install flag spelling, use the version's `gsd capability --help` output and record that exact command in the verification report without changing the manifest semantics.

- [x] **Step 7: Commit the Capability**

```bash
git add capability/capability.json capability/skills/project-map test/capability.test.mjs
git commit -m "feat: package thin gsd project map capability"
```

### Task 8: Prove the complete user journey and document operation

**Requirements:** PMAP-001 through PMAP-012.

**Files:**
- Create: `test/e2e.test.mjs`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: all CLI and Capability interfaces.
- Produces: an executable acceptance scenario and operator documentation.

- [x] **Step 1: Write the end-to-end acceptance test**

The test must perform these exact actions through `run()`:

```js
test('fuzzy idea progresses to traceable ready work without losing intent', async () => {
  const repo = await createFixtureRepo();
  await cli(repo, ['init', '--project-title', 'Demo', '--text', '做一个团队审批工具']);
  await cli(repo, ['add', 'project', '--title', '审批工具', '--source', 'SRC-001']);
  await cli(repo, ['add', 'epic', '--parent', 'P-001', '--title', '审批流程']);
  await cli(repo, ['add', 'feature', '--parent', 'E-001', '--title', '删除申请']);
  await cli(repo, ['ac', 'add', 'F-001', '--text', '用户可以提交删除申请']);
  await cli(repo, ['decision', 'create', 'F-001', '--category', 'approval', '--question', '谁批准删除？', '--proposal', '管理员']);

  const blocked = await cli(repo, ['readiness', 'F-001', '--stage', 'plan', '--json']);
  assert.equal(blocked.code, 3);

  await cli(repo, ['decide', 'D-001', '--confirm', '--authority', 'user', '--evidence', '产品负责人确认']);
  await cli(repo, ['link', 'F-001', '--gsd-requirement', 'DELETE-01', '--gsd-phase', '2']);
  await cli(repo, ['focus', 'F-001']);
  const ready = await cli(repo, ['readiness', 'F-001', '--stage', 'plan', '--json']);
  assert.equal(ready.code, 0);

  const source = await readFile(join(repo, '.planning/project-map/sources/SRC-001.md'), 'utf8');
  assert.match(source, /做一个团队审批工具/);
  assert.equal((await checkProject(repo)).ok, true);
});
```

- [x] **Step 2: Run the test and fix only contract mismatches**

Run: `node --test test/e2e.test.mjs`

Expected: PASS. If a mismatch appears, change the implementation to match the approved design; do not weaken the assertions.

- [x] **Step 3: Write operator documentation**

`README.md` must include:

- What Project Map owns and what GSD owns.
- Node hierarchy and lifecycle.
- Project-local initialization example.
- Examples for `推进 E-002`, decision confirmation, readiness, trace, impact, check, and rebuild.
- Explicit warning that generated Markdown must not be hand-edited.
- Explicit statement that Capability loop gates, CoDD, BMAD adapters, and external plugins are deferred.
- Recovery procedure: run `project-map check`, then `project-map rebuild` only when canonical data passes.

- [x] **Step 4: Add full test and check scripts**

`package.json` scripts:

```json
{
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "check": "node --check bin/project-map.mjs && node --test test/*.test.mjs"
  }
}
```

- [x] **Step 5: Run the complete verification suite**

Run: `npm run check`

Expected: all syntax checks and tests PASS with exit code `0`.

- [x] **Step 6: Scan for forbidden duplication and placeholders**

Run:

Run: `rg -n "Manage Project Requirements" src capability README.md test`

Expected: no matches, proving the cancelled framework did not enter runtime or operator-facing artifacts.

- [x] **Step 7: Commit the verified MVP**

```bash
git add README.md package.json test/e2e.test.mjs
git commit -m "docs: complete project map mvp journey"
```

## Follow-on plan boundary

After MVP use proves the CLI and Skill route, create a separate design and plan for GSD loop-level declarative gates. That slice must first pin a tested GSD version and verify the official `artifact-exists` predicate schema in a disposable installation. It may add `plan:pre` and `execute:pre` gates, but it must not add a third-party internal query module or fork GSD Core.
