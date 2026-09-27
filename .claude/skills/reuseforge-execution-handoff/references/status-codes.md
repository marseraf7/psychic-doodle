# ReuseForge 1.0 Status Codes

These are operation/result codes, not lifecycle-state aliases.

| Code | Meaning |
|---|---|
| `RF_OK` | Operation completed within current stage. |
| `RF_INPUT_REQUIRED` | Required project input is absent. |
| `RF_APPROVAL_REQUIRED` | A named approval gate is required before transition. |
| `RF_EVIDENCE_REQUIRED` | Material evidence is insufficient for a decision. |
| `RF_SPIKE_REQUIRED` | A bounded technical spike is required before confidence can increase. |
| `RF_LICENSE_REVIEW_REQUIRED` | License evidence or compatibility needs review. |
| `RF_SCOPE_CHANGE_REQUIRED` | Proposed action exceeds approved task/phase scope. |
| `RF_ARCHITECTURE_REVIEW_REQUIRED` | Proposed repair or change affects architecture. |
| `RF_INVALID_STATE` | Requested stage is illegal from the canonical lifecycle state. |
| `RF_CONTRACT_ERROR` | Input/output or cross-file contract is invalid. |
| `RF_EXECUTOR_FAILURE` | Local executor reported a failed action. |
| `RF_BLOCKED` | Safe progress is not currently possible. |
| `RF_COMPLETE` | Project verification and acceptance are complete. |

Candidate audit statuses are separate and fixed to: `VERIFIED`, `PARTIALLY_VERIFIED`, `SPIKE_REQUIRED`, `INSUFFICIENT_EVIDENCE`, `LICENSE_REVIEW_REQUIRED`, `INCOMPATIBLE`, `REJECTED`.

Repair outcomes are separate and fixed to: `REPAIR_READY`, `MORE_EVIDENCE_REQUIRED`, `SCOPE_CHANGE_REQUIRED`, `ARCHITECTURE_REVIEW_REQUIRED`, `BLOCKED`.
