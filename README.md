# Project Map 能力包

Project Map 是围绕 GSD Core 的轻量需求与可追溯层。它保留原始想法、一次只完善递归需求树的一个分支、阻断未经确认的业务决策，并提供聚焦的恢复上下文。GSD 仍是实施引擎。

## 职责边界

| Project Map 负责 | GSD Core 负责 |
| --- | --- |
| 不可变来源捕获 | `PROJECT.md`、`REQUIREMENTS.md`、`ROADMAP.md` 与 `STATE.md` |
| Project → Epic → Feature → Story → Task 树 | 阶段讨论与研究 |
| 决策授权与就绪门槛 | 阶段计划与任务执行 |
| 聚焦的 `CURRENT.md` 与全局 `PROJECT-MAP.md` | 执行摘要、验证与交付 |
| 来源／GSD／代码／测试链接与影响复核 | 自身的 Agent、Skill 与质量工作流 |

Project Map 不会生成第二套 GSD 路线图、计划、任务报告或验证报告。

## 模型

唯一有效的层级为：

```text
Project → Epic → Feature → Story → Task
P-001     E-001   F-001    S-001   T-001
```

节点依次经过 `idea → exploring → specified → planned → implementing → verifying → done`。`blocked` 与 `needs-review` 是独立标志。没有关联代码、测试或文档证据的 Task 不得进入 `done`。

规范数据位于 `.planning/project-map/` 下的 `index.json`、`sources/`、`nodes/` 和 `decisions/`。`CURRENT.md`、`PROJECT-MAP.md` 与 `gates/*.ready` 为可恢复的生成文件。

> 绝不手工编辑生成的 Markdown 或就绪标记，也不要手工编辑规范 JSON；请使用 CLI，确保哈希、索引、影响状态与派生产物保持同步。

## 项目本地安装

要求：Node.js 18 或更高版本，以及 Git。

> 完整的 Codex Skill 安装、CLI 部署、多设备同步、更新、回滚与验证说明见[《安装、部署与更新》](docs/%E5%AE%89%E8%A3%85%E9%83%A8%E7%BD%B2%E4%B8%8E%E6%9B%B4%E6%96%B0.md)。下面的绝对路径方式仅适合单机开发，多端部署应使用 Git 标签或私有 npm 版本。

在目标项目中，将本仓库安装为项目本地开发依赖：

```bash
npm install --save-dev /absolute/path/to/Project-initialization-skill
```

使用未修改的初始想法进行初始化：

```bash
npx project-map init \
  --project-title "团队审批" \
  --text "做一个团队审批工具"

npx project-map add project --title "审批工具" --source SRC-001
npx project-map add epic --parent P-001 --title "审批流程"
```

`init` 会拒绝覆盖已有 Project Map。后续澄清使用 `capture`，它总会创建新的 `SRC-NNN`：

```bash
npx project-map capture --text "审批记录保留七年是待确认规则" --origin user
npx project-map link E-001 \
  --source SRC-002 \
  --source-excerpt "审批记录保留七年"
```

开发本仓库时，请以 `node bin/project-map.mjs` 替换 `npx project-map`。

## 逐步工作流

只聚焦正在完善的分支：

```bash
npx project-map focus E-002
npx project-map status E-002 --json
```

安装 Capability Skill 后，自然语言请求 `推进 E-002` 会先经过 `focus E-002`，读取 `CURRENT.md`，且只加载其 `must_read` 上下文。默认仍会排除无关分支的正文。

逐步添加 Feature 规格：

```bash
npx project-map add feature --parent E-002 --title "删除申请"
npx project-map node update F-001 \
  --summary "用户提交并追踪删除申请"
npx project-map ac add F-001 --text "用户可以提交删除申请"
```

Story 与 Task 可以记录可执行的验证细节：

```bash
npx project-map node update S-001 \
  --verification-method "提交申请并检查状态"
npx project-map node update T-001 \
  --completion-condition "接口和自动化测试通过" \
  --test-step "运行单元测试" \
  --test-step "运行审批流程集成测试"
```

## 决策授权

AI 建议始终保持为 `proposed`。审批、权限、删除、保留、计费、身份、安全、隐私、合规和不可逆迁移等关键类别不能被静默确认：

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

只有 `user` 与 `authority-source` 可以作为确认或影响复核的有效授权方。

已确认的规则发生变化时，创建替代规则，并将旧决策保留为已替代：

```bash
npx project-map decide D-001 \
  --supersede-by D-002 \
  --authority user \
  --evidence "审批政策已变更"
```

## 就绪检查与 GSD 交接

聚焦节点后，在计划或编码前立即运行确定性门槛：

```bash
npx project-map readiness F-001 --stage plan --json
npx project-map readiness T-001 --stage code --json
```

就绪时返回退出码 `0`；被阻断时返回退出码 `3` 及精确阻断代码。被阻断时不得开始 GSD 计划或执行。

应关联而非复制 GSD 产物：

```bash
npx project-map link F-001 \
  --gsd-requirement DELETE-01 \
  --gsd-phase 2

npx project-map link T-001 \
  --gsd-plan .planning/phases/02-delete/02-01-PLAN.md
```

就绪检查通过后，Skill 会阅读 GSD 交接参考，并建议一条已安装的 GSD 命令，例如 `/gsd-discuss-phase 2`、`/gsd-plan-phase 2` 或 `/gsd-execute-phase 2`。它必须使用已关联的阶段，并核实已安装 GSD 运行时实际暴露的命令拼写。

## 可追溯性与变更影响

只关联实际变更中观察到的证据：

```bash
npx project-map link T-001 \
  --code src/approval/delete.mjs \
  --test test/approval/delete.test.mjs
npx project-map trace F-001 --json
```

父需求变更时，标记后代待复核，但不重写它们：

```bash
npx project-map impact E-002 --json
npx project-map impact review F-001 \
  --authority user \
  --note "已按新的 Epic 边界复核"
```

通过 `node update`、验收标准或已确认决策产生的语义变更，会自动向后代传播 `needs-review`。

## 健康检查与恢复

需求或代码变更后运行审计：

```bash
npx project-map check --json
```

`check` 会验证来源哈希和元数据、节点／索引一致性、层级与环、来源与决策引用、GSD 反向链接、证据路径、生成哈希以及就绪哈希。缺少已关联证据是警告；规范数据损坏是错误。

恢复顺序：

1. 运行 `project-map check --json`。
2. 从其权威来源修复规范错误。不得根据生成的 Markdown 重建缺失的来源、节点或决策。
3. 仅在规范数据通过检查后运行 `project-map rebuild --json`。
4. 再次运行 `project-map check --json`。

`rebuild` 只会重新生成 `CURRENT.md`、`PROJECT-MAP.md`、生成哈希和仍然有效的当前就绪标记。

## Capability 安装状态

该 Capability 只暴露一个项目本地 Skill：`project-map`。需求探索、就绪检查和 GSD 交接细节分别位于按需读取的参考资料中。其清单面向 GSD `>=1.6.0 <2.0.0` 与 Codex。

预期的项目级安装方式：

```bash
gsd capability install /absolute/path/to/capability --scope project
gsd capability list --json
```

清单与 Skill 已通过仓库验证。曾在 2026-08-20 尝试进行一次性 GSD 实际安装，但环境的 npm TLS 证书链报错 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`；在将运行时安装视为已验证前，请在证书链正常的环境中重新执行上面两条命令。

## 有意延期的内容

MVP 有意延后 GSD 循环级声明式门槛、CoDD 适配器、BMAD 适配器、外部插件和此前已取消的需求框架。只有在固定版本并测试已安装 GSD 版本的官方谓词约定后，才添加循环门槛。
