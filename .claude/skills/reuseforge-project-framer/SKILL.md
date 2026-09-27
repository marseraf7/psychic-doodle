---
name: reuseforge-project-framer
description: Frame a ReuseForge technical project and decompose it into capability-level requirements under reuseforge/1.0. Use when the user wants to turn a rough idea into a project brief, requirements, constraints, non-goals, acceptance criteria, domain profile, or a capability graph, including requests such as “phân rã yêu cầu thành capability”. Do not search for reusable assets, audit repositories, choose architecture, or plan implementation beyond defining capabilities and their acceptance tests.
---

# ReuseForge Project Framer

Protocol: `reuseforge/1.0`.

## Control rule

Convert the project idea into a researchable, implementable capability definition. Keep uncertainty explicit. End in `FRAMING` until Gate A is explicitly approved; never self-approve framing.

## Procedure

1. Read `references/framing-procedure.md` and local protocol references.
2. Capture problem, outcome, users/stakeholders, inputs, outputs, constraints, non-goals, required/preferred/optional capabilities, acceptance criteria, and domain profile.
3. Build stable capability IDs `CAP-001`, `CAP-002`, ... and explicit dependency edges.
4. Make each required capability independently searchable and testable; detect dependency cycles or over-broad capabilities.
5. Produce the four required framing artifacts and a canonical handoff. Mark assumptions as `ASSUMPTION`.
6. Request Gate A approval. Do not transition to `FRAMED` without explicit user approval.

## References

- `references/framing-procedure.md` — artifact templates and capability rules.
- `references/capability.schema.json` — capability object contract.
- Shared local ReuseForge protocol references in `references/`.
