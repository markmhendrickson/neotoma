# Neotoma + Cursor (hooks)

## Install

```bash
# From the project where Cursor runs
npm install --save-dev @neotoma/cursor-hooks @neotoma/client
npx @neotoma/cursor-hooks install
```

The installer merges Neotoma entries into `.cursor/hooks.json`, preserving anything already there. Uninstall with `npx @neotoma/cursor-hooks --uninstall`.

## Hooks wired

| Event | Behavior |
| --- | --- |
| `beforeSubmitPrompt` | Retrieval injection + user message capture. |
| `afterToolUse` | `tool_invocation` observation. |
| `stop` | Assistant `agent_message` safety net. |

## Configuration

Same env vars as other hook integrations: `NEOTOMA_BASE_URL`, `NEOTOMA_TOKEN`, `NEOTOMA_LOG_LEVEL`.

## Coexistence with MCP

Cursor's MCP integration still handles structured writes initiated by the agent. Hooks add the passive floor — nothing gets lost if the agent forgets to call a tool.
