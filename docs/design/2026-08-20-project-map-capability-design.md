# Project Map Capability 设计规格

- Status: Approved architecture; implementation pending
- Date: 2026-08-20
- Primary source: `docs/requirements/sources/SRC-001.md`
- Baseline: GSD Core + thin Project Map Capability
- Explicit exclusion: `Manage Project Requirements`

## 1. 目标

在不重造 PRD、架构、计划、编码、测试和 Review 方法的前提下，为 GSD Core 增加一层长期项目控制能力，将模糊输入持续转化为可追踪、可恢复、可验证的交付工作。

系统必须同时做到：

1. 永久保留原始输入，派生理解不得覆盖来源。
2. 使用固定的 `Project → Epic → Feature → Story → Task` 逻辑树逐层完善需求。
3. 对权限、删除、审批、数据保留、计费等关键业务规则实行用户确认门。
4. 用一个项目地图展示全局状态，同时只为当前节点加载必要上下文。
5. 将节点关联到 GSD Requirement、Milestone、Phase、Plan，以及最终代码和测试。
6. 将成熟框架作为能力提供者，Project Map 只负责路由、关系、状态和一致性。

## 2. 非目标

首版不实现以下能力：

- 自研 PRD、架构设计、任务拆解、TDD、测试生成或代码 Review 方法。
- 替代 GSD Core 的 Discuss、Plan、Execute、Verify、Ship 循环。
- 同时运行 BMAD、Spec Kit、OpenSpec 等多套主流程。
- 外部 SaaS 双向同步、Web UI、数据库、多用户并发编辑。
- 自动接受 AI 提出的关键业务规则。
- 自动修改被影响的下游需求或代码；首版只标记影响并要求复核。
- CoDD 集成；它属于验证首版缺口后的增强项。

## 3. 成熟能力与自研边界

| 职责 | 所有者 | Project Map 是否实现 |
| --- | --- | --- |
| 项目初始化、Requirement、Roadmap、状态 | GSD Core | 否，只建立映射 |
| Discuss、Plan、Execute、Verify、Ship | GSD Core | 否 |
| TDD、Security、Review、Gap Analysis、Graphify | GSD Capability | 否，只按需启用 |
| 模糊需求探索方法 | GSD Discuss；必要时 BMAD 顾问流程 | 否，只保存确认结果 |
| 原始输入、递归树、决策门 | Project Map | 是 |
| 节点级上下文和全局地图 | Project Map | 是 |
| 父级变更影响标记 | Project Map | 是 |
| Requirement/Plan/Code/Test 关系 | GSD + Project Map | Project Map 保存关系，验证委托 GSD |

GSD 1.6+ 的第三方 Capability 可以拥有 Skills、提示片段、生命周期脚本和声明式循环扩展，但第三方任意代码不能直接注册成 GSD 内部 query command。首版因此采用：

- 一个零运行时依赖的本地 `project-map` CLI，负责确定性状态操作。
- 一个 GSD Feature Capability，拥有薄 `project-map` Skill。
- Skill 解析“推进 E-002”等意图并调用 CLI，然后把生成的上下文交给 GSD。
- 需要阻断时由 CLI 生成带状态哈希的 readiness stamp；MVP 由唯一入口 Skill 在交接 GSD 前检查它。声明式 `artifact-exists` 循环 gate 只有在针对已安装 GSD 版本完成兼容性测试后才启用。
- Project Map 数据发生变化时，CLI 必须立即使旧 stamp 失效。

参考：

- https://github.com/open-gsd/gsd-core
- https://github.com/open-gsd/gsd-core/blob/main/docs/reference/planning-artifacts.md
- https://github.com/open-gsd/gsd-core/blob/main/docs/reference/capability-manifest.md

## 4. 需求与验收标准

### PMAP-001 原始输入不可覆盖

来源：SRC-001。

验收标准：

- `capture` 每次创建新的 `SRC-NNN.md`，不存在覆盖已有来源的命令。
- 来源正文以“固定元数据头 + 文件尾原文”保存，不使用会与用户输入冲突的闭合围栏。
- 元数据同时保存 UTF-8 字节数与 SHA-256；`check` 能发现正文被修改。
- 补充说明以追加事件或新来源表达，不改写原始正文。

### PMAP-002 固定递归层级

来源：SRC-001。

验收标准：

- 支持且仅支持 `Project、Epic、Feature、Story、Task` 五类节点。
- 合法父子关系固定为 `P→E→F→S→T`；非法跳级或循环必须拒绝。
- ID 分别采用 `P-001、E-001、F-001、S-001、T-001`，删除后不得复用。

### PMAP-003 稳定来源与验收关系

来源：SRC-001、项目 AGENTS 约束。

验收标准：

- 每个 Epic、Feature、Story、Task 至少关联一个来源或可追溯的父节点。
- Feature 进入 `specified` 前必须有可验证验收标准。
- Story 进入 `planned` 前必须有测试步骤或验证方法。

### PMAP-004 渐进式完善

来源：SRC-001。

验收标准：

- 新建 Project 时无需一次生成完整五层树。
- `focus <ID>` 只要求完善当前节点的下一层。
- 未选择的兄弟分支只加载摘要，不加载完整正文。

### PMAP-005 关键业务决策门

来源：SRC-001。

验收标准：

- 决策状态为 `open | proposed | confirmed | superseded`。
- AI 新建议只能创建为 `proposed`。
- 与删除、权限、审批、数据保留、计费、身份、安全、隐私、合规、不可逆迁移有关的未确认决策会阻止 Feature `ready-for-plan`。
- 决策只能由记录为 `user` 或 `authority-source` 的确认事件进入 `confirmed`。

### PMAP-006 全局项目地图

来源：SRC-001。

验收标准：

- 自动生成 `.planning/project-map/PROJECT-MAP.md`，不得手工维护。
- 地图回答初始动机、树结构、完成情况、当前节点、下一步、阻塞和未解决问题。
- `check` 能发现生成地图与规范数据不一致。

### PMAP-007 节点恢复与渐进上下文

来源：SRC-001。

验收标准：

- “推进 E-002”映射为 `focus E-002`。
- 生成的 `CURRENT.md` 只包含当前节点、祖先摘要、直接子节点摘要、关联来源摘录、确认决策、开放问题、GSD 映射及相关 Code/Test 链接。
- 不默认加载非祖先兄弟节点的正文。
- 上下文清单明确列出 `must_read、may_need、do_not_read_by_default`。

### PMAP-008 端到端追踪

来源：SRC-001。

验收标准：

- Feature 可追溯到 `Source → Epic → Feature → GSD Requirement → GSD Phase/Plan → Task → Code → Test`。
- `trace <ID>` 能输出正向和反向关系。
- 完成 Task 前至少存在一个 Code 或 Test 证据；纯文档 Task 可用显式 `evidence_kind=document`。

### PMAP-009 变更影响分析

来源：SRC-001。

验收标准：

- 变更 Project/Epic/Feature 的规范字段时，后代及关联 GSD/Code/Test 节点被标记 `needs-review`。
- 影响分析输出原因和关系路径，不自动改写下游内容。
- 所有受影响节点经复核后才能清除标记。

### PMAP-010 GSD 集成而非重复

来源：SRC-001、用户确认。

验收标准：

- Project Map 不生成第二套 GSD ROADMAP、PLAN 或测试报告。
- 每个可执行 Feature 映射到一个或多个 GSD Requirement ID 和 Phase。
- `project-map` Skill 能建议并交接到正确的 GSD 下一命令。

### PMAP-011 上下文与 Skill 表面受控

来源：用户关于单一总控 Skill 上下文的追问。

验收标准：

- Capability 首版只暴露一个 namespace Skill。
- Skill 主体只包含路由规则和最小工作流，不嵌入全部模板。
- 详细方法按命令读取对应 reference，不能在每次调用时整体加载。

### PMAP-012 可恢复和安全失败

来源：SRC-001。

验收标准：

- 所有规范状态写入采用同目录临时文件加原子 rename。
- 校验失败时不产生部分写入。
- `check` 非零退出并列出确定性错误；不得用 AI 判断替代结构完整性检查。
- readiness stamp 包含当前节点与状态摘要哈希；任何 CLI 写操作都会使相关 stamp 失效。

## 5. 存储模型

所有长期状态位于 GSD 的 `.planning/` 下：

```text
.planning/
├── PROJECT.md
├── REQUIREMENTS.md
├── ROADMAP.md
├── STATE.md
└── project-map/
    ├── schema-version.json
    ├── index.json
    ├── sources/
    │   └── SRC-001.md
    ├── nodes/
    │   ├── P-001.json
    │   ├── E-001.json
    │   └── ...
    ├── decisions/
    │   └── D-001.json
    ├── events/
    │   └── events.jsonl
    ├── gates/
    │   ├── current-plan.ready
    │   └── current-code.ready
    ├── CURRENT.md
    └── PROJECT-MAP.md
```

规范数据：`index.json`、`nodes/*.json`、`decisions/*.json`、来源正文和事件日志。

派生数据：`CURRENT.md`、`PROJECT-MAP.md`、`gates/*.ready`。派生文件可安全重建，禁止作为唯一信息来源。

## 6. 核心实体

### Node

```json
{
  "schema_version": 1,
  "id": "F-006",
  "type": "feature",
  "parent_id": "E-002",
  "title": "示例功能",
  "summary": "一句话说明边界和用户价值",
  "status": "exploring",
  "source_links": [
    {"source_id": "SRC-001", "relation": "derived-from", "excerpt": "原始摘录"}
  ],
  "acceptance_criteria": [
    {"id": "AC-001", "text": "可观察行为", "status": "draft"}
  ],
  "decision_ids": ["D-001"],
  "open_questions": [],
  "gsd": {"requirement_ids": [], "milestone": null, "phase_ids": [], "plan_paths": []},
  "evidence": {"code": [], "tests": [], "documents": []},
  "review": {"state": "clean", "reasons": []},
  "created_at": "2026-08-20T00:00:00.000Z",
  "updated_at": "2026-08-20T00:00:00.000Z"
}
```

状态枚举：

```text
idea → exploring → specified → planned → implementing → verifying → done
```

`blocked` 是独立标志，不替代生命周期状态。

### Decision

```json
{
  "schema_version": 1,
  "id": "D-001",
  "node_id": "F-006",
  "category": "permission",
  "question": "谁可以执行此操作？",
  "proposal": "仅管理员",
  "status": "proposed",
  "critical": true,
  "confirmation": null,
  "history": []
}
```

### Index

`index.json` 保存 schema 版本、ID 计数器、当前节点、节点摘要索引、GSD 反向映射和最近一次生成哈希。它不复制节点完整正文。

## 7. 用户命令

```text
project-map init --project-title <title> --source <file>
project-map capture --text <text> [--origin <uri>]
project-map add <project|epic|feature|story|task> --parent <ID> --title <title>
project-map focus <ID>
project-map status [<ID>]
project-map decide <D-ID> --confirm --authority user
project-map link <ID> --gsd-requirement <REQ-ID>
project-map link <ID> --code <path> [--test <path>]
project-map impact <ID>
project-map readiness <ID> --stage plan|code
project-map trace <ID>
project-map check
project-map rebuild
```

Skill 的自然语言路由：

| 用户表达 | CLI 行为 | 后续 GSD 行为 |
| --- | --- | --- |
| `推进 E-002` | `focus E-002`、生成 CURRENT | 判断是继续拆分还是进入对应 Phase Discuss |
| `完善 F-006` | `focus F-006` | 需求探索，禁止直接编码 |
| `检查项目状态` | `status` | 只读，不改状态 |
| `准备实现 F-006` | `readiness F-006 --stage plan` | 通过后建议 GSD Discuss/Plan |
| `这个需求改了` | `impact <ID>` | 标记下游复核，不自动更新 |

## 8. 上下文解析算法

`focus <ID>` 按固定顺序构造 `CURRENT.md`：

1. 当前节点完整规范。
2. 从 Project 到父节点的摘要和已确认约束。
3. 直接子节点的 ID、标题、状态和阻塞摘要。
4. 当前节点引用的来源摘录；全文只列入 `may_need`。
5. 当前节点和祖先节点的 confirmed 决策。
6. 当前节点的 open/proposed 决策和开放问题。
7. GSD Requirement、Milestone、Phase、Plan 映射。
8. 关联 Code/Test 证据和 `needs-review` 原因。
9. 单一推荐下一步。

禁止把全部兄弟节点、全部来源全文、全部历史决策或全部代码路径放入 `must_read`。

## 9. Readiness 规则

### Feature ready-for-plan

必须全部满足：

- 有来源关系和明确摘要。
- 至少一个验收标准，且不存在空文本。
- 所有 critical 决策为 `confirmed`。
- 不存在 blocking open question。
- 已关联 GSD Requirement ID，或本次交接明确要求 GSD 创建映射。
- 当前节点及祖先均不处于 `needs-review`。

### Story/Task ready-for-code

必须全部满足：

- 父 Feature 已 ready-for-plan。
- Story 有验证方法。
- Task 有明确完成条件和测试步骤。
- 已关联 GSD Plan，或交接命令明确创建 Plan。
- 不存在影响分析未复核项。

## 10. 影响分析

触发变更的字段：`title、summary、parent_id、source_links、acceptance_criteria、decision_ids、confirmed decision`。

影响集合为：

1. 当前节点所有后代。
2. 引用该节点的 GSD Requirement、Phase 和 Plan。
3. 通过 Feature/Story/Task 关联的 Code/Test。
4. 由被替代 Decision 约束的其他节点。

每个影响项记录：

```json
{
  "changed_node": "E-002",
  "affected_id": "F-006",
  "path": ["E-002", "F-006"],
  "reason": "ancestor acceptance criteria changed",
  "detected_at": "2026-08-20T00:00:00.000Z"
}
```

## 11. GSD Capability 形态

首版包结构：

```text
capability/
├── capability.json
└── skills/
    └── project-map/
        ├── SKILL.md
        └── references/
            ├── discovery.md
            ├── readiness.md
            └── gsd-handoff.md
```

Capability ID 和 Skill stem 均为 `project-map`；不得使用 GSD 保留的 `gsd-` 前缀。

首版只支持 Codex，并以项目本地方式安装。确认 GSD 安装器对第三方 Skills 和声明式 gates 的实际物化行为后，再声明其他 runtime。

## 12. 技术约束

- Node.js `>=18`，ES Modules。
- 零运行时 npm 依赖；只使用 Node 标准库。
- 测试使用 `node:test` 和临时目录。
- JSON 写入必须稳定排序并以换行结尾。
- 所有文件路径先解析后验证位于仓库 `.planning/project-map/` 内。
- CLI 默认输出人类可读文本，`--json` 输出稳定机器格式。
- 不自动执行 GSD、Git、插件或外部系统写操作；只给出明确交接建议。

## 13. 首版完成定义

首版完成必须证明：

1. 能从一段模糊原始输入初始化项目并保留原文。
2. 能建立不完整的五层树并逐层完善。
3. 能通过“推进 E-002”生成最小 CURRENT 上下文。
4. 未确认的权限决策会阻止 Feature 进入计划。
5. 父级验收标准变化会标记关联后代和证据为 `needs-review`。
6. 能输出 Source→Node→GSD→Code→Test 追踪路径。
7. GSD Capability 能被 GSD 1.6+ 校验并在 Codex 表面只暴露一个 Skill。
8. GSD 未安装时，CLI 核心功能仍能独立测试；集成检查明确报告缺少 GSD，而不是假装通过。

## 14. 延后决策

- CoDD 是否作为正式 trace backend：首版试用后决定。
- BMAD discovery 是否需要专用 adapter：先使用 GSD Discuss 验证缺口。
- Linear/Jira/Notion/Figma 等插件：只有出现真实导入或同步需求时才选择。
- 全局安装、团队多写者、可视化 UI：不进入首版。
