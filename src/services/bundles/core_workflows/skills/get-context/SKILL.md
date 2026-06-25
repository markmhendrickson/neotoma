---
name: get-context
description: Retrieve the bounded context for the current session — recent interactions and relevant entities.
source: neotoma_bundle:core_workflows
requires_entity_types:
  - interaction
  - conversation
triggers:
  - get context
  - load context
  - what do you know
---

# Get context

Performs bounded retrieval for the active session:

1. Pull recent `interaction` records for the current `conversation`.
2. Retrieve entities implied by the user message (by identifier or category).
3. Return a compact context summary the agent reasons over this turn.

Ships from the `core_workflows` bundle (default install). See
`docs/foundation/bundles.md`.
