# Neotoma for OpenAI Codex CLI

Lifecycle hooks that plug [Neotoma](https://neotoma.io) into [OpenAI Codex CLI](https://github.com/openai/codex). Codex's hook points are narrower than Claude Code's, so this package focuses on the highest-leverage moments:

| Codex hook | Neotoma behavior |
| --- | --- |
| `history.session_start_command` | Create a `conversation` entity for the session. |
| `notify` (root argv array) | Record a `context_event` for each Codex notification (turn complete, approval needed, error). Same as `notify = ["python3", "/…/notify.py"]` in Codex sample config. |
| `history.session_end_command` | Record a `session_end` marker and persist the final assistant reply. |

Codex’s `[history]` table also requires `persistence` (`"save-all"` or `"none"`). The installer appends the hook block and, if the file still has no `persistence =` line, inserts `persistence = "save-all"` immediately after the first `[history]` header so older configs stay valid on current Codex builds.

Tool-call capture is not exposed by Codex CLI at this time. Agents that need richer observability should pair this with the Neotoma MCP server — the hooks set the reliability floor, MCP provides the quality ceiling.

## Install

```bash
pip install neotoma-client
npm install -g @neotoma/codex-hooks
neotoma-codex-hooks
```

This edits `~/.codex/config.toml` to point the relevant keys at the Python hook scripts shipped in this package. Remove with:

```bash
neotoma-codex-hooks --uninstall
```

## Prerequisites

- A running Neotoma server (default `http://127.0.0.1:3080`).
- `python3` on PATH, and `neotoma-client` installed.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug` \| `info` \| `warn` \| `error` \| `silent`. |
| `NEOTOMA_PYTHON` | `python3` | Python interpreter used by the hooks. |

## License

MIT
