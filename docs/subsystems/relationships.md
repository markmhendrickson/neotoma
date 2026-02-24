# Neotoma Relationships — First-Class Typed Graph Edges
## Scope
This document covers:
- Relationship types and their semantics
- Graph patterns and use cases
- Query patterns for relationships
- Relationship metadata
This document does NOT cover:
- Entity resolution (see `docs/foundation/entity_resolution.md`)
- Graph construction (see `docs/subsystems/ingestion/ingestion.md`)
- Database schema (see `docs/subsystems/schema.md`)
## 1. Relationship Overview
### 1.1 First-Class [Relationships](../vocabulary/canonical_terms.md#relationship)
[Relationships](../vocabulary/canonical_terms.md#relationship) are **first-class typed edges** in Neotoma, not hard-coded foreign keys:
- Stored as observations and snapshots (following entity snapshot pattern)
- Typed with relationship types (PART_OF, CORRECTS, etc.)
- Carry metadata and full provenance tracking
- Queryable and traversable
- Support multiple sources contributing to same relationship

### 1.2 Relationship Architecture

Relationships follow the same **observation-snapshot pattern** as entities:

```
Source → Relationship Observations → Relationship Reducer → Relationship Snapshot
```

**Relationship Observations:**
- Multiple sources can create observations about the same relationship
- Each observation records metadata fields from a specific source
- Observations are immutable and timestamped
- Enable full provenance tracking

**Relationship Snapshots:**
- Computed by merging all observations for a relationship
- Represent current "truth" for relationship metadata
- Deterministic: same observations + merge rules → same snapshot
- Include provenance map: metadata field → observation ID

**Example:**
```
Source A (Invoice PDF):  SETTLES relationship → metadata: {amount: 1500, currency: "USD"}
Source B (Bank Record):  SETTLES relationship → metadata: {amount: 1500, payment_method: "wire"}

Snapshot (merged):       metadata: {amount: 1500, currency: "USD", payment_method: "wire"}
                        provenance: {amount: "obs_A", currency: "obs_A", payment_method: "obs_B"}
```

### 1.3 Open Ontology
Neotoma does **not** hard-code hierarchies:
- No rigid parent-child tables
- Hierarchies **emerge from edges** rather than schema design
- Enables out-of-order ingestion, multiple parents, overlapping summaries, corrections
See [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) for architectural rationale.
## 2. Relationship Types
### 2.1 Core Relationship Types
| Type           | Description                | Example                              |
| -------------- | -------------------------- | ------------------------------------ |
| `PART_OF`      | Hierarchical relationships | Invoice line item part of invoice    |
| `CORRECTS`     | Correction relationships   | Corrected invoice corrects original  |
| `REFERS_TO`    | Reference relationships    | Invoice refers to contract           |
| `SETTLES`      | Settlement relationships   | Payment settles invoice              |
| `DUPLICATE_OF` | Duplicate detection        | Duplicate [entity](../vocabulary/canonical_terms.md#entity) |
| `DEPENDS_ON`   | Dependency relationships   | Task depends on another task         |
| `SUPERSEDES`   | Version relationships      | Updated contract supersedes original |
| `EMBEDS`       | Container embeds asset     | Blog post embeds image               |
### 2.2 Relationship Semantics
**PART_OF:**
- Represents hierarchical containment
- Source is part of target
- Example: `invoice_line_item` PART_OF `invoice`
**CORRECTS:**
- Represents corrections or updates
- Source corrects target
- Example: `corrected_invoice` CORRECTS `original_invoice`
**REFERS_TO:**
- Represents references or mentions
- Source refers to target
- Example: `invoice` REFERS_TO `contract`
**SETTLES:**
- Represents settlement or payment
- Source settles target
- Example: `payment` SETTLES `invoice`
**DUPLICATE_OF:**
- Represents duplicate detection
- Source is duplicate of target
- Example: `duplicate_entity` DUPLICATE_OF `original_entity`
**DEPENDS_ON:**
- Represents dependencies
- Source depends on target
- Example: `task_b` DEPENDS_ON `task_a`
**SUPERSEDES:**
- Represents versioning
- Source supersedes target
- Example: `contract_v2` SUPERSEDES `contract_v1`
**EMBEDS:**
- Represents container-to-embedded-asset inclusion
- Source (container) embeds target (asset); e.g. post embeds image, document embeds attachment
- Use for images in posts, attachments in documents, media in pages (target is reusable across containers)
- Example: `blog_post` EMBEDS `image`
## 3. Graph Patterns
### 3.1 Hierarchical Patterns
**Invoice Hierarchy:**
```
invoice (entity)
  ├─ invoice_line_item_1 (entity) PART_OF invoice
  ├─ invoice_line_item_2 (entity) PART_OF invoice
  └─ invoice_line_item_3 (entity) PART_OF invoice
```
**Query Pattern:**
```typescript
async function getInvoiceLineItems(invoiceId: string): Promise<Entity[]> {
  const relationships = await relationshipRepo.findBySource(
    invoiceId,
    "PART_OF"
  );
  return relationships.map((rel) => rel.target_entity_id);
}
```
### 3.2 Correction Patterns
**Invoice Correction Chain:**
```
original_invoice (entity)
  └─ corrected_invoice (entity) CORRECTS original_invoice
      └─ final_invoice (entity) CORRECTS corrected_invoice
```
**Query Pattern:**
```typescript
async function getCorrections(entityId: string): Promise<Entity[]> {
  const relationships = await relationshipRepo.findByTarget(
    entityId,
    "CORRECTS"
  );
  return relationships.map((rel) => rel.source_entity_id);
}
```
### 3.3 Settlement Patterns
**Payment Settlement:**
```
invoice (entity)
  └─ payment (entity) SETTLES invoice
```
**Query Pattern:**
```typescript
async function getSettlements(entityId: string): Promise<Entity[]> {
  const relationships = await relationshipRepo.findByTarget(
    entityId,
    "SETTLES"
  );
  return relationships.map((rel) => rel.source_entity_id);
}
```
## 4. Relationship Metadata
### 4.1 Metadata Structure
Relationships can carry metadata:
```typescript
interface Relationship {
  id: string;
  relationship_type: RelationshipType;
  source_entity_id: string;
  target_entity_id: string;
  source_material_id?: string;
  metadata?: {
    confidence?: number;
    notes?: string;
    [key: string]: any;
  };
  created_at: Date;
}
```
### 4.2 Metadata Examples
**SETTLES Relationship:**
```json
{
  "relationship_type": "SETTLES",
  "source_entity_id": "ent_payment_123",
  "target_entity_id": "ent_invoice_456",
  "metadata": {
    "amount": 1500.0,
    "currency": "USD",
    "payment_method": "bank_transfer"
  }
}
```
**PART_OF Relationship:**
```json
{
  "relationship_type": "PART_OF",
  "source_entity_id": "ent_line_item_789",
  "target_entity_id": "ent_invoice_456",
  "metadata": {
    "quantity": 2,
    "unit_price": 750.0
  }
}
```
## 5. Query Patterns
### 5.1 Find Relationships
**By Source:**
```typescript
async function getOutboundRelationships(
  entityId: string,
  type?: RelationshipType
): Promise<Relationship[]> {
  return await relationshipRepo.findBySource(entityId, type);
}
```
**By Target:**
```typescript
async function getInboundRelationships(
  entityId: string,
  type?: RelationshipType
): Promise<Relationship[]> {
  return await relationshipRepo.findByTarget(entityId, type);
}
```
**By Type:**
```typescript
async function getRelationshipsByType(
  type: RelationshipType
): Promise<Relationship[]> {
  return await relationshipRepo.findByType(type);
}
```
### 5.2 Graph Traversal
**Find All Related Entities:**
```typescript
async function getRelatedEntities(
  entityId: string,
  maxDepth: number = 1
): Promise<Entity[]> {
  const visited = new Set<string>();
  const queue = [{ id: entityId, depth: 0 }];
  const entities: Entity[] = [];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);
    const relationships = await relationshipRepo.findBySource(id);
    for (const rel of relationships) {
      entities.push(await entityRepo.findById(rel.target_entity_id));
      queue.push({ id: rel.target_entity_id, depth: depth + 1 });
    }
  }
  return entities;
}
```

## 6. Relationship Observations and Snapshots

### 6.1 Creating Relationship Observations

**Multiple Sources Pattern:**
```typescript
// Source A: Invoice PDF discovers SETTLES relationship
await createRelationshipObservations(
  [
    {
      relationship_type: "SETTLES",
      source_entity_id: "payment_123",
      target_entity_id: "invoice_456",
      metadata: {
        amount: 1500,
        currency: "USD",
      },
    },
  ],
  "source_invoice_pdf",
  "interpretation_001",
  userId,
  0, // AI interpretation priority
);

// Source B: Bank record discovers same SETTLES relationship
await createRelationshipObservations(
  [
    {
      relationship_type: "SETTLES",
      source_entity_id: "payment_123",
      target_entity_id: "invoice_456",
      metadata: {
        amount: 1500,
        payment_method: "wire_transfer",
        transaction_id: "TXN789",
      },
    },
  ],
  "source_bank_record",
  "interpretation_002",
  userId,
  100, // High priority (bank record more authoritative)
);
```

### 6.2 Querying Relationship Snapshots

**Get Specific Relationship:**
```typescript
const { relationshipsService } = await import("./services/relationships.js");

const snapshot = await relationshipsService.getRelationshipSnapshot(
  "SETTLES",
  "payment_123",
  "invoice_456",
  userId,
);

console.log(snapshot.snapshot); // Merged metadata
console.log(snapshot.provenance); // Field → observation_id map
console.log(snapshot.observation_count); // Number of sources
```

**List All Relationships for Entity:**
```typescript
const snapshots = await relationshipsService.getRelationshipsForEntity(
  "invoice_456",
  "incoming", // or "outgoing" or "both"
);

for (const snapshot of snapshots) {
  console.log(`${snapshot.relationship_type}: ${snapshot.source_entity_id} → ${snapshot.target_entity_id}`);
  console.log(`Metadata:`, snapshot.snapshot);
  console.log(`From ${snapshot.observation_count} sources`);
}
```

### 6.3 Provenance Tracking

Every field in a relationship snapshot traces to its source observation:

```typescript
const snapshot = await relationshipsService.getRelationshipSnapshot(
  "SETTLES",
  "payment_123",
  "invoice_456",
  userId,
);

// Snapshot: {amount: 1500, currency: "USD", payment_method: "wire_transfer"}
// Provenance: {amount: "obs_A", currency: "obs_A", payment_method: "obs_B"}

// Trace amount field to its source
const amountObservationId = snapshot.provenance.amount;
const { data: observation } = await db
  .from("relationship_observations")
  .select("source_id, observed_at, metadata")
  .eq("id", amountObservationId)
  .single();

console.log(`Amount field came from source ${observation.source_id}`);
```

### 6.4 Merge Strategies

Relationship snapshots use the same merge strategies as entity snapshots:

| Strategy           | Behavior                                           | Default |
| ------------------ | -------------------------------------------------- | ------- |
| `last_write`       | Most recent observation wins                       | ✓       |
| `highest_priority` | Observation with highest source_priority wins      |         |
| `most_specific`    | Observation with highest specificity_score wins    |         |
| `merge_array`      | Merge array values from all observations           |         |

**Default:** All relationship metadata fields use `last_write` strategy (most recent observation wins).

### 6.5 Idempotence

Relationship observations are idempotent:

```typescript
// Same source creates same observation twice
await createRelationshipObservations([rel], "source_A", null, userId);
await createRelationshipObservations([rel], "source_A", null, userId);

// Result: Only ONE observation created
// Unique constraint: (source_id, interpretation_id, relationship_key, canonical_hash, user_id)
```

### 7.1 Creating Relationships (Legacy Pattern)

**Note:** This section describes the legacy direct relationship creation pattern. New code should use relationship observations (see section 6).

**During [Ingestion](../vocabulary/canonical_terms.md#ingestion):**
```typescript
async function createRelationships(
  sourceMaterialId: string,
  entities: Entity[],
  extractedFields: any
): Promise<void> {
  // Example: Invoice line items PART_OF invoice
  if (extractedFields.line_items) {
    const invoiceEntity = entities.find((e) => e.type === "invoice");
    for (const lineItem of extractedFields.line_items) {
      const lineItemEntity = await resolveEntity(lineItem);
      await relationshipRepo.create({
        relationship_type: "PART_OF",
        source_entity_id: lineItemEntity.id,
        target_entity_id: invoiceEntity.id,
        source_material_id: sourceMaterialId,
      });
    }
  }
}
```
**Via MCP Action:**
```typescript
async function mcp_create_relationship(
  type: RelationshipType,
  sourceId: string,
  targetId: string,
  metadata?: any
): Promise<Relationship> {
  return await relationshipRepo.create({
    relationship_type: type,
    source_entity_id: sourceId,
    target_entity_id: targetId,
    metadata,
  });
}
```
## 8. Cycle Detection
### 8.1 Preventing Cycles
Relationships MUST NOT create cycles in certain types:
- `PART_OF` relationships should not form cycles
- `DEPENDS_ON` relationships should not form cycles
**Cycle Detection:**
```typescript
async function detectCycle(
  sourceId: string,
  targetId: string,
  type: RelationshipType
): Promise<boolean> {
  // Check if target is ancestor of source
  const ancestors = await getAncestors(targetId, type);
  return ancestors.includes(sourceId);
}
```
## Agent Instructions
### When to Load This Document
Load `docs/subsystems/relationships.md` when:
- Creating relationships between entities
- Querying entity graphs
- Understanding relationship types
- Implementing graph traversal logic
### Constraints Agents Must Enforce
1. **Relationships MUST be typed** (use defined relationship types)
2. **No hard-coded hierarchies** (use relationships instead)
3. **Cycles MUST be prevented** for hierarchical types
4. **Metadata MUST be structured** (use JSONB schema)
### Forbidden Patterns
- ❌ Hard-coded parent-child foreign keys
- ❌ Untyped relationships (must specify type)
- ❌ Cycles in PART_OF or DEPENDS_ON relationships
- ❌ Direct entity updates (use relationships)
