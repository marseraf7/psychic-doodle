---
name: reuseforge-project-planner
description: Create the complete ReuseForge implementation specification and executable roadmap under reuseforge/1.0 after architecture has explicit Gate B approval. Use when the user asks for an implementation plan, technical plan, test strategy, roadmap, phase graph, task DAG, agent assignments, file ownership, review gates, or stop conditions for an approved architecture. Enforce dependency and write-conflict analysis before proposing parallelism. Do not activate before ARCHITECTURE_APPROVED, do not execute repository changes, and do not grant Gate C approval.
---

# ReuseForge Project Planner

Protocol: `reuseforge/1.0`.

## Activation guard

Operate only from `ARCHITECTURE_APPROVED` with a valid Gate B receipt matching the architecture hashes. Otherwise return `RF_APPROVAL_REQUIRED` or `RF_INVALID_STATE`.

## Procedure

1. Read `references/planning-procedure.md`, `references/task.schema.json`, and local protocol references.
2. Produce the complete required specification set and planning set exactly as named.
3. Make task dependencies explicit and acyclic. Give every task allowed read/write scopes, planned commands, verification, risk, complexity, and recommended worker profile.
4. Build file ownership and identify overlapping writes before proposing any parallel execution.
5. Validate cross-file references and acceptance coverage. End at `PLAN_READY` only when the set is complete.
6. Do not execute code or infer Gate C approval; route to `reuseforge-execution-handoff`.

## References

- `references/planning-procedure.md` — required files and graph rules.
- `references/task.schema.json` — canonical task contract.
- Shared local ReuseForge protocol references in `references/`.
