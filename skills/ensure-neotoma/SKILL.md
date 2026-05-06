---
name: ensure-neotoma
description: Install Neotoma, configure MCP for your harness, and verify connectivity. Prerequisite for all memory skills.
triggers:
  - ensure neotoma
  - install neotoma
  - setup neotoma
  - configure neotoma
  - neotoma setup
  - set up memory
  - install memory layer
---

# Ensure Neotoma

Meta skill that installs and configures Neotoma so other memory skills can run. Every `remember-*` skill references this as a prerequisite.

## When to use

- Before running any `remember-*` or `store-data` skill for the first time.
- When the user says "install neotoma", "set up memory", or similar.
- When another skill fails because Neotoma MCP is not connected.

## Workflow

### Phase 1: Check if Neotoma CLI is available

```bash
npx neotoma doctor --output json
```

If `neotoma` is not found or `doctor` reports `installed: false`:

1. Guide installation:
   ```bash
   npm install -g neotoma
   ```
2. Verify the install succeeded:
   ```bash
   neotoma --version
   ```

### Phase 2: Run setup

Run the composite setup command to configure MCP, CLI instructions, hooks, permissions, and skills for the current harness:

```bash
neotoma setup --yes
```

If the user wants to target a specific harness, pass `--tool`:

```bash
neotoma setup --tool cursor --yes
neotoma setup --tool claude-code --yes
neotoma setup --tool codex --yes
```

Review the setup report. Every step should show `ok: true`. If any step failed, report the failure reason and suggest remediation.

### Phase 3: Verify MCP connectivity

Use the Neotoma MCP `get_session_identity` tool to confirm the MCP connection is live:

- If the tool is available and returns a response, Neotoma is configured.
- Check `attribution.tier` — `software` or `hardware` means verified attribution; `unverified_client` is functional but unverified.
- If the MCP tool is not available, check the harness MCP config file and guide the user through manual configuration.

### Phase 4: Confirm readiness

Report the result:
- Neotoma version installed
- Harness detected and configured
- MCP connectivity status
- Attribution tier

State that the user can now run any `remember-*` skill or `store-data` / `query-memory`.

## Do not

- Skip verification — always confirm MCP connectivity before declaring success.
- Assume the user has Node.js installed — check and guide if `npm` is not found.
- Modify harness configuration files directly — use `neotoma setup` which handles all harness-specific logic.
