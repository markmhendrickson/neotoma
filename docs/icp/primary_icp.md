# Primary ICP: Personal Agentic OS Builders/Operators

## Scope

The primary ICP for the developer release: people constructing an operating system for their own AI agents across personal and professional life domains.

**For detailed ICP profiles (pain points, use cases, workflows), see [`profiles.md`](./profiles.md).**
**For secondary ICPs, see [`secondary_icps.md`](./secondary_icps.md).**
**For future ICPs and product layers, see [`future_icps.md`](./future_icps.md).**

## Category Contrast

Neotoma is not retrieval memory. Retrieval memory (RAG, vector DB, LangChain-style) performs context lookup over unstructured documents. Neotoma enforces deterministic state evolution: every state change is versioned, schema-bound, replayable, and auditable. The correct comparison axis is *guarantees*, not *features*.

- Retrieval memory → context lookup
- Deterministic memory → state governance

---

## ICP Vocabulary Bridge

The ICP describes their problems in everyday language. Neotoma has precise internal terminology. This table maps between the two — use the ICP's language in qualification, messaging, and onboarding, then introduce Neotoma terms as they adopt.

| What the ICP says | What Neotoma calls it | Notes |
|---|---|---|
| "fact", "thing I told it", "piece of info" | **Entity** (or observation on an entity) | Users think in facts; Neotoma stores typed, schema-bound entities. An entity accumulates observations over time. |
| "memory", "what it knows" | **State** (deterministic state layer) | "Memory" implies fuzzy recall; Neotoma provides versioned, auditable state. |
| "context" | **Entity graph** / persisted state | Users mean "what the agent should already know"; Neotoma structures this as related entities. |
| "remembering", "saving" | **Observing** / storing | Neotoma records observations; snapshots are computed from them. |
| "forgetting", "losing things" | **State drift** / silent reversion | The ICP's core pain — state changes or disappears without trace. |
| "contradiction", "it said something different" | **Conflicting state** / merge conflict | Two observations disagree; Neotoma detects and surfaces this. |
| "history", "what happened" | **Timeline** / observation log | Append-only, replayable sequence of all state changes. |
| "debugging what went wrong" | **Provenance tracing** / state replay | Tracing an output back through the observation that produced it. |
| "syncing between tools" | **Cross-tool state consistency** (via MCP) | The ICP manually carries context; Neotoma provides a shared substrate. |
| "schema", "structure" | **Schema** (same term) | Rare overlap — technical ICP users already use this word correctly. |
| "AI memory tool" | **Deterministic state layer** | The framing Neotoma avoids externally but must bridge from; many ICP users arrive searching for "AI memory." |
| "notes", "docs I keep for the agent" | **Entities** with observations | Users maintain markdown/Notion docs as workarounds; these map to structured entities. |
| "it worked last time but not now" | **Non-reproducible state evolution** | The reproducibility gap that triggers infra-mode adoption. |

**Usage guidance:** Lead with the ICP's language in outreach and early qualification. Introduce Neotoma terms during onboarding as the user encounters the concepts. Never correct a user's vocabulary — bridge from it.

---

## The Archetype

The primary ICP is spending a significant portion of their effort, attention, and emotional energy compensating for the absence of reliable agent state. Neotoma does not add a capability — it removes the tax. What they get back is the time, attention, and confidence that the tax was consuming.

They are people constructing an operating system for their own AI agents across personal and professional life domains. They wire together multi-agent stacks (Claude Code, Cursor, OpenClaw, ChatGPT, custom scripts) to manage finances, contacts, content, health, code, BD pipelines, and other domains. They are building infrastructure primarily for themselves, and secondarily for systems they ship to others.

The same person is an operator when running their contact CRM, a builder when creating a new agent pipeline, and an infrastructure engineer when debugging state drift across agents. The previously defined three Tier 1 personas (AI Infrastructure Engineers, Agent System Builders, AI-native Operators) describe moments in this person's workflow, not separate personas.

- **Pain trigger:** State drifts between sessions and tools; decisions execute without a reproducible trail; they become the human sync layer across every AI tool
- **Characteristics:** Building/operating agents that persist across sessions (not one-shot); coordinating state across multiple tools or agents; managing evolving personal/professional context over time; experiencing drift, conflicts, or unreproducible decisions; comfortable with infrastructure-level abstractions; using AI as autonomous pipeline, not just thought partner
- **Success:** Cross-tool memory is consistent; context persists across sessions; facts stored once are available everywhere; decisions are traceable
- **Adoption pattern:** Install for personal use, expand as the personal OS matures across life domains

### Field evidence

| Characteristic | Evaluator evidence |
|---|---|
| Multi-agent stacks, personal OS | Evaluator: 25 autonomous loops, 112-person markdown CRM. One evaluator: heartbeat BD pipeline in production. Evaluator: heartbeat checks + subagent coordination + darkmesh. |
| Re-prompting / context-janitor tax | Evaluator: "What counts as a fact worth remembering?" — universal cold-start. Evaluator: OpenClaw agent Timmy has session amnesia between crons. |
| Build-in-house state workarounds | Evaluator: building own Claude memory system ("everyone is doing the same"). Andre: SOUL.md/HEARTBEAT.md flat files. Anand: JSON heartbeat files. Evaluator: Markdown memory + Ollama embeddings. |
| Cross-tool state fragmentation | Evaluator: ghostwriting pipeline across sessions. Evaluator: asked about Claude Code memory coexistence. Evaluator: OpenClaw agent backfill reversed abandon pattern. |
| State integrity as differentiator | Evaluator's Claude: "State integrity, not retrieval quality." Evaluator's Claude Opus 4.6: "deterministic guarantees are the differentiated part." Evaluator: "CI/CD for agent state." |
| Non-ICP self-selection | Evaluator: platform builder, "I don't have the problem." Evaluator: thought-partner user, agent said "not for you." Both correctly excluded. |

### Data and workflow priority

Ordered by how quickly each data type delivers value. Priority 1 is what the agent should store from day one; Priority 4 is what emerges after the OS matures.

**Priority 1 — Entry point (first session, zero config):**
- Conversations + agent messages — automatic, lowest friction store, creates audit trail
- Contacts / people / companies — every conversation mentions people, compounds fast
- Tasks + commitments — agent hears "I need to" / "remind me" / "follow up with"
- Notes + decisions — capture reasoning that drifts between sessions

**Priority 2 — Personal domains (first week):**
- Financial data (transactions, accounts, statements, recurring expenses)
- Calendar events, meetings, scheduling context
- Email triage and correspondence tracking
- Health and wellness data

**Priority 3 — OS maturation (weeks 2-4):**
- Content pipeline (posts, blog drafts, ideas, publishing state)
- Project context and codebase entities
- Agent session state and configuration

**Priority 4 — Organic growth (ongoing):**
- Disputes, legal, and compliance tracking
- Location and property data
- Habits, routines, and preference evolution
- Documents and artifact management

### Non-ICP boundaries

**Platform builders (for now):** People with engineering teams who build their own state layer. Storage is part of their product, not an external dependency. They have the resources and motivation to build custom. Example: a founder building an identity/auth platform who said "I don't have the problem" because state management is their core product. However, custom state layers eventually hit the same pain Neotoma solves — versioning that silently overwrites, conflict detection that doesn't exist, schema evolution via manual migrations, no cross-tool sync. When the maintenance cost of their custom approach exceeds the cost of adopting an external dependency, they re-enter the ICP funnel.

**Thought-partner users:** Heavy AI users whose continuity needs are about context and voice, not deterministic state versioning. The human drives every turn; they are not running autonomous pipelines. Example: an executive coach whose agent self-selected out, noting the need was "more about context and voice than deterministic state versioning."

**Qualifying filter:** Does your agent operate autonomously across sessions, or is it a thought partner you drive? The latter is not the ICP even if technically sophisticated.

### B2B downstream motion

B2B opportunities emerge when personal agentic OS builders bring Neotoma into team/professional contexts. Not a separate ICP — a downstream motion from the primary. Examples: personal interest leading to healthcare agentic AI for a team; personal BD pipeline that could become a team BD tool; personal evaluation leading to compliance use case for a company.

---

## Operational Modes

The primary ICP operates in three modes — not separate personas, but facets of the same person's workflow. The cross-cutting analysis below captures how the modes relate; for full narrative profiles (core incentive, psychological trigger, role transformation, lifestyle improvement, interaction pattern shift), see [`profiles.md`](./profiles.md).

| Mode | Stack position | Current pain | Adoption trigger | Comparison set |
|------|---------------|-------------|-----------------|----------------|
| **Infrastructure engineering** | Infrastructure layer — below application agents, above compute | Can't reproduce agent runs; state mutations invisible; debugging is log archaeology | Reliability failure: same inputs, different state, no explanation | Event sourcing, state machines, append-only logs, provenance DBs |
| **Building agent systems** | Application layer — above orchestration, consuming infrastructure | Drift across sessions; conflicting state across tool boundaries; no replay | Memory inconsistency breaks a workflow: agent contradicts itself or drops context | RAG memory (Mem0, Zep), LangChain/LangGraph memory, file-based memory |
| **Operating across AI tools** | End of tool chain — power user with technical fluency | Context fragmentation; repeated explanations; broken handoffs between tools | Multi-tool workflow debt becomes intolerable | Platform memory (Claude, ChatGPT), PKM tools (Obsidian, Notion), manual sync |

---

## Cross-Cutting Analysis

### Why this ICP

- Highest alignment with the developer release: deterministic state, MCP/CLI/API interfaces, local-first architecture
- Validates the core invariants: state evolution, versioning, replayability, schema constraints
- Generates high-signal feedback on infrastructure-grade concerns (reliability, reproducibility, debuggability)
- The same person provides activation volume (operating), integration depth (building), and guarantee validation (debugging infra)

### Common thread

The personal agentic OS builder is spending a significant portion of their effort, attention, and emotional energy compensating for the absence of reliable state. When operating, they compensate by re-prompting. When building pipelines, they compensate by engineering around memory regressions. When debugging infrastructure, they compensate by writing glue.

In each mode, Neotoma does not add a capability — it removes the tax. What they get back is the time, attention, and confidence that the tax was consuming.

This framing — removing the tax, not adding a feature — should be the through-line in all messaging, onboarding conversations, and qualification interviews. When evaluating a potential user, the diagnostic question is: "What are you currently doing to compensate for unreliable agent state?" If the answer is substantial, they are ICP-qualified. If they don't compensate because they don't feel the pain, they are not the current target.

A sharper pre-qualifier: "Does your agent operate autonomously across sessions, or is it a thought partner you drive?" The latter is not the ICP even if technically sophisticated.

#### Tax summary

| Mode | Tax they pay | What they get back |
|------|-------------|-------------------|
| Operating | Re-prompting, context re-establishment, manual cross-tool sync | Attention, continuity, trust in their tools |
| Infrastructure debugging | Writing glue (checkpoint logic, custom diffing, state serialization) | Debugging speed, platform design time, sleep |
| Building pipelines | Prompt engineering workarounds, dedup hacks, memory regression fixes | Product velocity, shipping confidence, roadmap ambition |

### Role transformation summary

| Mode | Escaping | Into | Interaction pattern shift |
|------|----------|------|--------------------------|
| Operating | Context janitor — human sync layer between tools | Operator with continuity — steering, not driving | Turn-by-turn prompting → review-and-steer |
| Infrastructure debugging | Log archaeologist — reverse-engineering truth from logs | Platform engineer with replayable state | Manual orchestration → declarative trust |
| Building pipelines | Inference babysitter — absorbing variance the architecture doesn't handle | Builder who ships on solid ground | Compensating for memory → building on top of it |

### Adoption ecosystem

The three operational modes reinforce each other and feed downstream adoption:

- **Operating → Building:** Personal workflows that work become the basis for more ambitious agent pipelines. The operator's experience ("context actually persists") becomes confidence to build on top of it.

- **Building → Infrastructure debugging:** Production pipelines surface state integrity needs. When something breaks, the builder traces it through the state layer, validating the infrastructure guarantees.

- **Infrastructure validation → Toolchain adoption (Tier 2):** When the ICP standardizes on Neotoma and references its guarantees, framework maintainers see adoption signal. The ICP's recommendation creates the toolchain integrator's evaluation context.

- **B2B downstream:** The same person who adopts for personal use brings Neotoma into team contexts (healthcare, BD, compliance), creating the secondary B2B-by-vertical motion.

---

## ICP Qualification

### Diagnostic questions

The primary qualifying question:

> "What are you currently doing to compensate for unreliable or missing agent state?"

A sharper pre-qualifier:

> "Does your agent operate autonomously across sessions, or is it a thought partner you drive?"

### Qualification criteria (objective)

Observable conditions that indicate ICP fit. A person meeting **3+ of these** is likely qualified; meeting **5+** is strongly qualified.

| # | Criterion | Observable evidence |
|---|-----------|-------------------|
| Q1 | **Uses 3+ AI tools in regular workflow** | Names specific tools (Claude, Cursor, ChatGPT, Copilot, custom MCP setups, etc.) and uses them weekly or daily |
| Q2 | **Runs agents that operate across sessions** | Agents persist state, resume work, or execute autonomously — not single-turn Q&A |
| Q3 | **Coordinates state across multiple tools or agents** | Moves context between tools; has experienced broken handoffs or context loss when switching |
| Q4 | **Has built personal automation around AI tools** | Scripts, MCP configs, custom prompts, agent pipelines, cron-triggered workflows, or similar |
| Q5 | **Actively compensates for missing state** | Re-prompts context each session, copy-pastes between tools, maintains manual notes/docs as workaround |
| Q6 | **Has built or is building their own memory/state system** | Git+markdown memory, flat JSON, SQLite store, custom scripts, or homegrown state layer |
| Q7 | **Experiences non-reproducible agent behavior** | Same inputs produce different outputs across sessions; can't explain why an agent decision changed |
| Q8 | **Needs to debug, trace, or audit agent decisions** | Spends time reconstructing what an agent did and why; writes defensive checkpoint or logging code |
| Q9 | **Manages evolving personal/professional context over time** | Contacts, tasks, financial data, projects, health data, or other domains that accumulate and change |
| Q10 | **Comfortable with infrastructure-level tooling** | Willingness to install via npm/CLI; reads API docs; not blocked by developer-oriented interfaces |

**Strongest qualifier combinations:**
- Q1 + Q2 + Q5 → operational mode (context janitor paying the re-prompting tax)
- Q2 + Q7 + Q8 → infra mode (log archaeologist who can't replay agent state)
- Q2 + Q4 + Q6 → builder mode (building on unreliable memory, compensating with custom state)

### Disqualification criteria (objective)

Observable conditions that indicate someone is **not** the current target. A person meeting **any one** of the hard disqualifiers or **3+ soft** disqualifiers should not be prioritized.

**Hard disqualifiers** (any one is sufficient):

| # | Criterion | Why it disqualifies |
|---|-----------|-------------------|
| D1 | **No agent or AI-tool workflows** | No surface area for the problem Neotoma solves |
| D2 | **Human drives every turn** (thought-partner pattern) | State persistence has no leverage when there is no autonomous operation; the human is the state layer by design |
| D3 | **Building their own state layer as a product** | State management is their core value prop; they won't adopt an external dependency for it |
| D4 | **Requires zero-install, no-config onboarding** | Developer release requires npm install and CLI/MCP configuration; if that's a blocker, timing is wrong |

**Soft disqualifiers** (3+ together indicate poor fit):

| # | Criterion | What it signals |
|---|-----------|----------------|
| D5 | **Uses only one AI tool** | Limited cross-tool state pain; platform memory may be sufficient |
| D6 | **Satisfied with platform memory** (Claude memory, ChatGPT memory) | No experienced trust collapse or cross-tool fragmentation |
| D7 | **Describes need as "AI remembering things"** without concern for determinism, versioning, or reproducibility | Looking for convenience, not guarantees |
| D8 | **Looking for a note-taking or PKM tool** | Obsidian/Notion/Roam is the right category; Neotoma is infrastructure, not a PKM |
| D9 | **No debugging, tracing, or compliance needs** | Core value props (replayability, provenance, audit) have no pull |
| D10 | **Single-session usage pattern** | Agents don't persist across sessions; no state evolution to manage |
| D11 | **Occasional AI use** (weekly or less) | Insufficient frequency for memory pain to compound |

### Deepening follow-ups

- "Which tools are you moving between, and where does context break when you switch?"
- "When a production agent produces wrong output, what does your debugging process look like today?"
- "When your agent gets entity resolution or memory wrong, how do you trace and fix it?"
- "What does your current memory/state system look like? (Files, database, custom-built, nothing?)"

**For a full qualification survey, see [`qualification_survey.md`](./qualification_survey.md).**

### Agentic evaluation

The [`/evaluate`](https://neotoma.io/evaluate) page on neotoma.io is the canonical source for agent-driven evaluation. It contains all qualification criteria, evaluation instructions, and scoring framework in a format optimized for both humans and agents.

**User-facing prompt (one line):**

> "Read neotoma.io/evaluate and assess whether Neotoma fits my workflow based on what you know about me."

The agent reads the page, uses its existing context about the user (tools, workflow, conversation history), asks 1-2 natural questions to fill gaps, and delivers an honest assessment in the user's language. A structured scorecard for sharing with the Neotoma team is secondary and optional.

**For internal single-shot analysis** (qualifying from a bio, transcript, or call notes without live Q&A):

> "Read neotoma.io/evaluate for the qualification criteria, then analyze the following context and produce a full evaluation scorecard: [paste context]"

Both modes use the same canonical criteria from the site — no stale inline copies to maintain.

---

## Objection-to-Framing Map

Common objections mapped to the framing layers (core incentive, role transformation, tax removal) rather than feature comparison.

### Architecture-mode objections

- *"We already have event sourcing / custom state management"* → Does your current system close the feedback loop on agent state? Can you diff entities between runs and replay to a specific point? If debugging is still log archaeology, you have state management but not feedback loop integrity. (Core incentive: feedback loop integrity)
- *"Not production-ready"* → The dev release fits the evaluation motion: validate guarantees locally, then propose for staging. Local npm + SQLite is the right shape for this evaluation.

### Building-mode objections

- *"How is this different from RAG memory?"* → RAG re-derives structure every session. Neotoma persists it. If "Acme Corp" and "ACME CORP" resolve differently across sessions, your memory layer is approximating entities, not holding canonical state. (Core incentive: canonical state, not re-derived)
- *"We use LangChain/LangGraph memory"* → Can you trace a wrong answer to a specific observation? Can you replay to last Tuesday? If not, you're absorbing the variance your memory layer doesn't handle. (Role transformation: inference babysitter → builder on solid ground)

### Operating-mode objections

- *"Platform memory (Claude, ChatGPT) is good enough"* → Does it follow you across tools? Can you verify a correction from last week is still held? If you're re-explaining context every session, you're paying the context-janitor tax. Platform memory is tool-specific and non-auditable. (Tax framing: attention tax)
- *"Another tool to manage"* → Runs as an MCP server behind your existing tools — no new UI, no new workflow. The question is whether you want to keep being the human sync layer between Claude, Cursor, and ChatGPT, or let a state layer do it. (Role transformation: context janitor → operator with continuity)

### Field-validated objections (from real evaluator conversations)

- *"How is this better than SQLite?"* → SQLite is a valid starting point. It provides strong consistency and column types. What it lacks: versioning (UPDATE overwrites state), conflict detection (last-write-wins silently), provenance (no audit trail for who changed what and when), cross-tool sync (single-file, no MCP), entity resolution (you build it yourself), and schema evolution (migrations are manual). Neotoma uses SQLite internally but adds the architecture that delivers memory guarantees on top. (Framing: acknowledge the incumbent, show what breaks at scale)

- *"Should I use this alongside Claude Code's built-in memory?"* → Complementary. Platform memory stores conversational preferences and project-specific notes within one tool. Neotoma stores durable structured state — contacts, tasks, decisions, financial data — with versioning, entity resolution, and cross-tool access via MCP. Platform memory is short-term context ("I prefer TypeScript"); Neotoma is long-term structured state ("Clayton owes us $5,000 since March 15"). Both run simultaneously. (Framing: coexistence, not replacement)

- *"How does ingestion work — is it automatic?"* → Agent-driven. Neotoma is a store, not an extractor. Your agent decides what to observe, fills the parameters, Neotoma versions it. No background scanning, no regex extraction, no passive data collection. This is deliberate: the agent has the context to know what matters. (Framing: agent agency, not passive surveillance)

- *"What counts as a fact worth remembering?"* → Start with what your agent already produces: conversations, contacts, tasks, decisions. These store automatically from day one. The heuristic: if it benefits from recall, audit, replay, or linking to other entities, store it. Priority 1 is conversations + contacts + tasks + decisions; everything else grows organically. (Framing: concrete starting point, not abstract philosophy)

- *"This feels like a solution looking for a problem"* → Start from the failure mode: "What breaks when your agent forgets last week?" If the answer is "nothing," this person is not the ICP. If the answer involves re-explaining context, debugging unreproducible behavior, or manually syncing state across tools, the problem is real and specific. Lead with the pain, not the architecture. (Framing: pitch from failure mode, not architecture description)

---

## Activation Risks

Activation is the primary risk for the developer release. The docs historically treated activation as a success metric, not a risk. Field evidence shows three blocker classes that must be addressed alongside the adoption patterns above.

**1. Cognitive cold-start:** "What should I remember?" The agent does not proactively store, and the user does not know what is worth storing. This is the universal first-session problem.

| Mitigation | Status |
|---|---|
| Agent rules that make proactive storage the default (not opt-in) | **Done** — MCP instructions include store-first rule and entity extraction from every turn |
| Priority 1 data (conversations, contacts, tasks, decisions) stores automatically from day one | **Done** — agent rules enforce automatic capture |
| Concrete before/after examples in the "what to store" guide | **Pending** — `what_to_store.md` exists but lacks worked examples |
| Onboarding discovery flow that proposes high-value local files | **Done** — install flow includes discover → propose → preview → confirm |

**2. UX friction:** The product works but the path to working is rough.

| Friction point | Status |
|---|---|
| MCP not available until the AI tool is restarted after install | **Mitigated** — install guide documents restart requirement; no technical fix available (host-tool limitation) |
| Generic error messages that do not guide recovery | **Pending** — error messages need actionable context and recovery hints |
| No feedback on successful storage (user does not know it worked) | **Pending** — agent should confirm what was stored after each operation |
| Stale data when observations write without updating snapshots consistently | **Patched** — snapshot computation consistency improved |
| Duplicate entities from slight name variations across sessions | **Partially addressed** — entity resolution improved; canonical_name normalization added; edge cases remain |

**3. Trust barrier:** Supply chain and dependency security concerns block security-conscious developers before they ever reach the product. This is a different class of blocker from UX friction — it prevents installation entirely.

| Mitigation | Status |
|---|---|
| Audit dependency tree for unnecessary transitive dependencies and known CVEs | **Done** — dependency hardening pass completed; CVEs patched |
| Publish SBOM or dependency audit | **Pending** — not yet published |
| Address concerns proactively in install documentation | **Pending** — install page does not yet surface supply chain posture |

**Evidence:**
- Cognitive: Evaluator installed and worked successfully but asked "what counts as a fact worth remembering?" — universal cold-start
- UX: One evaluator discovered MCP required restart; One evaluator hitting stale data and duplicate entities at 20% capability utilization
- Trust: Evaluator blocked by supply chain/dependency security concerns before installing, despite having need and interest
- Abandon pattern: Evaluator never finished setup; Evaluator went silent after initial inbound interest; Evaluator reversed only when agent proactively backfilled data

---

## Non-goals for the Developer Release

The developer release is **not** targeting:

- **Casual prompt users** — people who use ChatGPT occasionally and do not feel memory pain
- **Note-taking / PKM users** — people looking for Obsidian, Notion, or Roam alternatives
- **Broad productivity audiences** — anyone seeking a general "AI memory tool" rather than a deterministic state layer

For detailed objective disqualification criteria, see [Disqualification criteria](#disqualification-criteria-objective) under ICP Qualification.

---

## Summary

### Primary ICP (Developer Release)
- Personal agentic OS builders/operators (one archetype operating in infra, builder, and operator modes)

### Non-ICP Boundaries
- Platform builders who build their own state layer
- Thought-partner users whose need is context and voice, not deterministic state

### Secondary Motion
- B2B-by-vertical (downstream from personal adoption)

### One-Line GTM Summary

**Start with personal agentic OS builders/operators; expand to toolchain integrators and B2B-by-vertical as personal adoption creates team demand; defer knowledge workers and small teams until post-dev release.**

---

## Agent Instructions

### When to Load This Document

Load when:
- Planning GTM strategy or product roadmap for the developer release
- Prioritizing feature development
- Evaluating whether a feature serves the primary ICP
- Deciding between infrastructure-grade and consumer-grade product decisions
- Understanding primary ICP operational modes, qualification, or objection handling

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always)
- `docs/specs/MVP_OVERVIEW.md` (for MVP scope alignment)
- `docs/icp/profiles.md` (for detailed ICP profiles)

### Constraints Agents Must Enforce

1. Developer release MUST directly serve the primary ICP: personal agentic OS builders/operators
2. All product decisions must align with primary ICP prioritization
3. Language must use infrastructure/guarantees framing (deterministic, versioned, replayable, auditable, schema-bound) — not "AI memory tool"
4. Messaging must lead with felt experience and role transformation, then ground in infrastructure/guarantees vocabulary (per constraint 3) — not the reverse
5. The "removing the tax" framing takes priority over "adding a feature" framing in all GTM and onboarding content
6. Qualification conversations should use the diagnostic question: "What are you currently doing to compensate for unreliable agent state?" and the pre-qualifier: "Does your agent operate autonomously across sessions, or is it a thought partner you drive?"
7. Each operational mode's interaction pattern shift (driving→steering, glue→invariants, compensating→compounding) should be referenced in onboarding and activation materials
8. Non-ICP boundaries (platform builders, thought-partner users) must be respected in outreach and qualification
9. Data priority tiers (Priority 1-4) should guide what the agent stores from day one vs what grows organically
10. For secondary and future ICPs, see [`secondary_icps.md`](./secondary_icps.md) and [`future_icps.md`](./future_icps.md)

### Validation Checklist

- [ ] Feature serves the primary ICP: personal agentic OS builders/operators
- [ ] GTM roadmap follows primary ICP first
- [ ] Messaging uses state integrity vocabulary, not consumer memory framing
- [ ] ICP messaging includes role transformation (escaping → into)
- [ ] ICP messaging includes interaction pattern shift, not just data layer improvement
- [ ] Qualification criteria reference the diagnostic question, pre-qualifier, and tax framework
- [ ] Content leads with felt experience before architectural description
- [ ] Non-ICP boundaries (platform builders, thought-partner users) are respected
- [ ] Data priority tiers guide onboarding (Priority 1 from day one)
