---
title: Agent instructions overview
summary: Index of the canonical MCP behavioral contract, the CLI harness mirror, and the sync rule that keeps them aligned.
category: api
subcategory: mcp
order: 5
audience: agent
visibility: public
tags: [agent-instructions, mcp, cli]
---

# Agent instructions overview

Neotoma ships **agent instructions** — a small, deterministic set of rules
that any LLM-driven agent (Claude, ChatGPT, Codex, Cursor) follows when
interacting with the server.

There is exactly **one** canonical behavioral contract. Everything else is a
transport, a mirror, or an index.

## Canonical source

`docs/developer/mcp/instructions.md` — the first fenced code block is what
the MCP server emits to clients via the `instructions` field (unless
`NEOTOMA_MCP_COMPACT_INSTRUCTIONS` is set). Any change to agent behavior
starts here.

## Surfaces

| Surface | Where | Notes |
|---|---|---|
| MCP `instructions` field | Returned to every connecting client | Extracted from the canonical doc by `getMcpInteractionInstructions()` in `src/mcp_instruction_doc.ts`. |
| `neotoma instructions print` | CLI command | Reads the same bundled file (`docs/developer/mcp/instructions.md`). |
| `/mcp-interaction-instructions` HTTP endpoint | Wire-format introspection | Serves the same content. |
| `docs/developer/cli_agent_instructions.md` | Thin harness layer | CLI-only operational content (startup protocol, `--json=` warning, store/retrieval quick references). Does NOT duplicate the MCP behavioral contract. |
| Site page `/agent-instructions` | Public marketing-site page | Authored under `docs/site/pages/en/`. |

## Sub-routes on the public site

The public marketing site exposes a few focused agent-instruction pages that
distill specific patterns from the canonical contract:

- `/agent-instructions/store-recipes` — common store-call shapes.
- `/agent-instructions/retrieval-provenance` — how to retrieve with full
  provenance chains.
- `/agent-instructions/display-conventions` — emoji + linked-entity
  conventions for assistant replies.

These pages source from the canonical contract; if they disagree with
`docs/developer/mcp/instructions.md`, the canonical contract wins.

## Sync rule

`docs/developer/agent_instructions_sync_rules.mdc` defines the contract:
behavioral semantics live in exactly one place; the CLI harness file is a
thin pointer, not a duplicate. The rule lists what the change workflow looks
like and what is forbidden.

## Related

- `docs/developer/mcp/instructions.md` — canonical contract.
- `docs/developer/cli_agent_instructions.md` — harness transport.
- `docs/developer/agent_instructions.md` — index / operator map.
- `docs/developer/agent_instructions_sync_rules.mdc` — sync rule.
- `src/mcp_instruction_doc.ts` — extraction logic.
