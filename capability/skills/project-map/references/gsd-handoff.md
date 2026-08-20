# GSD Handoff

Read this reference only after Project Map readiness succeeds.

## Resolve the installed command

GSD command projection differs by runtime and release. Inspect the installed GSD help/skills first and use the exact exposed spelling. The official hyphen-form command names for the 1.6+ phase loop are:

| Project Map state | GSD intent | Official command name |
| --- | --- | --- |
| Feature ready for discussion | Capture implementation choices | `/gsd-discuss-phase <phase>` |
| Feature ready for planning | Research, plan, and plan-check | `/gsd-plan-phase <phase>` |
| Story/Task code-ready with linked plan | Execute phase plans | `/gsd-execute-phase <phase>` |
| Implementation ready for acceptance | Verify delivered behavior | `/gsd-verify-work <phase>` |
| Verified phase ready to deliver | Ship and archive phase | `/gsd-ship <phase>` |

Use the linked `gsd.phase_ids` value; do not guess a phase number. If no phase is linked, stop and establish the mapping before recommending a phase command.

## Handoff contract

1. Run Project Map readiness again and retain its state hash.
2. Confirm the node has the required GSD Requirement, Phase, and Plan links for the requested stage.
3. Recommend exactly one next GSD command, not the entire remaining pipeline.
4. Let GSD own `ROADMAP.md`, phase context, plans, execution summaries, verification, and shipping artifacts.
5. After GSD changes code, link only paths confirmed by the actual diff and tests actually run.
6. Run Project Map `check`; if the requirement changed during delivery, run `impact` and require review before continuing.

Do not generate a parallel roadmap, plan, task report, or verification report inside Project Map.
