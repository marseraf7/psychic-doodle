# Discovery Procedure

## Preconditions

Prefer a valid `FRAMED` state and Gate A receipt. For a one-off explicit CAP search outside a full workflow, require the user to supply the capability contract and do not imply the lifecycle has advanced.

## Search unit

Search one capability at a time. Form queries from capability purpose, interfaces, hard constraints, domain/toolchain terms, and acceptance tests. Do not rely on whole-project similarity as the primary search strategy.

Supported asset classes: GitHub repositories, Hugging Face models, libraries, packages, datasets, reference implementations, scientific code, vendor examples, design patterns, technical documentation, and research artifacts.

## Evidence capture

For every candidate capture source type, source reference, name, version/commit when available, claimed capability, initial relevance, license if directly visible, evidence references, and open questions. Preserve query/source provenance in `SEARCH_LOG.json`. Initial relevance is a discovery heuristic only and cannot become a reuse decision.

## Output

- `CANDIDATES.json`: candidate sets keyed by capability ID.
- `SEARCH_LOG.json`: queries, sources, timestamps/runtime context, and source references.
- `DISCOVERY_REPORT.md`: coverage by capability, empty sets, evidence gaps, and audit priorities.

End at `DISCOVERY_COMPLETE` only after all required capabilities have an explicit candidate set or explicit no-suitable-candidate result. Route every candidate to independent audit.
