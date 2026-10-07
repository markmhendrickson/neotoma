---
name: recover
description: What to do when the Neotoma connector fails, its tools are missing, there are two Neotoma connectors, or sign-in has expired. Diagnoses the failure, then walks the user through the fix for their app (Claude Code, Cowork, Chat) one step at a time. Use on Neotoma errors such as 401, "invalid or expired connection", timeouts, or "tool not found".
---

# Recover Neotoma

Diagnose first, then give one fix at a time. Never ask the user to paste a token, password, or key into the chat.

The public sandbox URL is `https://sandbox.neotoma.io/mcp` (shared and temporary). Your own server's URL ends in `/mcp`.

## 1. Name the failure

| What you see | Likely cause |
| --- | --- |
| No Neotoma tools at all | No connector: none added (Chat always needs one), disconnected, or the plugin is off |
| Two sets of Neotoma tools | Duplicate connector: the plugin's one and your own are both on |
| 401, "authentication needed", or "invalid or expired connection" | Sign-in expired or revoked |
| Timeout, connection refused, DNS error | Server down, or the URL is wrong |
| Calls work but the data you expected is missing | Connected to a different Neotoma than you meant (often the public sandbox) |

## 2. Fix, by app

**Claude Code**
- *No tools:* run `/plugin` and check that `neotoma` is installed and enabled, then run `/mcp` and check that `plugin:neotoma:neotoma` (or your own Neotoma server) is listed and enabled.
- *Duplicate:* in `/mcp`, turn off one of the two. If your own Neotoma runs on this machine, run `neotoma hooks install --tool claude-code`, which points the plugin at it and turns off the duplicate.
- *Sign-in expired:* run `/mcp`, select the Neotoma server, and re-authenticate.
- *Wrong Neotoma or bad URL:* run `/plugin`, open **neotoma**, choose **Configure options**, set **Neotoma MCP URL**, then run `/reload-plugins`.

**Cowork**
- *No tools:* open **Customize › Plugins › Neotoma**, go to **Connectors**, and connect the plugin's sandbox connector. Or connect your own custom connector under **Customize › Connectors**.
- *Duplicate:* keep your own custom connector, and **disconnect** the plugin's connector on **Customize › Plugins › Neotoma › Connectors**.
- *Sign-in expired:* in **Customize › Connectors**, disconnect Neotoma, then connect again.
- *Wrong Neotoma:* the plugin's connector is always the sandbox in Cowork, because Cowork does not use plugin settings. For your own server:
  1. Open **Customize › Connectors**, click **Add custom connector**, and enter your `/mcp` URL.
  2. Disconnect the plugin's connector.

**Chat**
- *No tools:* Chat never loads the plugin's connector. Open **Customize › Connectors**, click **Add custom connector**, enter `https://sandbox.neotoma.io/mcp` or your own `/mcp` URL, then click **Add** and **Connect**. In the chat, check **+ › Connectors**.
- *Duplicate:* remove the extra Neotoma connector in **Customize › Connectors**.
- *Sign-in expired:* in **Customize › Connectors**, disconnect Neotoma, then connect again.
- *Wrong URL:* you cannot change a custom connector's sign-in settings in place. Remove it and add it again with the right URL.

**Server unreachable (any app)**
- Open the server's address in a browser, without `/mcp`. If it does not load, the server is down. If it runs on your machine, start it (`neotoma api start`), or wait and retry.

## 3. Confirm

After each fix, run the `check` skill. Stop as soon as it passes. If it still fails, tell the user what you saw (the error text and which step failed). Suggest filing an issue at https://github.com/markmhendrickson/neotoma/issues, without tokens or personal data.
