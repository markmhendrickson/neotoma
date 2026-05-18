---
title: Agent Swarm Testing Plan for Neotoma
summary: "**Entity ID:** `ent_9efa843ca2d67d04b6cbbbb0` **Status:** planning **Last observation:** 2026-05-13T12:54:24.154Z"
---

# Agent Swarm Testing Plan for Neotoma

**Entity ID:** `ent_9efa843ca2d67d04b6cbbbb0`  
**Status:** planning  
**Last observation:** 2026-05-13T12:54:24.154Z

Strategy for using paid agent networks (AIBTC, Sokosumi/Masumi, OpenClaw) to stress-test the Neotoma release line, surface real bugs, and reach ICP-aligned operators — without manufacturing social proof or compromising feedback integrity.

## Phase

Phase 0 (repo prep) not yet started

## Target release

v0.12.x

## Strategic principles

Payment buys the test, nothing else. Critical feedback is the highest-signal output. Optional asks come after payment, not as conditions. Test design maps to real network workloads. Transparency about installs respects the operator.

## Networks

AIBTC (primary — strongest ICP fit, cheapest per-message, highest cultural alignment); Sokosumi/Masumi (professional agent-builders, $10-50/task, production-load feedback on Kodosumi); OpenClaw (skills ecosystem, ship Neotoma skill + ClawQuests bounty). Skip: The Colony, Moltbook, Openwork.bot, generic bounty boards.

## Deliverables

Tier 1: Issues via submit_issue (standard/determinism-failure/contract-failure tiers, proactive reporting mode, dedup-before-filing required). Tier 2: PRs in narrow surfaces only (new skills, doc fixes, example integrations — nothing touching entity resolution/observation writes/schema/sync/provenance). Tier 3: Structured experience report (surprise, weakness, retention, next wants, open field).

## Not paid for

GitHub stars, forks-without-content, testimonials, social media posts of any kind.

## Proof of run

For public issues: guest_access_token from submit_issue readable via get_issue_status on operator instance. For private issues: local entity_id plus enough reproduction detail to replay.

## Issue pricing

Standard issue (clear reproduction, single defect): base rate. Determinism failure (same input → different entity IDs across runs, schema constraint violations, provenance gaps): premium. Contract failure (documented behavior doesn't work): premium. add_issue_message on existing open issues: half standard rate when materially advancing triage.

## Reproducibility clause

Run the task more than once. Compare results between runs. The single highest-signal bug you can file is 'same input produced different entity IDs / observations / state across runs.'

## AIBTC scenarios

A: DeFi position tracking across cycles. B: Beat reporting/signal filing. C: Multi-agent shared state. D: Clarity contract audit trail. E: Bounty hunting/project coordination. F: Vouch/identity graph storage.

## Sokosumi scenarios

G: Research agent memory persistence on Kodosumi. H: UX research synthesis across sessions. I: Competitive analysis across sessions.

## OpenClaw scenarios

J: Ship Neotoma OpenClaw skill, post ClawQuests bounty.

## AIBTC brief notes

Lead with side-channel install honesty. Price issue tiers in sats. Brief as public URL. Proof-of-run required. Reputation filter: prior beats / Genesis level / vouching history.

## Sokosumi brief notes

Pitch as developer-product integration test. Professional time pricing ($10-50/task minimum). Frame as production-load feedback on Kodosumi. Welcome public writing explicitly.

## OpenClaw brief notes

Ship the skill first. Bounty on ClawQuests is discovery mechanism, not economic engine.

## Security & transparency

Every brief opens with: what gets installed and where; Neotoma is local-first, MIT-licensed, fully open source; all data stays on operator's machine; how to uninstall completely; link to the repo.

## Phase sequence

Phase 0: Repo prep. Phase 1: AIBTC pilot (5-10 agents, few thousand sats). Phase 2: Iterate the brief. Phase 3: Sokosumi outreach. Phase 4: OpenClaw skill release. Phase 5: Synthesis.

## Success criteria

15-25 real issues filed, at least 3-5 determinism or contract failures. At least 2 retained operators 2 weeks post-test. At least 1 organic public write-up. Zero stars/forks/testimonials for pay.

## Not wanted

Synthetic engagement. Target: 23 substantive issues, 5 thoughtful operator write-ups (3 critical), 2 operators still running Neotoma a month later.

---
*Mirrored from Neotoma dev — do not edit directly. Re-run `npm run mirror:plans` to refresh.*