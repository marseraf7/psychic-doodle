---
name: reuseforge-memory-recovery
description: Recover ReuseForge project context from canonical repository memory under reuseforge/1.0. Use when a new Claude Code session starts, prior context is lost or exhausted, state is stale, runtime reports a conflict, or the user asks to continue ReuseForge without relying on old chat history. Reconstruct state, approvals, locked decisions, evidence, blockers, and the next legal action from repository artifacts. Do not implement repository changes or treat chat recollection as canonical project state.
---

# ReuseForge Memory Recovery

Protocol: `reuseforge/1.0`.

## Control rule

Recover from repository memory, not old chat history. Chat may help locate files but cannot override canonical strategic artifacts.

## Procedure

1. Read `references/recovery-procedure.md`, `references/resume-context.schema.json`, and local protocol references.
2. Locate the canonical ReuseForge state, state history, approval receipts, latest strategic artifacts, runtime evidence, and hashes.
3. Validate protocol version and legal state transitions. Apply `file-authority-policy.md` when records conflict.
4. Reconstruct locked decisions, open questions, blockers, evidence status, current phase/task, and next legal actor/action.
5. Produce `RESUME_CONTEXT.json` and `NEXT_ACTION.md`. If state cannot be safely reconstructed, return `BLOCKED` rather than guessing.
6. Do not use old chat as project-state authority and do not execute repository implementation.

## References

- `references/recovery-procedure.md` — read order and conflict handling.
- `references/resume-context.schema.json` — recovery output contract.
- Shared local ReuseForge protocol references in `references/`.
