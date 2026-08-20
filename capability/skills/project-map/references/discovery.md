# Requirement Discovery

Read this reference only while refining a focused Project, Epic, Feature, or Story.

## Explore in this order

1. Identify target users, their goal, and the observable outcome.
2. Enumerate normal scenarios and boundary or failure scenarios.
3. Separate business rules from implementation choices.
4. Check permissions, approval, identity, deletion, retention, billing, privacy, security, compliance, and irreversible migration.
5. Identify data inputs, ownership, lifecycle, integrations, constraints, performance, reliability, accessibility, observability, and support expectations.
6. Turn observable behavior into acceptance criteria. For Stories, record a verification method. For Tasks, record a completion condition and concrete test steps.

## Classify every statement

| Class | Meaning | Write action |
| --- | --- | --- |
| Sourced fact | Present in a captured source or confirmed parent | Link the source or inherit the parent trace |
| Proposed rule | Plausible but not authorized | `decision create` with a proposal |
| Open question | Required information is missing | `decision create` without a proposal |
| Confirmed rule | User or authority source supplied evidence | `decide ... --confirm` |

Critical business rules are deletion, permission, approval, retention, billing, identity, security, privacy, compliance, and irreversible migration. AI may propose these rules but must not confirm them.

## Stop condition by level

- Project: vision, scope boundaries, success signals, and initial Epics are clear.
- Epic: delivery outcome, dependency order, and candidate Features are clear.
- Feature: summary, acceptance criteria, critical decisions, and GSD mapping are clear enough for plan readiness.
- Story: user-observable slice and verification method are clear.
- Task: completion condition and test steps are executable in one bounded implementation unit.

Do not expand every branch. Refine only the focused node and its next layer; leave sibling branches summarized.
