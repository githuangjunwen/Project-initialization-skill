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
