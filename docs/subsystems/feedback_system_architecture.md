# Feedback System Architecture (DEPRECATED)

> **This system has been replaced by the GitHub Issues integration.**
> The custom feedback pipeline (Netlify Functions, local JSON store, Cloudflare tunnels, admin proxy) has been removed.
> See `docs/subsystems/agent_feedback_pipeline.md` for the migration table and `src/services/issues/` for the replacement implementation.

## Replacement architecture

The new system uses:
- **GitHub Issues** as the collaborative transport (public repo for normal issues, Security Advisories for PII-sensitive reports)
- **Neotoma conversations** as the relational data model (`issue` entity + `conversation` + `conversation_message` entities)
- **GitHub CLI (`gh`)** for authentication (no PATs stored in config)
- **GitHub Actions** for automation (auto-labeling, upgrade guidance bot)
- **MCP tools**: `submit_issue`, `add_issue_message`, `get_issue_status`, `sync_issues`
- **CLI commands**: `neotoma issues create|message|list|sync|config|auth`
- **Inspector UI**: `/issues` list page + `/issues/:number` detail page
