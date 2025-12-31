## Release v0.2.3 — Codebase Metadata Schema Extensions

**Alignment**: This release implements [Agent Skills for Context Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering) principles for memory systems, context management, and agent evaluation.

### 1. Release Overview

- **Release ID**: `v0.2.3`
- **Name**: Codebase Metadata Schema Extensions
- **Release Type**: Not Marketed (production deployment without marketing activities)
- **Goal**: Extend Neotoma schema to support foundation agent memory, including Feature Units, Releases, technical decisions, session history, and architectural decisions
- **Priority**: P1 (enables foundation agent memory capabilities)
- **Target Ship Date**: After v0.2.0 completion (estimated 1-2 weeks)
- **Marketing Required**: No (not marketed release)
- **Deployment**: Production (neotoma.io)

#### 1.0 Guiding Principle

> Extend Neotoma schema to support **codebase metadata types** that enable full foundation agent memory integration following Agent Skills for Context Engineering principles.

This release enables: **"Foundation agents can store and query codebase metadata (Feature Units, Releases, decisions) alongside real-world entities in a unified memory system with query-based context optimization."**

**Agent Skills Alignment**: This release implements memory-systems (skill 6), context-compression (skill 3), context-degradation management (skill 2), and evaluation (skill 8) principles from the Agent Skills framework.

#### 1.1 Context

Foundation agents currently use lightweight `.cursor/memory/` directory for codebase metadata. This release extends Neotoma schema to support these metadata types, enabling full integration with Neotoma's entity resolution, timeline generation, and cross-session memory capabilities.

#### 1.2 Benefits of Full Neotoma Integration

- **Unified Memory System**: Single source of truth for real-world and codebase entities
- **Entity Resolution**: Automatic deduplication and cross-reference resolution for codebase entities
- **Timeline Generation**: Development history queries (e.g., "When was FU-061 created?")
- **Cross-Session Persistence**: Memory survives across agent sessions
- **Deterministic Memory**: Explainable, auditable memory (Neotoma's core strength)
- **Privacy-First**: User-controlled memory architecture
- **Cross-Platform**: Available via MCP in ChatGPT, Claude, Cursor
- **Context Degradation Management**: Query-based memory prevents "lost-in-the-middle" by allowing agents to load only relevant entities instead of entire memory into context window
- **Context Compression**: Entity resolution, snapshot compression, and selective loading achieve up to 100:1 reduction in context size through deduplication, current-state snapshots, and timeline summarization
- **Evaluation Patterns**: Agent performance metrics, quality scoring, benchmark tasks, and historical analysis enable comprehensive evaluation of agent effectiveness through validation results, session outcomes, and timeline queries

### 2. Scope

#### 2.1 Schema Extensions

This release adds 7 new entity types to Neotoma schema registry:

- `feature_unit` — Feature Unit records (id, description, status, dependencies)
- `release` — Release records (id, version, feature_units, status, acceptance_criteria)
- `agent_decision` — Technical decisions (decision, rationale, context, timestamp)
- `agent_session` — Session history (session_id, actions, checkpoints, outcomes)
- `validation_result` — Validation checkpoints (validation_type, status, details)
- `codebase_entity` — Codebase entities (subsystems, components, architectural patterns)
- `architectural_decision` — Architectural decisions (decision, rationale, impact, alternatives)

#### 2.2 MCP Actions

This release adds 7 new capability IDs for codebase metadata, used with existing generic MCP actions:

**Storage (via `submit_payload`):**
- `neotoma:store_feature_unit:v1` — Store Feature Unit records
- `neotoma:store_release:v1` — Store Release records
- `neotoma:store_agent_decision:v1` — Store agent decisions
- `neotoma:store_agent_session:v1` — Store session history
- `neotoma:store_validation_result:v1` — Store validation results
- `neotoma:store_codebase_entity:v1` — Store codebase entities
- `neotoma:store_architectural_decision:v1` — Store architectural decisions

**Querying (via existing generic actions):**
- `retrieve_records` — Query codebase metadata by type and properties
- `retrieve_entities` — Query entities by entity_type
- `list_timeline_events` — Query timeline for any entity (real-world or codebase)

#### 2.3 Foundation Agent Integration

- Graceful degradation (check Neotoma availability, fallback to `.cursor/memory/`)
- Memory storage patterns (when to create records, field mappings)
- Memory retrieval patterns (entity resolution, timeline queries)
- Migration support (script to migrate `.cursor/memory/` to Neotoma)

#### 2.4 Explicitly Deferred

| Item | Deferred To | Reason |
|------|-------------|--------|
| Automated codebase entity suggestions | v0.3.x | Manual/agent-driven creation sufficient initially |
| Codebase search UI | v1.x | MCP interface sufficient for foundation agents |
| Multi-repo codebase tracking | v1.x | Single-repo usage validates core capabilities |

### 3. Release-Level Acceptance Criteria

#### 3.1 Product

- Foundation agents can store Feature Units via `submit_payload` with `neotoma:store_feature_unit:v1`
- Foundation agents can store Releases via `submit_payload` with `neotoma:store_release:v1`
- Foundation agents can store technical decisions via `submit_payload` with `neotoma:store_agent_decision:v1`
- Foundation agents can store session history via `submit_payload` with `neotoma:store_agent_session:v1`
- Foundation agents can query codebase entities via `retrieve_records` with `type` filter
- Foundation agents can query agent session history via `retrieve_records` with `type: "agent_session"`
- Foundation agents can query development timelines via `list_timeline_events` with entity filters
- Entity resolution works for codebase entities (e.g., "Feature Unit FU-061" unified across sessions)

#### 3.2 Technical

**Schema Requirements:**
- All 7 new entity types added to schema registry
- Field schemas defined with validation rules
- Extraction rules configured (direct property assignment for agent-created data)
- Schema versions defined (e.g., `feature_unit:v1`)

**MCP Requirements:**
- All 7 new capability IDs registered in capability registry
- Capability definitions include entity extraction rules
- Existing generic actions (`submit_payload`, `retrieve_records`, `retrieve_entities`, `list_timeline_events`) support new entity types
- Error handling implemented
- User isolation enforced (user_id scoping)

**Integration Requirements:**
- Graceful degradation pattern implemented
- Foundation agents can detect Neotoma availability
- Fallback to `.cursor/memory/` if Neotoma unavailable
- Migration script for existing `.cursor/memory/` data

**Testing Requirements:**
- Unit tests for schema validation
- Integration tests for MCP actions
- Entity resolution tests for codebase entities
- Timeline generation tests
- Cross-session persistence tests

#### 3.3 Business

- Enables foundation agents to use Neotoma for all memory (real-world + codebase)
- Provides unified memory system for agent development
- Validates Neotoma extensibility for domain-specific metadata
- Creates foundation for agent memory capabilities

### 4. Schema Extensions Detail

#### 4.1 feature_unit

**Purpose**: Track Feature Unit development records

**Fields**:
- `id` (string, required) — Feature unit identifier (e.g., "FU-061")
- `description` (string, required) — Feature unit description
- `status` (string, required) — Status (planning, in_progress, completed, deployed)
- `dependencies` (array<string>, optional) — Array of dependency IDs
- `risk_level` (string, optional) — Risk level (low, medium, high)
- `created_at` (timestamp, required) — Creation timestamp
- `updated_at` (timestamp, required) — Last update timestamp

**Entity Resolution**: By `id` field (e.g., "FU-061")

#### 4.2 release

**Purpose**: Track version release records

**Fields**:
- `id` (string, required) — Release identifier (e.g., "v0.2.3")
- `version` (string, required) — Version number
- `feature_units` (array<string>, required) — Array of feature unit IDs
- `status` (string, required) — Status (planning, in_progress, ready_for_deployment, deployed)
- `acceptance_criteria` (array<string>, required) — Array of acceptance criteria
- `target_ship_date` (date, optional) — Target ship date
- `created_at` (timestamp, required) — Creation timestamp
- `updated_at` (timestamp, required) — Last update timestamp

**Entity Resolution**: By `id` field (e.g., "v0.2.3")

#### 4.3 agent_decision

**Purpose**: Track technical decisions made by agents

**Fields**:
- `decision` (string, required) — Decision description
- `rationale` (string, required) — Decision rationale
- `context` (object, optional) — Contextual information (session_id, task, etc.)
- `decision_type` (string, optional) — Type (technical, architectural, process)
- `timestamp` (timestamp, required) — Decision timestamp
- `agent_id` (string, optional) — Agent identifier

**Entity Resolution**: By content hash of (decision + timestamp)

#### 4.4 agent_session

**Purpose**: Track agent session history

**Fields**:
- `session_id` (string, required) — Session identifier
- `actions` (array<object>, required) — Array of actions taken
- `checkpoints` (array<object>, optional) — Array of checkpoint states
- `outcomes` (array<object>, optional) — Array of outcomes
- `duration` (number, optional) — Session duration in seconds
- `started_at` (timestamp, required) — Session start timestamp
- `ended_at` (timestamp, optional) — Session end timestamp

**Entity Resolution**: By `session_id` field

#### 4.5 validation_result

**Purpose**: Track validation checkpoint results

**Fields**:
- `validation_type` (string, required) — Type of validation (lint, test, security, compliance)
- `status` (string, required) — Status (passed, failed, warning)
- `details` (object, optional) — Validation details (errors, warnings, etc.)
- `target` (string, optional) — Validation target (file, feature_unit, release)
- `timestamp` (timestamp, required) — Validation timestamp

**Entity Resolution**: By content hash of (validation_type + target + timestamp)

#### 4.6 codebase_entity

**Purpose**: Track codebase entities (subsystems, components, modules)

**Fields**:
- `entity_type` (string, required) — Type (subsystem, component, module, package)
- `name` (string, required) — Entity name
- `description` (string, optional) — Entity description
- `path` (string, optional) — File system path
- `relationships` (array<object>, optional) — Array of related entity IDs with relationship types

**Entity Resolution**: By `name` + `entity_type` combination

#### 4.7 architectural_decision

**Purpose**: Track architectural decisions and their rationale

**Fields**:
- `decision` (string, required) — Decision description
- `rationale` (string, required) — Decision rationale
- `impact` (string, optional) — Impact assessment
- `alternatives` (array<string>, optional) — Alternative approaches considered
- `status` (string, optional) — Status (proposed, accepted, deprecated, superseded)
- `timestamp` (timestamp, required) — Decision timestamp

**Entity Resolution**: By content hash of (decision + timestamp)

### 5. MCP Actions Detail

#### 5.1 submit_feature_unit

**Capability ID**: `neotoma:submit_feature_unit:v1`

**Input Schema**:
```json
{
  "id": "FU-061",
  "description": "Add sources table for raw storage",
  "status": "completed",
  "dependencies": ["FU-050"],
  "risk_level": "medium",
  "created_at": "2025-12-01T00:00:00Z",
  "updated_at": "2025-12-15T00:00:00Z"
}
```

**Output**: Entity ID, observation count

#### 5.2 submit_release

**Capability ID**: `neotoma:submit_release:v1`

**Input Schema**:
```json
{
  "id": "v0.2.3",
  "version": "0.2.3",
  "feature_units": ["FU-061", "FU-062"],
  "status": "planning",
  "acceptance_criteria": [
    "All schema extensions documented",
    "All MCP actions implemented"
  ],
  "target_ship_date": "2026-01-15",
  "created_at": "2025-12-31T00:00:00Z",
  "updated_at": "2025-12-31T00:00:00Z"
}
```

**Output**: Entity ID, observation count

#### 5.3 submit_agent_decision

**Capability ID**: `neotoma:submit_agent_decision:v1`

**Input Schema**:
```json
{
  "decision": "Use Neotoma for all foundation agent memory",
  "rationale": "Unified memory system with entity resolution and timeline generation",
  "context": {
    "session_id": "abc123",
    "task": "Design agent memory system"
  },
  "decision_type": "architectural",
  "timestamp": "2025-12-31T12:00:00Z",
  "agent_id": "cursor-agent-1"
}
```

**Output**: Entity ID, observation count

#### 5.4 submit_agent_session

**Capability ID**: `neotoma:submit_agent_session:v1`

**Input Schema**:
```json
{
  "session_id": "abc123",
  "actions": [
    {"type": "create_feature_unit", "result": "success"},
    {"type": "run_tests", "result": "passed"}
  ],
  "checkpoints": [
    {"name": "spec_complete", "timestamp": "2025-12-31T12:00:00Z"}
  ],
  "outcomes": [
    {"type": "feature_unit_created", "id": "FU-061"}
  ],
  "duration": 3600,
  "started_at": "2025-12-31T11:00:00Z",
  "ended_at": "2025-12-31T12:00:00Z"
}
```

**Output**: Entity ID, observation count

#### 5.5 query_codebase_entities

**Capability ID**: `neotoma:query_codebase_entities:v1`

**Input Schema**:
```json
{
  "entity_type": "feature_unit",
  "filters": {
    "status": "completed"
  },
  "limit": 10
}
```

**Output**: Array of entities with snapshots

#### 5.6 query_agent_history

**Capability ID**: `neotoma:query_agent_history:v1`

**Input Schema**:
```json
{
  "session_id": "abc123"
}
```

**Output**: Session entity with actions, checkpoints, outcomes

#### 5.7 query_entity_timeline

**Capability ID**: `neotoma:query_entity_timeline:v1`

**Input Schema**:
```json
{
  "entity_id": "FU-061",
  "start_date": "2025-12-01",
  "end_date": "2025-12-31"
}
```

**Output**: Timeline events for entity (creation, updates, related decisions)

### 6. Foundation Agent Integration

#### 6.1 Graceful Degradation Pattern

Foundation agents check Neotoma availability and fall back to `.cursor/memory/` if unavailable:

```typescript
async function storeAgentMemory(data: AgentMemory) {
  if (await isNeotomaAvailable()) {
    // Use Neotoma via MCP (preferred)
    await mcpClient.submit_payload({
      capability_id: "neotoma:submit_agent_decision:v1",
      body: data
    });
  } else {
    // Fallback to lightweight memory
    await writeToLocalMemory(data);
  }
}
```

#### 6.2 Memory Storage Patterns

**Feature Unit Creation**:
- Agent creates feature unit
- Submits via `submit_feature_unit` MCP action
- Retrieves for status updates
- Links to release

**Technical Decision Tracking**:
- Agent makes architectural decision
- Records via `submit_agent_decision` MCP action
- Queries for historical context in future sessions

**Session History**:
- Agent starts session
- Records checkpoints during execution
- Submits session summary at end
- Future sessions can restore checkpoint state

#### 6.3 Memory Retrieval Patterns

**Querying Feature Units**:
```typescript
const featureUnits = await mcpClient.query_codebase_entities({
  entity_type: "feature_unit",
  filters: { status: "completed" },
  limit: 10
});
```

**Querying Session History**:
```typescript
const session = await mcpClient.query_agent_history({
  session_id: previousSessionId
});
// Restore checkpoint state
restoreCheckpoint(session.checkpoints[0]);
```

**Querying Development Timeline**:
```typescript
const timeline = await mcpClient.query_entity_timeline({
  entity_id: "FU-061",
  start_date: "2025-12-01",
  end_date: "2025-12-31"
});
// timeline includes: creation, updates, related decisions, releases
```

### 7. Migration Guide

#### 7.1 Pre-Migration

1. Verify Neotoma v0.2.3 is installed
2. Confirm MCP server is running
3. Back up existing `.cursor/memory/` directory
4. Audit current memory structure

#### 7.2 Migration Steps

1. Parse `.cursor/memory/` files
2. Map to new schema types
3. Submit via MCP actions
4. Verify entity resolution
5. Validate timeline generation

#### 7.3 Post-Migration

1. Update foundation agents to use Neotoma
2. Remove `.cursor/memory/` fallback (optional)
3. Monitor memory usage
4. Verify cross-session persistence

Full migration guide: `docs/releases/v0.2.3/migration_guide.md`

### 8. Implementation Phases

#### Phase 1: Schema Extensions (3 days)

**Schema Registry Updates**:
- Add 7 new entity types to schema registry
- Define field schemas with validation rules
- Configure extraction rules (direct property assignment)
- Version schemas (e.g., `feature_unit:v1`)

#### Phase 2: MCP Actions (5 days)

**MCP Server Updates**:
- Implement `submit_feature_unit` action
- Implement `submit_release` action
- Implement `submit_agent_decision` action
- Implement `submit_agent_session` action
- Implement `query_codebase_entities` action
- Implement `query_agent_history` action
- Implement `query_entity_timeline` action

#### Phase 3: Foundation Integration (3 days)

**Foundation Agent Updates**:
- Implement graceful degradation pattern
- Add memory storage helpers
- Add memory retrieval helpers
- Create migration script

#### Phase 4: Testing & Documentation (2 days)

**Testing**:
- Unit tests for schema validation
- Integration tests for MCP actions
- Entity resolution tests
- Timeline generation tests

**Documentation**:
- Schema extension docs
- MCP action docs
- Migration guide
- Integration guide

**Total: 13 days (approximately 2 weeks)**

### 9. Security Model

- **User Isolation**: All codebase metadata is user-scoped (user_id stamped into observations)
- **RLS Enforcement**: Standard Neotoma RLS policies apply to codebase entities
- **MCP Server**: All mutations via `service_role`; user identity validated
- **Cross-User Prevention**: Agents cannot access other users' codebase metadata

### 10. Success Criteria

**Release is Complete When:**

1. ✅ All 7 schema extensions added to schema registry
2. ✅ All 7 MCP actions implemented and functional
3. ✅ Foundation agents can store Feature Units via MCP
4. ✅ Foundation agents can store Releases via MCP
5. ✅ Foundation agents can store decisions via MCP
6. ✅ Foundation agents can query codebase entities
7. ✅ Entity resolution works for codebase entities
8. ✅ Timeline generation works for development history
9. ✅ Graceful degradation pattern implemented
10. ✅ Migration script functional
11. ✅ All tests passing (unit + integration)
12. ✅ Documentation complete

**Validation Goal**: "Foundation agents can use Neotoma for all memory (real-world entities + codebase metadata) with unified entity resolution and timeline generation."

### 11. Known Limitations

1. **Single-repo focus**: Multi-repo codebase tracking deferred to v1.x
2. **Manual entity creation**: No automated codebase entity suggestions in v0.2.3
3. **No codebase search UI**: MCP interface only (UI deferred to v1.x)
4. **No schema evolution UI**: Schemas managed via migrations
5. **No automated cleanup**: Old session history not automatically archived

### 12. Deployment and Rollout Strategy

- **Deployment Target**: Production (neotoma.io)
  - All releases deploy to production at neotoma.io
  - Schema extensions added via migration
- **Marketing Strategy**: Not Marketed
  - No pre-launch marketing activities
  - No announcement or promotion
  - Release deployed silently to production
- **Rollback Plan**: Revert migrations and redeploy; migrate existing data back to `.cursor/memory/`

### 13. Status

- **Current Status**: `planning`
- **Owner**: Mark Hendrickson
- **Dependencies**: v0.2.0 completion
- **Notes**:
  - Extends Neotoma for foundation agent memory
  - Enables unified memory system (real-world + codebase)
  - Validates Neotoma extensibility for domain-specific metadata
  - AI agent execution assumed
