# Candidate Audit Procedure

Audit adversarially: seek disconfirming evidence before accepting suitability.

## Minimum dimensions

1. Actual implementation of claimed capability.
2. Interfaces and APIs.
3. Architecture and extension points.
4. Language/runtime/framework versions.
5. Direct and transitive dependencies that affect integration.
6. Tests and observable test coverage evidence.
7. Documentation quality relative to integration needs.
8. Maintenance/release activity and signs of abandonment.
9. License source, package/repository license consistency, and provenance.
10. Benchmarks or performance claims, distinguishing reproduced from claimed.
11. Operational and security risk relevant to the capability.
12. Expected integration effort and missing prerequisites.

Pin an immutable revision when possible. `SOURCE_VERIFIED` means a source claim is confirmed; use `IMPLEMENTATION_VERIFIED` only when actual implementation/configuration/test evidence was inspected. Use `SPIKE_REQUIRED` when static evidence cannot resolve runtime behavior. Use `LICENSE_REVIEW_REQUIRED` for ambiguous or incompatible license evidence. Do not upgrade status based on stars or popularity.

## Outputs

`CANDIDATE_AUDITS.json` stores one record per candidate. `AUDIT_REPORT.md` summarizes disconfirming findings, evidence gaps, and candidates that cannot safely advance. The stage is `AUDIT_COMPLETE` when every candidate has a status, even if no candidate is verified.
