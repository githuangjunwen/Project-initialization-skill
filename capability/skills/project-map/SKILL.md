---
name: project-map
description: 当仓库包含 .planning/project-map，且用户要求开始或恢复“推进 E-002”“完善 F-006”等节点、查看项目状态、记录需求变更或业务决策、准备实施，或将需求重新关联到 GSD 计划、代码和测试时使用。
---

# 项目地图

将 Project Map 文件视为可长期保存的项目记忆，CLI 是其唯一写入者。GSD 仍负责路线图、阶段计划、执行和验证。

## 语言约定

所有面向用户的说明、提问、建议和自动生成的 Markdown 文档必须使用简体中文。代码、命令、文件路径、ID、JSON 字段名、状态枚举和 GSD 命令名保持原样，不得为了翻译而改变机器可读接口。

## 意图路由

| 用户意图 | 首个动作 |
| --- | --- |
| `推进 <ID>` / `完善 <ID>` | 运行 `project-map focus <ID> --json` |
| 查看状态 | 运行 `project-map status [ID] --json` |
| 记录新的需求来源 | 运行 `project-map capture ... --json` |
| 探索模糊之处 | 先聚焦，再阅读[需求探索](references/discovery.md) |
| 准备计划或编码 | 阅读[就绪检查](references/readiness.md) |
| 需求已变更 | 运行 `project-map impact <ID> --json` |
| 交接给 GSD | 阅读 [GSD 交接](references/gsd-handoff.md) |

## 工作流

1. 定位仓库根目录，确认 `.planning/project-map/index.json` 存在，并确认项目本地的 `project-map` 可执行程序可用。若缺少该程序，停止并指向项目本地安装方式；不得直接编辑存储文件。
2. 对恢复或完善意图，运行 `project-map focus <ID> --json`。
3. 阅读 `CURRENT.md`，且只读取其 `must_read` 集合中的路径和 ID。将 `may_need` 视为可选项，默认不加载被排除的分支。
4. 如缺少细节，使用 `references/discovery.md`；通过 CLI 命令写入事实、提议、验收标准和决策。绝不把 AI 提议变成已确认的业务规则。
5. 运行 `project-map readiness <ID> --stage plan|code --json`。
6. 就绪检查被阻断时，绝不调用 GSD 计划或执行。解决报告的阻断项，或向用户询问缺少的授权。
7. 就绪后，阅读 `references/gsd-handoff.md`，核实已安装 GSD 的命令表面，并只建议一条精确的下一步命令。
8. 代码变更后，只关联实际观察到的代码和测试。需求变更时，先捕获并关联新来源，再运行 `project-map impact <ID> --json`；随后运行 `project-map check --json`。

不得手工编辑来源、规范节点／决策 JSON、生成的地图或就绪标记。不得为了让文档看似同步而重写无关节点。
