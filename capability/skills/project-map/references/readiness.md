# Deterministic Readiness

Run `project-map readiness <ID> --stage plan|code --json`. Exit `0` means ready; exit `3` means blocked. Treat the returned blocker codes as authoritative.

## Plan blockers

| Code | Required response |
| --- | --- |
| `MISSING_SOURCE` | Link a captured source or a traceable parent |
| `MISSING_SUMMARY` | Define boundary and user value |
| `MISSING_ACCEPTANCE_CRITERIA` | Add observable acceptance criteria |
| `EMPTY_ACCEPTANCE_CRITERION` | Replace the empty criterion |
| `CRITICAL_DECISION_UNCONFIRMED` | Ask a user or authority source to confirm with evidence |
| `BLOCKING_QUESTION_OPEN` | Resolve the question; do not assume |
| `ANCESTOR_NEEDS_REVIEW` | Review the affected ancestor chain |
| `NODE_NEEDS_REVIEW` | Complete impact review for the node |

## Additional code blockers

| Code | Required response |
| --- | --- |
| `PARENT_FEATURE_NOT_READY` | Make the parent Feature plan-ready first |
| `MISSING_VERIFICATION_METHOD` | Record the Story verification method |
| `MISSING_COMPLETION_CONDITION` | Record the Task completion condition |
| `MISSING_TEST_STEPS` | Add concrete Task test steps |
| `MISSING_GSD_PLAN` | Link the existing GSD plan |

A readiness stamp is derived evidence, not permission to ignore a later state change. Any write invalidates it. Re-run readiness immediately before GSD planning or execution.

Never bypass a blocker by editing a stamp, generated Markdown, or canonical JSON. Never downgrade a critical decision to make the gate pass.
