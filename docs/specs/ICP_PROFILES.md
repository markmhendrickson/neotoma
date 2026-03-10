# Neotoma ICP Profiles
*(Detailed Profiles for All Target User Segments)*

## Scope

This document covers:
- Total addressable market summary (deduplicated across ICPs)
- Detailed profiles for all ICPs across all tiers
- Key visible criteria (observable signals for identifying each ICP)
- Key acquisition channels (how to reach each ICP)
- Estimated worldwide population (market size estimates)
- Pain points and use cases per ICP
- Value propositions and adoption characteristics
- A-ha moments (when users realize the value)
- Ready-to-pay thresholds (when users are willing to pay)
- Key barriers to acquisition, activation, and retention
- Product solutions for each barrier
- Technical requirements and constraints

This document does NOT cover:
- Tier prioritization (see ICP_PRIORITY_TIERS.md)
- GTM strategy (see ICP_PRIORITY_TIERS.md)
- Product roadmap (see MVP_OVERVIEW.md)

## Total Addressable Market Summary

### Tier 1 (Developer Release — Primary) - ~2-7M individuals
- **AI Infrastructure Engineers:** 200K-500K
- **Agent System Builders:** 200K-500K (overlap with AI Infrastructure Engineers ~20-30%)
- **AI-native Operators (builder-grade):** 2-5M (overlap with Agent System Builders ~20-30%)
- **Note:** Significant overlap between Operators and Builders (~20-30% estimated)
- **Deduplicated Tier 1:** ~2-5M individuals

### Tier 2 (Developer Release — Secondary) - ~100K-300K
- **Toolchain Integrators:** 100K-300K (framework/SDK maintainers who would add Neotoma as a dependency)
- **Note:** High overlap with Tier 1 Agent System Builders and AI Infrastructure Engineers (~40-50%)
- **Deduplicated Tier 2:** ~50K-200K individuals

### Tier 3 (Future — Post Developer Release) - ~10-25M individuals
- **Knowledge Workers:** 10-20M
- **Small Teams (2-20):** 500K-1M founders (2-5M potential team users)
- **Note:** Knowledge Workers require GUI and simplified onboarding. Small Teams require multi-user features.
- **Deduplicated Tier 3:** ~10-22M individuals

### Deferred B2B ICPs - ~4-8M users
- **Hybrid Product Teams:** 50K-100K teams (2-5M users)
- **Cross-Functional Ops Teams:** 30K-60K teams (1-2M users)
- **Note:** These ICPs require multi-user features and organizational semantics not in developer-release scope.
- **Deduplicated Deferred B2B:** ~3-6M users

### B2C Power Users (Long-Term) - ~150-300M individuals
- **Cross-Border Solopreneurs:** 5-10M
- **Multi-System Information Workers:** 50-100M
- **High-Entropy Households:** 100-200M
- **Note:** Significant overlap between segments. Requires education and lower friction than developer release provides.
- **Deduplicated B2C:** ~100-150M individuals

### Future Product Layer: Strategy (Agentic Portfolio) - ~4-8M individuals
- **High-Net-Worth Individuals:** 2-5M
- **Multi-Jurisdiction Residents:** 10-20M (overlap with HNW)
- **Crypto-Native Power Users:** 500K-1M
- **Startup Founders with Equity:** 200K-500K
- **Family-Office-Lite:** 1-2M (overlap with HNW)
- **Deduplicated Strategy Layer:** ~3-6M individuals

### Future Product Layer: Execution (Agentic Wallet) - ~400K-900K users
- **High-Frequency On-Chain Actors:** 50K-100K
- **Agent-Compatible Crypto Users:** 100K-200K
- **Protocol Explorers:** 200K-500K
- **Bitcoin/Stacks Power Users:** 50K-100K
- **Deduplicated Execution Layer:** ~300K-600K users

### Future Product Layer: Enterprise - ~17K-35K companies
- **Mid-Market + Enterprise Teams:** 10K-20K companies
- **Companies with Dozens of AI Agents:** 5K-10K companies
- **Organizations Requiring AI Governance:** 2K-5K organizations
- **Deduplicated Enterprise:** ~12K-25K companies

### Developer Release Target Market Summary
- **Developer Release Target (Tier 1, deduplicated):** ~2-5M individuals
- **Developer Release Addressable (with purchasing power, ~70-80%):** ~1.5-4M individuals
- **Key constraint:** Developer release serves infrastructure-adjacent builders, not broad consumer or knowledge-worker audiences
# TIER 1 — Primary ICPs (Developer Release)

These ICPs align directly with Neotoma's developer release: a deterministic state layer distributed as a local npm package with MCP, CLI, and API interfaces. They experience immediate pain from non-deterministic agent state and are willing to adopt infrastructure-grade tooling.

## Tier 1 Key Acquisition Channels Summary

### Community Channels (Highest Priority)
- **Infrastructure and AI engineering communities:** GitHub, Hacker News, AI/ML Discord servers, agent framework communities (LangChain, CrewAI, AutoGen)
- **AI tool communities:** Reddit (r/ChatGPT, r/ClaudeAI, r/Cursor, r/LocalLLaMA), Discord servers for AI tools
- **Developer communities:** Indie Hackers, Product Hunt, Dev.to, Stack Overflow

### Content Marketing
- **Agent architecture content:** Blog posts on state integrity patterns, deterministic memory vs RAG, debugging agent workflows
- **Integration content:** MCP integration tutorials, CLI usage guides, API reference content
- **Comparison content:** "Neotoma vs RAG memory" explainers, memory model guarantee comparisons

### Partnerships & Integrations
- **Agent framework integrations:** LangChain, CrewAI, AutoGen ecosystem listings
- **MCP server directories:** MCP server registries, tool directories
- **AI tool integrations:** Cursor, Claude, ChatGPT integration marketplace listings

### SEO Keywords
- **Infrastructure:** "deterministic agent memory", "agent state management", "memory invariant"
- **Builder:** "MCP memory server", "persistent agent memory", "agent memory backend"
- **Operator:** "AI memory across tools", "persistent AI context", "cross-tool memory"

### Priority Ranking
1. **GitHub + Hacker News** — highest-signal builder communities
2. **Agent framework communities** — direct access to agent system builders
3. **MCP server directories** — direct integration with target tools
4. **AI tool communities** (Reddit, Discord) — reach builder-grade operators
5. **Content marketing** — SEO and thought leadership on state integrity
6. **Product Hunt** — early adopter visibility

## 1. AI Infrastructure Engineers

### Profile
Engineers building the runtimes, orchestration layers, evaluation harnesses, and observability pipelines that agents run on. They evaluate Neotoma as a dependency that provides state integrity guarantees their own systems lack. Adoption is evaluation-first: they assess Neotoma's guarantees, then adopt in development workflows before recommending to downstream builders.

### Key Visible Criteria
- **Job titles:** Platform Engineer, ML Infrastructure Engineer, AI/ML Engineer, Agent Infrastructure Lead, Reliability Engineer
- **Activity signals:** Builds or maintains agent runtimes, orchestration frameworks, evaluation pipelines; posts about agent reliability, state management, observability
- **Tool usage:** Kubernetes, Ray, Temporal, event sourcing frameworks, state machines, observability tools (Datadog, Grafana)
- **Proxy indicators:** GitHub repos with agent infrastructure projects, conference talks on agent reliability, contributions to orchestration frameworks
- **Content consumption:** Engages with infrastructure engineering content, distributed systems content, agent reliability content

### Key Acquisition Channels
- **Developer communities:** GitHub, Hacker News, AI/ML infrastructure Discord servers
- **Content marketing:** Blog posts on agent state management, deterministic memory patterns, state integrity architecture
- **Conferences:** AI infrastructure conferences, MLOps conferences, distributed systems meetups
- **Partnerships:** Agent framework maintainers, MLOps vendors, observability tool integrations
- **SEO:** "agent state management", "deterministic agent memory", "agent observability", "agent reliability" keywords

### Estimated Worldwide Population
**200K-500K** (engineers working on agent infrastructure, MLOps, and agent platform engineering globally)

### Pain Points
- **Cannot reproduce agent runs:** Same inputs produce different outputs; no way to trace why
- **State mutations invisible:** Agent state changes without audit trail; debugging requires manual log archaeology
- **No provenance trail:** Cannot trace agent decisions back to source observations
- **Evaluation is non-deterministic:** Cannot replay agent state to validate behavior changes
- **Infrastructure fragmentation:** Each agent system invents its own state management

### Use Cases
- **State management dependency:** Integrate Neotoma as the state layer in agent runtime infrastructure
- **Evaluation harnesses:** Use replayable timeline for agent evaluation and regression testing
- **Observability pipelines:** Feed Neotoma's versioned history into observability and debugging tools
- **Production debugging:** Replay agent state to reproduce and diagnose production failures

### Workflows
1. **Evaluate guarantees** → Review Neotoma's invariants (determinism, versioning, replayability)
2. **Integrate in dev environment** → Wire Neotoma into agent runtime via MCP or API
3. **Validate reproducibility** → Run agent workflows and verify state is deterministic
4. **Recommend to team** → Propose Neotoma as standard state layer for agent infrastructure

### Value Proposition
- **Deterministic state evolution:** Same observations always produce the same entity state
- **Replayable timeline:** Full state reconstruction from observation log enables debugging and evaluation
- **Schema constraints:** Reject malformed data rather than silently accepting garbage
- **Append-only observation log:** Complete provenance trail for every state change

### A-ha Moment
When they replay an agent's state history from the observation log and can pinpoint exactly which observation introduced a bug — something their current state management makes impossible.

### Ready-to-Pay Threshold
After successfully integrating Neotoma into an agent runtime and demonstrating reproducible state across runs. They've validated the guarantees and are ready to recommend and pay for ongoing usage.

### Adoption Characteristics
- **Activation:** Medium (evaluation-first, need to validate guarantees)
- **Willingness to pay:** High (infrastructure dependency, expense-able)
- **Retention:** Very strong (becomes core infrastructure)
- **Expansion:** Pull Neotoma into team/org through infrastructure standardization

### Pricing Sensitivity & Price Points
- **Current spend:** $100-1000/month on infrastructure tools, monitoring, state management
- **Price sensitivity:** Low (infrastructure expense, values reliability)
- **Acceptable range:** $50-200/month for individual, $500-5000/month for team
- **Value anchor:** Compares to event sourcing tools, state management infrastructure, observability platforms
- **Payment method:** Company credit card, annual contracts, enterprise billing

### Competitive Alternatives
- **Current solutions:** Custom state management, event sourcing frameworks, ad-hoc logging, no unified agent state layer
- **Workarounds:** Building custom state management per agent, manual logging, log archaeology for debugging
- **Why they'd switch:** No current solution provides deterministic agent state with replayability; custom solutions are expensive to maintain
- **Switching barriers:** Low-medium (adopting a dependency, not replacing existing tool)

### Sales Cycle & Decision Process
- **Sales cycle:** 14-60 days (evaluation → integration → validation → adoption)
- **Decision maker:** Tech lead / infrastructure lead (may need manager approval for team adoption)
- **Decision process:** Discover → evaluate guarantees → integrate in dev → validate → propose to team → adopt
- **Touchpoints:** GitHub, Hacker News, infrastructure communities, conference talks
- **Sales model:** Self-serve with developer documentation, evaluation guides

### Key Objections
- **"Not production-ready"** → Open-source, MIT-licensed, deterministic guarantees are testable; dev release is suitable for evaluation and dev-environment integration
- **"API surface stability"** → Versioned MCP protocol, API versioning policy, changelog
- **"Local-only limitation"** → Local-first suits evaluation; hosted deployment planned for later
- **"Integration complexity"** → MCP standard protocol, clear API docs, integration examples
- **"Lock-in concerns"** → MIT license, open-source, append-only log is portable

### Buying Signals
- **Strong signals:** Building agent infrastructure, posts about state management problems, evaluating agent reliability tools
- **Medium signals:** ML/AI infrastructure role, agent framework contributions, observability tool usage
- **Weak signals:** General infrastructure interest, agent development questions

### Expansion Path
- **Individual → Team:** After successful evaluation, proposes as team standard
- **Expansion trigger:** Successful integration in dev environment, reproducibility validation
- **Expansion mechanics:** Team-wide adoption as infrastructure dependency, standardization
- **Expansion timeline:** 1-3 months from evaluation to team adoption

### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't know Neotoma exists; framing as "AI memory" obscures infrastructure value
- **Solution:** Infrastructure-first messaging: "deterministic state layer for agents" with guarantee comparison table
- **Barrier:** Assume they need to build custom state management
- **Solution:** Blog posts comparing custom vs Neotoma state management; open-source evaluation path

**Activation Barriers:**
- **Barrier:** Evaluation overhead (need to validate guarantees before adopting)
- **Solution:** Clear guarantee documentation, evaluation guide, reproducibility tests, integration examples
- **Barrier:** Local-only deployment limits production evaluation
- **Solution:** Local-first suits dev/evaluation; document roadmap for hosted deployment

**Retention Barriers:**
- **Barrier:** API changes break integration
- **Solution:** API versioning, deprecation policy, changelog, backward compatibility
- **Barrier:** Performance at scale concerns
- **Solution:** Performance benchmarks, SQLite optimization, scaling documentation

### Technical Requirements
- Stable MCP and API interface
- Deterministic state guarantees (verifiable)
- Append-only observation log with replay
- Schema validation and constraints
- Local-first deployment for evaluation

## 2. Agent System Builders

### Profile
Developers and teams building agents that execute multi-step workflows with tool calling. They wire Neotoma into systems they ship to others and need memory that does not drift, conflict, or silently mutate. They sit at the application layer, consuming infrastructure.

### Key Visible Criteria
- **Activity signals:** Builds or integrates with CrewAI, LangGraph, AutoGPT, or similar; posts about agent memory, agent orchestration, MCP
- **Job titles:** Software Engineer, AI Engineer, Agent Developer, Full-Stack Developer building agent products
- **Company signals:** Agent-powered SaaS, AI automation companies, agent infrastructure startups
- **Proxy indicators:** GitHub repos with agent/automation/MCP projects, multiple AI agent deployments
- **Content consumption:** Engages with agent architecture content, MCP content, agent memory content, LLM workflow content

### Key Acquisition Channels
- **Developer communities:** GitHub, Hacker News, AI/ML Discord servers, MCP and agent framework communities
- **Content marketing:** Agent memory case studies, deterministic memory content, MCP integration tutorials
- **Partnerships:** Agent framework maintainers (LangChain, CrewAI, AutoGen), AI Ops vendors
- **SEO:** "agent memory", "deterministic memory for agents", "MCP memory backend", "persistent agent state"
- **Conferences:** AI/ML developer conferences, agent architecture meetups

### Estimated Worldwide Population
**200K–500K** (developers building agent systems, multi-step AI workflows, and agent-powered products globally)

### Pain Points
- **Drift across sessions:** Agent memory changes unpredictably between runs
- **Conflicting facts:** Multiple agents or tools write contradictory state; no conflict detection
- **No reproducibility:** Cannot replay a failed run to find root cause
- **Silent mutation:** State changes without audit trail; impossible to know what changed or when
- **Garbage-in-garbage-out:** No schema validation means malformed data propagates across agents

### Use Cases
- **Agent memory backend:** Neotoma as MCP-backed memory for agent frameworks
- **Multi-step workflow state:** Structured memory and versioned history for multi-step agent pipelines
- **Cross-agent coordination:** Shared state substrate for multi-agent systems
- **Debugging and evaluation:** Replay agent state to reproduce bugs and validate behavior changes
- **Provenance and audit:** Trace agent decisions back to source observations

### Workflows
1. **Integrate via MCP** → Wire Neotoma as memory backend for agent framework
2. **Store structured entities** → Agents write observations; Neotoma produces deterministic state
3. **Query across sessions** → Agents retrieve prior state for continuity
4. **Debug failures** → Replay observation log to identify where state diverged

### Value Proposition
- **Deterministic state:** Same input observations always produce the same entity state
- **Schema-bound entities:** Prevent garbage-in-garbage-out across agents
- **Versioned history:** Every state change creates a new version; nothing is silently lost
- **Replayable timeline:** Reconstruct any historical state from the observation log
- **Cross-platform MCP:** One memory layer for any agent or toolchain

### A-ha Moment
When an agent or pipeline queries Neotoma for structured context and gets deterministic, traceable results — enabling reliable multi-step reasoning and auditability that their previous memory solution could not provide.

### Ready-to-Pay Threshold
After integrating Neotoma as memory backend for an agent framework or pipeline and seeing deterministic recall and provenance in production or eval workflows. Debugging time drops measurably.

### Adoption Characteristics
- **Activation:** Low friction (developers understand APIs and MCP)
- **Willingness to pay:** Medium-high (infrastructure dependency, may be company-expensed)
- **Retention:** Very strong (becomes core agent infrastructure)
- **Expansion:** Natural expansion as they build more agents

### Pricing Sensitivity & Price Points
- **Current spend:** $0-200/month on agent tools, memory solutions, API services
- **Price sensitivity:** Medium (values reliable infrastructure, but cost-conscious early)
- **Acceptable range:** $20-100/month for individual, $100-500/month for team
- **Value anchor:** Compares to RAG memory services, agent framework memory modules, custom state management cost
- **Payment method:** Credit card, company expense, usage-based pricing preferred

### Competitive Alternatives
- **Current solutions:** RAG memory (Mem0, Zep), LangChain/LangGraph memory, file-based memory (Markdown/JSON), vector DB memory, custom state management
- **Workarounds:** Building custom memory per agent, manual context injection, no persistent state
- **Why they'd switch:** Existing memory solutions lack deterministic guarantees; custom solutions are expensive; debugging is impossible without versioned history
- **Switching barriers:** Low (adopting new memory backend, not replacing entire stack)

### Sales Cycle & Decision Process
- **Sales cycle:** 7-30 days (API exploration → integration → validation → adoption)
- **Decision maker:** Developer (individual decision for personal projects; may need lead approval for team)
- **Decision process:** Discover → test MCP integration → see deterministic results → adopt
- **Touchpoints:** GitHub, agent framework communities, MCP server directories, Hacker News
- **Sales model:** Self-serve with developer documentation

### Key Objections
- **"How is this different from RAG memory?"** → Neotoma enforces deterministic state evolution; RAG does context lookup. Different guarantees.
- **"API stability concerns"** → Versioned MCP protocol, API versioning, changelog, backward compatibility
- **"Local-only limitation"** → Local-first suits dev and small-scale agent deployments; hosted planned
- **"Integration effort"** → Standard MCP protocol, clear docs, integration examples, SDK
- **"Lock-in"** → MIT license, open-source, portable observation log

### Buying Signals
- **Strong signals:** Building agent systems, posts about agent memory problems, MCP integrations, agent debugging frustration
- **Medium signals:** Developer with agent/automation projects, agent framework usage, multi-step workflow development
- **Weak signals:** General agent development interest, LLM workflow questions

### Expansion Path
- **Individual → Team:** After successful agent integration, team adopts as standard memory backend
- **Expansion trigger:** Agent ships with Neotoma; team standardizes on it for new agents
- **Expansion mechanics:** Team-wide adoption, shared memory substrate, standardized integration
- **Expansion timeline:** 1-2 months from individual integration to team adoption

### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Assume RAG/vector memory is sufficient for agents
- **Solution:** Guarantee comparison table showing what RAG lacks (determinism, versioning, replayability, schema constraints)
- **Barrier:** Don't know Neotoma exists
- **Solution:** Presence in agent framework communities, MCP directories, agent architecture blog posts

**Activation Barriers:**
- **Barrier:** Integration effort with existing agent framework
- **Solution:** MCP standard protocol, framework-specific integration guides, code examples
- **Barrier:** Empty state (no existing data to query)
- **Solution:** Quick start guide, sample data, store_structured examples, instant feedback loop

**Retention Barriers:**
- **Barrier:** Memory not useful if agent architecture changes
- **Solution:** Schema flexibility, entity type evolution, migration guides
- **Barrier:** Performance concerns at scale
- **Solution:** Performance benchmarks, SQLite optimization, query optimization guides

### Technical Requirements
- MCP integration (primary interface)
- Deterministic state evolution (core guarantee)
- Schema validation and entity resolution
- Versioned history and replayable timeline
- Provenance and audit trail
- Local or self-hosted deployment

### Side-by-Side: AI Infrastructure Engineers vs Agent System Builders

- **Primary layer:** Infrastructure engineers build runtimes, orchestration, and observability foundations; agent system builders build application-layer agents and shipped workflows on top.
- **Adoption motion:** Infrastructure engineers are evaluation-first (validate guarantees before rollout); agent builders are integration-first (wire via MCP and iterate quickly).
- **Decision owner:** Infrastructure adoption is usually led by platform/reliability leads; builder adoption is often led by individual developers or product engineering teams.
- **Cycle length:** Infrastructure cycles are typically longer (14-60 days) because standardization risk is higher; builder cycles are faster (7-30 days) because scope is narrower.
- **Success metric:** Infrastructure teams optimize for platform reproducibility and auditability; builders optimize for reliable multi-step execution, lower debugging time, and stable shipped behavior.
- **Budget profile:** Infrastructure engineers generally have larger infra-tool budgets and lower price sensitivity; builders are more cost-sensitive, especially at individual or early-team stages.

## 3. AI-native Operators (builder-grade)

### Profile
Power users of Claude, Cursor, ChatGPT, and other AI tools who have automation habits and feel the memory gap across every tool switch. They adopt Neotoma for their own cross-tool workflows, not for systems they ship to others. Distinguished from Agent System Builders by adoption motion: operators use Neotoma for personal workflow continuity; builders wire it into products.

### Key Visible Criteria
- **Tool usage:** Active ChatGPT Plus/Pro subscriber, Claude Pro user, Cursor user, Raycast user — uses 3+ AI tools daily
- **Activity signals:** Posts in AI tool communities (Reddit, Discord), follows AI tool creators on Twitter/X, shares MCP configs
- **Behavior:** Automation habits (scripts, MCP server configs, custom prompts), tool-calling workflows
- **Proxy indicators:** GitHub profile with automation/AI projects, Product Hunt early adopter, MCP server usage
- **Content consumption:** Engages with AI tool comparison content, MCP content, AI productivity content

### Key Acquisition Channels
- **AI tool communities:** Reddit (r/ChatGPT, r/ClaudeAI, r/Cursor), Discord servers for AI tools
- **Developer communities:** GitHub, Hacker News, Indie Hackers, Product Hunt
- **Content marketing:** AI tool comparison blogs, MCP integration guides, cross-tool memory content
- **Partnerships:** Integration marketplace listings (Cursor, Raycast), MCP server directories
- **SEO:** "AI memory across tools", "persistent AI context", "MCP memory server" keywords

### Estimated Worldwide Population
**2-5 million** (heavy AI tool users with automation habits who use 3+ tools daily and understand memory limitations)

### Pain Points
- **Context fragmentation across tools:** Each AI tool has its own memory; switching tools loses context
- **Repetitive context-setting:** Must re-explain the same project context to Claude, Cursor, ChatGPT separately
- **Lost commitments and decisions:** Decisions made in a ChatGPT session three days ago are gone
- **Broken handoffs:** Starting a task in Claude and continuing in Cursor requires manual context transfer
- **No cross-session continuity:** Every new session starts from zero unless you manually paste context

### Use Cases
- **Cross-tool memory:** Store context once, query from any MCP-compatible tool
- **Project continuity:** Maintain project state across sessions and tools
- **Decision tracking:** Record decisions and commitments that persist across conversations
- **Research synthesis:** Accumulate findings across multiple AI research sessions
- **Workflow automation:** Use MCP to give all AI tools access to structured personal data

### Workflows
1. **Install and configure MCP** → Connect Neotoma to Claude, Cursor, and other tools
2. **Store context via conversations** → AI tools write observations to Neotoma during normal use
3. **Query across tools** → Ask Claude about something stored via Cursor; context persists
4. **Review and manage** → Use CLI to inspect, query, or correct stored entities

### Value Proposition
- **Unified memory across tools:** Single state layer that persists across all MCP-compatible tools
- **No repeated context:** Facts stored once are available everywhere
- **Versioned and auditable:** Nothing is silently lost or overwritten
- **Schema-bound consistency:** Prevents contradictory state across tools
- **Privacy-first:** Data stays local; no provider access

### A-ha Moment
When they switch from Cursor to Claude and ask about the same project, and Claude has the context from their Cursor session — without re-explaining anything. They realize memory is truly unified across tools.

### Ready-to-Pay Threshold
After successfully using cross-tool memory for 1-2 weeks and seeing context persist where it previously did not. They've experienced the value and are willing to pay to maintain this capability.

### Adoption Characteristics
- **Activation:** Immediate (understand value proposition instantly; MCP setup is familiar)
- **Willingness to pay:** High (already paying for AI tools)
- **Retention:** Strong (daily use, core workflow dependency)
- **Expansion:** Natural champions for team adoption; vocal in tool communities

### Pricing Sensitivity & Price Points
- **Current spend:** $20-60/month on AI tools (ChatGPT Plus $20, Claude Pro $20, Cursor $20)
- **Price sensitivity:** Low (already paying for tools, understand value of developer tools)
- **Acceptable range:** $10-30/month for individual, $50-200/month for team
- **Value anchor:** Compares to AI tool subscriptions and developer tool subscriptions
- **Payment method:** Credit card, comfortable with subscription model

### Competitive Alternatives
- **Current solutions:** Platform memory (Claude memory, ChatGPT memory), notes/PKM tools (Obsidian, Notion), manual context management
- **Workarounds:** Re-uploading documents, copy-pasting context between tools, no cross-tool memory
- **Why they'd switch:** Platform memory is tool-specific and non-deterministic; PKM lacks MCP integration; no current solution provides cross-tool deterministic state
- **Switching barriers:** Low (new capability, not replacing existing tool)

### Sales Cycle & Decision Process
- **Sales cycle:** 0-7 days (self-serve, no sales team needed)
- **Decision maker:** Individual (no approval needed)
- **Decision process:** Discover → install → configure MCP → see cross-tool value → pay
- **Touchpoints:** AI tool communities, MCP directories, Product Hunt, tool comparison content
- **Sales model:** Self-serve with clear setup docs

### Key Objections
- **"Another tool to manage"** → Runs as MCP server behind your existing tools; no new UI required
- **"How is this different from ChatGPT memory?"** → ChatGPT memory is tool-specific and non-deterministic; Neotoma is cross-tool, versioned, schema-bound
- **"Setup complexity"** → `npx neotoma` install, MCP config in 5 minutes
- **"Privacy concerns"** → Local-first, data stays on your machine, no cloud sync required
- **"Will it work with my tools?"** → MCP standard protocol; works with Claude, Cursor, ChatGPT, any MCP-compatible tool

### Buying Signals
- **Strong signals:** Uses 3+ AI tools daily, posts about context loss or "AI amnesia", mentions MCP servers, automation habits
- **Medium signals:** Multiple AI tool subscriptions, developer with automation projects, early adopter behavior
- **Weak signals:** General AI tool interest, productivity tool usage

### Expansion Path
- **Individual → Team:** After 2-3 weeks of use, recommends to colleagues and team members
- **Expansion trigger:** Shares a query result that pulls context from multiple tools; others want the same capability
- **Expansion mechanics:** Simple install recommendation, MCP config sharing, team workspace (future)
- **Expansion timeline:** 2-4 weeks from individual to team adoption

### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't know Neotoma exists; platform memory seems "good enough"
- **Solution:** Guarantee comparison table showing what platform memory lacks (cross-tool, versioned, schema-bound, replayable)
- **Barrier:** Skeptical of "another tool" to manage
- **Solution:** Runs as background MCP server; no new UI; works inside tools they already use

**Activation Barriers:**
- **Barrier:** MCP configuration friction
- **Solution:** `npx neotoma` one-line install, auto-generated MCP config, tool-specific setup guides
- **Barrier:** Empty state after install (no data yet)
- **Solution:** Instant feedback on first store; onboarding flow that demonstrates cross-tool persistence

**Retention Barriers:**
- **Barrier:** MCP connection issues
- **Solution:** Reliable MCP server, clear error messages, auto-reconnect, health check CLI command
- **Barrier:** Not seeing enough value (memory not queried often enough)
- **Solution:** Proactive memory retrieval in agent instructions; periodic "did you know" prompts via CLI

### Technical Requirements
- Single-user (no multi-user features needed for dev release)
- MCP integration (primary access method)
- CLI for inspection and management
- Local-first architecture (privacy, no cloud dependency)
- Deterministic state (trust in stored data)
# TIER 2 — Secondary ICPs (Adjacent / Later in Dev Release)

## 4. Toolchain Integrators

### Profile
Framework and devtool authors who would add Neotoma as a recommended or default memory backend for downstream builders. They build SDKs, orchestration libraries, editor plugins, and deployment platforms that other developers adopt. Adoption depends on API stability demonstrated by Tier 1 usage.

### Key Visible Criteria
- **Job titles:** Framework Maintainer, SDK Author, Developer Tools Engineer, Platform Engineer, Open Source Maintainer
- **Activity signals:** Maintains agent frameworks, orchestration libraries, editor plugins; evaluates memory adapters for downstream users
- **Tool usage:** Maintains npm/PyPI packages, contributes to open-source frameworks, builds developer tools
- **Proxy indicators:** GitHub repos with 100+ stars, framework maintainer status, developer tool author
- **Content consumption:** Engages with devtool ecosystem content, framework comparison content, developer platform content

### Key Acquisition Channels
- **Direct outreach:** GitHub issues/PRs on agent frameworks, direct messages to framework maintainers
- **Developer communities:** GitHub, Hacker News, framework-specific communities
- **Content marketing:** Integration guides, "add deterministic state to your framework" content
- **Conferences:** Developer tool conferences, open-source conferences, framework meetups

### Estimated Worldwide Population
**100K-300K** (framework/SDK maintainers and devtool authors globally)

### Pain Points
- **Existing memory adapters lack guarantees:** Downstream builders report drift and inconsistency
- **No standard for deterministic agent state:** Each framework invents its own memory module
- **Integration maintenance burden:** Memory adapters break across versions
- **Downstream builder complaints:** Users want persistent, deterministic memory; framework lacks it

### Use Cases
- **Framework integration:** Add Neotoma as a supported memory backend in agent framework
- **SDK development:** Build Neotoma SDK or adapter for framework ecosystem
- **Default memory backend:** Make Neotoma the default/recommended memory for framework
- **Integration guide authoring:** Create integration documentation for downstream builders

### Workflows
1. **Evaluate API surface** → Review Neotoma's MCP/API stability and guarantees
2. **Build adapter/integration** → Create framework-specific integration
3. **Test with downstream users** → Validate integration with real builder workflows
4. **Ship as supported backend** → List Neotoma as supported memory option

### Value Proposition
- **Open-source, MIT-licensed:** No licensing barriers to integration
- **Standard MCP protocol:** Well-defined integration surface
- **Deterministic guarantees:** Guarantees can be documented and passed through to downstream builders
- **Active development:** Responsive to integration feedback and API requirements

### A-ha Moment
When a downstream builder integrates Neotoma through their framework and reports that agent state is finally deterministic and debuggable — validating the framework's decision to integrate.

### Ready-to-Pay Threshold
After successful integration and positive downstream builder feedback. May not pay directly but drives volume through downstream adoption.

### Adoption Characteristics
- **Activation:** Slow (requires API stability evaluation, integration development)
- **Willingness to pay:** Low-medium (open-source maintainers often have limited budgets; value comes from downstream volume)
- **Retention:** Strong once integrated (integration becomes framework standard)
- **Expansion:** High leverage (one integration reaches many downstream builders)

### Pricing Sensitivity & Price Points
- **Current spend:** $0-100/month on developer tools (many open-source, some paid APIs)
- **Price sensitivity:** High for personal, low for company-sponsored
- **Acceptable range:** Free tier for open-source integrations, $50-200/month for commercial frameworks
- **Value anchor:** Compares to memory adapter maintenance cost, framework module development cost
- **Payment method:** Credit card, company expense, usage-based pricing

### Competitive Alternatives
- **Current solutions:** Built-in memory modules, custom adapters, RAG integrations, no standard state layer
- **Workarounds:** Building custom memory adapters, recommending ad-hoc solutions to downstream builders
- **Why they'd switch:** Neotoma provides guarantees they can't offer with custom adapters; reduces integration maintenance
- **Switching barriers:** Medium (requires integration development, documentation update, downstream communication)

### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (evaluation → integration development → testing → ship)
- **Decision maker:** Framework maintainer / devtool lead
- **Decision process:** Discover → evaluate API stability → build integration → test → ship
- **Touchpoints:** GitHub, direct outreach, conference conversations, integration guides
- **Sales model:** Developer relations, direct engagement with maintainers

### Key Objections
- **"API not stable enough"** → API versioning policy, deprecation guarantees, stable MCP protocol
- **"Integration maintenance burden"** → Stable protocol, backward compatibility, integration support
- **"Downstream adoption uncertain"** → Case studies from Tier 1 builders, demo integration
- **"No hosted option"** → Local-first suits development; hosted deployment planned
- **"Lock-in concerns"** → MIT license, open-source, portable observation log, standard MCP

### Buying Signals
- **Strong signals:** Evaluating memory adapters for framework, posts about memory integration challenges, framework with memory module gaps
- **Medium signals:** Framework maintainer, devtool author, open-source contributor, integration developer
- **Weak signals:** General framework development interest, devtool questions

### Expansion Path
- **Integration → Ecosystem:** After framework integration, drives downstream builder adoption
- **Expansion trigger:** Successful integration, positive downstream feedback, framework release with Neotoma support
- **Expansion mechanics:** Framework documentation, integration examples, ecosystem listing
- **Expansion timeline:** 3-6 months from integration to meaningful downstream adoption

### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't know Neotoma exists or see it as relevant to their framework
- **Solution:** Direct outreach, GitHub integration PRs, framework-specific integration guides
- **Barrier:** Assume existing memory modules are sufficient
- **Solution:** Guarantee comparison showing what existing modules lack (determinism, versioning, replayability)

**Activation Barriers:**
- **Barrier:** Integration development effort
- **Solution:** Clear API docs, integration examples, SDK, responsive support for integration questions
- **Barrier:** API stability uncertainty
- **Solution:** API versioning policy, deprecation guarantees, stable MCP protocol, changelog

**Retention Barriers:**
- **Barrier:** API changes break integration
- **Solution:** Backward compatibility, migration guides, pre-release testing access, integration health monitoring
- **Barrier:** Downstream builders don't adopt the integration
- **Solution:** Co-marketing, integration documentation, case studies, demo projects

### Technical Requirements
- Stable MCP and API interface (critical for downstream reliability)
- API versioning and deprecation policy
- Integration examples and SDK
- Clear documentation for downstream builders

---

# TIER 3 — Future ICPs (Post Developer Release)

These ICPs get value from Neotoma's guarantees but are not aligned with the developer release's distribution model, interface complexity, or feature scope. They are strong candidates for post-developer-release expansion once the interface broadens.

## 5. Knowledge Workers

*Deferred from developer release. Requires GUI, simplified onboarding, and lower conceptual complexity.*

### Profile
Analysts, researchers, consultants, lawyers, strategists, and other professionals who work with complex information flows. They rely heavily on cross-document synthesis and need to maintain context across long research cycles.
### Key Visible Criteria
- **Job titles:** Analyst, Researcher, Consultant, Lawyer, Strategist, Research Scientist, Policy Analyst
- **LinkedIn signals:** Job title in target roles, works at consulting firms, research institutions, law firms
- **Activity signals:** Posts about research methodology, document management, information synthesis
- **Tool usage:** Uses research tools (Zotero, Mendeley), legal research platforms, consulting software
- **Proxy indicators:** Publications, research papers, conference presentations, professional certifications
- **Content consumption:** Engages with research methodology content, legal tech content, consulting tools content
### Key Acquisition Channels
- **Professional communities:** LinkedIn (targeted ads to analysts, researchers, consultants, lawyers), industry-specific forums
- **Content marketing:** Case studies, research methodology blogs, legal tech publications, consulting industry publications
- **Conferences:** Legal tech, research methodology, consulting conferences
- **Partnerships:** Legal tech platforms, research tools, consulting software integrations
- **SEO:** "document management for researchers", "legal research tools", "consultant knowledge base" keywords
- **Paid:** LinkedIn ads (job title targeting), Google Ads (professional tool keywords)
### Estimated Worldwide Population
**10-20 million** (knowledge workers in analysis, research, consulting, legal professions globally)
### Pain Points
- **Information overload:** Hundreds of documents across multiple projects
- **Context switching:** Lose track of which documents relate to which projects
- **No entity unification:** Can't track people, companies, locations across documents
- **Timeline fragmentation:** Can't see chronological relationships between events
- **Search limitations:** Current tools can't find information across document types
### Use Cases
- **Due diligence:** Upload company documents, contracts, financials → track entities and relationships
- **Legal research:** Upload case files, precedents, contracts → cross-reference and synthesize
- **Market research:** Upload reports, articles, data → synthesize findings across sources
- **Client work:** Upload client documents, notes, communications → maintain context across engagements
- **Project tracking:** Upload project documents, timelines, deliverables → track progress and decisions
### Document Types
- Contracts and legal documents
- Research papers and articles
- Financial statements and reports
- Client communications and notes
- Project documentation
- Meeting notes and transcripts
### Workflows
1. **Bulk upload** → Ingest project documents
2. **Entity exploration** → "Show me all documents involving Company X"
3. **Timeline analysis** → "What happened in Q1 2024 across all projects?"
4. **Cross-document query** → "Find all references to regulatory changes in 2023"
### Value Proposition
- **Entity resolution:** Canonical IDs for people, companies, locations across all documents
- **Timeline construction:** Automatic chronological ordering of events
- **Cross-document search:** Find information across all document types
- **Context preservation:** Maintain project context across long research cycles
### A-ha Moment
When they query "Show me all documents involving Company X" and the system correctly finds all references across contracts, emails, notes, and reports—even when the company name appears in different formats. They realize entity resolution is working and saving hours of manual searching.
### Ready-to-Pay Threshold
After successfully using entity-based queries and timeline analysis on a real project (e.g., due diligence or legal research). They've seen the time savings and accuracy improvements, and understand this is a professional tool worth paying for.
### Adoption Characteristics
- **Activation:** High (immediate pain relief)
- **Willingness to pay:** High (professional tool, expense-able)
- **Retention:** Very strong (core workflow dependency)
- **Expansion:** Natural team adoption (share insights with colleagues)
### Pricing Sensitivity & Price Points
- **Current spend:** $50-200/month on professional tools (research tools, legal platforms, consulting software)
- **Price sensitivity:** Low (professional expense, company reimbursable)
- **Acceptable range:** $30-100/month for individual, $200-1000/month for team
- **Value anchor:** Compares to professional research tools, legal tech platforms, consulting software
- **Payment method:** Credit card, company expense, annual contracts acceptable
### Competitive Alternatives
- **Current solutions:** Document management tools (Notion, Confluence), research tools (Zotero, Mendeley), no entity resolution solution
- **Workarounds:** Manual entity tracking in spreadsheets, multiple search tools, context switching between systems
- **Why they'd switch:** No current solution provides entity resolution and cross-document synthesis; manual work is time-consuming
- **Switching barriers:** Medium (may have existing document systems, but Neotoma is additive not replacement)
### Sales Cycle & Decision Process
- **Sales cycle:** 7-30 days (evaluate → trial → purchase)
- **Decision maker:** Individual professional (may need manager approval for team plans)
- **Decision process:** Discover → evaluate → trial → see value → purchase (may require manager approval for team)
- **Touchpoints:** Professional communities, case studies, conference demos, LinkedIn content
- **Sales model:** Self-serve with optional sales support for team plans
### Key Objections
- **"How is this different from [Notion/Confluence]?"** → Emphasize entity resolution, timeline, AI-native vs file storage
- **"Data security for sensitive documents"** → Clear privacy policy, encryption, RLS, compliance certifications, audit logs
- **"Entity resolution accuracy concerns"** → Show confidence scores, manual linking tools, accuracy metrics
- **"Bulk upload complexity"** → Bulk upload UI, folder import, progress tracking, resume on failure
- **"Team adoption uncertainty"** → Team usage analytics, shared query examples, onboarding support
### Buying Signals
- **Strong signals:** Posts about entity resolution needs, mentions "can't find documents across systems", active in research/legal communities
- **Medium signals:** Uses multiple document tools, mentions information overload, professional certifications
- **Weak signals:** General productivity interest, document management questions
### Expansion Path
- **Individual → Team:** After 1-2 months of individual use, shares insights with colleagues, team adopts
- **Expansion trigger:** Successful project using Neotoma, shares query results with team
- **Expansion mechanics:** Team workspace setup, shared memory demonstration, team onboarding
- **Expansion timeline:** 1-3 months from individual to team adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't understand how it differs from existing document management tools
- **Solution:** Clear differentiation: "AI-native memory substrate" vs "file storage", emphasize entity resolution and timeline
- **Barrier:** Concern about data security/privacy for sensitive documents
- **Solution:** Clear privacy policy, encryption at rest, RLS, audit logs, compliance certifications
**Activation Barriers:**
- **Barrier:** Bulk upload complexity (hundreds of documents)
- **Solution:** Bulk upload UI, folder import, Gmail label import, progress tracking, resume on failure
- **Barrier:** Entity resolution accuracy concerns (critical for their use case)
- **Solution:** High-accuracy entity extraction, manual entity linking, entity merge tools, confidence scores
**Retention Barriers:**
- **Barrier:** Search not finding what they need (low recall)
- **Solution:** Advanced search filters, entity-based search, timeline navigation, full-text search with ranking
- **Barrier:** Timeline accuracy issues (dates wrong)
- **Solution:** Date extraction validation, manual date correction, source field tracking, date format normalization
### Technical Requirements
- Strong entity resolution (critical for their use case)
- Timeline accuracy (dates must be correct)
- Bulk upload support
- Advanced search capabilities
## 6. Small Teams (2–20)

*Deferred from developer release. Requires multi-user permissions, sharing, and governance features not in scope.*

### Profile
Startup founders and small teams who are early adopters of AI tools. They initially adopt Neotoma individually, then expand to team usage organically. Individual team members may adopt as AI-native Operators during the developer release; team expansion is a post-dev-release motion.
### Key Visible Criteria
- **Job titles:** Founder, Co-Founder, CEO (at early-stage company), Startup Founder
- **Company signals:** Company size 2-20 employees, early-stage startup (pre-Series B), YC/accelerator alumni
- **LinkedIn signals:** "Founder" in title, company listed, early-stage company indicators
- **Activity signals:** Posts about startup tools, early adopter behavior, Product Hunt launches
- **Proxy indicators:** AngelList profile, Y Combinator directory, Indie Hackers, Product Hunt maker badge
- **Content consumption:** Engages with startup tool content, founder case studies, early-stage startup content
### Key Acquisition Channels
- **Startup communities:** Y Combinator, Indie Hackers, Product Hunt, Hacker News, startup Discord servers
- **Founder networks:** LinkedIn (targeted to founders), Twitter/X startup community, AngelList
- **Content marketing:** Startup tool blogs, founder case studies, "tools for startups" content
- **Partnerships:** Startup accelerators, co-working spaces, founder communities
- **SEO:** "startup knowledge base", "founder tools", "startup document management" keywords
- **Paid:** LinkedIn ads (founder job titles), Twitter/X ads (startup community), Product Hunt launches
### Estimated Worldwide Population
**500K-1 million** (active startup founders globally, with 2-20 person teams representing 2-5 million potential users)
### Pain Points
- **Team knowledge fragmentation:** Each team member has different documents, no shared memory
- **Onboarding friction:** New team members can't access historical context
- **AI tool inconsistency:** Different team members use different AI tools, no shared memory
- **Decision tracking:** Can't track decisions and context across team members
- **Investor/board prep:** Need to synthesize documents for board meetings, investor updates
### Use Cases
- **Team knowledge base:** Shared memory of company documents, decisions, context
- **Investor relations:** Upload cap tables, financials, board docs → prepare investor updates
- **Product planning:** Upload user research, competitive analysis, product docs → synthesize insights
- **Hiring and onboarding:** Upload candidate docs, offer letters, onboarding materials → track process
- **Compliance and legal:** Upload contracts, agreements, compliance docs → maintain audit trail
### Document Types
- Company documents (cap tables, financials, board docs)
- Product documentation
- User research and competitive analysis
- Legal and compliance documents
- Hiring and HR documents
- Investor and board materials
### Workflows
1. **Individual adoption** → Founder uses Neotoma personally
2. **Team expansion** → Invite team members, share documents
3. **Shared queries** → "What did we decide about feature X in Q3?"
4. **Board prep** → "Synthesize all financial documents from last 6 months"
### Value Proposition
- **Team memory:** Shared knowledge base across team members
- **Onboarding acceleration:** New team members can query historical context
- **Decision tracking:** Maintain context of decisions and rationale
- **Investor readiness:** Quick synthesis of company documents
### A-ha Moment
When a new team member asks "What did we decide about feature X in Q3?" and gets an accurate answer from historical documents, without needing to ask the founder or dig through Slack. They realize the team now has shared institutional memory.
### Ready-to-Pay Threshold
After the founder uses it individually for 2-3 weeks and then successfully shares a query result with the team (e.g., "Synthesize all financial documents from last 6 months" for board prep). They see team value and are ready to upgrade to a team plan.
### Adoption Characteristics
- **Activation:** Individual first, then team expansion
- **Willingness to pay:** High (team plans, $2–20k ARR)
- **Retention:** Strong (becomes core infrastructure)
- **Expansion:** Natural bottom-up growth (individual → team → org)
### Pricing Sensitivity & Price Points
- **Current spend:** $50-500/month on startup tools (Notion, Slack, GitHub, design tools)
- **Price sensitivity:** Medium (startup budget constraints, but understands team tool value)
- **Acceptable range:** $20-50/month for individual, $200-2000/month for team (2-20 people)
- **Value anchor:** Compares to team collaboration tools, knowledge base tools, startup infrastructure
- **Payment method:** Credit card, startup expense, annual discount preferred
### Competitive Alternatives
- **Current solutions:** Notion, Confluence, Google Workspace, Slack, no unified memory solution
- **Workarounds:** Scattered documents across tools, manual context sharing, lost institutional knowledge
- **Why they'd switch:** No current solution provides team-wide AI memory; knowledge fragmentation is painful
- **Switching barriers:** Low-medium (may have existing tools, but Neotoma is additive for AI memory)
### Sales Cycle & Decision Process
- **Sales cycle:** 14-60 days (individual trial → team evaluation → team purchase)
- **Decision maker:** Founder/CEO (individual decision) → team consensus (team plan)
- **Decision process:** Individual trial → see value → team demo → team consensus → purchase
- **Touchpoints:** Startup communities, Product Hunt, founder networks, accelerator partnerships
- **Sales model:** Self-serve individual, sales-assisted team plans
### Key Objections
- **"Individual vs team pricing unclear"** → Transparent pricing, free individual tier, clear upgrade path
- **"Team adoption uncertainty"** → Team usage analytics, shared memory examples, onboarding support
- **"Data ownership concerns"** → Clear data ownership model, individual + team workspaces, migration options
- **"Integration with existing tools"** → Integration examples, API access, export capabilities
- **"Startup budget constraints"** → Startup pricing, annual discount, usage-based options
### Buying Signals
- **Strong signals:** Active founder, early-stage startup, posts about team knowledge fragmentation, Product Hunt maker
- **Medium signals:** Startup accelerator alumni, team size 2-20, uses multiple collaboration tools
- **Weak signals:** General startup interest, productivity tool usage
### Expansion Path
- **Individual → Team:** After 2-3 weeks of individual use, founder invites team
- **Expansion trigger:** Shares query result with team, realizes team value, team requests access
- **Expansion mechanics:** "Invite team" CTA, team workspace setup, shared memory demo, team onboarding
- **Expansion timeline:** 2-4 weeks from individual to team adoption, 1-2 months to full team usage
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Individual adoption doesn't immediately show team value
- **Solution:** Clear individual value first, then "invite team" CTA with team value proposition
- **Barrier:** Pricing uncertainty (individual vs team pricing)
- **Solution:** Transparent pricing, free individual tier, clear team upgrade path, usage-based pricing options
**Activation Barriers:**
- **Barrier:** Team invitation and onboarding friction
- **Solution:** One-click team invites, role templates, shared workspace setup wizard, onboarding checklist
- **Barrier:** Individual → team transition unclear (what happens to my data?)
- **Solution:** Clear data ownership model, individual workspace + team workspace, migration wizard
**Retention Barriers:**
- **Barrier:** Team members not using it (low adoption within team)
- **Solution:** Team usage analytics, shared queries, team onboarding emails, "team memory" dashboard
- **Barrier:** Access control complexity (who can see what?)
- **Solution:** Simple role-based access, workspace-level permissions, document-level sharing, clear permission UI
### Technical Requirements
- Multi-user support (team expansion)
- Shared memory (team-wide queries)
- Access controls (who can see what)
- Team onboarding workflows
*Note: The former "Builders of agentic systems" bridge ICP has been expanded and promoted to Tier 1 as "Agent System Builders" (profile #2 above).*
# Deferred B2B ICPs — Post Developer Release

These ICPs from the former Tier 2 require multi-user features, organizational semantics, and team workflows not in developer-release scope. Profiles preserved for future reference.

## 7. Hybrid Product Teams (PM + Eng + Design + Marketing)
### Profile
Cross-functional product teams that struggle with coordination breakdown. They use many AI tools but lack shared memory. High ROI from unified memory substrate.
### Key Visible Criteria
- **Job titles:** Product Manager, Product Designer, Engineering Manager, Marketing Manager (at product companies)
- **Company signals:** Tech companies, product-led companies, companies with PM/Eng/Design/Marketing functions
- **LinkedIn signals:** Multiple team members with product/design/eng/marketing titles at same company
- **Activity signals:** Team posts about collaboration tools, product management tools, design tools
- **Tool usage:** Uses Notion, Figma, GitHub, product management tools, design tools
- **Proxy indicators:** Company has product blog, design system, engineering blog, product team structure
- **Content consumption:** Engages with product management content, team collaboration content, design tools content
### Key Acquisition Channels
- **B2B communities:** LinkedIn (targeted to PM, Eng, Design, Marketing roles), Slack communities for product teams
- **Content marketing:** Product management blogs, engineering blogs, design tool comparisons, team collaboration case studies
- **Conferences:** ProductCon, design conferences, engineering conferences, product management meetups
- **Partnerships:** Product management tools (Notion, Airtable), design tools (Figma), engineering tools (GitHub)
- **SEO:** "product team collaboration", "cross-functional knowledge base", "team memory" keywords
- **Paid:** LinkedIn ads (role-based targeting), Google Ads (B2B team tools), retargeting from individual users
### Estimated Worldwide Population
**50K-100K teams** (2-5 million potential users in hybrid product teams globally)
### Pain Points
- **Siloed information:** PM, Eng, Design, Marketing each have different documents
- **Context loss:** Decisions and rationale lost in Slack, email, documents
- **AI tool fragmentation:** Each function uses different AI tools, no shared context
- **Onboarding friction:** New team members can't access historical context
- **Stakeholder alignment:** Can't quickly synthesize information for stakeholders
### Use Cases
- **Product planning:** Shared memory of user research, competitive analysis, product decisions
- **Engineering context:** Track technical decisions, architecture docs, API contracts
- **Design system:** Maintain design decisions, component libraries, brand guidelines
- **Marketing alignment:** Share campaign docs, messaging, customer insights
- **Stakeholder updates:** Synthesize information across functions for leadership
### Document Types
- Product requirements and specs
- User research and customer feedback
- Technical documentation
- Design files and brand guidelines
- Marketing materials and campaigns
- Meeting notes and decisions
### Workflows
1. **Team setup** → Configure team workspace
2. **Document ingestion** → Each function uploads relevant documents
3. **Cross-functional queries** → "What did we learn from user research about feature X?"
4. **Stakeholder synthesis** → "Prepare update on product progress from last quarter"
### Value Proposition
- **Unified memory:** Single source of truth across all functions
- **Cross-functional synthesis:** AI can connect information across PM, Eng, Design, Marketing
- **Onboarding acceleration:** New team members can query historical context
- **Decision tracking:** Maintain context of decisions and rationale
### A-ha Moment
When PM asks "What did we learn from user research about feature X?" and the AI synthesizes information from research docs (PM), technical decisions (Eng), design files (Design), and campaign results (Marketing)—all in one answer. They realize cross-functional memory is working.
### Ready-to-Pay Threshold
After 2-3 successful cross-functional queries that saved significant time (e.g., stakeholder update synthesis that would have taken hours). The team sees ROI and is ready to pay for team plan ($2-20k ARR).
### Adoption Characteristics
- **Activation:** Medium friction (requires team buy-in)
- **Willingness to pay:** High ($2–20k ARR per team)
- **Retention:** Very strong (becomes core infrastructure)
- **Expansion:** Natural expansion to other teams in org
### Pricing Sensitivity & Price Points
- **Current spend:** $500-5000/month on team tools (Notion, Slack, Figma, GitHub, design tools)
- **Price sensitivity:** Low (team tool, high ROI, expense-able)
- **Acceptable range:** $200-2000/month for team (5-20 people), $5000-20000/year annual
- **Value anchor:** Compares to team collaboration tools, knowledge base tools, cross-functional tools
- **Payment method:** Company credit card, annual contracts preferred, PO process acceptable
### Competitive Alternatives
- **Current solutions:** Notion, Confluence, Slack, Google Workspace, no unified cross-functional memory
- **Workarounds:** Multiple tools per function, manual context sharing, lost decisions in Slack/email
- **Why they'd switch:** No current solution provides cross-functional AI memory; coordination breakdown is painful
- **Switching barriers:** Medium (may have existing tools, but Neotoma is additive for memory)
### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (team evaluation → consensus → purchase)
- **Decision maker:** Team lead/manager (may need budget approval)
- **Decision process:** Team discovery → evaluation → pilot → consensus → budget approval → purchase
- **Touchpoints:** B2B communities, case studies, team demos, LinkedIn content, conferences
- **Sales model:** Sales-assisted with self-serve trial option
### Key Objections
- **"Team coordination complexity"** → Function-specific onboarding, role templates, shared workspace templates
- **"Integration with existing tools"** → Integration examples, API access, Slack/Notion integrations
- **"Partial team adoption concerns"** → Team usage analytics, function-specific value props, adoption dashboard
- **"Budget approval process"** → ROI calculator, case studies, pilot program, annual discount
- **"Empty state problem"** → Bulk import, sample documents, onboarding wizard, migration support
### Buying Signals
- **Strong signals:** Posts about team coordination issues, mentions "lost context", active in product/ops communities
- **Medium signals:** Team size 5-20, uses multiple collaboration tools, growth-stage company
- **Weak signals:** General team collaboration interest, productivity tool usage
### Expansion Path
- **Team → Org:** After 3-6 months of team use, expands to other teams in org
- **Expansion trigger:** Other teams see value, request access, org-wide rollout
- **Expansion mechanics:** Org workspace setup, multi-team management, org-wide memory
- **Expansion timeline:** 3-6 months from team to org adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Requires team coordination and buy-in (not individual decision)
- **Solution:** Bottom-up adoption path (individual → team), clear ROI calculator, team pilot program
- **Barrier:** Perceived as "another tool" adding to tool sprawl
- **Solution:** Integration with existing tools (Slack, Notion), "unified memory" messaging, reduce tool switching
**Activation Barriers:**
- **Barrier:** Cross-functional setup complexity (multiple functions need to participate)
- **Solution:** Function-specific onboarding paths, role templates, shared workspace templates, migration from existing tools
- **Barrier:** Initial empty state (no documents yet)
- **Solution:** Bulk import from existing tools, sample documents, onboarding wizard, "import from Notion/Slack" features
**Retention Barriers:**
- **Barrier:** Not all functions using it (partial adoption)
- **Solution:** Function-specific value props, usage analytics per function, cross-functional query examples, team adoption dashboard
- **Barrier:** Integration maintenance (Slack/Notion changes break integration)
- **Solution:** Stable integrations, webhook reliability, clear integration status, fallback options
### Technical Requirements
- Multi-user team workspaces
- Role-based access controls
- Shared memory and queries
- Integration with existing tools (Slack, Notion, etc.)
## 8. Cross-Functional Operational Teams (Ops, RevOps, Marketing Ops)
### Profile
Operations teams that rely heavily on content, workflows, and repetitive AI tasks. They crave consistency and need shared memory for operational processes.
### Key Visible Criteria
- **Job titles:** Operations Manager, RevOps, Marketing Ops, Business Operations, Process Manager
- **Company signals:** Companies with dedicated ops functions, growth-stage companies, process-heavy operations
- **LinkedIn signals:** Job title includes "Ops", "Operations", works at companies with ops teams
- **Activity signals:** Posts about process documentation, SOPs, workflow automation, ops tools
- **Tool usage:** Uses Confluence, Notion, Zapier, workflow tools, documentation tools
- **Proxy indicators:** Company has process documentation, runbooks, SOPs, ops-focused content
- **Content consumption:** Engages with ops content, process improvement content, RevOps content
### Key Acquisition Channels
- **B2B communities:** LinkedIn (targeted to ops, RevOps, Marketing Ops roles), ops-focused Slack communities
- **Content marketing:** Operations blogs, RevOps content, process documentation case studies, ops tool comparisons
- **Conferences:** RevOps conferences, operations meetups, process improvement events
- **Partnerships:** Ops tools (Zapier, Notion, Confluence), workflow automation platforms
- **SEO:** "operations knowledge base", "RevOps tools", "process documentation" keywords
- **Paid:** LinkedIn ads (ops role targeting), Google Ads (B2B ops tools), retargeting from individual users
### Estimated Worldwide Population
**30K-60K teams** (1-2 million potential users in ops teams globally)
### Pain Points
- **Process documentation fragmentation:** SOPs, workflows, runbooks scattered across tools
- **Knowledge loss:** When team members leave, operational knowledge is lost
- **Inconsistent execution:** Different team members execute processes differently
- **AI task repetition:** Same AI tasks repeated across team members
- **Compliance tracking:** Can't easily track compliance documentation and processes
### Use Cases
- **SOP management:** Centralized memory of standard operating procedures
- **Workflow documentation:** Track workflows, runbooks, process documentation
- **Compliance tracking:** Maintain compliance documentation and audit trails
- **Onboarding:** New team members can query operational knowledge
- **Process improvement:** Analyze operational processes across time
### Document Types
- Standard operating procedures (SOPs)
- Workflow documentation
- Runbooks and playbooks
- Compliance documentation
- Training materials
- Process documentation
### Workflows
1. **Team setup** → Configure ops workspace
2. **Document ingestion** → Upload SOPs, workflows, runbooks
3. **Query operational knowledge** → "What's the process for handling customer refunds?"
4. **Compliance tracking** → "Show me all compliance documentation from last year"
### Value Proposition
- **Operational memory:** Centralized knowledge base for operations
- **Consistency:** Shared memory ensures consistent execution
- **Knowledge preservation:** Operational knowledge persists when team members leave
- **Compliance readiness:** Easy access to compliance documentation
### A-ha Moment
When a team member asks "What's the process for handling customer refunds?" and gets the exact SOP with all steps, exceptions, and compliance requirements—without needing to ask a senior team member or search through multiple tools. They realize operational knowledge is now accessible.
### Ready-to-Pay Threshold
After successfully using it to answer 5-10 operational questions that would have required asking senior team members or searching multiple systems. They've seen time savings and consistency improvements, ready for team plan.
### Adoption Characteristics
- **Activation:** Medium friction (requires team coordination)
- **Willingness to pay:** High ($2–20k ARR per team)
- **Retention:** Strong (core operational infrastructure)
- **Expansion:** Natural expansion to other ops teams
### Pricing Sensitivity & Price Points
- **Current spend:** $200-2000/month on ops tools (Confluence, Notion, Zapier, workflow tools)
- **Price sensitivity:** Low (ops infrastructure, cost-conscious but values ROI)
- **Acceptable range:** $200-1500/month for team, $2000-15000/year annual
- **Value anchor:** Compares to ops tools, documentation tools, workflow automation
- **Payment method:** Company credit card, annual contracts, PO process
### Competitive Alternatives
- **Current solutions:** Confluence, Notion, documentation tools, no operational memory solution
- **Workarounds:** Scattered SOPs, manual knowledge transfer, lost knowledge when team members leave
- **Why they'd switch:** No current solution provides operational memory; knowledge loss is painful
- **Switching barriers:** Medium (may have existing documentation, but Neotoma is additive)
### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (team evaluation → consensus → budget approval → purchase)
- **Decision maker:** Ops manager/lead (may need budget approval)
- **Decision process:** Team discovery → evaluation → pilot → ROI calculation → budget approval → purchase
- **Touchpoints:** Ops communities, case studies, ops conferences, LinkedIn content
- **Sales model:** Sales-assisted with ROI focus
### Key Objections
- **"Process documentation migration complexity"** → Bulk import, migration wizard, format preservation
- **"Compliance tracking setup"** → Compliance templates, automated tagging, compliance dashboard
- **"Team contribution concerns"** → Contribution analytics, gamification, knowledge gaps identification
- **"Budget approval process"** → ROI calculator, time savings metrics, compliance value
- **"Knowledge not being updated"** → Update reminders, version tracking, stale document alerts
### Buying Signals
- **Strong signals:** Posts about knowledge loss, mentions "lost SOPs", active in ops communities
- **Medium signals:** Ops team size 3-10, uses documentation tools, process-heavy operations
- **Weak signals:** General ops interest, process improvement questions
### Expansion Path
- **Team → Org:** After 2-4 months of team use, expands to other ops teams
- **Expansion trigger:** Other ops teams see value, request access, org-wide ops rollout
- **Expansion mechanics:** Multi-team ops workspace, shared operational memory, org-wide compliance
- **Expansion timeline:** 2-4 months from team to org adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Ops teams are cost-conscious, need clear ROI
- **Solution:** Clear ROI calculator (time saved, knowledge preserved), ops-specific use cases, pilot program with metrics
- **Barrier:** Perceived complexity (another system to learn)
- **Solution:** Simple UI, ops-specific templates, migration from existing docs, minimal learning curve
**Activation Barriers:**
- **Barrier:** Process documentation migration (existing SOPs in other tools)
- **Solution:** Bulk import from Confluence/Notion, document migration wizard, format preservation, link preservation
- **Barrier:** Compliance tracking setup complexity
- **Solution:** Compliance templates, automated compliance tagging, compliance dashboard, audit trail features
**Retention Barriers:**
- **Barrier:** Knowledge not being updated (stale documentation)
- **Solution:** Update reminders, version tracking, "last updated" indicators, stale document alerts
- **Barrier:** Team members not contributing (low contribution)
- **Solution:** Contribution analytics, gamification, team leaderboards, "knowledge gaps" identification
### Technical Requirements
- Multi-user team workspaces
- Process documentation support
- Compliance tracking features
- Integration with ops tools
## 9. Developer Integrators

*Note: This ICP overlaps substantially with Tier 1 "Agent System Builders" and Tier 2 "Toolchain Integrators". Preserved for reference; see those profiles for the developer-release-aligned versions.*

### Profile
Developers who build internal tools, automations, and agent systems. They require stable truth APIs to integrate Neotoma into their systems.
### Key Visible Criteria
- **Job titles:** Software Engineer, Developer, DevOps Engineer, Platform Engineer, Automation Engineer
- **Activity signals:** GitHub activity (internal tools, automations, agent systems), API integrations
- **Tool usage:** Uses API tools, webhook tools, automation platforms, developer tools
- **Proxy indicators:** GitHub repos with automation/agent/internal tool projects, API integrations, webhook usage
- **Content consumption:** Engages with API documentation, developer tool content, automation content, MCP content
- **Community signals:** Active in developer communities, API communities, automation forums
### Key Acquisition Channels
- **Developer communities:** GitHub, Hacker News, Dev.to, Stack Overflow, developer Discord servers, Reddit (r/programming)
- **Content marketing:** Developer blogs, API documentation, integration tutorials, developer case studies
- **Conferences:** Developer conferences, API conferences, automation meetups
- **Partnerships:** Developer tool marketplaces, API directories, GitHub integrations
- **SEO:** "API for document memory", "developer tools API", "automation API" keywords
- **Paid:** GitHub sponsorships, developer-focused ads, retargeting from developer tool usage
### Estimated Worldwide Population
**500K-1 million** (developers building internal tools and automations globally)
### Pain Points
- **No stable truth API:** Can't reliably integrate memory into custom tools
- **API inconsistency:** APIs change frequently, breaking integrations
- **Limited programmatic access:** Can't easily build automations and workflows
- **No webhook support:** Can't react to document ingestion events
- **Complex integration:** Difficult to integrate Neotoma into existing systems
### Use Cases
- **Custom agent systems:** Build agents that use Neotoma as memory substrate
- **Workflow automation:** Automate document processing and ingestion
- **Internal tools:** Build internal tools that leverage Neotoma memory
- **Integration development:** Integrate Neotoma into existing developer tools
- **API-first workflows:** Programmatic access to truth layer
### Document Types
- API documentation
- Integration code and configs
- Automation scripts
- Developer documentation
- System architecture docs
### Workflows
1. **API exploration** → Test MCP actions and APIs
2. **Integration development** → Build custom integrations
3. **Automation setup** → Configure automated document ingestion
4. **Agent development** → Build agents that use Neotoma memory
### Value Proposition
- **Stable APIs:** MCP actions provide consistent, versioned APIs
- **Programmatic access:** Full programmatic access to truth layer
- **Integration support:** Easy integration into existing developer tools
- **Automation support:** Webhooks and events for automation
### A-ha Moment
When they successfully build a custom agent that queries Neotoma memory via MCP and the agent correctly answers questions using their documents. They realize they can now build AI systems with persistent memory.
### Ready-to-Pay Threshold
After successfully integrating Neotoma into a production system or building a working automation. They've proven the API works for their use case and are ready to pay for ongoing access.
### Adoption Characteristics
- **Activation:** Low friction (developers understand APIs)
- **Willingness to pay:** Medium (may be expense-able, depends on use case)
- **Retention:** Strong (becomes core infrastructure)
- **Expansion:** Natural expansion as they build more integrations
### Pricing Sensitivity & Price Points
- **Current spend:** $0-200/month on developer tools (many free/open source, some paid APIs)
- **Price sensitivity:** Medium (developers value free/open source, but pay for valuable APIs)
- **Acceptable range:** $20-100/month for individual, $100-500/month for team/org
- **Value anchor:** Compares to API services, developer tools, automation platforms
- **Payment method:** Credit card, company expense, usage-based pricing preferred
### Competitive Alternatives
- **Current solutions:** No stable truth API, custom solutions, manual integrations
- **Workarounds:** Building custom memory solutions, manual document processing, no persistent memory
- **Why they'd switch:** Need stable truth API for agents/automations; no current solution exists
- **Switching barriers:** Low (new capability, not replacing existing tool)
### Sales Cycle & Decision Process
- **Sales cycle:** 7-30 days (API exploration → integration → purchase)
- **Decision maker:** Developer (may need manager approval for team/org plans)
- **Decision process:** Discover API → test integration → see value → purchase (may need approval)
- **Touchpoints:** Developer communities, API documentation, GitHub, developer blogs
- **Sales model:** Self-serve with developer support
### Key Objections
- **"API stability concerns"** → API versioning, deprecation policy, changelog, backward compatibility
- **"API complexity"** → Clear API docs, code examples, SDKs, interactive API explorer
- **"Webhook setup complexity"** → Webhook UI, test webhook feature, webhook templates
- **"Rate limits/performance"** → Clear rate limits, usage dashboard, performance SLAs, caching
- **"Budget approval"** → Developer-focused pricing, usage-based options, free tier
### Buying Signals
- **Strong signals:** Building agents/automations, posts about API needs, active in developer communities
- **Medium signals:** Developer with automation projects, API integrations, internal tools
- **Weak signals:** General developer interest, automation questions
### Expansion Path
- **Individual → Team/Org:** After building successful integration, expands to team/org usage
- **Expansion trigger:** Integration success, team requests access, org-wide automation needs
- **Expansion mechanics:** Team/org API access, shared integrations, org-wide automation
- **Expansion timeline:** 1-3 months from individual to team/org adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't know Neotoma has developer-friendly APIs
- **Solution:** Developer-focused marketing, API documentation, integration examples, developer blog posts
- **Barrier:** Concern about API stability (will it break my integration?)
- **Solution:** API versioning, deprecation policy, changelog, stable MCP protocol, backward compatibility
**Activation Barriers:**
- **Barrier:** API complexity or unclear documentation
- **Solution:** Clear API docs, code examples, SDKs, interactive API explorer, Postman collection
- **Barrier:** Webhook setup complexity
- **Solution:** Webhook UI, test webhook feature, webhook retry logic, webhook logs, webhook templates
**Retention Barriers:**
- **Barrier:** API changes break integrations
- **Solution:** API versioning, deprecation warnings, migration guides, backward compatibility, changelog
- **Barrier:** Rate limits or performance issues
- **Solution:** Clear rate limits, usage dashboard, performance SLAs, caching options, batch APIs
### Technical Requirements
- Stable MCP API
- Webhook support
- Developer documentation
- Integration examples and SDKs
## 10. AI Tool Integrators (Cursor, Raycast, VSCode, Claude Tools)

*Note: This ICP overlaps with Tier 1 "AI-native Operators (builder-grade)" and Tier 2 "Toolchain Integrators". Preserved for reference.*

### Profile
Developers and teams who integrate Neotoma into AI-native tools (Cursor, Raycast, VSCode, Claude) to provide persistent memory across tools.
### Key Visible Criteria
- **Tool usage:** Active Cursor user, Raycast user, VSCode user with AI extensions, Claude API user
- **Activity signals:** Posts about tool integrations, MCP servers, AI tool extensions
- **Proxy indicators:** Cursor extensions, Raycast plugins, VSCode extensions, MCP server usage
- **Content consumption:** Engages with tool integration content, MCP content, AI tool extension content
- **Community signals:** Active in Cursor Discord, Raycast community, VSCode marketplace, Claude community
### Key Acquisition Channels
- **Tool-specific communities:** Cursor Discord, Raycast community, VSCode marketplace, Claude community
- **Developer communities:** GitHub, Hacker News, developer forums, tool-specific Reddit communities
- **Content marketing:** Tool integration tutorials, "memory for [tool]" content, integration case studies
- **Partnerships:** Tool marketplaces (Cursor extensions, Raycast plugins, VSCode extensions), MCP server directories
- **SEO:** "[tool] memory", "[tool] persistent context", "memory integration" keywords
- **Paid:** Tool marketplace featured listings, developer-focused ads, retargeting from tool usage
### Estimated Worldwide Population
**200K-500K** (developers using Cursor, Raycast, VSCode, Claude who want memory integration)
### Pain Points
- **Tool-specific memory:** Each AI tool has its own memory, no cross-tool persistence
- **Context loss:** Switching between tools loses context
- **No unified memory:** Can't share memory across different AI tools
- **Integration complexity:** Difficult to integrate memory into existing tools
- **Limited tool support:** Not all AI tools support memory integration
### Use Cases
- **Cursor integration:** Persistent memory for Cursor AI coding assistant
- **Raycast integration:** Memory for Raycast AI commands
- **VSCode integration:** Memory for VSCode AI extensions
- **Claude Tools integration:** Memory for Claude desktop and API
- **Cross-tool memory:** Shared memory across multiple AI tools
### Document Types
- Code documentation
- Project files
- Configuration files
- Developer notes
- Tool-specific documents
### Workflows
1. **Tool setup** → Configure Neotoma integration in AI tool
2. **Document ingestion** → Upload project documents
3. **Cross-tool queries** → Query memory from any integrated tool
4. **Memory persistence** → Memory persists across tool switches
### Value Proposition
- **Unified memory:** Single memory substrate across all AI tools
- **Context persistence:** Memory persists when switching tools
- **Cross-tool synthesis:** AI can connect information across tools
- **Seamless integration:** Easy integration into existing AI tools
### A-ha Moment
When they switch from Cursor to Claude and ask about the same project, and Claude has the context from documents they uploaded in Cursor. They realize memory is truly unified across tools.
### Ready-to-Pay Threshold
After successfully using memory across 2-3 different AI tools (e.g., Cursor, Claude, Raycast) and seeing context persist. They've experienced cross-tool memory and are ready to pay to maintain it.
### Adoption Characteristics
- **Activation:** Low friction (developers understand integrations)
- **Willingness to pay:** Medium (may be expense-able)
- **Retention:** Strong (becomes core infrastructure)
- **Expansion:** Natural expansion as more tools integrate
### Pricing Sensitivity & Price Points
- **Current spend:** $0-50/month on tool integrations (many free, some paid extensions)
- **Price sensitivity:** Medium (developers value free tools, but pay for valuable integrations)
- **Acceptable range:** $10-50/month for individual, $50-300/month for team
- **Value anchor:** Compares to tool extensions, integration services, developer tools
- **Payment method:** Credit card, company expense, usage-based pricing
### Competitive Alternatives
- **Current solutions:** No cross-tool memory, tool-specific memory, no unified solution
- **Workarounds:** Using tool-specific memory, manual context switching, no memory persistence
- **Why they'd switch:** Need unified memory across tools; no current solution exists
- **Switching barriers:** Low (new capability, non-invasive integration)
### Sales Cycle & Decision Process
- **Sales cycle:** 7-21 days (tool discovery → integration setup → purchase)
- **Decision maker:** Developer/user (individual decision)
- **Decision process:** Discover integration → setup → see value → purchase
- **Touchpoints:** Tool marketplaces, tool communities, integration directories, MCP servers
- **Sales model:** Self-serve with tool-specific setup guides
### Key Objections
- **"Tool compatibility concerns"** → Compatibility matrix, tool-specific guides, rollback options
- **"Integration setup complexity"** → Tool-specific wizards, one-click installs, video tutorials
- **"Memory sync reliability"** → Real-time sync, sync status indicators, conflict resolution
- **"Integration breaks on tool updates"** → Stable integrations, version compatibility, auto-update handling
- **"Privacy concerns"** → Clear privacy policy, data handling, tool-specific privacy
### Buying Signals
- **Strong signals:** Uses multiple AI tools, posts about tool memory, active in tool communities
- **Medium signals:** Developer with tool integrations, early adopter, tool power user
- **Weak signals:** General tool interest, productivity questions
### Expansion Path
- **Individual → Team:** After successful integration, team adopts for shared memory
- **Expansion trigger:** Integration success, team sees value, requests team access
- **Expansion mechanics:** Team workspace, shared memory, team tool integrations
- **Expansion timeline:** 2-4 weeks from individual to team adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't know Neotoma integrates with their AI tools
- **Solution:** Tool-specific landing pages, integration marketplace, "works with Cursor/Raycast" messaging
- **Barrier:** Concern about tool compatibility or breaking existing workflows
- **Solution:** Non-invasive integration (read-only), tool-specific setup guides, rollback options, compatibility matrix
**Activation Barriers:**
- **Barrier:** Integration setup complexity (different for each tool)
- **Solution:** Tool-specific setup wizards, one-click installs, video tutorials, troubleshooting guides
- **Barrier:** Initial memory empty (no documents yet)
- **Solution:** Quick start guide, sample data, "import from tool" features, onboarding flow
**Retention Barriers:**
- **Barrier:** Integration breaks when tool updates
- **Solution:** Stable integrations, version compatibility, auto-update handling, integration health monitoring
- **Barrier:** Memory not syncing across tools
- **Solution:** Real-time sync, cross-tool memory visibility, sync status indicators, conflict resolution
### Technical Requirements
- MCP server for tool integration
- Tool-specific integration guides
- API stability for integrations
- Webhook support for real-time updates
# B2C Power Users — Long-Term Organic Growth

These ICPs get value from Neotoma but are not ideal developer-release targets. They will convert gradually through inbound, bottom-up adoption once the product has lower friction.

## 11. Cross-Border Solopreneurs
### Profile
Solo entrepreneurs who operate across multiple jurisdictions. High document entropy from receipts, invoicing, travel, and compliance requirements.
### Key Visible Criteria
- **Job titles:** Freelancer, Consultant, Solopreneur, Digital Nomad, Remote Worker
- **Location signals:** Multiple countries in work history, remote work, digital nomad indicators
- **Activity signals:** Posts about multi-jurisdiction work, tax complexity, cross-border business
- **Tool usage:** Uses accounting software (QuickBooks, Xero), tax software, expense tracking tools
- **Proxy indicators:** Nomad List member, remote work communities, expat communities, multiple currencies
- **Content consumption:** Engages with expat content, tax content, remote work content, solopreneur content
### Key Acquisition Channels
- **Entrepreneur communities:** Indie Hackers, Nomad List, remote work communities, solopreneur forums
- **Content marketing:** "Managing documents across countries", tax preparation content, solopreneur case studies
- **SEO:** "multi-jurisdiction document management", "cross-border expense tracking", "solopreneur tools" keywords
- **Partnerships:** Accounting software (QuickBooks, Xero), tax software, remote work platforms
- **Paid:** Google Ads (tax season keywords), Facebook/Instagram ads (solopreneur targeting), retargeting
### Estimated Worldwide Population
**5-10 million** (solopreneurs operating across borders globally, with significant overlap in digital nomad and remote work communities)
### Pain Points
- **Multi-jurisdiction complexity:** Documents from multiple countries, currencies, tax systems
- **Receipt management:** Hundreds of receipts across personal and business expenses
- **Invoice tracking:** Client invoices across multiple currencies and jurisdictions
- **Travel documentation:** Flight receipts, hotel bookings, expense reports
- **Compliance documentation:** Tax documents, compliance forms, regulatory filings
### Use Cases
- **Expense tracking:** Upload receipts → categorize by business/personal, jurisdiction
- **Invoice management:** Track client invoices, payments, currencies
- **Travel expense reporting:** Upload travel documents → generate expense reports
- **Tax preparation:** Organize documents by jurisdiction for tax filing
- **Compliance tracking:** Maintain compliance documentation across jurisdictions
### Document Types
- Receipts (business and personal)
- Invoices (client invoices, vendor invoices)
- Travel documents (flights, hotels, car rentals)
- Tax documents (W-9s, 1099s, tax returns)
- Compliance forms (regulatory filings, licenses)
- Bank statements (multiple currencies)
### Workflows
1. **Bulk upload** → Upload receipts and invoices
2. **Categorization** → "Show me all business expenses from Q1"
3. **Tax preparation** → "Organize all tax documents by jurisdiction"
4. **Expense reporting** → "Generate expense report for last month"
### Value Proposition
- **Multi-jurisdiction support:** Handle documents from multiple countries
- **Expense organization:** Automatic categorization of receipts and invoices
- **Tax readiness:** Easy organization for tax preparation
- **Compliance tracking:** Maintain compliance documentation
### A-ha Moment
When they query "Show me all business expenses from Q1 by jurisdiction" and get a clean breakdown with proper currency conversion and categorization. They realize multi-jurisdiction organization is actually working.
### Ready-to-Pay Threshold
During tax season when they successfully organize documents by jurisdiction and generate tax-ready reports in hours instead of days. They see clear ROI and are ready to pay (may be tax-deductible).
### Adoption Characteristics
- **Activation:** Medium friction (requires education on value)
- **Willingness to pay:** Medium (personal expense, may be tax-deductible)
- **Retention:** Moderate (seasonal use, tax time)
- **Expansion:** Slow, organic growth
### Pricing Sensitivity & Price Points
- **Current spend:** $20-100/month on accounting/tax tools (QuickBooks, Xero, tax software)
- **Price sensitivity:** Medium-high (personal expense, price-conscious)
- **Acceptable range:** $10-30/month for individual, annual discount preferred
- **Value anchor:** Compares to accounting software, tax software, expense tracking tools
- **Payment method:** Credit card, annual payment preferred, tax-deductible messaging
### Competitive Alternatives
- **Current solutions:** Accounting software (QuickBooks, Xero), tax software, manual organization
- **Workarounds:** Manual receipt organization, spreadsheet tracking, multiple accounting systems
- **Why they'd switch:** No current solution provides multi-jurisdiction organization with AI; manual work is time-consuming
- **Switching barriers:** Medium (may have existing accounting systems, but Neotoma is additive)
### Sales Cycle & Decision Process
- **Sales cycle:** 14-60 days (discovery → evaluation → tax season trigger → purchase)
- **Decision maker:** Individual (personal decision)
- **Decision process:** Discover → evaluate → trial → see value → purchase (often triggered by tax season)
- **Touchpoints:** Solopreneur communities, tax content, accounting software partnerships, SEO
- **Sales model:** Self-serve with tax season marketing push
### Key Objections
- **"Price sensitivity"** → Free tier, tax-deductible messaging, annual discount, "save time on taxes" ROI
- **"Multi-jurisdiction setup complexity"** → Simple setup wizard, auto-detection, templates
- **"Receipt OCR accuracy concerns"** → High-accuracy OCR, manual correction, confidence scores
- **"Seasonal use only"** → Year-round value messaging, expense tracking, invoice management
- **"Integration with accounting software"** → Accounting software integrations, export capabilities
### Buying Signals
- **Strong signals:** Tax season, posts about multi-jurisdiction taxes, active in expat/solopreneur communities
- **Medium signals:** Multiple currencies, remote work, expat status, accounting software usage
- **Weak signals:** General expense tracking interest, tax questions
### Expansion Path
- **Individual → Business:** After personal use, expands to business expense tracking
- **Expansion trigger:** Business growth, more receipts, business expense needs
- **Expansion mechanics:** Business workspace, business expense categorization, business reporting
- **Expansion timeline:** 6-12 months from personal to business use
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't understand value proposition (seems like "another expense tracker")
- **Solution:** Clear value prop: "AI-powered document memory for multi-jurisdiction business", tax-time ROI messaging
- **Barrier:** Price sensitivity (personal expense)
- **Solution:** Free tier with limits, tax-deductible messaging, annual discount, "save time on taxes" ROI
**Activation Barriers:**
- **Barrier:** Multi-currency/jurisdiction setup complexity
- **Solution:** Simple currency/jurisdiction selection, auto-detection, templates, setup wizard
- **Barrier:** Receipt OCR accuracy concerns (critical for tax)
- **Solution:** High-accuracy OCR, manual correction tools, confidence scores, batch review, tax-ready export
**Retention Barriers:**
- **Barrier:** Seasonal use (only during tax time)
- **Solution:** Year-round value (expense tracking, invoice management), tax-time reminders, year-end summary
- **Barrier:** Forgetting to upload receipts (habit formation)
- **Solution:** Mobile app for quick photo upload, email forwarding, receipt scanning reminders, auto-categorization
### Technical Requirements
- Multi-currency support
- Multi-jurisdiction organization
- Receipt OCR accuracy
- Tax document categorization
## 12. Multi-System Information Workers
### Profile
Knowledge workers who use multiple systems (Gmail, Notes, Drive, PDFs, screenshots) interchangeably. Benefit from unification but require education.
### Key Visible Criteria
- **Tool usage:** Uses Gmail, Google Drive, Dropbox, Apple Notes, Notion, multiple document storage systems
- **Activity signals:** Posts about productivity, organization, document management, information overload
- **Proxy indicators:** Multiple cloud storage accounts, email attachments, screenshot folders, document chaos
- **Content consumption:** Engages with productivity content, organization content, "digital decluttering" content
- **Behavior signals:** Searches for documents across systems, mentions "can't find documents", organization struggles
### Key Acquisition Channels
- **General productivity communities:** Reddit (r/productivity, r/getorganized), productivity blogs, life hack communities
- **Content marketing:** "Unified search across systems", productivity case studies, "organize your digital life" content
- **SEO:** "search across Gmail and Drive", "unified document search", "organize documents" keywords
- **Partnerships:** Gmail add-ons, Google Workspace marketplace, productivity tool integrations
- **Paid:** Google Ads (productivity keywords), Facebook/Instagram ads (knowledge worker targeting), retargeting
### Estimated Worldwide Population
**50-100 million** (knowledge workers using multiple systems globally, but requires education to convert)
### Pain Points
- **System fragmentation:** Information scattered across Gmail, Notes, Drive, PDFs, screenshots
- **Search limitations:** Can't search across all systems simultaneously
- **No unified view:** Can't see all information in one place
- **Context loss:** Switching between systems loses context
- **Duplicate information:** Same information stored in multiple systems
### Use Cases
- **Unified search:** Search across Gmail, Drive, PDFs, screenshots
- **Document organization:** Organize documents from multiple sources
- **Context preservation:** Maintain context across system switches
- **Information synthesis:** Synthesize information from multiple systems
- **Workflow unification:** Single workflow for all document types
### Document Types
- Email attachments (Gmail)
- Notes (Apple Notes, Notion, etc.)
- Cloud drive files (Google Drive, Dropbox)
- PDFs (downloads, scans)
- Screenshots (phone, desktop)
- Images (photos, scans)
### Workflows
1. **System integration** → Connect Gmail, Drive, etc.
2. **Document ingestion** → Upload documents from all sources
3. **Unified search** → Search across all systems
4. **Context preservation** → Maintain context across systems
### Value Proposition
- **Unified memory:** Single memory substrate across all systems
- **Cross-system search:** Search across Gmail, Drive, PDFs, screenshots
- **Context preservation:** Memory persists across system switches
- **Workflow simplification:** Single workflow for all document types
### A-ha Moment
When they search for a term and results come back from Gmail attachments, Google Drive files, downloaded PDFs, and screenshots—all in one unified results list. They realize they can finally search across all their systems.
### Ready-to-Pay Threshold
After successfully finding information 3-5 times that they couldn't find before (e.g., "that document I know exists but can't remember where"). They've experienced the value of unified search and are ready to pay.
### Adoption Characteristics
- **Activation:** High friction (requires education, setup)
- **Willingness to pay:** Low-medium (personal expense)
- **Retention:** Moderate (requires habit formation)
- **Expansion:** Slow, organic growth
### Pricing Sensitivity & Price Points
- **Current spend:** $0-20/month on productivity tools (many free, some paid)
- **Price sensitivity:** High (personal expense, price-sensitive)
- **Acceptable range:** $5-20/month for individual, free tier important
- **Value anchor:** Compares to productivity tools, organization apps, search tools
- **Payment method:** Credit card, annual discount preferred, free tier to start
### Competitive Alternatives
- **Current solutions:** Gmail, Google Drive, Dropbox, Apple Notes, no unified search
- **Workarounds:** Manual organization, multiple search tools, no cross-system search
- **Why they'd switch:** No current solution provides unified search across systems; fragmentation is painful
- **Switching barriers:** High (requires education, habit formation, multiple integrations)
### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (education → evaluation → trial → habit formation → purchase)
- **Decision maker:** Individual (personal decision)
- **Decision process:** Discover → educate → evaluate → trial → form habit → purchase
- **Touchpoints:** Productivity communities, content marketing, SEO, social media
- **Sales model:** Self-serve with education-focused content
### Key Objections
- **"Don't understand the problem"** → Education content, demo showing unified search, before/after examples
- **"Setup complexity"** → Progressive onboarding, one integration at a time, setup wizard
- **"Price sensitivity"** → Free tier, clear value prop, annual discount, "unified search" value
- **"Habit formation"** → Browser extension, desktop app, reminders, usage tips
- **"Search not finding what I need"** → Advanced search, search suggestions, search tips
### Buying Signals
- **Strong signals:** Posts about "can't find documents", mentions multiple systems, active in productivity communities
- **Medium signals:** Uses multiple cloud storage, email attachments, screenshots, productivity tool usage
- **Weak signals:** General organization interest, productivity questions
### Expansion Path
- **Individual → Family:** After personal use, expands to family document management
- **Expansion trigger:** Family needs, shared documents, family organization
- **Expansion mechanics:** Family workspace, family member organization, shared documents
- **Expansion timeline:** 6-12 months from individual to family use
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't understand the problem (used to fragmented systems)
- **Solution:** "Unified search across all your systems" messaging, demo showing Gmail + Drive + PDFs search
- **Barrier:** Setup seems complex (multiple integrations)
- **Solution:** One-click integrations, setup wizard, "connect as you go" approach, integration marketplace
**Activation Barriers:**
- **Barrier:** Multiple system integrations (Gmail, Drive, etc.) feel overwhelming
- **Solution:** Progressive onboarding (one system at a time), integration templates, "start with Gmail" flow
- **Barrier:** Initial search results empty (no documents indexed yet)
- **Solution:** Quick indexing progress, "indexing your documents" status, sample queries, onboarding tips
**Retention Barriers:**
- **Barrier:** Forgetting to use it (not top of mind)
- **Solution:** Browser extension, desktop app, search shortcuts, weekly digest emails, usage reminders
- **Barrier:** Search not finding what they need (low recall)
- **Solution:** Advanced search filters, search suggestions, "did you mean", search analytics, search tips
### Technical Requirements
- Gmail integration
- Cloud drive integration
- Screenshot handling
- Multi-source ingestion
## 13. High-Entropy Households / Family Managers
### Profile
Family managers who handle documents for entire households. Strong personal need but slow adoption curve.
### Key Visible Criteria
- **Demographics:** Age 30-50, parents, household managers
- **Activity signals:** Posts about family organization, document management, expiration tracking, household management
- **Tool usage:** Uses family apps, calendar apps, organization apps, photo storage
- **Proxy indicators:** Multiple family members, school forms, medical records, insurance documents, travel documents
- **Content consumption:** Engages with family organization content, parenting content, household management content
- **Behavior signals:** Mentions "lost documents", "expiration dates", "family paperwork", organization struggles
### Key Acquisition Channels
- **Family/parenting communities:** Reddit (r/parenting, r/mommit, r/daddit), parenting blogs, family organization forums
- **Content marketing:** "Never lose important documents", family organization tips, expiration tracking content
- **SEO:** "family document organization", "track passport expiration", "organize family documents" keywords
- **Partnerships:** Family apps, calendar apps, organization tools
- **Paid:** Facebook/Instagram ads (parent targeting, age 30-50), Google Ads (family organization keywords), retargeting
### Estimated Worldwide Population
**100-200 million** (family managers globally, but slow adoption due to price sensitivity and education requirements)
### Pain Points
- **Document chaos:** Kids' school forms, medical records, insurance, travel, repairs
- **No organization:** Documents scattered across email, downloads, photos
- **Expiration tracking:** Can't track expiration dates (passports, insurance, licenses)
- **Family member tracking:** Can't track documents by family member
- **Emergency access:** Can't quickly find important documents in emergencies
### Use Cases
- **Family document management:** Organize documents by family member
- **Expiration tracking:** Track expiration dates for passports, insurance, licenses
- **Medical records:** Organize medical records, prescriptions, appointments
- **School forms:** Track school forms, permission slips, report cards
- **Travel planning:** Organize travel documents for family trips
### Document Types
- School forms and report cards
- Medical records and prescriptions
- Insurance documents
- Travel documents (passports, visas, tickets)
- Home repair receipts
- Tax documents (family)
### Workflows
1. **Family setup** → Configure family members
2. **Document ingestion** → Upload family documents
3. **Family member queries** → "Show me all documents for Sarah"
4. **Expiration tracking** → "What expires in the next 3 months?"
### Value Proposition
- **Family organization:** Organize documents by family member
- **Expiration tracking:** Never miss expiration dates
- **Emergency access:** Quick access to important documents
- **Peace of mind:** Know where all important documents are
### A-ha Moment
When they get an expiration alert for a passport 3 months before it expires, and they can instantly find and access the passport document. They realize they'll never miss an important expiration again.
### Ready-to-Pay Threshold
After successfully organizing documents for 2-3 family members and receiving useful expiration alerts. They've seen the peace of mind value and are ready to pay (price-sensitive, needs family pricing).
### Adoption Characteristics
- **Activation:** High friction (requires education, setup)
- **Willingness to pay:** Low (personal expense, price-sensitive)
- **Retention:** Moderate (requires habit formation)
- **Expansion:** Very slow, word-of-mouth growth
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Don't see the problem (used to document chaos)
- **Solution:** "Never lose important documents again" messaging, expiration tracking demo, emergency access value prop
- **Barrier:** Price sensitivity (family expense)
- **Solution:** Family pricing, free tier with limits, "peace of mind" value prop, annual discount
**Activation Barriers:**
- **Barrier:** Family setup complexity (multiple family members)
- **Solution:** Simple family member setup, family templates, "add as you go", family onboarding wizard
- **Barrier:** Document organization feels overwhelming (hundreds of documents)
- **Solution:** Auto-categorization, smart folders, "start with recent documents", bulk organization tools
**Retention Barriers:**
- **Barrier:** Forgetting to upload new documents (habit formation)
- **Solution:** Mobile app for quick uploads, email forwarding, photo scanning, reminder notifications
- **Barrier:** Expiration tracking not accurate (dates wrong)
- **Solution:** High-accuracy date extraction, manual date correction, expiration alerts, calendar integration
### Technical Requirements
- Family member organization
- Expiration date tracking
- Medical record handling
- School form recognition
# Future Product Layer: Strategy (Agentic Portfolio)

Requires later product maturity and asset/tax modeling stack.

## 14. High-Net-Worth Individuals
### Profile
High-net-worth individuals who need sophisticated financial planning and asset management. Require Agentic Portfolio capabilities built on Neotoma.
### Key Visible Criteria
- **Wealth indicators:** $1M+ investable assets (estimated from job title, company, industry, location)
- **Job titles:** C-level executives, senior partners, successful entrepreneurs, investors
- **LinkedIn signals:** Senior positions, high-value companies, investment activity, board positions
- **Activity signals:** Posts about wealth management, financial planning, investment strategies
- **Proxy indicators:** Financial advisor relationships, private banking, wealth management platforms, investment activity
- **Content consumption:** Engages with wealth management content, financial planning content, HNW content
### Key Acquisition Channels
- **Wealth management channels:** Financial advisor networks, private banking referrals, wealth management conferences
- **Content marketing:** Wealth management case studies, tax optimization content, HNW financial planning content
- **Partnerships:** Financial advisors, wealth management platforms, private banks, family offices
- **SEO:** "wealth management tools", "HNW financial planning", "multi-jurisdiction wealth" keywords
- **Paid:** LinkedIn ads (high-income targeting), financial publication ads, advisor referrals
### Estimated Worldwide Population
**2-5 million** (HNW individuals globally with $1M+ investable assets requiring sophisticated planning)
### Pain Points
- **Complex asset management:** Multiple asset classes, accounts, jurisdictions
- **Tax optimization:** Need sophisticated tax planning across jurisdictions
- **Risk management:** Need to track and manage risk across portfolio
- **Multi-jurisdiction complexity:** Assets and income across multiple countries
- **Estate planning:** Need to organize documents for estate planning
### Use Cases
- **Portfolio management:** Track assets across multiple accounts and jurisdictions
- **Tax optimization:** Organize documents for tax planning and optimization
- **Risk analysis:** Analyze risk across portfolio
- **Estate planning:** Organize documents for estate planning
- **Compliance tracking:** Maintain compliance documentation
### Document Types
- Financial statements (multiple accounts)
- Tax documents (multiple jurisdictions)
- Investment statements
- Estate planning documents
- Compliance documentation
- Legal documents
### A-ha Moment
When the Agentic Portfolio layer analyzes their multi-jurisdiction portfolio and suggests a tax-optimized rebalancing strategy that saves them significant tax liability while maintaining risk targets. They realize the strategy engine understands their complex financial situation.
### Ready-to-Pay Threshold
After successfully using Agentic Portfolio for 2-3 months and seeing measurable improvements (tax savings, risk-adjusted returns, time savings). They've proven the value and are ready for high ACV subscription (requires mature product).
### Pricing Sensitivity & Price Points
- **Current spend:** $5000-50000/year on wealth management, financial advisors, tax advisors
- **Price sensitivity:** Low (high ACV acceptable, values sophisticated tools)
- **Acceptable range:** $2000-10000/year for individual, $10000-50000/year for family office
- **Value anchor:** Compares to wealth management fees, financial advisor fees, tax optimization services
- **Payment method:** Wire transfer, annual contracts, advisor billing
### Competitive Alternatives
- **Current solutions:** Wealth management platforms, financial advisors, tax advisors, no strategy engine solution
- **Workarounds:** Manual portfolio management, advisor consultations, spreadsheet tracking
- **Why they'd switch:** No current solution provides Agentic Portfolio strategy engine; manual work is time-consuming
- **Switching barriers:** High (requires product maturity, trust, advisor partnerships)
### Sales Cycle & Decision Process
- **Sales cycle:** 90-180 days (evaluation → pilot → advisor consultation → purchase)
- **Decision maker:** Individual with financial advisor consultation
- **Decision process:** Discover → evaluate → pilot → advisor review → purchase (requires mature product)
- **Touchpoints:** Financial advisor networks, wealth management conferences, private banking referrals
- **Sales model:** High-touch sales with advisor partnerships, white-glove onboarding
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, advisor partnerships
- **"Trust concerns"** → Enterprise security, compliance certifications, audit trails, advisor validation
- **"Setup complexity"** → Financial advisor assistance, white-glove setup, configuration templates
- **"Strategy engine accuracy"** → High-accuracy modeling, manual override, audit trails, performance tracking
- **"Integration complexity"** → API integrations, bank connections, portfolio import, migration support
### Buying Signals
- **Strong signals:** HNW individual, posts about portfolio management, active with financial advisors
- **Medium signals:** High-income, investment activity, wealth management platform usage
- **Weak signals:** General financial planning interest, tax optimization questions
### Expansion Path
- **Individual → Family Office:** After individual use, expands to family wealth management
- **Expansion trigger:** Family wealth needs, multi-generational planning, family office setup
- **Expansion mechanics:** Family office workspace, family wealth management, estate planning
- **Expansion timeline:** 6-12 months from individual to family office adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Portfolio layer)
- **Solution:** Clear roadmap communication, waitlist for early access, pilot program for HNW users
- **Barrier:** Trust concerns (handling sensitive financial data)
- **Solution:** Enterprise-grade security, compliance certifications, audit trails, data residency options
**Activation Barriers:**
- **Barrier:** Complex setup (multi-asset, multi-jurisdiction configuration)
- **Solution:** Financial advisor onboarding assistance, white-glove setup, configuration templates
- **Barrier:** Integration with existing financial systems
- **Solution:** API integrations with wealth management platforms, bank connections, portfolio import
**Retention Barriers:**
- **Barrier:** Strategy engine accuracy concerns (critical for wealth management)
- **Solution:** High-accuracy portfolio modeling, manual override options, audit trails, performance tracking
- **Barrier:** Ongoing support needs (complex use case)
- **Solution:** Dedicated support, financial advisor partnerships, regular check-ins, strategy reviews
### Technical Requirements
- Agentic Portfolio layer (strategy engine)
- Multi-asset support
- Tax optimization capabilities
- Risk management features
- Multi-jurisdiction support
## 15. Multi-Jurisdiction Residents
### Profile
Individuals who live or work across multiple jurisdictions. Need sophisticated tax and compliance management.
### Key Visible Criteria
- **Location signals:** Multiple countries in work history, expat status, digital nomad, international remote work
- **Job titles:** International roles, expat assignments, remote workers in different countries
- **Activity signals:** Posts about multi-jurisdiction taxes, expat life, international work, tax complexity
- **Tool usage:** Uses international tax software, expat services, multi-currency tools
- **Proxy indicators:** Nomad List member, expat communities, multiple tax filings, international tax advisors
- **Content consumption:** Engages with expat content, international tax content, multi-jurisdiction content
### Key Acquisition Channels
- **Expat/digital nomad communities:** Nomad List, expat forums, remote work communities, international tax communities
- **Content marketing:** Multi-jurisdiction tax content, expat financial planning, compliance case studies
- **Partnerships:** Expat services, international tax advisors, relocation services, remote work platforms
- **SEO:** "multi-jurisdiction tax", "expat tax planning", "cross-border compliance" keywords
- **Paid:** LinkedIn ads (expat targeting), Google Ads (tax season, multi-jurisdiction keywords), retargeting
### Estimated Worldwide Population
**10-20 million** (individuals living or working across multiple jurisdictions globally)
### Pain Points
- **Multi-jurisdiction tax complexity:** Tax obligations across multiple countries
- **Compliance tracking:** Maintain compliance across jurisdictions
- **Document organization:** Organize documents by jurisdiction
- **Currency management:** Track assets and income in multiple currencies
- **Regulatory compliance:** Stay compliant with regulations in each jurisdiction
### Use Cases
- **Tax preparation:** Organize documents by jurisdiction for tax filing
- **Compliance tracking:** Maintain compliance documentation across jurisdictions
- **Asset tracking:** Track assets across jurisdictions
- **Regulatory compliance:** Stay compliant with regulations
- **Financial planning:** Plan finances across jurisdictions
### Document Types
- Tax documents (multiple jurisdictions)
- Compliance forms
- Financial statements (multiple currencies)
- Legal documents
- Regulatory filings
### A-ha Moment
When they query "Show me all tax obligations by jurisdiction for 2024" and get a clear breakdown with optimization suggestions that reduce their overall tax burden across countries. They realize multi-jurisdiction tax planning is now automated.
### Ready-to-Pay Threshold
After successfully organizing documents and running tax optimization scenarios that result in measurable tax savings. They see clear ROI and are ready for high ACV subscription (requires mature product).
### Pricing Sensitivity & Price Points
- **Current spend:** $2000-10000/year on tax advisors, compliance services, tax software
- **Price sensitivity:** Low-medium (values tax savings, but cost-conscious)
- **Acceptable range:** $1000-5000/year for individual, $5000-20000/year for complex cases
- **Value anchor:** Compares to tax advisor fees, compliance services, tax optimization value
- **Payment method:** Credit card, annual contracts, tax-deductible
### Competitive Alternatives
- **Current solutions:** Tax advisors, tax software, compliance services, no multi-jurisdiction optimization
- **Workarounds:** Manual tax organization, multiple tax advisors, spreadsheet tracking
- **Why they'd switch:** No current solution provides multi-jurisdiction tax optimization; manual work is complex
- **Switching barriers:** High (requires product maturity, tax expertise, advisor partnerships)
### Sales Cycle & Decision Process
- **Sales cycle:** 60-120 days (evaluation → tax season → advisor consultation → purchase)
- **Decision maker:** Individual with tax advisor consultation
- **Decision process:** Discover → evaluate → tax season trigger → advisor review → purchase
- **Touchpoints:** Expat communities, tax advisor networks, tax conferences, SEO
- **Sales model:** Sales-assisted with tax advisor partnerships, tax season marketing
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, tax advisor partnerships
- **"Tax complexity concerns"** → Tax expertise, advisor validation, compliance certifications
- **"Multi-jurisdiction setup"** → Setup wizard, templates, tax advisor assistance
- **"Currency conversion accuracy"** → Real-time rates, transaction tracking, reconciliation
- **"Tax reporting accuracy"** → High-accuracy calculations, manual review, advisor validation
### Buying Signals
- **Strong signals:** Multi-jurisdiction resident, tax season, posts about tax complexity, active with tax advisors
- **Medium signals:** Expat status, remote work, multiple countries, tax questions
- **Weak signals:** General tax interest, compliance questions
### Expansion Path
- **Individual → Family:** After individual use, expands to family tax management
- **Expansion trigger:** Family tax needs, multi-generational planning, family compliance
- **Expansion mechanics:** Family workspace, family tax management, family compliance
- **Expansion timeline:** 6-12 months from individual to family adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Portfolio layer)
- **Solution:** Clear roadmap, waitlist, pilot program, crypto-native messaging
- **Barrier:** Tax complexity concerns (multi-jurisdiction crypto tax)
- **Solution:** Crypto tax expertise, integration with tax software, tax advisor partnerships
**Activation Barriers:**
- **Barrier:** Multi-jurisdiction setup complexity
- **Solution:** Jurisdiction templates, auto-detection, setup wizard, tax advisor assistance
- **Barrier:** Currency conversion and tracking accuracy
- **Solution:** Real-time exchange rates, multi-currency support, transaction tracking, reconciliation tools
**Retention Barriers:**
- **Barrier:** Tax reporting accuracy (critical for compliance)
- **Solution:** High-accuracy tax calculations, manual review tools, tax advisor validation, audit support
- **Barrier:** Ongoing compliance complexity
- **Solution:** Compliance automation, regulatory updates, compliance dashboard, advisor support
### Technical Requirements
- Agentic Portfolio layer (strategy engine)
- Multi-jurisdiction support
- Tax optimization capabilities
- Compliance tracking features
- Currency management
## 16. Crypto-Native Power Users (staking, LPs, vaults)
### Profile
Crypto-native users who engage in staking, liquidity provision, vault strategies. Need sophisticated portfolio management and strategy planning.
### Key Visible Criteria
- **Activity signals:** Posts about DeFi, staking, LPs, vaults, yield farming, crypto strategies
- **Tool usage:** Uses DeFi protocols, staking platforms, LP platforms, yield aggregators, crypto wallets
- **Proxy indicators:** Active DeFi wallet addresses, staking activity, LP positions, vault deposits
- **Content consumption:** Engages with DeFi content, yield optimization content, crypto strategy content
- **Community signals:** Active in DeFi Discord servers, crypto Twitter/X, DeFi Reddit communities
### Key Acquisition Channels
- **Crypto communities:** Crypto Twitter/X, DeFi Discord servers, Reddit (r/defi, r/ethereum, r/cryptocurrency), crypto forums
- **Content marketing:** DeFi strategy content, yield optimization case studies, crypto portfolio management content
- **Partnerships:** DeFi protocols, crypto wallets, yield aggregators, crypto tax platforms
- **SEO:** "DeFi portfolio management", "yield optimization", "crypto strategy" keywords
- **Paid:** Crypto publication ads, Twitter/X crypto community ads, retargeting from crypto tool usage
### Estimated Worldwide Population
**500K-1 million** (active DeFi users engaging in staking, LPs, vaults globally)
### Pain Points
- **Complex portfolio tracking:** Multiple chains, protocols, strategies
- **Yield optimization:** Need to optimize yields across strategies
- **Risk management:** Track and manage risk across crypto portfolio
- **Tax complexity:** Crypto tax reporting across multiple jurisdictions
- **Strategy planning:** Plan and execute complex strategies
### Use Cases
- **Portfolio tracking:** Track assets across multiple chains and protocols
- **Yield optimization:** Optimize yields across staking, LPs, vaults
- **Risk management:** Analyze risk across crypto portfolio
- **Tax reporting:** Organize documents for crypto tax reporting
- **Strategy planning:** Plan and execute strategies
### Document Types
- Transaction records (multiple chains)
- Staking records
- LP position statements
- Vault strategy documents
- Tax documents (crypto)
- Compliance documentation
### A-ha Moment
When Agentic Portfolio analyzes their staking, LP, and vault positions across multiple chains and suggests a yield-optimized rebalancing that increases overall yield while managing risk. They realize the strategy engine understands DeFi complexity.
### Ready-to-Pay Threshold
After successfully using Agentic Portfolio for crypto portfolio management and seeing yield improvements or risk reduction. They've proven the value and are ready for high ACV subscription (requires mature product).
### Pricing Sensitivity & Price Points
- **Current spend:** $100-1000/month on DeFi tools, yield platforms, crypto tax software
- **Price sensitivity:** Medium (crypto-native, values tools, but cost-conscious)
- **Acceptable range:** $50-300/month for individual, $300-2000/month for power users
- **Value anchor:** Compares to DeFi tools, yield platforms, crypto tax software, strategy value
- **Payment method:** Credit card, crypto payment options, annual discount
### Competitive Alternatives
- **Current solutions:** DeFi dashboards, yield platforms, crypto tax software, no strategy engine
- **Workarounds:** Manual portfolio tracking, spreadsheet management, multiple DeFi tools
- **Why they'd switch:** No current solution provides Agentic Portfolio for crypto; manual work is complex
- **Switching barriers:** High (requires product maturity, DeFi expertise, crypto-native trust)
### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (evaluation → pilot → see value → purchase)
- **Decision maker:** Individual (crypto-native decision)
- **Decision process:** Discover → evaluate → pilot → see yield/risk improvements → purchase
- **Touchpoints:** Crypto communities, DeFi platforms, crypto conferences, crypto content
- **Sales model:** Self-serve with crypto community engagement, pilot programs
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, crypto community engagement
- **"Security concerns"** → Security audits, multi-sig, cold storage integration, insurance
- **"Multi-chain complexity"** → Chain templates, auto-detection, setup wizard
- **"Yield calculation accuracy"** → Real-time yield data, manual override, yield history
- **"Crypto tax complexity"** → Crypto tax expertise, tax software integration, tax reports
### Buying Signals
- **Strong signals:** Active DeFi user, posts about yield optimization, staking/LP/vault activity
- **Medium signals:** Crypto-native, DeFi platform usage, crypto tax software usage
- **Weak signals:** General crypto interest, DeFi questions
### Expansion Path
- **Individual → Advanced:** After basic use, expands to advanced strategies
- **Expansion trigger:** Strategy success, yield improvements, risk reduction
- **Expansion mechanics:** Advanced strategy templates, strategy optimization, performance tracking
- **Expansion timeline:** 3-6 months from basic to advanced usage
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Portfolio layer)
- **Solution:** Clear roadmap, crypto-native community engagement, pilot program, DeFi integration messaging
- **Barrier:** Trust concerns (handling crypto transactions and strategies)
- **Solution:** Security audits, multi-sig support, cold storage integration, insurance coverage
**Activation Barriers:**
- **Barrier:** Multi-chain setup complexity
- **Solution:** Chain templates, auto-detection, setup wizard, DeFi protocol integrations
- **Barrier:** Yield calculation accuracy (critical for strategy)
- **Solution:** Real-time yield data, manual override, yield history, strategy backtesting
**Retention Barriers:**
- **Barrier:** Strategy execution complexity
- **Solution:** Strategy templates, automated execution, performance tracking, strategy optimization
- **Barrier:** Tax reporting accuracy (crypto tax complexity)
- **Solution:** Crypto tax expertise, integration with tax software, transaction categorization, tax reports
### Technical Requirements
- Agentic Portfolio layer (strategy engine)
- Multi-chain support
- Yield optimization capabilities
- Risk management features
- Crypto tax support
## 17. Startup Founders with Equity Docs
### Profile
Startup founders who need to manage equity documents, cap tables, and financial planning.
### Key Visible Criteria
- **Job titles:** Founder, Co-Founder, CEO (at startup), Startup Founder
- **Company signals:** Early-stage to growth-stage startup, equity-heavy company, fundraising activity
- **LinkedIn signals:** "Founder" in title, startup company, fundraising announcements, equity discussions
- **Activity signals:** Posts about cap tables, equity, fundraising, startup finances
- **Tool usage:** Uses cap table tools (Carta, Pulley), equity management tools, startup financial tools
- **Proxy indicators:** YC/accelerator alumni, AngelList profile, cap table management, equity grants
- **Content consumption:** Engages with startup equity content, cap table content, founder financial content
### Key Acquisition Channels
- **Startup communities:** Y Combinator, startup accelerators, founder networks, AngelList, startup conferences
- **Content marketing:** Equity management case studies, cap table management content, founder financial planning
- **Partnerships:** Cap table management tools (Carta, Pulley), startup accelerators, investor networks
- **SEO:** "startup equity management", "cap table tools", "founder financial planning" keywords
- **Paid:** LinkedIn ads (founder targeting), startup publication ads, accelerator partnerships
### Estimated Worldwide Population
**200K-500K** (active startup founders globally managing equity and cap tables)
### Pain Points
- **Equity complexity:** Track equity across multiple rounds, investors, employees
- **Cap table management:** Maintain accurate cap tables
- **Financial planning:** Plan finances with equity considerations
- **Tax optimization:** Optimize taxes with equity considerations
- **Investor relations:** Organize documents for investor updates
### Use Cases
- **Equity tracking:** Track equity across rounds and investors
- **Cap table management:** Maintain accurate cap tables
- **Financial planning:** Plan finances with equity considerations
- **Tax optimization:** Optimize taxes with equity considerations
- **Investor relations:** Organize documents for investor updates
### Document Types
- Cap tables
- Equity agreements
- Investor documents
- Financial statements
- Tax documents
- Legal documents
### A-ha Moment
When Agentic Portfolio analyzes their cap table, equity agreements, and financials to suggest tax-optimized equity planning strategies (e.g., exercise timing, 83(b) elections). They realize the strategy engine understands equity complexity.
### Ready-to-Pay Threshold
After successfully using Agentic Portfolio for equity planning and seeing tax savings or optimized equity strategies. They've proven the value and are ready for high ACV subscription (requires mature product).
### Pricing Sensitivity & Price Points
- **Current spend:** $500-5000/year on cap table tools (Carta, Pulley), equity advisors, tax advisors
- **Price sensitivity:** Low-medium (startup expense, but values equity optimization)
- **Acceptable range:** $1000-5000/year for individual, $5000-20000/year for complex equity
- **Value anchor:** Compares to cap table tools, equity advisor fees, tax optimization value
- **Payment method:** Credit card, company expense, annual contracts
### Competitive Alternatives
- **Current solutions:** Cap table tools (Carta, Pulley), equity advisors, tax advisors, no strategy engine
- **Workarounds:** Manual cap table management, advisor consultations, spreadsheet tracking
- **Why they'd switch:** No current solution provides Agentic Portfolio for equity; manual work is complex
- **Switching barriers:** High (requires product maturity, equity expertise, advisor partnerships)
### Sales Cycle & Decision Process
- **Sales cycle:** 60-120 days (evaluation → pilot → advisor consultation → purchase)
- **Decision maker:** Founder with advisor consultation
- **Decision process:** Discover → evaluate → pilot → advisor review → purchase (requires mature product)
- **Touchpoints:** Startup communities, accelerator partnerships, equity advisor networks
- **Sales model:** Sales-assisted with advisor partnerships, startup community engagement
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, advisor partnerships
- **"Cap table accuracy concerns"** → Cap table validation, integration with cap table software, advisor validation
- **"Equity setup complexity"** → Cap table import, round templates, investor templates, setup wizard
- **"Integration concerns"** → API integrations, data import, sync capabilities, migration tools
- **"Equity calculation accuracy"** → High-accuracy calculations, manual review, advisor validation
### Buying Signals
- **Strong signals:** Active founder, equity-heavy startup, posts about cap tables, fundraising activity
- **Medium signals:** Startup founder, equity grants, cap table tool usage, equity questions
- **Weak signals:** General startup interest, equity questions
### Expansion Path
- **Individual → Team:** After individual use, expands to team equity management
- **Expansion trigger:** Team equity needs, investor reporting, team equity planning
- **Expansion mechanics:** Team workspace, team equity management, investor reporting
- **Expansion timeline:** 3-6 months from individual to team adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Portfolio layer)
- **Solution:** Clear roadmap, startup founder community engagement, pilot program, equity management messaging
- **Barrier:** Cap table accuracy concerns (critical for equity management)
- **Solution:** Cap table validation, integration with cap table software, legal advisor partnerships
**Activation Barriers:**
- **Barrier:** Equity setup complexity (multiple rounds, investors, employees)
- **Solution:** Cap table import, round templates, investor templates, setup wizard
- **Barrier:** Integration with existing equity management tools
- **Solution:** API integrations, data import, sync capabilities, migration tools
**Retention Barriers:**
- **Barrier:** Equity calculation accuracy (critical for compliance)
- **Solution:** High-accuracy calculations, manual review, audit trails, legal validation
- **Barrier:** Ongoing equity management complexity
- **Solution:** Automated updates, investor reporting, equity dashboard, advisor support
### Technical Requirements
- Agentic Portfolio layer (strategy engine)
- Equity tracking capabilities
- Cap table management
- Financial planning features
- Tax optimization
## 18. Family-Office-Lite Users
### Profile
High-net-worth individuals who need family-office-like services but at a lower scale.
### Key Visible Criteria
- **Wealth indicators:** $1M+ investable assets, family wealth, multi-generational wealth
- **Job titles:** C-level executives, senior partners, successful entrepreneurs, family business owners
- **LinkedIn signals:** Senior positions, family business, wealth management, estate planning
- **Activity signals:** Posts about family wealth, estate planning, multi-generational planning
- **Proxy indicators:** Family office relationships, wealth advisors, estate planning, family business
- **Content consumption:** Engages with family office content, estate planning content, family wealth content
### Key Acquisition Channels
- **Wealth management channels:** Financial advisor networks, family office referrals, HNW communities
- **Content marketing:** Family wealth management content, estate planning case studies, multi-generational wealth content
- **Partnerships:** Financial advisors, family office networks, wealth management platforms
- **SEO:** "family office services", "family wealth management", "estate planning tools" keywords
- **Paid:** LinkedIn ads (high-income targeting), financial publication ads, advisor referrals
### Estimated Worldwide Population
**1-2 million** (HNW individuals globally seeking family-office-like services at lower scale)
### Pain Points
- **Complex asset management:** Multiple asset classes, accounts, family members
- **Family wealth planning:** Plan wealth across family members
- **Tax optimization:** Optimize taxes across family
- **Estate planning:** Plan estates for family
- **Compliance tracking:** Maintain compliance across family
### Use Cases
- **Family wealth management:** Manage wealth across family members
- **Tax optimization:** Optimize taxes across family
- **Estate planning:** Plan estates for family
- **Compliance tracking:** Maintain compliance across family
- **Financial planning:** Plan finances for family
### Document Types
- Financial statements (family)
- Tax documents (family)
- Estate planning documents
- Legal documents
- Compliance documentation
### A-ha Moment
When Agentic Portfolio analyzes their family's multi-generational wealth and suggests estate planning strategies that optimize taxes while preserving wealth across family members. They realize family office-level planning is now accessible.
### Ready-to-Pay Threshold
After successfully using Agentic Portfolio for family wealth management and seeing measurable improvements (tax savings, estate optimization, time savings). They've proven the value and are ready for high ACV subscription (requires mature product).
### Pricing Sensitivity & Price Points
- **Current spend:** $10000-100000/year on family office services, wealth advisors, estate planners
- **Price sensitivity:** Low (high ACV acceptable, values family office services)
- **Acceptable range:** $5000-25000/year for family, $25000-100000/year for complex family office
- **Value anchor:** Compares to family office fees, wealth advisor fees, estate planning services
- **Payment method:** Wire transfer, annual contracts, advisor billing
### Competitive Alternatives
- **Current solutions:** Family office services, wealth advisors, estate planners, no strategy engine solution
- **Workarounds:** Manual family wealth management, advisor consultations, spreadsheet tracking
- **Why they'd switch:** No current solution provides Agentic Portfolio for family wealth; manual work is complex
- **Switching barriers:** Very high (requires product maturity, family office trust, advisor partnerships)
### Sales Cycle & Decision Process
- **Sales cycle:** 120-180 days (evaluation → pilot → family consultation → purchase)
- **Decision maker:** Family with wealth advisor consultation
- **Decision process:** Discover → evaluate → pilot → family review → advisor consultation → purchase
- **Touchpoints:** Family office networks, wealth advisor referrals, family office conferences
- **Sales model:** High-touch sales with family office partnerships, white-glove onboarding
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, family office partnerships
- **"Trust concerns"** → Enterprise security, family office partnerships, compliance certifications
- **"Family setup complexity"** → Family templates, account import, setup wizard, advisor assistance
- **"Wealth planning accuracy"** → High-accuracy planning, manual review, advisor validation
- **"Integration complexity"** → API integrations, data import, sync capabilities, migration tools
### Buying Signals
- **Strong signals:** HNW family, posts about family wealth, active with family offices, estate planning
- **Medium signals:** High-income family, family business, wealth management, estate questions
- **Weak signals:** General wealth management interest, family planning questions
### Expansion Path
- **Family → Extended Family:** After family use, expands to extended family wealth management
- **Expansion trigger:** Extended family needs, multi-generational planning, extended family wealth
- **Expansion mechanics:** Extended family workspace, extended family wealth management, estate planning
- **Expansion timeline:** 12+ months from family to extended family adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Portfolio layer)
- **Solution:** Clear roadmap, family office community engagement, pilot program, wealth management messaging
- **Barrier:** Trust concerns (handling family wealth)
- **Solution:** Enterprise security, family office partnerships, compliance certifications, audit trails
**Activation Barriers:**
- **Barrier:** Family setup complexity (multiple family members, accounts)
- **Solution:** Family templates, account import, setup wizard, wealth advisor assistance
- **Barrier:** Integration with existing wealth management systems
- **Solution:** API integrations, data import, sync capabilities, migration tools
**Retention Barriers:**
- **Barrier:** Wealth planning accuracy (critical for family wealth)
- **Solution:** High-accuracy planning, manual review, advisor validation, performance tracking
- **Barrier:** Ongoing family wealth management complexity
- **Solution:** Automated updates, family reporting, wealth dashboard, advisor support
### Technical Requirements
- Agentic Portfolio layer (strategy engine)
- Family wealth management
- Tax optimization capabilities
- Estate planning features
- Compliance tracking
# Future Product Layer: Execution (Agentic Wallet)

Dependent on Agentic Portfolio + chain execution layer.

## 19. High-Frequency On-Chain Actors
### Profile
Users who engage in high-frequency on-chain activities. Require Agentic Wallet execution layer.
### Key Visible Criteria
- **Activity signals:** High transaction volume, arbitrage activity, frequent DeFi interactions
- **Tool usage:** Uses DEX aggregators, trading bots, DeFi automation, high-frequency trading tools
- **Proxy indicators:** High transaction count on-chain, arbitrage activity, MEV activity, trading bots
- **Content consumption:** Engages with HFT content, arbitrage content, DeFi trading content
- **Community signals:** Active in trading Discord servers, crypto trading communities, DeFi trading forums
### Key Acquisition Channels
- **Crypto trading communities:** Crypto Twitter/X, trading Discord servers, Reddit (r/cryptotrading, r/defi), trading forums
- **Content marketing:** HFT case studies, arbitrage content, DeFi execution content
- **Partnerships:** DEX aggregators, trading platforms, DeFi protocols, crypto exchanges
- **SEO:** "DeFi automation", "crypto trading automation", "on-chain execution" keywords
- **Paid:** Crypto publication ads, trading platform partnerships, retargeting from DeFi usage
### Estimated Worldwide Population
**50K-100K** (active high-frequency on-chain traders globally)
### Pain Points
- **Transaction complexity:** Complex multi-chain transactions
- **Gas optimization:** Need to optimize gas costs
- **Risk management:** Manage risk in high-frequency trading
- **Execution speed:** Need fast execution for opportunities
- **Safety systems:** Need safety systems for high-frequency operations
### Use Cases
- **High-frequency trading:** Execute trades across multiple chains
- **Arbitrage:** Execute arbitrage opportunities
- **Liquidity provision:** Manage LP positions
- **Yield farming:** Optimize yield farming strategies
- **Risk management:** Manage risk in high-frequency operations
### A-ha Moment
When Agentic Wallet executes a complex multi-chain arbitrage opportunity automatically, optimizing gas costs and execution timing, and they see the profit in their wallet. They realize automated execution is working and profitable.
### Ready-to-Pay Threshold
After successfully executing 10-20 automated transactions with measurable profit or gas savings. They've proven the execution layer works for their use case and are ready to pay (requires mature Agentic Wallet product).
### Pricing Sensitivity & Price Points
- **Current spend:** $100-1000/month on gas fees, trading tools, execution services
- **Price sensitivity:** Medium (values execution efficiency, but cost-conscious)
- **Acceptable range:** $50-300/month for individual, $300-2000/month for power users
- **Value anchor:** Compares to gas savings, trading tools, execution services, profit value
- **Payment method:** Credit card, crypto payment options, usage-based pricing
### Competitive Alternatives
- **Current solutions:** Manual execution, trading bots, execution services, no automated wallet solution
- **Workarounds:** Manual transaction execution, trading bots, multiple wallets
- **Why they'd switch:** No current solution provides Agentic Wallet execution; manual work is time-consuming
- **Switching barriers:** High (requires product maturity, wallet security, execution trust)
### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (evaluation → pilot → see profit/gas savings → purchase)
- **Decision maker:** Individual (crypto-native decision)
- **Decision process:** Discover → evaluate → pilot → see value → purchase (requires mature product)
- **Touchpoints:** Crypto communities, DeFi platforms, trading communities, crypto content
- **Sales model:** Self-serve with crypto community engagement, pilot programs
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, crypto community engagement
- **"Security concerns"** → Security audits, multi-sig, cold storage integration, insurance
- **"Execution accuracy concerns"** → High-accuracy execution, manual override, execution logs, performance tracking
- **"Gas optimization accuracy"** → Real-time gas optimization, gas savings tracking, execution efficiency
- **"Multi-chain complexity"** → Chain templates, auto-detection, setup wizard, cross-chain execution
### Buying Signals
- **Strong signals:** Active DeFi trader, posts about execution efficiency, high-frequency trading, gas optimization
- **Medium signals:** Crypto-native, DeFi platform usage, trading tool usage, execution questions
- **Weak signals:** General crypto interest, trading questions
### Expansion Path
- **Individual → Advanced:** After basic use, expands to advanced execution strategies
- **Expansion trigger:** Execution success, profit/gas savings, advanced strategy needs
- **Expansion mechanics:** Advanced strategy templates, execution optimization, performance tracking
- **Expansion timeline:** 3-6 months from basic to advanced usage
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Wallet layer)
- **Solution:** Clear roadmap, DeFi community engagement, pilot program, execution layer messaging
- **Barrier:** Security concerns (handling high-frequency transactions)
- **Solution:** Security audits, multi-sig, hardware wallet support, insurance, safety systems
**Activation Barriers:**
- **Barrier:** Multi-chain setup complexity
- **Solution:** Chain templates, auto-detection, setup wizard, DEX integrations
- **Barrier:** Gas optimization setup
- **Solution:** Gas optimization tools, fee estimation, batch transactions, gas price alerts
**Retention Barriers:**
- **Barrier:** Execution speed and reliability (critical for HFT)
- **Solution:** Fast execution, transaction monitoring, retry logic, performance SLAs
- **Barrier:** Risk management complexity
- **Solution:** Risk monitoring, position limits, stop-loss, risk alerts, risk dashboard
### Technical Requirements
- Agentic Wallet layer (execution engine)
- Multi-chain execution
- Gas optimization
- Risk management features
- Safety systems
## 20. Agent-Compatible Crypto Users
### Profile
Crypto users who want agent-compatible wallet functionality.
### Key Visible Criteria
- **Activity signals:** Posts about AI agents, crypto automation, agent + crypto integration
- **Tool usage:** Uses AI agents, crypto wallets, automation tools, agent platforms
- **Proxy indicators:** AI agent usage, crypto wallet activity, automation setups, agent integrations
- **Content consumption:** Engages with AI + crypto content, agent wallet content, crypto automation content
- **Community signals:** Active in AI + crypto communities, agent communities, crypto AI Discord servers
### Key Acquisition Channels
- **Crypto AI communities:** Crypto Twitter/X, AI + crypto Discord servers, Reddit (r/defi, r/ethereum), crypto AI forums
- **Content marketing:** AI agent + crypto content, automation case studies, agent wallet tutorials
- **Partnerships:** AI agent platforms, crypto wallets, DeFi protocols, automation tools
- **SEO:** "AI crypto wallet", "agent-compatible wallet", "crypto automation" keywords
- **Paid:** Crypto AI publication ads, Twitter/X crypto AI community ads, retargeting
### Estimated Worldwide Population
**100K-200K** (crypto users interested in AI agent integration globally)
### Pain Points
- **Agent integration:** Need wallets that work with AI agents
- **Automation:** Want to automate crypto operations
- **Safety:** Need safety systems for automated operations
- **Multi-chain:** Need support for multiple chains
- **Strategy execution:** Want to execute strategies automatically
### Use Cases
- **Agent integration:** Integrate wallets with AI agents
- **Automation:** Automate crypto operations
- **Strategy execution:** Execute strategies automatically
- **Multi-chain operations:** Operate across multiple chains
- **Safety management:** Manage safety in automated operations
### A-ha Moment
When their AI agent successfully executes a crypto operation (e.g., rebalancing, yield migration) through Agentic Wallet, and they see the transaction confirmed on-chain. They realize agent-compatible wallet execution is working.
### Ready-to-Pay Threshold
After successfully automating 5-10 crypto operations with their AI agent and seeing time savings or improved execution. They've proven agent integration works and are ready to pay (requires mature Agentic Wallet product).
### Pricing Sensitivity & Price Points
- **Current spend:** $50-500/month on AI agents, agent tools, automation platforms
- **Price sensitivity:** Medium (values agent automation, but cost-conscious)
- **Acceptable range:** $30-200/month for individual, $200-1000/month for power users
- **Value anchor:** Compares to AI agent tools, automation platforms, time savings value
- **Payment method:** Credit card, crypto payment options, usage-based pricing
### Competitive Alternatives
- **Current solutions:** Manual agent execution, agent tools, no wallet integration solution
- **Workarounds:** Manual wallet operations, agent tools without wallet integration
- **Why they'd switch:** No current solution provides Agentic Wallet for agents; manual work is time-consuming
- **Switching barriers:** High (requires product maturity, agent integration, wallet security)
### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (evaluation → pilot → see automation value → purchase)
- **Decision maker:** Individual (developer/agent user decision)
- **Decision process:** Discover → evaluate → pilot → see value → purchase (requires mature product)
- **Touchpoints:** AI agent communities, developer communities, agent tool marketplaces
- **Sales model:** Self-serve with agent community engagement, pilot programs
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, agent community engagement
- **"Agent integration complexity"** → Agent SDK, integration examples, agent templates, documentation
- **"Security concerns"** → Security audits, multi-sig, agent permissions, execution limits
- **"Execution accuracy concerns"** → High-accuracy execution, manual override, execution logs, error handling
- **"Wallet setup complexity"** → Wallet setup wizard, agent wallet templates, integration guides
### Buying Signals
- **Strong signals:** Active AI agent user, posts about agent automation, agent tool usage, automation needs
- **Medium signals:** Developer with agents, agent tool usage, automation interest, agent questions
- **Weak signals:** General AI agent interest, automation questions
### Expansion Path
- **Individual → Team:** After individual use, expands to team agent automation
- **Expansion trigger:** Agent success, team automation needs, team agent adoption
- **Expansion mechanics:** Team workspace, team agent automation, shared agent wallets
- **Expansion timeline:** 3-6 months from individual to team adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Wallet layer)
- **Solution:** Clear roadmap, crypto community engagement, pilot program, agent integration messaging
- **Barrier:** Trust concerns (automated crypto operations)
- **Solution:** Security audits, safety systems, manual override, transaction simulation, insurance
**Activation Barriers:**
- **Barrier:** Agent integration complexity
- **Solution:** Agent SDK, integration examples, setup wizard, agent templates
- **Barrier:** Automation setup complexity
- **Solution:** Automation templates, rule builder, test mode, automation dashboard
**Retention Barriers:**
- **Barrier:** Automation reliability (critical for trust)
- **Solution:** Reliable execution, error handling, retry logic, automation monitoring
- **Barrier:** Safety concerns (automated transactions)
- **Solution:** Safety limits, approval workflows, transaction simulation, safety alerts
### Technical Requirements
- Agentic Wallet layer (execution engine)
- Agent integration capabilities
- Automation features
- Safety systems
- Multi-chain support
## 21. Protocol Explorers
### Profile
Users who explore and interact with new protocols. Need execution layer for protocol interactions.
### Key Visible Criteria
- **Activity signals:** Posts about new protocols, protocol research, DeFi exploration, protocol reviews
- **Tool usage:** Uses protocol aggregators, DeFi analytics, research platforms, protocol explorers
- **Proxy indicators:** Early protocol adoption, protocol research activity, DeFi exploration, new protocol interactions
- **Content consumption:** Engages with protocol research content, DeFi exploration content, new protocol content
- **Community signals:** Active in protocol communities, DeFi research Discord servers, protocol forums
### Key Acquisition Channels
- **Crypto explorer communities:** Crypto Twitter/X, DeFi research Discord servers, Reddit (r/defi, r/ethereum), protocol communities
- **Content marketing:** Protocol exploration content, new protocol reviews, DeFi research content
- **Partnerships:** DeFi protocols, protocol aggregators, research platforms, crypto analytics tools
- **SEO:** "DeFi protocol exploration", "new protocol tools", "protocol safety" keywords
- **Paid:** Crypto publication ads, protocol community partnerships, retargeting from DeFi usage
### Estimated Worldwide Population
**200K-500K** (active DeFi protocol explorers globally)
### Pain Points
- **Protocol complexity:** Complex interactions with new protocols
- **Safety:** Need safety systems for protocol exploration
- **Execution:** Need reliable execution for protocol interactions
- **Multi-chain:** Need support for multiple chains
- **Risk management:** Manage risk in protocol exploration
### Use Cases
- **Protocol exploration:** Explore and interact with new protocols
- **Strategy testing:** Test strategies on new protocols
- **Risk assessment:** Assess risk in protocol interactions
- **Execution:** Execute interactions with protocols
- **Safety management:** Manage safety in protocol exploration
### A-ha Moment
When they explore a new protocol, Agentic Wallet assesses the risk, suggests safety limits, and successfully executes a test interaction with proper safeguards. They realize protocol exploration is now safe and automated.
### Ready-to-Pay Threshold
After successfully exploring 3-5 new protocols with risk assessment and safe execution. They've proven the execution layer works for protocol exploration and are ready to pay (requires mature Agentic Wallet product).
### Pricing Sensitivity & Price Points
- **Current spend:** $50-500/month on DeFi tools, protocol explorers, risk assessment tools
- **Price sensitivity:** Medium (values safe exploration, but cost-conscious)
- **Acceptable range:** $30-200/month for individual, $200-1000/month for power users
- **Value anchor:** Compares to DeFi tools, protocol explorers, risk assessment value, safety value
- **Payment method:** Credit card, crypto payment options, usage-based pricing
### Competitive Alternatives
- **Current solutions:** Manual protocol exploration, risk assessment tools, no automated exploration solution
- **Workarounds:** Manual protocol research, risk assessment tools, manual execution
- **Why they'd switch:** No current solution provides Agentic Wallet for protocol exploration; manual work is risky
- **Switching barriers:** High (requires product maturity, protocol expertise, risk assessment trust)
### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (evaluation → pilot → see safe exploration → purchase)
- **Decision maker:** Individual (crypto-native decision)
- **Decision process:** Discover → evaluate → pilot → see value → purchase (requires mature product)
- **Touchpoints:** DeFi communities, protocol communities, crypto content, DeFi platforms
- **Sales model:** Self-serve with DeFi community engagement, pilot programs
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, DeFi community engagement
- **"Risk assessment accuracy concerns"** → High-accuracy risk models, manual review, risk history, protocol database
- **"Protocol coverage concerns"** → Comprehensive protocol database, protocol updates, new protocol support
- **"Execution safety concerns"** → Safety limits, execution safeguards, manual approval, test mode
- **"Multi-chain complexity"** → Chain templates, protocol detection, setup wizard, cross-chain exploration
### Buying Signals
- **Strong signals:** Active DeFi explorer, posts about new protocols, protocol research, risk assessment interest
- **Medium signals:** Crypto-native, DeFi platform usage, protocol explorer usage, exploration questions
- **Weak signals:** General DeFi interest, protocol questions
### Expansion Path
- **Individual → Advanced:** After basic use, expands to advanced protocol strategies
- **Expansion trigger:** Exploration success, advanced protocol needs, strategy optimization
- **Expansion mechanics:** Advanced protocol templates, strategy optimization, performance tracking
- **Expansion timeline:** 3-6 months from basic to advanced usage
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Wallet layer)
- **Solution:** Clear roadmap, protocol explorer community engagement, pilot program, protocol integration messaging
- **Barrier:** Safety concerns (interacting with new protocols)
- **Solution:** Safety systems, protocol risk assessment, test mode, insurance, manual approval
**Activation Barriers:**
- **Barrier:** Protocol integration complexity
- **Solution:** Protocol templates, integration examples, setup wizard, protocol marketplace
- **Barrier:** Risk assessment setup
- **Solution:** Risk assessment tools, protocol ratings, risk alerts, risk dashboard
**Retention Barriers:**
- **Barrier:** Protocol compatibility (new protocols not supported)
- **Solution:** Rapid protocol integration, protocol marketplace, community contributions, protocol SDK
- **Barrier:** Safety and risk management complexity
- **Solution:** Automated risk assessment, safety limits, protocol monitoring, safety alerts
### Technical Requirements
- Agentic Wallet layer (execution engine)
- Protocol integration capabilities
- Safety systems
- Risk management features
- Multi-chain support
## 22. Bitcoin/Stacks Ecosystem Power Users
### Profile
Power users in Bitcoin and Stacks ecosystems. Need execution layer for Bitcoin/Stacks operations.
### Key Visible Criteria
- **Activity signals:** Posts about Bitcoin, Stacks, Bitcoin DeFi, Stacks ecosystem, Bitcoin automation
- **Tool usage:** Uses Bitcoin wallets, Stacks wallets, Bitcoin DeFi platforms, Stacks protocols
- **Proxy indicators:** Bitcoin/Stacks wallet activity, Bitcoin DeFi activity, Stacks ecosystem participation
- **Content consumption:** Engages with Bitcoin content, Stacks content, Bitcoin DeFi content
- **Community signals:** Active in Bitcoin communities, Stacks Discord, Bitcoin forums, Stacks forums
### Key Acquisition Channels
- **Bitcoin/Stacks communities:** Bitcoin Twitter/X, Stacks Discord, Reddit (r/Bitcoin, r/stacks), Bitcoin forums
- **Content marketing:** Bitcoin/Stacks strategy content, ecosystem case studies, Bitcoin DeFi content
- **Partnerships:** Bitcoin wallets, Stacks protocols, Bitcoin DeFi platforms, ecosystem tools
- **SEO:** "Bitcoin automation", "Stacks tools", "Bitcoin DeFi" keywords
- **Paid:** Bitcoin publication ads, Stacks community partnerships, ecosystem retargeting
### Estimated Worldwide Population
**50K-100K** (active Bitcoin/Stacks ecosystem power users globally)
### Pain Points
- **Bitcoin complexity:** Complex Bitcoin operations
- **Stacks integration:** Need Stacks ecosystem integration
- **Execution:** Need reliable execution for Bitcoin/Stacks operations
- **Safety:** Need safety systems for Bitcoin/Stacks operations
- **Strategy execution:** Want to execute strategies on Bitcoin/Stacks
### Use Cases
- **Bitcoin operations:** Execute Bitcoin operations
- **Stacks integration:** Integrate with Stacks ecosystem
- **Strategy execution:** Execute strategies on Bitcoin/Stacks
- **Safety management:** Manage safety in Bitcoin/Stacks operations
- **Multi-chain:** Operate across Bitcoin and Stacks
### A-ha Moment
When Agentic Wallet successfully executes a Bitcoin/Stacks strategy (e.g., stacking, DeFi interaction) with proper safety checks and they see the transaction confirmed. They realize Bitcoin/Stacks execution is now automated and safe.
### Ready-to-Pay Threshold
After successfully executing 5-10 Bitcoin/Stacks operations with measurable results (yield, efficiency, time savings). They've proven the execution layer works for their ecosystem and are ready to pay (requires mature Agentic Wallet product).
### Pricing Sensitivity & Price Points
- **Current spend:** $50-500/month on Bitcoin tools, Stacks tools, ecosystem services
- **Price sensitivity:** Medium (values ecosystem tools, but cost-conscious)
- **Acceptable range:** $30-200/month for individual, $200-1000/month for power users
- **Value anchor:** Compares to Bitcoin tools, Stacks tools, ecosystem services, yield value
- **Payment method:** Credit card, Bitcoin payment options, usage-based pricing
### Competitive Alternatives
- **Current solutions:** Manual Bitcoin/Stacks operations, ecosystem tools, no automated wallet solution
- **Workarounds:** Manual transaction execution, ecosystem tools, multiple wallets
- **Why they'd switch:** No current solution provides Agentic Wallet for Bitcoin/Stacks; manual work is time-consuming
- **Switching barriers:** High (requires product maturity, Bitcoin/Stacks expertise, wallet security)
### Sales Cycle & Decision Process
- **Sales cycle:** 30-90 days (evaluation → pilot → see yield/efficiency → purchase)
- **Decision maker:** Individual (Bitcoin/Stacks-native decision)
- **Decision process:** Discover → evaluate → pilot → see value → purchase (requires mature product)
- **Touchpoints:** Bitcoin communities, Stacks communities, ecosystem platforms, Bitcoin content
- **Sales model:** Self-serve with ecosystem community engagement, pilot programs
### Key Objections
- **"Product not mature enough"** → Clear roadmap, waitlist, pilot program, ecosystem community engagement
- **"Bitcoin/Stacks compatibility concerns"** → Bitcoin/Stacks compatibility, ecosystem integration, protocol support
- **"Security concerns"** → Security audits, multi-sig, cold storage integration, Bitcoin security standards
- **"Execution accuracy concerns"** → High-accuracy execution, manual override, execution logs, performance tracking
- **"Ecosystem coverage concerns"** → Comprehensive ecosystem support, protocol updates, ecosystem partnerships
### Buying Signals
- **Strong signals:** Active Bitcoin/Stacks user, posts about ecosystem tools, staking/yield activity, ecosystem interest
- **Medium signals:** Bitcoin/Stacks-native, ecosystem platform usage, Bitcoin tool usage, ecosystem questions
- **Weak signals:** General Bitcoin interest, Stacks questions
### Expansion Path
- **Individual → Advanced:** After basic use, expands to advanced Bitcoin/Stacks strategies
- **Expansion trigger:** Execution success, yield/efficiency improvements, advanced strategy needs
- **Expansion mechanics:** Advanced strategy templates, ecosystem optimization, performance tracking
- **Expansion timeline:** 3-6 months from basic to advanced usage
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires Agentic Wallet layer)
- **Solution:** Clear roadmap, Bitcoin/Stacks community engagement, pilot program, ecosystem integration messaging
- **Barrier:** Ecosystem-specific requirements (Bitcoin/Stacks specific features)
- **Solution:** Native Bitcoin/Stacks support, ecosystem partnerships, community engagement
**Activation Barriers:**
- **Barrier:** Bitcoin/Stacks setup complexity
- **Solution:** Bitcoin/Stacks templates, setup wizard, ecosystem integrations, migration tools
- **Barrier:** Strategy execution setup
- **Solution:** Strategy templates, execution wizard, test mode, strategy backtesting
**Retention Barriers:**
- **Barrier:** Execution reliability (critical for Bitcoin/Stacks operations)
- **Solution:** Reliable execution, transaction monitoring, retry logic, performance SLAs
- **Barrier:** Ecosystem compatibility (Bitcoin/Stacks updates)
- **Solution:** Ecosystem monitoring, rapid updates, compatibility testing, community support
### Technical Requirements
- Agentic Wallet layer (execution engine)
- Bitcoin integration
- Stacks ecosystem integration
- Safety systems
- Strategy execution capabilities
# Future Product Layer: Enterprise AI Deployments

Only when Neotoma supports full org-wide agent orchestration.

## 23. Mid-Market + Enterprise Teams (200–10,000 employees)
### Profile
Large organizations deploying AI agents at scale. Require full organizational memory architecture.
### Key Visible Criteria
- **Company signals:** 200-10,000 employees, tech companies, companies with AI initiatives
- **Job titles:** CIO, CTO, Head of AI, VP of Engineering, Head of Innovation
- **LinkedIn signals:** Senior tech leadership, AI initiatives, enterprise AI, organizational AI
- **Activity signals:** Posts about enterprise AI, AI agents, organizational AI, AI governance
- **Proxy indicators:** AI agent deployments, enterprise AI platforms, AI initiatives, AI teams
- **Content consumption:** Engages with enterprise AI content, AI governance content, organizational AI content
### Key Acquisition Channels
- **Enterprise sales:** Direct sales team, enterprise conferences, CIO/CTO networks, enterprise partnerships
- **Content marketing:** Enterprise AI case studies, organizational memory white papers, enterprise AI content
- **Partnerships:** Enterprise AI platforms, consulting firms, system integrators, enterprise software vendors
- **SEO:** "enterprise AI memory", "organizational knowledge base", "AI agent coordination" keywords
- **Paid:** LinkedIn ads (CIO/CTO targeting), enterprise publication ads, conference sponsorships
### Estimated Worldwide Population
**10K-20K companies** (mid-market to enterprise companies globally deploying AI agents at scale)
### Pain Points
- **Organizational knowledge fragmentation:** Knowledge scattered across teams and systems
- **AI agent coordination:** Multiple AI agents need shared memory
- **Governance:** Need governance and auditability for AI agents
- **Scalability:** Need to scale AI agents across organization
- **Compliance:** Need compliance and audit trails
### Use Cases
- **Organizational memory:** Shared memory across organization
- **AI agent coordination:** Coordinate multiple AI agents
- **Governance:** Govern AI agent usage
- **Compliance:** Maintain compliance and audit trails
- **Scalability:** Scale AI agents across organization
### A-ha Moment
When multiple AI agents across different departments successfully coordinate using shared Neotoma memory, and a query from one agent leverages context from another agent's work. They realize organizational memory is working at scale.
### Ready-to-Pay Threshold
After successfully deploying 5-10 AI agents with shared memory and seeing measurable improvements (time savings, consistency, knowledge preservation). They've proven organizational memory value and are ready for enterprise ACV (requires full organizational memory architecture).
### Pricing Sensitivity & Price Points
- **Current spend:** $50000-500000/year on enterprise tools, AI infrastructure, knowledge management
- **Price sensitivity:** Low (enterprise expense, values organizational memory)
- **Acceptable range:** $50000-200000/year for mid-market, $200000-1000000/year for enterprise
- **Value anchor:** Compares to enterprise knowledge management, AI infrastructure, organizational efficiency value
- **Payment method:** Enterprise contracts, PO process, annual billing
### Competitive Alternatives
- **Current solutions:** Enterprise knowledge management, AI infrastructure, no organizational memory solution
- **Workarounds:** Manual knowledge management, agent-specific memory, no shared organizational memory
- **Why they'd switch:** No current solution provides organizational memory for agents; knowledge fragmentation is painful
- **Switching barriers:** Very high (requires full organizational memory architecture, enterprise trust, migration complexity)
### Sales Cycle & Decision Process
- **Sales cycle:** 180-365 days (evaluation → pilot → org-wide rollout → purchase)
- **Decision maker:** CTO/CIO with executive approval
- **Decision process:** Discover → evaluate → pilot → org-wide evaluation → executive approval → purchase
- **Touchpoints:** Enterprise sales, enterprise conferences, CTO/CIO networks, enterprise partnerships
- **Sales model:** High-touch enterprise sales with white-glove onboarding
### Key Objections
- **"Product not mature enough"** → Clear roadmap, enterprise pilot program, organizational memory architecture, enterprise partnerships
- **"Organizational memory setup complexity"** → Enterprise onboarding, migration support, organizational templates, white-glove setup
- **"Agent integration complexity"** → Enterprise agent integration, agent SDK, integration support, agent templates
- **"Security and compliance concerns"** → Enterprise security, compliance certifications, audit trails, data residency
- **"ROI uncertainty"** → ROI calculator, pilot program, case studies, organizational efficiency metrics
### Buying Signals
- **Strong signals:** Enterprise deploying AI agents, posts about organizational memory, active in enterprise AI communities
- **Medium signals:** Mid-market to enterprise, AI infrastructure, knowledge management, organizational efficiency interest
- **Weak signals:** General enterprise AI interest, knowledge management questions
### Expansion Path
- **Pilot → Org-Wide:** After pilot success, expands to org-wide deployment
- **Expansion trigger:** Pilot success, org-wide value, executive approval, org-wide rollout
- **Expansion mechanics:** Org-wide deployment, multi-team management, enterprise features
- **Expansion timeline:** 6-12 months from pilot to org-wide adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires full organizational memory architecture)
- **Solution:** Clear roadmap, enterprise sales engagement, pilot program, enterprise messaging
- **Barrier:** Enterprise procurement process (long sales cycle)
- **Solution:** Enterprise sales team, procurement support, compliance documentation, security reviews
**Activation Barriers:**
- **Barrier:** Organizational setup complexity (200–10,000 employees)
- **Solution:** Enterprise onboarding, white-glove setup, migration services, training programs
- **Barrier:** Integration with existing enterprise systems
- **Solution:** Enterprise integrations, SSO, API integrations, data migration, sync capabilities
**Retention Barriers:**
- **Barrier:** Governance and compliance complexity
- **Solution:** Advanced governance features, compliance automation, audit trails, compliance dashboard
- **Barrier:** Scalability concerns (10,000+ employees)
- **Solution:** Enterprise-grade scalability, performance SLAs, dedicated infrastructure, support
### Technical Requirements
- Full organizational memory architecture
- Multi-user governance
- Agent orchestration
- Advanced permissions
- Compliance and auditability
## 24. Companies Deploying Dozens of Internal AI Agents
### Profile
Companies deploying many internal AI agents. Need shared memory substrate for agent coordination.
### Key Visible Criteria
- **Company signals:** Companies with multiple AI agents, AI agent deployments, agent orchestration
- **Job titles:** Head of AI, AI Platform Lead, Agent Engineering Lead, AI Infrastructure Lead
- **LinkedIn signals:** AI agent deployments, multi-agent systems, agent coordination, agent orchestration
- **Activity signals:** Posts about multi-agent systems, agent coordination, agent orchestration
- **Proxy indicators:** Multiple AI agent deployments, agent platforms, agent infrastructure, agent teams
- **Content consumption:** Engages with multi-agent content, agent coordination content, agent orchestration content
### Key Acquisition Channels
- **Enterprise sales:** Direct sales team, AI/ML conferences, enterprise AI communities, CIO/CTO networks
- **Content marketing:** Multi-agent coordination case studies, agent orchestration content, enterprise AI content
- **Partnerships:** Enterprise AI platforms, AI consulting firms, agent orchestration tools, system integrators
- **SEO:** "multi-agent coordination", "AI agent memory", "agent orchestration" keywords
- **Paid:** LinkedIn ads (CIO/CTO targeting), enterprise AI publication ads, conference sponsorships
### Estimated Worldwide Population
**5K-10K companies** (companies globally deploying dozens of internal AI agents)
### Pain Points
- **Agent coordination:** Multiple agents need shared memory
- **Context sharing:** Agents need to share context
- **Governance:** Need governance for agent usage
- **Scalability:** Need to scale agent deployment
- **Compliance:** Need compliance and audit trails
### Use Cases
- **Agent coordination:** Coordinate multiple AI agents
- **Context sharing:** Share context across agents
- **Governance:** Govern agent usage
- **Scalability:** Scale agent deployment
- **Compliance:** Maintain compliance and audit trails
### A-ha Moment
When 20+ internal AI agents successfully share context through Neotoma memory, and agents can build on each other's work without conflicts or duplication. They realize agent coordination at scale is working.
### Ready-to-Pay Threshold
After successfully coordinating 20+ agents for 2-3 months and seeing measurable improvements (efficiency, consistency, knowledge preservation). They've proven agent coordination value and are ready for enterprise ACV (requires full organizational memory architecture).
### Pricing Sensitivity & Price Points
- **Current spend:** $100000-1000000/year on AI infrastructure, agent coordination tools, enterprise automation
- **Price sensitivity:** Low (enterprise expense, values agent coordination)
- **Acceptable range:** $100000-500000/year for mid-market, $500000-2000000/year for enterprise
- **Value anchor:** Compares to AI infrastructure, agent coordination tools, enterprise automation value
- **Payment method:** Enterprise contracts, PO process, annual billing
### Competitive Alternatives
- **Current solutions:** Agent coordination tools, AI infrastructure, no organizational memory solution
- **Workarounds:** Manual agent coordination, agent-specific memory, no shared coordination
- **Why they'd switch:** No current solution provides organizational memory for agent coordination; coordination breakdown is painful
- **Switching barriers:** Very high (requires full organizational memory architecture, enterprise trust, coordination complexity)
### Sales Cycle & Decision Process
- **Sales cycle:** 180-365 days (evaluation → pilot → org-wide rollout → purchase)
- **Decision maker:** CTO/CIO with executive approval
- **Decision process:** Discover → evaluate → pilot → org-wide evaluation → executive approval → purchase
- **Touchpoints:** Enterprise sales, enterprise conferences, CTO/CIO networks, enterprise partnerships
- **Sales model:** High-touch enterprise sales with white-glove onboarding
### Key Objections
- **"Product not mature enough"** → Clear roadmap, enterprise pilot program, organizational memory architecture, enterprise partnerships
- **"Agent coordination setup complexity"** → Enterprise onboarding, coordination templates, agent integration, white-glove setup
- **"Coordination accuracy concerns"** → High-accuracy coordination, manual override, coordination logs, performance tracking
- **"Security and compliance concerns"** → Enterprise security, compliance certifications, audit trails, data residency
- **"ROI uncertainty"** → ROI calculator, pilot program, case studies, coordination efficiency metrics
### Buying Signals
- **Strong signals:** Enterprise coordinating many agents, posts about agent coordination, active in enterprise AI communities
- **Medium signals:** Mid-market to enterprise, AI infrastructure, agent coordination, enterprise automation interest
- **Weak signals:** General enterprise AI interest, agent coordination questions
### Expansion Path
- **Pilot → Org-Wide:** After pilot success, expands to org-wide agent coordination
- **Expansion trigger:** Pilot success, org-wide value, executive approval, org-wide rollout
- **Expansion mechanics:** Org-wide deployment, multi-agent coordination, enterprise features
- **Expansion timeline:** 6-12 months from pilot to org-wide adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires full organizational memory architecture)
- **Solution:** Clear roadmap, enterprise sales engagement, pilot program, agent coordination messaging
- **Barrier:** Agent coordination complexity concerns
- **Solution:** Agent orchestration demos, coordination examples, governance features, audit trails
**Activation Barriers:**
- **Barrier:** Multi-agent setup complexity
- **Solution:** Agent templates, setup wizard, agent marketplace, coordination tools
- **Barrier:** Context sharing setup
- **Solution:** Context sharing tools, shared memory setup, context templates, sharing dashboard
**Retention Barriers:**
- **Barrier:** Agent coordination reliability (critical for trust)
- **Solution:** Reliable coordination, agent monitoring, coordination dashboard, error handling
- **Barrier:** Governance complexity (dozens of agents)
- **Solution:** Advanced governance, agent policies, approval workflows, governance dashboard
### Technical Requirements
- Full organizational memory architecture
- Agent orchestration
- Context sharing capabilities
- Governance features
- Compliance and auditability
## 25. Organizations Requiring AI Governance + Auditability
### Profile
Organizations with strict governance and auditability requirements. Need full organizational memory with governance.
### Key Visible Criteria
- **Company signals:** Regulated industries, compliance-heavy companies, governance requirements
- **Job titles:** CISO, Chief Compliance Officer, Head of Governance, Head of Risk, Compliance Manager
- **LinkedIn signals:** Governance roles, compliance roles, audit roles, regulatory compliance
- **Activity signals:** Posts about AI governance, compliance, auditability, regulatory requirements
- **Proxy indicators:** Compliance certifications, audit requirements, governance frameworks, regulatory compliance
- **Content consumption:** Engages with AI governance content, compliance content, auditability content
### Key Acquisition Channels
- **Enterprise sales:** Direct sales team, compliance conferences, governance events, CISO/Compliance Officer networks
- **Content marketing:** AI governance case studies, compliance white papers, auditability content, regulatory content
- **Partnerships:** Compliance software vendors, governance platforms, audit firms, regulatory consultants
- **SEO:** "AI governance", "AI auditability", "AI compliance" keywords
- **Paid:** LinkedIn ads (CISO/Compliance Officer targeting), compliance publication ads, conference sponsorships
### Estimated Worldwide Population
**2K-5K organizations** (organizations globally with strict AI governance and auditability requirements)
### Pain Points
- **Governance:** Need strict governance for AI usage
- **Auditability:** Need audit trails for AI operations
- **Compliance:** Need compliance with regulations
- **Risk management:** Need risk management for AI usage
- **Scalability:** Need to scale with governance
### Use Cases
- **Governance:** Govern AI usage across organization
- **Auditability:** Maintain audit trails for AI operations
- **Compliance:** Maintain compliance with regulations
- **Risk management:** Manage risk in AI usage
- **Scalability:** Scale with governance
### A-ha Moment
When they run a compliance audit and get a complete audit trail of all AI agent operations with full traceability, and it passes regulatory review. They realize AI governance and auditability is working at enterprise scale.
### Ready-to-Pay Threshold
After successfully passing a compliance audit using Neotoma's governance and audit features, and seeing measurable risk reduction. They've proven governance value and are ready for enterprise ACV (requires full organizational memory architecture).
### Pricing Sensitivity & Price Points
- **Current spend:** $200000-2000000/year on compliance, governance, audit tools, risk management
- **Price sensitivity:** Low (enterprise expense, values compliance and governance)
- **Acceptable range:** $200000-1000000/year for mid-market, $1000000-5000000/year for enterprise
- **Value anchor:** Compares to compliance tools, governance platforms, audit services, risk management value
- **Payment method:** Enterprise contracts, PO process, annual billing
### Competitive Alternatives
- **Current solutions:** Compliance tools, governance platforms, audit services, no organizational memory solution
- **Workarounds:** Manual compliance tracking, governance tools, audit services, no unified governance
- **Why they'd switch:** No current solution provides organizational memory for governance; compliance fragmentation is risky
- **Switching barriers:** Very high (requires full organizational memory architecture, enterprise trust, compliance complexity)
### Sales Cycle & Decision Process
- **Sales cycle:** 180-365 days (evaluation → pilot → compliance review → purchase)
- **Decision maker:** CTO/CIO with compliance/legal approval
- **Decision process:** Discover → evaluate → pilot → compliance review → legal approval → purchase
- **Touchpoints:** Enterprise sales, compliance conferences, legal networks, enterprise partnerships
- **Sales model:** High-touch enterprise sales with compliance focus, white-glove onboarding
### Key Objections
- **"Product not mature enough"** → Clear roadmap, enterprise pilot program, organizational memory architecture, compliance partnerships
- **"Compliance setup complexity"** → Enterprise onboarding, compliance templates, audit setup, white-glove setup
- **"Governance accuracy concerns"** → High-accuracy governance, manual review, audit trails, compliance validation
- **"Security and compliance concerns"** → Enterprise security, compliance certifications, audit trails, data residency, regulatory compliance
- **"ROI uncertainty"** → ROI calculator, pilot program, case studies, compliance risk reduction metrics
### Buying Signals
- **Strong signals:** Enterprise requiring compliance, posts about governance, active in compliance communities, audit needs
- **Medium signals:** Mid-market to enterprise, compliance requirements, governance interest, audit questions
- **Weak signals:** General compliance interest, governance questions
### Expansion Path
- **Pilot → Org-Wide:** After pilot success, expands to org-wide governance and compliance
- **Expansion trigger:** Pilot success, compliance approval, org-wide value, executive approval
- **Expansion mechanics:** Org-wide deployment, multi-team governance, enterprise compliance features
- **Expansion timeline:** 6-12 months from pilot to org-wide adoption
### Key Barriers & Product Solutions
**Acquisition Barriers:**
- **Barrier:** Product not mature enough (requires full organizational memory architecture)
- **Solution:** Clear roadmap, enterprise sales engagement, pilot program, governance messaging
- **Barrier:** Governance and compliance requirements (strict requirements)
- **Solution:** Compliance certifications, audit capabilities, governance features, compliance documentation
**Activation Barriers:**
- **Barrier:** Governance setup complexity
- **Solution:** Governance templates, setup wizard, compliance automation, governance dashboard
- **Barrier:** Audit trail setup
- **Solution:** Automated audit trails, audit dashboard, audit reports, compliance automation
**Retention Barriers:**
- **Barrier:** Ongoing compliance complexity
- **Solution:** Compliance automation, regulatory updates, compliance dashboard, audit support
- **Barrier:** Governance maintenance complexity
- **Solution:** Automated governance, policy management, governance dashboard, compliance monitoring
### Technical Requirements
- Full organizational memory architecture
- Advanced governance features
- Auditability capabilities
- Compliance features
- Risk management
## Agent Instructions
### When to Load This Document
Load when:
- Creating user personas or user stories
- Designing features for specific ICPs
- Planning product roadmap by ICP
- Understanding pain points and use cases
- Writing marketing or sales materials
- Evaluating whether a feature serves Tier 1 ICPs (AI Infrastructure Engineers, Agent System Builders, AI-native Operators)
### Required Co-Loaded Documents
- `docs/specs/ICP_PRIORITY_TIERS.md` (for tier prioritization — developer release structure)
- `docs/NEOTOMA_MANIFEST.md` (for foundational context)
- `docs/specs/MVP_OVERVIEW.md` (for MVP scope)
### Constraints Agents Must Enforce
1. Developer release features MUST serve Tier 1 ICPs (AI Infrastructure Engineers, Agent System Builders, AI-native Operators)
2. Tier 2 features (Toolchain Integrators) require API stability milestones
3. Tier 3 features (Knowledge Workers, Small Teams) are explicitly post-developer-release
4. Future Product Layer ICPs require Agentic Portfolio/Wallet/Enterprise layers (not developer-release scope)
5. All features must align with ICP pain points and use cases
6. Language must use infrastructure/guarantees framing, not "AI memory tool"
### Validation Checklist
- [ ] Feature addresses specific ICP pain point
- [ ] Use case is clearly defined for target ICP
- [ ] Feature serves Tier 1 ICPs (developer release requirement)
- [ ] Tier 2+ features clearly marked as post-initial-dev-release
- [ ] Messaging uses state integrity vocabulary (deterministic, versioned, replayable, auditable, schema-bound)
