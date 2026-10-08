---
name: setup
description: First-time Neotoma setup in Claude, step by step. Checks that skills can run, connects exactly one Neotoma (the steps differ in Claude Code, Cowork and Chat), picks ONE workflow, proposes bundles from evidence, turns on only what the user confirms, then stores a first record and reads it back. Use when someone says "set up Neotoma", "get started with Neotoma", or has just installed the plugin. Works before Neotoma is connected.
---

# Set up Neotoma

Go one step at a time. Finish each step, tell the user what happened, and only then move on. Never skip the confirmation in step 5.

The public sandbox URL is `https://sandbox.neotoma.io/mcp`. It is **shared and temporary**: other people can see what is stored there, and it gets wiped. It is fine for trying Neotoma with made-up data. For real data, use your own Neotoma's `/mcp` URL.

## 1. Check that skills can run

In the Claude apps, skills need **Code execution and file creation** turned on (in the app's capabilities settings). If this skill is running, it is on. If the user reached setup another way, ask them to confirm it is on.

## 2. Connect exactly one Neotoma

Ask which app they are in, if it is not obvious, then follow that branch. The goal on every surface is **one** working Neotoma connector.

**Claude Code**
- The plugin's connector (`plugin:neotoma:neotoma`) loads automatically. It uses the plugin setting **Neotoma MCP URL**, which defaults to the public sandbox.
- For your own Neotoma: if it runs on this machine, run `neotoma hooks install --tool claude-code` in a terminal. This sets the URL and turns off any duplicate connector. Otherwise run `/plugin`, open **neotoma**, choose **Configure options**, set **Neotoma MCP URL** to your server's `/mcp` URL, then run `/reload-plugins`.
- If `/mcp` lists another Neotoma server as well as `plugin:neotoma:neotoma`, turn one of them off in `/mcp`.

**Cowork**
- The plugin's connector is always the public sandbox, because Cowork does not ask for plugin settings. To use it, open **Customize › Plugins › Neotoma**, go to the **Connectors** tab, and connect it.
- For your own Neotoma:
  1. Open **Customize › Connectors** and click **Add custom connector**.
  2. Enter your server's `/mcp` URL, then click **Add** and **Connect**.
  3. Go to **Customize › Plugins › Neotoma › Connectors** and **disconnect** the plugin's sandbox connector, so only your own one is left.

**Chat (claude.ai web, desktop, mobile)**
- Chat does not load the plugin's connector, so **every** Chat user adds a custom connector:
  1. Open **Customize › Connectors** and click **Add custom connector**.
  2. Enter `https://sandbox.neotoma.io/mcp` to try Neotoma, or your own server's `/mcp` URL.
  3. Click **Add**, then **Connect**.
- On Team and Enterprise plans an Owner adds it under **Organization settings › Connectors** (**Add › Custom › Web**), and members click **Connect**. The Free plan allows one custom connector.
- In a chat, check that it is switched on: **+ › Connectors**.

Then call `get_session_identity` and tell the user which Neotoma answered and whether they are signed in. If it is the public sandbox (the URL above, or user id `11111111-1111-1111-1111-111111111111`), say so plainly and use made-up data only.

If two sets of Neotoma tools are available, there is a duplicate connector. Stop and have the user turn one off, as described above. If connecting fails, use the `recover` skill.

## 3. Pick ONE workflow

Ask which single thing they want Neotoma to remember first, for example contacts, meetings, tasks, finances, or a project. One only; more can come later.

## 4. Propose bundles from evidence

Call `manage_bundles` with `action: "list"`. Propose only bundles that fit the chosen workflow, and give the evidence for each: what the user said, or what they have in front of them. Core bundles are always on; do not list them as choices.

## 5. Turn on only what the user confirms

Ask for a yes on each proposed bundle. Call `manage_bundles` with `action: "enable"` only for the ones they confirm. Report what is now on.

## 6. Store a first record and read it back

Ask for one item from the workflow. On the sandbox, it must be made-up data. Store it, then retrieve it and show the user exactly what was saved. Setup is finished only when the read-back matches.

## 7. Finish

In two or three lines: which Neotoma is connected, what is on, and the first record. Mention the starter prompts: "What do you remember about…", "Remember this", "What changed recently", and "Check Neotoma".
