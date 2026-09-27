---
name: reuseforge-asset-scout
description: Discover reusable technical assets by ReuseForge capability under reuseforge/1.0. Use after project framing is approved, or when the user explicitly asks to find repositories, Hugging Face models, libraries, packages, datasets, scientific code, vendor examples, patterns, documentation, or research artifacts for a specific CAP identifier. Search by capability rather than whole-project similarity; preserve provenance. Do not audit candidate suitability, make final reuse decisions, or select the system architecture.
---

# ReuseForge Asset Scout

Protocol: `reuseforge/1.0`.

## Control rule

Discovery and verification are separate. Search by capability. Record what a source claims and where it came from; do not convert discovery metadata into a reuse decision.

## Procedure

1. Require state `FRAMED` or an explicit, already-defined capability contract with Gate A-equivalent scope.
2. Read `references/discovery-procedure.md`, `references/candidate.schema.json`, and local protocol references.
3. Search required capabilities first. Use GitHub search/`gh`/git access when applicable and web search where needed for other source classes.
4. Pin version/commit when discoverable, preserve source references, record search queries and unresolved questions.
5. Produce candidate sets per capability. Empty candidate sets are valid and must be explicit.
6. End with discovery artifacts and route candidates to `reuseforge-candidate-auditor`; never assign final reuse action.

## References

- `references/discovery-procedure.md` — capability-first search policy.
- `references/candidate.schema.json` — candidate contract.
- Shared local ReuseForge protocol references in `references/`.
