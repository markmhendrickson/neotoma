# Neotoma Canonical Vocabulary

## Core Terms

### Canonicalization Rules

**Definition:** Rules for normalizing structured [source](#source) data for deterministic deduplication (field selection, string normalization, array sorting). [Canonicalization rules](#canonicalization-rules) are part of [entity schemas](#entity-schema).

**Use:** "[Entity schemas](#entity-schema) define [canonicalization rules](#canonicalization-rules) to ensure same [source](#source) produces same content_id."

**Example:** "The invoice [entity schema](#entity-schema) defines [canonicalization rules](#canonicalization-rules): include only `invoice_number`, `amount`, `vendor_name`; normalize strings to lowercase; sort arrays. Structured [source](#source) `{invoice_number: 'INV-001', vendor_name: 'Acme Corp'}` and `{invoice_number: 'INV-001', vendor_name: 'acme corp'}` produce the same `content_id`."

**Forbidden Synonyms:**
- ❌ "normalization" (canonicalization is specific type of normalization for deduplication)
- ❌ "standardization" (too generic)

### Entity

**Definition:** A canonical representation of a person, company, or location with deterministic ID.

**Use:** "[Entity](#entity) resolution generates canonical [entity](#entity) IDs."

**Example:** "The [entity](#entity) `ent_acme_corp` represents Acme Corporation, merging [observations](#observation) from multiple invoices and contracts that reference 'Acme Corp', 'Acme Corporation', and 'ACME CORP'."

**Forbidden Synonyms:**
- ❌ "object" (programming term)
- ❌ "item" (too generic)

### Entity Extraction Rule

**Definition:** Rule defining how [entities](#entity) are [extracted](#extraction) from structured [source](#source) (material_self, field_value, or array_items [extraction](#extraction) types). [Entity extraction rules](#entity-extraction-rule) are part of [entity schemas](#entity-schema).

**Use:** "[Entity schemas](#entity-schema) define [entity extraction rules](#entity-extraction-rule) for multi-[entity](#entity) [extraction](#extraction) from structured [source](#source)."

**Example:** "The note [entity schema](#entity-schema) defines: `{extraction_type: 'material_self', entity_type: 'note'}` [extracts](#extraction) the note [entity](#entity), and `{extraction_type: 'array_items', source_field: 'tasks', entity_type: 'task'}` [extracts](#extraction) task [entities](#entity) from the tasks array in structured [source](#source)."

**Forbidden Synonyms:**
- ❌ "extraction rule" (too generic, must specify entity extraction)
- ❌ "mapping" (too generic)

### Entity Schema

**Definition:** Versioned definition of fields, types, validators, merge policies, [canonicalization rules](#canonicalization-rules), and [entity extraction rules](#entity-extraction-rule) for an [entity type](#entity-type), stored in the schema registry. Defines how structured [source](#source) is normalized, deduplicated, and processed into [observations](#observation) and [entity snapshots](#entity-snapshot).

**Use:** "Each [entity type](#entity-type) has an [entity schema](#entity-schema) that defines its field structure, validation rules, normalization for deduplication, and extraction of related [entities](#entity)."

**Example:** "The invoice [entity schema](#entity-schema) defines: fields like `invoice_number` (string, required), `amount` (number, required), `date_issued` (date, required); merge policies like 'highest_priority' for vendor_name; [canonicalization rules](#canonicalization-rules) that include only `invoice_number`, `amount`, `vendor_name` for deduplication; and [entity extraction rules](#entity-extraction-rule) that extract company [entities](#entity) from `vendor_name` and `customer_name` fields."

**Forbidden Synonyms:**
- ❌ "schema" (too generic - use "[entity schema](#entity-schema)" for clarity)
- ❌ "capability" (deprecated - [entity schemas](#entity-schema) now include normalization and extraction rules directly)
- ❌ "record type" ([entity schemas](#entity-schema) apply to [entity types](#entity-type), not [record types](#record-type))
- ❌ "database schema" (entity schema refers to domain field definitions, not PostgreSQL table structure)

### Entity Type

**Definition:** Classification of an [entity](#entity) that determines its [entity schema](#entity-schema) and resolution rules (e.g., `person`, `company`, `invoice`, `transaction`, `release`).

**Use:** "Each [entity](#entity) has an entity_type that determines which [entity schema](#entity-schema) applies."

**Example:** "An [entity](#entity) with `entity_type: 'company'` uses the company [entity schema](#entity-schema) and resolves by normalized company name, while an [entity](#entity) with `entity_type: 'invoice'` uses the invoice [entity schema](#entity-schema) and resolves by invoice number."

**Forbidden Synonyms:**
- ❌ "record type" ([entity type](#entity-type) classifies [entities](#entity), [record type](#record-type) classifies documents)
- ❌ "schema type" ([entity type](#entity-type) is the classification, [entity schema](#entity-schema) is the field definition)
- ❌ "type" (too generic)
- ❌ "category" (too informal)

### Event

**Definition:** A timeline [event](#event) derived from extracted date fields in [source](#source). [Events](#event) reference their [source](#source) via `source_material_id` and include the field name that contained the date.

**Use:** "[Events](#event) appear on the timeline view and are generated from date fields in [source](#source)."

**Example:** "An invoice [source](#source) with `date_issued: '2025-01-15'` generates an [event](#event) with `event_type: 'InvoiceIssued'`, `event_timestamp: '2025-01-15T00:00:00Z'`, and `source_field: 'date_issued'`."

**Forbidden Synonyms:**
- ❌ "activity" (too informal)
- ❌ "occurrence" (verbose)

### Retrieving

**Definition:** The process of querying and retrieving [entities](#entity), [observations](#observation), [entity snapshots](#entity-snapshot), and related data from the [memory graph](#memory-graph). [Retrieving](#retrieving) operations include querying [entities](#entity) by type or identifier, getting [entity snapshots](#entity-snapshot) with [provenance](#provenance), listing [observations](#observation) for an [entity](#entity), and traversing [relationships](#relationship).

**Use:** "[Retrieving](#retrieving) operations query the Truth Layer to access stored [entities](#entity) and [observations](#observation). Use `retrieve_entities` to query [entities](#entity) by type, or `retrieve_entity_snapshot` to retrieve current truth for an [entity](#entity)."

**Example:** "The `retrieve_entities` action queries [entities](#entity) with filters like `entity_type: 'invoice'` and returns [entities](#entity) with their [entity snapshots](#entity-snapshot). The `retrieve_entity_snapshot` action retrieves the current truth for a specific [entity](#entity), computed by merging all [observations](#observation) about that [entity](#entity)."

**Forbidden Synonyms:**
- ❌ "fetch" (too generic)
- ❌ "load" (implies loading into memory, retrieving is querying)
- ❌ "get" (too generic, use specific action names)

### Extraction

**Definition:** Deterministic rule-based field [extraction](#extraction) from [source](#source).

**Use:** "[Extraction](#extraction) uses regex to find invoice numbers."

**Example:** "[Extraction](#extraction) applies the regex pattern `/INV-(\d+)/i` to find invoice numbers, always producing 'INV-001' from [source](#source) containing 'Invoice #INV-001' or 'invoice inv-001'."

**Forbidden Synonyms:**
- ❌ "parsing" (too generic)
- ❌ "analysis" (implies inference)

### Storing

**Definition:** The process of uploading, [extracting](#extraction), and inserting [source](#source) into the [memory graph](#memory-graph). [Storing](#storing) handles both unstructured [source](#source) (files, raw text, URLs) and structured [source](#source) (JSON with entity types) via a unified `store` MCP action. Unstructured [source](#source) is stored → [interpretation](#interpretation) → structured [source](#source) → processed via [entity schema](#entity-schema) → [observations](#observation). Structured [source](#source) is stored → processed via [entity schema](#entity-schema) → [observations](#observation).

**Use:** "[Storing](#storing) pipeline processes [source](#source) deterministically. Unstructured [source](#source) is interpreted into structured [source](#source), which is then processed to create [observations](#observation)."

**Example:** "The unified `store` action accepts either unstructured [source](#source) (e.g., `{file_content: '...', mime_type: 'application/pdf'}`) or structured [source](#source) (e.g., `{entities: [{entity_type: 'invoice', ...}]}`). Uploading invoice.pdf triggers [storing](#storing): the unstructured [source](#source) is stored, an [interpretation](#interpretation) transforms it into structured [source](#source) with entity types, then the structured [source](#source) is processed using [entity schemas](#entity-schema) to create [observations](#observation) for the invoice [entity](#entity) and vendor company [entity](#entity), and [events](#event) are generated from date fields. Alternatively, structured [source](#source) with `entity_type: 'invoice'` submitted directly is stored and processed using the invoice [entity schema](#entity-schema) for normalization and [entity extraction](#entity-extraction-rule) to create [observations](#observation)."

**Forbidden Synonyms:**
- ❌ "import" (ambiguous)
- ❌ "upload" (only one step)
- ❌ "processing" (too vague)
- ❌ "ingestion" (replaced by [storing](#storing) for clarity)

### Interpretation

**Definition:** Versioned interpretation attempt on unstructured [source](#source), with config logging (provider, model, temperature, prompt_hash). Transforms unstructured [source](#source) into structured [source](#source) (with entity types) that is then processed using [entity schemas](#entity-schema) for normalization, [entity extraction](#entity-extraction-rule), and [observation](#observation) creation.

**Use:** "Each [interpretation](#interpretation) creates new structured [source](#source) without modifying existing ones. The structured [source](#source) is then processed using [entity schemas](#entity-schema) for normalization, [entity extraction](#entity-extraction-rule), and [observation](#observation) creation, just like directly submitted structured [source](#source)."

**Example:** "An [interpretation](#interpretation) on unstructured [source](#source) `src_invoice_pdf` with config `{provider: 'openai', model_id: 'gpt-4', temperature: 0}` extracts structured data with entity types (e.g., `entity_type: 'invoice'`, `entity_type: 'company'`) and creates structured [source](#source). This structured [source](#source) is then processed using [entity schemas](#entity-schema) for normalization (via [canonicalization rules](#canonicalization-rules)), [entity extraction](#entity-extraction-rule) (to identify related entities), and [observation](#observation) creation `obs_001`, `obs_002`. Re-running with a different model creates new structured [source](#source) and new [observations](#observation) `obs_003`, `obs_004` without modifying the original ones."

**Forbidden Synonyms:**
- ❌ "interpretation run" (simplified to [interpretation](#interpretation))
- ❌ "analysis" (implies inference, interpretation is deterministic [extraction](#extraction))
- ❌ "processing" (too vague)

### Memory Graph

**Definition:** The interconnected graph of [source](#source), [observations](#observation), [entities](#entity), [relationships](#relationship), and [events](#event) with typed edges.

**Use:** "The [memory graph](#memory-graph) connects [source](#source) to [observations](#observation) to [entities](#entity)."

**Example:** "The [memory graph](#memory-graph) shows: [source](#source) `src_invoice_pdf` → [observation](#observation) `obs_001` → [entity](#entity) `ent_acme_corp`, and [entity](#entity) `ent_invoice_123` has a SETTLES [relationship](#relationship) to [entity](#entity) `ent_payment_456`."

**Forbidden Synonyms:**
- ❌ "knowledge graph" (implies semantic reasoning)
- ❌ "data graph" (too generic)

### Observation

**Definition:** Granular facts [extracted](#extraction) from [source](#source). [Observations](#observation) are merged via [reducers](#reducer) to compute [entity](#entity) [entity snapshots](#entity-snapshot).

**Use:** "Each [observation](#observation) traces to its [source](#source), and optionally to the [interpretation](#interpretation) that created the structured [source](#source)."

**Example:** "An [observation](#observation) for [entity](#entity) `ent_acme_corp` contains `fields: {name: 'Acme Corp', address: '123 Main St'}`, `source_material_id: 'src_001'`, `observed_at: '2025-01-15T10:30:00Z'`, and `source_priority: 0`."

**Forbidden Synonyms:**
- ❌ "fact" (too generic)
- ❌ "datum" (too technical)
- ❌ "extraction" ([observation](#observation) is the result, [extraction](#extraction) is the process)


### Provenance

**Definition:** Metadata tracking the origin of data, including [source](#source), timestamp, user, and [interpretation](#interpretation). [Source](#source) is [stored](#storing) and tracked, and [provenance](#provenance) tracks these stored artifacts. Enables full traceability from [entity snapshots](#entity-snapshot) back to original [source](#source).

**Use:** "[Provenance](#provenance) ensures every [observation](#observation) traces to its [source](#source)."

**Example:** "An [observation](#observation)'s [provenance](#provenance) from unstructured [source](#source) includes `source_id: 'src_abc123'` (the uploaded PDF), `interpretation_id: 'run_xyz789'` (which AI model transformed it into structured [source](#source)), `extracted_at: '2025-01-15T10:30:00Z'`, and `user_id: 'user_001'`. An [observation](#observation)'s [provenance](#provenance) from directly submitted structured [source](#source) includes `source_id: 'src_def456'` (the structured JSON), `extracted_at: '2025-01-15T10:30:00Z'`, and `user_id: 'user_001'` (no `interpretation_id` since no [interpretation](#interpretation) was performed)."

**Forbidden Synonyms:**
- ❌ "metadata" (provenance is specific type of metadata)
- ❌ "origin" (informal)

### Reducer

**Definition:** Deterministic function that merges [observations](#observation) into [entity](#entity) [entity snapshots](#entity-snapshot). Same [observations](#observation) always produce the same [entity snapshot](#entity-snapshot).

**Use:** "[Reducers](#reducer) compute [entity snapshots](#entity-snapshot) deterministically from [observation](#observation) history."

**Example:** "Given [observations](#observation) `[{name: 'Acme'}, {name: 'Acme Corp', priority: 100}]`, the [reducer](#reducer) applies merge policy 'highest_priority' to produce [entity snapshot](#entity-snapshot) `{name: 'Acme Corp'}`. The same [observations](#observation) always produce the same [entity snapshot](#entity-snapshot)."

**Forbidden Synonyms:**
- ❌ "merger" (too generic)
- ❌ "aggregator" (implies accumulation, reducer is deterministic computation)
- ❌ "combiner" (too generic)

### Relationship

**Definition:** Typed connection between two [entities](#entity) (e.g., PART_OF, CORRECTS, REFERS_TO, SETTLES, DUPLICATE_OF). [Relationships](#relationship) are immutable and include [provenance](#provenance) metadata.

**Use:** "[Relationships](#relationship) connect [entities](#entity) in the [memory graph](#memory-graph) with typed edges."

**Example:** "A [relationship](#relationship) `{relationship_type: 'SETTLES', source_entity_id: 'ent_payment_456', target_entity_id: 'ent_invoice_123'}` indicates that payment [entity](#entity) 456 settles invoice [entity](#entity) 123, with metadata `{amount: 1500.00, payment_method: 'bank_transfer'}`."

**Forbidden Synonyms:**
- ❌ "link" (too generic)
- ❌ "connection" (too generic)
- ❌ "edge" (implementation detail, relationship is the semantic concept)

### Entity Snapshot

**Definition:** Deterministic [reducer](#reducer) output representing current truth for an [entity](#entity). Computed by merging all [observations](#observation) about an [entity](#entity).

**Use:** "[Entity](#entity) [entity snapshots](#entity-snapshot) are computed deterministically from [observations](#observation)."

**Example:** "The [entity snapshot](#entity-snapshot) for `ent_acme_corp` merges three [observations](#observation): `{name: 'Acme Corp'}`, `{address: '123 Main St'}`, and `{tax_id: '12-3456789'}` into `{name: 'Acme Corp', address: '123 Main St', tax_id: '12-3456789'}` with [provenance](#provenance) tracking which [observation](#observation) contributed each field."

**Forbidden Synonyms:**
- ❌ "current state" (too generic)
- ❌ "merged data" (entity snapshot is the computed result)
- ❌ "aggregate" (implies accumulation, entity snapshot is deterministic computation)

### Source

**Definition:** Raw data (structured or unstructured) that gets [stored](#storing) into Neotoma with content-addressed deduplication. [Sources](#source) can be unstructured (files, raw text, external URLs) or structured (JSON with entity type metadata). The same term applies both at submission time and when stored in the backend. If structured, [sources](#source) include entity type(s) that they represent.

**Use:** "[Sources](#source) are [stored](#storing) with SHA-256 hashing. Structured [sources](#source) include entity type metadata for processing."

**Example:** "A [source](#source) can be a PDF file (invoice.pdf), raw text string, external URL, or structured JSON with `entity_type: 'invoice'`. All [sources](#source) are stored with content-addressed deduplication. Unstructured [sources](#source) undergo [interpretation](#interpretation) to transform them into structured [sources](#source) with entity types, which are then processed using [entity schemas](#entity-schema) for normalization (via [canonicalization rules](#canonicalization-rules)), [entity extraction](#entity-extraction-rule), and [observation](#observation) creation. Directly submitted structured [sources](#source) undergo the same [entity schema](#entity-schema) processing for normalization, [entity extraction](#entity-extraction-rule), and [observation](#observation) creation."

**Forbidden Synonyms:**
- ❌ "content" (replaced by [source](#source) for clarity)
- ❌ "data" (too generic)
- ❌ "file" ([source](#source) includes files but also text, URLs, structured data)
- ❌ "document" (ambiguous)
- ❌ "source" ([source](#source) is the unified term; "source" was the old term for unstructured only)

### Truth Layer

**Definition:** Neotoma's architectural role — deterministic, immutable structured memory substrate.

**Use:** "Neotoma is the Truth Layer beneath Strategy Layer (e.g., Agentic Portfolio) and Execution Layer (e.g., Agentic Wallet)."

**Example:** "The Truth Layer stores all invoices, transactions, and contracts with full [provenance](#provenance), whether [stored](#storing) as unstructured [source](#source) (files) or structured [source](#source) (JSON with entity types), enabling other layers to make decisions based on accurate historical data."

**Forbidden Synonyms:**
- ❌ "data layer" (too generic)
- ❌ "memory layer" (ambiguous)
- ❌ "knowledge base" (implies semantic search)

## Legacy Terms (Deprecated)

These terms refer to the legacy record-based architecture that is being phased out in favor of [source](#source)-based architecture. They are documented here for reference during the migration period but should not be used in new code or documentation.

### Capability

**Definition:** **DEPRECATED** - Legacy term for processing specification. Will be removed in v0.2.15. Normalization rules and [entity extraction rules](#entity-extraction-rule) are now part of [entity schemas](#entity-schema). Use [entity type](#entity-type) instead.

**Status:** Will be removed in v0.2.15. [Entity schemas](#entity-schema) now include normalization and extraction rules directly.

**Example:** "Legacy: A [capability](#capability) defined normalization and extraction rules for processing structured data. Modern: Use [entity schemas](#entity-schema) which include normalization and extraction rules directly for each [entity type](#entity-type)."

**Forbidden Synonyms:**
- ❌ "schema" (use "[entity schema](#entity-schema)" instead)
- ❌ "type" (use "[entity type](#entity-type)" instead)
- ❌ "handler" (implementation detail)

### Record

**Definition:** Legacy term for a single [stored](#storing) document with [extracted](#extraction) truth (metadata + properties + [provenance](#provenance)). Deprecated in favor of [source](#source).

**Status:** Will be removed in v0.2.15. Use "[source](#source)" for all data (structured or unstructured) instead.

**Example:** "Legacy: A [record](#record) stored `{id: 'rec_001', type: 'invoice', properties: {invoice_number: 'INV-001'}}`. Modern: Use [source](#source) for all data, with entity type metadata for structured data."

**Forbidden Synonyms:**
- ❌ "document" (ambiguous with source file)
- ❌ "memory" (too vague)
- ❌ "entry" (too generic)

### Record Type

**Definition:** Legacy term for classification of a [record](#record) or document that determines [extraction](#extraction) rules and field mappings. Deprecated in favor of [entity types](#entity-type).

**Status:** Will be removed in v0.2.15. Use "[entity type](#entity-type)" for [entity](#entity) classification. [Entity schemas](#entity-schema) now include all processing rules.

**Example:** "Legacy: [Record type](#record-type) `invoice` determined which fields to [extract](#extraction). Modern: Use [entity type](#entity-type) `invoice` for [entity](#entity) classification. The invoice [entity schema](#entity-schema) defines normalization and extraction rules for processing structured [source](#source)."

**Forbidden Synonyms:**
- ❌ "schema type" (confusing - schemas apply to entity types, not record types)
- ❌ "entity type" (record type classifies documents, entity type classifies entities)
- ❌ "category" (too informal)
- ❌ "class" (programming term confusion)

## Forbidden Terms (Never Use)

### In Code or Docs:

- ❌ "dapp" → Use "app" (per user rules)
- ❌ "smart" (marketing language)
- ❌ "intelligent" (implies non-determinism)
- ❌ "learn" (Neotoma doesn't learn, it extracts)
- ❌ "understand" (Neotoma doesn't understand, it structures)

## Correct Usage Examples

**✅ Good:**

- "Neotoma [extracts](#extraction) structured fields from uploaded files."
- "[Entity](#entity) resolution generates canonical IDs for vendors."
- "The timeline displays [events](#event) derived from date fields."

**❌ Bad:**

- "Neotoma understands your documents using AI."
- "Smart extraction learns from your data."
- "Our intelligent system analyzes your files."

## Agent Instructions

Load when writing code, documentation, or UI text.

Constraints:

- MUST use canonical terms
- MUST NOT use forbidden synonyms
- MUST follow usage examples
