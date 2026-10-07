---
name: check
description: Neotoma health check. Confirms the connector is connected, says which Neotoma answered, and proves reads work. Writes nothing. Use when someone asks "is Neotoma working", "check Neotoma", "which Neotoma am I on", or before trusting an empty answer.
---

# Check Neotoma

Read-only. Never store, correct, or delete anything during a check.

Run the three checks in order and report each one as **pass** or **fail**, with one line of detail.

1. **Connected.** Are Neotoma tools available (for example `get_session_identity`)? If not, it is a fail: the connector is missing, disabled, or not authenticated. Stop here and use the `recover` skill.
2. **Which Neotoma answered.** Call `get_session_identity`. Report:
   - whether the session is signed in, and its trust tier;
   - the server name and version, if the client shows them;
   - whether this is the **shared public sandbox**: the user id is `11111111-1111-1111-1111-111111111111`, or the configured URL is `https://sandbox.neotoma.io/mcp`. Sandbox data is public and temporary.
3. **Read-back works.** Call `list_recent_changes` with `limit: 1`.
   - If a record comes back, name it briefly. That is a pass.
   - If the result is empty, that is a pass only if the instance really is new. Say "reads work, nothing stored yet". An error is a fail.

End with one line: **healthy**, or what is wrong and the next thing to try. If anything failed, use the `recover` skill.
