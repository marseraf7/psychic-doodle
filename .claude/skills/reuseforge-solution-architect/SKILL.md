---
name: reuseforge-solution-architect
description: Compose audited ReuseForge candidates into an evidence-backed system architecture under reuseforge/1.0. Use after candidate audit when the user asks how candidates should be combined, which assets to reuse/modify/reimplement, whether interfaces/runtime/licenses are compatible, or requests the build-vs-reuse architecture decision. Evaluate capability × candidate × interface × dependency × runtime × license × integration cost. End at ARCHITECTURE_PROPOSED and require Gate B approval; do not create the detailed implementation roadmap or modify repositories.
---

# ReuseForge Solution Architect

Protocol: `reuseforge/1.0`.

## Control rule

Select a viable composition, not the most popular repository. Base material decisions on audited evidence and expose unresolved uncertainty.

## Procedure

1. Require `AUDIT_COMPLETE` and read `references/architecture-procedure.md`, `references/reuse-decision.schema.json`, and local protocol references.
2. Build the compatibility graph across capability, candidate, interfaces, dependencies, runtime, license, and integration cost.
3. Assign only: `USE_AS_IS`, `WRAP`, `FORK_AND_MODIFY`, `VENDOR`, `EXTRACT_CONCEPT`, `REIMPLEMENT`, `RUN_SPIKE`, or `REJECT`.
4. Treat `EXTRACT_CONCEPT` as independent reimplementation of a learned pattern; never use it to evade license obligations.
5. Produce the four required architecture artifacts with evidence status for every material decision.
6. Set state to `ARCHITECTURE_PROPOSED`. Request Gate B. A material unresolved spike/license/evidence conflict blocks approval unless excluded from approved scope.

## References

- `references/architecture-procedure.md` — composition and decision rules.
- `references/reuse-decision.schema.json` — reuse decision contract.
- Shared local ReuseForge protocol references in `references/`.
