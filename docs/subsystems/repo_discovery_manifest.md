# Repo Discovery Manifest (`.well-known/neotoma.json`)

**Status:** Specification (Layer 2 / M2 of the distributed issue routing plan). No resolver code ships with this document; this is the agreed wire format that the M2 discovery resolver and M3 guest-policy acceptance build against. See [`issues.md`](issues.md) for the issue subsystem and [`peer_sync.md`](peer_sync.md) for the existing peer infrastructure this layers on.

## Why this exists

`submit_issue` routing is coupled to the reporter's install identity. `NEOTOMA_ISSUES_REPO` / `issues.target_url` are per-install singletons, so an issue _about_ a maintainer's repo, filed by an agent on a partner's install, lands in the **partner's** GitHub repo and Neotoma instance — never reaching the maintainer. Layer 1 (`target_repo`, shipped in #946) lets the reporter override the GitHub mirror per call, but the reporter still has to _know_ the right destination out of band.

The discovery manifest moves the source of truth for "where do issues about this repo go" out of each consumer's install config and **into the target repo itself**, consistent with Neotoma's State Layer philosophy: the truth about a repo lives with the repo. A reporter's agent reads the manifest from the repo it is filing about and routes the canonical record to the declared peer, with no operator-supplied configuration.

This is the publication/discovery layer above the existing `peer_config` infrastructure ([`peer_sync.md`](peer_sync.md)): where peers are operator-configured manually today, the manifest lets a target repo _advertise_ the trust relationship so it can be established automatically.

## Location and format

- **Canonical:** `/.well-known/neotoma.json` at the repo root, served via the repo's GitHub raw URL (`https://raw.githubusercontent.com/<owner>/<repo>/<default-branch>/.well-known/neotoma.json`).
- **Alias (foundation repos):** a `[neotoma]` block in `foundation-config.yaml` MAY mirror the same fields for repos already using the foundation framework. When both are present, `.well-known/neotoma.json` wins; the alias is a convenience, not a second source of truth.
- **Media type:** `application/json`. The file is a single JSON object conforming to the schema below.

## Schema (v1)

```jsonc
{
  // Required. Manifest schema version. Consumers MUST reject a major version
  // they do not understand rather than guessing.
  "version": 1,

  // Required. The repo this manifest governs, in owner/repo form. MUST match the
  // repo the file is served from (the resolver cross-checks this against the
  // GitHub-served path — see Trust model). Guards against a copied manifest
  // claiming to route a different repo.
  "repo": "owner/repo",

  // Required. Where the canonical Neotoma record for issues about this repo
  // should be submitted. This is the maintainer's instance, NOT the reporter's.
  // Doubles as the endpoint advertisement (see Endpoint discovery).
  "peer": {
    // Required. Public base URL of the maintainer's Neotoma API (no trailing
    // slash). The submit / guest-token endpoints are derived from this.
    "url": "https://neotoma.example.com",

    // Required. Thumbprint (RFC 7638 JWK SHA-256) of the peer's public signing
    // key. The resolver pins guest-token exchanges to this key; a peer URL alone
    // is never sufficient to trust the destination. Mirrors
    // peer_config.peer_public_key_thumbprint.
    "public_key_thumbprint": "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs",

    // Optional. Stable peer identifier the maintainer uses for this advertised
    // relationship. When present, the resolver MAY seed a peer_config row with
    // it. Mirrors peer_config.peer_id.
    "peer_id": "acme-neotoma",
  },

  // Required. The acceptance policy the receiving peer declares for guest
  // submissions. The resolver surfaces these to the reporter BEFORE submission
  // so a rejection is predictable; the peer re-enforces them server-side (the
  // manifest is a declaration, not a security boundary — see Trust model).
  "policy": {
    // Required. Visibility levels this peer accepts from guest reporters.
    // Subset of ["public", "private"]. A reporter requesting a visibility not
    // listed gets the rejection-fallback path (store-local-as-draft, M4).
    "accepted_visibilities": ["public"],

    // Required. Reporter attestations the peer requires on every guest issue.
    // Subset of ["reporter_git_sha", "reporter_app_version"]. Mirrors the
    // existing submit_issue reporter-environment requirement.
    "required_attestations": ["reporter_git_sha"],

    // Optional. Advisory rate-limit hint (issues per hour per guest identity).
    // Informational for the reporter's agent; the peer enforces the real limit.
    "rate_limit_per_hour": 20,

    // Optional. When true, the peer routes inbound guest issues through a human
    // approval gate before they become visible / forward upstream (M5 — org
    // aggregator pattern). The reporter still gets an accepted-pending result;
    // see "Approval gate" below. Defaults to false.
    "requires_approval": false,
  },

  // Optional. Free-form contact / docs pointer for humans debugging routing.
  "contact": "https://github.com/owner/repo/issues",
}
```

### Field stability

`version`, `repo`, `peer.url`, `peer.public_key_thumbprint`, and `policy.accepted_visibilities` / `policy.required_attestations` are the **stable core**. New optional fields MAY be added under a minor revision without bumping `version`; removing or retypeing a core field requires a `version` bump and a deprecation window, because the manifest is a public contract consumed by installs the maintainer does not control.

## Trust model

Two independent layers; both MUST pass before the resolver routes a canonical record to the declared peer.

1. **The file belongs to the repo (GitHub identity).** The resolver fetches the manifest only from the repo's GitHub-served raw URL for the default branch and confirms (HEAD / 200 from `raw.githubusercontent.com/<owner>/<repo>/...`) that the file is actually served by that repo. A manifest's `repo` field MUST equal the owner/repo it was served from; a mismatch is rejected. This binds the manifest to the repo's existing GitHub ownership — no new identity system.

2. **The peer is who the manifest says (key pinning).** The declared `peer.public_key_thumbprint` pins the subsequent guest-token exchange and signed submission to that key (the same `peer_public_key_thumbprint` mechanism `peer_sync` already uses for AAuth-signed peers). A peer URL that cannot prove possession of the pinned key is rejected, so an attacker who only controls DNS / a tunnel for `peer.url` cannot impersonate the maintainer's instance.

The manifest is a **declaration, not a security boundary.** `policy` lets the reporter predict acceptance, but the receiving peer re-enforces every policy field server-side (visibility, attestations, rate limit, approval) — a forged or stale manifest cannot widen what the peer actually accepts. SSRF protections from `peer_sync` apply unchanged: when the receiving peer runs with `NEOTOMA_HOSTED_MODE=1`, private / loopback / link-local `peer.url` hosts are rejected ([`peer_sync.md`](peer_sync.md), [`docs/security/threat_model.md`](../security/threat_model.md)).

## Endpoint discovery

The manifest is also the canonical **endpoint advertisement**, not only an issue-routing target. Today a fresh consumer install has no default remote endpoint — client base-URL resolution falls back to `http://localhost:3080` (`src/cli/config.ts`), so every partner hand-sets `NEOTOMA_BASE_URL` out of band and silently breaks when a tunnel URL rotates. `peer.url` _is_ the answer to "where is the maintainer's instance," so a consumer that has resolved a repo's manifest also knows its endpoint without separate configuration. M2 SHOULD expose the resolved `peer.url` to the client base-URL resolver as a discovered (lowest-precedence) default, below any explicit `NEOTOMA_BASE_URL`.

## Approval gate (M5 — designed-in, not shipped here)

`policy.requires_approval` is the manifest hook for the org-aggregator pattern: tenant instances → an org-level aggregator (single point of contact, where permissions live) → a human approves a batch → only approved issues forward upstream. When a peer advertises `requires_approval: true`:

- An inbound guest issue is accepted as `pending` (the reporter receives an accepted-pending result + guest token for status read-back, not a rejection).
- The peer creates an approval record (`approval_request` entity, `decision: pending | approved | rejected`) reviewable in Inspector / CLI in bulk.
- Only `approved` issues are tagged for forward to the maintainer; rejected ones stay local.
- The PII redaction guard is re-run on the forward leg (it currently covers public issues only).

This is intentionally a separate milestone (M5) so it does not block M2/M3, but the `requires_approval` field is specified now so the wire format anticipates it and early adopters do not have to migrate the manifest later.

## Rejection fallback (M4)

When the resolver cannot route — no manifest published, trust check fails, visibility refused, or rate-limited — the reporter's agent stores the issue locally as a draft (`sync_pending=true`) and surfaces the rejection for retry. It does NOT fall back to the reporter's own configured repo (that reintroduces the misrouting this layer removes) and does NOT hard-fail and discard the captured context. The issue exists as truth in the reporter's instance regardless of target acceptance, consistent with the immutable-observation model. See the [#1492](https://github.com/markmhendrickson/neotoma/issues/1492) design issue.

### Resolver outcome → caller behavior

`resolveRepoDiscovery` (`src/services/issues/repo_discovery_resolver.ts`) returns either a `route` or a `{ route: null, reason }`. The M2 consumer (PR 3, the `submitIssue` wiring) maps each outcome as follows. The distinction that matters: **`no_manifest` is the only "the repo opted out of discovery" signal** — every other no-route reason is a _failure to establish trust or shape_, which MUST NOT silently fall through to a different destination.

| Outcome / `reason`                                                             | Meaning                                                          | Caller behavior                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route` returned                                                               | Manifest published, trust check passed                           | Route the canonical record to `route.peer.url`, pinning `route.peer.public_key_thumbprint`; namespace identity to `effective_repo`.                                                                                   |
| `no_manifest`                                                                  | Repo published no manifest (404)                                 | Fall through to the operator's configured default (existing pre-M2 behavior). The repo simply has not opted in.                                                                                                       |
| `repo_mismatch`                                                                | Manifest claims a different repo than it was served from (spoof) | Treat as untrusted: **do not route to the declared peer.** Store-local-as-draft (M4) and surface; do NOT fall through to the operator default (a forged manifest must not silently downgrade to "send it somewhere"). |
| `peer_url_private_host`                                                        | Declared peer URL is private/loopback under hosted mode (SSRF)   | Same as `repo_mismatch` — untrusted, store-local-as-draft, surface.                                                                                                                                                   |
| `peer_url_invalid` / `schema_invalid` / `invalid_json` / `unsupported_version` | Manifest is published but malformed or unintelligible            | Store-local-as-draft and surface a "target repo published an unreadable manifest" message; do NOT fall through (the maintainer intended to declare routing — failing open hides their misconfiguration).              |
| `fetch_error`                                                                  | Transient network / non-404 HTTP error reaching GitHub           | Retryable: store-local-as-draft with `sync_pending=true` and surface for retry; do NOT fall through (a transient fetch failure is not "no manifest").                                                                 |

The receiving peer re-enforces `policy` (visibility, attestations, rate limit, approval) server-side, so a `route` returned by the resolver is a _candidate_ — a peer-side policy rejection is a distinct, later signal that also lands in the M4 fallback.

## Milestone sequence

- **M1 — `target_repo` (shipped, #946):** per-call GitHub mirror override. The tactical bridge until discovery ships.
- **M2 — discovery resolver (this spec):** read `.well-known/neotoma.json` for a target repo, run the trust check, route the canonical record to the declared peer, expose `peer.url` as a discovered endpoint default.
- **M3 — guest-policy acceptance:** the receiving peer accepts the guest submission under its declared `policy` (visibility, attestations, rate limit), reusing the existing `guest_access_token` round-trip.
- **M4 — rejection fallback:** store-local-as-draft + surfaced retry, end to end.
- **M5 — approval gate:** the `requires_approval` org-aggregator flow above.

## Related documents

- [`issues.md`](issues.md) — issue subsystem, `submit_issue` two-leg flow, `target_repo` (M1).
- [`peer_sync.md`](peer_sync.md) — `peer_config`, `peer_public_key_thumbprint`, `NEOTOMA_HOSTED_MODE` SSRF guard, `guest_access_token` exchange this builds on.
- [`docs/security/threat_model.md`](../security/threat_model.md) — proxy-trust / SSRF / loopback protections that apply to `peer.url`.
- [#1492](https://github.com/markmhendrickson/neotoma/issues/1492) — the parent design issue and the cross-maintainer driver that activated M2/M3.
