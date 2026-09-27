---
name: reuseforge-candidate-auditor
description: Adversarially verify a discovered ReuseForge reuse candidate under protocol reuseforge/1.0. Use when the user asks whether a repository, model, package, dataset, scientific implementation, vendor example, or other candidate actually works for a defined capability, or when discovery is complete and candidate evidence must be audited. Inspect implementation, interfaces, versions, dependencies, tests, license, provenance, maintenance, benchmarks, security, and integration risk. Do not discover broad candidate sets or choose the final architecture.
---

# ReuseForge Candidate Auditor

Protocol: `reuseforge/1.0`.

## Control rule

Try to disprove suitability before accepting a candidate. README claims, stars, and popularity are supporting metadata only.

## Procedure

1. Require a candidate tied to a stable capability ID and source reference.
2. Read `references/audit-procedure.md`, `references/candidate-audit.schema.json`, and local protocol references.
3. Inspect actual implementation/configuration at a pinned revision when possible; verify interfaces, runtime/framework compatibility, dependencies, tests, docs, maintenance/release evidence, license, provenance, benchmarks, security, and expected integration effort.
4. Assign exactly one allowed candidate status: `VERIFIED`, `PARTIALLY_VERIFIED`, `SPIKE_REQUIRED`, `INSUFFICIENT_EVIDENCE`, `LICENSE_REVIEW_REQUIRED`, `INCOMPATIBLE`, or `REJECTED`.
5. Expose evidence status and open questions for every material claim.
6. Do not choose `USE_AS_IS` or any other architecture action; route audited records to `reuseforge-solution-architect`.

## References

- `references/audit-procedure.md` — adversarial audit matrix.
- `references/candidate-audit.schema.json` — audit record contract.
- Shared local ReuseForge protocol references in `references/`.
