# Recovery Procedure

## Repository-first read order

1. Identify `reuseforge/` project-memory root and protocol version.
2. Read canonical current handoff/state record and state history.
3. Validate state transitions against `state-machine.md`.
4. Read approval receipts and verify their artifact hashes/scope.
5. Read the latest authoritative framing, audit, architecture, and planning artifacts needed for the recovered state.
6. Read executor runtime/failure/verification evidence for the active run.
7. Apply `file-authority-policy.md` to conflicts.

Do not use old chat history to fill missing canonical facts. Chat may only help locate repository artifacts or explain the user's current request.

## Conflict handling

If two strategic artifacts conflict, prefer the one bound to the latest legal transition/valid approval. If hashes do not match or the transition chain is broken, downgrade confidence and mark the conflict. If the current state cannot be proven, return `BLOCKED` rather than inventing a state.

## Outputs

`RESUME_CONTEXT.json` conforms to the local schema and records evidence references for recovered state. `NEXT_ACTION.md` explains the next legal action, missing artifacts/approvals, and any blocker without replaying the full project history.
