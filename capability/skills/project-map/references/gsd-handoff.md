# GSD 交接

仅在 Project Map 就绪检查通过后阅读本参考。

## 确认已安装的命令

GSD 命令投射因运行时和版本而异。先检查已安装 GSD 的帮助／技能，并使用实际暴露的准确拼写。Claude Code 使用 `/gsd-*`，Codex 使用 `$gsd-*`。1.6+ 阶段循环的逻辑命令名如下（表中以 Claude Code 形式展示）：

| Project Map 状态 | GSD 意图 | 官方命令名 |
| --- | --- | --- |
| Feature 已可讨论 | 捕获实现选择 | `/gsd-discuss-phase <phase>` |
| Feature 已可计划 | 研究、计划和计划检查 | `/gsd-plan-phase <phase>` |
| 已关联计划的 Story／Task 可编码 | 执行阶段计划 | `/gsd-execute-phase <phase>` |
| 实施已可验收 | 验证已交付行为 | `/gsd-verify-work <phase>` |
| 已验证阶段可交付 | 发布并归档阶段 | `/gsd-ship <phase>` |

使用已关联的 `gsd.phase_ids` 值；不得猜测阶段编号。若未关联阶段，应停止并先建立映射，再建议阶段命令。

## 交接约定

1. 再次运行 Project Map 就绪检查，并保留其状态哈希。
2. 确认该节点已拥有所请求阶段需要的 GSD Requirement、Phase 和 Plan 链接。
3. 只建议一条下一步 GSD 命令，而不是整个剩余流水线。
4. 由 GSD 负责 `ROADMAP.md`、阶段上下文、计划、执行摘要、验证和交付产物。
5. GSD 修改代码后，只关联实际差异确认的路径和实际运行的测试。
6. 运行 Project Map `check`；若交付期间需求变更，运行 `impact` 并要求复核后再继续。

不得在 Project Map 内生成并行的路线图、计划、任务报告或验证报告。

## 精简执行与失败恢复

根据变更风险只选择一条路径：

- 熟悉领域且低风险：`/gsd-plan-phase <phase> --skip-research --skip-verify`，随后 `/gsd-execute-phase <phase> --interactive`。
- 普通功能：`/gsd-plan-phase <phase> --skip-research`，随后 `/gsd-execute-phase <phase> --interactive`。
- 安装器、卸载器、权限、安全、不可逆文件操作或发布变更：保留研究、计划检查和最终验证，并显式运行实际安装中可用的安全审计或代码审查命令。

验证失败不得自动重跑完整阶段：

1. 区分实现缺陷与环境、权限、依赖或工具故障；后者停止并报告，不触发重新规划。
2. 首次实现缺陷由当前上下文局部修复，只重跑失败测试，再执行一次阶段验证。
3. 需要补充计划时只运行 `/gsd-plan-phase <phase> --gaps`，再运行 `/gsd-execute-phase <phase> --gaps-only --interactive`。
4. 同一失败指纹再次出现时停止自动修复并请求用户决策。
5. 只有需求、验收标准或架构边界发生变化才允许完整重新规划；需求变化必须先运行 `project-map impact <ID> --json`。
