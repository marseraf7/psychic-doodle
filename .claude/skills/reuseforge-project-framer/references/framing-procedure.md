# Framing Procedure

## Required artifact set

### `PROJECT_BRIEF.md`
Record project ID, problem, desired outcome, target users/stakeholders, inputs, outputs, non-goals, assumptions, domain profile summary, and success definition.

### `REQUIREMENTS.json`
Separate functional, non-functional, operational, verification, and domain-specific requirements. Give each requirement a stable ID and link it to capabilities where known.

### `CONSTRAINTS.json`
Separate hard constraints from preferences. Include runtime/toolchain/platform, data, license/provenance, safety, resource, deployment, interface, and organizational constraints.

### `CAPABILITY_GRAPH.json`
Use objects conforming to `capability.schema.json`. Preserve stable IDs. Dependencies must reference existing capabilities and the required-capability dependency graph must be acyclic unless the cycle is explicitly justified as a runtime feedback relation rather than an implementation dependency.

## Capability quality rules

A capability must represent a coherent behavior that can be searched, evaluated, implemented, and accepted. Split a capability if it bundles unrelated interfaces or has acceptance tests that cannot be evaluated independently. Avoid implementation-specific naming until architecture is chosen.

For each capability define purpose, priority, inputs, outputs, dependencies, hard constraints, acceptance tests, and reuse priority. Required capabilities must have at least one measurable acceptance test.

## Approval

After artifacts are internally consistent, remain in `FRAMING`, emit `RF_APPROVAL_REQUIRED`, and request explicit Gate A approval of the current artifact hashes. Only the orchestrated legal transition after approval yields `FRAMED`.
