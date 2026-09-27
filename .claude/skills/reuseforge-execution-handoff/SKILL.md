---
name: reuseforge-execution-handoff
description: Convert an approved ReuseForge project plan into deterministic executor-consumable manifests under reuseforge/1.0. Use for Claude Code, OpenCode, Codex, or external-harness handoff, phase-scoped run manifests, task DAG export, execution policy, model-routing hints, or Gate C approval binding after PLAN_READY. Normalize Claude Code to execution_mode claude-code-internal and OpenCode to execution_mode opencode-internal. Never implement repository changes, expand scope, or alter architecture; if approval is absent, stop at EXECUTION_APPROVAL_REQUIRED rather than inferring consent.
---

# ReuseForge Execution Handoff

Protocol: `reuseforge/1.0`.

## Control rule

Prepare or finalize a phase-scoped execution package; never become the local executor.

## Procedure

1. Require `PLAN_READY` and read `references/handoff-procedure.md`, `references/run-manifest.schema.json`, and local protocol references.
2. Select one phase by default. Validate dependency closure, task IDs, file ownership, write conflicts, and planned verification.
3. Produce deterministic task order using topological order with lexical task-ID tie breaking. Never schedule overlapping write scopes concurrently.
4. Normalize requested Claude Code target to `claude-code-internal` and OpenCode target to `opencode-internal`; support `codex` and `external-harness` directly.
5. Prepare all five required manifests. Without explicit Gate C approval, write a pending receipt and set `EXECUTION_APPROVAL_REQUIRED`.
6. After explicit Gate C approval bound to current hashes, finalize `APPROVAL_RECEIPT.json`, set `EXECUTION_APPROVED`, and hand off. Keep `architecture_change="forbidden"`, `scope_expansion="forbidden"`, and `approval_invalidates_on_scope_change=true`.

## References

- `references/handoff-procedure.md` — deterministic export and Gate C binding.
- `references/run-manifest.schema.json` — run manifest contract.
- Shared local ReuseForge protocol references in `references/`.
