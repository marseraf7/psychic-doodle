# ReuseForge 1.0 Evidence Policy

Every material decision exposes an evidence status and provenance references.

| Evidence status | Meaning |
|---|---|
| `USER_PROVIDED` | Directly supplied by the user; provenance is preserved but not independently verified. |
| `SOURCE_VERIFIED` | Verified against an identifiable external or repository source. |
| `IMPLEMENTATION_VERIFIED` | Verified by inspecting actual implementation/configuration/tests at a pinned source revision. |
| `SPIKE_VERIFIED` | Verified by a bounded technical spike with reproducible inputs and results. |
| `ASSUMPTION` | Explicit working assumption used to proceed; never present as fact. |
| `UNVERIFIED` | Claim lacks enough evidence. |
| `CONFLICTING` | Credible evidence conflicts and must be resolved or bounded. |

## Evidence hierarchy for reuse

README claims, popularity, stars, download counts, and marketing text are discovery metadata only. They cannot by themselves justify `USE_AS_IS`, `WRAP`, `FORK_AND_MODIFY`, or `VENDOR`.

For material reuse decisions, inspect the implementation when available, record the immutable version/commit, interfaces, dependency/runtime constraints, tests, license source, and integration assumptions. Use `SPIKE_VERIFIED` when static evidence cannot establish runtime compatibility.

## License and provenance

Record license evidence separately from technical suitability. Unknown, ambiguous, or conflicting license evidence produces `LICENSE_REVIEW_REQUIRED`; do not convert it into a permissive assumption. `EXTRACT_CONCEPT` means independently implementing a learned architecture/pattern and must never be used to evade license obligations or copy protected implementation expression.

## Decision rule

A decision with material consequences must include: decision identifier, evidence status, evidence references, unresolved questions, and confidence rationale. If evidence cannot support the decision, prefer `RUN_SPIKE`, `REIMPLEMENT`, or `REJECT` over unsupported reuse.
