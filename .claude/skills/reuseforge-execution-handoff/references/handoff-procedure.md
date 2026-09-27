# Execution Handoff Procedure

## Two-pass behavior

**Prepare pass:** from `PLAN_READY`, validate a single phase by default and produce all required files with `APPROVAL_RECEIPT.json` set to pending/`approved=false`; set lifecycle state to `EXECUTION_APPROVAL_REQUIRED`.

**Finalize pass:** only after explicit Gate C approval whose scope and artifact hashes match the prepare pass, set the receipt to `approved=true`, bind approved task IDs, and set state to `EXECUTION_APPROVED`.

## Required files

```text
RUN_MANIFEST.json
TASK_DAG.json
APPROVAL_RECEIPT.json
EXECUTION_POLICY.json
MODEL_ROUTING_HINTS.json
```

## Deterministic export

1. Select exactly the approved phase unless the user explicitly scopes a smaller task subset.
2. Validate that every dependency is already complete or is included in the approved closure.
3. Topologically order tasks; break ties lexically by `task_id`.
4. Build parallel waves only from dependency-ready tasks whose `allowed_write_scope` entries do not overlap. If safe parallelism cannot be proven, set `max_parallel_tasks=1`.
5. If parallelism is proven and the user did not set a lower cap, cap `max_parallel_tasks` at 3 for the default policy.
6. Copy task scope; do not broaden it. Set architecture and scope changes to forbidden and invalidation-on-scope-change to true.
7. `MODEL_ROUTING_HINTS.json` may translate task risk/complexity/worker profile into executor hints but cannot alter task objective, scope, or strategic decisions.

Normalize orchestrator target `claude-code` to `execution_mode="claude-code-internal"` and `opencode` to `execution_mode="opencode-internal"`. `codex` and `external-harness` map directly.
