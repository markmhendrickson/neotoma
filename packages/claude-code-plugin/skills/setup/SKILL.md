---
name: setup
description: First-time Neotoma setup in Claude, step by step. Checks that skills can run, connects Neotoma, picks ONE workflow, proposes bundles from evidence, turns on only what the user confirms, then stores a first record and reads it back. Use when someone says "set up Neotoma", "get started with Neotoma", or has just installed the plugin. Works before Neotoma is connected.
---

# Set up Neotoma

Go one step at a time. Finish each step, tell the user what happened, and only then move on. Never skip the confirmation in step 5.

## 1. Check that skills can run

In the Claude apps, skills need **Settings › Capabilities › Code execution and file creation** turned on. If this skill is running, it is on. If the user reached setup some other way (a starter prompt, or typing the request), ask them to confirm the setting is on before continuing.

## 2. Connect Neotoma

Check for Neotoma tools (for example `get_session_identity`). If they are missing:

- **Claude Code:** the plugin ships a Neotoma connector. Run `/mcp`, select `neotoma`, and authenticate if asked. To use your own Neotoma instead of the public sandbox, set **Neotoma MCP URL** in the plugin's settings (`/plugin` › neotoma › configure), then run `/reload-plugins`.
- **Claude apps (Chat, Cowork, Desktop):** add Neotoma under **Settings › Connectors**. Chat does not apply a plugin's configured URL to its connector, so to use your own server add a **custom connector** with your server's `/mcp` URL.

Then call `get_session_identity` and tell the user which Neotoma answered and whether they are signed in. If the user id is `11111111-1111-1111-1111-111111111111`, they are on the **shared public sandbox**: anything stored there is visible to other visitors and gets wiped. Say so plainly and suggest test data only until they connect their own instance.

If connecting fails, use the `recover` skill.

## 3. Pick ONE workflow

Ask which single thing they want Neotoma to remember first, for example contacts, meetings, tasks, finances, or a project. One only; more can come later.

## 4. Propose bundles from evidence

Call `manage_bundles` with `action: "list"`. Propose only bundles that fit the chosen workflow, and give the evidence for each: what the user said, or what they have in front of them. Do not propose a bundle just because it exists. Core bundles are always on; do not list them as choices.

## 5. Turn on only what the user confirms

Ask for a yes on each proposed bundle. Call `manage_bundles` with `action: "enable"` only for the ones they confirm. Report what is now on.

## 6. Store a first record and read it back

Ask for one real item from the workflow (on the sandbox, suggest a made-up one). Store it, then retrieve it and show the user exactly what was saved. Setup is finished only when the read-back matches.

## 7. Finish

In two or three lines: what is connected, what is on, the first record. Mention the starter prompts: "What do you remember about…", "Remember this", "What changed recently", and "Check Neotoma".
