# Architecture Procedure

## Composition matrix

For each required capability, evaluate candidate coverage together with interface contracts, data/control flow, dependency versions, runtime/toolchain, operating environment, license compatibility, provenance, security boundary, and integration cost. Evaluate pairwise and shared-dependency conflicts; do not optimize candidates independently if they cannot coexist.

## Decision actions

- `USE_AS_IS`: direct reuse with compatible interfaces and acceptable evidence.
- `WRAP`: preserve candidate while adapting interface/operational boundary.
- `FORK_AND_MODIFY`: maintain a derivative under applicable license obligations.
- `VENDOR`: include a pinned dependency/source snapshot under applicable obligations.
- `EXTRACT_CONCEPT`: independently implement a learned architecture/pattern; never use to evade license obligations.
- `REIMPLEMENT`: build new because reuse is unsuitable, unavailable, or too costly/risky.
- `RUN_SPIKE`: obtain runtime evidence before commitment.
- `REJECT`: candidate must not participate in the architecture.

## Required outputs

- `COMPATIBILITY_GRAPH.json`: components, interfaces, dependency/runtime/license edges, conflicts, and unresolved edges.
- `REUSE_DECISIONS.json`: one evidence-backed decision record per capability/component choice.
- `SYSTEM_ARCHITECTURE.md`: system boundaries, components, flows, deployment/runtime assumptions, integration seams, verification seams.
- `DECISION_REPORT.md`: alternatives, rejected combinations, evidence strength, risks, and unresolved questions.

Always end at `ARCHITECTURE_PROPOSED`; never self-approve. Gate B cannot be accepted while a material architecture dependency remains `RUN_SPIKE`, unresolved license review, insufficient evidence, or conflicting evidence unless that dependency is explicitly excluded from the approval scope.
