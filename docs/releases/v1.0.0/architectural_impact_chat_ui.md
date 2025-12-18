# Architectural Impact: MCP-First Conversational Architecture on v1.0.0

_(Impact Assessment: Chat UI Deprecation Decision)_

---

## Purpose

This document assesses the impact of the MCP-first conversational architecture decision (see `docs/architecture/conversational_ux_architecture.md`) on Release v1.0.0 and documents required changes to release scope, acceptance criteria, and feature unit status.

---

## Scope

This document covers:

- Impact on v1.0.0 release scope
- Required changes to acceptance criteria
- Feature Unit FU-307 status update
- Migration path for existing ChatPanel component
- Updated UI requirements

This document does NOT cover:

- Implementation details for ChatPanel deprecation
- MCP integration documentation (see `docs/specs/MCP_SPEC.md`)
- External agent setup guides (separate documentation)

---

## 1. Architectural Decision Summary

**Decision:** Neotoma MUST NOT embed its own chat UI or conversational interfaces. All conversational interactions MUST be externalized to MCP-compatible agents (ChatGPT, Cursor, Claude, etc.).

**Rationale:** See `docs/architecture/conversational_ux_architecture.md` for complete assessment.

**Key Points:**

- Neotoma = deterministic truth layer
- External agents = reasoning and conversational UX
- Internal chat violates determinism and Truth Layer purity
- MCP provides standardized interface for external agents

---

## 2. Impact on Release v1.0.0

### 2.1 Feature Unit FU-307 Status

**Current Status:** FU-307 (Chat/AI Panel) is marked as "✅ Complete" in `docs/specs/MVP_FEATURE_UNITS.md`.

**Required Change:** FU-307 MUST be explicitly excluded from v1.0.0 release scope.

**Rationale:**

- ChatPanel component exists but violates architectural decision
- Conversational interactions must be externalized to MCP-compatible agents
- ChatPanel should be deprecated, not maintained or enhanced

### 2.2 Release Scope Updates

**Current v1.0.0 Scope (from `release_plan.md`):**

- `FU-100`: File Analysis Service Update
- `FU-101`: Entity Resolution Service
- `FU-102`: Event Generation Service
- `FU-103`: Graph Builder Service
- `FU-105`: Search Service
- `FU-300`: Design System Implementation
- `FU-700`: Authentication UI
- `FU-701`: RLS Implementation

**Updated Scope:** No change required — FU-307 is not explicitly listed in included FUs.

**Explicit Exclusion Required:** Add FU-307 to "Explicitly Excluded" section in `release_plan.md`.

### 2.3 Acceptance Criteria Updates

**Current Acceptance Criteria (from `acceptance_criteria.md`):**

- "Basic upload UI separated from chat and usable"

**Required Change:** Update to reflect MCP-first architecture:

- "Basic upload UI functional and usable (no chat UI dependencies)"
- "MCP integration documented and tested with external agents (ChatGPT, Cursor, Claude)"

**Rationale:**

- "Separated from chat" implies chat UI exists but should be separated
- MCP-first architecture means no internal chat UI exists
- Focus shifts to MCP integration documentation and testing

### 2.4 UI Requirements Updates

**Current State:** ChatPanel component exists in `frontend/src/components/ChatPanel.tsx`.

**Required Actions:**

1. **Deprecate ChatPanel:**
   - Mark component as deprecated
   - Add deprecation notice referencing architectural decision
   - Document migration path to MCP-compatible agents

2. **Extract Deterministic Operations:**
   - Preserve any deterministic search/filter operations as standalone components
   - Remove conversational state management
   - Remove transcript storage and threading

3. **Update UI Patterns:**
   - Remove chat UI pattern references
   - Focus on list, detail, timeline, upload UI patterns
   - Document MCP integration setup in user-facing docs

---

## 3. Migration Path

### 3.1 ChatPanel Deprecation

**Phase 1: Mark as Deprecated**

- Add deprecation notice to ChatPanel component
- Update component documentation
- Reference `docs/architecture/conversational_ux_architecture.md`

**Phase 2: Extract Deterministic Operations**

- Identify deterministic operations (search, filter, record display)
- Extract to standalone components
- Remove conversational state management

**Phase 3: Remove ChatPanel**

- Remove ChatPanel component (post-MVP)
- Update UI navigation
- Update user documentation

### 3.2 MCP Integration Documentation

**Required Documentation:**

- MCP setup guide for ChatGPT
- MCP setup guide for Cursor
- MCP setup guide for Claude
- Example MCP queries and workflows
- Troubleshooting guide

**Location:** `docs/integrations/mcp_setup.md` (to be created)

---

## 4. Updated Release Requirements

### 4.1 Product Requirements

**Original:**

- Chat interface functional
- MCP integration via backend

**Updated:**

- MCP integration documented and tested with external agents
- Upload UI functional without chat dependencies
- User documentation includes MCP setup guides

### 4.2 Technical Requirements

**Original:**

- ChatPanel component tests
- Message rendering tests
- Integration tests for chat → MCP flow

**Updated:**

- MCP action tests (already in scope via FU-200 series)
- External agent integration tests (ChatGPT, Cursor, Claude)
- MCP setup documentation tests

### 4.3 Business Requirements

**Original:**

- Users can query data via chat interface

**Updated:**

- Users can query data via external MCP-compatible agents
- MCP setup process documented and validated
- User onboarding includes MCP integration steps

---

## 5. Impact on Other Releases

### 5.1 Release v0.1.0

**Status:** No impact

**Rationale:** v0.1.0 already explicitly excludes all UI components (FU-300 through FU-307). Release focuses on MCP-only access, which aligns with architectural decision.

### 5.2 Release v0.4.0

**Status:** No impact

**Rationale:** v0.4.0 includes the Chat Transcript Extraction CLI (FU-106) as an optional utility tool. The CLI converts chat transcripts to structured JSON for ingestion, which is compatible with the architectural decision (external tool, not internal chat UI).

### 5.3 Release v2.0.0

**Status:** No impact

**Rationale:** v2.0.0 focuses on E2EE and local-first architecture. No chat UI features planned.

---

## 6. Required Documentation Updates

### 6.1 Release Plan Updates

**File:** `docs/releases/v1.0.0/release_plan.md`

**Changes:**

- Add FU-307 to "Explicitly Excluded" section
- Update scope description to clarify MCP-first architecture
- Reference architectural decision document

### 6.2 Acceptance Criteria Updates

**File:** `docs/releases/v1.0.0/acceptance_criteria.md`

**Changes:**

- Update UI requirements to remove chat UI references
- Add MCP integration acceptance criteria
- Update product acceptance criteria to reflect MCP-first architecture

### 6.3 Feature Unit Spec Updates

**File:** `docs/specs/MVP_FEATURE_UNITS.md`

**Changes:**

- Update FU-307 status to "❌ Excluded (Architectural Decision)"
- Add note referencing architectural decision
- Document migration path for existing ChatPanel

### 6.4 UI Spec Updates

**File:** `docs/specs/UI_SPEC.md` (if exists)

**Changes:**

- Remove chat UI pattern references
- Add MCP integration documentation requirements
- Update UI component catalog

---

## 7. Validation Checklist

### 7.1 Release Scope

- [ ] FU-307 explicitly excluded from v1.0.0 scope
- [ ] Release plan updated with architectural decision reference
- [ ] No chat UI features in release scope

### 7.2 Acceptance Criteria

- [ ] Acceptance criteria updated to reflect MCP-first architecture
- [ ] MCP integration acceptance criteria added
- [ ] Chat UI references removed

### 7.3 Documentation

- [ ] ChatPanel marked as deprecated
- [ ] MCP setup guides created
- [ ] User documentation updated
- [ ] Feature Unit spec updated

### 7.4 Testing

- [ ] MCP integration tests with external agents
- [ ] Upload UI tests without chat dependencies
- [ ] MCP setup documentation validated

---

## 8. Related Documents

- `docs/architecture/conversational_ux_architecture.md` — Architectural decision and rationale
- `docs/releases/v1.0.0/release_plan.md` — Release plan (to be updated)
- `docs/releases/v1.0.0/acceptance_criteria.md` — Acceptance criteria (to be updated)
- `docs/specs/MVP_FEATURE_UNITS.md` — Feature Unit specifications (to be updated)
- `docs/specs/MCP_SPEC.md` — MCP specification

---

## Agent Instructions

### When to Load This Document

Load `docs/releases/v1.0.0/architectural_impact_chat_ui.md` when:

- Planning v1.0.0 release scope changes
- Updating acceptance criteria for v1.0.0
- Deprecating ChatPanel component
- Creating MCP integration documentation
- Reviewing release compliance with architectural decisions

### Required Co-Loaded Documents

- `docs/architecture/conversational_ux_architecture.md` (architectural decision)
- `docs/releases/v1.0.0/release_plan.md` (release scope)
- `docs/releases/v1.0.0/acceptance_criteria.md` (acceptance criteria)
- `docs/specs/MCP_SPEC.md` (MCP specification)

### Constraints Agents Must Enforce

1. **FU-307 excluded:** FU-307 MUST NOT be included in v1.0.0 release scope
2. **MCP-first architecture:** All conversational interactions MUST be externalized to MCP-compatible agents
3. **ChatPanel deprecated:** ChatPanel component MUST be marked as deprecated
4. **MCP documentation:** MCP setup guides MUST be created for external agents

### Validation Checklist

- [ ] Release scope excludes FU-307
- [ ] Acceptance criteria reflect MCP-first architecture
- [ ] ChatPanel marked as deprecated
- [ ] MCP integration documentation created
- [ ] User documentation updated
