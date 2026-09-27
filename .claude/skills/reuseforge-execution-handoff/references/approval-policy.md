# ReuseForge 1.0 Approval Policy

Approval is explicit, scoped, hash-bound, and revocable by scope change. Never infer approval from silence, earlier unrelated approval, or local-worker behavior.

## Gate A — Project framing

Approve the current versions of:

- problem and desired outcome in `PROJECT_BRIEF.md`;
- `REQUIREMENTS.json`;
- `CONSTRAINTS.json`;
- `CAPABILITY_GRAPH.json`.

Only then may state move from `FRAMING` to `FRAMED` and expensive discovery begin.

## Gate B — Architecture

Approve the current versions of:

- candidate decisions;
- reuse strategy;
- compatibility analysis;
- system architecture.

Only then may state move from `ARCHITECTURE_PROPOSED` to `ARCHITECTURE_APPROVED`. A material `SPIKE_REQUIRED`, `LICENSE_REVIEW_REQUIRED`, `INSUFFICIENT_EVIDENCE`, or `CONFLICTING` condition must either be resolved or explicitly excluded from the approved architecture scope.

## Gate C — Execution

Approve the current versions of:

- implementation plan;
- phase and task scope;
- execution policy;
- executor mode.

Default approval scope is one phase. Only then may state move from `EXECUTION_APPROVAL_REQUIRED` to `EXECUTION_APPROVED`.

## Approval receipt

Use an ID namespaced under ReuseForge, for example `reuseforge:approval:PROJECT-001:B:001`. A receipt records gate, project, approved artifact references and SHA-256 hashes, phase/task scope when relevant, executor mode when relevant, explicit approval evidence, and `approved=true|false`.

Any material change to an approved artifact, task/write scope, architecture decision, or execution policy invalidates the affected approval. Architecture change invalidates Gate B and Gate C. Planning/scope change invalidates Gate C. Framing requirement/capability change invalidates downstream gates that depend on it.
