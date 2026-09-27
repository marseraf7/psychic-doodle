---
name: reuseforge-repair-router
description: Diagnose ReuseForge execution or verification failures with external evidence and route a bounded repair under reuseforge/1.0. Use when the same failure repeats, dependency/API/version behavior is uncertain, toolchains mismatch, runtime contradicts assumptions, architecture may need change, or a local executor begins guessing. Convert a failure packet into a failure signature, evidence, root-cause hypotheses, confidence, and a bounded repair outcome. Do not edit repository code or silently change scope/architecture.
---

# ReuseForge Repair Router

Protocol: `reuseforge/1.0`.

## Control rule

Stop guessing. Diagnose before repair and preserve strategic authority in Claude Code.

## Procedure

1. Read `references/repair-procedure.md`, `references/failure-packet.schema.json`, and local protocol references.
2. Normalize the failure packet into a stable signature. Detect repeated failures and uncertain version/API/toolchain assumptions.
3. Search authoritative implementation/documentation evidence as needed; preserve source references and version context.
4. Generate competing root-cause hypotheses, evidence for/against each, confidence, and a bounded repair strategy.
5. Return exactly one outcome: `REPAIR_READY`, `MORE_EVIDENCE_REQUIRED`, `SCOPE_CHANGE_REQUIRED`, `ARCHITECTURE_REVIEW_REQUIRED`, or `BLOCKED`.
6. If scope or architecture changes, invalidate the affected approval and route back to planning or architecture. Never implement the fix itself.

## References

- `references/repair-procedure.md` — failure analysis and routing rules.
- `references/failure-packet.schema.json` — failure input contract.
- Shared local ReuseForge protocol references in `references/`.
