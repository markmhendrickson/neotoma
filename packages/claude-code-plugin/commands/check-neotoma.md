---
description: "Health check: is Neotoma connected, which instance answered, and do reads work. Writes nothing."
---

<!-- Generated from src/mcp_prompts.ts (check-neotoma). Do not edit; run scripts/generate_claude_plugin_commands.ts. -->

Check my Neotoma connection. Do not write anything.
If the Neotoma `check` skill is available, follow it. Otherwise:
1. Call `get_session_identity` and tell me whether I am connected and signed in.
2. Tell me which Neotoma answered (server name and version, and whether it is the public sandbox).
3. Read one recent record (`list_recent_changes` with limit 1) to confirm reads work.
4. Check that exactly one Neotoma connector is available. Two sets of Neotoma tools means a duplicate connector: report it as a failure and say which one to turn off.
If any step fails, follow the Neotoma `recover` skill, or tell me what to try next.
