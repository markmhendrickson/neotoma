---
name: recover
description: What to do when the Neotoma connector fails, its tools are missing, or sign-in has expired. Diagnoses the failure, then walks the user through the fix one step at a time. Use on Neotoma errors such as 401, "invalid or expired connection", timeouts, or "tool not found".
---

# Recover Neotoma

Diagnose first, then give one fix at a time. Never ask the user to paste a token, password, or key into the chat.

## 1. Name the failure

| What you see | Likely cause |
| --- | --- |
| No Neotoma tools at all | Connector not added, disabled, or the plugin is off |
| 401, "authentication needed", or "invalid or expired connection" | Sign-in expired or revoked |
| Timeout, connection refused, DNS error | Server down, or the URL is wrong |
| Calls work but data you expected is missing | Connected to a different Neotoma than you meant (often the public sandbox) |

## 2. Fix

**Connector missing or disabled**
- Claude Code: run `/plugin` and check that `neotoma` is installed and enabled, then run `/mcp` and check that `neotoma` is listed.
- Claude apps: open **Settings › Connectors** and check that Neotoma is added and switched on for this chat.

**Sign-in expired**
- Claude Code: run `/mcp`, select `neotoma`, and choose re-authenticate (or clear authentication, then authenticate again).
- Claude apps: in **Settings › Connectors**, disconnect Neotoma and connect it again.
- If the server uses a connection id in its config and reports it as invalid, remove that id and reconnect.

**Server unreachable**
- Open the server's address in a browser, without the `/mcp` part. If it does not load, the server is down: start it (on your own machine, `neotoma api start`) or wait and retry.
- Check the URL. Claude Code: the plugin's **Neotoma MCP URL** setting (`/plugin` › neotoma › configure), then `/reload-plugins`. Claude apps: the connector's URL. Chat ignores a plugin-configured URL, so use a custom connector for your own server.

**Wrong Neotoma**
- Run the `check` skill to see which instance answered. If it is the public sandbox and the user meant their own, change the URL as above.

## 3. Confirm

After each fix, run the `check` skill. Stop as soon as it passes. If it still fails after the fixes above, tell the user what you saw (error text, which step failed) and suggest filing an issue at https://github.com/markmhendrickson/neotoma/issues, without tokens or personal data.
