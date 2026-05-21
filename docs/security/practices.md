# Security Practices

Living reference for Neotoma's security posture. Documents the current state of each security gate, checklist, and tooling artifact, along with the advisory or finding that motivated it. Append-only at the section level — when a gate is extended, update its section in place and add the motivating advisory to its history table.

This document is paired with `docs/security/advisories/` (per-vulnerability records). Read advisories to learn *what happened*; read this document to understand *what we now do because of it*.

---

## Layered defense overview

Neotoma's pre-release security posture is structured as five gates, two of which are advisory and three of which are blocking. Each gate covers a distinct failure mode. The composition is intentional: no single gate catches every regression class, and each gate's scope is documented so that gaps are surfaced rather than implicit.

| Gate | Lane | Scope | Blocks release? |
|------|------|-------|-----------------|
| G1 — Diff classifier | Pre-release | Labels diffs `sensitive=true/false` to trigger downstream gates | No (gating signal only) |
| G2 — Static lint (`security:lint`) | PR + release | Static analysis of auth-sensitive code patterns | Yes, on errors |
| G3a — Manifest check | PR + release | Registered routes match `protected_routes_manifest.json` | Yes |
| G3b — Auth-topology matrix | PR + release | Runtime test that protected routes reject unauthenticated callers across all reachable paths | Yes |
| G4 — AI security review | Release only | LLM-driven adversarial walkthrough of the release diff | Manual sign-off |
| G5 — Deployed probes | Release only | Live HTTP probes against the deployed environment | Yes |

The pre-PR adversarial checklist is a sixth layer (human-driven), tracked separately in `.cursor/skills/release/SKILL.md` § Step 3.5.

---

## G2 — Static lint (`security:lint`)

**Command:** `npm run security:lint`  
**Implementation:** `scripts/security/lint.js`  
**Blocks on:** Errors only. Warnings are advisory.

### Current rules

| Rule | What it catches | Motivating advisory |
|------|-----------------|---------------------|
| `forwarded-for-trust` | Direct reads of `req.socket.remoteAddress`, `X-Forwarded-For`, or `Host` headers outside the canonical helpers in `src/actions.ts` and `src/services/root_landing/**` | 2026-05-11-inspector-auth-bypass |
| `local-dev-user-id-scope` | References to `LOCAL_DEV_USER_ID` outside `src/cli/**`, `src/services/local_auth.ts`, and `tests/**` | 2026-05-11-inspector-auth-bypass |
| `alternate-path-auth-bypass` | Route handlers reachable through a proxy or alternate path that do not re-apply `requireUser` middleware | 2026-05-11-inspector-auth-bypass |

### Known gaps

The linter operates on source-text patterns. It does **not** analyze:

- Database query filter clauses (`.eq("user_id", userId)`) — see G3b gap for `2026-05-21-relationship-endpoint-tenant-isolation`
- Per-handler authorization scope after authentication
- Cross-file data-flow

Gate gap tracked in **#372**.

---

## G3a — Protected routes manifest

**Command:** `npm run security:manifest:check` (verify) / `npm run security:manifest:write` (regenerate)  
**Manifest:** `scripts/security/protected_routes_manifest.json`  
**Blocks on:** Drift between registered Express routes and the manifest.

### Current behavior

Every public Express route MUST appear in one of two lists in the manifest:

1. **`auth_required`** — Routes that require `requireUser()` or `assertGuestWriteAllowed()` middleware
2. **`unauth_allowed`** — Routes intentionally accessible without authentication, each with a stated `reason`

The check rejects PRs that add a new route without updating the manifest. Silent additions are blocked.

### History

| Date | Change | Motivating advisory |
|------|--------|---------------------|
| 2026-05-11 | Manifest instantiated and gate added to CI | 2026-05-11-inspector-auth-bypass |
| 2026-05-11 | Inspector proxy path added with proper middleware annotation | 2026-05-11-inspector-auth-bypass |

### Known gaps

- The manifest verifies that auth middleware is registered. It does **not** verify that the middleware correctly resolves to the authenticated user, nor that downstream queries scope to that user. The v0.13.0 tenant isolation gap (`2026-05-21-relationship-endpoint-tenant-isolation`) shipped despite both `/list_relationships` and `/retrieve_graph_neighborhood` being correctly listed in the manifest as `auth_required`. Authentication was present; authorization scope was not.

Gate gap tracked in **#372**.

---

## G3b — Auth-topology matrix test

**Command:** `npm run test:security:auth-matrix`  
**Test file:** `tests/security/auth_topology_matrix.test.ts`  
**Blocks on:** Test failure.

### Current behavior

Runtime test that walks every route surface (direct, via Inspector proxy, via CLI tunnel) and confirms that protected routes reject unauthenticated requests with the expected error. Covers the auth-middleware layer, not the per-query authorization layer.

### History

| Date | Change | Motivating advisory |
|------|--------|---------------------|
| 2026-05-11 | Test added with coverage for direct + Inspector proxy paths | 2026-05-11-inspector-auth-bypass |
| Pending | Extend to assert per-user query scoping on read endpoints (see #372) | 2026-05-21-relationship-endpoint-tenant-isolation |

### Known gaps

The matrix asserts that an unauthenticated caller is rejected. It does **not** assert that an authenticated caller cannot access another user's data. This is the gap that allowed the v0.13.0 tenant isolation issue to ship; the extension to cover cross-user read access is tracked in **#372**.

---

## Pre-release adversarial checklist

**Location:** `.cursor/skills/release/SKILL.md` § Step 3.5  
**Owner:** Release driver (human, with AI assistance)

### Current categories

The checklist enumerates known regression classes that must be walked through against the release diff before tagging:

| Category | Motivating advisory |
|----------|---------------------|
| Alternate-path auth bypass (proxies, CLI tunnels, new middleware stacks) | 2026-05-11-inspector-auth-bypass |
| Proxy trust / `X-Forwarded-For` / `Host` header reads | 2026-05-11-inspector-auth-bypass |
| Local-dev shortcut widening (`LOCAL_DEV_USER_ID`, `isLocalRequest` fallbacks) | 2026-05-11-inspector-auth-bypass |
| New unauthenticated public route | 2026-05-11-inspector-auth-bypass |
| Guest-access widening | 2026-05-11-inspector-auth-bypass |
| Pending: Cross-tenant data access on read endpoints (per-user query scope) | 2026-05-21-relationship-endpoint-tenant-isolation (see #372) |

### Known gaps

The v0.13.0 release shipped with a tenant isolation gap because **the cross-user data access category did not exist in the checklist**. The release driver walked through the alternate-path and proxy-trust categories (motivated by v0.11.1) but had no prompt to verify per-user query scoping. The checklist extension is tracked in **#372**.

This is the failure mode the checklist is designed against: a regression class that isn't in the list won't be checked. New categories must be added whenever an advisory reveals a class the previous gates didn't cover.

---

## Cross-cutting practices

### Advisory → hardening linkage

Every advisory in `docs/security/advisories/` MUST result in one of:

1. A new gate, rule, or checklist category (documented in this file under the relevant section)
2. An explicit waiver with a written reason (documented in the advisory's Gate Gap section)

The two advisories filed to date have both produced gate or checklist work:

- `2026-05-11-inspector-auth-bypass` → G2 rules, G3a manifest, G3b matrix test, checklist categories 1–5 (all landed in v0.11.1)
- `2026-05-21-relationship-endpoint-tenant-isolation` → G3b extension, checklist category 6 (pending, tracked in #372)

### Single-tenant assumption

All current gates assume single-tenant deployment. The v0.13.0 tenant isolation gap had no real-world impact because no multi-tenant deployments exist. Before any multi-tenant deployment lands:

- #365 (per-user scoping on `/list_relationships`) must be fixed
- #366 (per-user scoping on `/retrieve_graph_neighborhood`) must be fixed
- #372 (gate coverage for cross-user data access) must be closed

The escalation condition is documented in the advisory itself.

### Source of truth

| Surface | Canonical doc |
|---------|---------------|
| Per-vulnerability records | `docs/security/advisories/` |
| Current posture and gate history | `docs/security/practices.md` (this file) |
| Threat model | `docs/security/threat_model.md` |
| Release-time gate execution | `.cursor/skills/release/SKILL.md` § Step 3.5 |
| Change-time guardrails | `.claude/rules/change_guardrails_rules.md` |

When a new advisory is filed, update this document in the same change — the linkage from advisory to gate change is the artifact that proves the security posture is actually evolving.
