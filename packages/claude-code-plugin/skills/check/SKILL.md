---
name: check
description: Neotoma health check. Confirms exactly one Neotoma connector is connected, says which Neotoma answered, proves reads work, and reports whether lifecycle capture is on. Writes nothing. Use when someone asks "is Neotoma working", "check Neotoma", "which Neotoma am I on", or before trusting an empty answer.
---

# Check Neotoma

Read-only. Never store, correct, or delete anything during a check.

Run the checks in order. Report each one as **pass** or **fail**, with one line of detail.

1. **Connected.** Are Neotoma tools available (for example `get_session_identity`)? If not, it is a fail: the connector is missing, disabled, or not signed in. In Chat this usually means no custom connector has been added. Stop here and use the `recover` skill.
2. **Exactly one connector.** Look at the Neotoma tools you have. If they come from more than one connector, that is a **fail**. Examples:
   - two sets of Neotoma tools with different prefixes, such as `mcp__neotoma__…` and `mcp__plugin_neotoma_neotoma__…`;
   - two Neotoma entries in the connector list.

   Say which connectors you see and which one to turn off: in Claude Code with `/mcp`, in Cowork or Chat from **Customize › Connectors** or the plugin's **Connectors** tab.
3. **Which Neotoma answered.** Call `get_session_identity`. Report:
   - whether the session is signed in, and its trust tier;
   - the server name and version, if the client shows them;
   - whether this is the **shared public sandbox**: the origin or configured URL is `sandbox.neotoma.io`, or the user id is `11111111-1111-1111-1111-111111111111`. Sandbox data is public and temporary.
4. **Read-back works.** Call `list_recent_changes` with `limit: 1`.
   - If a record comes back, name it briefly: pass.
   - If the result is empty, it is a pass only if the instance really is new. Say "reads work, nothing stored yet".
   - An error is a fail.
5. **Lifecycle capture** (Claude Code and Cowork only). If the session shows a "Neotoma:" status line, quote it. It says when capture is off (public sandbox), or when capture and the connector point at different Neotomas. A split is a fail; give the command the status line names.

End with one line: **healthy**, or what is wrong and the next thing to try. If anything failed, use the `recover` skill.
