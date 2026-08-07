# Adversarial security practices (post-2026-08-07 probe)

This document turns the lessons of the 2026-08-07 authorized probe into standing
process. The probe surfaced two critical vulnerabilities
([forged Ed25519 key auth bypass](advisories/2026-08-07-ed25519-bearer-forged-key-auth-bypass.md),
[sort_by SQL injection](advisories/2026-08-07-sort-by-order-by-sql-injection.md))
in a codebase that **already had** a threat model, a five-gate release pipeline,
an auth-topology matrix, a tenant-isolation matrix, semgrep rules, and two prior
advisories for these exact bug classes. The gates existed; they tested the wrong
space.

Three root observations drive the practices below:

1. **The gates tested the negative space too narrowly.** The auth matrix asserted
   that *absent* and *malformed* credentials are rejected. It never tested a
   *well-formed-but-unauthorized* credential — a syntactically valid key that
   isn't yours. Auth bypasses live in the gap between "no key" and "wrong key."

2. **Fail-open was the shared shape of both bugs.** The forged-key path accepted
   any 32-byte key and verified the signature only *if present*; the SQLi path
   returned an unrecognised column *unchanged*. Both made the happy path work and
   left the security-defining branch permissive.

3. **AI review of AI code shares blind spots with AI generation.** The same model
   that writes `if (signature)` as an optional check reads it and sees nothing
   wrong. Review-by-construction is correlated with generation-by-construction;
   only **adversarial-by-construction** breaks the correlation. The probe found
   what the standing review did not because it was *pointed at breaking the
   system*, not at checking it.

---

## Practice 1 — Negative-space tests are a gate requirement (extends G3)

For every authentication or input boundary, the test suite MUST include the
**well-formed-but-unauthorized** case, not only the absent/malformed case.

Concrete additions to the G3 auth topology matrix
(`tests/security/auth_topology_matrix.test.ts` and the dedicated
`tests/security/ed25519_forged_key_auth_bypass.test.ts`):

| Case | Input | Required outcome |
|------|-------|------------------|
| Forged well-formed credential | A syntactically valid but unprovisioned credential (e.g. a random 32-byte Ed25519 key, base64url) | 401/403 on every protected route |
| Credential + identity override | The forged credential PLUS a caller-supplied `user_id` (incl. the nil-UUID `LOCAL_DEV_USER_ID`) | 401/403 — never the caller-chosen scope |
| Valid-shape, missing proof | A credential whose *possession proof* (signature) is omitted | 401/403 — the proof must be mandatory, not optional |
| Cross-identity pivot | A validly-authenticated principal requesting another user's `user_id` | 403, except the explicitly-scoped local-dev override |

Rule of thumb encoded here: *a security test that only checks "no credential is
rejected" has tested that the door is closed, not that the lock works.* Any new
auth path or query-identifier path ships with its well-formed-but-unauthorized
row or it does not ship.

## Practice 2 — Fail-closed is a named review lane

Every security-sensitive review (G4, and any pre-merge review of a diff G1 flags)
MUST run an explicit **fail-closed lane** whose sole mandate is: *find the path
that fails open.* This is a distinct cognitive task from "review for bugs" and is
the specific antidote to the AI-correlation problem — it names an adversarial
target rather than asking for general vigilance.

The lane's checklist:

- Every auth branch: does an unresolved/unverified principal reach a protected
  action, or fall through to a permissive default?
- Every query/SQL construction: does an unrecognised or malformed input get
  interpolated (fail-open) rather than rejected (fail-closed)?
- Every validator/normaliser: on the no-match branch, does it `return input`
  (fail-open) or `throw`/reject (fail-closed)?
- Every "optional" security check (`if (signature)`, `if (token)`): is the
  optionality itself the bug — should absence be a rejection?

A diff that G1 classifies as security-sensitive is not approved until the
fail-closed lane has run and reported (findings or an explicit "no fail-open path
found"). When the review is run as a swarm, this is one reviewer's entire lane —
see `docs/security/adversarial_review_workflow.md` (the workflow used on the
2026-08-07 hotfix, which confirmed the fixes and surfaced two symmetry gaps a
single reviewer missed).

## Practice 3 — Adversarial probe as a deploy gate (the local→cloud transition)

The highest-risk event in this product's life so far was moving an instance
holding real data from local-loopback to a public host. The loopback trust model
is a *reasonable local default*; on a public host it is a categorically different
threat model. That transition MUST be gated on an adversarial probe passing —
not on the model's judgment that the code looks fine.

**Gate rule:** a deployment that exposes an instance holding real personal or
client data to a public network is blocked until an adversarial probe passes
against it. Pre-1.0 status buys latitude on incomplete features and missing
hardening; it does **not** buy latitude on an unauthenticated data-exposure hole.
For a product whose value proposition is being a trustworthy store of personal
truth, an auth bypass violates the core promise, not a peripheral one.

The probe reuses the existing G5 harness (`scripts/security/deployed_probes.sh`)
but with an **adversarial mandate** distinct from G5's current manifest-conformance
mandate. Minimum probe battery (all must pass = rejected/handled):

- Unauthenticated read/write on every protected REST route → 401.
- Forged well-formed credential (+ nil-UUID override) on every route → 401/403.
- Injection payloads into every parameter that could reach a SQL identifier or
  ORDER BY position (`sort_by`, `snapshot_filters` keys, resource-URI `sort`) →
  rejected, no raw SQL error.
- SSRF payloads into any URL-accepting field (webhook, peer) → rejected.
- `user_id`-override pivot as any principal → 403.

The probe runs against the target host before it accepts public traffic, and on
every subsequent release (G5 cadence). The 2026-08-07 probe was run on operator
intuition *after* the cloud move; this gate makes it a precondition *of* the move
and of every deploy after.

---

## Why these three, specifically

They map one-to-one onto how the two criticals were missed and why AI review
didn't catch them:

- Practice 1 would have caught the forged-key bypass at test time (the
  well-formed-but-unauthorized row fails on the pre-fix code — verified).
- Practice 2 names the fail-open shape both bugs shared, as an explicit review
  target that resists the generation/review correlation.
- Practice 3 attaches the adversarial check to the exact moment the threat model
  changed (local→cloud), rather than leaving it to intuition.

None required security expertise the team lacked. Each required *pointing the
existing apparatus at breaking the system* rather than at confirming it works.
