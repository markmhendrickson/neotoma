name: Observation Architecture Documentation Integration
overview: "Documentation-only plan: Integrate 4-layer observation architecture (Document→Entity→Observation→Snapshot) into Neotoma documentation system and v0.1.0 release documentation. Updates existing docs to reflect architectural decisions, adds new architectural decisions document, and updates release manifests. NO CODE IMPLEMENTATION—documentation only."
todos:
  - id: create-arch-decisions-doc
    content: Create docs/architecture/architectural_decisions.md with 11 decisions
    status: completed
  - id: update-manifest
    content: Update NEOTOMA_MANIFEST.md for 4-layer model and observation concepts
    status: completed
    dependencies:
      - create-arch-decisions-doc
  - id: update-architecture-md
    content: Update architecture.md to include observation layer in domain services
    status: completed
    dependencies:
      - create-arch-decisions-doc
  - id: update-schema-md
    content: Update schema.md with new tables (observations, snapshots, registry, fragments)
    status: completed
    dependencies:
      - create-arch-decisions-doc
  - id: update-record-types
    content: Update record_types.md for observation emission patterns
    status: completed
    dependencies:
      - update-schema-md
  - id: update-ingestion-md
    content: Update ingestion.md with observation creation step
    status: completed
    dependencies:
      - update-schema-md
  - id: create-reducer-doc
    content: Create reducer.md subsystem documentation
    status: completed
    dependencies:
      - create-arch-decisions-doc
  - id: create-relationships-doc
    content: Create relationships.md subsystem documentation
    status: completed
    dependencies:
      - create-arch-decisions-doc
  - id: create-observation-arch-doc
    content: Create observation_architecture.md overview
    status: completed
    dependencies:
      - create-arch-decisions-doc
  - id: update-determinism
    content: Update determinism.md with reducer requirements
    status: completed
    dependencies:
      - create-reducer-doc
  - id: update-consistency
    content: Update consistency.md for observation/snapshot consistency
    status: completed
    dependencies:
      - create-observation-arch-doc
  - id: update-data-models
    content: Rewrite DATA_MODELS.md for 4-layer architecture
    status: completed
    dependencies:
      - update-schema-md
  - id: update-mcp-spec
    content: Update MCP_SPEC.md with new actions that SHOULD be implemented
    status: completed
    dependencies:
      - create-observation-arch-doc
  - id: update-feature-units
    content: Update MVP_FEATURE_UNITS.md with FU-055 through FU-061
    status: completed
    dependencies:
      - create-observation-arch-doc
  - id: update-v0.1.0-manifest
    content: Update v0.1.0/manifest.yaml with new Feature Units
    status: completed
    dependencies:
      - update-feature-units
  - id: update-v0.1.0-release-plan
    content: Update v0.1.0/release_plan.md with observation architecture scope
    status: completed
    dependencies:
      - update-v0.1.0-manifest
  - id: update-v0.1.0-integration-tests
    content: Update v0.1.0/integration_tests.md with observation test scenarios
    status: completed
    dependencies:
      - update-v0.1.0-release-plan
  - id: update-context-index
    content: Update context/index.md with new docs and reading strategies
    status: completed
    dependencies:
      - create-arch-decisions-doc
      - create-reducer-doc
      - create-relationships-doc
  - id: validate-cross-refs
    content: Validate all cross-references and terminology consistency
    status: completed
    dependencies:
      - update-context-index
      - update-v0.1.0-integration-tests
# Observation Architecture Documentation Integration — v0.1.0 Release
## Executive Summary
**Scope: Documentation Updates Only**
This plan integrates the 11 architectural decisions document into Neotoma's documentation system and v0.1.0 release documentation. This is a **documentation task only**—no code implementation.
**What This Plan Does:**
- Creates new architectural decisions document
- Updates existing documentation to reflect 4-layer truth model
- Updates v0.1.0 release documentation to include observation architecture
- Documents what SHOULD be implemented (not implementing it)
**What This Plan Does NOT Do:**
- ❌ Implement database tables or code
- ❌ Write reducer logic or services
- ❌ Modify ingestion pipeline code
- ❌ Create MCP actions
- ❌ Write tests or run code
## Phase 1: Create Core Architectural Decisions Document
### Task 1.1: Create Architectural Decisions Doc
**Create:** [`docs/architecture/architectural_decisions.md`](docs/architecture/architectural_decisions.md)
**Content:**
- Format the 11 architectural decisions provided by user
- Add proper markdown structure per documentation standards
- Add Mermaid diagrams for 4-layer truth model
- Add cross-references to related docs
- Add "Agent Instructions" section
- Add validation checklist
**Deliverable:** Complete architectural decisions document
## Phase 2: Update Foundation Documentation
### Task 2.1: Update NEOTOMA_MANIFEST.md
**File:** [`docs/NEOTOMA_MANIFEST.md`](docs/NEOTOMA_MANIFEST.md)
**Updates:**
- Section 2.1 Core Responsibilities: Add observation creation, reducer execution, schema registry management
- Section 6 Data Model: Replace 3-layer with 4-layer model (Document → Entity → Observation → Snapshot)
- Add reducer concepts to determinism section
- Update vocabulary to include observation, snapshot, reducer terms
**Deliverable:** Updated manifest reflecting 4-layer architecture
### Task 2.2: Update architecture.md
**File:** [`docs/architecture/architecture.md`](docs/architecture/architecture.md)
**Updates:**
- Section 2 Internal Architecture: Add Observation Storage, Reducer Engine, Schema Registry as domain services
- Section 4.1 Ingestion Flow: Insert observation creation + reducer execution steps between extraction and graph insertion
- Update all data flow diagrams to show observation layer
- Section 9 Architectural Invariants: Add reducer determinism, observation provenance requirements
- Add references to architectural_decisions.md
**Deliverable:** Updated architecture doc with observation layer
## Phase 3: Update Subsystem Documentation
### Task 3.1: Update schema.md
**File:** [`docs/subsystems/schema.md`](docs/subsystems/schema.md)
**Updates:**
- Add `schema_registry` table documentation
- Add `observations` table documentation
- Add `entity_snapshots` table documentation
- Add `raw_fragments` table documentation
- Document observation schemas vs entity schemas
- Add reducer configuration schema documentation
- Document schema versioning for observations
**Deliverable:** Updated schema documentation
### Task 3.2: Update record_types.md
**File:** [`docs/subsystems/record_types.md`](docs/subsystems/record_types.md)
**Updates:**
- Reframe as "observation emission patterns" rather than direct field extraction
- Add reducer merge policy per record type
- Document specificity_score calculation rules
- Add source_priority rules per type
- Update examples to show observation → snapshot flow
**Deliverable:** Updated record types documentation
### Task 3.3: Update ingestion.md
**File:** [`docs/subsystems/ingestion/ingestion.md`](docs/subsystems/ingestion/ingestion.md)
**Updates:**
- Add observation layer to pipeline description
- Document observation creation step
- Document reducer invocation after observation creation
- Update pipeline diagram to show 4-layer flow
- Add raw_fragments handling step
**Deliverable:** Updated ingestion documentation
### Task 3.4: Create reducer.md
**File:** [`docs/subsystems/reducer.md`](docs/subsystems/reducer.md) (NEW)
**Content:**
- Document reducer engine architecture
- Explain merge strategies (last_write, highest_priority, most_specific, merge_array)
- Provide examples of reducer execution
- Document determinism requirements
- Add testing patterns
- Cross-reference architectural_decisions.md
**Deliverable:** New reducer subsystem documentation
### Task 3.5: Create relationships.md
**File:** [`docs/subsystems/relationships.md`](docs/subsystems/relationships.md) (NEW)
**Content:**
- Document relationship types (PART_OF, CORRECTS, REFERS_TO, SETTLES, DUPLICATE_OF)
- Explain graph patterns
- Provide examples
- Add query patterns
- Document relationship metadata
**Deliverable:** New relationships subsystem documentation
### Task 3.6: Create observation_architecture.md
**File:** [`docs/subsystems/observation_architecture.md`](docs/subsystems/observation_architecture.md) (NEW)
**Content:**
- Complete overview of observation architecture
- 4-layer model explanation
- Observation lifecycle
- Snapshot computation flow
- Provenance tracking
- Integration with existing event-sourcing (FU-050)
**Deliverable:** New observation architecture overview
## Phase 4: Update Cross-Cutting Documentation
### Task 4.1: Update determinism.md
**File:** [`docs/architecture/determinism.md`](docs/architecture/determinism.md)
**Updates:**
- Add reducer determinism requirements (same observations + merge rules → same snapshot)
- Add observation ordering guarantees
- Add ID generation rules for observations
- Add examples of deterministic reducer execution
**Deliverable:** Updated determinism documentation
### Task 4.2: Update consistency.md
**File:** [`docs/architecture/consistency.md`](docs/architecture/consistency.md)
**Updates:**
- Add consistency tier for observations (strong consistency)
- Add snapshot recomputation consistency (when do snapshots refresh?)
- Document eventual consistency for snapshot indexes if applicable
- Update consistency mapping table
**Deliverable:** Updated consistency documentation
## Phase 5: Update Specs Documentation
### Task 5.1: Update DATA_MODELS.md
**File:** [`docs/specs/DATA_MODELS.md`](docs/specs/DATA_MODELS.md)
**Updates:**
- Complete rewrite of data model section for 4-layer architecture
- Add observation model documentation
- Add snapshot model documentation
- Add reducer configuration model
- Update all diagrams to show observation layer
**Deliverable:** Updated data models specification
### Task 5.2: Update MCP_SPEC.md
**File:** [`docs/specs/MCP_SPEC.md`](docs/specs/MCP_SPEC.md)
**Updates:**
- Document new MCP actions that SHOULD be implemented:
- `get_entity_snapshot` — Get entity with provenance
- `list_observations` — Query observations for entity
- `get_field_provenance` — Trace field to source documents
- `create_relationship` — Create typed relationship
- `list_relationships` — Query entity relationships
- Update existing action documentation to reference snapshots
- Add provenance query examples
**Deliverable:** Updated MCP specification
### Task 5.3: Update MVP_FEATURE_UNITS.md
**File:** [`docs/specs/MVP_FEATURE_UNITS.md`](docs/specs/MVP_FEATURE_UNITS.md)
**Updates:**
- Add new Feature Units that SHOULD be created:
- FU-055: Observation Storage Layer
- FU-056: Enhanced Reducer Engine for Observations
- FU-057: Schema Registry Service
- FU-058: Observation-Aware Ingestion Pipeline
- FU-059: Relationship Types
- FU-060: Automated Schema Promotion (optional P1)
- FU-061: MCP Actions for Observation Architecture
- Document dependencies between new FUs and existing FUs
- Add to execution schedule
**Deliverable:** Updated feature units specification
## Phase 6: Update Release Documentation
### Task 6.1: Update v0.1.0 manifest.yaml
**File:** [`docs/releases/in_progress/v0.1.0/manifest.yaml`](docs/releases/in_progress/v0.1.0/manifest.yaml)
**Updates:**
- Add new Feature Units (FU-055 through FU-061) to feature_units list
- Document dependencies
- Add to execution_schedule batches
- Update acceptance_criteria to include observation architecture criteria
**Deliverable:** Updated v0.1.0 manifest
### Task 6.2: Update v0.1.0 release_plan.md
**File:** [`docs/releases/in_progress/v0.1.0/release_plan.md`](docs/releases/in_progress/v0.1.0/release_plan.md)
**Updates:**
- Section 2.1: Add observation architecture Feature Units
- Section 3: Add observation architecture acceptance criteria
- Section 4: Add observation architecture integration scenarios
- Section 7: Add observation architecture success criteria
- Document relationship to existing event-sourcing foundation (FU-050)
**Deliverable:** Updated v0.1.0 release plan
### Task 6.3: Update v0.1.0 integration_tests.md
**File:** [`docs/releases/in_progress/v0.1.0/integration_tests.md`](docs/releases/in_progress/v0.1.0/integration_tests.md)
**Updates:**
- Add integration test scenarios for observation architecture:
- Multi-source entity resolution test
- Observation reducer validation test
- Relationship graph validation test
- Schema registry validation test
- Document test specifications (not implementing tests, just documenting what SHOULD be tested)
**Deliverable:** Updated integration test specifications
## Phase 7: Update Context and Navigation
### Task 7.1: Update context/index.md
**File:** Foundation rules in `.cursor/rules/`
**Updates:**
- Section 2.2 Architecture: Add architectural_decisions.md to architecture table
- Section 3 Dependency Graph: Add architectural_decisions.md node (depends on NEOTOMA_MANIFEST, architecture.md)
- Section 4 Reading Strategies: Add reading strategies for:
- Reducer implementation work
- Observation debugging
- Schema registry work
- Relationship graph queries
- Add new subsystem docs to appropriate sections
**Deliverable:** Updated context index
## Phase 8: Validate Documentation Consistency
### Task 8.1: Cross-Reference Validation
**Tasks:**
- Search all docs for references to "extracted_fields", "entity resolution", "record creation"
- Verify consistency with 4-layer model terminology
- Update all mermaid diagrams showing data flow to include observation layer
- Verify all "Agent Instructions" sections reference architectural_decisions.md when relevant
- Check that no docs contradict the new canonical model
**Deliverable:** Documentation consistency report
### Task 8.2: Terminology Consistency
**Tasks:**
- Update vocabulary.md if it exists, or create vocabulary section
- Ensure consistent use of:
- "observation" vs "extracted field"
- "snapshot" vs "entity state"
- "reducer" vs "merge logic"
- "schema registry" vs "schema definitions"
**Deliverable:** Consistent terminology across all docs
## Documentation Standards Compliance
### All Documents Must Follow:
- [`docs/conventions/documentation_standards.md`](docs/conventions/documentation_standards.md) formatting rules
- Proper Mermaid diagram syntax
- MUST/MUST NOT language conventions
- Agent Instructions sections where appropriate
- Cross-references to related documents
## Deliverables Summary
**New Documents Created:**
1. `docs/architecture/architectural_decisions.md` — 11 architectural decisions
2. `docs/subsystems/reducer.md` — Reducer engine documentation
3. `docs/subsystems/relationships.md` — Relationship types guide
4. `docs/subsystems/observation_architecture.md` — Observation architecture overview
**Documents Updated:**
1. `docs/NEOTOMA_MANIFEST.md` — 4-layer model, observation concepts
2. `docs/architecture/architecture.md` — Observation layer in domain services
3. `docs/subsystems/schema.md` — New tables (observations, snapshots, registry, fragments)
4. `docs/subsystems/record_types.md` — Observation emission patterns
5. `docs/subsystems/ingestion/ingestion.md` — Observation creation step
6. `docs/architecture/determinism.md` — Reducer determinism
7. `docs/architecture/consistency.md` — Observation/snapshot consistency
8. `docs/specs/DATA_MODELS.md` — 4-layer model rewrite
9. `docs/specs/MCP_SPEC.md` — New MCP actions
10. `docs/specs/MVP_FEATURE_UNITS.md` — New Feature Units (FU-055 through FU-061)
11. Foundation rules in `.cursor/rules/` — Agent instructions and documentation loading order
12. `docs/releases/in_progress/v0.1.0/manifest.yaml` — New Feature Units
13. `docs/releases/in_progress/v0.1.0/release_plan.md` — Observation architecture scope
14. `docs/releases/in_progress/v0.1.0/integration_tests.md` — Test scenarios
## Validation Checklist
- [ ] All 11 architectural decisions documented in architectural_decisions.md
- [ ] 4-layer model (Document → Entity → Observation → Snapshot) documented throughout
- [ ] Reducer concept integrated across relevant subsystems
- [ ] Schema registry documented in schema.md
- [ ] Observation provenance patterns documented
- [ ] All data flow diagrams show observation layer
- [ ] MCP actions documented (what SHOULD be implemented)
- [ ] Feature Units documented (FU-055 through FU-061)
- [ ] No contradictions between architectural_decisions.md and other docs
- [ ] context/index.md reading strategies updated
- [ ] All cross-references validated
- [ ] v0.1.0 release docs updated
- [ ] Terminology consistent across all docs
- [ ] Documentation standards compliance verified
## Important Notes
**This is a documentation task only:**
- We are documenting WHAT SHOULD be implemented
- We are NOT implementing code, database tables, or services
- We are updating documentation to reflect architectural decisions
- Future implementation work will reference these updated docs
**Relationship to v0.1.0:**
- v0.1.0 already includes event-sourcing foundation (FU-050 through FU-054)
- Observation architecture builds on that foundation
- Documentation reflects how observation architecture SHOULD integrate with existing foundation
- Release documentation updated to show observation architecture as part of v0.1.0 scope