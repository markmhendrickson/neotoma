# Primary ICP: Personal Agentic OS Builders/Operators

## Scope

The primary ICP: people constructing an operating system for their own AI agents across personal and professional life domains.

**Related docs:** [`profiles.md`](./profiles.md) (detailed profiles) · [`secondary_icps.md`](./secondary_icps.md) · [`future_icps.md`](./future_icps.md) · [`developer_release_targeting.md`](./developer_release_targeting.md) (release-scoped targeting, activation risks, and status tracking) · [`business_model.md`](../private/strategy/business_model.md) (canonical business model, pricing, revenue mechanics) · [`strategic_market_analysis.md`](../private/strategy/strategic_market_analysis.md) (industry evolution and topology framework) · [`distribution_financing_strategy.md`](../private/strategy/distribution_financing_strategy.md) (B2D distribution and financing)

---

## The Archetype

The primary ICP spends significant effort, attention, and emotional energy compensating for the absence of reliable agent state. Neotoma does not add a capability — it removes the tax.

They wire together multi-agent stacks (Claude Code, Cursor, ChatGPT, custom scripts) to manage finances, contacts, content, health, code, BD pipelines, and other domains — building infrastructure primarily for themselves, secondarily for systems they ship to others.

The same person is an operator when running their contact CRM, a builder when creating a new agent pipeline, and an infrastructure engineer when debugging state drift. The three Tier 1 personas (AI Infrastructure Engineers, Agent System Builders, AI-native Operators) describe moments in this person's workflow, not separate personas.

### Pain triggers

**Chronic (the tax):** State drifts between sessions and tools; they become the human sync layer across every AI tool. Cost is diffuse — attention, repetition, low-grade frustration.

**Acute (the crisis):** Agent acts confidently on wrong, stale, or lossy-compressed state. User discovers damage downstream — a reverted decision built on, a nuanced choice flattened and misapplied, contradictory observations silently overwriting each other. Cost is concrete — lost work, bad decisions, eroded trust in agent autonomy.

The chronic tax is what the ICP tolerates daily. The acute crisis is what converts them. Messaging should connect both: *"You're already paying the re-prompting tax every day. But the real risk isn't the time you waste — it's the time you don't notice your agent is operating on bad state."*

### Characteristics

- Agents persist across sessions (not one-shot)
- State coordinated across multiple tools or agents
- Evolving personal/professional context over time
- Experiencing drift, conflicts, or unreproducible decisions
- Comfortable with infrastructure-level abstractions
- Using AI as autonomous pipeline, not just thought partner

### Success state

Cross-tool state is consistent; context persists across sessions; facts stored once are available everywhere; decisions are traceable.

### Adoption pattern

Install for personal use, expand as the personal OS matures across life domains. B2B opportunities emerge downstream when personal builders bring Neotoma into team/professional contexts — not a separate ICP, but a secondary motion from personal adoption. See [B2B Pull-Through Mechanics](#b2b-pull-through-mechanics) for the operational sequence.

**Variant — internal-tools / biz-tech engineer at model-lab or agentic-native company.** Same Tier 1 builder archetype, but the entry vector is the org rather than personal. They build internal agentic tools for legal, recruiting, AE, or exec teams using pre-release internal models, with cultural cover to ship internal infra fast. ACV is team-plan from day one.
<!-- Source: ent_9c8c955b2fd4afbdad398d0c -->

---

## Operational Modes

Three modes — not separate personas, but facets of one person's workflow. For full narrative profiles, see [`profiles.md`](./profiles.md).

| Mode | Current pain | Adoption trigger | Comparison set |
|------|-------------|-----------------|----------------|
| **Infrastructure engineering** | Can't reproduce agent runs; state mutations invisible; debugging is log archaeology | Reliability failure: same inputs, different state, no explanation | Event sourcing, state machines, append-only logs, provenance DBs |
| **Building agent systems** | Drift across sessions; conflicting state across tool boundaries; no replay | Memory inconsistency breaks a workflow | RAG memory (Mem0, Zep), LangChain/LangGraph memory, file-based memory |
| **Operating across AI tools** | Context fragmentation; repeated explanations; broken handoffs | Multi-tool workflow debt becomes intolerable | Platform memory (Claude, ChatGPT), PKM tools (Obsidian, Notion), manual sync |

### Tax and role transformation

| Mode | Tax they pay | Escaping | Into |
|------|-------------|----------|------|
| Operating | Re-prompting, context re-establishment, manual cross-tool sync | Context janitor — human sync layer | Operator with continuity — steering, not driving |
| Infrastructure debugging | Checkpoint logic, custom diffing, state serialization glue | Log archaeologist — reverse-engineering truth | Platform engineer with replayable state |
| Building pipelines | Prompt engineering workarounds, dedup hacks, memory regression fixes | Inference babysitter — absorbing variance | Builder on solid ground |

### Adoption ecosystem

- **Operating → Building:** Personal workflows that work become the basis for more ambitious agent pipelines.
- **Building → Infrastructure debugging:** Production pipelines surface state integrity needs.
- **Infrastructure validation → Toolchain adoption:** When the ICP standardizes on Neotoma, framework maintainers see adoption signal.
- **B2B downstream:** Personal adoption creates the entry point for team contexts.

---

## ICP Growth Trajectory

The ICP as described is real but the addressable portion today is a small subset of the total role population. See [`profiles.md`](./profiles.md) for topology-qualified estimates: ~15K–60K developers at Topology 2+ who experience write-integrity pain, of which ~1K–5K are in the acute segment (can name the problem and are actively searching for solutions). The total role population across Tier 1 (~200K–600K) enters the addressable market as developers progress through topology stages.

The addressable ICP expands as developers progress through multi-agent topology stages. See [`strategic_market_analysis.md`](../private/strategy/strategic_market_analysis.md) for the full topology framework.

### Topology-to-ICP mapping

| Topology | Pattern | ICP Qualification | Estimated Timeline |
|----------|---------|------------------|--------------------|
| 1: Hub-and-spoke | One primary agent, stateless tool calls | Pre-ICP — pain is latent, platform memory suffices | Current dominant |
| 2: Pipeline agents | Sequential handoffs, each reads/appends state | Qualifying — errors propagate through chain, debugging becomes real work | Next 12 months |
| 3: Event-driven shared context | Multiple agents, shared store, no orchestrator | Strongly qualified — concurrent writes, contradiction amplification, cascade failures | 12–24 months |
| 4: Persistent autonomous agents | Long-running state, periodic sync | Critical need — context windows can't serve as memory, provenance is non-optional | 18–36 months |

### Expansion signals

The ICP population is expanding when:

- Developers at Topology 2 start posting about pipeline debugging pain (state propagation errors, agent-to-agent handoff failures)
- Framework maintainers (LangChain, CrewAI, OpenClaw) add shared-state primitives — signals that multi-agent coordination is moving from niche to mainstream
- High-profile agent failures on corrupted state surface publicly — creates "that's me" moments for latent ICP members
- Enterprise buyers begin demanding audit trails for autonomous agent decisions
- Regulatory pressure (finance, healthcare) surfaces for deterministic provenance

### Developer release implication

The developer release serves today's narrow ICP and builds the infrastructure/content that catches each expanding cohort. The comparison is Supabase or PlanetScale in their early days — a small number of developers building real things on the platform, each representing a production dependency.

---

## Distribution Channels and Integration Priorities

The ICP uses specific tools. Those tools are distribution channels, not just context. See [`distribution_financing_strategy.md`](../private/strategy/distribution_financing_strategy.md) for full distribution analysis.

### Channel priority

| Priority | Channel | Mechanism | Why |
|----------|---------|-----------|-----|
| 1 | MCP ecosystem | Neotoma MCP tools in registries and directories | Where the ICP already configures agent memory; lowest-friction discovery |
| 2 | Cursor / Claude Code | Integration docs, workflow examples, `.cursor/rules` patterns | Where the ICP spends their workday; in-context adoption |
| 3 | Open source repo | GitHub discoverability, README, stars, recent commits | Trust signal; where they evaluate tools before installing |
| 4 | Content | Pain-point blog posts, competitive comparisons, write-integrity deep dives | Catches developers searching for solutions to problems they just felt |
| 5 | OpenClaw ecosystem | Plugin when Topology 2+ power users start complaining about state management | Est. Q3 2026; tied to multi-agent framework adoption |

### Integration surface framing

The winning architecture is not "replace your database" but "sit between your agents and your database." Agent-generated state (observations, inferences, entity resolutions, decisions) lives in a purpose-built layer. The developer's existing Postgres remains the system of record for business data. This framing avoids triggering the "just use Postgres" reflex.

### Content-to-channel mapping

| Watering hole (from above) | Content type that resonates | Distribution channel |
|---|---|---|
| AI/agent Twitter/X | QTs of agent memory frustration posts; before/after comparisons | Organic, founder account |
| Claude Code / Cursor communities | Workflow walkthroughs with Neotoma MCP setup | Integration docs, community posts |
| Indie hacker forums (HN, r/ClaudeAI) | Failure stories, "here's my setup" posts | Content, repo README |
| LinkedIn | Structured posts on multi-agent state integrity | Content, professional framing |
| Open source agent tooling repos | Issues/discussions surfacing memory pain | GitHub presence, cross-references |

---

## B2B Pull-Through Mechanics

The primary adoption path is personal (B2D). B2B revenue emerges downstream when a personal adopter brings Neotoma into a team context where state corruption costs are measurable in dollars.

### The pull-through sequence

1. **Individual adopts for personal use.** Installs Neotoma for their own agent workflows — contacts, tasks, decisions, code context. Uses it across Claude Code and Cursor. Experiences the value: cross-session recall, provenance, no re-prompting tax.

2. **Individual encounters team pain.** Their team or company runs multi-agent workflows where state integrity matters — a pipeline that hands off between agents, a shared context store, or agents making decisions that affect revenue/customers. The individual recognizes the pattern: "this is the same problem I solved personally."

3. **Individual proposes Neotoma for team use.** The proposal is credible because they already use it. The cost of state corruption is quantifiable: a bad agent decision that lost a customer, a pipeline failure that required manual reconstruction, an audit question nobody could answer.

4. **Team adopts on a team plan.** Higher ACV (€500–€2,500/mo). The individual becomes the internal champion. Neotoma transitions from personal tool to team infrastructure.

### Facilitating pull-through

- **Team plan activation:** Make it frictionless for an individual user to upgrade to a team plan and invite colleagues — no re-onboarding, no data migration, same MCP configuration pattern
- **Team-visible value:** Shared entity graphs, cross-user provenance, team-level audit trails — features that only matter in team context but are immediately legible
- **Business case ammunition:** Templates or examples the individual champion can use to justify the purchase: "here's what state corruption cost us last month," "here's what we can't audit today"
- **Timeline:** First B2B pull-through expected during Phase 2 (angel-funded growth, Dec 2026–mid 2027) as early individual adopters encounter team-scale problems

### Engineering consultancy fan-out

A higher-ACV variant of the agency-fleet operator pattern. A senior engineer-consultant adopts Neotoma personally, then pulls it into client engagements as a deterministic state substrate. SaaS license + support revenue follows client deployment. The consultant's portfolio creates fan-out across multiple clients from a single adoption event, compressing the personal-to-team timeline.
<!-- Source: ent_81f79780f1fbe679af99da90 -->

### Revenue implication

Team plans drive majority of revenue by M12 (see [`business_model.md`](../private/strategy/business_model.md)). The individual plan is the activation channel; the team plan is the revenue channel. Individual-to-team upgrade target: 20% within 2–3 months.

---

## Adoption Triggers

### Pain-driven triggers

The chronic and acute pain triggers are defined in [The Archetype](#pain-triggers). In summary: the chronic tax (re-prompting, manual sync) creates latent demand; the acute crisis (corrupted state, bad decisions from wrong data) creates urgency.

### Capability-unlock triggers

Not all adoption is pain-driven. Some triggers are aspirational — the ICP wants to do something they currently *can't* because they don't trust the state layer.

- **Unattended agent execution:** "I want to run agents overnight / on a cron / without watching every action, but I can't until I trust what they write." Neotoma's integrity guarantees are the precondition for removing human supervision.
- **Multi-agent coordination:** "I want Agent A's output to feed Agent B, but I can't guarantee Agent A wrote clean data." Schema constraints and provenance tracing make multi-agent pipelines trustworthy.
- **Cross-tool unification:** "I want one source of truth across Claude, Cursor, and ChatGPT." MCP-based access turns fragmented tool-specific memory into a shared substrate.
- **Scaling domains:** "I've been managing contacts manually; now I want to add financial data, health data, and project tracking without the system becoming a mess." Schema-bound entities make each new domain additive rather than chaotic.
- **Local-LLM compatibility.** A privacy-first cohort (≥3 evaluators in 2 weeks) gates activation on the harness running Neotoma alongside Ollama, LM Studio, or comparable local-LLM stacks. Local-LLM support is a first-class activation precondition for this cohort, not an edge case.
<!-- Source: ent_4f0db2d7f2c349900e4dac2c, ent_727fee4a94cfaea86880a0f1, ent_81f79780f1fbe679af99da90 -->

### External event triggers

Moments that create receptivity windows — the ICP didn't change, but the environment did.

- **Tool releases that increase MCP visibility:** A new Claude Code or Cursor release that foregrounds MCP server configuration lowers Neotoma's adoption friction and increases discoverability.
- **Viral agent memory failure posts:** An AI Twitter thread or blog post describing agent memory failures creates a "that's me" moment for latent ICP members.
- **Competitor public failures:** A prominent failure of a fuzzy memory tool (data loss, hallucinated memories, privacy breach) makes the integrity-first pitch land harder.
- **Peer adoption / social proof:** A respected builder posts a walkthrough of their Neotoma setup, or mentions it in a tools thread. For solo founders and indie hackers, peer validation is often the final push.
- **First unattended cron / overnight agent run.** Forget-by-default users hit a forcing function the moment they need a process to act without them watching. Re-establishing context manually each run becomes untenable; Neotoma's provenance becomes the only mechanism that preserves the determinism guarantee they already value.
<!-- Source: ent_727fee4a94cfaea86880a0f1 -->


### Scale threshold triggers

The tax becomes impossible to ignore at certain thresholds. Approximate markers:

- **3+ agents** operating across sessions — manual state coordination becomes untenable
- **5+ life/work domains** managed through agents — context fragmentation compounds
- **Daily use** sustained over 2+ weeks — re-prompting tax becomes viscerally annoying
- **First unattended agent run** — the moment they stop watching every action, state integrity becomes non-optional

### Competitor migration paths

Structured paths from current tools to Neotoma, organized by what the ICP tried, why it failed, and what makes them receptive.

| Currently using | Why it fails | Receptive to |
|---|---|---|
| **Claude Projects KB** | Per-project file uploads with 200K context; no cross-project state, no structured extraction, no versioning, no entity resolution, Claude.ai-only | Cross-tool structured state via MCP; schema-first entities with provenance; works in every MCP-connected tool, not just one |
| **Claude chat memory** | RAG over past Claude.ai conversations; retrieval-based not state-based, no schema, no provenance, no write surface, Claude.ai-only | Deterministic composed state (not retrieval fragments); cross-tool; agents read and write structured entities |
| **Claude Cowork memory** | CLAUDE.md + auto-learnings (200-line / 25KB cap); local-only, no structured queries, no entity resolution, no cross-tool sync, degrades at scale (Fulkerson failure mode) | Schema-constrained entities that scale without degradation; cross-tool access; temporal queries; no cap on structured state |
| **Memory tool / homebrew** (API memory files, MEMORY.md, custom implementations) | Client-managed, per-app, no shared state across tools, no provenance, no versioning, maintenance burden grows with scale | All guarantees without building and maintaining it yourself; shared state across all MCP-connected tools |
| **ChatGPT memory** | Auto-captured preferences within ChatGPT; opaque, non-auditable, ChatGPT-only, no structured schema, no cross-tool portability | Transparent, inspectable state with full provenance; cross-tool via MCP; user controls what's stored and how |
| **Markdown / flat files** (CLAUDE.md, SOUL.md) | Doesn't scale; agents write Python scripts to manage files; no schema enforcement | Schema-constrained entities that scale without compensatory engineering |
| **Notion / Airtable** | Fine for human editing; breaks when adding agent reviewers; insufficient hooks for inter-agent validation | MCP-native data layer purpose-built for agent read/write |
| **JSON / CSV files** | Any real size triggers compensatory tooling; no versioning; last-write-wins | Append-only writes with versioning; no silent overwrites |
| **RAG / vector memory** (Mem0, Zep, LangChain) | Re-derives structure every session; entity resolution inconsistent; no provenance | Persistent canonical state; traceable observations; schema-bound entities |
| **Custom Postgres / SQLite** | Works initially; no versioning, conflict detection, provenance, or cross-tool sync out of the box; maintenance burden grows | All the above, without building and maintaining it yourself |
| **Nothing (raw re-prompting)** | Attention tax compounds daily; context lost every session | Immediate relief — Priority 1 data stores automatically from first session |

---

### Diagnostic questions

**Primary:** "What are you currently doing to compensate for unreliable agent state?"

**Pre-qualifier:** "Does your agent operate autonomously across sessions, or is it a thought partner you drive?"

### Qualification criteria

A person meeting **3+** is likely qualified; **5+** is strongly qualified.

| # | Criterion | Observable evidence |
|---|-----------|-------------------|
| Q1 | **Uses 3+ AI tools in regular workflow** | Names specific tools and uses them weekly or daily |
| Q2 | **Runs agents that operate across sessions** | Agents persist state, resume work, or execute autonomously |
| Q3 | **Coordinates state across multiple tools or agents** | Has experienced broken handoffs or context loss when switching |
| Q4 | **Has built personal automation around AI tools** | Scripts, MCP configs, agent pipelines, cron-triggered workflows |
| Q5 | **Actively compensates for missing state** | Re-prompts, copy-pastes between tools, maintains manual notes/docs |
| Q6 | **Has built or is building their own memory/state system** | Git+markdown, flat JSON, SQLite, custom scripts, or homegrown state layer |
| Q7 | **Experiences non-reproducible agent behavior** | Same inputs produce different outputs across sessions |
| Q8 | **Needs to debug, trace, or audit agent decisions** | Reconstructs what an agent did; writes defensive checkpoint code |
| Q9 | **Manages evolving context over time** | Contacts, tasks, financial data, projects, health — domains that accumulate and change |
| Q10 | **Comfortable with infrastructure-level tooling** | Willing to install via npm/CLI; reads API docs |
| Q11 | **Has experienced a failure caused by unreliable agent state** | Lost real work, made a bad decision, or discovered the agent operating on wrong/stale/hallucinated state. Strongest single qualifier — a concrete loss event creates urgency. |

**Strongest qualifier combinations:**
- Q1 + Q2 + Q5 → operational mode (context janitor paying the re-prompting tax)
- Q2 + Q7 + Q8 → infra mode (log archaeologist who can't replay agent state)
- Q2 + Q4 + Q6 → builder mode (building on unreliable memory, compensating with custom state)
- Q11 + Q2 + Q10 → burned adopter (experienced concrete failure — highest conversion likelihood)

### Disqualification criteria

**Hard disqualifiers** (any one is sufficient):

| # | Criterion | Why |
|---|-----------|-----|
| D1 | **No agent or AI-tool workflows** | No surface area for the problem |
| D2 | **Human drives every turn** (thought-partner pattern) | Human is the state layer by design |
| D3 | **Building their own state layer as a product** | Won't adopt external dependency for core value prop |
| D4 | **Requires zero-install, no-config onboarding** | Neotoma requires npm + CLI/MCP configuration |

**Note on D3 — adjacent platform builders.** Identity vendors, agent-framework maintainers, and auth-protocol authors fall under D3 as disqualifiers for conversion, but they are partnership and integration targets, not anti-targets. Neotoma should compose under their primitives, not compete with their roadmaps.
<!-- Source: ent_3f183584ebe4b89081cf9f75 -->

**Soft disqualifiers** (3+ together indicate poor fit):

| # | Criterion | Signal |
|---|-----------|--------|
| D5 | **Uses only one AI tool** | Limited cross-tool pain; platform memory may suffice |
| D6 | **Satisfied with platform memory** | No trust collapse or cross-tool fragmentation |
| D7 | **"AI remembering things"** without concern for determinism/versioning | Looking for convenience, not guarantees |
| D8 | **Looking for a PKM tool** | Obsidian/Notion/Roam is the right category |
| D9 | **No debugging, tracing, or compliance needs** | Core value props have no pull |
| D10 | **Single-session usage pattern** | No state evolution to manage |
| D11 | **Occasional AI use** (weekly or less) | Insufficient frequency for pain to compound |
| D12 | **Willing and able to build and maintain their own state infrastructure** | Capable DIY builders who roll their own MCP + Postgres (or equivalent) for personal use. They validate the problem space but prefer custom solutions. Not the same as D3 (building state as product) — these are personal-infra builders. They may convert later when maintenance burden exceeds adoption cost, but are not near-term adopters. |

### Deepening follow-ups

- "Which tools are you moving between, and where does context break?"
- "When a production agent produces wrong output, what does debugging look like today?"
- "When your agent gets memory wrong, how do you trace and fix it?"
- "What does your current memory/state system look like?"

**Full qualification survey:** [`qualification_survey.md`](./qualification_survey.md)

### Agentic evaluation

The [`/evaluate`](https://neotoma.io/evaluate) page is the canonical source for agent-driven evaluation — all qualification criteria and scoring in one page.

**User-facing prompt:**
> "Read neotoma.io/evaluate and assess whether Neotoma fits my workflow based on what you know about me."

**Internal single-shot analysis** (from a bio, transcript, or call notes):
> "Read neotoma.io/evaluate for the qualification criteria, then analyze the following context and produce a full evaluation scorecard: [paste context]"

---

## Non-ICP Boundaries

**Platform builders:** People with engineering teams who build their own state layer as product. State management is their core value prop. However, custom layers eventually hit the same pain Neotoma solves — silent overwrites, no conflict detection, manual schema migrations, no cross-tool sync. When maintenance cost exceeds adoption cost, they re-enter the funnel.

**Capable DIY builders:** Technically strong individuals who build their own state infra for personal use (custom MCP + Postgres, homegrown validation layers). They validate the problem space strongly — often independently arriving at the same architectural conclusions (schema constraints, multi-agent review hooks, deterministic validation). But they prefer to own and control the full stack. They are later adopters, not early ones. The people who can build their own are not the ones who adopt first.

**Thought-partner users:** Heavy AI users whose continuity needs are about context and voice, not deterministic state versioning. The human drives every turn; they are not running autonomous pipelines.

**Forget-by-default LLM users:** Technically strong users who deliberately spin up fresh contexts to retain deterministic control over what the model knows. They have experienced the re-prompting tax but have re-framed it as a feature. They validate the integrity/provenance story strongly but are not pain-driven adopters. Reactivation trigger: when they begin running unattended or cross-session pipelines, the same determinism preference that motivates fresh-context discipline will motivate Neotoma adoption — because Neotoma is the only way to keep that determinism guarantee at scale.
<!-- Source: ent_727fee4a94cfaea86880a0f1 -->

**Autonomous-loop builders on raw provider SDKs:** Builders running fully custom agentic harnesses on raw OpenAI / Anthropic SDKs with self-managed in-loop dedup agents. They engineer around the state-drift problem by construction (structured data, in-loop quality control) and refuse external substrates due to supply-chain reflex. Treat as anti-adopter; predict marginal-case rather than central-case ICP.
<!-- Source: ent_75b7d691cd12fb1524ef8b63 -->

---

## Watering Holes

Where the ICP discovers tools, discusses problems, and shares workflows.

### Primary channels

- **AI/agent Twitter/X:** Threads about agent memory failures, Claude Code workflows, MCP configurations, "how I use AI" posts. Key accounts to QT and engage: AI infrastructure builders, Claude Code power users, agentic workflow posters. Note: the Neotoma founder's existing X following skews crypto-era — requires gradual audience replacement through strategic engagement with AI/agent accounts.
- **Claude Code / Cursor communities:** Discord servers, GitHub discussions, and forums where power users troubleshoot agent memory, share CLAUDE.md patterns, and discuss MCP setups.
- **Indie hacker forums:** Hacker News, Indie Hackers, relevant subreddits (r/LocalLLaMA, r/ClaudeAI). Solo founders and freelancers discuss AI tooling pragmatically.
- **LinkedIn:** More effective for reaching AI-native consultants, senior ICs, and founders who post about their workflows. Different content register than X — longer, more structured, professional framing.

### Secondary channels

- **Open source agent tooling repos:** GitHub issues and discussions on repos like Beads, OpenClaw, LangChain, CrewAI — where people surface memory pain in the context of concrete tooling problems.
- **"How I use AI" blog posts and newsletters:** The ICP reads and writes these. A well-placed walkthrough of a personal Neotoma setup is both content and distribution.
- **AI meetups and developer events:** In-person or virtual events where builders demo their stacks. Neotoma fits naturally as a "here's what I use for state" component of a workflow talk.

### Content that resonates

- Personal workflow walkthroughs ("here's my setup and why")
- Failure stories ("my agent made a bad decision because...")
- Before/after comparisons (re-prompting vs. persistent state)
- QTs of posts describing agent memory frustration with a concrete alternative
- Technical deep-dives on state integrity for the infra-minded subset

---

## Adoption Funnel

How the ICP discovers, evaluates, adopts, expands, and advocates.

### Discovery

How they first encounter Neotoma. Likely paths:

- See a peer's workflow post mentioning Neotoma on X or LinkedIn
- Find neotoma.io via search for "AI agent memory," "MCP state layer," or similar
- Encounter it in a GitHub discussion, tools thread, or agent tooling list
- Receive a direct referral from someone in their network

### First contact (0–5 minutes)

What they do immediately after discovery:

- Read neotoma.io homepage — does the pain-first headline resonate?
- Scan the README on GitHub — is it credible? Is the architecture clear?
- Check stars, contributors, recent commits — is this actively maintained?
- **Key decision point:** "Is this worth 30 minutes of my Saturday?" If the answer is no, they bounce. The homepage must make the pain/solution connection in under 60 seconds.

### Evaluation (5–30 minutes)

What they do if first contact passed:

- Run the agentic evaluation prompt against neotoma.io/evaluate
- Or: npm install and run `bd init` (or equivalent) in a test project
- First observation stored — do they get feedback that it worked?
- **Key blocker:** Cognitive cold-start ("what should I store?") and UX friction (MCP restart, no success confirmation). See activation risks in [`developer_release_targeting.md`](./developer_release_targeting.md).

### Activation (first session)

What makes the first session successful:

- Priority 1 data stores automatically without manual configuration
- Agent demonstrates it can recall context from the new state layer
- User sees the provenance trail — "I can trace why this is here"
- **Activation signal:** User stores a second entity type beyond the default (e.g., adds a contact after conversations auto-stored)

### Expansion (first week)

What makes them deepen usage:

- Add a second domain (contacts → tasks, or contacts → financial data)
- Use Neotoma from a second tool (e.g., set up MCP in Cursor after starting in Claude)
- First cross-session recall that saves real time — the "it just knew" moment
- **Expansion signal:** 3+ entity types in use; MCP configured in 2+ tools

### Advocacy

What makes them tell someone else:

- A concrete "this saved me" story — the agent recalled something that would have been lost
- Enough trust to recommend it publicly (post, tweet, mention in a tools discussion)
- **Advocacy signal:** Unsolicited mention in a public forum; DM recommending to a peer

---

## Retention and Churn Signals

### Healthy usage indicators

- Observation volume growing or steady week-over-week
- New entity types being added over time (expanding domains)
- Cross-tool access (MCP configured in 2+ tools)
- Agent proactively storing without user prompting
- User querying state history or provenance (using the audit/replay capabilities)

### Early churn signals

- **Observation plateau:** No new observations for 3+ days after active first week. May indicate cognitive cold-start stall — user doesn't know what else to store.
- **Single entity type stagnation:** User stores contacts but never expands to tasks, decisions, or other domains. The OS isn't maturing.
- **Reversion to workarounds:** User starts a new project with markdown files or Notion instead of storing in Neotoma. The strongest churn signal — they've decided Neotoma isn't the default.
- **No cross-tool setup:** MCP configured in only one tool after 2+ weeks. Cross-tool state consistency — a core value prop — isn't being experienced.
- **Silent errors:** User encounters a bug or unexpected behavior and doesn't report it — they quietly stop using instead. Requires proactive outreach during dev release.

### Intervention points

- **Day 1:** Confirm successful first observation; suggest next entity type to store
- **Day 3:** Check if MCP is configured in a second tool; surface cross-tool value prop
- **Week 1:** Ask what domains they've added; suggest Priority 2 data types if stalled
- **Week 2:** If observation volume has plateaued, check whether they've reverted to workarounds and diagnose why
- **Ongoing:** Surface provenance/replay capabilities — many users may not discover these without prompting

| Pattern | Evidence |
|---|---|
| Multi-agent stacks, personal OS | Evaluators running 25+ autonomous loops, markdown CRMs, heartbeat BD pipelines, subagent coordination systems |
| Re-prompting / context-janitor tax | Universal cold-start question ("what counts as a fact worth remembering?"); agents with session amnesia between cron runs |
| Build-in-house state workarounds | Multiple evaluators independently building Claude memory systems using flat files (SOUL.md, HEARTBEAT.md), JSON heartbeats, markdown + embeddings |
| Advanced DIY state workarounds | Evaluator migrated from JSON → CSV → Notion → custom MCP + Postgres; independently arrived at schema constraints and multi-agent review hooks; validates problem space but likely a later adopter |
| Cross-tool state fragmentation | Ghostwriting pipelines losing context across sessions; platform memory coexistence questions; Notion breaking when adding a second agent as reviewer |
| JSON/file scaling limits | Files of any real size trigger agents to write Python scripts to manage them — a code smell indicating the wrong abstraction |
| State integrity as differentiator | Evaluator agents independently identifying "state integrity, not retrieval quality" and "deterministic guarantees" as the differentiated layer; one described it as "CI/CD for agent state" |
| Non-ICP self-selection | Platform builder who correctly said "I don't have the problem" (state management is their product); thought-partner user whose agent self-selected out |
| ICP boundary (capable DIY) | Evaluator who validates the problem strongly but is mid-build on custom infra: "I see potential value but this isn't my biggest problem." |
| Privacy-gated local-LLM waiters | Evaluator with strong infra fluency, home-server hosting personal data archive, running Ollama + Gemma/Qwen, postpones full Neotoma adoption until the local-LLM + MCP path is first-class. <!-- ent_4f0db2d7f2c349900e4dac2c --> |

---

## Category Contrast

Neotoma is not retrieval memory. Retrieval memory (RAG, vector DB, LangChain-style) performs context lookup over unstructured documents. Neotoma enforces deterministic state evolution: every state change is versioned, schema-bound, replayable, and auditable. The correct comparison axis is *guarantees*, not *features*.

- Retrieval memory → context lookup
- Deterministic memory → state governance

Neotoma sits as a state layer beneath your operational tooling — agents, pipelines, custom systems — without prescribing how they reason or act. Strategy artifacts (plans, decisions, rules, preferences) live in Neotoma as state; the act of strategizing happens in the operational layer above it.

---

## Objection-to-Framing Map

Objections mapped to framing layers (core incentive, role transformation, tax removal) rather than feature comparison.

### Architecture-mode objections

- *"We already have event sourcing / custom state management"* → Does your current system close the feedback loop on agent state? Can you diff entities between runs and replay to a specific point? If debugging is still log archaeology, you have state management but not feedback loop integrity.
- *"Not production-ready"* → The dev release fits the evaluation motion: validate guarantees locally, then propose for staging.

### Building-mode objections

- *"How is this different from RAG memory?"* → RAG re-derives structure every session. Neotoma persists it. If entity names resolve differently across sessions, your memory layer is approximating, not holding canonical state.
- *"We use LangChain/LangGraph memory"* → Can you trace a wrong answer to a specific observation? Can you replay to last Tuesday? If not, you're absorbing variance your memory layer doesn't handle.

### Operating-mode objections

- *"Platform memory is good enough"* → Does it follow you across tools? Can you verify a correction from last week is still held? Platform memory is tool-specific and non-auditable.
- *"Another tool to manage"* → Runs as an MCP server behind your existing tools — no new UI or workflow.
- *"I tried [Mem0 / native memory / custom memory] and it made things worse"* → That's exactly the failure mode Neotoma prevents. Fuzzy memory approximates recall; Neotoma enforces write integrity. Every observation is append-only, schema-constrained, and provenance-traced. The question isn't whether your agent should remember — it's whether you can verify that what it remembers is true.

### Field-validated objections

- *"How is this better than SQLite?"* → SQLite is a valid starting point. What it lacks: versioning (UPDATE overwrites), conflict detection (last-write-wins silently), provenance, cross-tool sync, entity resolution, and schema evolution. Neotoma uses SQLite internally but adds the architecture for memory guarantees on top.

- *"Should I use this alongside platform memory?"* → Complementary. Platform memory stores conversational preferences within one tool. Neotoma stores durable structured state with versioning, entity resolution, and cross-tool access via MCP. Both run simultaneously.

- *"How does ingestion work?"* → Agent-driven. Your agent decides what to observe, fills the parameters, Neotoma versions it. No background scanning, no passive data collection.

- *"What counts as a fact worth remembering?"* → Start with conversations, contacts, tasks, decisions. The heuristic: if it benefits from recall, audit, replay, or linking to other entities, store it.

- *"This feels like a solution looking for a problem"* → Start from the failure mode: "What breaks when your agent forgets last week?" If the answer involves re-explaining context, debugging unreproducible behavior, or manually syncing state, the problem is real. If the answer is "nothing," this person is not the ICP.

- *"I deliberately create fresh contexts so the model forgets — why would I want memory?"* → Because Neotoma is the opposite of fuzzy memory. Every observation is append-only, schema-bound, and inspectable. You don't lose the control you have when you start fresh — you gain a place where the things you do want to keep can't silently change underneath you, and where every decision the agent makes can be traced to the observation that produced it.
<!-- Source: ent_727fee4a94cfaea86880a0f1 -->

---

## ICP Vocabulary Bridge

The ICP describes problems in everyday language. This table maps their vocabulary to Neotoma's internal terminology. Lead with the ICP's language in outreach and qualification; introduce Neotoma terms during onboarding. Never correct a user's vocabulary — bridge from it.

| What the ICP says | What Neotoma calls it | Notes |
|---|---|---|
| "fact", "thing I told it", "piece of info" | **Entity** / observation | Users think in facts; Neotoma stores typed, schema-bound entities that accumulate observations. |
| "memory", "what it knows" | **State** (deterministic state layer) | "Memory" implies fuzzy recall; Neotoma provides versioned, auditable state. |
| "context" | **Entity graph** / persisted state | "What the agent should already know" — Neotoma structures this as related entities. |
| "remembering", "saving" | **Observing** / storing | Observations are recorded; snapshots are computed from them. |
| "forgetting", "losing things" | **State drift** / silent reversion | State changes or disappears without trace. |
| "contradiction", "it said something different" | **Conflicting state** / merge conflict | Two observations disagree; Neotoma detects and surfaces this. |
| "history", "what happened" | **Timeline** / observation log | Append-only, replayable sequence of all state changes. |
| "debugging what went wrong" | **Provenance tracing** / state replay | Tracing an output back through the observation that produced it. |
| "syncing between tools" | **Cross-tool state consistency** (via MCP) | The ICP manually carries context; Neotoma provides a shared substrate. |
| "schema", "structure" | **Schema** (same term) | Rare overlap — technical users already use this word correctly. |
| "AI memory tool" | **Deterministic state layer** | The framing Neotoma avoids but must bridge from; many users arrive searching for "AI memory." |
| "notes", "docs I keep for the agent" | **Entities** with observations | Markdown/Notion docs as workarounds map to structured entities. |
| "it worked last time but not now" | **Non-reproducible state evolution** | The reproducibility gap that triggers infra-mode adoption. |
| "it made a decision based on old info" | **State supersession failure** | A later observation should have replaced an earlier one but didn't. Agent builds on a reverted decision. |
| "it contradicted what I told it last week" | **Conflicting state** / undetected merge conflict | Observations disagree across sessions with no detection mechanism. |
| "I can't tell if what it remembers is real" | **Missing provenance** / hallucinated memory | No audit trail connecting a referenced "fact" to an actual observation. |
| "it remembered the what but not the why" | **Lossy compression** / summary degradation | Fuzzy memory flattens nuanced decisions into bare facts, stripping reasoning context. |
| "the agent doing the work", "my orchestrator", "the pipeline", "my harness" | **Operational layer** | Anything above Neotoma that reads truth and writes results back as observations. Neotoma is the state layer; the operational layer is where reasoning, planning, and action happen. |
| "the durable bit", "what I keep across runs", "my source of truth" | **State layer** (Neotoma) | The deterministic, versioned substrate the operational layer reads from and writes back to. |

---

## Data and Workflow Priority

Ordered by how quickly each data type delivers value.

**Priority 1 — Entry point (first session, zero config):**
- Conversations + agent messages — automatic, lowest friction, creates audit trail
- Contacts / people / companies — compounds fast
- Tasks + commitments
- Notes + decisions — capture reasoning that drifts between sessions

**Priority 2 — Personal domains (first week):**
- Financial data (transactions, accounts, recurring expenses)
- Calendar events, meetings, scheduling context
- Email triage and correspondence tracking
- Health and wellness data

**Priority 3 — OS maturation (weeks 2–4):**
- Content pipeline (posts, drafts, ideas, publishing state)
- Project context and codebase entities
- Agent session state and configuration

**Priority 4 — Organic growth (ongoing):**
- Disputes, legal, and compliance tracking
- Location and property data
- Habits, routines, and preference evolution
- Documents and artifact management

---

## Summary

**Primary ICP:** Personal agentic OS builders/operators (one archetype, three operational modes)

**Adoption triggers:** Chronic tax (re-prompting, manual sync) creates latent demand; acute crisis (corrupted state) creates urgency; capability unlocks (unattended execution, multi-agent coordination) create aspiration; external events and scale thresholds create receptivity windows.

**Non-ICP boundaries:** Platform builders (state is their product); capable DIY builders (will build their own, may convert later); thought-partner users (human is the state layer)

**Adoption path:** Discovery via peer posts and AI communities → first contact (homepage/README) → evaluation (install or agentic eval) → activation (first successful recall) → expansion (new domains, second tool) → advocacy (public mention)

**Retention risk:** Observation plateau, single entity type stagnation, reversion to workarounds, no cross-tool setup

**Secondary motion:** B2B-by-use-case, downstream from personal adoption

**One-line GTM:** Start with personal agentic OS builders/operators; expand to toolchain integrators and B2B-by-use-case as personal adoption creates team demand.

---

## Agent Instructions

### When to Load

- Planning GTM strategy or product roadmap
- Prioritizing feature development
- Evaluating ICP fit for a feature or user
- Understanding qualification, objection handling, or operational modes

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always)
- `README.md` and `docs/foundation/product_positioning.md` (for current developer-review scope and positioning)
- `docs/icp/profiles.md` (for detailed profiles)
- `docs/icp/developer_release_targeting.md` (for release-specific targeting and activation risks)

### Constraints

1. Language uses infrastructure/guarantees framing — not "AI memory tool"
2. Messaging leads with felt experience and role transformation, then grounds in guarantees
3. "Removing the tax" takes priority over "adding a feature"
4. Messaging connects chronic tax (convenience) to acute crisis (corrupted state) — convenience opens the door, integrity closes the sale
5. Qualification uses the diagnostic question and pre-qualifier
6. Each operational mode's interaction pattern shift is referenced in onboarding
7. Non-ICP boundaries (platform builders, capable DIY builders, thought-partner users) are respected in outreach and qualification
8. Data priority tiers guide what stores from day one vs. grows organically
9. Adoption triggers (pain, capability unlock, external events, scale thresholds) inform content and outreach timing
10. Competitor migration paths inform positioning — lead with what failed in their current tool, not Neotoma's feature list
11. Retention signals (observation plateau, workaround reversion) guide proactive outreach during dev release
12. For secondary and future ICPs, see [`secondary_icps.md`](./secondary_icps.md) and [`future_icps.md`](./future_icps.md)

### Validation Checklist

- [ ] Feature serves the primary ICP
- [ ] Messaging uses state integrity vocabulary, not consumer memory framing
- [ ] ICP messaging includes role transformation (escaping → into) and interaction pattern shift
- [ ] Content leads with felt experience before architectural description
- [ ] Messaging connects chronic tax to acute crisis
- [ ] Messaging distinguishes state layer (Neotoma) from operational layer (agents, pipelines, custom systems) — without prescribing pure cognition / pure effect
- [ ] Non-ICP boundaries respected (including capable DIY builders)
- [ ] Data priority tiers guide onboarding
- [ ] Content distributed through identified watering holes (AI Twitter, Claude Code communities, indie hacker forums)
- [ ] Adoption funnel stages addressed (discovery → first contact → evaluation → activation → expansion → advocacy)
- [ ] Retention signals monitored and intervention points actioned
