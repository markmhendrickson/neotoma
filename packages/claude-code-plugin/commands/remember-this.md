---
description: "Save something to Neotoma and read it back so you can see what was stored."
argument-hint: "[content]"
---

<!-- Generated from src/mcp_prompts.ts (remember-this). Do not edit; run scripts/generate_claude_plugin_commands.ts. -->

Remember this in Neotoma:

$ARGUMENTS

Then read it back and show me exactly what was saved.

Before storing, check which Neotoma I am connected to (`get_session_identity`). If it is the shared public sandbox, tell me that anything stored there is visible to other people and gets wiped, and store only after I confirm.

If no content was given after the command, do this instead:

Ask me what to remember, or offer to save the key facts from our conversation so far. Store only what I confirm, then read it back and show me exactly what was saved.

Before storing, check which Neotoma I am connected to (`get_session_identity`). If it is the shared public sandbox, tell me that anything stored there is visible to other people and gets wiped, and store only after I confirm.
