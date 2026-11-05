# Connect a tool to Neotoma

Choose the documented connection path for each supported agent host, plugin, SDK, or registry.

Release reference: v0.26.0 (`b6ae615`, October 27th, 2026). The path was checked against source `4779784` and vendor documentation on October 24th, 2026; that source is included in this release. Installed-host compatibility and Windows behavior were not smoke tested.

Choose the environment that will use Neotoma first. Follow the [Neotoma install and connection steps](#start-with-neotoma), then use the matching host path below. A completed command does not prove the host loaded the server: inspect the host's MCP tools or plugin state and make a read-only call. Local stdio runs on the host machine; a remote client needs a reachable, authenticated HTTPS `/mcp` endpoint.

| Tool                   | Path                                               | Guide                                           |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Claude Code            | Neotoma CLI setup                                  | [Connect Claude Code](claude-code.md)           |
| Cursor                 | Neotoma CLI setup                                  | [Connect Cursor](cursor.md)                     |
| Codex CLI              | Neotoma CLI setup                                  | [Connect Codex](codex.md)                       |
| OpenClaw               | Native plugin first; optional Neotoma setup layers | [Connect OpenClaw](openclaw.md)                 |
| Claude Desktop         | Neotoma CLI setup, explicit user scope             | [Connect Claude Desktop](claude-desktop.md)     |
| ChatGPT                | Manual remote MCP or Custom GPT Actions            | [Connect ChatGPT](chatgpt.md)                   |
| Windsurf               | Manual MCP                                         | [Connect Windsurf](windsurf.md)                 |
| Continue               | Manual MCP                                         | [Connect Continue](continue.md)                 |
| VS Code / Copilot Chat | Manual MCP                                         | [Connect VS Code](vscode.md)                    |
| IronClaw               | Manual host registration                           | [Connect IronClaw](ironclaw.md)                 |
| Letta                  | SDK registration                                   | [Connect Letta](letta.md)                       |
| OpenCode               | Plugin/hooks; optional manual MCP                  | [Connect OpenCode](opencode.md)                 |
| Claude Agent SDK       | In-process adapter                                 | [Connect Claude Agent SDK](claude-agent-sdk.md) |
| Smithery               | External URL registry                              | [Connect Smithery](smithery.md)                 |

The CLI supports `setup --tool` for `claude-code`, `cursor`, `codex`, `openclaw`, and `claude-desktop`. OpenClaw’s primary path is its native plugin, which that setup command does not install. Windsurf, Continue, and VS Code names can be accepted by the current setup parser while the config writer targets Cursor; use their manual guides until that defect is fixed. The [integrations matrix](../../integrations/matrix.md) records modes, limits, and source evidence.

## Start with Neotoma

Run `npm install -g neotoma`, then `neotoma init` in the environment that will hold your data. Use `neotoma status --json` to inspect it before choosing a host.

**Verify the effect.** Check the selected local instance and data profile through configuration and `neotoma status --json`; for remote access, compare the configured authenticated `/mcp` URL with the intended host. The host's MCP tool list proves transport and tool access, not data-profile correctness. On an existing profile, retrieve a known existing entity before any write and check the target. On a new, empty profile, do not create a fixture merely to verify installation; after the first user-authorized store of supplied data, retrieve its exact returned ID. That read-back confirms the connected instance's read/write path, not independently that it was the intended target. For plugins and adapters, also verify that their capture event reached Neotoma; MCP discovery alone does not prove hook capture.
