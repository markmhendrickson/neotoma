# Neotoma agent instructions (canonical map)

This page is the **index** for where agent-facing Neotoma behavior is defined. Do not duplicate the full contract in consumer repos or in a second long markdown file.

## Canonical behavioral contract

The normative text is the **first fenced code block** in:

- [`docs/developer/mcp/instructions.md`](./mcp/instructions.md)

That block is what the Neotoma MCP server sends to clients at runtime (unless compact mode is enabled; see below).

## When Neotoma MCP tools are available in the session

Follow the MCP `instructions` / `serverUseInstructions` payload only for turn order, store recipes, retrieval, provenance, display, QA, and errors. **Do not** load a second full copy of the same rules from local IDE files unless you are explicitly auditing differences.

## When Neotoma MCP is not available (CLI-only or offline agents)

1. Run:

   ```bash
   neotoma instructions print
   ```

   That prints the same fenced block bundled with the installed `neotoma` package (see `package.json` `files`).

2. Alternatively, open `docs/developer/mcp/instructions.md` in the Neotoma source checkout or under `node_modules/neotoma/docs/developer/mcp/instructions.md` after `npm install neotoma`.

## Harness file applied by `neotoma cli config`

[`cli_agent_instructions.md`](./cli_agent_instructions.md) is intentionally **thin**: transport preference (MCP vs CLI), CLI cheat sheets, and pointers to this page and the MCP doc. It is symlinked into `.cursor/rules/neotoma_cli.mdc` (and Claude/Codex paths). It does **not** mirror every bracket section anymore.

## Compact MCP instructions (dual-host)

If the host already injects expanded Neotoma workspace rules, operators may set `NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1` on the Neotoma MCP server so clients receive a short checklist plus a pointer to the full doc and to `neotoma instructions print`. See [`mcp/compact_instructions.md`](./mcp/compact_instructions.md) for full documentation and [`src/server.ts`](../../src/server.ts) (`MCP_INTERACTION_INSTRUCTIONS_COMPACT_DUAL_HOST`) for the implementation.

## Mobile setup (Claude iOS / Android)

Claude mobile does not run the Claude Code hook runtime. The MCP instruction payload and an optional custom system prompt are the only enforcement paths for Neotoma-first behavior. See [`mcp/mobile_setup.md`](./mcp/mobile_setup.md) for connection steps, a recommended custom system prompt template, and notes on compact mode for short-context deployments.

## Editing and review policy

- **Behavioral changes** (turn lifecycle, store recipes, retrieval, provenance, display, etc.) edit **`docs/developer/mcp/instructions.md`** first.
- Update [`docs/developer/agent_instructions_sync_rules.mdc`](./agent_instructions_sync_rules.mdc) only when the **maintenance contract** for those files changes (not for line-by-line MCP↔CLI mirroring).

## Related

- [`agent_cli_configuration.md`](./agent_cli_configuration.md) — where CLI instructions are applied
- [`cli_reference.md`](./cli_reference.md) — CLI commands including `instructions print`
- [`mcp/instructions.md`](./mcp/instructions.md) — MCP-delivered block (source of truth)
- [`mcp/compact_instructions.md`](./mcp/compact_instructions.md) — Compact instructions mode documentation
- [`mcp/mobile_setup.md`](./mcp/mobile_setup.md) — Mobile setup guide (Claude iOS/Android)
