# Orchestration Procedure

## Accepted input

```json
{
  "project_id": "",
  "request": "",
  "existing_project": false,
  "execution_target": "claude-code|opencode|codex|external-harness|undecided"
}
```

Normalize only the execution target: `claude-code` becomes `claude-code-internal` and `opencode` becomes `opencode-internal` when an execution handoff is created. Do not alter the user's architectural intent.

## Stage ownership

| State / intent | Specialist |
|---|---|
| IDEA or framing/capability request | `reuseforge-project-framer` |
| FRAMED or explicit asset-discovery request | `reuseforge-asset-scout` |
| DISCOVERY_COMPLETE or candidate-verification request | `reuseforge-candidate-auditor` |
| AUDIT_COMPLETE or composition/architecture request | `reuseforge-solution-architect` |
| ARCHITECTURE_APPROVED or implementation-plan request | `reuseforge-project-planner` |
| PLAN_READY / executor-handoff request | `reuseforge-execution-handoff` |
| EXECUTING or VERIFYING failure needing reasoning/evidence | `reuseforge-repair-router` |
| new chat, lost/stale context, repository-state conflict | `reuseforge-memory-recovery` |

## Gate enforcement

- Gate A: `FRAMING -> FRAMED`; require explicit approval of framing artifacts.
- Gate B: `ARCHITECTURE_PROPOSED -> ARCHITECTURE_APPROVED`; require explicit approval of candidate decisions, reuse strategy, compatibility, architecture, and resolved/excluded material evidence gaps.
- Gate C: `EXECUTION_APPROVAL_REQUIRED -> EXECUTION_APPROVED`; require explicit phase-scoped approval of plan, tasks, and execution policy.

## Routing output

Always include current state, status code, valid/invalid transition result, missing prerequisites, next actor, next action, and canonical handoff. Keep the user-facing summary short; keep detailed contracts in repository artifacts.
