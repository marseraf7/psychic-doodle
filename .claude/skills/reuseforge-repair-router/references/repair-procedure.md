# Repair Procedure

## Activation signals

Use this router when a failure repeats, behavior depends on uncertain API/dependency/version/toolchain facts, runtime contradicts a planning assumption, architecture may need change, or the local executor starts proposing guesses outside evidence.

## Analysis

1. Normalize a failure signature from error class/message, failing command/action, task, environment/runtime versions, and relevant changed files.
2. Compare attempts to determine whether the same failure recurred.
3. Identify uncertain external facts. Search authoritative documentation/source/repository evidence when necessary and bind evidence to the relevant version.
4. Form at least two plausible root-cause hypotheses when ambiguity is material. Record supporting and disconfirming evidence plus confidence.
5. Propose the smallest bounded repair that preserves approved architecture and scope when possible. State read/write scope, assumptions, verification, and stop condition.

## Outcomes

- `REPAIR_READY`: bounded repair fits approved architecture/scope and has enough evidence.
- `MORE_EVIDENCE_REQUIRED`: evidence is insufficient; do not guess.
- `SCOPE_CHANGE_REQUIRED`: repair requires plan/task scope change; invalidate Gate C and return to planning.
- `ARCHITECTURE_REVIEW_REQUIRED`: repair changes architecture/reuse decisions; invalidate Gate B and Gate C and return to architecture proposal.
- `BLOCKED`: no safe next action.

This Skill never applies the repository fix.
