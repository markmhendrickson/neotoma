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
- Stored in `relationships` table
- Typed with relationship types (PART_OF, CORRECTS, etc.)
- Carry metadata and provenance
- Queryable and traversable
### 1.2 Open Ontology
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
## 6. Relationship Creation
### 6.1 Creating Relationships
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
## 7. Cycle Detection
### 7.1 Preventing Cycles
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
