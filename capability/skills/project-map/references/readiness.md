# 确定性就绪检查

运行 `project-map readiness <ID> --stage plan|code --json`。退出码 `0` 表示就绪；退出码 `3` 表示被阻断。以返回的阻断代码为准。

## 计划阻断项

| 代码 | 所需响应 |
| --- | --- |
| `MISSING_SOURCE` | 关联已捕获来源或可追踪的父节点 |
| `MISSING_SUMMARY` | 定义边界和用户价值 |
| `MISSING_ACCEPTANCE_CRITERIA` | 添加可观察的验收标准 |
| `EMPTY_ACCEPTANCE_CRITERION` | 替换空的验收标准 |
| `CRITICAL_DECISION_UNCONFIRMED` | 要求用户或权威来源以证据确认 |
| `BLOCKING_QUESTION_OPEN` | 解决该问题；不得假设 |
| `ANCESTOR_NEEDS_REVIEW` | 复核受影响的祖先链 |
| `NODE_NEEDS_REVIEW` | 完成节点的影响复核 |

## 额外的编码阻断项

| 代码 | 所需响应 |
| --- | --- |
| `PARENT_FEATURE_NOT_READY` | 先让父 Feature 通过计划就绪检查 |
| `MISSING_VERIFICATION_METHOD` | 记录 Story 验证方法 |
| `MISSING_COMPLETION_CONDITION` | 记录 Task 完成条件 |
| `MISSING_TEST_STEPS` | 添加具体的 Task 测试步骤 |
| `MISSING_GSD_PLAN` | 关联已有 GSD 计划 |

就绪标记是派生证据，不是忽略后续状态变化的许可。任何写入都会使它失效。应在 GSD 计划或执行前立即重新运行就绪检查。

绝不通过编辑标记、生成的 Markdown 或规范 JSON 来绕过阻断项。绝不为通过门槛而降低关键决策的等级。
