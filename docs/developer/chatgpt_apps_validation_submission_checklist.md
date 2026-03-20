# ChatGPT Apps Validation and Submission Checklist

Use this checklist for release gating before app submission.

## A) Tool and Schema Correctness

- [ ] `listTools` returns only intended production tools.
- [ ] Every exposed tool has a clear description with "Use this when..." intent language.
- [ ] Input schemas validate expected fields and reject malformed payloads.
- [ ] Tool responses are deterministic and bounded (pagination supported where relevant).

## B) Auth and Connection Flow

- [ ] `/.well-known/oauth-authorization-server` returns valid metadata.
- [ ] `/.well-known/oauth-protected-resource` returns expected auth metadata.
- [ ] Unauthenticated `/mcp` calls return `401` with `WWW-Authenticate`.
- [ ] Invalid/expired connection IDs return `invalid_token` behavior and allow reconnect.
- [ ] OAuth authorize/token/register endpoints complete successfully.

## C) ChatGPT Developer Mode Validation

- [ ] Connector can be created with `https://<host>/mcp`.
- [ ] Tool list appears after connect.
- [ ] Golden prompt set passes:
  - [ ] Direct prompts call intended tool.
  - [ ] Indirect prompts discover intended tool.
  - [ ] Negative prompts do not call irrelevant tools.
- [ ] Write actions require confirmation as expected.
- [ ] Metadata refresh flow works after redeploy.

## D) UI Surface Validation (Timeline Widget MVP)

- [ ] `neotoma://ui/timeline_widget` appears in resources.
- [ ] `list_timeline_events` carries UI metadata.
- [ ] Widget renders without console/runtime errors.
- [ ] Widget gracefully handles empty event sets.

## E) Security and Privacy Review

- [ ] Privacy policy is up to date and linked in submission assets.
- [ ] Data minimization in tool outputs is documented and validated.
- [ ] No sensitive token data appears in logs.
- [ ] Rate limits and auth failure behavior are documented.

## F) Submission Package

Prepare the following:

- [ ] App title
- [ ] Short description (1 sentence)
- [ ] Long description (what, when, for whom)
- [ ] Example prompts (at least 6; include direct/indirect/negative)
- [ ] Safety and usage boundaries
- [ ] Privacy policy URL
- [ ] Support/contact URL or email

## G) Post-Launch Observability

- [ ] Monitor auth failures (`401`, `invalid_token`).
- [ ] Monitor tool-call errors and schema validation failures.
- [ ] Track P95 latency for key tools (`retrieve_entities`, `store`, `list_timeline_events`).
- [ ] Track successful task completion rate from golden prompt replay.

## Suggested Golden Prompt Set

1. "Find recent tasks from this week."
2. "Show timeline events from January 2026."
3. "Store this note: finalize launch messaging."
4. "Find entities related to identifier Acme Corp."
5. "Show related entities for this entity id: <id>."
6. Negative: "Write a haiku about rainbows." (should avoid Neotoma tools)
