# Neotoma ICP Qualification Survey

Survey to determine whether contacts match target ICPs and to collect contextual information about their current pains and resolution attempts based on the ICP they match.

**Source:** ICP definitions and pain points from `profiles.md` and `primary_icp.md`.

---

## Design Principles

- **5–7 minutes** target completion time
- **Branching logic** after Q3 routes to ICP-specific sections; non-matches exit early
- **Order:** segment first → pain severity → current workarounds → willingness signals
- **Anti-ICP signals** surface in Q1–Q3 so non-matches can exit without long paths

---

## Section 1: Segmentation (All Respondents)

### Q1. Which best describes your primary work?

*(Single select)*

- **A)** I build or maintain infrastructure that agents/AI systems run on (runtimes, orchestration, evaluation, observability)
- **B)** I build agents or AI-powered products that other people use (customer support agents, code gen pipelines, data workflows, AI SaaS)
- **C)** I'm a heavy daily user of AI tools (Claude, Cursor, ChatGPT, etc.) and I've built personal automations or workflows around them
- **D)** I maintain a developer framework, SDK, or platform that other builders adopt
- **E)** I use AI tools occasionally but don't build with or around them
- **F)** None of the above describes me

**Routing:** A → Section 2A (AI Infrastructure Engineers), B → Section 2B (Agent System Builders), C → Section 2C (AI-native Operators), D → Section 2D (Toolchain Integrators), E/F → Exit screen ("Thanks for your time — we'll keep you posted as Neotoma evolves.")

### Q2. How many AI/agent tools do you actively use in a typical work week?

*(Single select)*

- 0
- 1–2
- 3–5
- 6+

**Signal:** 0 = anti-ICP. 3+ strongly validates Operators; 1–2 is fine for Builders/Infra.

### Q3. Have you ever needed to debug, trace, or reproduce the behavior of an AI agent or AI-assisted workflow?

*(Single select)*

- Yes, this is a regular problem for me
- Yes, I've hit this a few times
- No, but I can see how it would matter
- No, and it doesn't seem relevant to my work

**Signal:** "No, and it doesn't seem relevant" = weaker ICP fit. Keep in survey but flag.

---

## Section 2A: AI Infrastructure Engineers

*(Routed from Q1 = A)*

### Q4a. Which of these problems cost you the most time or frustration today?

*(Rank top 3)*

- [ ] Cannot reproduce agent runs — same inputs, different outputs, no trace of why
- [ ] State mutations are invisible — agent state changes without audit trail
- [ ] No provenance trail — can't trace agent decisions back to source data
- [ ] Agent evaluation is non-deterministic — can't replay state to validate behavior changes
- [ ] Each agent system invents its own state management — no standard layer
- [ ] Production debugging requires manual log archaeology
- [ ] Other: ___________

### Q5a. How are you currently managing agent state in your infrastructure?

*(Select all that apply)*

- [ ] Custom-built state management (per agent/system)
- [ ] Event sourcing framework (e.g., EventStoreDB, Kafka event streams)
- [ ] State machines (e.g., XState, Temporal workflows)
- [ ] Append-only logs / audit trail system
- [ ] Ad-hoc logging (structured or unstructured)
- [ ] We don't have a unified approach — it varies by team/project
- [ ] Other: ___________

### Q6a. When an agent produces unexpected output in production, what does your debugging process look like today?

*(Open text)*

### Q7a. If a tool guaranteed deterministic state evolution (same inputs always produce the same state) with full replay from an append-only observation log, where would you first apply it?

*(Single select)*

- Agent runtime/orchestration layer
- Evaluation and regression testing harness
- Observability and debugging pipeline
- Production incident investigation
- Wouldn't apply it — current approach is sufficient

---

## Section 2B: Agent System Builders

*(Routed from Q1 = B)*

### Q4b. Which of these problems cost you the most time or frustration today?

*(Rank top 3)*

- [ ] Memory drifts between sessions — agent "forgets" or contradicts itself across runs
- [ ] Conflicting facts — multiple agents or tools write contradictory state with no conflict detection
- [ ] Can't replay a failed run to find the root cause
- [ ] State changes silently — impossible to know what changed or when
- [ ] No schema validation — malformed data propagates across agents
- [ ] Context lost between steps in multi-step pipelines
- [ ] Other: ___________

### Q5b. What are you currently using for agent memory/state?

*(Select all that apply)*

- [ ] RAG / vector database memory (Mem0, Zep, Pinecone, Weaviate, etc.)
- [ ] LangChain / LangGraph built-in memory
- [ ] File-based memory (Markdown, JSON files)
- [ ] Custom database or key-value store
- [ ] MCP server (which one? ___________)
- [ ] No persistent memory — agents start fresh each run
- [ ] Other: ___________

### Q6b. Describe a recent incident where agent memory or state caused a problem in production or development.

*(Open text)*

### Q7b. How important is it that your agent's memory layer provides these guarantees?

*(Rate each 1–5: 1 = not important, 5 = critical)*

- Deterministic state: same inputs always produce the same entity state
- Versioned history: every state change creates a new version, nothing silently lost
- Schema validation: reject malformed data rather than silently accepting it
- Replayable timeline: reconstruct any past state from the observation log
- Cross-agent shared state: multiple agents read/write to a consistent state substrate

---

## Section 2C: AI-native Operators

*(Routed from Q1 = C)*

### Q4c. Which of these problems cost you the most time or frustration today?

*(Rank top 3)*

- [ ] Context fragmentation — each AI tool has its own memory, switching tools loses everything
- [ ] Repetitive context-setting — re-explaining the same project to Claude, Cursor, ChatGPT separately
- [ ] Lost commitments and decisions — something I decided in a session 3 days ago is gone
- [ ] Broken handoffs — starting in one tool and continuing in another requires manual copy-paste
- [ ] No cross-session continuity — every new session starts from zero
- [ ] Platform memory (Claude memory, ChatGPT memory) isn't reliable or complete enough
- [ ] Other: ___________

### Q5c. How do you currently manage context across your AI tools?

*(Select all that apply)*

- [ ] I re-explain from scratch each session (no workaround)
- [ ] I copy-paste context between tools manually
- [ ] I maintain notes or docs (Notion, Obsidian, etc.) and upload/paste into tools
- [ ] I rely on built-in platform memory (Claude memory, ChatGPT memory)
- [ ] I use an MCP server for persistent memory (which one? ___________)
- [ ] I've built custom automation (scripts, prompts, configs) to manage this
- [ ] Other: ___________

### Q6c. Estimate: how many minutes per week do you spend re-establishing context that an AI tool should already have?

*(Single select)*

- Less than 10 minutes
- 10–30 minutes
- 30–60 minutes
- 1–3 hours
- 3+ hours

### Q7c. Which AI tools do you use most frequently?

*(Select all that apply)*

- [ ] Claude (Anthropic)
- [ ] ChatGPT (OpenAI)
- [ ] Cursor
- [ ] GitHub Copilot
- [ ] Windsurf / Codex / other coding agents
- [ ] Raycast AI
- [ ] Custom MCP setups
- [ ] Other: ___________

---

## Section 2D: Toolchain Integrators

*(Routed from Q1 = D)*

### Q4d. Which of these problems are most pressing for your framework or tool's users?

*(Rank top 3)*

- [ ] Existing memory adapters lack state guarantees — users report drift and inconsistency
- [ ] No standard for deterministic agent state — each framework invents its own memory module
- [ ] Memory adapters break across versions — maintenance burden
- [ ] Users want persistent, deterministic memory but the framework doesn't have it
- [ ] Downstream builders are rolling their own state management
- [ ] Other: ___________

### Q5d. Does your framework/tool currently offer a memory or state management module?

*(Single select)*

- Yes, built-in memory module
- Yes, via third-party adapter or plugin
- No, users manage their own state
- Planning to add one

### Q6d. What would you need from an external state layer before recommending it to your users?

*(Select all that apply)*

- [ ] Stable, versioned API with backward compatibility guarantees
- [ ] MIT or permissive open-source license
- [ ] Clear integration documentation and examples
- [ ] Demonstrated adoption by real users (case studies, usage numbers)
- [ ] Performance benchmarks at relevant scale
- [ ] Active maintainer responsiveness to integration issues
- [ ] Other: ___________

---

## Section 3: Closing Qualification

*(All respondents who reached Section 2)*

### Q8. How urgently do you need a better solution for the problems you ranked above?

*(Single select)*

- Actively searching for a solution right now
- Would evaluate something if it crossed my path
- It's annoying but I can live with it for now
- Not a priority

### Q9. How would you prefer to evaluate a new developer tool?

*(Single select)*

- Install locally and try it myself (npm, CLI)
- See a live demo or walkthrough
- Read documentation and architecture overview first
- Talk to someone who uses it
- I'd need a team/manager to approve it first

### Q10. Would you be open to a 15-minute conversation about how you're handling these problems today?

*(Single select)*

- Yes — here's my email: ___________
- Maybe later — keep me updated via email: ___________
- No thanks

---

## Branching Logic Summary

| Q1 Answer | Route To | ICP |
|-----------|----------|-----|
| A | Section 2A | AI Infrastructure Engineers |
| B | Section 2B | Agent System Builders |
| C | Section 2C | AI-native Operators |
| D | Section 2D | Toolchain Integrators |
| E, F | Exit | Non-ICP (capture email if willing) |

---

## Scoring / Analysis Framework

- **Strong ICP match:** Q1 routes to a Tier 1 section + ranks 2+ pain points in top 3 + Q8 = "Actively searching" or "Would evaluate"
- **Moderate match:** Q1 routes correctly + acknowledges pain + Q8 = "Would evaluate" or "Annoying but livable"
- **Weak / non-match:** Q1 = E/F, or Q3 = "No, not relevant", or Q8 = "Not a priority"
- **High-value lead:** Strong match + Q10 = "Yes" + Q9 = "Install locally"

---

## Anti-ICP Flags

*(From `primary_icp.md`)*

- Q1 = E or F (no agent/AI tool workflows)
- Q2 = 0 tools
- Q3 = "No, and not relevant"
- Q8 = "Not a priority"
- Open-text mentions "note-taking app" or "Notion replacement" without agent/state context

---

## What Each Section Reveals (Beyond Segmentation)

- **2A (Infra):** Current state-management stack, debugging workflow gaps, where they'd first deploy deterministic state
- **2B (Builders):** Current memory stack (RAG vs custom vs none), recent failure incidents, which guarantees they value most
- **2C (Operators):** Time cost of context fragmentation, current workaround sophistication, tool ecosystem for MCP targeting
- **2D (Integrators):** What their users complain about, prerequisites for recommending an external dependency
