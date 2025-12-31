# v0.2.3 Foundation Agent Integration Guide

**Alignment**: This guide implements [Agent Skills for Context Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering) principles throughout.

## Overview

This guide details how foundation agents integrate with Neotoma for unified memory management following Agent Skills for Context Engineering principles. It covers:

- **Memory Systems** (Agent Skill 6): Entity tracking, knowledge graphs, semantic and episodic memory
- **Context Degradation Management** (Agent Skill 2): Preventing lost-in-middle, attention degradation
- **Context Compression** (Agent Skill 3): Entity resolution, snapshot compression, selective loading
- **Context Optimization** (Agent Skill 4): High-signal token curation, query-based loading
- **Multi-Agent Patterns** (Agent Skill 5): Orchestrator, peer-to-peer, hierarchical collaboration
- **Evaluation Patterns** (Agent Skills 8 & 9): Performance metrics, quality scoring, LLM-as-judge

This guide provides graceful degradation, memory storage patterns, memory retrieval patterns, and best practices aligned with Agent Skills principles.

## Integration Architecture

### Unified Memory System

Foundation agents use Neotoma for all memory (real-world entities + codebase metadata):

```
┌─────────────────────────────────────┐
│     Foundation Agent                │
│  (Cursor, ChatGPT, Claude)         │
└─────────────────┬───────────────────┘
                  │
                  │ MCP Protocol
                  │
┌─────────────────▼───────────────────┐
│     Neotoma MCP Server              │
│  - Entity Resolution                │
│  - Timeline Generation              │
│  - Cross-Session Persistence        │
└─────────────────┬───────────────────┘
                  │
                  │
┌─────────────────▼───────────────────┐
│     Neotoma Database                │
│  - Real-World Entities              │
│  - Codebase Metadata                │
│  - Observations & Snapshots         │
└─────────────────────────────────────┘
```

### Memory Types

| Memory Type | Entity Types | Use Case |
|-------------|--------------|----------|
| **Codebase Metadata** | feature_unit, release, codebase_entity | Track development units, releases, architecture |
| **Agent Activity** | agent_decision, agent_session | Track decisions, sessions, checkpoints |
| **Quality Tracking** | validation_result | Track test results, linter output, compliance |
| **Architecture** | architectural_decision | Track high-level architectural decisions |
| **Real-World Entities** | contact, invoice, event, etc. | Track people, companies, documents mentioned in docs |

## Graceful Degradation

Foundation agents check Neotoma availability and fall back to `.cursor/memory/` if unavailable.

### Detection Pattern

```typescript
// neotoma_client.ts
export async function isNeotomaAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3000/mcp/health', {
      method: 'GET',
      timeout: 2000
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}
```

### Storage Pattern

```typescript
// memory_service.ts
import { isNeotomaAvailable } from './neotoma_client';
import { mcpClient } from './mcp_client';
import { writeToLocalMemory } from './local_memory';

export async function storeFeatureUnit(featureUnit: FeatureUnit) {
  if (await isNeotomaAvailable()) {
    // Use Neotoma via MCP (preferred)
    try {
      const result = await mcpClient.submit_payload({
        capability_id: "neotoma:store_feature_unit:v1",
        body: featureUnit,
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.3"
        }
      });
      console.log(`Stored Feature Unit ${featureUnit.id} in Neotoma (payload_id: ${result.payload_id})`);
      return result;
    } catch (error) {
      console.error('Failed to store in Neotoma, falling back to local memory:', error);
      return writeToLocalMemory('feature_units', featureUnit.id, featureUnit);
    }
  } else {
    // Fallback to lightweight memory
    console.log(`Neotoma unavailable, using local memory for Feature Unit ${featureUnit.id}`);
    return writeToLocalMemory('feature_units', featureUnit.id, featureUnit);
  }
}
```

### Retrieval Pattern

```typescript
export async function getFeatureUnit(id: string): Promise<FeatureUnit | null> {
  if (await isNeotomaAvailable()) {
    try {
      const result = await mcpClient.retrieve_records({
        type: 'feature_unit',
        properties: { id }
      });
      
      if (result.records.length > 0) {
        return result.records[0].properties as FeatureUnit;
      }
      
      // Fall back to local memory if not found in Neotoma
      return readFromLocalMemory('feature_units', id);
    } catch (error) {
      console.error('Failed to query Neotoma, falling back to local memory:', error);
      return readFromLocalMemory('feature_units', id);
    }
  } else {
    return readFromLocalMemory('feature_units', id);
  }
}
```

## Memory Storage Patterns

### Feature Unit Creation

**When**: After `create-feature-unit` command completes

```typescript
import { storeFeatureUnit } from './memory_service';

async function createFeatureUnitCommand(args: CreateFeatureUnitArgs) {
  // 1. Create Feature Unit spec
  const spec = generateFeatureUnitSpec(args);
  
  // 2. Write spec to file
  writeFeatureUnitSpec(spec.id, spec);
  
  // 3. Store in Neotoma
  await storeFeatureUnit({
    id: spec.id,
    description: spec.overview,
    status: 'planning',
    dependencies: spec.dependencies || [],
    risk_level: spec.risk_level,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  
  console.log(`Feature Unit ${spec.id} created and stored in memory`);
}
```

### Feature Unit Status Update

**When**: Status changes (in_progress, completed, deployed)

```typescript
async function updateFeatureUnitStatus(id: string, newStatus: string) {
  // 1. Update spec file
  const spec = readFeatureUnitSpec(id);
  spec.status = newStatus;
  spec.updated = new Date().toISOString();
  writeFeatureUnitSpec(id, spec);
  
  // 2. Update in Neotoma
  await storeFeatureUnit({
    id: spec.id,
    description: spec.overview,
    status: newStatus,
    dependencies: spec.dependencies || [],
    risk_level: spec.risk_level,
    created_at: spec.created,
    updated_at: spec.updated
  });
  
  console.log(`Feature Unit ${id} status updated to ${newStatus}`);
}
```

### Release Creation

**When**: After `create-release` command completes

```typescript
async function createReleaseCommand(args: CreateReleaseArgs) {
  // 1. Create Release spec
  const spec = generateReleaseSpec(args);
  
  // 2. Write spec to file
  writeReleaseSpec(spec.id, spec);
  
  // 3. Store in Neotoma
  await mcpClient.submit_payload({
    capability_id: "neotoma:store_release:v1",
    body: {
      id: spec.id,
      version: spec.version,
      feature_units: spec.feature_units,
      status: 'planning',
      acceptance_criteria: spec.acceptance_criteria,
      target_ship_date: spec.target_ship_date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    provenance: {
      source_refs: [],
      extracted_at: new Date().toISOString(),
      extractor_version: "neotoma-mcp:v0.2.3"
    }
  });
  
  console.log(`Release ${spec.id} created and stored in memory`);
}
```

### Technical Decision Recording

**When**: Making architectural or technical decisions

```typescript
async function recordDecision(decision: string, rationale: string, context: any) {
  await mcpClient.submit_agent_decision({
    decision,
    rationale,
    context,
    decision_type: 'technical',
    timestamp: new Date().toISOString(),
    agent_id: 'cursor-agent'
  });
  
  console.log(`Decision recorded: ${decision}`);
}

// Example usage
await recordDecision(
  'Use Neotoma for all foundation agent memory',
  'Unified memory system with entity resolution and timeline generation',
  {
    feature_unit: 'FU-061',
    session_id: 'abc123',
    task: 'Design agent memory system'
  }
);
```

### Session History Recording

**When**: Session starts and ends

```typescript
async function startSession(sessionId: string) {
  const session = {
    session_id: sessionId,
    actions: [],
    checkpoints: [],
    outcomes: [],
    started_at: new Date().toISOString()
  };
  
  // Store session start (will be updated as session progresses)
  // Note: This is typically done at session end with full history
  
  return session;
}

async function endSession(session: AgentSession) {
  session.ended_at = new Date().toISOString();
  session.duration = calculateDuration(session.started_at, session.ended_at);
  
  // Store complete session
  await mcpClient.submit_agent_session(session);
  
  console.log(`Session ${session.session_id} completed (${session.duration}s)`);
}

// Example usage
const session = await startSession('abc123');

// Track actions
session.actions.push({
  type: 'create_feature_unit',
  result: 'success',
  details: { feature_unit_id: 'FU-061' },
  timestamp: new Date().toISOString()
});

// Track checkpoints
session.checkpoints.push({
  name: 'spec_complete',
  state: { feature_unit_id: 'FU-061', status: 'planning' },
  timestamp: new Date().toISOString()
});

// Track outcomes
session.outcomes.push({
  type: 'feature_unit_created',
  id: 'FU-061'
});

// End session
await endSession(session);
```

### Validation Result Recording

**When**: Running tests, linters, or validation scripts

```typescript
async function recordValidationResult(
  validationType: string,
  status: string,
  details: any,
  target: string
) {
  await mcpClient.submit_payload({
    capability_id: 'neotoma:submit_codebase_metadata:v1',
    body: {
      entity_type: 'validation_result',
      data: {
        validation_type: validationType,
        status,
        details,
        target,
        timestamp: new Date().toISOString()
      }
    }
  });
  
  console.log(`Validation result recorded: ${validationType} (${status})`);
}

// Example usage after running tests
const testResult = runTests();
await recordValidationResult(
  'test',
  testResult.passed ? 'passed' : 'failed',
  {
    passed_count: testResult.passed_count,
    failed_count: testResult.failed_count,
    duration_ms: testResult.duration_ms
  },
  'FU-061'
);
```

## Memory Retrieval Patterns

### Querying Feature Units

```typescript
// Get all completed Feature Units
async function getCompletedFeatureUnits() {
  const result = await mcpClient.retrieve_records({
    type: 'feature_unit',
    properties: { status: 'completed' },
    limit: 100
  });
  
  return result.records.map(r => r.properties);
}

// Get Feature Unit by ID
async function getFeatureUnit(id: string) {
  const result = await mcpClient.retrieve_records({
    type: 'feature_unit',
    properties: { id },
    limit: 1
  });
  
  return result.records.length > 0 ? result.records[0].properties : null;
}

// Get Feature Units by dependencies
async function getFeatureUnitsByDependency(dependencyId: string) {
  const result = await mcpClient.retrieve_records({
    type: 'feature_unit',
    search: [dependencyId],
    search_mode: "keyword"
  });
  
  return result.entities.map(e => e.snapshot);
}
```

### Querying Releases

```typescript
// Get current release
async function getCurrentRelease() {
  const result = await mcpClient.retrieve_records({
    entity_type: 'release',
    filters: { status: 'in_progress' },
    order_by: 'created_at',
    order: 'desc',
    limit: 1
  });
  
  return result.entities.length > 0 ? result.entities[0].snapshot : null;
}

// Get releases containing Feature Unit
async function getReleasesForFeatureUnit(featureUnitId: string) {
  const result = await mcpClient.retrieve_records({
    entity_type: 'release',
    filters: {
      feature_units: { contains: featureUnitId }
    }
  });
  
  return result.entities.map(e => e.snapshot);
}
```

### Querying Agent Decisions

```typescript
// Get recent architectural decisions
async function getArchitecturalDecisions() {
  const result = await mcpClient.retrieve_records({
    entity_type: 'agent_decision',
    filters: { decision_type: 'architectural' },
    order_by: 'timestamp',
    order: 'desc',
    limit: 10
  });
  
  return result.entities.map(e => e.snapshot);
}

// Get decisions related to Feature Unit
async function getDecisionsForFeatureUnit(featureUnitId: string) {
  const result = await mcpClient.retrieve_records({
    entity_type: 'agent_decision',
    filters: {
      'context.feature_unit': featureUnitId
    },
    order_by: 'timestamp',
    order: 'desc'
  });
  
  return result.entities.map(e => e.snapshot);
}
```

### Querying Session History

```typescript
// Get recent sessions
async function getRecentSessions(limit: number = 5) {
  const result = await mcpClient.retrieve_records({
    type: "agent_session",
    limit,
    order_by: 'started_at',
    order: 'desc'
  });
  
  return result.sessions.map(s => s.snapshot);
}

// Get specific session
async function getSession(sessionId: string) {
  const result = await mcpClient.retrieve_records({
    type: "agent_session",
    session_id: sessionId
  });
  
  return result.sessions.length > 0 ? result.sessions[0].snapshot : null;
}

// Restore previous session checkpoint
async function restorePreviousCheckpoint() {
  const sessions = await getRecentSessions(1);
  
  if (sessions.length > 0) {
    const lastSession = sessions[0];
    const lastCheckpoint = lastSession.checkpoints[lastSession.checkpoints.length - 1];
    
    if (lastCheckpoint) {
      console.log(`Restoring checkpoint: ${lastCheckpoint.name}`);
      return lastCheckpoint.state;
    }
  }
  
  return null;
}
```

### Querying Entity Timeline

```typescript
// Get Feature Unit timeline
async function getFeatureUnitTimeline(featureUnitId: string) {
  const result = await mcpClient.query_entity_timeline({
    entity_id: featureUnitId,
    start_date: '2025-01-01',
    end_date: new Date().toISOString().split('T')[0]
  });
  
  return result.events;
}

// Print timeline
async function printFeatureUnitHistory(featureUnitId: string) {
  const events = await getFeatureUnitTimeline(featureUnitId);
  
  console.log(`\n=== Feature Unit ${featureUnitId} Timeline ===\n`);
  
  for (const event of events) {
    console.log(`${event.timestamp}: ${event.description}`);
    if (event.details) {
      console.log(`  Details: ${JSON.stringify(event.details)}`);
    }
  }
}
```

## Cross-Session Continuity

### Session Restoration

```typescript
async function continueFromPreviousSession() {
  console.log('Checking for previous session...');
  
  // Get last session
  const sessions = await getRecentSessions(1);
  
  if (sessions.length === 0) {
    console.log('No previous session found, starting fresh');
    return null;
  }
  
  const lastSession = sessions[0];
  console.log(`Found previous session: ${lastSession.session_id}`);
  console.log(`Last action: ${lastSession.actions[lastSession.actions.length - 1]?.type}`);
  
  // Check if session has checkpoints
  if (lastSession.checkpoints.length > 0) {
    const lastCheckpoint = lastSession.checkpoints[lastSession.checkpoints.length - 1];
    console.log(`Last checkpoint: ${lastCheckpoint.name}`);
    
    // Restore checkpoint state
    return lastCheckpoint.state;
  }
  
  return null;
}

// Example usage in agent startup
const restoredState = await continueFromPreviousSession();

if (restoredState) {
  console.log('Restored state:', restoredState);
  // Continue work from checkpoint
} else {
  console.log('Starting new work');
  // Start fresh
}
```

### Context Loading

```typescript
async function loadWorkContext(featureUnitId: string) {
  console.log(`Loading context for Feature Unit ${featureUnitId}...`);
  
  // Load Feature Unit
  const featureUnit = await getFeatureUnit(featureUnitId);
  
  if (!featureUnit) {
    console.log(`Feature Unit ${featureUnitId} not found`);
    return null;
  }
  
  // Load related decisions
  const decisions = await getDecisionsForFeatureUnit(featureUnitId);
  
  // Load validation history
  const validations = await mcpClient.query_codebase_entities({
    entity_type: 'validation_result',
    filters: { target: featureUnitId },
    order_by: 'timestamp',
    order: 'desc',
    limit: 5
  });
  
  // Load timeline
  const timeline = await getFeatureUnitTimeline(featureUnitId);
  
  return {
    feature_unit: featureUnit,
    decisions: decisions.map(d => ({
      decision: d.decision,
      rationale: d.rationale,
      timestamp: d.timestamp
    })),
    validations: validations.entities.map(v => ({
      type: v.snapshot.validation_type,
      status: v.snapshot.status,
      timestamp: v.snapshot.timestamp
    })),
    timeline: timeline.map(e => ({
      timestamp: e.timestamp,
      description: e.description
    }))
  };
}

// Example usage
const context = await loadWorkContext('FU-061');
console.log('Loaded context:', context);
```

## Context Degradation Management

**Agent Skills Reference**: [context-degradation](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering/blob/main/skills/context-degradation) skill

### Problem: Lost-in-the-Middle and Attention Scarcity

As agent sessions grow longer and context windows fill up, information in the middle of the context can be lost due to:
- **Lost-in-the-middle phenomenon**: LLMs pay less attention to content in the middle of long contexts (U-shaped attention curve)
- **U-shaped attention curves**: Attention is highest at the beginning and end, lower in the middle
- **Attention scarcity**: Context windows are limited by attention mechanics, not just token capacity

### Solution: Query-Based Memory Instead of Context Loading

Neotoma addresses context degradation by providing **persistent, queryable memory** outside the context window:

**Traditional Approach (Context Degradation Risk):**
```typescript
// BAD: Load all Feature Units into context
const allFeatureUnits = loadAllFeatureUnitsFromMemory();
// Context window fills up, middle content gets lost
```

**Neotoma Approach (No Context Degradation):**
```typescript
// GOOD: Query only what's needed
const featureUnit = await mcpClient.query_codebase_entities({
  entity_type: 'feature_unit',
  filters: { id: 'FU-061' },
  limit: 1
});
// Only relevant entity loaded, context window preserved
```

### Benefits

1. **Selective Loading**: Agents query only relevant entities, not entire memory
2. **No Context Window Limits**: Memory persists outside context, unlimited size
3. **Targeted Queries**: Filter by entity type, status, relationships, timestamps
4. **Progressive Disclosure**: Load foundation → load specific → load related
5. **Timeline Queries**: Get chronological events without loading all history

### Patterns for Context Optimization

**Agent Skills Principle**: Curate the smallest possible set of **high-signal tokens** that maximize desired outcomes.

#### Pattern 1: Query on Demand

```typescript
// Instead of loading all Feature Units
async function getFeatureUnitContext(id: string) {
  // Query only the specific Feature Unit
  const result = await mcpClient.retrieve_records({
    entity_type: 'feature_unit',
    filters: { id },
    limit: 1
  });
  
  // Query related entities only if needed
  if (result.entities.length > 0) {
    const fu = result.entities[0].snapshot;
    
    // Query related decisions only if needed
    const decisions = await mcpClient.query_codebase_entities({
      entity_type: 'agent_decision',
      filters: { 'context.feature_unit': id },
      limit: 5  // Limit to recent decisions
    });
    
    return {
      feature_unit: fu,
      recent_decisions: decisions.entities.map(e => e.snapshot)
    };
  }
  
  return null;
}
```

#### Pattern 2: Progressive Disclosure

```typescript
// Load foundation first, then specific, then related
async function loadWorkContext(featureUnitId: string) {
  // Phase 1: Load foundation (Feature Unit)
  const featureUnit = await getFeatureUnit(featureUnitId);
  
  // Phase 2: Load specific (recent decisions)
  const decisions = await getDecisionsForFeatureUnit(featureUnitId, { limit: 3 });
  
  // Phase 3: Load related (validation results)
  const validations = await getValidationsForFeatureUnit(featureUnitId, { limit: 2 });
  
  // Only load what's needed, when needed
  return { featureUnit, decisions, validations };
}
```

#### Pattern 3: Timeline Queries Instead of Full History

```typescript
// Instead of loading all events
async function getRecentTimeline(entityId: string, days: number = 7) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Query only recent timeline events
  const timeline = await mcpClient.list_timeline_events({
    entity_id: entityId,
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0]
  });
  
  // Return only recent events (not full history)
  return timeline.events.slice(-10);  // Last 10 events
}
```

#### Pattern 4: Filtered Queries

```typescript
// Query only completed Feature Units
const completedFUs = await mcpClient.query_codebase_entities({
  entity_type: 'feature_unit',
  filters: { status: 'completed' },
  limit: 5,  // Limit results
  order_by: 'updated_at',
  order: 'desc'
});

// Query only architectural decisions
const archDecisions = await mcpClient.query_codebase_entities({
  entity_type: 'architectural_decision',
  filters: { 
    status: 'accepted',
    decision: { contains: 'storage' }  // Filter by keyword
  },
  limit: 3
});
```

### Context Budget Management

**Agent Skills Principle**: Attention budget must be allocated across all context to prevent attention scarcity.

**Recommended Context Budget Allocation:**

1. **Foundation Context (20%)**: Core Feature Unit or Release being worked on (high-signal foundation)
2. **Related Context (30%)**: Recent decisions, validations, related entities (high-signal context)
3. **Task Context (40%)**: Current task instructions, code, files (current work)
4. **Reserve (10%)**: Buffer for new information and tool outputs

**Example:**
```typescript
async function optimizeContextForTask(featureUnitId: string) {
  // 20%: Foundation
  const featureUnit = await getFeatureUnit(featureUnitId);
  
  // 30%: Related (limited to recent)
  const recentDecisions = await getDecisionsForFeatureUnit(featureUnitId, { limit: 2 });
  const recentValidations = await getValidationsForFeatureUnit(featureUnitId, { limit: 1 });
  
  // 40%: Task context (provided by agent)
  // 10%: Reserve
  
  return {
    foundation: featureUnit,
    related: { decisions: recentDecisions, validations: recentValidations }
  };
}
```

### Avoiding Context Degradation

**DO:**
- ✅ Query specific entities by ID
- ✅ Use filters to narrow results
- ✅ Limit query results (use `limit` parameter)
- ✅ Query on demand, not pre-load everything
- ✅ Use timeline queries for recent events only
- ✅ Progressive disclosure (load foundation → specific → related)

**DON'T:**
- ❌ Load all Feature Units into context
- ❌ Query without filters
- ❌ Load full history when only recent events needed
- ❌ Pre-load all related entities
- ❌ Include entire memory in context

### Additional Context Degradation Types

Beyond lost-in-the-middle, context degradation includes:

#### Context Poisoning

**Problem**: Irrelevant or incorrect information corrupts agent reasoning

**Example**:
```typescript
// Bad: Loading unrelated entities
const context = {
  currentTask: await getFeatureUnit('FU-061'),
  allFeatureUnits: await getAllFeatureUnits(),  // 50 unrelated FUs
  allDecisions: await getAllDecisions()         // 100 unrelated decisions
};
// Agent confused by irrelevant information
```

**Solution**: Query only directly related entities
```typescript
// Good: Load only related entities
const context = {
  currentTask: await getFeatureUnit('FU-061'),
  relatedDecisions: await getDecisionsForFeatureUnit('FU-061', 3),
  dependencies: await getFeatureUnitsByIds(currentTask.dependencies)
};
// Only relevant information, no poisoning
```

#### Context Distraction

**Problem**: Relevant but not immediately necessary information distracts from current task

**Example**:
```typescript
// Bad: Loading full history when only current state needed
const context = {
  featureUnit: await getFeatureUnit('FU-061'),
  fullTimeline: await getFullTimeline('FU-061'),  // 100 events
  allValidations: await getAllValidations('FU-061')  // 20 validation runs
};
// Agent distracted by historical details
```

**Solution**: Load current state, query history on demand
```typescript
// Good: Load current state only
const context = {
  featureUnit: await getFeatureUnit('FU-061'),  // Current state only
  recentEvents: await getRecentTimeline('FU-061', 7)  // Last 7 days
};
// Focused on current task, history available if needed
```

#### Context Clash

**Problem**: Conflicting information in context (e.g., old status vs. new status)

**Example**:
```typescript
// Bad: Loading both old and new versions
const context = {
  featureUnit: await getFeatureUnit('FU-061'),  // Current: status = 'completed'
  oldSnapshot: historicalSnapshots['FU-061'],   // Old: status = 'planning'
  timeline: await getTimeline('FU-061')         // Shows both statuses
};
// Agent confused by conflicting statuses
```

**Solution**: Use snapshots (current state), query timeline only when needed
```typescript
// Good: Load current snapshot only
const context = {
  featureUnit: await getFeatureUnit('FU-061')  // Current snapshot (completed)
};
// Single source of truth, no conflicting information

// If history needed, query explicitly
if (needHistory) {
  const timeline = await getTimeline('FU-061');
  // Timeline shows progression, not conflicting states
}
```

### Preventing Context Degradation

| Degradation Type | Prevention Strategy | Neotoma Mechanism |
|------------------|---------------------|-------------------|
| Lost-in-the-middle | Query-based loading | Load only relevant entities via filtered queries |
| Context poisoning | Filtered queries | Use `filters` parameter to exclude irrelevant entities |
| Context distraction | Current state focus | Use snapshots (current state) instead of full history |
| Context clash | Single source of truth | Snapshots provide current state, timeline shows progression |
| Attention scarcity | Context budget | 20/30/40/10 allocation prevents overload |

### Comparison: With vs. Without Neotoma

**Without Neotoma (Context Degradation Risk):**
```typescript
// Load all memory into context
const allMemory = {
  featureUnits: loadAllFeatureUnits(),      // 50+ entities
  releases: loadAllReleases(),              // 20+ entities
  decisions: loadAllDecisions(),             // 100+ entities
  sessions: loadAllSessions()               // 200+ entities
};
// Context window: 200K tokens
// Risk: Lost-in-the-middle, attention degradation, poisoning, distraction, clash
```

**With Neotoma (No Context Degradation):**
```typescript
// Query only what's needed
const currentFU = await queryFeatureUnit('FU-061');           // 1 entity (current state)
const recentDecisions = await queryDecisions('FU-061', 3);    // 3 related entities
const timeline = await queryTimeline('FU-061', 7);            // 10 recent events
// Context window: 5K tokens
// Benefit: No degradation, focused attention, no poisoning/distraction/clash
```

## Context Compression

**Agent Skills Reference**: [context-compression](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering/blob/main/skills/context-compression) skill

### Problem: Token Usage and Information Density

As agent sessions grow longer, context windows fill with:
- **Redundant information**: Same entities referenced multiple times
- **Full history**: All observations instead of current state
- **Duplicate data**: Multiple representations of same facts
- **Verbose context**: Unnecessary details for current task

Context compression reduces token usage while preserving information density through summarization, deduplication, and progressive disclosure.

### Solution: Compression Through Entity Resolution and Snapshots

Neotoma compresses context through multiple mechanisms:

1. **Entity Resolution (Deduplication)**: Multiple observations about same entity resolve to single entity
2. **Snapshot Compression**: Current state instead of full observation history
3. **Timeline Summarization**: Recent events only, not full history
4. **Selective Loading**: Query only relevant entities, not entire memory
5. **Checkpoint Restoration**: Restore compressed state instead of full history

### Compression Mechanisms

#### 1. Entity Resolution (Automatic Deduplication)

**Problem**: Same entity referenced multiple times in context
```typescript
// Without compression: Multiple references
const context = {
  featureUnit1: { id: 'FU-061', status: 'completed' },
  featureUnit2: { id: 'FU-061', status: 'completed' },  // Duplicate
  featureUnit3: { id: 'FU-061', status: 'completed' }   // Duplicate
};
// 3x token usage for same entity
```

**Solution**: Entity resolution unifies duplicates
```typescript
// With Neotoma: Single resolved entity
const featureUnit = await mcpClient.query_codebase_entities({
  entity_type: 'feature_unit',
  filters: { id: 'FU-061' },
  limit: 1
});
// 1x token usage, entity resolution handles duplicates
```

**Compression Ratio**: 3:1 (3 references → 1 entity)

#### 2. Snapshot Compression (Current State vs. Full History)

**Problem**: Full observation history is verbose
```typescript
// Without compression: Full history
const featureUnitHistory = {
  observations: [
    { timestamp: '2025-12-01', status: 'planning' },
    { timestamp: '2025-12-05', status: 'in_progress' },
    { timestamp: '2025-12-10', status: 'in_progress' },
    { timestamp: '2025-12-15', status: 'completed' },
    { timestamp: '2025-12-20', status: 'deployed' }
  ]
};
// 5 observations, ~500 tokens
```

**Solution**: Snapshot provides current state only
```typescript
// With Neotoma: Current snapshot
const featureUnit = await mcpClient.query_codebase_entities({
  entity_type: 'feature_unit',
  filters: { id: 'FU-061' }
});

const snapshot = featureUnit.entities[0].snapshot;
// { id: 'FU-061', status: 'deployed', ... }
// 1 snapshot, ~100 tokens
```

**Compression Ratio**: 5:1 (5 observations → 1 snapshot)

#### 3. Timeline Summarization (Recent Events Only)

**Problem**: Full timeline history is large
```typescript
// Without compression: Full timeline
const fullTimeline = {
  events: [
    { date: '2025-01-01', event: 'Created' },
    { date: '2025-02-01', event: 'Updated' },
    // ... 100 more events
    { date: '2025-12-31', event: 'Deployed' }
  ]
};
// 102 events, ~10K tokens
```

**Solution**: Query recent events only
```typescript
// With Neotoma: Recent timeline
const recentTimeline = await mcpClient.query_entity_timeline({
  entity_id: 'FU-061',
  start_date: '2025-12-01',  // Last 30 days only
  end_date: '2025-12-31'
});
// 5 events, ~500 tokens
```

**Compression Ratio**: 20:1 (102 events → 5 recent events)

#### 4. Selective Loading (Query-Based Compression)

**Problem**: Loading all entities fills context
```typescript
// Without compression: Load everything
const allMemory = {
  featureUnits: loadAllFeatureUnits(),      // 50 entities
  releases: loadAllReleases(),              // 20 entities
  decisions: loadAllDecisions(),            // 100 entities
  sessions: loadAllSessions()              // 200 entities
};
// 370 entities, ~200K tokens
```

**Solution**: Query only what's needed
```typescript
// With Neotoma: Selective loading
const currentFU = await queryFeatureUnit('FU-061');           // 1 entity
const relatedDecisions = await queryDecisions('FU-061', 3);    // 3 entities
// 4 entities, ~2K tokens
```

**Compression Ratio**: 92:1 (370 entities → 4 relevant entities)

#### 5. Checkpoint Restoration (Compressed State)

**Problem**: Restoring full session history is verbose
```typescript
// Without compression: Full session history
const sessionHistory = {
  session_id: 'abc123',
  actions: [
    { type: 'create_feature_unit', result: 'success', ... },
    { type: 'run_tests', result: 'passed', ... },
    // ... 50 more actions
  ],
  checkpoints: [
    { name: 'spec_complete', state: { ...full_state... } },
    { name: 'tests_passing', state: { ...full_state... } },
    // ... 10 more checkpoints
  ]
};
// Full history, ~50K tokens
```

**Solution**: Restore from checkpoint (compressed state)
```typescript
// With Neotoma: Checkpoint restoration
const session = await mcpClient.query_agent_history({
  session_id: 'abc123'
});

const lastCheckpoint = session.sessions[0].snapshot.checkpoints[
  session.sessions[0].snapshot.checkpoints.length - 1
];

// Restore compressed checkpoint state
const restoredState = lastCheckpoint.state;
// Compressed state, ~2K tokens
```

**Compression Ratio**: 25:1 (50K tokens → 2K tokens)

### Compression Patterns

#### Pattern 1: Entity-Based Compression

```typescript
// Compress by querying single entity instead of multiple references
async function getCompressedFeatureUnitContext(id: string) {
  // Single query returns resolved entity (deduplicated)
  const result = await mcpClient.retrieve_records({
    entity_type: 'feature_unit',
    filters: { id },
    limit: 1
  });
  
  // Snapshot provides current state (compressed from full history)
  return result.entities[0].snapshot;
}
```

#### Pattern 2: Timeline Compression

```typescript
// Compress timeline to recent events only
async function getCompressedTimeline(entityId: string, days: number = 7) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Query only recent events (compressed from full history)
  const timeline = await mcpClient.list_timeline_events({
    entity_id: entityId,
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0]
  });
  
  // Return only last N events (further compression)
  return timeline.events.slice(-10);
}
```

#### Pattern 3: Relationship Compression

```typescript
// Compress by querying relationships instead of loading all entities
async function getCompressedRelationships(featureUnitId: string) {
  // Query only related entities (compressed from all entities)
  const relatedDecisions = await mcpClient.query_codebase_entities({
    entity_type: 'agent_decision',
    filters: { 'context.feature_unit': featureUnitId },
    limit: 3  // Limit to recent (compression)
  });
  
  // Return only essential relationship data
  return relatedDecisions.entities.map(e => ({
    decision: e.snapshot.decision,
    timestamp: e.snapshot.timestamp
    // Compressed: only essential fields, not full snapshot
  }));
}
```

#### Pattern 4: Checkpoint Compression

```typescript
// Compress session restoration via checkpoints
async function restoreCompressedCheckpoint(sessionId: string, checkpointName: string) {
  const session = await mcpClient.query_agent_history({
    session_id: sessionId
  });
  
  // Find specific checkpoint (compressed state)
  const checkpoint = session.sessions[0].snapshot.checkpoints.find(
    cp => cp.name === checkpointName
  );
  
  // Return compressed checkpoint state
  return checkpoint?.state || null;
}
```

### Compression Metrics

**Typical Compression Ratios:**

| Compression Type | Without Neotoma | With Neotoma | Ratio |
|------------------|-----------------|--------------|-------|
| Entity Resolution | 3 references | 1 entity | 3:1 |
| Snapshot Compression | 5 observations | 1 snapshot | 5:1 |
| Timeline Summarization | 102 events | 5 recent events | 20:1 |
| Selective Loading | 370 entities | 4 relevant entities | 92:1 |
| Checkpoint Restoration | 50K tokens | 2K tokens | 25:1 |

**Combined Compression**: Up to 100:1 reduction in context size

### Best Practices for Compression

**DO:**
- ✅ Use entity resolution (query by ID, not load all)
- ✅ Use snapshots (current state, not full history)
- ✅ Query recent timeline only (limit date range)
- ✅ Use selective loading (filters and limits)
- ✅ Restore from checkpoints (compressed state)
- ✅ Query relationships on demand (not pre-load)

**DON'T:**
- ❌ Load all entities into context
- ❌ Include full observation history
- ❌ Query full timeline without date limits
- ❌ Pre-load all related entities
- ❌ Restore full session history
- ❌ Include duplicate entity references

### Compression Example: Before vs. After

**Before (No Compression):**
```typescript
// Load everything
const context = {
  allFeatureUnits: loadAllFeatureUnits(),        // 50 entities, 50K tokens
  allReleases: loadAllReleases(),                // 20 entities, 20K tokens
  allDecisions: loadAllDecisions(),              // 100 entities, 100K tokens
  fullTimeline: loadFullTimeline('FU-061'),      // 102 events, 10K tokens
  fullSessionHistory: loadFullSession('abc123')  // 50 actions, 50K tokens
};
// Total: ~230K tokens
```

**After (With Neotoma Compression):**
```typescript
// Query only what's needed
const context = {
  featureUnit: await queryFeatureUnit('FU-061'),              // 1 entity, 1K tokens
  recentDecisions: await queryDecisions('FU-061', 3),          // 3 entities, 3K tokens
  recentTimeline: await queryTimeline('FU-061', 7),            // 5 events, 500 tokens
  checkpoint: await restoreCheckpoint('abc123', 'spec_complete') // 1 checkpoint, 2K tokens
};
// Total: ~6.5K tokens
// Compression: 35:1 ratio
```

## Best Practices

### 1. Always Check Neotoma Availability

```typescript
// Good
if (await isNeotomaAvailable()) {
      await mcpClient.submit_payload({
        capability_id: "neotoma:store_feature_unit:v1",
        body: featureUnit,
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.3"
        }
      });
} else {
  await writeToLocalMemory('feature_units', featureUnit.id, featureUnit);
}

// Bad (no fallback)
      await mcpClient.submit_payload({
        capability_id: "neotoma:store_feature_unit:v1",
        body: featureUnit,
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.3"
        }
      }); // May fail if Neotoma unavailable
```

### 2. Use Timestamps Consistently

```typescript
// Good
const now = new Date().toISOString();
await mcpClient.submit_feature_unit({
  id: 'FU-061',
  created_at: now,
  updated_at: now
});

// Bad (missing timestamps)
await mcpClient.submit_feature_unit({
  id: 'FU-061'
  // Missing created_at and updated_at
});
```

### 3. Provide Context in Decisions

```typescript
// Good
await mcpClient.submit_agent_decision({
  decision: 'Use content-addressed storage',
  rationale: 'Enables deduplication',
  context: {
    feature_unit: 'FU-061',
    session_id: 'abc123',
    task: 'Design storage layer'
  },
  decision_type: 'technical',
  timestamp: new Date().toISOString()
});

// Bad (no context)
await mcpClient.submit_agent_decision({
  decision: 'Use content-addressed storage',
  rationale: 'Enables deduplication',
  timestamp: new Date().toISOString()
  // Missing context
});
```

### 4. Track Session History

```typescript
// Good
const session = {
  session_id: generateSessionId(),
  actions: [
    { type: 'create_feature_unit', result: 'success' },
    { type: 'run_tests', result: 'passed' }
  ],
  checkpoints: [
    { name: 'spec_complete', timestamp: new Date().toISOString() }
  ],
  outcomes: [
    { type: 'feature_unit_created', id: 'FU-061' }
  ],
  started_at: sessionStart,
  ended_at: new Date().toISOString()
};
await mcpClient.submit_agent_session(session);

// Bad (minimal tracking)
const session = {
  session_id: generateSessionId(),
  actions: [{ type: 'work', result: 'success' }],
  started_at: sessionStart
};
await mcpClient.submit_agent_session(session);
```

### 5. Use Entity Resolution

```typescript
// Good (entity resolution by ID)
await mcpClient.submit_feature_unit({
  id: 'FU-061', // Same ID resolves to same entity
  status: 'completed',
  updated_at: new Date().toISOString()
});

// Bad (no stable ID)
await mcpClient.submit_feature_unit({
  id: generateRandomId(), // New ID creates duplicate entity
  status: 'completed'
});
```

### 6. Query Before Creating

```typescript
// Good (check if exists first)
const existing = await getFeatureUnit('FU-061');
if (!existing) {
  await mcpClient.submit_feature_unit({
    id: 'FU-061',
    description: 'Add sources table',
    status: 'planning',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

// Bad (always create)
await mcpClient.submit_feature_unit({
  id: 'FU-061',
  // ...
}); // May create duplicate observations
```

### 7. Handle Errors Gracefully

```typescript
// Good
try {
      await mcpClient.submit_payload({
        capability_id: "neotoma:store_feature_unit:v1",
        body: featureUnit,
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.3"
        }
      });
} catch (error) {
  console.error('Failed to store Feature Unit:', error);
  // Fallback to local memory
  await writeToLocalMemory('feature_units', featureUnit.id, featureUnit);
}

// Bad (no error handling)
      await mcpClient.submit_payload({
        capability_id: "neotoma:store_feature_unit:v1",
        body: featureUnit,
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.3"
        }
      }); // May crash agent
```

### 8. Follow Entity Naming Conventions

**Feature Units**: Use `FU-\d+` pattern (e.g., "FU-061", "FU-062")
```typescript
// Good
await mcpClient.submit_feature_unit({
  id: 'FU-061',  // Matches pattern FU-\d+
  // ...
});

// Bad
await mcpClient.submit_feature_unit({
  id: 'feature-unit-61',  // Doesn't match pattern
  // ...
});
```

**Releases**: Use `v\d+\.\d+\.\d+` pattern (e.g., "v0.2.3", "v1.0.0")
```typescript
// Good
await mcpClient.submit_payload({
  capability_id: "neotoma:store_release:v1",
  body: {
  id: 'v0.2.3',  // Matches pattern v\d+\.\d+\.\d+
  version: '0.2.3',
  // ...
});

// Bad
await mcpClient.submit_payload({
  capability_id: "neotoma:store_release:v1",
  body: {
  id: 'release-0.2.3',  // Doesn't match pattern
  // ...
});
```

**Session IDs**: Use descriptive, unique identifiers (min 5 chars)
```typescript
// Good
const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Bad
const sessionId = 'abc';  // Too short (min 5 chars)
```

### 9. Optimize Timeline Queries

**Use Date Ranges**: Query only relevant time periods
```typescript
// Good (optimized: last 7 days only)
const timeline = await mcpClient.query_entity_timeline({
  entity_id: 'FU-061',
  start_date: '2025-12-24',  // Last 7 days
  end_date: '2025-12-31'
});

// Bad (no date range: full history)
const timeline = await mcpClient.query_entity_timeline({
  entity_id: 'FU-061'
  // No date range = loads full history
});
```

**Limit Event Types**: Filter by event types when possible
```typescript
// Good (filtered: only created/updated events)
const timeline = await mcpClient.query_entity_timeline({
  entity_id: 'FU-061',
  event_types: ['created', 'updated']
});

// Bad (all event types)
const timeline = await mcpClient.query_entity_timeline({
  entity_id: 'FU-061'
  // All event types = more data
});
```

**Use Recent Events Only**: Slice results to most recent
```typescript
// Good (recent events only)
const timeline = await mcpClient.query_entity_timeline({
  entity_id: 'FU-061',
  start_date: '2025-12-24',
  end_date: '2025-12-31'
});
const recentEvents = timeline.events.slice(-10);  // Last 10 events

// Bad (all events)
const timeline = await mcpClient.query_entity_timeline({
  entity_id: 'FU-061'
});
// Uses all events, not just recent
```

## Integration Checklist

- [ ] MCP client initialized
- [ ] Neotoma availability check implemented
- [ ] Graceful degradation to `.cursor/memory/` implemented
- [ ] Feature Unit storage implemented
- [ ] Release storage implemented
- [ ] Decision recording implemented
- [ ] Session history tracking implemented
- [ ] Validation result recording implemented
- [ ] Entity query patterns implemented
- [ ] Timeline query patterns implemented
- [ ] Cross-session continuity implemented
- [ ] Error handling implemented
- [ ] Timestamps in ISO 8601 format
- [ ] Context provided in decisions
- [ ] Entity IDs stable and consistent

## Testing Integration

### Unit Tests

```typescript
// test/memory_service.test.ts
describe('Memory Service', () => {
  it('should store Feature Unit in Neotoma when available', async () => {
    mockNeotomaAvailable(true);
    
    const featureUnit = {
      id: 'FU-061',
      description: 'Test FU',
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const result = await storeFeatureUnit(featureUnit);
    
    expect(result.entity_id).toBeDefined();
    expect(mcpClient.submit_feature_unit).toHaveBeenCalledWith(featureUnit);
  });
  
  it('should fallback to local memory when Neotoma unavailable', async () => {
    mockNeotomaAvailable(false);
    
    const featureUnit = {
      id: 'FU-061',
      description: 'Test FU',
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const result = await storeFeatureUnit(featureUnit);
    
    expect(writeToLocalMemory).toHaveBeenCalledWith('feature_units', 'FU-061', featureUnit);
  });
});
```

### Integration Tests

```typescript
// test/neotoma_integration.test.ts
describe('Neotoma Integration', () => {
  it('should store and retrieve Feature Unit', async () => {
    const featureUnit = {
      id: 'FU-TEST-001',
      description: 'Test Feature Unit',
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Store
    await storeFeatureUnit(featureUnit);
    
    // Retrieve
    const retrieved = await getFeatureUnit('FU-TEST-001');
    
    expect(retrieved).toBeDefined();
    expect(retrieved.id).toBe('FU-TEST-001');
    expect(retrieved.description).toBe('Test Feature Unit');
  });
  
  it('should generate timeline for Feature Unit', async () => {
    const featureUnit = {
      id: 'FU-TEST-002',
      description: 'Test Feature Unit',
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Store
    await storeFeatureUnit(featureUnit);
    
    // Update status
    featureUnit.status = 'completed';
    featureUnit.updated_at = new Date().toISOString();
    await storeFeatureUnit(featureUnit);
    
    // Query timeline
    const timeline = await getFeatureUnitTimeline('FU-TEST-002');
    
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.some(e => e.description.includes('created'))).toBe(true);
    expect(timeline.some(e => e.description.includes('completed'))).toBe(true);
  });
});
```

## Performance Considerations

### Batch Operations

```typescript
// Good (batch queries)
const featureUnitIds = ['FU-061', 'FU-062', 'FU-063'];
const result = await mcpClient.query_codebase_entities({
  entity_type: 'feature_unit',
  filters: {
    id: { in: featureUnitIds }
  }
});

// Bad (individual queries)
const featureUnits = [];
for (const id of featureUnitIds) {
  const fu = await getFeatureUnit(id);
  featureUnits.push(fu);
}
```

### Caching

```typescript
// Cache frequently accessed entities
const entityCache = new Map<string, any>();

async function getCachedFeatureUnit(id: string) {
  if (entityCache.has(id)) {
    return entityCache.get(id);
  }
  
  const featureUnit = await getFeatureUnit(id);
  
  if (featureUnit) {
    entityCache.set(id, featureUnit);
  }
  
  return featureUnit;
}
```

## Multi-Agent Patterns

**Agent Skills Reference**: [multi-agent-patterns](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering/blob/main/skills/multi-agent-patterns) skill

### Overview

Neotoma's unified memory system enables multiple agents to collaborate effectively through shared memory access. Multiple agents can simultaneously read and write to the same memory, with entity resolution ensuring consistency and timeline queries providing coordination context.

This section implements Agent Skills multi-agent patterns: orchestrator (supervisor delegates to specialists), peer-to-peer (agents collaborate as equals), and hierarchical (multi-tier organization).

### Shared Memory Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Agent A    │  │  Agent B    │  │  Agent C    │
│  (Cursor)   │  │ (ChatGPT)   │  │  (Claude)   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       │   MCP Protocol │   MCP Protocol │
       │                │                │
       └────────────────┼────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │ Neotoma MCP      │
              │ Unified Memory   │
              └──────────────────┘
```

### Pattern 1: Orchestrator Pattern

**Description**: A supervisor agent delegates tasks to specialist agents, all using Neotoma for coordination.

**Implementation**:

```typescript
// Orchestrator agent creates tasks
async function orchestratorCreateTask(taskDescription: string) {
  // Orchestrator records decision
  const decision = await mcpClient.submit_agent_decision({
    decision: `Delegate task: ${taskDescription}`,
    rationale: 'Task requires specialist expertise',
    context: {
      task: taskDescription,
      orchestrator: 'main-agent',
      specialists_needed: ['specialist-a', 'specialist-b']
    },
    decision_type: 'process',
    timestamp: new Date().toISOString(),
    agent_id: 'orchestrator-agent'
  });
  
  // Orchestrator creates Feature Unit for task
  await mcpClient.submit_feature_unit({
    id: generateFeatureUnitId(),
    description: taskDescription,
    status: 'planning',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  
  return decision;
}

// Specialist agent picks up task
async function specialistPickUpTask(agentId: string) {
  // Query for tasks needing work
  const tasks = await mcpClient.query_codebase_entities({
    entity_type: 'feature_unit',
    filters: { status: 'planning' },
    limit: 5
  });
  
  // Pick first available task
  const task = tasks.entities[0];
  
  // Record that specialist is starting work
  await mcpClient.submit_feature_unit({
    ...task.snapshot,
    status: 'in_progress',
    updated_at: new Date().toISOString()
  });
  
  // Start session
  const session = await mcpClient.submit_agent_session({
    session_id: generateSessionId(),
    actions: [{
      type: 'start_task',
      result: 'success',
      details: { task_id: task.snapshot.id }
    }],
    started_at: new Date().toISOString()
  });
  
  return { task, session };
}

// Specialist completes and reports back
async function specialistCompleteTask(taskId: string, sessionId: string) {
  // Update task status
  await mcpClient.submit_feature_unit({
    id: taskId,
    status: 'completed',
    updated_at: new Date().toISOString()
  });
  
  // Record session completion
  await mcpClient.submit_agent_session({
    session_id: sessionId,
    actions: [
      { type: 'start_task', result: 'success' },
      { type: 'complete_task', result: 'success' }
    ],
    outcomes: [
      { type: 'feature_unit_completed', id: taskId }
    ],
    ended_at: new Date().toISOString()
  });
  
  console.log(`Specialist completed task ${taskId}`);
}

// Orchestrator monitors progress
async function orchestratorMonitorProgress() {
  // Query all in-progress tasks
  const inProgress = await mcpClient.query_codebase_entities({
    entity_type: 'feature_unit',
    filters: { status: 'in_progress' }
  });
  
  console.log(`${inProgress.entities.length} tasks in progress`);
  
  // Query recent sessions to see which specialists are active
  const sessions = await mcpClient.query_agent_history({
    limit: 10,
    order_by: 'started_at',
    order: 'desc'
  });
  
  return {
    in_progress: inProgress.entities,
    active_sessions: sessions.sessions
  };
}
```

**Use Case**: Complex feature development with specialized agents (frontend specialist, backend specialist, testing specialist).

### Pattern 2: Peer-to-Peer Pattern

**Description**: Agents collaborate as equals, sharing information through Neotoma without a central coordinator.

**Implementation**:

```typescript
// Agent A shares discovery
async function agentShareDiscovery(agentId: string, discovery: string) {
  await mcpClient.submit_agent_decision({
    decision: discovery,
    rationale: 'Discovered during investigation',
    context: {
      agent_id: agentId,
      shared_with: 'all-agents',
      discovery_type: 'architectural_insight'
    },
    decision_type: 'technical',
    timestamp: new Date().toISOString(),
    agent_id: agentId
  });
  
  console.log(`Agent ${agentId} shared discovery: ${discovery}`);
}

// Agent B queries discoveries from peers
async function agentQueryPeerDiscoveries() {
  const discoveries = await mcpClient.query_codebase_entities({
    entity_type: 'agent_decision',
    filters: {
      'context.shared_with': 'all-agents'
    },
    order_by: 'timestamp',
    order: 'desc',
    limit: 10
  });
  
  console.log(`Found ${discoveries.entities.length} peer discoveries`);
  
  return discoveries.entities.map(e => ({
    decision: e.snapshot.decision,
    agent: e.snapshot.agent_id,
    timestamp: e.snapshot.timestamp
  }));
}

// Agent C builds on peer discovery
async function agentBuildOnPeerDiscovery(priorDecisionId: string, agentId: string) {
  // Query the prior decision
  const priorDecisions = await mcpClient.query_codebase_entities({
    entity_type: 'agent_decision',
    filters: { id: priorDecisionId },
    limit: 1
  });
  
  const priorDecision = priorDecisions.entities[0].snapshot;
  
  // Build on it with new decision
  await mcpClient.submit_agent_decision({
    decision: `Building on: ${priorDecision.decision}`,
    rationale: 'Extending peer discovery with implementation details',
    context: {
      agent_id: agentId,
      builds_on: priorDecisionId,
      prior_agent: priorDecision.agent_id
    },
    decision_type: 'technical',
    timestamp: new Date().toISOString(),
    agent_id: agentId
  });
  
  console.log(`Agent ${agentId} built on discovery from ${priorDecision.agent_id}`);
}
```

**Use Case**: Research tasks where multiple agents explore different approaches and share findings.

### Pattern 3: Hierarchical Pattern

**Description**: Multi-tier agent organization with supervisors, managers, and workers.

**Implementation**:

```typescript
// Supervisor agent creates release plan
async function supervisorCreateReleasePlan(releaseId: string, featureUnits: string[]) {
  await mcpClient.submit_payload({
  capability_id: "neotoma:store_release:v1",
  body: {
    id: releaseId,
    version: releaseId.replace('v', ''),
    feature_units: featureUnits,
    status: 'planning',
    acceptance_criteria: [
      'All Feature Units completed',
      'All validations passing',
      'Integration tests passing'
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  
  // Record decision
  await mcpClient.submit_agent_decision({
    decision: `Create release ${releaseId} with ${featureUnits.length} Feature Units`,
    rationale: 'Release scoped based on dependencies and priority',
    context: {
      role: 'supervisor',
      release_id: releaseId,
      delegation: 'managers will assign to workers'
    },
    decision_type: 'strategic',
    timestamp: new Date().toISOString(),
    agent_id: 'supervisor-agent'
  });
  
  console.log(`Supervisor created release plan: ${releaseId}`);
}

// Manager agent assigns Feature Units to workers
async function managerAssignFeatureUnits(managerId: string) {
  // Query unassigned Feature Units
  const unassigned = await mcpClient.query_codebase_entities({
    entity_type: 'feature_unit',
    filters: { status: 'planning' },
    limit: 5
  });
  
  // Assign to workers (record decisions)
  for (const fu of unassigned.entities) {
    await mcpClient.submit_agent_decision({
      decision: `Assign ${fu.snapshot.id} to worker`,
      rationale: 'Worker capacity available',
      context: {
        role: 'manager',
        manager_id: managerId,
        feature_unit: fu.snapshot.id,
        assigned_to: 'worker-1'
      },
      decision_type: 'process',
      timestamp: new Date().toISOString(),
      agent_id: managerId
    });
  }
  
  console.log(`Manager ${managerId} assigned ${unassigned.entities.length} tasks`);
}

// Worker agent executes Feature Unit
async function workerExecuteFeatureUnit(workerId: string, featureUnitId: string) {
  // Update status to in_progress
  await mcpClient.submit_feature_unit({
    id: featureUnitId,
    status: 'in_progress',
    updated_at: new Date().toISOString()
  });
  
  // Execute work (placeholder)
  const result = await executeWork(featureUnitId);
  
  // Update status to completed
  await mcpClient.submit_feature_unit({
    id: featureUnitId,
    status: 'completed',
    updated_at: new Date().toISOString()
  });
  
  // Report completion
  await mcpClient.submit_agent_session({
    session_id: generateSessionId(),
    actions: [
      { type: 'execute_feature_unit', result: 'success' }
    ],
    outcomes: [
      { type: 'feature_unit_completed', id: featureUnitId }
    ],
    started_at: result.started_at,
    ended_at: new Date().toISOString()
  });
  
  console.log(`Worker ${workerId} completed ${featureUnitId}`);
}

// Supervisor monitors overall progress
async function supervisorMonitorRelease(releaseId: string) {
  // Get release
  const release = await mcpClient.query_codebase_entities({
    entity_type: 'release',
    filters: { id: releaseId },
    limit: 1
  });
  
  const releaseData = release.entities[0].snapshot;
  
  // Check status of all Feature Units
  const featureUnitStatuses = await Promise.all(
    releaseData.feature_units.map(async (fuId: string) => {
      const fu = await getFeatureUnit(fuId);
      return { id: fuId, status: fu?.status };
    })
  );
  
  const completed = featureUnitStatuses.filter(fu => fu.status === 'completed').length;
  const total = featureUnitStatuses.length;
  
  console.log(`Release ${releaseId}: ${completed}/${total} Feature Units completed`);
  
  return {
    release_id: releaseId,
    progress: {
      completed,
      total,
      percentage: (completed / total) * 100
    },
    feature_units: featureUnitStatuses
  };
}
```

**Use Case**: Large release development with supervisor (planning), managers (coordination), workers (execution).

### Pattern 4: Collaborative Problem-Solving

**Description**: Multiple agents work on the same problem, contributing observations and decisions.

**Implementation**:

```typescript
// Multiple agents analyze the same Feature Unit
async function agentContributeAnalysis(
  agentId: string,
  featureUnitId: string,
  analysis: string
) {
  await mcpClient.submit_agent_decision({
    decision: analysis,
    rationale: 'Analysis contribution from agent',
    context: {
      agent_id: agentId,
      feature_unit: featureUnitId,
      contribution_type: 'analysis'
    },
    decision_type: 'technical',
    timestamp: new Date().toISOString(),
    agent_id: agentId
  });
}

// Aggregate all agent analyses
async function aggregateAgentAnalyses(featureUnitId: string) {
  const analyses = await mcpClient.query_codebase_entities({
    entity_type: 'agent_decision',
    filters: {
      'context.feature_unit': featureUnitId,
      'context.contribution_type': 'analysis'
    },
    order_by: 'timestamp',
    order: 'asc'
  });
  
  return {
    feature_unit_id: featureUnitId,
    total_analyses: analyses.entities.length,
    agents_contributed: new Set(analyses.entities.map(e => e.snapshot.agent_id)).size,
    analyses: analyses.entities.map(e => ({
      agent: e.snapshot.agent_id,
      analysis: e.snapshot.decision,
      timestamp: e.snapshot.timestamp
    }))
  };
}
```

**Use Case**: Complex problem requiring multiple perspectives or expertise areas.

### Agent Coordination Patterns

#### Pattern: Work Queue

Agents pull tasks from shared queue:

```typescript
async function pullNextTask(agentId: string) {
  // Query available tasks
  const tasks = await mcpClient.query_codebase_entities({
    entity_type: 'feature_unit',
    filters: { status: 'planning' },
    limit: 1
  });
  
  if (tasks.entities.length === 0) {
    return null;
  }
  
  const task = tasks.entities[0];
  
  // Claim task by updating status
  await mcpClient.submit_feature_unit({
    ...task.snapshot,
    status: 'in_progress',
    updated_at: new Date().toISOString()
  });
  
  // Record session start
  await mcpClient.submit_agent_session({
    session_id: generateSessionId(),
    actions: [{
      type: 'claim_task',
      result: 'success',
      details: { task_id: task.snapshot.id, agent_id: agentId }
    }],
    started_at: new Date().toISOString()
  });
  
  return task.snapshot;
}
```

#### Pattern: Consensus Building

Multiple agents vote or provide input on decisions:

```typescript
async function agentVoteOnDecision(
  agentId: string,
  proposedDecision: string,
  vote: 'approve' | 'reject' | 'abstain',
  reason: string
) {
  await mcpClient.submit_agent_decision({
    decision: `Vote: ${vote} on "${proposedDecision}"`,
    rationale: reason,
    context: {
      agent_id: agentId,
      vote_type: vote,
      proposed_decision: proposedDecision
    },
    decision_type: 'process',
    timestamp: new Date().toISOString(),
    agent_id: agentId
  });
}

async function tallyVotes(proposedDecision: string) {
  const votes = await mcpClient.query_codebase_entities({
    entity_type: 'agent_decision',
    filters: {
      'context.proposed_decision': proposedDecision
    }
  });
  
  const tally = {
    approve: votes.entities.filter(e => e.snapshot.context?.vote_type === 'approve').length,
    reject: votes.entities.filter(e => e.snapshot.context?.vote_type === 'reject').length,
    abstain: votes.entities.filter(e => e.snapshot.context?.vote_type === 'abstain').length
  };
  
  return {
    proposed_decision: proposedDecision,
    votes: tally,
    total_votes: tally.approve + tally.reject + tally.abstain,
    decision: tally.approve > tally.reject ? 'approved' : 'rejected'
  };
}
```

#### Pattern: Status Broadcasting

Agents broadcast status for coordination:

```typescript
async function broadcastAgentStatus(agentId: string, status: string, details: any) {
  await mcpClient.submit_agent_decision({
    decision: `Agent status: ${status}`,
    rationale: 'Status broadcast for coordination',
    context: {
      agent_id: agentId,
      status,
      broadcast_type: 'status_update',
      ...details
    },
    decision_type: 'process',
    timestamp: new Date().toISOString(),
    agent_id: agentId
  });
}

async function queryAgentStatuses() {
  const statuses = await mcpClient.query_codebase_entities({
    entity_type: 'agent_decision',
    filters: {
      'context.broadcast_type': 'status_update'
    },
    order_by: 'timestamp',
    order: 'desc',
    limit: 20
  });
  
  return statuses.entities.map(e => ({
    agent: e.snapshot.agent_id,
    status: e.snapshot.context?.status,
    timestamp: e.snapshot.timestamp
  }));
}
```

### Multi-Agent Best Practices

**DO:**
- ✅ Use entity resolution for coordination (same entity across agents)
- ✅ Query before updating to avoid conflicts
- ✅ Record decisions for transparency
- ✅ Use agent_id consistently
- ✅ Leverage timeline queries for coordination context
- ✅ Use checkpoints for handoffs between agents

**DON'T:**
- ❌ Update entities without querying first
- ❌ Assume exclusive access to entities
- ❌ Skip recording agent decisions
- ❌ Use inconsistent agent IDs
- ❌ Ignore context from other agents

### Conflict Resolution

When multiple agents update the same entity:

```typescript
async function updateWithConflictDetection(entityType: string, entityId: string, updates: any) {
  // Query current state
  const current = await mcpClient.query_codebase_entities({
    entity_type: entityType,
    filters: { id: entityId },
    limit: 1
  });
  
  if (current.entities.length === 0) {
    throw new Error(`Entity ${entityId} not found`);
  }
  
  const currentSnapshot = current.entities[0].snapshot;
  
  // Check if entity was updated since we last saw it
  if (currentSnapshot.updated_at !== updates.expected_updated_at) {
    console.warn('Conflict detected: entity was updated by another agent');
    
    // Query who updated it
    const timeline = await mcpClient.list_timeline_events({
      entity_id: entityId,
      start_date: updates.expected_updated_at.split('T')[0],
      end_date: new Date().toISOString().split('T')[0]
    });
    
    console.log('Recent updates:', timeline.events);
    
    // Decision: merge or abort
    // For now, proceed with update (last write wins)
  }
  
  // Submit update
  await mcpClient.submit_feature_unit({
    ...currentSnapshot,
    ...updates,
    updated_at: new Date().toISOString()
  });
}
```

## Evaluation Patterns

**Agent Skills Reference**: [evaluation](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering/blob/main/skills/evaluation) and [advanced-evaluation](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering/blob/main/skills/advanced-evaluation) skills

### Overview

Neotoma enables comprehensive evaluation of agent performance through structured tracking of:
- **Agent Performance Metrics**: Task completion rates, validation pass rates, session outcomes
- **Quality Scoring**: Validation results, test coverage, compliance checks
- **Benchmark Tasks**: Feature Unit completion, release readiness, acceptance criteria
- **Historical Analysis**: Agent effectiveness over time, improvement tracking
- **LLM-as-Judge Patterns**: Agent decisions evaluated against quality criteria

This section implements Agent Skills evaluation principles: test frameworks, performance metrics, quality measurement, and LLM-as-judge techniques (direct scoring, pairwise comparison, rubric generation, bias mitigation).

### Agent Performance Metrics

#### Task Completion Rate

Track how many tasks agents complete successfully:

```typescript
async function calculateTaskCompletionRate(agentId: string, startDate: Date, endDate: Date) {
  // Query all sessions for agent
  const sessions = await mcpClient.query_codebase_entities({
    entity_type: 'agent_session',
    filters: {
      'actions.agent_id': agentId,
      started_at: {
        gte: startDate.toISOString(),
        lte: endDate.toISOString()
      }
    }
  });
  
  // Calculate completion rate
  const totalTasks = sessions.entities.reduce((sum, s) => sum + s.snapshot.actions.length, 0);
  const successfulTasks = sessions.entities.reduce((sum, s) => {
    return sum + s.snapshot.actions.filter(a => a.result === 'success').length;
  }, 0);
  
  return {
    total_tasks: totalTasks,
    successful_tasks: successfulTasks,
    completion_rate: totalTasks > 0 ? (successfulTasks / totalTasks) * 100 : 0
  };
}
```

#### Validation Pass Rate

Track validation results over time:

```typescript
async function calculateValidationPassRate(target: string, startDate: Date, endDate: Date) {
  // Query validation results
  const validations = await mcpClient.query_codebase_entities({
    entity_type: 'validation_result',
    filters: {
      target: target,
      timestamp: {
        gte: startDate.toISOString(),
        lte: endDate.toISOString()
      }
    }
  });
  
  // Calculate pass rate
  const total = validations.entities.length;
  const passed = validations.entities.filter(v => v.snapshot.status === 'passed').length;
  const failed = validations.entities.filter(v => v.snapshot.status === 'failed').length;
  
  return {
    total_validations: total,
    passed: passed,
    failed: failed,
    pass_rate: total > 0 ? (passed / total) * 100 : 0,
    fail_rate: total > 0 ? (failed / total) * 100 : 0
  };
}
```

#### Session Success Metrics

Track session-level outcomes:

```typescript
async function calculateSessionMetrics(startDate: Date, endDate: Date) {
  const sessions = await mcpClient.query_codebase_entities({
    entity_type: 'agent_session',
    filters: {
      started_at: {
        gte: startDate.toISOString(),
        lte: endDate.toISOString()
      }
    }
  });
  
  const metrics = {
    total_sessions: sessions.entities.length,
    sessions_with_outcomes: sessions.entities.filter(s => 
      s.snapshot.outcomes && s.snapshot.outcomes.length > 0
    ).length,
    average_duration: sessions.entities.reduce((sum, s) => 
      sum + (s.snapshot.duration || 0), 0
    ) / sessions.entities.length,
    average_actions_per_session: sessions.entities.reduce((sum, s) => 
      sum + s.snapshot.actions.length, 0
    ) / sessions.entities.length,
    checkpoint_usage_rate: sessions.entities.filter(s => 
      s.snapshot.checkpoints && s.snapshot.checkpoints.length > 0
    ).length / sessions.entities.length
  };
  
  return metrics;
}
```

### Quality Scoring

#### Feature Unit Quality Score

Score Feature Units based on validation results:

```typescript
async function calculateFeatureUnitQualityScore(featureUnitId: string) {
  // Get Feature Unit
  const featureUnit = await getFeatureUnit(featureUnitId);
  
  // Get all validation results
  const validations = await mcpClient.query_codebase_entities({
    entity_type: 'validation_result',
    filters: { target: featureUnitId }
  });
  
  // Calculate quality score
  const validationTypes = ['lint', 'test', 'security', 'compliance'];
  const scores = validationTypes.map(type => {
    const typeValidations = validations.entities.filter(v => 
      v.snapshot.validation_type === type
    );
    
    if (typeValidations.length === 0) return null;
    
    const latest = typeValidations.sort((a, b) => 
      new Date(b.snapshot.timestamp).getTime() - new Date(a.snapshot.timestamp).getTime()
    )[0];
    
    return {
      type,
      status: latest.snapshot.status,
      score: latest.snapshot.status === 'passed' ? 100 : 
             latest.snapshot.status === 'warning' ? 75 : 0
    };
  }).filter(s => s !== null);
  
  const averageScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  
  return {
    feature_unit_id: featureUnitId,
    quality_score: averageScore,
    validation_scores: scores,
    status: featureUnit?.status
  };
}
```

#### Release Readiness Score

Score release readiness based on acceptance criteria and Feature Unit quality:

```typescript
async function calculateReleaseReadinessScore(releaseId: string) {
  // Get release
  const release = await mcpClient.query_codebase_entities({
    entity_type: 'release',
    filters: { id: releaseId },
    limit: 1
  });
  
  if (release.entities.length === 0) return null;
  
  const releaseData = release.entities[0].snapshot;
  
  // Get Feature Unit quality scores
  const featureUnitScores = await Promise.all(
    releaseData.feature_units.map(async (fuId: string) => {
      return await calculateFeatureUnitQualityScore(fuId);
    })
  );
  
  // Calculate readiness score
  const avgFeatureUnitScore = featureUnitScores.reduce((sum, s) => 
    sum + (s?.quality_score || 0), 0
  ) / featureUnitScores.length;
  
  // Check acceptance criteria validation
  const acceptanceValidations = await mcpClient.query_codebase_entities({
    entity_type: 'validation_result',
    filters: {
      target: releaseId,
      validation_type: 'acceptance_criteria'
    }
  });
  
  const acceptanceScore = acceptanceValidations.entities.length > 0 ?
    acceptanceValidations.entities.filter(v => v.snapshot.status === 'passed').length /
    acceptanceValidations.entities.length * 100 : 0;
  
  return {
    release_id: releaseId,
    readiness_score: (avgFeatureUnitScore * 0.7) + (acceptanceScore * 0.3),
    feature_unit_scores: featureUnitScores,
    acceptance_criteria_score: acceptanceScore,
    status: releaseData.status
  };
}
```

### Benchmark Tasks

#### Feature Unit Completion Benchmark

Track Feature Unit completion time and quality:

```typescript
async function benchmarkFeatureUnitCompletion(featureUnitId: string) {
  // Get Feature Unit timeline
  const timeline = await mcpClient.list_timeline_events({
    entity_id: featureUnitId
  });
  
  // Find key events
  const created = timeline.events.find(e => e.event_type === 'created');
  const completed = timeline.events.find(e => 
    e.description.includes('completed') || e.description.includes('deployed')
  );
  
  if (!created || !completed) return null;
  
  // Calculate duration
  const duration = new Date(completed.timestamp).getTime() - 
                   new Date(created.timestamp).getTime();
  const durationDays = duration / (1000 * 60 * 60 * 24);
  
  // Get quality score
  const qualityScore = await calculateFeatureUnitQualityScore(featureUnitId);
  
  return {
    feature_unit_id: featureUnitId,
    duration_days: durationDays,
    quality_score: qualityScore?.quality_score || 0,
    status: completed.description,
    benchmark: {
      fast: durationDays < 7,
      high_quality: (qualityScore?.quality_score || 0) >= 90,
      on_time: durationDays <= 14
    }
  };
}
```

#### Agent Decision Quality Benchmark

Evaluate agent decision quality over time:

```typescript
async function benchmarkAgentDecisionQuality(agentId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Query agent decisions
  const decisions = await mcpClient.query_codebase_entities({
    entity_type: 'agent_decision',
    filters: {
      agent_id: agentId,
      timestamp: {
        gte: startDate.toISOString()
      }
    },
    order_by: 'timestamp',
    order: 'desc'
  });
  
  // Analyze decision quality
  const metrics = {
    total_decisions: decisions.entities.length,
    architectural_decisions: decisions.entities.filter(d => 
      d.snapshot.decision_type === 'architectural'
    ).length,
    technical_decisions: decisions.entities.filter(d => 
      d.snapshot.decision_type === 'technical'
    ).length,
    decisions_with_rationale: decisions.entities.filter(d => 
      d.snapshot.rationale && d.snapshot.rationale.length > 50
    ).length,
    decisions_with_context: decisions.entities.filter(d => 
      d.snapshot.context && Object.keys(d.snapshot.context).length > 0
    ).length
  };
  
  // Calculate quality score
  const qualityScore = (
    (metrics.decisions_with_rationale / metrics.total_decisions) * 0.5 +
    (metrics.decisions_with_context / metrics.total_decisions) * 0.5
  ) * 100;
  
  return {
    agent_id: agentId,
    period_days: days,
    metrics,
    quality_score: qualityScore
  };
}
```

### Historical Analysis

#### Agent Effectiveness Over Time

Track agent performance trends:

```typescript
async function analyzeAgentEffectivenessOverTime(agentId: string, months: number = 3) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  // Get monthly metrics
  const monthlyMetrics = [];
  
  for (let i = 0; i < months; i++) {
    const monthStart = new Date(startDate);
    monthStart.setMonth(monthStart.getMonth() + i);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    
    const taskMetrics = await calculateTaskCompletionRate(agentId, monthStart, monthEnd);
    const sessionMetrics = await calculateSessionMetrics(monthStart, monthEnd);
    
    monthlyMetrics.push({
      month: monthStart.toISOString().substring(0, 7),
      task_completion_rate: taskMetrics.completion_rate,
      average_session_duration: sessionMetrics.average_duration,
      actions_per_session: sessionMetrics.average_actions_per_session
    });
  }
  
  // Calculate trends
  const completionTrend = monthlyMetrics.map(m => m.task_completion_rate);
  const improving = completionTrend[completionTrend.length - 1] > completionTrend[0];
  
  return {
    agent_id: agentId,
    period_months: months,
    monthly_metrics: monthlyMetrics,
    trend: {
      improving,
      completion_rate_change: completionTrend[completionTrend.length - 1] - completionTrend[0]
    }
  };
}
```

### LLM-as-Judge Patterns

#### Decision Evaluation

Use validation results to evaluate agent decisions:

```typescript
async function evaluateAgentDecision(decisionId: string) {
  // Get decision
  const decisions = await mcpClient.query_codebase_entities({
    entity_type: 'agent_decision',
    filters: { id: decisionId },
    limit: 1
  });
  
  if (decisions.entities.length === 0) return null;
  
  const decision = decisions.entities[0].snapshot;
  
  // Get related validation results (LLM-as-judge)
  const validations = await mcpClient.query_codebase_entities({
    entity_type: 'validation_result',
    filters: {
      'details.decision_id': decisionId,
      validation_type: 'custom'
    }
  });
  
  // Evaluate decision quality
  const evaluation = {
    decision_id: decisionId,
    decision: decision.decision,
    has_rationale: decision.rationale && decision.rationale.length > 50,
    has_context: decision.context && Object.keys(decision.context).length > 0,
    has_alternatives: decision.alternatives && decision.alternatives.length > 0,
    llm_judge_score: validations.entities.length > 0 ?
      validations.entities.filter(v => v.snapshot.status === 'passed').length /
      validations.entities.length * 100 : null,
    quality_score: (
      (decision.rationale && decision.rationale.length > 50 ? 1 : 0) * 0.3 +
      (decision.context && Object.keys(decision.context).length > 0 ? 1 : 0) * 0.3 +
      (decision.alternatives && decision.alternatives.length > 0 ? 1 : 0) * 0.4
    ) * 100
  };
  
  return evaluation;
}
```

#### Feature Unit Quality Evaluation

Evaluate Feature Unit quality using multiple criteria:

```typescript
async function evaluateFeatureUnitQuality(featureUnitId: string) {
  // Get Feature Unit
  const featureUnit = await getFeatureUnit(featureUnitId);
  
  // Get all related data
  const [validations, decisions, timeline] = await Promise.all([
    mcpClient.query_codebase_entities({
      entity_type: 'validation_result',
      filters: { target: featureUnitId }
    }),
    mcpClient.query_codebase_entities({
      entity_type: 'agent_decision',
      filters: { 'context.feature_unit': featureUnitId }
    }),
    mcpClient.query_entity_timeline({
      entity_id: featureUnitId
    })
  ]);
  
  // Calculate quality metrics
  const validationScore = validations.entities.length > 0 ?
    validations.entities.filter(v => v.snapshot.status === 'passed').length /
    validations.entities.length * 100 : 0;
  
  const decisionQuality = decisions.entities.length > 0 ?
    decisions.entities.filter(d => 
      d.snapshot.rationale && d.snapshot.rationale.length > 50
    ).length / decisions.entities.length * 100 : 0;
  
  const timelineCompleteness = timeline.events.length >= 3 ? 100 : 
    (timeline.events.length / 3) * 100;
  
  // Overall quality score
  const overallScore = (
    validationScore * 0.5 +
    decisionQuality * 0.3 +
    timelineCompleteness * 0.2
  );
  
  return {
    feature_unit_id: featureUnitId,
    overall_quality_score: overallScore,
    validation_score: validationScore,
    decision_quality_score: decisionQuality,
    timeline_completeness_score: timelineCompleteness,
    status: featureUnit?.status
  };
}
```

### Evaluation Dashboard Queries

#### Performance Dashboard

Query all performance metrics for dashboard:

```typescript
async function getPerformanceDashboard(startDate: Date, endDate: Date) {
  const [taskMetrics, sessionMetrics, validationMetrics] = await Promise.all([
    calculateTaskCompletionRate('all', startDate, endDate),
    calculateSessionMetrics(startDate, endDate),
    calculateValidationPassRate('all', startDate, endDate)
  ]);
  
  return {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    task_completion: taskMetrics,
    session_metrics: sessionMetrics,
    validation_metrics: validationMetrics,
    overall_health: (
      taskMetrics.completion_rate * 0.4 +
      validationMetrics.pass_rate * 0.4 +
      (sessionMetrics.checkpoint_usage_rate * 100) * 0.2
    )
  };
}
```

### Advanced Evaluation Patterns

#### Pairwise Comparison

**Purpose**: Compare two outputs to determine which is better

**Implementation**:

```typescript
async function pairwiseCompareFeatureUnits(fuId1: string, fuId2: string, criteria: string[]) {
  // Get both Feature Units with full context
  const [fu1, fu2] = await Promise.all([
    loadWorkContext(fuId1),
    loadWorkContext(fuId2)
  ]);
  
  // Compare on each criterion
  const comparisons = criteria.map(criterion => {
    let score1 = 0, score2 = 0;
    
    switch (criterion) {
      case 'test_coverage':
        score1 = fu1.validations.filter(v => 
          v.type === 'test' && v.status === 'passed'
        ).length;
        score2 = fu2.validations.filter(v => 
          v.type === 'test' && v.status === 'passed'
        ).length;
        break;
        
      case 'decision_quality':
        score1 = fu1.decisions.filter(d => 
          d.rationale && d.rationale.length > 50
        ).length;
        score2 = fu2.decisions.filter(d => 
          d.rationale && d.rationale.length > 50
        ).length;
        break;
        
      case 'completion_speed':
        score1 = calculateCompletionSpeed(fu1.timeline);
        score2 = calculateCompletionSpeed(fu2.timeline);
        break;
    }
    
    return {
      criterion,
      fu1_score: score1,
      fu2_score: score2,
      winner: score1 > score2 ? fuId1 : score2 > score1 ? fuId2 : 'tie'
    };
  });
  
  // Overall winner (majority vote across criteria)
  const fu1Wins = comparisons.filter(c => c.winner === fuId1).length;
  const fu2Wins = comparisons.filter(c => c.winner === fuId2).length;
  
  return {
    fu1: fuId1,
    fu2: fuId2,
    criteria: comparisons,
    overall_winner: fu1Wins > fu2Wins ? fuId1 : fu2Wins > fu1Wins ? fuId2 : 'tie',
    confidence: Math.abs(fu1Wins - fu2Wins) / criteria.length
  };
}

// Mitigate position bias with swapped comparison
async function pairwiseCompareWithBiasMitigation(fuId1: string, fuId2: string, criteria: string[]) {
  // Run comparison in both orders
  const comparison1 = await pairwiseCompareFeatureUnits(fuId1, fuId2, criteria);
  const comparison2 = await pairwiseCompareFeatureUnits(fuId2, fuId1, criteria);
  
  // If results differ, position bias detected
  if (comparison1.overall_winner !== comparison2.overall_winner) {
    console.warn('Position bias detected in pairwise comparison');
    return { overall_winner: 'tie', position_bias_detected: true };
  }
  
  return { ...comparison1, position_bias_detected: false };
}
```

#### Rubric Generation

**Purpose**: Generate domain-specific evaluation rubrics

**Implementation**:

```typescript
interface EvaluationRubric {
  name: string;
  criteria: Array<{
    name: string;
    weight: number;
    levels: Array<{
      score: number;
      description: string;
      indicators: string[];
    }>;
  }>;
}

async function generateFeatureUnitRubric(): Promise<EvaluationRubric> {
  // Analyze historical Feature Units to generate rubric
  const historicalFUs = await mcpClient.query_codebase_entities({
    entity_type: 'feature_unit',
    filters: { status: 'completed' },
    limit: 20
  });
  
  // Analyze patterns
  const avgValidations = historicalFUs.entities.reduce((sum, fu) => {
    // Query validations for this FU
    return sum + 1; // Placeholder
  }, 0) / historicalFUs.entities.length;
  
  // Generate rubric
  return {
    name: 'Feature Unit Quality Rubric',
    criteria: [
      {
        name: 'Test Coverage',
        weight: 0.3,
        levels: [
          {
            score: 100,
            description: 'Comprehensive test coverage',
            indicators: ['All tests passing', 'Unit + integration tests', 'Edge cases covered']
          },
          {
            score: 75,
            description: 'Good test coverage',
            indicators: ['Most tests passing', 'Unit tests present', 'Core functionality tested']
          },
          {
            score: 50,
            description: 'Basic test coverage',
            indicators: ['Some tests passing', 'Basic unit tests only']
          },
          {
            score: 0,
            description: 'No test coverage',
            indicators: ['No tests', 'Tests failing']
          }
        ]
      },
      {
        name: 'Decision Quality',
        weight: 0.3,
        levels: [
          {
            score: 100,
            description: 'Excellent decision documentation',
            indicators: ['Rationale >100 chars', 'Context provided', 'Alternatives considered']
          },
          {
            score: 75,
            description: 'Good decision documentation',
            indicators: ['Rationale >50 chars', 'Context provided']
          },
          {
            score: 50,
            description: 'Basic decision documentation',
            indicators: ['Rationale present', 'Minimal context']
          },
          {
            score: 0,
            description: 'No decision documentation',
            indicators: ['No decisions recorded']
          }
        ]
      },
      {
        name: 'Timeline Completeness',
        weight: 0.2,
        levels: [
          {
            score: 100,
            description: 'Complete timeline',
            indicators: ['Created event', 'Status updates', 'Completion event', '5+ events']
          },
          {
            score: 75,
            description: 'Good timeline',
            indicators: ['Created event', 'Completion event', '3+ events']
          },
          {
            score: 50,
            description: 'Basic timeline',
            indicators: ['Created event', 'Completion event']
          },
          {
            score: 0,
            description: 'Incomplete timeline',
            indicators: ['Missing key events']
          }
        ]
      },
      {
        name: 'Validation Completeness',
        weight: 0.2,
        levels: [
          {
            score: 100,
            description: 'All validation types',
            indicators: ['Lint passed', 'Tests passed', 'Security passed', 'Compliance passed']
          },
          {
            score: 75,
            description: 'Core validations',
            indicators: ['Lint passed', 'Tests passed']
          },
          {
            score: 50,
            description: 'Basic validation',
            indicators: ['Tests passed']
          },
          {
            score: 0,
            description: 'No validation',
            indicators: ['No validations run']
          }
        ]
      }
    ]
  };
}

// Apply rubric to Feature Unit
async function evaluateFeatureUnitWithRubric(
  featureUnitId: string,
  rubric: EvaluationRubric
): Promise<{ overall_score: number; criterion_scores: any[] }> {
  // Get Feature Unit with full context
  const context = await loadWorkContext(featureUnitId);
  
  // Evaluate each criterion
  const criterionScores = rubric.criteria.map(criterion => {
    let score = 0;
    
    switch (criterion.name) {
      case 'Test Coverage':
        const testValidations = context.validations.filter(v => v.type === 'test');
        const testsPassed = testValidations.filter(v => v.status === 'passed').length;
        score = testsPassed >= 2 ? 100 : testsPassed === 1 ? 75 : 0;
        break;
        
      case 'Decision Quality':
        const qualityDecisions = context.decisions.filter(d => 
          d.rationale && d.rationale.length > 50
        ).length;
        score = qualityDecisions >= 3 ? 100 : qualityDecisions >= 2 ? 75 : qualityDecisions >= 1 ? 50 : 0;
        break;
        
      case 'Timeline Completeness':
        const eventCount = context.timeline.length;
        score = eventCount >= 5 ? 100 : eventCount >= 3 ? 75 : eventCount >= 2 ? 50 : 0;
        break;
        
      case 'Validation Completeness':
        const validationTypes = new Set(context.validations.map(v => v.type));
        score = validationTypes.size >= 4 ? 100 : validationTypes.size >= 2 ? 75 : validationTypes.size >= 1 ? 50 : 0;
        break;
    }
    
    return {
      criterion: criterion.name,
      weight: criterion.weight,
      score,
      weighted_score: score * criterion.weight
    };
  });
  
  // Calculate overall score
  const overallScore = criterionScores.reduce((sum, c) => sum + c.weighted_score, 0);
  
  return {
    overall_score: overallScore,
    criterion_scores: criterionScores
  };
}
```

#### Bias Mitigation

**Purpose**: Reduce bias in evaluation (position bias, verbosity bias, etc.)

**Implementation**:

```typescript
// Position Bias Mitigation
async function evaluateWithPositionBiasMitigation(
  entities: string[],
  evaluationFunction: (entity: string) => Promise<number>
) {
  // Evaluate in original order
  const scores1 = [];
  for (const entity of entities) {
    scores1.push(await evaluationFunction(entity));
  }
  
  // Evaluate in reversed order
  const reversed = [...entities].reverse();
  const scores2 = [];
  for (const entity of reversed) {
    scores2.push(await evaluationFunction(entity));
  }
  
  // Average scores from both orders
  const finalScores = entities.map((entity, idx) => {
    const reverseIdx = entities.length - 1 - idx;
    return {
      entity,
      score: (scores1[idx] + scores2[reverseIdx]) / 2,
      position_bias: Math.abs(scores1[idx] - scores2[reverseIdx])
    };
  });
  
  return finalScores;
}

// Verbosity Bias Mitigation
async function evaluateWithVerbosityControl(
  decision: any,
  maxRationaleLength: number = 200
) {
  // Truncate verbose rationale for fair comparison
  const truncatedRationale = decision.rationale.substring(0, maxRationaleLength);
  
  // Evaluate based on content, not length
  const contentScore = (
    (truncatedRationale.includes('because') ? 1 : 0) * 0.3 +
    (truncatedRationale.includes('enables') || truncatedRationale.includes('provides') ? 1 : 0) * 0.3 +
    (decision.alternatives && decision.alternatives.length > 0 ? 1 : 0) * 0.4
  ) * 100;
  
  return {
    decision_id: decision.id,
    content_score: contentScore,
    verbosity_controlled: decision.rationale.length > maxRationaleLength
  };
}

// Reference-Based Evaluation
async function evaluateAgainstReference(
  entityId: string,
  referenceId: string,
  criteria: string[]
) {
  // Get entity and reference
  const [entity, reference] = await Promise.all([
    loadWorkContext(entityId),
    loadWorkContext(referenceId)
  ]);
  
  // Compare against reference on each criterion
  const scores = criteria.map(criterion => {
    const entityValue = getCriterionValue(entity, criterion);
    const referenceValue = getCriterionValue(reference, criterion);
    
    // Calculate similarity score
    const similarity = calculateSimilarity(entityValue, referenceValue);
    
    return {
      criterion,
      entity_value: entityValue,
      reference_value: referenceValue,
      similarity_score: similarity
    };
  });
  
  const avgSimilarity = scores.reduce((sum, s) => sum + s.similarity_score, 0) / scores.length;
  
  return {
    entity_id: entityId,
    reference_id: referenceId,
    similarity_to_reference: avgSimilarity,
    criterion_scores: scores
  };
}

function getCriterionValue(context: any, criterion: string): number {
  switch (criterion) {
    case 'test_coverage':
      return context.validations.filter(v => v.type === 'test' && v.status === 'passed').length;
    case 'decision_quality':
      return context.decisions.filter(d => d.rationale && d.rationale.length > 50).length;
    case 'timeline_completeness':
      return context.timeline.length;
    default:
      return 0;
  }
}

function calculateSimilarity(value1: number, value2: number): number {
  if (value2 === 0) return value1 === 0 ? 1.0 : 0.0;
  const ratio = Math.min(value1, value2) / Math.max(value1, value2);
  return ratio * 100;
}
```

#### LLM-as-Judge with Rubric

**Purpose**: Use LLM to evaluate against generated rubric

**Implementation**:

```typescript
async function llmJudgeWithRubric(
  featureUnitId: string,
  rubric: EvaluationRubric
): Promise<any> {
  // Get Feature Unit context
  const context = await loadWorkContext(featureUnitId);
  
  // For each criterion, find matching level
  const evaluations = rubric.criteria.map(criterion => {
    // Get actual values for criterion
    const actualValue = getCriterionValue(context, criterion.name.toLowerCase().replace(' ', '_'));
    
    // Find matching level in rubric
    let matchedLevel = criterion.levels[criterion.levels.length - 1]; // Default to lowest
    
    for (const level of criterion.levels) {
      if (actualValue >= getRequiredValueForLevel(level)) {
        matchedLevel = level;
        break;
      }
    }
    
    return {
      criterion: criterion.name,
      weight: criterion.weight,
      actual_value: actualValue,
      score: matchedLevel.score,
      level_description: matchedLevel.description,
      indicators_met: matchedLevel.indicators,
      weighted_score: matchedLevel.score * criterion.weight
    };
  });
  
  const overallScore = evaluations.reduce((sum, e) => sum + e.weighted_score, 0);
  
  // Store evaluation as validation result
  await mcpClient.submit_payload({
    capability_id: 'neotoma:submit_codebase_metadata:v1',
    body: {
      entity_type: 'validation_result',
      data: {
        validation_type: 'acceptance_criteria',
        status: overallScore >= 80 ? 'passed' : overallScore >= 60 ? 'warning' : 'failed',
        details: {
          overall_score: overallScore,
          criterion_evaluations: evaluations,
          rubric_name: rubric.name
        },
        target: featureUnitId,
        timestamp: new Date().toISOString()
      }
    }
  });
  
  return {
    feature_unit_id: featureUnitId,
    overall_score: overallScore,
    evaluations,
    rubric: rubric.name
  };
}

function getRequiredValueForLevel(level: any): number {
  // Map level score to required value (simplified)
  return level.score >= 100 ? 3 : level.score >= 75 ? 2 : level.score >= 50 ? 1 : 0;
}
```

#### Multi-Criteria Evaluation with Weights

**Purpose**: Evaluate using multiple weighted criteria

**Implementation**:

```typescript
interface WeightedCriteria {
  [key: string]: {
    weight: number;
    threshold: number;
  };
}

async function multiCriteriaEvaluation(
  featureUnitId: string,
  criteria: WeightedCriteria
): Promise<any> {
  const context = await loadWorkContext(featureUnitId);
  
  const scores = Object.entries(criteria).map(([name, config]) => {
    let rawScore = 0;
    
    switch (name) {
      case 'test_coverage':
        const passedTests = context.validations.filter(v => 
          v.type === 'test' && v.status === 'passed'
        ).length;
        rawScore = Math.min(passedTests / 2, 1) * 100; // Normalized to 0-100
        break;
        
      case 'decision_quality':
        const qualityDecisions = context.decisions.filter(d => 
          d.rationale && d.rationale.length > 50
        ).length;
        rawScore = Math.min(qualityDecisions / 3, 1) * 100;
        break;
        
      case 'timeline_completeness':
        rawScore = Math.min(context.timeline.length / 5, 1) * 100;
        break;
        
      case 'validation_completeness':
        const validationTypes = new Set(context.validations.map(v => v.type));
        rawScore = (validationTypes.size / 4) * 100;
        break;
    }
    
    return {
      criterion: name,
      raw_score: rawScore,
      weight: config.weight,
      threshold: config.threshold,
      weighted_score: rawScore * config.weight,
      meets_threshold: rawScore >= config.threshold
    };
  });
  
  const overallScore = scores.reduce((sum, s) => sum + s.weighted_score, 0);
  const allThresholdsMet = scores.every(s => s.meets_threshold);
  
  return {
    feature_unit_id: featureUnitId,
    overall_score: overallScore,
    all_thresholds_met: allThresholdsMet,
    criterion_scores: scores,
    status: allThresholdsMet && overallScore >= 80 ? 'passed' : 'failed'
  };
}

// Example usage
const criteria = {
  test_coverage: { weight: 0.3, threshold: 80 },
  decision_quality: { weight: 0.3, threshold: 75 },
  timeline_completeness: { weight: 0.2, threshold: 60 },
  validation_completeness: { weight: 0.2, threshold: 50 }
};

const evaluation = await multiCriteriaEvaluation('FU-061', criteria);
console.log(`Overall score: ${evaluation.overall_score}`);
console.log(`Thresholds met: ${evaluation.all_thresholds_met}`);
```

### Advanced Evaluation Best Practices

**DO:**
- ✅ Run pairwise comparisons in both orders (position bias mitigation)
- ✅ Generate rubrics from historical data
- ✅ Use multi-criteria evaluation with weights
- ✅ Store evaluation results as validation_result entities
- ✅ Control for verbosity bias in text comparisons
- ✅ Use reference entities for baseline comparison

**DON'T:**
- ❌ Rely on single-order pairwise comparison
- ❌ Use hardcoded rubrics without domain analysis
- ❌ Evaluate on single criterion
- ❌ Ignore position bias
- ❌ Let verbosity inflate scores
- ❌ Evaluate without baselines

### Best Practices for Evaluation

**DO:**
- ✅ Track validation results for all Feature Units
- ✅ Record session outcomes consistently
- ✅ Use timeline queries for historical analysis
- ✅ Calculate quality scores based on multiple criteria
- ✅ Benchmark against previous performance
- ✅ Track trends over time

**DON'T:**
- ❌ Evaluate without historical context
- ❌ Use single metric for quality assessment
- ❌ Ignore validation failures
- ❌ Skip session outcome tracking
- ❌ Evaluate without baseline comparison

## Support

For integration issues:
- Check Neotoma MCP server is running
- Review MCP client configuration
- Test MCP actions manually
- Consult `docs/releases/v0.2.3/mcp_actions.md`
- Check migration guide for data migration
