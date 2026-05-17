---
title: Future ICPs (Post Developer Release)
summary: "ICPs that get value from Neotoma's guarantees but are not aligned with the developer release's distribution model, interface complexity, or feature scope. For the primary ICP, see [`primary_icp.md`](./primary_icp.md). For secondary ICPs,..."
---

# Future ICPs (Post Developer Release)

## Scope

ICPs that get value from Neotoma's guarantees but are not aligned with the developer release's distribution model, interface complexity, or feature scope. For the primary ICP, see [`primary_icp.md`](./primary_icp.md). For secondary ICPs, see [`secondary_icps.md`](./secondary_icps.md).

---

## Knowledge Workers

- **Summary:** Analysts, researchers, consultants, and lawyers who manage high document loads and need cross-document reasoning. Real pain, but adoption requires lower friction than the developer release provides.
- **Who they are:** Professionals who process large volumes of documents and need entity unification, timeline reasoning, and structured extraction
- **Current pain:** Information overload; no entity unification across documents; timeline fragmentation; search limitations
- **Adoption trigger:** Discovery that AI tools cannot connect information across their document corpus
- **Why deferred:** Install friction (npm, CLI configuration) and conceptual complexity (deterministic state, schema constraints) create barriers for non-technical users. Requires GUI and simplified onboarding not present in the developer release.

## Small Teams (2–20)

- **Summary:** AI-native founders and small teams who initially adopt individually, then expand to team usage. Compelling future ICP, but requires features not yet in scope.
- **Who they are:** Startup founders, small product teams, agencies with heavy AI tool usage
- **Current pain:** Team knowledge fragmentation; onboarding friction; AI tool inconsistency across team members; decision tracking gaps
- **Adoption trigger:** Individual team member adopts and wants to share memory across the team
- **Why deferred:** Requires permissions, sharing, governance, and multi-user features not in developer-release scope. Individual members may adopt as AI-native Operators; team expansion is a post-dev-release motion.

### Why future

- Knowledge workers need GUI and lower onboarding friction
- Small teams need permissions, sharing, and governance
- Neither segment validates the core developer-release hypothesis (deterministic state for agents)
- Both are strong candidates for post-dev-release expansion once the interface broadens

---

## Future Products

These tiers represent product-roadmap targets — future operational systems Neotoma will support — not developer-release audience targeting. They are preserved from the original tier structure for long-term planning. Each tier names an operational system that builds on Neotoma's state layer; Neotoma itself remains a single state-layer substrate.

### Tier 4 — Strategy Product (Agentic Portfolio)

A reasoning-style operational system for personal financial strategy. Requires later product maturity and asset/tax modeling stack.

- **High-Net-Worth Individuals**
- **Multi-Jurisdiction Residents**
- **Crypto-Native Power Users (staking, LPs, vaults)**
- **Startup Founders with Equity Docs**
- **Family-Office-Lite Users**

High future ACV. Complex requirements (risk, tax, multi-asset planning). Requires a mature state layer plus a reasoning-style operational system that reads truth and outputs Decisions + Commands.

### Tier 5 — Execution Product (Agentic Wallet)

An effect-style operational system for on-chain execution. Dependent on the Strategy Product and a chain-execution adapter set.

- **High-Frequency On-Chain Actors**
- **Agent-Compatible Crypto Users**
- **Protocol Explorers**
- **Bitcoin/Stacks Ecosystem Power Users**

Requires on-chain execution, safety systems, transaction simulation. High regulatory and technical burden.

### Tier 6 — Enterprise AI Deployments

Only when Neotoma supports full org-wide agent orchestration.

- **Mid-market + enterprise teams (200–10,000 employees)**
- **Companies deploying dozens of internal AI agents**
- **Organizations requiring AI governance + auditability**

Highest ACV and long-term potential. Requires advanced permissions, multi-user governance, agent orchestration, and full organizational memory architecture.

---

## Agent Instructions

### When to Load This Document

Load when:
- Planning post-developer-release roadmap
- Evaluating features that require GUI, multi-user, or enterprise capabilities
- Understanding which ICPs require which future products

### Required Co-Loaded Documents

- `docs/icp/primary_icp.md` (for primary ICP context)
- `docs/NEOTOMA_MANIFEST.md` (always)

### Constraints

1. Future ICP features (GUI, simplified onboarding, multi-user) are explicitly post-dev-release
2. Tier 4+ ICPs require Agentic Portfolio/Wallet products (not developer-release scope)
3. Do not prioritize future ICP needs over primary ICP needs during the developer release
