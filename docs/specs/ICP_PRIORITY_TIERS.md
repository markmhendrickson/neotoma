# Neotoma ICP Priority Tiers (Developer Release)

## Scope

Tiered by alignment with the developer release: a deterministic state layer for long-running agents, distributed as a local npm package with MCP, CLI, and API interfaces.

**For detailed ICP profiles (pain points, use cases, workflows), see [`docs/specs/ICP_PROFILES.md`](./ICP_PROFILES.md).**

## Category Contrast

Neotoma is not retrieval memory. Retrieval memory (RAG, vector DB, LangChain-style) performs context lookup over unstructured documents. Neotoma enforces deterministic state evolution: every state change is versioned, schema-bound, replayable, and auditable. The correct comparison axis is *guarantees*, not *features*.

- Retrieval memory → context lookup
- Deterministic memory → state governance

---

## Definitions

### AI Infrastructure Engineers

- **Build:** Agent runtimes, orchestration frameworks, evaluation harnesses, observability pipelines, state systems
- **Stack position:** Infrastructure layer — below application agents, above compute
- **Pain trigger:** Reliability failure in production workflows; cannot reproduce agent runs; state mutations invisible to debugging
- **Success:** Neotoma adopted as a dependency in their infra stack; state integrity guarantees cited in their documentation
- **Adoption pattern:** Evaluation-first — assess Neotoma as a dependency, then adopt in dev workflows before recommending to downstream builders. The dev release (local npm + SQLite) suits this evaluation motion.

### Agent System Builders

- **Build:** Agents that execute multi-step workflows with tool calling — customer support, code generation, data pipelines, research agents
- **Stack position:** Application layer — above orchestration, consuming infrastructure
- **Pain trigger:** Workflow breaks due to memory inconsistency; drift across sessions; conflicting facts; agents behave differently on identical inputs
- **Success:** Agents ship with Neotoma as the memory layer; state is reproducible across runs; debugging time drops

### AI-native Operators (builder-grade)

- **Build / do:** Heavy daily usage of Claude, Cursor, ChatGPT, and other AI tools with automation habits; build personal workflows, not products for others
- **Stack position:** End of the tool chain — power user, not infrastructure author
- **Pain trigger:** Multi-tool workflow debt becomes intolerable; repeated context-setting across tools; broken handoffs; lost commitments
- **Success:** Cross-tool memory is consistent; context persists across sessions and tools; setup once, query anywhere
- **Boundary vs Agent System Builders:** Operators adopt Neotoma for their own cross-tool workflows. Builders wire it into systems they ship to others. In practice there is significant overlap, but the adoption motion differs.

### Toolchain Integrators

- **Build:** Developer tools, frameworks, and SDKs that other builders adopt — editor plugins, orchestration libraries, deployment platforms
- **Stack position:** Middleware / framework layer — between infrastructure and application builders
- **Pain trigger:** Need to add deterministic state as a dependency for downstream builders; existing memory adapters lack guarantees
- **Success:** Neotoma is a listed integration or recommended memory backend in their framework

### Knowledge Workers (future)

- **Do:** Analysts, researchers, consultants, lawyers managing high document loads; rely on cross-document reasoning and entity resolution
- **Stack position:** End user — no infrastructure or automation expertise assumed
- **Pain trigger:** Information overload; no entity unification; timeline fragmentation
- **Success:** Cross-document queries return unified, time-aware answers
- **Why future:** Adoption blocked by install friction and conceptual complexity. Requires GUI, lower onboarding friction, and simplified mental model not present in the developer release.

---

# TIER 1 — Primary ICPs (Developer Release)

The developer release directly serves these ICPs. They require no multi-user features, no enterprise controls. They experience immediate pain from non-deterministic agent state and are willing to adopt infrastructure-grade tooling.

## AI Infrastructure Engineers

- **Summary:** Engineers building the runtimes and orchestration layers that agents run on. They evaluate Neotoma as a dependency that provides state integrity guarantees their own systems lack.
- **Who they are:** Platform engineers, infra leads, ML engineers working on agent reliability and observability
- **What they build:** Agent runtimes, orchestration frameworks, evaluation harnesses, observability pipelines, state management systems
- **Where they sit in the stack:** Infrastructure layer — below application agents, above compute
- **Current pain:** Cannot reproduce agent runs; state mutations are invisible; debugging production failures requires manual log archaeology; no provenance trail for state changes
- **Adoption trigger:** Reliability failure in production workflows — an agent produces different results on identical inputs and no one can explain why
- **Why Neotoma:** Deterministic state evolution, versioned history, replayable timeline, and schema constraints provide the guarantees missing from ad-hoc state management. Append-only observation log enables full state reconstruction.
- **Comparison set:** Event sourcing frameworks, state machines, append-only logs, audit trail systems, provenance databases
- **How to reach them:** Infrastructure and AI engineering communities (GitHub, Hacker News); agent framework Discord servers; conference talks on agent reliability; blog posts on state integrity patterns
- **Success signals:** Evaluate Neotoma against their current state management; file issues about API surface; integrate into development or staging environments; reference Neotoma guarantees in their own docs

## Agent System Builders

- **Summary:** Builders shipping agents that execute multi-step workflows with tool calling. They wire Neotoma into systems they deliver to others and need memory that does not drift or conflict.
- **Who they are:** Developers building customer support agents, code generation pipelines, research agents, data processing workflows, AI-powered SaaS features
- **What they build:** Multi-step agents with tool calling, long-running workflows, agent-to-agent handoffs
- **Where they sit in the stack:** Application layer — above orchestration, consuming infrastructure
- **Current pain:** Drift across sessions; conflicting facts across tool boundaries; agents behave inconsistently at scale; no way to replay a failed run to find the root cause
- **Adoption trigger:** Workflow breaks due to memory inconsistency — an agent contradicts its own prior output, or a multi-step pipeline silently drops context between steps
- **Why Neotoma:** Schema-bound entities prevent garbage-in-garbage-out across agents. Versioned history enables debugging. Replayable timeline allows reproducing any past state. Deterministic state evolution means identical inputs produce identical state.
- **Comparison set:** RAG memory (Mem0, Zep), LangChain/LangGraph memory, file-based memory (Markdown/JSON), vector DB memory
- **How to reach them:** AI/ML developer communities (GitHub, Reddit r/LocalLLaMA, r/MachineLearning); agent framework ecosystems (LangChain, CrewAI, AutoGen communities); MCP server directories; developer content on agent architecture
- **Success signals:** Install Neotoma as their agent's memory layer; report reduced debugging time; contribute bug reports about MCP/API edge cases; build integrations or adapters

## AI-native Operators (builder-grade)

- **Summary:** Power users of Claude, Cursor, ChatGPT and other AI tools who have automation habits and feel the memory gap across every tool switch. They adopt Neotoma for their own workflows, not for systems they ship.
- **Who they are:** Developers, technical founders, AI-heavy knowledge workers who use 3+ AI tools daily and have built personal automation (scripts, MCP configs, custom prompts)
- **What they do:** Research synthesis across tools, project continuity across sessions, cross-tool context management, personal workflow automation
- **Where they sit in the stack:** End of the tool chain — power user with technical fluency, not infrastructure author
- **Current pain:** Context fragmentation across tools; repeated explanations every session; broken handoffs between Claude and Cursor; lost commitments and decisions from prior conversations
- **Adoption trigger:** Multi-tool workflow debt becomes intolerable — re-explaining the same project context to Claude for the fifth time this week, or losing a critical decision made in a ChatGPT session three days ago
- **Why Neotoma:** Single memory layer that persists across all MCP-compatible tools. Facts stored once are available everywhere. Versioned history means nothing is silently lost. Schema constraints prevent contradictory state.
- **Comparison set:** Platform memory (Claude memory, ChatGPT memory), notes and PKM tools (Obsidian, Notion), manual context management (copy-pasting between tools)
- **How to reach them:** AI tool communities (Reddit r/ChatGPT, r/ClaudeAI, r/Cursor, Discord servers); developer communities (Hacker News, Indie Hackers); AI productivity content; MCP server directories
- **Success signals:** Install and configure MCP server; use across 2+ tools daily; report that context persists where it previously did not; become vocal advocates in tool communities

### Why Tier 1

- Highest alignment with the developer release: deterministic state, MCP/CLI/API interfaces, local-first architecture
- These ICPs validate the core invariants: state evolution, versioning, replayability, schema constraints
- They generate high-signal feedback on infrastructure-grade concerns (reliability, reproducibility, debuggability)
- Operators provide activation volume; builders and infra engineers provide depth of integration feedback

---

# TIER 2 — Secondary ICPs (Adjacent / Later in Dev Release)

## Toolchain Integrators

- **Summary:** Framework and devtool authors who would add Neotoma as a recommended or default memory backend for downstream builders.
- **Who they are:** Maintainers of agent frameworks, orchestration libraries, editor plugins, deployment platforms
- **What they build:** Developer tools, SDKs, and frameworks consumed by Agent System Builders and AI Infrastructure Engineers
- **Where they sit in the stack:** Middleware / framework layer — between infrastructure and application builders
- **Current pain:** Existing memory adapters lack state guarantees; downstream builders report drift and inconsistency; no standard for deterministic agent state
- **Adoption trigger:** Need to provide deterministic state as a built-in or recommended dependency for their user base
- **Why Neotoma:** Open-source, MIT-licensed, well-defined API surface. Deterministic guarantees can be documented and passed through to downstream builders.
- **Comparison set:** Memory adapters, plugin ecosystems, state layer abstractions, built-in memory modules in competing frameworks
- **How to reach them:** Direct outreach to framework maintainers; GitHub issues and PRs on agent frameworks; integration guides and examples; conference talks on state integrity
- **Success signals:** Evaluate API stability; request integration docs; list Neotoma as a supported memory backend; co-author integration guides

### Why Tier 2

- Framework authors need more API stability than the developer release initially provides
- Adoption depends on Tier 1 builders validating the API surface first
- High leverage once adopted (one integration reaches many downstream builders) but slower activation cycle

---

# TIER 3 — Future ICPs (Post Developer Release)

These ICPs get value from Neotoma's guarantees but are not aligned with the developer release's distribution model, interface complexity, or feature scope.

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

### Why Tier 3

- Knowledge workers need GUI and lower onboarding friction
- Small teams need permissions, sharing, and governance
- Neither segment validates the core developer-release hypothesis (deterministic state for agents)
- Both are strong candidates for post-dev-release expansion once the interface broadens

---

# Future Product Layers

These tiers represent product-layer roadmap, not developer-release audience targeting. They are preserved from the original tier structure for long-term planning.

## Tier 4 — Strategy Layer (Agentic Portfolio)

Requires later product maturity and asset/tax modeling stack.

- **High-Net-Worth Individuals**
- **Multi-Jurisdiction Residents**
- **Crypto-Native Power Users (staking, LPs, vaults)**
- **Startup Founders with Equity Docs**
- **Family-Office-Lite Users**

High future ACV. Complex requirements (risk, tax, multi-asset planning). Requires a mature state layer + strategy engine.

## Tier 5 — Execution Layer (Agentic Wallet)

Dependent on Agentic Portfolio + chain execution layer.

- **High-Frequency On-Chain Actors**
- **Agent-Compatible Crypto Users**
- **Protocol Explorers**
- **Bitcoin/Stacks Ecosystem Power Users**

Requires on-chain execution, safety systems, transaction simulation. High regulatory and technical burden.

## Tier 6 — Enterprise AI Deployments

Only when Neotoma supports full org-wide agent orchestration.

- **Mid-market + enterprise teams (200–10,000 employees)**
- **Companies deploying dozens of internal AI agents**
- **Organizations requiring AI governance + auditability**

Highest ACV and long-term potential. Requires advanced permissions, multi-user governance, agent orchestration, and full organizational memory architecture.

---

# Non-goals for the Developer Release

The developer release is **not** targeting:

- **Casual prompt users** — people who use ChatGPT occasionally and do not feel memory pain
- **Note-taking / PKM users** — people looking for Obsidian, Notion, or Roam alternatives
- **Broad productivity audiences** — anyone seeking a general "AI memory tool" rather than a deterministic state layer

## Anti-ICP Signals

These signals indicate someone is not the current target user:

- Looking for a note-taking or personal knowledge management app
- No tool calling or agent workflows in their stack
- No need to debug agent behavior or trace state changes
- Expects zero-setup, no-install onboarding (platform memory is a better fit)
- Wants a broad productivity tool, not infrastructure
- Describes their need as "AI remembering things" without concern for determinism, versioning, or reproducibility

---

# Developer Release Tier Summary

### Tier 1 — Primary (Developer Release)
- AI Infrastructure Engineers
- Agent System Builders
- AI-native Operators (builder-grade)

### Tier 2 — Secondary (Adjacent)
- Toolchain Integrators

### Tier 3 — Future (Post Developer Release)
- Knowledge Workers
- Small Teams (2–20)

### Future Product Layers
- Tier 4: Strategy Layer (Agentic Portfolio)
- Tier 5: Execution Layer (Agentic Wallet)
- Tier 6: Enterprise Deployments

# One-Line GTM Summary

**Start with infrastructure engineers, agent system builders, and builder-grade operators; expand to toolchain integrators; defer knowledge workers and small teams until post-dev release.**

---

## Agent Instructions

### When to Load This Document

Load when:
- Planning GTM strategy or product roadmap for the developer release
- Prioritizing feature development
- Evaluating whether a feature serves Tier 1 ICPs (infrastructure engineers, agent builders, builder-grade operators)
- Deciding between infrastructure-grade and consumer-grade product decisions
- Understanding which ICPs require which product layers (deterministic state vs strategy vs execution)

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always)
- `docs/specs/MVP_OVERVIEW.md` (for MVP scope alignment)
- `docs/specs/ICP_PROFILES.md` (for detailed ICP profiles — note: needs update to add AI Infrastructure Engineers and Toolchain Integrators)

### Constraints Agents Must Enforce

1. Developer release MUST directly serve Tier 1 ICPs (AI Infrastructure Engineers, Agent System Builders, AI-native Operators)
2. Tier 2 features require API stability milestones beyond initial developer release
3. Tier 3 features (GUI, simplified onboarding, multi-user) are explicitly post-dev-release
4. Tier 4+ ICPs require Agentic Portfolio/Wallet layers (not developer-release scope)
5. All product decisions must align with tier prioritization
6. Language must use infrastructure/guarantees framing (deterministic, versioned, replayable, auditable, schema-bound) — not "AI memory tool"

### Validation Checklist

- [ ] Feature serves Tier 1 ICPs (developer release requirement)
- [ ] Tier 2+ features clearly marked as post-initial-dev-release
- [ ] Strategy/Execution layer features correctly attributed to Agentic Portfolio/Wallet
- [ ] GTM roadmap follows tier progression
- [ ] Messaging uses state integrity vocabulary, not consumer memory framing
