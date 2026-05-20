---
name: evaluate_positioning
description: 'Evaluate whether a positioning surface (homepage, subpage, pitch, README) effectively communicates to a target ICP. Scores against Obviously Awesome (Dunford), Made to Stick (Heath), Neotoma evaluator feedback, ICP alignment, and surface expression quality. Use when the user mentions "positioning", "evaluate positioning", "competitive alternatives", "how to position", "market category", "why customers dont get it", "positioning canvas", "repositioning", "category creation", "stickiness", "made to stick", "messaging evaluation", "review homepage", "homepage audit", "landing page review", "audit homepage", "review site", "does this page work", or "site review". Also trigger when launching a new product, entering a crowded market, diagnosing why prospects dont understand the products value, assessing whether positioning resonates with real feedback, or reviewing whether a page effectively speaks to the target ICP. Covers positioning canvas, team workshops, SUCCESs evaluation, evaluator feedback grounding, ICP fit scoring, and page/surface expression assessment. For customer jobs analysis, see jobs-to-be-done. For go-to-market, see crossing-the-chasm.'
license: MIT
metadata:
  author: wondelai
  version: "3.0.0"
  source_catalog: "https://mcpmarket.com/tools/skills/obviously-awesome-product-positioning"
  upstream_repo: "https://github.com/wondelai/skills"
  upstream_path: "obviously-awesome"
  extended_by: "neotoma"
  extensions: "Made to Stick evaluation, Neotoma evaluator feedback grounding, ICP alignment scoring, surface expression assessment"
---

# Product Positioning Evaluation Framework

This skill evaluates whether a positioning surface (homepage, subpage, pitch, README, or other asset) effectively communicates to a target ICP. It combines strategic positioning assessment with surface expression evaluation — because positioning only exists as experienced by the audience.

Five complementary lenses:

1. **Obviously Awesome** (April Dunford) — The 5-step positioning process: competitive alternatives, unique attributes, value mapping, best-fit customers, market category.
2. **Made to Stick** (Chip & Dan Heath) — The SUCCESs framework for evaluating whether positioning is memorable and actionable: Simple, Unexpected, Concrete, Credible, Emotional, Stories.
3. **Neotoma Evaluator Feedback** — Ground-truth validation against all evaluator feedback stored in Neotoma, surfacing whether positioning claims match what real evaluators said, felt, and objected to.
4. **ICP Alignment** — Structural fit against `docs/icp/primary_icp.md`: pain triggers, operational modes, vocabulary bridge, qualification criteria, adoption funnel, and competitor migration paths.
5. **Surface Expression** — Whether the page or asset presenting the positioning supports comprehension, demonstrates the product, and follows the audience's natural decision flow.

Lenses 1-4 produce the weighted Combined Positioning Score. Lens 5 (Surface Expression) functions as a gate: if it scores below 6, the combined score carries an asterisk.

## Core Principle

**Positioning is not messaging. Positioning is context.**

Positioning defines the context within which customers evaluate your product. It determines what category customers place you in, what alternatives they compare you against, which features they pay attention to, and how they judge your value. Get positioning right, and everything downstream — messaging, sales pitches, marketing campaigns, pricing — becomes dramatically easier. Get it wrong, and no amount of clever copywriting or advertising spend will save you. Customers who don't understand what you are will never understand why you matter.

The foundation of great positioning is understanding that customers always evaluate products relative to alternatives. There is no such thing as absolute product perception. A product that seems expensive in one context seems cheap in another. A feature that seems innovative against one set of competitors seems table-stakes against another. Your job is to deliberately choose the context that makes your unique strengths obvious.

## Scoring Overview

**Goal: 10/10** — Rate positioning quality across four lenses. The Obviously Awesome (Dunford) score below is one of four components; see [Combined Positioning Score](#combined-positioning-score) for the weighted composite.

### Obviously Awesome Score (Dunford): 0-10

| Score | Description |
|-------|-------------|
| 0-2 | No clear positioning. Customers can't explain what the product is or who it's for. |
| 3-4 | Vague positioning. Category is unclear, differentiation is weak, target customer is "everyone." |
| 5-6 | Partial positioning. Some components are clear but others are missing or inconsistent. Team members describe the product differently. |
| 7-8 | Strong positioning. All five components are defined. Team is aligned. Customers generally understand the value. |
| 9-10 | Exceptional positioning. Every component reinforces the others. Customers immediately understand the product, why it's different, and why they should care. The positioning creates an "aha" moment. |

*Additional scores: Made to Stick (0-10), Evaluator Feedback Grounding (0-10), ICP Alignment (0-10). See each section below for criteria.*

## Made to Stick Evaluation (SUCCESs Framework)

The SUCCESs framework from Chip & Dan Heath's "Made to Stick" evaluates whether an idea — including product positioning — is structured to be understood, remembered, and acted upon. Positioning that scores well on Dunford's framework but fails the stickiness test won't survive first contact with the market.

### The 6 SUCCESs Principles

**Each principle is scored 0-10. The Made to Stick composite is the average.**

#### 1. Simple — Find the Core

**What it means:** Strip the positioning to its essential core. Not dumbing down — finding the single most important thing customers need to understand. If you can't say it in one sentence, it's not simple enough.

**Evaluation criteria:**
- Can the positioning be expressed as a single, compact statement?
- Does it use the "inverted pyramid" — lead with the most important insight?
- Is there a "Commander's Intent" — a guiding principle that survives contact with the real world?
- Does it avoid burying the lead under technical architecture or feature lists?
- **Core Claim Coherence:** Is the Commander's Intent reinforced across all positioning elements (hero, value props, proof points, competitive framing, CTA), not just stated once? A core claim that appears only in the headline but isn't echoed in the rest of the surface loses its force.

**Scoring:**

| Score | Evidence |
|-------|----------|
| 0-3 | Positioning requires multiple paragraphs or a diagram to explain. Technical jargon dominates. Core claim (if present) appears in one place only. |
| 4-6 | Core idea exists but is buried under qualifications, features, or abstractions. Some reinforcement across surface but inconsistent. |
| 7-8 | Clear one-sentence core. Most people would remember it after hearing it once. Core claim echoed in at least 3 surface elements. |
| 9-10 | Commander's Intent is obvious. Anyone on the team could say it the same way. It's a proverb-level compression of the value. Every surface section reinforces the same core — the page has one voice. |

**Common failure mode for technical products:** Leading with architecture ("append-only observation log with schema-bound entities") instead of felt experience ("your agent never forgets, and you can prove it").

#### 2. Unexpected — Get and Hold Attention

**What it means:** Break a pattern to get attention, then create a curiosity gap to hold it. Positioning should violate the audience's expectations in a way that makes them want to know more.

**Evaluation criteria:**
- Does the positioning break the audience's existing schema or expectations?
- Does it open a curiosity gap — a question the audience needs answered?
- Does it avoid the "so what?" reaction from the target customer?
- Is the unexpected element connected to the core value (not just shock for shock's sake)?

**Scoring:**

| Score | Evidence |
|-------|----------|
| 0-3 | Positioning is predictable. Reads like every other tool in the category. No reason to stop scrolling. |
| 4-6 | Has a twist or insight, but it doesn't generate a curiosity gap. Audience nods but doesn't lean in. |
| 7-8 | Clear pattern violation that makes the audience pause. Creates a "wait, what?" moment connected to real pain. |
| 9-10 | Reframes the problem space in a way the audience hadn't considered. They can't stop thinking about the gap it opened. |

**Diagnostic question:** "After hearing the positioning for 5 seconds, does the target customer want to hear more, or do they think they already know what this is?"

#### 3. Concrete — Make It Real

**What it means:** Use sensory, specific language instead of abstractions. People remember concrete images and specific examples, not abstract principles.

**Evaluation criteria:**
- Does the positioning use specific, tangible examples rather than abstract concepts?
- Can the audience picture a specific scenario or use case?
- Does it avoid vague benefits ("better productivity," "more efficient") in favor of specific outcomes ("your agent recalls the correction you made last Tuesday")?
- Does it use the audience's own vocabulary (see ICP Vocabulary Bridge)?
- **Mental Model Anchoring:** For new-category products, does the positioning anchor the unfamiliar concept to a system the audience already understands? The analogy must map accurately without creating false expectations. (Example: "Git for agent state" maps versioning → commits, diff → change inspection, replay → checkout.)

**Scoring:**

| Score | Evidence |
|-------|----------|
| 0-3 | All abstract. "Deterministic state layer" with no grounding. Audience can't picture using it. No familiar reference point for new concepts. |
| 4-6 | Mix of abstract and concrete. Some examples exist but they feel generic or hypothetical. Analogy attempted but mapping is loose or misleading. |
| 7-8 | Specific scenarios the audience recognizes from their own experience. Uses their vocabulary. For new categories: effective anchoring analogy that maps accurately. |
| 9-10 | Velcro-level concreteness — multiple hooks that stick. The audience can immediately picture the before/after in their own workflow. Anchoring analogy is so apt the audience uses it to explain the product to others. |

**The Velcro Theory of Memory:** The more sensory hooks an idea has, the more it sticks. Abstract positioning has smooth surfaces; concrete positioning is covered in hooks.

#### 4. Credible — Enable Belief

**What it means:** Make the positioning believable without requiring trust. External credibility (authorities, data) helps, but the most powerful form is testable credibility — letting the audience verify the claim themselves.

**Evaluation criteria:**
- Does the positioning include verifiable proof points (customer quotes, data, case studies)?
- Can the audience test the claim themselves without a large investment (the "try before you trust" test)?
- Does it use internal credibility — vivid details that signal genuine experience?
- Does it avoid claims that require the audience to take the company's word for it?

**Scoring:**

| Score | Evidence |
|-------|----------|
| 0-3 | Claims with no evidence. "We're the best" with nothing to verify. |
| 4-6 | Some proof points but they're generic or unverifiable. Testimonials feel curated. |
| 7-8 | Specific, verifiable claims backed by data or testable within a short evaluation. |
| 9-10 | "Sinatra Test" passed — if it works for [impressive case], it'll work for me. Plus self-testable via eval or install. |

**The Sinatra Test:** "If I can make it there, I can make it anywhere." One compelling case study that makes the audience extrapolate credibility.

#### 5. Emotional — Make People Care

**What it means:** Appeal to self-interest and identity, not just logic. People act when they feel something. For technical products, the emotional lever is often identity-based: "people like me use this" or "this is the kind of tool a serious builder uses."

**Evaluation criteria:**
- Does the positioning connect to the audience's identity (who they want to be)?
- Does it tap into self-interest at the right level (not just "save money" but "become the builder who doesn't babysit agents")?
- Does it use the "role transformation" framing (escaping → into)?
- Does it make the audience feel understood rather than sold to?

**Scoring:**

| Score | Evidence |
|-------|----------|
| 0-3 | Pure logic/features. No emotional resonance. Could be a spec sheet. |
| 4-6 | Some identity appeal but it feels performative or misaligned with the audience's self-image. |
| 7-8 | Clear identity hook. Audience thinks "this was built for people like me." Role transformation is visible. |
| 9-10 | The positioning feels personal. It names a pain the audience has felt but hasn't articulated. They share it because it says something about them. |

**Technical product trap:** Over-indexing on logic because "our audience is rational." Even engineers choose tools based on identity and community — they just don't admit it.

#### 6. Stories — Drive Action Through Narrative

**What it means:** Stories simulate experience and inspire action. The best positioning embeds a story — even implicitly — that helps the audience see themselves using the product and achieving the outcome.

**Evaluation criteria:**
- Does the positioning contain or imply a narrative arc (before → transformation → after)?
- Can the audience project themselves into the story?
- Does it use the challenge plot (overcoming obstacles), connection plot (bridging gaps), or creativity plot (novel solution)?
- Does it show, not tell?

**Scoring:**

| Score | Evidence |
|-------|----------|
| 0-3 | No narrative. Just claims and features. |
| 4-6 | Implicit story exists but it's buried. The before/after isn't vivid. |
| 7-8 | Clear narrative the audience recognizes. They can see the transformation. Sales narrative (problem → old way → new way → solution → proof) is embedded. |
| 9-10 | The positioning IS a story. Every element contributes to a narrative the audience wants to be part of. They retell it to others. |

### Made to Stick Composite Score

Average the six principle scores. Map to positioning quality:

| Composite | Interpretation |
|-----------|---------------|
| 0-3 | Positioning won't survive first contact. Forgettable. |
| 4-5 | Some sticky elements but the overall message doesn't cohere. |
| 6-7 | Positioning sticks with the right audience but has weak spots that dilute impact. |
| 8-9 | Strong stickiness across most dimensions. Message travels well. |
| 10 | Proverb-level. The positioning becomes the way people talk about the category. |

---

## Neotoma Evaluator Feedback Grounding

**Purpose:** Ground positioning evaluation in real-world feedback data from Neotoma evaluators. This section turns positioning assessment from a theoretical exercise into an evidence-based audit.

### Retrieval Protocol

When running a positioning evaluation, retrieve evaluator feedback from Neotoma before scoring:

1. **Retrieve evaluators:** Query `developer_release_tester` entities to get the full evaluator roster.
2. **Retrieve feedback:** Query `issue` entities (and linked conversations) for evaluator reactions, objections, and quotes.
3. **Retrieve evaluator-to-ICP mappings:** Search for `agent_message` entities containing evaluator ICP scoring and classification (Strong, Moderate, Weak, Non-ICP, DIY).
4. **Retrieve convergent themes:** Search for agent messages about evaluation analysis, positioning gaps, and feedback synthesis.

### Evaluation Dimensions

Score each dimension 0-10 based on evaluator evidence:

#### A. Pain Validation (0-10)

Does the positioning name a pain that evaluators actually described? Does it lead with that pain?

| Score | Evidence required |
|-------|-------------------|
| 0-3 | Positioning describes a pain no evaluator mentioned. Theoretical problem. Capabilities-first framing. |
| 4-6 | Pain exists in evaluator data but positioning frames it differently than evaluators describe it. Pain is present but buried below features or architecture. |
| 7-8 | Multiple evaluators independently described the exact pain the positioning names. Surface leads with recognizable problems before introducing capabilities. |
| 9-10 | Evaluators used the same language the positioning uses. Verbatim alignment between positioning claims and evaluator quotes. Pain-first ordering: the audience recognizes the problem before they learn what the product does. |

**Pain Ordering (product-type modifier):** The form of "leading with pain" varies by product type. Load `docs/icp/primary_icp.md` to determine which framing applies:
- *Infrastructure products:* Lead with production failure modes (state drift, silent mutation, irreproducible decisions). Value framed as guarantees under failure conditions ("what cannot go wrong"), not capabilities.
- *SaaS/workflow products:* Lead with workflow pain (wasted time, lost context, manual workarounds). Value framed as outcomes ("what you can now do").
- *Platforms:* Lead with ecosystem friction (integration failures, lock-in, capability gaps). Value framed as ecosystem leverage ("what this unlocks").

**Evaluator evidence themes to check against:**
- Re-prompting / context-janitor tax (universal across evaluators)
- State drift between sessions and tools
- "What counts as a fact worth remembering?" cold-start confusion
- Build-in-house state workarounds (flat files, JSON, markdown, custom MCP+Postgres)
- Cross-tool state fragmentation
- JSON/file scaling limits triggering compensatory tooling
- "State integrity, not retrieval quality" as the differentiated layer

#### B. Competitive Frame Accuracy (0-10)

Does the positioning compare against what evaluators actually use today, or against strawmen?

| Score | Evidence required |
|-------|-------------------|
| 0-3 | Positioning compares against tools evaluators don't use (VC-funded competitors no one tried). |
| 4-6 | Some competitive alternatives match evaluator reality but others are hypothetical. |
| 7-8 | Competitive frame matches evaluator-reported alternatives: SQLite, git+markdown, flat JSON, Notion, platform memory, custom Postgres. |
| 9-10 | Positioning anticipates evaluator migration paths (the specific thing they tried, why it failed, what they're receptive to). |

**Real competitive alternatives from evaluator data:**
- Markdown/flat files (CLAUDE.md, SOUL.md, HEARTBEAT.md)
- JSON/CSV files that trigger compensatory Python scripts
- Notion/Airtable (breaks when adding agent reviewers)
- Platform memory (Claude, ChatGPT — tool-specific, non-auditable)
- Custom MCP + Postgres (capable DIY builders)
- SQLite (valid starting point but lacks versioning, conflict detection, provenance)
- RAG/vector memory (Mem0, Zep, LangChain — re-derives structure every session)
- "Do nothing" / raw re-prompting

#### C. Objection Coverage (0-10)

Does the positioning preemptively address objections evaluators actually raised?

| Score | Evidence required |
|-------|-------------------|
| 0-3 | Positioning ignores or is blind to common evaluator objections. |
| 4-6 | Some objections addressed but major ones are missing. |
| 7-8 | Core objections covered. Evaluators would feel heard. |
| 9-10 | Every major objection class has a clear, satisfying response embedded in or derivable from the positioning. |

**Evaluator-sourced objection classes:**
- "How is this different from RAG memory?" (most common confusion)
- "How is this better than SQLite?" (from technically sophisticated evaluators)
- "Should I use this alongside platform memory?" (coexistence question)
- "What counts as a fact worth remembering?" (cold-start/onboarding)
- "This feels like a solution looking for a problem" (from non-ICP or weak-fit evaluators)
- Supply chain / dependency security concerns (trust barrier)
- "Not my biggest problem right now" (from capable DIY builders)
- Architecture-first language that doesn't lead with felt experience

#### D. Evaluator Segment Coverage (0-10)

Does the positioning resonate with the evaluator segments that matter most?

| Score | Evidence required |
|-------|-------------------|
| 0-3 | Positioning resonates only with non-ICP evaluators or no segment. |
| 4-6 | Resonates with one segment but alienates or confuses others. |
| 7-8 | Strong resonance with "Strong ICP" evaluators. Moderate evaluators can see themselves in it. |
| 9-10 | Strong ICP evaluators would share it. Moderate evaluators would try it. Even Capable DIY evaluators recognize the problem description. |

**Evaluator distribution for reference** (as scored against primary_icp.md Q1-Q11/D1-D12):
- **Strong ICP (~8):** Multi-agent stack operators, autonomous pipeline builders, personal OS constructors
- **Capable DIY (~2):** Validate the problem strongly but building their own infrastructure
- **Moderate (~7):** Partial fit — some qualification criteria met, potential to convert with better activation
- **Weak (~4):** Low qualifier scores, not experiencing the core pain
- **Non-ICP (~2):** Hard disqualifiers (human-driven thought-partner pattern, state management is their product)

### Feedback Grounding Composite Score

Average the four dimension scores (A-D). This score reflects how well positioning is grounded in reality versus theory.

---

## ICP Alignment Evaluation

**Purpose:** Score positioning against the structural elements of `docs/icp/primary_icp.md` to ensure every positioning component serves the defined target customer.

### Retrieval Protocol

Load `docs/icp/primary_icp.md` before scoring. Cross-reference with `docs/icp/profiles.md` for detailed profile data and `docs/icp/developer_release_targeting.md` for release-specific targeting constraints.

### Evaluation Dimensions

Score each dimension 0-10:

#### I. Archetype Resonance (0-10)

Does the positioning speak to the primary ICP archetype: personal agentic OS builders/operators who spend significant effort compensating for the absence of reliable agent state?

| Score | Evidence |
|-------|----------|
| 0-3 | Positioning addresses a generic developer audience. No specificity to the agentic OS builder. |
| 4-6 | Partially addresses the archetype but misses key characteristics (multi-agent stacks, cross-session persistence, personal OS construction). |
| 7-8 | Clearly addresses someone who wires together multi-agent stacks and experiences state drift. |
| 9-10 | The ICP reads the positioning and thinks "this was written by someone who lives my workflow." The archetype section of primary_icp.md could be quoted as evidence. |

#### II. Pain Trigger Alignment (0-10)

Does the positioning connect chronic tax (re-prompting, manual sync) to acute crisis (corrupted state, bad decisions from wrong data)?

| Score | Evidence |
|-------|----------|
| 0-3 | Positioning mentions neither chronic tax nor acute crisis. Leads with features or architecture. |
| 4-6 | Addresses one pain trigger but not both, or doesn't connect them. |
| 7-8 | Both chronic and acute triggers present. The connection is clear: convenience opens the door, integrity closes the sale. |
| 9-10 | Uses the exact framing: "You're already paying the re-prompting tax every day. But the real risk isn't the time you waste — it's the time you don't notice your agent is operating on bad state." |

#### III. Operational Mode Coverage (0-10)

Does the positioning resonate across all three operational modes (Operating, Building, Infrastructure debugging)?

| Score | Evidence |
|-------|----------|
| 0-3 | Positioning addresses only one mode or none specifically. |
| 4-6 | Primary mode is addressed but the other modes feel like afterthoughts. |
| 7-8 | All three modes are served. The role transformation (escaping → into) is visible for each. |
| 9-10 | Each mode has a clear "that's me" moment. The positioning canvas works regardless of which mode the reader is in right now. |

**Role transformations to check:**
- Operating: context janitor → operator with continuity
- Infrastructure debugging: log archaeologist → platform engineer with replayable state
- Building: inference babysitter → builder on solid ground

#### IV. Vocabulary Bridge Compliance (0-10)

Does the positioning use the ICP's language, not internal/technical jargon?

| Score | Evidence |
|-------|----------|
| 0-3 | Internal jargon dominates: "deterministic state layer," "append-only observation log," "schema-bound entities." |
| 4-6 | Mix of ICP and internal language. Some bridging exists but technical terms leak through. |
| 7-8 | Leads with ICP vocabulary ("memory," "forgetting," "context," "what it knows"). Introduces technical terms only after bridging. |
| 9-10 | The ICP Vocabulary Bridge table from primary_icp.md is fully respected. Positioning could be understood by someone who says "fact" instead of "entity" and "memory" instead of "state." |

#### V. Qualification & Disqualification Clarity (0-10)

Does the positioning naturally attract qualified prospects and repel non-ICP?

| Score | Evidence |
|-------|----------|
| 0-3 | Positioning is broad enough that non-ICP audiences (thought-partner users, platform builders) think it's for them. |
| 4-6 | Some self-selection happens but the boundaries aren't clean. |
| 7-8 | Qualified prospects (Q1-Q5 criteria) see themselves. Non-ICP (D1-D4) correctly self-select out. |
| 9-10 | The positioning functions as a filter. Strong ICP reads it and feels urgency. Non-ICP reads it and correctly thinks "that's not my problem." Hard disqualifiers are embedded naturally. |

#### VI. Competitor Migration Path Alignment (0-10)

Does the positioning address the real competitive alternatives and migration paths from the ICP document?

| Score | Evidence |
|-------|----------|
| 0-3 | Positioning compares against irrelevant competitors or ignores the "Currently using → Why it fails → Receptive to" framework. |
| 4-6 | Some migration paths addressed but major ones (markdown/flat files, custom Postgres, "do nothing") are missing. |
| 7-8 | Core migration paths covered. The ICP can locate their current tool and see the upgrade path. |
| 9-10 | Every row in the Competitor Migration Paths table from primary_icp.md has a clear positioning response. The positioning anticipates where the reader is coming from. |

#### VII. Distribution-Fit (0-10)

Is the positioning structured for the distribution channel that matches how the audience actually discovers and shares tools?

| Score | Evidence |
|-------|----------|
| 0-3 | Positioning optimizes for a channel the audience doesn't use (mass social for a peer-referral audience, or enterprise sales for a PLG audience). |
| 4-6 | Channel match is partial. Some elements support the right distribution but others fight it. |
| 7-8 | Positioning is structured for the primary distribution channel. The audience's natural sharing behavior is supported. |
| 9-10 | The positioning creates shareable artifacts native to the audience's channel. Every element is designed to travel the way this audience actually refers tools. |

**Distribution channel by audience type** (load `docs/icp/primary_icp.md` to determine which applies):
- *Developer infrastructure:* Peer referral via Slack, GitHub, DMs. Success condition: "you should try this." Positioning must create depth of insight that drives quiet sharing, not surface appeal.
- *SaaS/product-led:* Self-serve trial and word-of-mouth. Success condition: "see for yourself." Positioning must lower barrier to first experience.
- *Enterprise:* Sales-assisted with internal champion. Success condition: "here's how to sell it internally." Positioning must be transferable from champion to decision-maker.

### ICP Alignment Composite Score

Average the seven dimension scores (I-VII). This score reflects how precisely the positioning serves the defined ICP versus a generic audience.

---

## Surface Expression

**Purpose:** Evaluate whether the page or asset presenting the positioning supports comprehension, demonstrates the product, and follows the audience's natural decision flow. Positioning only exists as experienced by the audience — strong strategic positioning undermined by poor surface expression won't convert. This lens is a **supplementary gate**, not weighted into the Combined Positioning Score. If the surface expression composite falls below 6, the combined score carries an asterisk.

### Evaluation Dimensions

Score each dimension 0-10. The composite is the average.

#### A. Section Economy (0-10)

Does each section have a single clear job? Target: 5-7 primary sections maximum.

| Score | Evidence |
|-------|----------|
| 0-3 | 10+ sections with overlapping purposes. Multiple sections cover "what it does" or "why trust us." |
| 4-6 | 7-9 sections. Some redundancy but each has a nominal purpose. |
| 7-8 | 5-7 sections, each with a distinct job. No section could be merged without losing signal. |
| 9-10 | Every section answers exactly one question in the visitor's decision flow. Nothing redundant, nothing missing. |

#### B. Scan Time (0-10)

Can a visitor extract each section's core message in under 10 seconds?

| Score | Evidence |
|-------|----------|
| 0-3 | Sections require paragraph-level reading. Dense text blocks, unexplained jargon, or visual clutter. |
| 4-6 | Headlines are clear but supporting copy requires close reading. Some sections need two passes. |
| 7-8 | Headline + one glance at cards/bullets conveys the point. Jargon is bridged before use. |
| 9-10 | Every section communicates at scroll speed. The page works even if the visitor never stops scrolling. |

#### C. Progressive Disclosure (0-10)

Does the homepage provide overview only, linking to detail pages for depth?

| Score | Evidence |
|-------|----------|
| 0-3 | Homepage contains deep technical content (full schemas, API docs, exhaustive comparisons). |
| 4-6 | Some detail sections belong on subpages but are given full homepage slides. |
| 7-8 | Homepage previews each concept with a clear link to depth. No section requires prior technical knowledge. |
| 9-10 | Homepage is a decision aid, not documentation. Every detail has a "learn more" escape hatch. |

#### D. Decision Flow (0-10)

Does section ordering follow the natural decision sequence: Problem → Value/Guarantees → Who is it for → How to use it → Why believe it → How to try it? Architecture and implementation details come only after motivation is established.

| Score | Evidence |
|-------|----------|
| 0-3 | Sections are in arbitrary order. Architecture appears before the problem. Proof appears before value is stated. |
| 4-6 | General flow exists but some sections are out of sequence (e.g., technical details before the audience sees themselves, or architecture before motivation). |
| 7-8 | Clear narrative arc from problem → value → identity → proof → action. Each section answers the question the previous one raised. |
| 9-10 | The page reads like a conversation. A first-time visitor never wonders "why am I seeing this now?" Architecture is deferred until after the visitor believes it matters. |

#### E. Scroll-to-CTA Ratio (0-10)

How many scroll stops before the primary conversion action?

| Score | Evidence |
|-------|----------|
| 0-3 | Primary CTA is only at the bottom. Visitor must pass 6+ full sections to reach it. |
| 4-6 | CTA appears in hero but the "evaluate" or "try it" section is 5+ stops deep. No mid-page reinforcement. |
| 7-8 | Primary CTA in hero. Secondary CTA or reinforcement within 3-4 sections. Dedicated CTA section within 5 stops. |
| 9-10 | CTA is always one scroll away. Multiple natural entry points. The page never makes the visitor search for the next step. |

#### F. Conciseness (0-10)

Is each section's copy tight enough to be read, not skimmed past? Does it use specific, concrete language rather than vague qualifiers?

| Score | Evidence |
|-------|----------|
| 0-3 | Multiple sections have 3+ paragraphs. Card descriptions exceed two lines. Concepts repeat across sections. Vague language ("improves," "enhances," "powerful"). |
| 4-6 | Most sections are concise but 1-2 have bloated copy or redundant descriptions. Some vague benefits mixed with specific ones. |
| 7-8 | Every section's copy fits its visual container without overflow. No concept appears in more than one section. Language is specific ("tracks versioned changes," "replays state at any time"). |
| 9-10 | Every word earns its place. Removing any sentence would lose signal. Zero vague qualifiers — every claim is concrete and verifiable. |

#### G. Experiential Proof (0-10)

Does the surface show the product in use, not just describe it? The audience must feel what it's like to use the system. The form of experiential proof varies by product type.

| Score | Evidence |
|-------|----------|
| 0-3 | No product shown. Only abstract descriptions, diagrams, or marketing language. Audience can't imagine using it. |
| 4-6 | Some product visibility but it feels staged or generic. Screenshots exist but don't demonstrate a real workflow. |
| 7-8 | Real product interactions visible: CLI output, UI screenshots, code examples, diffs, timelines — appropriate to the product type. The audience can picture themselves typing the commands or clicking the UI. |
| 9-10 | The surface creates an "aha" moment through demonstration. The audience doesn't just understand the product — they feel what using it would be like. Interactive elements or rich examples make the value tangible before installation. |

**Product-type adaptation:**
- *CLI/infrastructure:* Show terminal interactions, command output, diffs, replay
- *SaaS/web app:* Show UI flows, before/after screenshots, real data
- *API/platform:* Show code examples, request/response pairs, integration patterns

#### H. Trial Friction (0-10)

Does the path from "interested" to "experiencing the product" feel fast, reversible, and low-risk? Does the first experience connect to the visitor's own context?

| Score | Evidence |
|-------|----------|
| 0-3 | No clear path to try. Installation requires significant commitment. No visibility into what happens next. |
| 4-6 | Trial path exists but feels heavy (long signup, complex setup). First experience is generic, not personalized. |
| 7-8 | Installation or trial feels fast and reversible. First experience shows immediate output. Some connection to the visitor's own context. |
| 9-10 | Trial feels like progress, not setup. The first output connects to the visitor's own data or workflow. Agent-driven or one-command installation that produces real, personalized results immediately. |

### Surface Expression Composite Score

Average the eight dimension scores (A-H).

| Composite | Interpretation |
|-----------|---------------|
| 0-3 | Surface actively harms positioning. Visitors bounce before absorbing the message. |
| 4-5 | Readable by motivated visitors, but casual traffic loses the thread. |
| 6-7 | Solid structure with some weak spots. Specific dimensions can be strengthened. |
| 8-9 | Clean, purposeful surface. Each element earns its place and demonstrates value. |
| 10 | Every word, section, interaction, and link serves the visitor's decision flow. |

**Surface Expression gate:** If the composite is below 6, append an asterisk to the Combined Positioning Score with the note: "* Positioning quality degraded by surface expression — composite X/10."

---

## Combined Positioning Score

The final positioning quality rating combines all four lenses:

| Lens | Weight | Rationale |
|------|--------|-----------|
| Obviously Awesome (Dunford) | 30% | Structural positioning completeness |
| Made to Stick (Heath) | 25% | Message memorability and actionability |
| Evaluator Feedback Grounding | 25% | Real-world validation against actual audience |
| ICP Alignment | 20% | Structural fit to defined target customer |

**Combined Score = (Dunford × 0.30) + (MTS × 0.25) + (Feedback × 0.25) + (ICP × 0.20)**

| Combined | Interpretation |
|----------|---------------|
| 0-2 | No viable positioning. Start over. |
| 3-4 | Positioning exists but is structurally incomplete, forgettable, ungrounded, or misaligned with ICP. |
| 5-6 | Partial positioning. Some lenses score well but others drag the total down. Identify the weakest lens and fix it. |
| 7-8 | Strong positioning across most lenses. Targeted improvements can push to exceptional. |
| 9-10 | Exceptional. Structurally complete, sticky, validated by real feedback, and precisely targeted. |

**Supplementary gate — Surface Expression:** The surface expression composite (see [Surface Expression](#surface-expression)) is not weighted into the combined score but functions as a gate. If surface expression scores below 6, the combined score carries an asterisk noting the degradation. Strong positioning on a poorly expressed surface still underperforms.

### Evaluation Output Format

When running a positioning evaluation, produce the following structure:

```
## Positioning Evaluation: [Product/Message/Asset]

### 1. Obviously Awesome (Dunford): X/10
- Competitive Alternatives: [score + evidence]
- Unique Attributes: [score + evidence]
- Value Themes: [score + evidence]
- Best-Fit Customers: [score + evidence]
- Market Category: [score + evidence]

### 2. Made to Stick (Heath): X/10
- Simple: [score + evidence]
- Unexpected: [score + evidence]
- Concrete: [score + evidence]
- Credible: [score + evidence]
- Emotional: [score + evidence]
- Stories: [score + evidence]

### 3. Evaluator Feedback Grounding: X/10
- Pain Validation: [score + evaluator evidence]
- Competitive Frame Accuracy: [score + evaluator evidence]
- Objection Coverage: [score + evaluator evidence]
- Evaluator Segment Coverage: [score + evaluator evidence]
[Include specific evaluator quotes/reactions as evidence]

### 4. ICP Alignment: X/10
- Archetype Resonance: [score + evidence]
- Pain Trigger Alignment: [score + evidence]
- Operational Mode Coverage: [score + evidence]
- Vocabulary Bridge Compliance: [score + evidence]
- Qualification Clarity: [score + evidence]
- Competitor Migration Paths: [score + evidence]

### 5. Surface Expression (supplementary gate): X/10
- Section Economy: [score + evidence]
- Scan Time: [score + evidence]
- Progressive Disclosure: [score + evidence]
- Decision Flow: [score + evidence]
- Scroll-to-CTA Ratio: [score + evidence]
- Conciseness: [score + evidence]
- Experiential Proof: [score + evidence]
- Trial Friction: [score + evidence]
[If composite < 6, flag as surface expression gate failure]

### Combined Score: X/10
[Weighted calculation shown]
[If surface expression < 6: "* Positioning quality degraded by surface expression — composite X/10."]

### Top 3 Improvements
1. [Highest-impact fix with specific recommendation]
2. [Second priority]
3. [Third priority]
```

---

## The 10 Positioning Components

| Component | Description | Example |
|-----------|-------------|---------|
| Competitive Alternatives | What customers would use if your product didn't exist | Spreadsheets, manual processes, hiring a consultant, doing nothing |
| Unique Attributes | Features or capabilities only your product has | Real-time collaboration on financial models |
| Value Themes | Benefits customers get from your unique attributes | Save 10 hours/week on financial reporting |
| Best-Fit Customers | Characteristics of people who care most about your value | Mid-market CFOs managing 3+ business units |
| Market Category | The market you describe yourself as part of | Financial planning and analysis (FP&A) software |
| Relevant Trends | Market dynamics that make your positioning resonate now | Remote finance teams need real-time collaboration |
| Positioning Statement | Internal summary of positioning for team alignment | "For mid-market CFOs, we are the FP&A platform built for real-time collaboration across distributed teams" |
| Sales Narrative | How positioning translates into a compelling sales story | Problem → old way → new way → your solution → proof |
| Messaging | External-facing language derived from positioning | "Financial planning that keeps up with your business" |
| Content Strategy | How positioning guides what content to create | Thought leadership on collaborative finance, case studies from multi-unit companies |

## The 5-Step Positioning Process

### Step 1: Identify Your Competitive Alternatives

**Core concept:** Start by understanding what your best customers would do if your product vanished tomorrow. These are your true competitive alternatives — not just direct competitors, but any way customers solve the problem today, including manual processes, spreadsheets, hiring someone, or simply doing nothing.

**Why it works:** Customers always evaluate products relative to alternatives. If you don't understand the real alternatives, you can't understand what "differentiated" means in your customer's mind. Your positioning is only as strong as the alternatives you're positioning against.

**Key insights:**
- Ask existing happy customers, not prospects — they've already chosen you and can tell you what they switched from
- The most common competitive alternative is often not another product — it's a spreadsheet, a manual process, or the status quo
- "Do nothing" is your biggest competitor in many markets
- Different customer segments may have different competitive alternatives
- Group similar alternatives together (e.g., "general-purpose spreadsheets" rather than listing Excel, Google Sheets, and Numbers separately)
- Focus on what your best-fit customers considered, not all customers

**Product applications:**

| Context | Application | Example |
|---------|-------------|---------|
| New product launch | Interview early adopters about what they used before | "Before us, 70% used spreadsheets, 20% used a generic PM tool, 10% hired contractors" |
| Repositioning | Survey churned and retained customers about alternatives | Discover that retained customers compared you to consultants, not software |
| Competitive analysis | Map alternatives by customer segment | Enterprise buyers compare to Salesforce; SMBs compare to spreadsheets |

**Copy patterns:**
- "Unlike [competitive alternative], [product] does [unique thing]"
- "Stop using [painful alternative] for [job]"
- "You've outgrown [alternative]. Here's what comes next."

**Ethical boundary:** Never misrepresent competitive alternatives. Base them on actual customer research, not assumptions or wishful thinking.

See: [Competitive Alternatives Analysis](references/competitive_alternatives.md)

### Step 2: Identify Your Unique Attributes

**Core concept:** List every attribute — feature, capability, company characteristic, or approach — that you have and your competitive alternatives don't. These must be both unique AND true. Not "better" versions of common features, but genuinely different capabilities.

**Why it works:** Unique attributes are the raw material of differentiation. If an attribute isn't unique, it can't differentiate you. If it isn't true, you'll lose trust. The goal is an honest inventory of what makes you objectively different.

**Key insights:**
- Features are the most obvious attributes, but don't stop there — consider architecture, business model, team expertise, approach, integrations, community
- "Better" is not unique — "10% faster" is not a unique attribute; "uses a fundamentally different algorithm that enables real-time processing" might be
- Attributes must survive the "only we" test: "Only we [attribute]"
- Don't confuse attributes with benefits — attributes are facts about your product; benefits are what customers get from those facts
- Cluster related attributes into groups (these will become value themes in the next step)
- It's okay to have attributes that matter to some segments but not others

**Product applications:**

| Context | Application | Example |
|---------|-------------|---------|
| Feature launch | Assess if new feature creates a unique attribute | "We're the only project management tool with built-in time-zone-aware scheduling" |
| Competitive response | Verify your attributes are still unique after competitor updates | Quarterly attribute audit against top 5 alternatives |
| Acquisition | Identify which attributes of the acquired product are truly unique | "Their NLP engine processes medical terminology — no other EMR does this" |

**Copy patterns:**
- "The only [category] that [unique attribute]"
- "Built from the ground up to [unique capability]"
- "No other [category] can [unique thing] because [reason]"

**Ethical boundary:** Never claim attributes that aren't genuinely unique. If a competitor also has the capability, it's table stakes, not a differentiator.

See: [Unique Attributes Discovery](references/unique_attributes.md)

### Step 3: Map Attributes to Customer Value

**Core concept:** For each unique attribute, apply the "So what?" test repeatedly until you reach a value that customers actually care about. Then group related values into value themes — the two or three key reasons customers choose you.

**Why it works:** Customers don't buy features. They buy outcomes. A unique attribute is meaningless unless you can articulate why it matters in terms the customer cares about. Value themes give your positioning narrative structure and make it memorable.

**Key insights:**
- Use the "So what?" chain: Feature → "So what?" → Advantage → "So what?" → Value
- Example: "Real-time collaboration" → "So what?" → "Finance teams can work simultaneously" → "So what?" → "Close the books 3 days faster each quarter"
- Value must be expressed in terms the customer uses, not your internal jargon
- Most products have 2-4 value themes — more than that and your positioning is unfocused
- Each value theme should be backed by proof points (case studies, data, testimonials)
- Value themes often cluster around: saving time, saving money, reducing risk, enabling growth, or improving quality

**Product applications:**

| Context | Application | Example |
|---------|-------------|---------|
| Messaging development | Create messaging hierarchy from value themes | Primary: "Close books 3x faster." Secondary: "Eliminate version-control errors." |
| Sales enablement | Build talk tracks around value themes | Each theme becomes a section of the sales pitch with proof points |
| Content marketing | Create content pillars from value themes | Blog series, whitepapers, and webinars organized by value theme |

**Copy patterns:**
- "[Value outcome] with [product], powered by [unique attribute]"
- "Our customers [measurable outcome] because [unique capability]"
- "[Number]% of customers report [value] within [timeframe]"

**Ethical boundary:** Never exaggerate value claims. Back every value assertion with evidence from real customer outcomes.

See: [Value Mapping Framework](references/value_mapping.md)

### Step 4: Define Your Best-Fit Target Customers

**Core concept:** Identify the characteristics that make someone care the most about the value only you deliver. This is not your total addressable market — it's the tightest possible definition of who your product is perfect for right now.

**Why it works:** Trying to position for everyone means positioning for no one. Best-fit customers are the ones who buy fastest, churn least, refer most, and expand most. When you nail positioning for them, it naturally expands outward. They're also the customers whose testimonials and case studies are most compelling.

**Key insights:**
- Best-fit characteristics must be identifiable before you talk to the customer (job title, company size, industry, tech stack — not psychographics)
- Start with your happiest, most successful existing customers and work backward to find common characteristics
- The ideal best-fit definition lets your sales and marketing teams identify and target these customers proactively
- "Everyone" is never a valid target — even horizontal products have best-fit segments
- Best-fit customers are not necessarily the biggest market — they're the most reachable, convincible, and retainable
- Consider negative criteria too: what characteristics indicate someone is NOT a fit

**Product applications:**

| Context | Application | Example |
|---------|-------------|---------|
| Go-to-market strategy | Focus launch on best-fit segment | "Launch to Series B-D SaaS companies with 50-500 employees and a dedicated RevOps person" |
| Sales qualification | Build scoring model from best-fit criteria | Lead score: +20 for RevOps title, +15 for SaaS industry, +10 for 50-500 employees |
| Product roadmap | Prioritize features best-fit customers request | "Our best-fit customers consistently ask for Salesforce integration — build it next" |

**Copy patterns:**
- "Built for [specific customer type] who [specific situation]"
- "If you're a [role] at a [company type], you know [pain point]"
- "Purpose-built for [segment], not a generic tool adapted for everyone"

**Ethical boundary:** Defining best-fit customers is about focus, not exclusion. Be honest about who your product serves best without denigrating other segments.

See: [Target Customer Analysis](references/target_customers.md)

### Step 5: Choose Your Market Category

**Core concept:** Select the market frame of reference that makes your unique value most obvious. You have three strategic options: compete head-to-head in an existing category, create a subcategory of an existing category, or create an entirely new category.

**Why it works:** The market category you choose triggers a set of assumptions in the customer's mind about what your product does, who it competes with, and how it should be priced. Choosing the right category leverages these assumptions in your favor. Choosing the wrong one fights them.

**Key insights:**
- **Head-to-head (existing category):** Best when your product can credibly claim to be the best in an established category. Customers already understand the category — you just need to prove you're the best option. Risk: you inherit all the category's assumptions and competitors.
- **Subcategory:** Best when you have unique attributes that redefine how a portion of the existing category should be evaluated. You get the category's built-in awareness while shifting evaluation criteria. Example: "CRM for real estate" vs. just "CRM."
- **New category:** Best when your product is genuinely different from anything that exists. Highest potential upside but requires significant investment in education. You pay an "education tax" — customers need to learn what the category is before they can evaluate you. Only viable if you have the resources and time to define the category.
- Changing your market category changes everything: competitors, evaluation criteria, pricing expectations, and buyer expectations
- Test your category choice by checking if prospects "get it" in the first 30 seconds of a conversation
- You can change categories over time as you grow

**Product applications:**

| Context | Application | Example |
|---------|-------------|---------|
| Startup positioning | Choose initial market category | Start as "AI writing assistant" (existing) rather than "content intelligence platform" (new category) |
| Market expansion | Shift category as product matures | Move from "email marketing tool" (existing) to "customer engagement platform" (broader category) |
| Competitive response | Reframe category when competitors flood yours | Shift from "project management" to "product development workflow" to escape commodity comparisons |

**Copy patterns:**
- Existing: "The best [category] for [best-fit customers]"
- Subcategory: "[Modifier] [category] — [category] reimagined for [specific need]"
- New category: "Introducing [new category]: [one-sentence definition]"

**Ethical boundary:** Don't create a new category purely to avoid competition. Only create a new category when your product genuinely can't be understood within existing frameworks.

See: [Market Category Strategy](references/market_category.md)

## Market Reference Points

Trends act as tailwinds for your positioning. When a relevant market trend aligns with your unique value, referencing it makes your positioning feel timely and inevitable rather than arbitrary.

**How to use trends effectively:**

- Trends must be real and widely acknowledged — don't fabricate or exaggerate trends
- The trend must connect directly to your unique value, not just your category
- Trends are supporting evidence, not the core of your positioning
- Common powerful trends: remote/distributed work, AI/automation, data privacy regulations, sustainability, creator economy, vertical SaaS, product-led growth

**Example:** If your unique attribute is real-time collaboration across time zones, the remote work trend makes your value feel urgent and timely. "As finance teams go remote, real-time collaboration isn't a nice-to-have — it's essential."

**Warning signs of trend abuse:**
- Your positioning only makes sense in light of the trend
- The trend doesn't connect to any unique attribute
- The trend is aspirational rather than actually happening
- You're the only one who thinks the trend is real

## The Positioning Canvas

Use this template to capture your positioning decisions in one place. Every member of the team should be able to fill this out consistently.

| Component | Your Answer |
|-----------|-------------|
| **Competitive Alternatives** | What would customers use if we didn't exist? |
| **Unique Attributes** | What do we have that alternatives don't? |
| **Value Themes** | What value do those attributes enable for customers? |
| **Best-Fit Customers** | Who cares the most about that value? |
| **Market Category** | What market frame makes our value obvious? |
| **Relevant Trends** | What market dynamics create urgency? |
| **Positioning Statement** | One sentence: For [target], we are the [category] that [key value] |
| **Key Proof Points** | Evidence that our claims are true |
| **Primary Message** | External headline derived from positioning |
| **Sales Narrative** | How we tell this story in a sales conversation |

See: [Positioning Canvas with Worked Examples](references/positioning_canvas.md)

## Team Positioning Exercise

Effective positioning requires cross-functional alignment. The positioning exercise should include representatives from:

- **Founders/Leadership** — vision and strategic context
- **Product** — unique attributes and roadmap
- **Sales** — customer objections and competitive alternatives
- **Marketing** — messaging and market category
- **Customer Success** — best-fit customer characteristics and value proof

**Exercise overview:**
1. Pre-work: Gather customer research, competitive data, and win/loss analysis (1-2 weeks before)
2. Workshop: Walk through all 5 steps as a team, building consensus at each step (2-3 hours)
3. Post-work: Document the positioning canvas, create messaging, and align all customer-facing materials (1-2 weeks after)

The most important output is team alignment — everyone describing the product the same way.

See: [Team Exercise Facilitator Guide](references/team_exercise.md)

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| Positioning for everyone | Dilutes differentiation. No one feels the product was built for them. | Tighten best-fit customer definition to the segment that cares most. |
| Confusing positioning with messaging | Messaging without positioning is words without strategy. It sounds good but doesn't resonate. | Do the positioning work first; derive messaging from positioning. |
| Listing features instead of value | Customers don't buy features. They buy outcomes. Feature lists overwhelm and confuse. | Apply the "So what?" test to every feature until you reach customer value. |
| Copying competitor positioning | If you position the same as competitors, you invite direct comparison on their terms. | Start from your unique attributes and build positioning that only you can own. |
| Changing positioning too frequently | Confuses customers, sales team, and market. Creates perception of instability. | Commit to positioning for at least 6-12 months. Adjust messaging more frequently. |
| Creating a new category prematurely | Pays the "education tax" without the resources to educate the market. Customers can't buy what they don't understand. | Start in an existing category or subcategory. Create a new category only when you have traction and resources. |
| Ignoring competitive alternatives | Without understanding alternatives, you can't articulate differentiation. Your positioning exists in a vacuum. | Interview 15-20 happy customers about what they used before and what they'd switch to. |

## Quick Diagnostic

### Obviously Awesome (Dunford)

| Question | If No | Action |
|----------|-------|--------|
| Can every team member describe the product the same way? | Positioning isn't aligned | Run a team positioning exercise |
| Do prospects understand what you do in under 30 seconds? | Category is wrong or unclear | Re-evaluate your market category choice |
| Can you name 3 things you do that no competitor does? | Weak unique attributes | Deep-dive attribute discovery with customer input |
| Do you know what customers would use if you didn't exist? | Unknown competitive alternatives | Interview 15-20 happy customers about alternatives |
| Can you articulate why best-fit customers choose you over alternatives? | Value themes are unclear | Run the "So what?" mapping exercise |
| Is your best-fit customer definition specific enough to target proactively? | Target is too broad | Analyze best customers for common actionable characteristics |

### Made to Stick (Heath)

| Question | If No | Action |
|----------|-------|--------|
| Can you state your positioning in one sentence without jargon? | Not Simple | Strip to Commander's Intent |
| Does your positioning violate the audience's expectations? | Not Unexpected | Find the curiosity gap or pattern break |
| Can the audience picture themselves using it from your description? | Not Concrete | Replace abstractions with specific scenarios |
| Can the audience verify your claims without trusting you? | Not Credible | Add testable proof points or a Sinatra Test |
| Does the audience feel something (identity, pain, aspiration)? | Not Emotional | Connect to role transformation, not just logic |
| Is there a before/after narrative embedded in the positioning? | No Story | Build the challenge plot: pain → transformation → outcome |

### Evaluator Feedback Grounding

| Question | If No | Action |
|----------|-------|--------|
| Does the positioning name a pain evaluators actually described? | Ungrounded pain | Mine Neotoma `issue` / conversation threads for real pain language |
| Does the competitive frame match what evaluators actually use? | Wrong alternatives | Check evaluator-reported tools (SQLite, markdown, Notion, platform memory) |
| Are evaluator objections addressed in the positioning? | Blind spots | Retrieve objection patterns from evaluator feedback data |
| Would Strong ICP evaluators share this positioning? | Wrong resonance | Test positioning language against Strong ICP evaluator profiles |

### ICP Alignment

| Question | If No | Action |
|----------|-------|--------|
| Does the positioning speak to the agentic OS builder archetype? | Generic audience | Rewrite with primary_icp.md archetype characteristics |
| Does it connect chronic tax to acute crisis? | Missing pain bridge | Add both triggers and connect: convenience opens, integrity closes |
| Does it work across all three operational modes? | Mode gap | Check Operating, Building, and Infra debugging resonance |
| Does it use the ICP's vocabulary, not yours? | Jargon leak | Apply the Vocabulary Bridge table from primary_icp.md |

### Surface Expression

| Question | If No | Action |
|----------|-------|--------|
| Does the homepage have 7 or fewer primary sections? | Section bloat | Merge sections that serve the same job (e.g., combine proof elements into one section) |
| Can a visitor scan each section's point in under 10 seconds? | Low scan speed | Tighten copy, replace paragraphs with bullets or cards, bridge jargon |
| Is deep technical content on subpages, not the homepage? | Missing progressive disclosure | Move detail to linked subpages; keep homepage as decision aid |
| Does the surface lead with problem/pain before architecture? | Broken information ordering | Reorder: Problem → Value → Identity → Proof → Action. Architecture only after motivation is established |
| Is the primary CTA reachable within 4 scroll stops? | Buried CTA | Add mid-page CTA reinforcement or move the dedicated CTA section earlier |
| Can the visitor see the product in use (not just described)? | No experiential proof | Add CLI output, screenshots, diffs, or interactive examples appropriate to product type |
| Does the path from "interested" to "trying" feel fast and low-risk? | High trial friction | Reduce installation steps, show immediate output, connect to visitor's own context |
| Does every claim use specific language (not "improves" or "powerful")? | Vague copy | Replace qualifiers with concrete, verifiable statements |

### Wedge Strength

| Question | If No | Action |
|----------|-------|--------|
| Does the positioning communicate a dual entry point (chronic demand + acute conversion)? | Single-vector wedge | Ensure both continuity/tax-removal (chronic) and state-integrity/reconstruction (acute) are present; dropping either loses half the adoption path |
| Would the target customer classify this as "inevitable infrastructure" or "nice improvement"? | Reads as feature | Strengthen the failure framing: what breaks without this? Lead with consequences of absence, not benefits of presence |
| Is the expansion path (entry → growth → lock-in) visible from the positioning alone? | No expansion signal | Show how initial adoption (one tool, one domain) naturally expands to cross-tool, multi-domain, unattended execution |
| Does the positioning clearly distinguish from adjacent categories (observability, RAG, platform memory)? | Category collision risk | Add explicit contrast: state integrity vs event logging, deterministic state vs retrieval, cross-tool vs single-platform |

## Reference Files

- [Competitive Alternatives Analysis](references/competitive_alternatives.md) — Customer interview scripts, clustering techniques, and the "do nothing" analysis for discovering true competitive alternatives
- [Unique Attributes Discovery](references/unique_attributes.md) — Workshop process for identifying genuinely unique attributes, verification techniques, and attribute clustering
- [Value Mapping Framework](references/value_mapping.md) — The "So what?" chain technique, value theme identification, proof point creation, and value hierarchy
- [Target Customer Analysis](references/target_customers.md) — Best-fit customer analysis, actionable segmentation criteria, persona creation, and TAM differentiation
- [Market Category Strategy](references/market_category.md) — Deep dive on all three category strategies, decision framework, education tax analysis, and when to change categories
- [Positioning Canvas with Worked Examples](references/positioning_canvas.md) — Blank template plus three fully worked examples (B2B SaaS, consumer app, professional services)
- [Team Exercise Facilitator Guide](references/team_exercise.md) — Full facilitator guide with minute-by-minute agenda, preparation requirements, and remote adaptations
- [Positioning Case Studies](references/case_studies.md) — Real-world positioning examples including repositioning wins, niche discovery, and category creation

## Further Reading

- [Obviously Awesome by April Dunford](https://www.amazon.com/Obviously-Awesome-Product-Positioning-Customers/dp/1999023005) — The definitive guide to product positioning
- [Sales Pitch by April Dunford](https://www.amazon.com/Sales-Pitch-Compelling-Positioning-Positioning/dp/1999023048) — How to translate positioning into a winning sales narrative
- [Made to Stick by Chip Heath & Dan Heath](https://www.amazon.com/Made-Stick-Ideas-Survive-Others/dp/1400064287) — Why some ideas survive and others die. The SUCCESs framework for making ideas memorable.

## ICP and Feedback Data Sources

- `docs/icp/primary_icp.md` — Primary ICP definition: archetype, pain triggers, operational modes, vocabulary bridge, qualification criteria, competitor migration paths
- `docs/icp/profiles.md` — Detailed profiles for all target user segments
- `docs/icp/developer_release_targeting.md` — Release-scoped targeting, activation risks, and status tracking
- Neotoma entity types for evaluator feedback retrieval: `developer_release_tester`, `issue`, `conversation_message`, `agent_message` (search for evaluator-related content)

## About the Authors

**April Dunford** is a positioning consultant and author who has worked with over 200 companies on their product positioning, including Google, IBM, Postman, and Epic Games. With 25 years of experience as a VP of Marketing at a series of successful startups, she developed a repeatable methodology for product positioning that has become the industry standard. Her book "Obviously Awesome" (2019) codified this methodology and became the go-to resource for startups and growth-stage companies seeking to define or redefine their market position. Her follow-up, "Sales Pitch" (2023), extends the methodology into sales conversations. She is widely regarded as the world's foremost expert on product positioning.

**Chip Heath & Dan Heath** are professors and bestselling authors who study what makes ideas effective. Chip is a professor at Stanford Graduate School of Business; Dan is a senior fellow at Duke University's CASE center. "Made to Stick" (2007) distilled decades of research into the SUCCESs framework — six principles that determine whether an idea will be understood, remembered, and drive action. The framework applies directly to product positioning: a positioning that scores well on structural completeness (Dunford) but fails on stickiness (Heath) won't survive the market.
