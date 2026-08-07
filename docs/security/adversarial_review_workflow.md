# Adversarial review workflow (Practice 2 implementation)

The fail-closed review lane (Practice 2 in `adversarial_practices.md`) is run as a
verified multi-agent workflow for any diff G1 classifies as security-sensitive.
This document records the shape used on the 2026-08-07 Phase 1 hotfix, which
confirmed both critical fixes and surfaced two symmetry gaps a single reviewer
missed.

## Why a swarm, and why adversarial framing

AI review of AI code shares blind spots with AI generation. A single reviewer —
however careful — reasons from the same priors that wrote the code. The
mitigations that break the correlation are (a) **independence** (multiple agents,
each blind to the others), (b) **adversarial mandate** (each is told to *break*
the fix, not confirm it), and (c) **verification** (each finding is independently
refuted-or-confirmed before it counts, so plausible-but-wrong findings die).

Note on tooling: this uses the generic multi-agent `Workflow`, not the Ateles
swarm. The Ateles swarm (route_task / Cicada / Neotoma-tracked tasks) is the right
home when the instance is up and the work should be tracked as a task entity; the
generic workflow is correct for an ad-hoc local-diff review and is the only option
when the Neotoma instance is offline (e.g. during an incident when it has been
taken down). When Neotoma is available, mirror the review outcome into a task /
finding entity for the audit trail.

## The three lanes

Each reviewer gets the diff, the two fix summaries, and ONE adversarial mandate:

1. **Third-bypass hunt.** Read every branch of the auth middleware; find a bypass
   the fix did *not* close. "The fix patched two locations — find a third."
2. **Sink-completeness sweep.** Find every *other* place user input reaches a SQL
   identifier / ORDER BY / interpolated query text, beyond the sites the fix
   touched. "Did the fix close the class, or just the instances it found?"
3. **Fail-closed regression.** Trace legitimate flows; find one the stricter fix
   now breaks. "Strictness that locks out a real caller is also a defect."

## The verify stage

Every finding a lane produces is handed to an independent agent whose job is to
**refute it** against the real fixed code (CONFIRMED / REFUTED / UNCERTAIN). Only
CONFIRMED findings reach the operator. This is what keeps an adversarial swarm from
drowning the operator in speculative findings.

## Result on the 2026-08-07 hotfix

- Lane 1 (third bypass): **clear** — no reachable bypass beyond the two fixed.
- Lane 2 (sink completeness): two CONFIRMED gaps — three resource-URI ORDER BY
  sinks with no source-level validation, and unimplemented LIMIT/OFFSET clamping.
  Both non-exploitable (guarded by the adapter backstop / upstream Zod) but
  asymmetric; both fixed in the follow-up commit.
- Lane 3 (fail-closed regression): **clear** — the one finding (Ed25519 accept
  branch now inert) was verified not-a-bug (the branch's only production behaviour
  was the bypass; nothing legitimate uses it).

The script is preserved at
`docs/security/workflows/phase1_adversarial_review.js` for reuse; parameterize the
diff path and fix summaries per review.

## When to run it

- Any diff G1 flags as security-sensitive, before merge.
- Any hotfix on a `hotfix/` branch, before tag.
- Not a substitute for the human diff review before push, nor for the live
  adversarial probe (Practice 3) before a public deploy — it reasons over code;
  it does not exercise the running system.
