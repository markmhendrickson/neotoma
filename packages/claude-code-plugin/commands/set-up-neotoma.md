---
description: "Walk through first-time setup: confirm the connection, pick one workflow, turn on only what you confirm, and save a first record."
argument-hint: "[workflow]"
---

<!-- Generated from src/mcp_prompts.ts (set-up-neotoma). Do not edit; run scripts/generate_claude_plugin_commands.ts. -->

Set up Neotoma for me.
If the Neotoma `setup` skill is available, follow it step by step. Otherwise:
1. Confirm the Neotoma connector answers (call `get_session_identity`) and tell me which Neotoma I am connected to. If it is the shared public sandbox, warn me that anything stored there is visible to other people and gets wiped, and use made-up test data only.
2. We are starting with one workflow: $ARGUMENTS.
3. List bundles (`manage_bundles` with action `list`) and propose only the ones that fit that workflow, saying why for each.
4. Enable only the bundles I confirm.
5. Store one first record from that workflow (made-up test data on the sandbox), then read it back and show me what was saved.

If no workflow was given after the command, do this instead:

Set up Neotoma for me.
If the Neotoma `setup` skill is available, follow it step by step. Otherwise:
1. Confirm the Neotoma connector answers (call `get_session_identity`) and tell me which Neotoma I am connected to. If it is the shared public sandbox, warn me that anything stored there is visible to other people and gets wiped, and use made-up test data only.
2. Ask me to pick ONE workflow to start with.
3. List bundles (`manage_bundles` with action `list`) and propose only the ones that fit that workflow, saying why for each.
4. Enable only the bundles I confirm.
5. Store one first record from that workflow (made-up test data on the sandbox), then read it back and show me what was saved.
