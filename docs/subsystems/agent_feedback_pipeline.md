# Agent Feedback Pipeline (DEPRECATED)

> **This subsystem has been replaced by the GitHub Issues integration.**
> See the new system at `src/services/issues/` and the MCP tools `submit_issue`, `add_issue_message`, `get_issue_status`, `sync_issues`.

## Migration

The feedback pipeline has been replaced by the Issues/Conversations system which uses GitHub Issues as the collaborative transport and Neotoma conversations as the relational data model.

| Old | New |
|-----|-----|
| (removed) MCP feedback submission | `submit_issue` MCP tool |
| (removed) MCP feedback polling | `get_issue_status` MCP tool |
| `neotoma triage` CLI | `neotoma issues list` CLI |
| `neotoma feedback mode` CLI | `neotoma issues config --mode` CLI |
| `src/services/feedback/` | `src/services/issues/` |
| Netlify Functions transport | GitHub Issues API (direct) |
| Inspector `/feedback` | Inspector `/issues` |
| `neotoma_feedback` entity type | `issue` entity type + `conversation` + `conversation_message` |

## Key differences

1. **GitHub is the collaborative source of truth** — issues live on GitHub and are synced to local Neotoma
2. **Conversations model** — each issue maps to a conversation entity with message entities per comment
3. **Auto-push on write** — creating an issue or adding a message automatically pushes to GitHub
4. **Sync-if-stale on read** — reading issue status triggers a sync when local data is older than 5 minutes
5. **GitHub CLI authentication** — uses `gh auth token` for credential resolution instead of stored PATs
6. **Private product issues** — sensitive Neotoma bug or doc-gap reports that must not hit GitHub Issues use `submit_issue` with `visibility: "private"` (Neotoma-only store; separate from vulnerability reporting in `SECURITY.md`)
