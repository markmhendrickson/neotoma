---
name: Agent Skills Analysis
overview: Analyze how the foundation submodule applies Agent Skills for Context Engineering best practices, identifying strengths, gaps, and recommendations for improvement.
todos: []
---

# Foundation vs Agent Skills for Context Engineering Analysis

## Executive Summary

The foundation submodule demonstrates strong alignment with several Agent Skills for Context Engineering principles, particularly in **context optimization**, **progressive disclosure**, and **tool design**. However, there are opportunities to improve **context compression**, **explicit memory systems**, and **evaluation frameworks**.

## Analysis Framework

This analysis evaluates foundation against 9 Agent Skills principles:

1. Context Fundamentals
2. Context Degradation Management
3. Context Compression
4. Context Optimization
5. Multi-Agent Patterns
6. Memory Systems
7. Tool Design
8. Evaluation Patterns
9. Project Development

---

## 1. Context Fundamentals ✅ Strong

**Agent Skills Principle:** Understanding context window management, attention mechanics, and the fundamental constraint that context is limited by attention, not just tokens.**Foundation Implementation:**Strong implementation via [`.cursor/rules/foundation-document_loading_order.md`](.cursor/rules/foundation-document_loading_order.md):

- **Mandatory loading order** (Phase 1: Foundation docs → Phase 2: Foundation submodule → Phase 3: Task-specific → Phase 4: Related context)
- **Explicit scope definition** in every document (Purpose, Scope, What is/isn't covered)
- **Configuration-driven paths** via `foundation-config.yaml` for flexible document discovery
- **Agent instructions** clearly specify what must be loaded first

**Strengths:**

- Clear prioritization of high-signal documents (foundation first)
- Explicit separation of concerns (what each document covers)
- Configurable per repository
- Prevents agents from loading everything at once

**Alignment Score:** 9/10---

## 2. Context Degradation Management ⚠️ Partial

**Agent Skills Principle:** Managing "lost-in-the-middle" phenomenon, U-shaped attention curves, and attention scarcity as context grows.**Foundation Implementation:**Partial implementation:✅ **Prevents context overload:**

- Document loading order prevents loading everything
- Explicit "When to Load" triggers in documentation
- Progressive disclosure (load foundation → load specific)

❌ **Missing explicit degradation strategies:**

- No explicit handling of large files (>1K lines)
- No guidance on chunking large documents
- No attention budget management
- No explicit "lost-in-the-middle" mitigation

**Gap:** Foundation doesn't explicitly address what happens when documents are individually large or when cumulative context exceeds attention budget.**Recommendations:**

1. Add file size guidelines (e.g., "Keep SKILL.md under 500 lines" from Agent Skills)
2. Add chunking strategies for large documents
3. Add explicit attention budget management to document loading order
4. Create rules for summarizing or compressing large context

**Alignment Score:** 5/10---

## 3. Context Compression 🔴 Weak

**Agent Skills Principle:** Reducing token usage while preserving information density through summarization, deduplication, and progressive disclosure.**Foundation Implementation:**Minimal explicit compression strategy:✅ **Some compression patterns:**

- Templates prevent regenerating structure each time
- Reference documents instead of duplicating content
- Configuration reduces repetitive paths

❌ **Missing core compression techniques:**

- No summarization strategies
- No deduplication patterns
- No guidance on when/how to compress context
- No conversation/history management
- No explicit memory persistence strategies

**Gap:** As agent sessions grow longer, foundation doesn't provide strategies for maintaining relevant context while shedding outdated information.**Recommendations:**

1. Add conversation summarization rules
2. Create checkpoint/restoration patterns for long sessions
3. Add deduplication detection (e.g., "if similar instruction exists, reference instead of duplicating")
4. Add explicit memory persistence (what to save between sessions)

**Alignment Score:** 3/10---

## 4. Context Optimization ✅ Strong

**Agent Skills Principle:** Curating the smallest possible set of high-signal tokens that maximize desired outcomes.**Foundation Implementation:**Strong implementation across multiple mechanisms:✅ [`.cursor/rules/foundation-document_loading_order.md`](.cursor/rules/foundation-document_loading_order.md):

- **Progressive disclosure:** Foundation docs → Submodule docs → Task-specific → Related
- **Explicit loading triggers:** "Load when working on development workflow, code style, documentation, or security-related tasks"
- **Lazy loading:** Don't load submodule docs unless needed

✅ [`.cursor/rules/foundation-agent_constraints.md`](.cursor/rules/foundation-agent_constraints.md):

- **Validation checklist** focuses agent attention on critical checks
- **Forbidden patterns** prevent wasted tokens on anti-patterns
- **Absolute constraints** establish clear boundaries

✅ [`foundation/strategy/project_assessment_framework.md`](foundation/strategy/project_assessment_framework.md):

- **Phase-based workflow** (discover context → research → analyze → output)
- **Dynamic context discovery** (load only what's needed)
- **Template-based generation** (reusable structure)

✅ Templates reduce repetitive context:

- Competitive analysis template
- Partnership analysis template
- Relevance analysis template
- Feature unit spec template

**Strengths:**

- High signal-to-noise ratio in documentation
- Clear separation of concerns
- Explicit loading conditions
- Template reuse

**Alignment Score:** 9/10---

## 5. Multi-Agent Patterns ⚠️ Partial

**Agent Skills Principle:** Designing systems where multiple agents collaborate, including supervisor patterns, task delegation, and agent orchestration.**Foundation Implementation:**Implicit multi-agent support, but not explicit:✅ **Implicit patterns:**

- Shared foundation submodule supports multiple agents across repos
- Cursor rules/commands provide consistent agent behavior
- Risk management and hold points enable human-in-the-loop orchestration
- Project assessment framework orchestrates multi-phase analysis

❌ **Missing explicit multi-agent patterns:**

- No supervisor agent pattern
- No explicit task delegation between agents
- No agent collaboration protocols
- No agent state sharing mechanisms
- No explicit orchestration layer

**Gap:** Foundation is designed for single-agent-per-session, not multi-agent collaboration.**Recommendations:**

1. Add multi-agent orchestration patterns (supervisor → specialist agents)
2. Create agent state sharing mechanisms
3. Add task delegation protocols
4. Add agent collaboration examples (e.g., one agent for analysis, another for implementation)

**Alignment Score:** 4/10---

## 6. Memory Systems 🔴 Weak

**Agent Skills Principle:** Implementing agent memory (knowledge graphs, entity tracking, semantic memory, episodic memory) to maintain context across sessions.**Foundation Implementation:**Minimal explicit memory system:✅ **Implicit memory:**

- Documentation serves as external memory
- Foundation docs = semantic memory (principles, patterns)
- Validation checklists = procedural memory

❌ **Missing explicit memory systems:**

- No cross-session memory persistence
- No entity tracking across sessions
- No knowledge graph for relationships
- No episodic memory (what happened in past sessions)
- No semantic memory beyond static documentation
- No memory retrieval mechanisms

**Gap:** Each agent session starts fresh. No mechanism for agents to build on previous sessions or maintain state.**CRITICAL DECISION: Full Neotoma Integration for Agent MemoryAssumption:** Neotoma schema can and should be extended to support codebase metadata types.**Neotoma Capabilities:**

- Designed for personal data (invoices, receipts, contracts, notes, contacts, events)
- Supports dual-path ingestion: file uploads + agent-created data via MCP `submit_payload`
- Provides entity resolution, timeline generation, structured memory
- Exposes memory via MCP (Model Context Protocol)
- **Schema can be extended** to support codebase metadata types

**Agent Memory Includes:**

1. **Codebase metadata:** Feature Units, Releases, technical decisions, validation results
2. **Real-world entities:** People, companies, projects mentioned in documentation
3. **Session history:** Actions taken, decisions made, checkpoints reached

**Recommendation: Full Neotoma Integration**✅ **Use Neotoma for ALL agent memory:**

- Real-world entities extracted from documentation (people, companies, projects)
- Codebase metadata (Feature Units, Releases, technical decisions)
- Session history (actions taken, decisions made, checkpoints)
- Validation results and checkpoints
- Codebase-specific entities (subsystems, components, architectural decisions)

**Required Schema Extensions:**Neotoma schema must be extended to support codebase metadata types:

- `feature_unit` — Feature Unit records (id, description, status, dependencies, created_at, updated_at)
- `release` — Release records (id, version, feature_units, status, acceptance_criteria)
- `agent_decision` — Technical decisions (decision, rationale, context, timestamp, agent_id)
- `agent_session` — Session history (session_id, actions, checkpoints, outcomes, duration)
- `validation_result` — Validation checkpoints (validation_type, status, details, timestamp)
- `codebase_entity` — Codebase entities (subsystems, components, architectural patterns)
- `architectural_decision` — Architectural decisions (decision, rationale, impact, alternatives)

**Benefits of Full Integration:**

- Unified memory system (single source of truth)
- Entity resolution across real-world and codebase entities
- Timeline generation for development history
- Cross-session memory persistence via MCP
- Deterministic, explainable memory (Neotoma's core strength)
- Privacy-first architecture (user-controlled memory)
- Cross-platform access (ChatGPT, Claude, Cursor)

**Circularity Concerns and Solutions:Potential Issue:** Foundation agents are building Neotoma, but want to use Neotoma for their memory. This creates a bootstrap problem.**Solutions:**

1. **Phased Migration Approach:**

- **Phase 1 (Bootstrap):** Use lightweight `.cursor/memory/` directory for agent memory during initial Neotoma development
- **Phase 2 (Migration):** Once Neotoma MCP server is stable, migrate agent memory to Neotoma
- **Phase 3 (Full Integration):** All new agent memory goes directly to Neotoma via MCP

2. **Graceful Degradation:**

- Foundation agents check if Neotoma MCP server is available
- If available: Use Neotoma for memory (preferred)
- If unavailable: Fall back to lightweight `.cursor/memory/` directory
- Agents can work in both modes seamlessly

3. **Local-First Architecture:**

- Neotoma runs locally (via `npm run dev:mcp`)
- MCP server is available during development
- No external dependencies required for agent memory
- Agents can use Neotoma even while developing it

4. **Bootstrap Strategy:**

- **Initial Development:** Foundation agents use lightweight memory
- **Once Neotoma MCP is functional:** Agents can start using Neotoma for new memory
- **Migration Script:** One-time migration of existing `.cursor/memory/` to Neotoma
- **Dual-Write Mode:** During migration, write to both systems, then cut over

**Implementation Pattern:**

```typescript
// Pseudo-code for graceful degradation
async function storeAgentMemory(data: AgentMemory) {
  if (await isNeotomaAvailable()) {
    // Use Neotoma via MCP (preferred)
    await mcpClient.submit_payload({
      capability_id: "neotoma:store_agent_decision:v1",
      body: data
    });
  } else {
    // Fallback to lightweight memory
    await writeToLocalMemory(data);
  }
}
```

**Conclusion:** Circularity is manageable via phased migration and graceful degradation. Foundation agents can bootstrap with lightweight memory, then migrate to Neotoma once it's available.**Recommendations:**

1. **Extend Neotoma schema** to support codebase metadata types:

- Add new entity types to schema registry
- Define field schemas for each type
- Add extraction rules (for agent-created data, extraction is direct property assignment)
- Version schemas (e.g., `feature_unit:v1`)

2. **Implement MCP actions** for codebase metadata:

- `submit_feature_unit` — Store Feature Unit records via MCP
- `submit_release` — Store Release records via MCP
- `submit_agent_decision` — Store agent decisions via MCP
- `submit_agent_session` — Store session history via MCP
- `query_codebase_entities` — Query codebase metadata
- `query_agent_history` — Query agent session history
- `query_entity_timeline` — Query timeline for any entity (real-world or codebase)

3. **Foundation agent integration (with graceful degradation):**

- **Check Neotoma availability:** Detect if Neotoma MCP server is available
- **If available:** Use MCP `submit_payload` for ALL agent memory (codebase metadata + real-world entities)
- **If unavailable:** Fall back to lightweight `.cursor/memory/` directory
- Query Neotoma via MCP for cross-session memory retrieval (when available)
- Entity resolution for codebase entities (e.g., "Feature Unit FU-061" unified across sessions)
- Timeline generation for development history (when was FU-061 created, what decisions were made, etc.)
- **Migration support:** Script to migrate existing `.cursor/memory/` to Neotoma

4. **Memory retrieval patterns:**

- Query Neotoma via MCP for unified memory access
- Use entity resolution to track entities across sessions
- Use timeline generation for development history queries
- Use structured search for finding related entities

**Alignment Score:** 2/10 (but with clear path to improvement via full Neotoma integration)---

## 7. Tool Design ✅ Strong

**Agent Skills Principle:** Designing effective agent tools with clear interfaces, minimal complexity, and high utility.**Foundation Implementation:**Excellent tool design via Cursor commands:✅ [`foundation/agent-instructions/cursor-commands/`](foundation/agent-instructions/cursor-commands/):

- **8 well-defined commands:** `commit`, `analyze`, `create-feature-unit`, `run-feature-workflow`, `create-prototype`, `final-review`, `create-release`, `setup-symlinks`
- **Clear input/output contracts**
- **Step-by-step execution instructions**
- **Configuration-driven behavior**
- **Explicit validation checkpoints**

✅ **Tool design principles:**

- Single responsibility per command
- Clear triggering conditions
- Explicit error handling
- Validation checklists
- Configuration flexibility

✅ **Excellent example:** [`analyze` command](foundation/agent-instructions/cursor-commands/analyze.md)

- Clear phases (discover context → research → analyze → output)
- Explicit validation requirements
- Template-based generation
- Multiple output types based on resource type
- Error handling for edge cases

**Strengths:**

- Clear separation of concerns
- Reusable patterns
- Configuration-driven
- Explicit validation
- Progressive disclosure (overview → detailed steps)

**Alignment Score:** 9/10---

## 8. Evaluation Patterns 🔴 Weak

**Agent Skills Principle:** Evaluating agent performance through test frameworks, LLM-as-judge, quality metrics, and validation.**Foundation Implementation:**Minimal explicit evaluation:✅ **Some evaluation patterns:**

- Validation checklists in agent constraints
- Hold points for high-risk changes
- Security audit script

❌ **Missing comprehensive evaluation:**

- No agent performance metrics
- No LLM-as-judge patterns
- No test generation for agent outputs
- No quality scoring for generated artifacts
- No regression testing for agent behavior
- No benchmark tasks

**Gap:** Foundation focuses on constraints and validation, but doesn't measure agent effectiveness or quality over time.**Recommendations:**

1. Add agent performance metrics (task completion rate, validation pass rate)
2. Create LLM-as-judge patterns for evaluating generated artifacts
3. Add test generation for agent outputs
4. Create benchmark tasks for agent capabilities
5. Add quality scoring rubrics
6. Track agent mistakes and improvements over time

**Alignment Score:** 3/10---

## 9. Project Development ✅ Strong

**Agent Skills Principle:** Methodologies for starting LLM projects, designing batch pipelines, and evaluating task-model fit.**Foundation Implementation:**Strong implementation via feature unit workflow:✅ [`foundation/development/feature_unit_workflow.md`](foundation/development/feature_unit_workflow.md) and related commands:

- **Spec-first development** (define before building)
- **Checkpoint management** (review points, hold points)
- **Risk classification** (low/medium/high)
- **Validation at each phase**
- **Template-based scaffolding**

✅ **Project assessment framework:**

- Competitive analysis
- Partnership analysis
- Relevance analysis
- Strategic implications

✅ **Configuration management:**

- Repository-specific configuration
- Foundation defaults with overrides
- Validation scripts

**Strengths:**

- Clear development methodology
- Risk-aware workflows
- Template-driven consistency
- Validation at checkpoints

**Alignment Score:** 8/10---

## Overall Alignment Summary

| Principle | Score | Status ||-----------|-------|--------|| 1. Context Fundamentals | 9/10 | ✅ Strong || 2. Context Degradation | 5/10 | ⚠️ Partial || 3. Context Compression | 3/10 | 🔴 Weak || 4. Context Optimization | 9/10 | ✅ Strong || 5. Multi-Agent Patterns | 4/10 | ⚠️ Partial || 6. Memory Systems | 2/10 | 🔴 Weak || 7. Tool Design | 9/10 | ✅ Strong || 8. Evaluation Patterns | 3/10 | 🔴 Weak || 9. Project Development | 8/10 | ✅ Strong || **Overall Average** | **5.8/10** | ⚠️ **Moderate** |---

## Key Strengths

1. **Excellent context optimization** through progressive disclosure and explicit loading order
2. **Strong tool design** with clear Cursor commands and validation checkpoints
3. **Solid project development methodology** with feature unit workflows
4. **Good context fundamentals** with mandatory loading order and scope definition
5. **Configuration-driven flexibility** allowing repository customization

---

## Critical Gaps

1. **No explicit memory system** for cross-session persistence
2. **Minimal context compression** strategies for long conversations
3. **Weak evaluation framework** for agent performance measurement
4. **Limited multi-agent patterns** for agent collaboration
5. **No explicit context degradation management** for large documents

---

## Priority Recommendations

### High Priority (Implement First)

1. **Add Memory System via Full Neotoma Integration** (`foundation/agent-instructions/cursor-rules/memory_management.md`)

**Assumption:** Neotoma schema can and should be extended to support codebase metadata types.**Required Schema Extensions:**

- `feature_unit` — Feature Unit records (id, description, status, dependencies, created_at, updated_at)
- `release` — Release records (id, version, feature_units, status, acceptance_criteria)
- `agent_decision` — Technical decisions (decision, rationale, context, timestamp, agent_id)
- `agent_session` — Session history (session_id, actions, checkpoints, outcomes, duration)
- `validation_result` — Validation checkpoints (validation_type, status, details, timestamp)
- `codebase_entity` — Codebase entities (subsystems, components, architectural patterns)
- `architectural_decision` — Architectural decisions (decision, rationale, impact, alternatives)

**Implementation Steps:**

1. **Extend Neotoma Schema:**

- Add new entity types to schema registry
- Define field schemas for each type
- Add extraction rules (for agent-created data, extraction is direct property assignment)
- Version schemas (e.g., `feature_unit:v1`)

2. **Implement MCP Actions:**

- `submit_feature_unit` — Store Feature Unit records via MCP
- `submit_release` — Store Release records via MCP
- `submit_agent_decision` — Store agent decisions via MCP
- `submit_agent_session` — Store session history via MCP
- `query_codebase_entities` — Query codebase metadata
- `query_agent_history` — Query agent session history
- `query_entity_timeline` — Query timeline for any entity (real-world or codebase)

3. **Foundation Agent Integration:**

- Use MCP `submit_payload` for ALL agent memory (codebase metadata + real-world entities)
- Query Neotoma via MCP for cross-session memory retrieval
- Entity resolution for codebase entities (e.g., "Feature Unit FU-061" unified across sessions)
- Timeline generation for development history (when was FU-061 created, what decisions were made, etc.)

4. **Memory Retrieval Patterns:**

- Query Neotoma via MCP for unified memory access
- Use entity resolution to track entities across sessions
- Use timeline generation for development history queries
- Use structured search for finding related entities

**CRITICAL DECISION: Full Neotoma Integration for Agent MemoryAssumption:** Neotoma schema can and should be extended to support codebase metadata types.**Required Schema Extensions:**

- `feature_unit` — Feature Unit records (id, description, status, dependencies, created_at, updated_at)
- `release` — Release records (id, version, feature_units, status, acceptance_criteria)
- `agent_decision` — Technical decisions (decision, rationale, context, timestamp, agent_id)
- `agent_session` — Session history (session_id, actions, checkpoints, outcomes, duration)
- `validation_result` — Validation checkpoints (validation_type, status, details, timestamp)
- `codebase_entity` — Codebase entities (subsystems, components, architectural patterns)
- `architectural_decision` — Architectural decisions (decision, rationale, impact, alternatives)

**Implementation Steps:**

1. **Extend Neotoma Schema:**

- Add new entity types to schema registry
- Define field schemas for each type
- Add extraction rules (for agent-created data, extraction is direct property assignment)
- Version schemas (e.g., `feature_unit:v1`)

2. **Implement MCP Actions:**

- `submit_feature_unit` — Store Feature Unit records via MCP
- `submit_release` — Store Release records via MCP
- `submit_agent_decision` — Store agent decisions via MCP
- `submit_agent_session` — Store session history via MCP
- `query_codebase_entities` — Query codebase metadata
- `query_agent_history` — Query agent session history
- `query_entity_timeline` — Query timeline for any entity (real-world or codebase)

3. **Foundation Agent Integration:**

- Use MCP `submit_payload` for ALL agent memory (codebase metadata + real-world entities)
- Query Neotoma via MCP for cross-session memory retrieval
- Entity resolution for codebase entities (e.g., "Feature Unit FU-061" unified across sessions)
- Timeline generation for development history (when was FU-061 created, what decisions were made, etc.)

4. **Memory Retrieval Patterns:**

- Query Neotoma via MCP for unified memory access
- Use entity resolution to track entities across sessions
- Use timeline generation for development history queries
- Use structured search for finding related entities

2. **Add Context Compression** (`foundation/agent-instructions/cursor-rules/context_compression.md`)

- Conversation summarization strategies
- Deduplication detection
- Large file handling (chunking, summarization)
- Checkpoint/restoration patterns

3. **Add Evaluation Framework** (`foundation/agent-instructions/cursor-rules/evaluation.md`)

- Agent performance metrics
- Quality scoring rubrics
- Validation test generation
- Benchmark tasks

### Medium Priority

4. **Enhance Context Degradation Management**

- Add file size guidelines
- Add attention budget management
- Create chunking strategies for large documents

5. **Add Multi-Agent Patterns**

- Supervisor agent pattern
- Task delegation protocols
- Agent collaboration examples

### Low Priority

6. **Improve Documentation**

- Add examples of Agent Skills principles in action
- Create case studies showing context engineering
- Add troubleshooting guide for context issues

---

## Conclusion

The foundation submodule demonstrates **strong alignment** with Agent Skills principles in **context optimization**, **tool design**, and **project development**. These strengths create a solid foundation for building effective agent systems.However, **critical gaps** exist in **memory systems**, **context compression**, and **evaluation patterns**. Addressing these gaps would transform foundation from a good agent framework into an excellent context engineering system aligned with Agent Skills best practices.**Key Insight: Full Neotoma Integration for Agent MemoryDecision: Neotoma should be used for ALL foundation agent memoryAssumption:** Neotoma schema can and should be extended to support codebase metadata types.**Rationale:**

- Unified memory system provides single source of truth
- Entity resolution works for both real-world and codebase entities
- Timeline generation enables development history queries
- Cross-session memory persistence via MCP
- Deterministic, explainable memory (Neotoma's core strength)
- Privacy-first architecture (user-controlled memory)
- Cross-platform access (ChatGPT, Claude, Cursor)

**Circularity Management:**

- **Phased migration:** Bootstrap with lightweight memory, migrate to Neotoma once stable
- **Graceful degradation:** Agents check Neotoma availability, fall back to lightweight memory if unavailable
- **Local-first:** Neotoma runs locally during development, available via MCP
- **No blocking dependency:** Foundation agents can work without Neotoma, but use it when available

**Release Timeline for Neotoma Readiness:v0.1.0 (Internal MCP Release) — ✅ READY NOW**

- **Status:** `ready_for_deployment` (as of 2025-12-11)
- **MCP Server:** Fully functional with 13 MCP actions
- **Core Capabilities:** File upload, extraction, entity resolution, timeline generation, graph construction
- **For Foundation Agents:** Can use Neotoma MCP server immediately for real-world entities (people, companies, projects)
- **Limitation:** Schema extensions for codebase metadata (feature_unit, release, agent_decision) not yet implemented

**v1.0.0 (MVP) — Target: 2026-01-23**

- **Status:** `planning`
- **Adds:** UI layer, multi-user support (auth + RLS), billing, onboarding
- **MCP Layer:** Already complete from v0.1.0 (no changes needed)
- **For Foundation Agents:** Same MCP capabilities as v0.1.0 (schema extensions still needed)

**v0.2.3 (Codebase Metadata Schema Extensions) — Post v0.2.0**

- **Status:** `planned` (to be created)
- **Purpose:** Extend Neotoma schema to support foundation agent memory (codebase metadata)
- **Required Schema Extensions:**
- `feature_unit` — Feature Unit records (id, description, status, dependencies, created_at, updated_at)
- `release` — Release records (id, version, feature_units, status, acceptance_criteria)
- `agent_decision` — Technical decisions (decision, rationale, context, timestamp, agent_id)
- `agent_session` — Session history (session_id, actions, checkpoints, outcomes, duration)
- `validation_result` — Validation checkpoints (validation_type, status, details, timestamp)
- `codebase_entity` — Codebase entities (subsystems, components, architectural patterns)
- `architectural_decision` — Architectural decisions (decision, rationale, impact, alternatives)
- **MCP Actions to Add:**
- `submit_feature_unit` — Store Feature Unit records via MCP
- `submit_release` — Store Release records via MCP
- `submit_agent_decision` — Store agent decisions via MCP
- `submit_agent_session` — Store session history via MCP
- `query_codebase_entities` — Query codebase metadata
- `query_agent_history` — Query agent session history
- `query_entity_timeline` — Query timeline for any entity (real-world or codebase)
- **Timeline:** After v0.2.0 completion (estimated 1-2 weeks)
- **For Foundation Agents:** Enables full Neotoma integration for all agent memory (real-world entities + codebase metadata)

**Recommendation:**

- **Immediate (v0.1.0):** Foundation agents can use Neotoma MCP server for real-world entities (people, companies, projects mentioned in docs)
- **Bootstrap (v0.1.0 - v0.2.3):** Use lightweight `.cursor/memory/` for codebase metadata until v0.2.3 schema extensions are implemented
- **Full Integration (v0.2.3+):** Once v0.2.3 is released, migrate all codebase metadata to Neotoma for unified memory system

**Required Schema Extensions:**

- `feature_unit`, `release`, `agent_decision`, `agent_session`, `validation_result`, `codebase_entity`, `architectural_decision`

**Recommended Next Steps:**

1. **Create Release v0.2.3** for codebase metadata schema extensions (after v0.2.0 completion)
2. **Extend Neotoma schema** to support codebase metadata types (feature_unit, release, agent_decision, agent_session, validation_result, codebase_entity, architectural_decision)
3. **Implement MCP actions** for codebase metadata (submit_feature_unit, submit_release, submit_agent_decision, submit_agent_session, query_codebase_entities, query_agent_history, query_entity_timeline)