---
name: close-session
description: Close a Neotoma working session — store the assistant reply and a session-close summary.
source: neotoma_bundle:core_workflows
requires_entity_types:
  - session_close
  - interaction
triggers:
  - close session
  - end session
  - wrap up
---

# Close session

Closes the working session at the end of a turn:

1. Store the assistant reply as the closing `interaction`.
2. Write a `session_close` summary of what changed this session.
3. Update any bound plan / todos touched during the session.

Ships from the `core_workflows` bundle (default install). See
`docs/foundation/bundles.md`.
