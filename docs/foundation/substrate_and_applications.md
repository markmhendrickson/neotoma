# Substrate and Applications: The Collaboration Boundary

## Why this document exists

[`layered_architecture.md`](layered_architecture.md) defines the **technical** boundary between Neotoma (the State Layer) and the operational layers that read and write through it. This document defines the **collaboration** boundary: what it means, economically and strategically, to build a product on top of Neotoma — what is shared, what stays yours, and why the relationship is intended to be complementary rather than substitutionary.

It exists because a serious adopter — someone building a real product on Neotoma — is right to ask: *if Neotoma is open source with a commercial sponsor, what stops it from absorbing my product, and what of mine leaks upstream if I depend on it?* The honest answer is structural, and it is worth stating in public.

## The substrate is not the application's moat

Neotoma's primitives — append-only observations, deterministic reducers, content-derived identity, provenance, a typed memory graph — are patterns, not patents. They are meant to be adopted widely. An application's defensibility does **not** come from running on Neotoma, any more than a SaaS product's defensibility comes from running on Postgres. We say this plainly because it is the foundation of everything below: **if the substrate were the application's moat, depending on it would be a trap.** It is not, so it is not.

An application built on Neotoma keeps its moat where moats actually live:

- **Domain schemas and merge policies** — the entity types, fields, and conflict-resolution rules that encode how *your* domain resolves signal.
- **The data that compounds per customer** — corrections, behavioral signals, relationship strength, interaction history, private annotations. Re-derivable raw data is cheap; the corrected, accumulated layer is not.
- **Ranking, scoring, and judgment logic** — the code in *your* repository that decides what matters.
- **Distribution and product surface.**

Neotoma stores these as inert state. It does not reason about them, rank them, or act on them — that is the State Layer invariant. Your judgment lives in your operational layer; Neotoma holds its artifacts.

## What goes upstream, and what stays yours

The line is the substrate/application boundary, and it is drawable:

| Upstream (public, MIT, every adopter benefits) | Stays with the application (private, never upstream) |
|---|---|
| Tenant isolation, multi-writer concurrency, durable event replay | The domain entity types and merge policies you define in the registry |
| The schema registry, versioning, and enforcement *mechanism* | Ranking, scoring, warmth, intro-path, and judgment logic |
| Deterministic reduction, content-derived identity, provenance | The behavioral data that compounds per customer |
| Graph traversal, indexing, semantic retrieval, entity resolution | Your prompts, agent orchestration, and workflow logic |
| Cryptographic agent attribution (who wrote what) | Product UX, distribution, and go-to-market |
| Read-after-write and consistency contracts | Customer relationships and the proprietary insights derived from them |
| Storage, export, portability, deletion, encryption, cross-instance sync | Your domain's analytics and customer-facing surface |

This is illustrative, not exhaustive. The rule is the test below, not the rows above: **would every adopter on Neotoma want this, regardless of their domain?** If yes, it is substrate and belongs upstream. If it only makes sense in light of one vertical's strategy, it is the application's, and it stays private.

Note the first two rows: the boundary can run *through* a capability, not only between capabilities. The schema **mechanism** — registry, versioning, enforcement — is substrate every adopter shares; the domain **entity types** you define within it are yours. The same split applies elsewhere: shared retrieval primitives, private ranking on top; shared event delivery, private interpretation of what the events mean.

Substrate hardening is plumbing every adopter needs; contributing it upstream costs an adopter nothing and earns a maintained, improving foundation. Vertical IP is the product; it never needs to become a public Neotoma issue, and a requirement framed as "make the substrate do X" should be expressible without disclosing "because *our* product ranks Y by Z."

## Two moats, two layers

It is reasonable to ask: if the substrate is not the application's moat, does Neotoma have one — and is that in tension with telling adopters they are not locked in? It is not a tension once the two moats are named, because they are different kinds of moat at different layers.

- **An application's moat is vertical and owned.** It is the data, ranking, and distribution above — it compounds *per customer* and lives entirely in the application's control.
- **Neotoma's moat is horizontal and structural.** It is not that the patterns are secret — they are deliberately open. It is the combination of architectural commitments that competitors are structurally disinclined to match (determinism, immutability, provenance, cross-platform portability — see [`core_identity.md`](core_identity.md)) and, over time, the position of being the *standard substrate that the most data moats are built on*. That position compounds *across adopters*.

These two moats do not compete; they reinforce. Every data moat built on Neotoma strengthens Neotoma's position as the place to build the next one, and Neotoma's commitment never to move up into the verticals built on it ([`redlines.md`](redlines.md), R13) is what makes building that moat safe. An adopter can fork freely precisely *because* the patterns are open — and that openness is part of why Neotoma's position is defensible, not in spite of it.

Stated plainly: **Neotoma helps applications build a moat it deliberately cannot own.** That is the whole of the collaboration — the substrate succeeds by being the foundation under many durable applications, never by becoming one of them.

## Complementary by design, not by promise

The structure above is enforced, not merely intended:

- **The substrate stays MIT and self-hostable** ([`redlines.md`](redlines.md), R5/R6), so no adopter is ever captive.
- **Postgres-authoritative, Neotoma-as-rebuildable-derived-layer** is a supported posture: an adopter can keep their own system of record and rebuild the Neotoma layer from it, which keeps "depend now, fork later" cheap rather than a one-way door.
- **Governance is committed against unilateral capture** ([`redlines.md`](redlines.md), R12/R16), so the commitments above cannot be quietly relicensed or acquired away.

The intent is collaboration: an application's requirements harden the substrate for everyone, the application keeps everything that makes it defensible, and neither side's roadmap pulls it toward the other's core.

## Related documents

- [`layered_architecture.md`](layered_architecture.md) — the technical State Layer / Operational Layer boundary.
- [`redlines.md`](redlines.md) — the constitutional commitments (licensing, governance, acquisition) that make the above enforceable rather than aspirational.
- [`core_identity.md`](core_identity.md) — what Neotoma is and is not.
