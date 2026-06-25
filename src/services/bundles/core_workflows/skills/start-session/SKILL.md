---
name: start-session
description: Begin a Neotoma working session — open a conversation and record the opening interaction.
source: neotoma_bundle:core_workflows
requires_entity_types:
  - interaction
  - conversation
triggers:
  - start session
  - begin session
  - open conversation
---

# Start session

Opens a Neotoma working session at the top of a turn:

1. Resolve or create the `conversation` entity for this thread.
2. Record an opening `interaction` capturing the user's first message.
3. Surface any bound plan / context the session should carry forward.

Ships from the `core_workflows` bundle (default install). See
`docs/foundation/bundles.md`.
