---
path: /changelog
locale: en
page_title: Changelog
shell: detail
translation_status: canonical
nav_group: reference
nav_order: 40
---

Release history, migration notes, and compatibility changes. For install and upgrade paths, see [Install](/install) and [Docs hub](/docs).

**Unreleased — OAuth discovery behavior change (protocol correction).** `GET /.well-known/oauth-protected-resource` (and the RFC 9728 §3.1 form `/.well-known/oauth-protected-resource/mcp`, now registered) return **200 without credentials** where the bare path previously returned 401 with a `WWW-Authenticate` header naming itself — a deadlock that prevented first-time MCP clients from ever starting the login flow. `/.well-known/openid-configuration` now returns an explicit **404** instead of a 401 from the catch-all auth guard. Integrators who built workarounds for the deadlock (for example relying on anonymous writes to skip discovery) can remove them. See [MCP](/mcp) and the REST API discovery-bootstrap section.

**v0.12.0 highlights:** dedicated subsystem references for [peer sync](/peer-sync), [substrate subscriptions](/subscriptions), [issue reporting](/issue-reporting), and [security hardening](/security-hardening). The issue-reporting page also covers the breaking `submit_issue` reporter-provenance contract (`reporter_git_sha` or `reporter_app_version` is now required).



Published releases and tags live on GitHub alongside npm. When upgrading clients or MCP proxies, pin versions explicitly and re-run [Walkthrough](/walkthrough) checks if your transport or auth tier changed.
