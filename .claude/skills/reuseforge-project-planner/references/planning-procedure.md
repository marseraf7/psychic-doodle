# Planning Procedure

## Required specification set

Create exactly:

```text
PROJECT_SPEC.md
PROJECT_CONTEXT.md
SYSTEM_DESIGN.md
ACCEPTANCE_CRITERIA.md
TECHNICAL_PLAN.md
TEST_STRATEGY.md
RISK_REGISTER.md
SAFETY_LOCKS.md
BLOCKER_POLICY.md
PROVENANCE_POLICY.md
```

## Required planning set

Create exactly:

```text
ROADMAP.md
PHASE_GRAPH.json
TASK_GRAPH.json
AGENT_ASSIGNMENTS.json
FILE_OWNERSHIP_PLAN.json
REVIEW_GATES.md
STOP_CONDITIONS.md
```

## Planning rules

Trace every required capability to architecture components, one or more implementation tasks, and verification. Preserve approved reuse decisions; planners may elaborate integration work but may not silently switch reuse actions.

Task IDs and phase IDs are stable. The task dependency graph must be acyclic. Every task uses the canonical task schema. `FILE_OWNERSHIP_PLAN.json` must identify exclusive or shared write regions and any generated files. A pair of tasks with overlapping write scopes cannot be proposed in the same parallel wave unless the overlap is read-only or a deterministic ownership partition is proven.

Do not propose parallel execution until the dependency graph exists, file ownership exists, and conflicts are analyzed. When uncertain, plan serial execution.

End at `PLAN_READY` only after all files exist, references resolve, acceptance coverage is complete, and no unresolved planning contradiction remains. Gate C has not yet been granted.
