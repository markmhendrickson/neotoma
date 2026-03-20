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

Each ICP is defined here in compact form for quick reference and routing. Tier 1 ICPs are expanded in the sections below with both structured profiles (bullet fields) and narrative sections covering core incentive, psychological trigger, role transformation, lifestyle improvement, and interaction pattern shift — the layers needed for messaging, content strategy, qualification, and onboarding.

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

Each Tier 1 ICP below includes a structured profile (bullet fields for quick reference) followed by narrative sections (core incentive, psychological trigger, role transformation, lifestyle improvement, interaction pattern shift) that describe the adoption motion — not just who the persona is, but why they would move, what moment triggers the search, what role they're escaping, and what daily work looks like after adoption.

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

### Core incentive

Restoring the ability to iterate on agent state. You can't debug what you can't replay. You can't iterate on what you can't inspect. Non-reproducible runs mean the debugging cycle is log archaeology instead of tight feedback loops — and infrastructure engineers already know that tight cycles are how good systems get built. The incentive is not "state management" — it is feedback loop integrity at the platform layer.

### Psychological trigger

Two runs, same inputs, different state — and no way to diff what changed. This is the moment the infrastructure engineer recognizes they're operating on narrative ("it probably works") rather than evidence. It produces the same feeling as a test suite you can't trust: you know there are failure modes you can't see, and every deployment carries unquantifiable risk.

### Role transformation

**Escaping: Log archaeologist.** A production agent fails or produces wrong output and the debugging process is reconstructing what happened from scattered logs, guessing at state transitions, and hoping to reproduce the issue. The engineer is reverse-engineering truth from artifacts instead of querying it directly. Their observability stack watches everything except the thing that actually matters: what the agent believed and why.

**Into: Platform engineer with replayable state.** Diff any entity between versions. Replay any run to a specific point in time. Trace any output back to the observation that produced it. Debugging becomes querying a timeline, not reading tea leaves. The engineer builds confidence in the system the same way they build confidence in a codebase with good tests — through reproducibility.

### Lifestyle improvement

Less time writing defensive infrastructure — checkpoint logic, state serialization, custom diffing, retry handlers that try to reconstruct what was true before a failure. Less time in war rooms reconstructing state. Post-mortems take thirty minutes because provenance answers "what changed and when" directly. More time designing the platform's actual capabilities. The engineering work becomes more interesting because the boring-but-critical part is no longer hand-rolled every time. The emotional register shifts too: infrastructure engineers carry the weight of reliability, and when the state layer is opaque and non-reproducible, that weight is constant low-level anxiety. When the state layer is replayable and auditable, the anxiety has somewhere to discharge. You can verify. You can prove. You sleep better.

### Interaction pattern shift

The shift is from manual orchestration to declarative trust. The infrastructure engineer stops writing glue — the guarantees they've been hand-rolling become primitives. They declare invariants ("this entity type has these fields, this schema constraint, this merge rule") and the system enforces them. Replays work because state evolution is deterministic by construction, not because someone wrote a careful checkpoint-and-restore pipeline. The observability story shifts from "instrument everything and hope the logs line up" to "query the timeline directly." The team stops treating agent state as a black box and starts treating it like any other part of the stack they can reason about.

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

### Core incentive

Canonical state that doesn't have to be re-derived every session. Retrieval re-infers entity resolution, timelines, and relationships from scratch each time. That works until it doesn't — and when it doesn't, the builder can't trace why the agent got it wrong. The incentive is not "better retrieval" — it is the recognition that retrieval and state are different paradigms, and the builder's agents need the one they don't have.

### Psychological trigger

The agent treats "Acme Corp" and "ACME CORP" as the same entity in one session and different entities in the next. Or: a multi-step pipeline silently drops context between steps and the builder can't reproduce the failure because the state wasn't versioned. This is the moment the builder realizes retrieval is approximating structure, not providing it — and the approximation is non-reproducible. It reframes every prior "it works in demos" experience as survivorship bias.

### Role transformation

**Escaping: Inference babysitter.** The builder ships an agent that works in demos but silently degrades in production because entity resolution, memory, and state management are all re-derived per session by the LLM. When it gets something wrong, the builder can't trace why. When they fix it, the fix doesn't persist. They're debugging probabilistic behavior in a system that should have deterministic state — absorbing the variance their architecture doesn't handle.

**Into: Builder who ships on solid ground.** Entities resolve once and persist. State evolves through versioned, auditable transitions. When something breaks, the builder traces it to a specific observation, not a vague inference. Agents get more reliable as they accumulate more data, instead of more fragile. The builder stops compensating for their memory layer and starts building on top of it.

### Lifestyle improvement

The builder's engineering effort is currently split. Half goes toward the product — capabilities, UX, logic. The other half goes toward working around a memory layer that doesn't hold its shape: prompt engineering to re-inject context, deduplication hacks, retry logic for when the agent forgets. With canonical entities, versioned state, and provenance, new features compound instead of regressing. The roadmap shifts from memory regression fixes to new capabilities. Sprint planning stops allocating a third of capacity to state management workarounds. A customer reports an issue and the builder traces it to a specific observation in thirty seconds. Shipping stops feeling like hoping and starts feeling like deploying. The builder starts trusting their own system enough to build ambitiously on it.

### Interaction pattern shift

The shift is from compensating for memory to building on top of it. The builder adds a capability and it works across sessions because the state it depends on persists. They ship to more users and the entity graph gets richer, not messier, because schema constraints and merge rules handle what used to be manual cleanup. Framework switching no longer means rebuilding state management from scratch — Neotoma is portable via MCP. The builder's relationship with their own product changes from vigilance to momentum: less time watching for regressions, more time extending what works.

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

### Core incentive

Escape from experienced dependency. Not ideological sovereignty — the concrete daily cost of provider-bound memory that drifts, loses corrections, and can't follow you across tools. Every session that starts from scratch is time spent re-explaining what the system should already know. The incentive is not "better memory" — it is reclaiming the attention currently consumed by compensating for the absence of persistent state.

### Psychological trigger

The moment you get a different answer to the same question across sessions and realize there's no way to tell which one was right. Or: the moment a correction you made last week has silently reverted because the provider compressed or discarded it. This is not a feature request. It is a trust collapse. Once experienced, it reframes every subsequent interaction with the tool as unreliable until proven otherwise.

### Role transformation

**Escaping: Context janitor.** Every session, the operator re-explains their projects, preferences, contacts, and commitments to a tool that should already know. They are the human sync layer between Claude, Cursor, and ChatGPT — manually carrying context that the system keeps dropping. Their job becomes maintaining the agent's memory instead of doing their actual work.

**Into: Operator with continuity.** The agent accumulates what it learns. Corrections hold. Tool switches preserve context. The operator's role shifts from re-establishing context to acting on it — the difference between setting up the workspace every morning and walking in and starting.

### Lifestyle improvement

The daily texture changes: less typing, fewer prompts, shorter sessions that accomplish more. The cognitive load of remembering what each tool knows and doesn't know disappears. The low-grade anxiety of not trusting that the agent actually saved what you told it resolves. You stop thinking about whether the system remembers and start thinking about what you're actually trying to do. You get back the part of your attention that was being spent on babysitting.

### Interaction pattern shift

Without persistent state, the operator must be the driver on every turn. Every prompt carries the full weight of what came before because the system won't hold it. With a persistent state layer, the interaction pattern shifts from turn-by-turn prompting to review-and-steer. The agent arrives at each session already knowing what it knew last time. The operator's role moves from composing detailed instructions to reviewing what the agent already knows and course-correcting when it's off. This is the shift from operating a tool to leading a team member who remembers last week's conversation. Less driving, more steering.

---

## Tier 1: Cross-Cutting Analysis

### Why Tier 1

- Highest alignment with the developer release: deterministic state, MCP/CLI/API interfaces, local-first architecture
- These ICPs validate the core invariants: state evolution, versioning, replayability, schema constraints
- They generate high-signal feedback on infrastructure-grade concerns (reliability, reproducibility, debuggability)
- Operators provide activation volume; builders and infra engineers provide depth of integration feedback

### Common thread

Each Tier 1 ICP is currently spending a significant portion of their effort, attention, and emotional energy compensating for the absence of reliable state. The operator compensates by re-prompting. The infrastructure engineer compensates by writing glue. The builder compensates by engineering around memory regressions.

In each case, Neotoma does not add a capability — it removes the tax. What each ICP gets back is the time, attention, and confidence that the tax was consuming.

This framing — removing the tax, not adding a feature — should be the through-line in all messaging, onboarding conversations, and qualification interviews. When evaluating a potential user, the diagnostic question is: "What are you currently doing to compensate for unreliable agent state?" If the answer is substantial, they are ICP-qualified. If they don't compensate because they don't feel the pain, they are not the current target.

#### Tax summary

| ICP | Tax they pay | What they get back |
|-----|-------------|-------------------|
| AI-native Operators | Re-prompting, context re-establishment, manual cross-tool sync | Attention, continuity, trust in their tools |
| AI Infrastructure Engineers | Writing glue (checkpoint logic, custom diffing, state serialization) | Debugging speed, platform design time, sleep |
| Agent System Builders | Prompt engineering workarounds, dedup hacks, memory regression fixes | Product velocity, shipping confidence, roadmap ambition |

### Role transformation summary

| ICP | Escaping | Into | Interaction pattern shift |
|-----|----------|------|--------------------------|
| AI-native Operators | Context janitor — human sync layer between tools | Operator with continuity — steering, not driving | Turn-by-turn prompting → review-and-steer |
| AI Infrastructure Engineers | Log archaeologist — reverse-engineering truth from logs | Platform engineer with replayable state | Manual orchestration → declarative trust |
| Agent System Builders | Inference babysitter — absorbing variance the architecture doesn't handle | Builder who ships on solid ground | Compensating for memory → building on top of it |

### ICP ecosystem: how Tier 1 personas feed each other

The three Tier 1 ICPs are not independent segments — they form an adoption ecosystem with reinforcing dynamics:

- **Operators → Builders:** Operators who adopt Neotoma for personal workflows become vocal advocates in tool communities. When an operator joins or leads a team building agent products, they pull Neotoma into the builder's stack. The operator's personal experience ("context actually persists") becomes the builder's evaluation shortcut.

- **Builders → Infrastructure Engineers:** Builders who integrate Neotoma as their memory backend surface the guarantees (determinism, replayability, schema constraints) in their own architecture discussions. When the builder's infrastructure team asks "how does your agent manage state?", the answer points to Neotoma. The builder's integration creates the infrastructure engineer's evaluation trigger.

- **Infrastructure Engineers → Toolchain Integrators (Tier 2):** When infrastructure engineers standardize on Neotoma and reference its guarantees in their documentation, framework maintainers see adoption signal. The infrastructure engineer's recommendation creates the toolchain integrator's evaluation context.

- **Aggregate effect:** Operators provide activation volume and community presence. Builders provide integration depth and production validation. Infrastructure engineers provide standardization signal and guarantee validation. Each layer feeds the next tier's adoption motion.

### ICP qualification diagnostic

The single question that qualifies across all three Tier 1 ICPs:

> "What are you currently doing to compensate for unreliable or missing agent state?"

**Strong ICP signals in the answer:**
- Describes re-prompting, context re-establishment, or manual sync across tools (→ Operator)
- Describes writing checkpoint logic, custom state serialization, or manual log reconstruction (→ Infrastructure)
- Describes prompt engineering workarounds, entity deduplication, or memory regression debugging (→ Builder)
- Expresses frustration with non-reproducible agent behavior
- Names specific tools where state is lost between sessions
- Describes engineering time spent on state management they wish were handled

**Weak ICP signals:**
- "AI remembering things" without concern for determinism or reproducibility
- No agent workflows in their stack
- Satisfied with platform memory (Claude memory, ChatGPT memory)
- Looking for a note-taking or PKM tool
- No debugging, tracing, or compliance needs

**Routing follow-up:** Once qualified and routed to a specific ICP, the next question deepens qualification and confirms the pain is active:

- **Operator →** "Which tools are you moving between, and where does context break when you switch?"
- **Infrastructure →** "When a production agent produces wrong output, what does your debugging process look like today?"
- **Builder →** "When your agent gets entity resolution or memory wrong, how do you trace and fix it?"

### Objection-to-framing map

Common objections mapped to the framing layers (core incentive, role transformation, tax removal) rather than feature comparison:

**AI Infrastructure Engineers**

- *"We already have event sourcing / custom state management"* → Does your current system close the feedback loop on agent state? Can you diff entities between runs and replay to a specific point? If debugging is still log archaeology, you have state management but not feedback loop integrity. (Core incentive: feedback loop integrity)
- *"Not production-ready"* → The dev release fits the evaluation motion infrastructure engineers already follow: validate guarantees locally, then propose for staging. Local npm + SQLite is the right shape for this evaluation.

**Agent System Builders**

- *"How is this different from RAG memory?"* → RAG re-derives structure every session. Neotoma persists it. If "Acme Corp" and "ACME CORP" resolve differently across sessions, your memory layer is approximating entities, not holding canonical state. (Core incentive: canonical state, not re-derived)
- *"We use LangChain/LangGraph memory"* → Can you trace a wrong answer to a specific observation? Can you replay to last Tuesday? If not, you're absorbing the variance your memory layer doesn't handle — the inference babysitter role. (Role transformation: inference babysitter → builder on solid ground)

**AI-native Operators**

- *"Platform memory (Claude, ChatGPT) is good enough"* → Does it follow you across tools? Can you verify a correction from last week is still held? If you're re-explaining context every session, you're paying the context-janitor tax. Platform memory is tool-specific and non-auditable. (Tax framing: attention tax)
- *"Another tool to manage"* → Runs as an MCP server behind your existing tools — no new UI, no new workflow. The question is whether you want to keep being the human sync layer between Claude, Cursor, and ChatGPT, or let a state layer do it. (Role transformation: context janitor → operator with continuity)

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
- `docs/specs/ICP_PROFILES.md` (for detailed ICP profiles)

### Constraints Agents Must Enforce

1. Developer release MUST directly serve Tier 1 ICPs (AI Infrastructure Engineers, Agent System Builders, AI-native Operators)
2. Tier 2 features require API stability milestones beyond initial developer release
3. Tier 3 features (GUI, simplified onboarding, multi-user) are explicitly post-dev-release
4. Tier 4+ ICPs require Agentic Portfolio/Wallet layers (not developer-release scope)
5. All product decisions must align with tier prioritization
6. Language must use infrastructure/guarantees framing (deterministic, versioned, replayable, auditable, schema-bound) — not "AI memory tool"
7. Messaging must lead with felt experience and role transformation, then ground in infrastructure/guarantees vocabulary (per constraint 6) — not the reverse
8. The "removing the tax" framing takes priority over "adding a feature" framing in all GTM and onboarding content
9. Qualification conversations should use the diagnostic question: "What are you currently doing to compensate for unreliable agent state?"
10. Each ICP's interaction pattern shift (driving→steering, glue→invariants, compensating→compounding) should be referenced in onboarding and activation materials

### Validation Checklist

- [ ] Feature serves Tier 1 ICPs (developer release requirement)
- [ ] Tier 2+ features clearly marked as post-initial-dev-release
- [ ] Strategy/Execution layer features correctly attributed to Agentic Portfolio/Wallet
- [ ] GTM roadmap follows tier progression
- [ ] Messaging uses state integrity vocabulary, not consumer memory framing
- [ ] ICP messaging includes role transformation (escaping → into)
- [ ] ICP messaging includes interaction pattern shift, not just data layer improvement
- [ ] Qualification criteria reference the diagnostic question and tax framework
- [ ] Content leads with felt experience before architectural description
