# ReuseForge 1.0 File Authority Policy

Repository memory is canonical. Chat history is context only.

## Canonical project-memory namespace

Store project control-plane artifacts under a `reuseforge/` directory in the target project/repository when persistent state is needed. Recommended logical areas are:

```text
reuseforge/
  state/
  framing/
  discovery/
  audit/
  architecture/
  planning/
  execution/
  runtime/
  recovery/
```

The protocol does not require a local worker to create all areas in advance.

## Authority

- **Strategic/control-plane authority:** `state/`, `framing/`, `discovery/`, `audit/`, `architecture/`, `planning/`, and approval-bearing files in `execution/` are authored or explicitly approved by Claude Code and the user.
- **Local-worker write authority:** implementation files explicitly listed in an approved task contract plus `reuseforge/runtime/` execution logs, command results, test results, failure packets, and verification evidence.
- **Forbidden worker writes:** local workers must not change approved requirements, capability graph, reuse decisions, architecture, approval receipts, task scope, safety locks, or execution policy.

A local worker that discovers a needed strategic change must stop and emit a runtime failure/change packet. It may recommend a change but may not apply the strategic decision.

## Persistent state

Maintain a canonical current handoff plus state history in repository memory. Each state mutation records protocol version, prior state, next state, reason, actor, artifact hashes, approval reference when applicable, and timestamp supplied by the runtime. Recovery prefers valid repository records over chat recollection.

## Conflict resolution

When repository artifacts conflict, apply this precedence: valid approval-bound strategic artifact at the latest legal state transition; then newer control-plane artifact with intact provenance; then runtime evidence. Chat history never overrides a conflicting canonical file. Unresolvable conflicts produce `BLOCKED` or `MORE_EVIDENCE_REQUIRED` rather than guessed state.
