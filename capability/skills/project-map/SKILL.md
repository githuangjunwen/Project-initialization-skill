---
name: project-map
description: 初始化带 GSD 与 Project Map 的新项目，或在已有 .planning/project-map 的项目中推进节点、查看状态、记录需求与决策、准备实施及维护代码测试追踪时使用。
---

# 项目地图

将 Project Map 文件视为可长期保存的项目记忆，CLI 是其唯一写入者。GSD 仍负责路线图、阶段计划、执行和验证。

## 语言约定

所有面向用户的说明、提问、建议和自动生成的 Markdown 文档必须使用简体中文。代码、命令、文件路径、ID、JSON 字段名、状态枚举和 GSD 命令名保持原样，不得为了翻译而改变机器可读接口。

## 意图路由

| 用户意图 | 首个动作 |
| --- | --- |
| 初始化新项目 | 确认真实项目名称和原始想法，执行“新项目初始化” |
| `推进 <ID>` / `完善 <ID>` | 运行 `project-map focus <ID> --json` |
| 查看状态 | 运行 `project-map status [ID] --json` |
| 记录新的需求来源 | 运行 `project-map capture ... --json` |
| 探索模糊之处 | 先聚焦，再阅读[需求探索](references/discovery.md) |
| 准备计划或编码 | 阅读[就绪检查](references/readiness.md) |
| 需求已变更 | 运行 `project-map impact <ID> --json` |
| 交接给 GSD | 阅读 [GSD 交接](references/gsd-handoff.md) |

## CLI 解析

优先使用 `command -v project-map`。若未找到但 `$HOME/.local/bin/project-map` 可执行，则使用该绝对路径。两者都不存在时停止，并提示用户从本项目源码仓库运行 `./install.sh`；不得要求每个项目重复安装 npm 依赖。

## 新项目初始化

当用户要求初始化新项目时：

1. 确认当前目录就是目标项目目录。获取用户确认的项目名称和未经改写的原始想法；缺少时提问，不得代填。
2. 若 `.planning/project-map/index.json` 不存在，立即运行 `project-map init --project-title <名称> --text <原始想法>` 保存不可变来源，再运行 `project-map add project --title <名称> --source SRC-001` 创建根节点；若已存在则不得覆盖，继续下一步。
3. 若 `.planning/PROJECT.md` 不存在，继续调用已安装的 `gsd-new-project` Skill：Codex 使用 `$gsd-new-project`，Claude Code 使用 `/gsd-new-project`。将同一原始想法作为输入并完整保留其提问、研究、路线图、运行时项目说明文件和提交门槛。不得改走 `gsd-new-milestone`。
4. GSD 初始化完成后运行 `project-map check --json`，报告下一步；不得再次安装 CLI 或 Skill。

## 已有项目工作流

1. 定位仓库根目录，确认 `.planning/project-map/index.json` 存在，并按“CLI 解析”确认设备级程序可用。
2. 对恢复或完善意图，运行 `project-map focus <ID> --json`。
3. 阅读 `CURRENT.md`，且只读取其 `must_read` 集合中的路径和 ID。将 `may_need` 视为可选项，默认不加载被排除的分支。
4. 如缺少细节，使用 `references/discovery.md`；通过 CLI 命令写入事实、提议、验收标准和决策。绝不把 AI 提议变成已确认的业务规则。
5. 运行 `project-map readiness <ID> --stage plan|code --json`。
6. 就绪检查被阻断时，绝不调用 GSD 计划或执行。解决报告的阻断项，或向用户询问缺少的授权。
7. 就绪后，阅读 `references/gsd-handoff.md`，核实已安装 GSD 的命令表面，并只建议一条精确的下一步命令。
8. 代码变更后，只关联实际观察到的代码和测试。需求变更时，先捕获并关联新来源，再运行 `project-map impact <ID> --json`；随后运行 `project-map check --json`。

不得手工编辑来源、规范节点／决策 JSON、生成的地图或就绪标记。不得为了让文档看似同步而重写无关节点。
