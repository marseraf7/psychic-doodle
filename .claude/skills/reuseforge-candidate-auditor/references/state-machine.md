# ReuseForge 1.0 State Machine

Protocol: `reuseforge/1.0`.

Only the following primary lifecycle states are valid:

```text
IDEA
FRAMING
FRAMED
DISCOVERY
DISCOVERY_COMPLETE
AUDITING
AUDIT_COMPLETE
ARCHITECTURE_PROPOSED
ARCHITECTURE_APPROVED
PLANNING
PLAN_READY
EXECUTION_APPROVAL_REQUIRED
EXECUTION_APPROVED
EXECUTING
VERIFYING
REPAIR_REQUIRED
BLOCKED
COMPLETE
```

## Transition rules

| From | To | Guard |
|---|---|---|
| IDEA | FRAMING | Project identifier and request are known. |
| FRAMING | FRAMED | Gate A is explicitly approved for the current hashes of `PROJECT_BRIEF.md`, `REQUIREMENTS.json`, `CONSTRAINTS.json`, and `CAPABILITY_GRAPH.json`. |
| FRAMED | DISCOVERY | Gate A receipt is valid and capability IDs are stable. |
| DISCOVERY | DISCOVERY_COMPLETE | Discovery has been attempted for all required capabilities and provenance is recorded, including empty candidate sets. |
| DISCOVERY_COMPLETE | AUDITING | Candidate set is frozen for the audit pass. |
| AUDITING | AUDIT_COMPLETE | Every discovered candidate has an audit status; an empty set is explicitly recorded as audited-empty. |
| AUDIT_COMPLETE | ARCHITECTURE_PROPOSED | Compatibility and reuse decisions are documented. Material unresolved license or spike questions must be visible and block Gate B approval. |
| ARCHITECTURE_PROPOSED | ARCHITECTURE_APPROVED | Gate B is explicitly approved and no material unresolved evidence condition makes the approval unsafe or ambiguous. |
| ARCHITECTURE_APPROVED | PLANNING | Gate B receipt matches architecture artifact hashes. |
| PLANNING | PLAN_READY | Required specification and planning sets exist and their internal references validate. |
| PLAN_READY | EXECUTION_APPROVAL_REQUIRED | Execution handoff is prepared for a defined phase scope. |
| EXECUTION_APPROVAL_REQUIRED | EXECUTION_APPROVED | Gate C explicitly approves plan, phase/task scope, and execution policy for current hashes. |
| EXECUTION_APPROVED | EXECUTING | A local executor accepts the immutable run manifest. |
| EXECUTING | VERIFYING | Approved task execution finishes without unresolved execution failure. |
| VERIFYING | COMPLETE | Acceptance and verification criteria pass. |
| EXECUTING | REPAIR_REQUIRED | Execution failure requires reasoning or evidence. |
| VERIFYING | REPAIR_REQUIRED | Verification failure requires reasoning or evidence. |
| REPAIR_REQUIRED | EXECUTING | Bounded repair preserves approved architecture and scope; any required repair approval is present. |
| REPAIR_REQUIRED | VERIFYING | Repair only changes verification-local implementation within approved scope and is ready to re-verify. |
| REPAIR_REQUIRED | PLANNING | Repair changes task plan or write scope without changing approved architecture; Gate C becomes invalid and must be renewed. |
| REPAIR_REQUIRED | ARCHITECTURE_PROPOSED | Repair requires an architecture change; old Gate B and Gate C approvals are invalid. |
| Any nonterminal state | BLOCKED | A blocker prevents safe progress. |
| BLOCKED | recorded predecessor or its legally re-entered stage | The blocker is resolved and repository state history proves the legal predecessor. Never guess the resume state. |

## Gate semantics

`FRAMING` may contain completed framing artifacts, but it remains `FRAMING` until Gate A is approved. `ARCHITECTURE_PROPOSED` is always pending Gate B. `EXECUTION_APPROVAL_REQUIRED` is always pending Gate C. Silence, prior unrelated approval, or executor activity never counts as approval.

## Failure semantics

A local worker may report a failure but cannot choose a strategic transition. ReuseForge Web determines whether the failure is bounded repair, planning change, architecture review, or blocker. Strategic state changes are recorded in repository memory before a new execution manifest is issued.
