---
name: process_feedback
description: Process Issues (formerly Process Feedback)
---

<!-- Source: .cursor/skills/process-feedback/SKILL.md -->


# Process Issues (formerly Process Feedback)

> **The old feedback pipeline has been replaced by the GitHub Issues integration.**

## New workflow

1. **List open issues**: `neotoma issues list --status open`
2. **View issue details**: `neotoma issues list` or check GitHub directly
3. **Add a message**: `neotoma issues message <number> --body "..."`
4. **Sync from GitHub**: `neotoma issues sync`
5. **Close/label issues**: Manage directly on GitHub (labels, close, reopen)

## MCP tools

| Tool | Purpose |
|------|---------|
| `submit_issue` | Create a new issue |
| `add_issue_message` | Add a message to an existing issue |
| `get_issue_status` | Check issue status (syncs from GitHub if stale) |
| `sync_issues` | Full sync of issues from GitHub to local Neotoma |

## Inspector

Issues are viewable at `/issues` in the Inspector UI, with individual issue detail pages showing the full conversation thread.

## Configuration

```bash
neotoma issues config --repo <owner/repo> --mode <proactive|consent|off>
neotoma issues auth  # triggers gh CLI auth flow
```
