# Neotoma canonical vocabulary

This page defines the terms Neotoma's code, docs, and UI text use, the synonyms to avoid, and the retired category nouns.

Applies to v0.25.0 and main.

## Core terms

### System of Record

**Definition:** The role Neotoma plays: it keeps observations with their sources and computes the current value of each field, for connected agents to read. The full category line is "the system of record for AI agents".

**Use:** "Neotoma is the system of record beneath agents, pipelines, and applications. They read the record, act outside it, and write their results back as observations."

**Example:** "An agent stores an invoice and its vendor. Neotoma keeps both observations with their source, and any agent connected later reads the same current values and can see which observation set each field."

**Forbidden synonyms:**

- "state layer" (retired category noun)
- "memory layer" (retired category noun)
- "truth layer" (retired category noun)
- "deterministic state" (retired category noun; the reducer is deterministic, the category is not named after it)
- "data layer" (too generic)
- "knowledge base" (implies semantic reasoning)

The phrase "your agents forget" is also retired as a framing. The contrast to use is "a record, not recall".

### Canonicalization Rules

**Definition:** The rules that normalize an entity's identity so the same thing resolves to the same [entity](#entity) id. In current [entity schemas](#entity-schema) these are the `canonical_name_fields` rules: the fields, single or composite, that form the canonical name. Values are normalized before hashing.

**Use:** "The built-in invoice schema's canonicalization rule is the composite of `invoice_number`, `vendor_name`, and `invoice_date`."

**Example:** "Two stores of a company named 'Acme Corp' and 'acme corp' normalize to the same canonical name and resolve to one entity id."

**Forbidden synonyms:**

- "normalization" (canonicalization is the specific normalization used for identity)
- "standardization" (too generic)

### Entity

**Definition:** One person, company, task, invoice, or other thing that [observations](#observation) are about. Its id is `ent_` followed by a hash of the [entity type](#entity-type) and its identity fields.

**Use:** "Entity resolution maps each stored item to its canonical entity id."

**Example:** "Observations from two invoices that name 'Acme Corp' and 'ACME CORP' resolve to the same company entity."

**Forbidden synonyms:**

- "object" (programming term)
- "item" (too generic)

### Entity Schema

**Definition:** The versioned definition for an [entity type](#entity-type), stored in the schema registry: fields and their types, the merge policy for each field, [canonicalization rules](#canonicalization-rules), and which fields produce timeline [events](#event). The [reducer](#reducer) uses it to compute [entity snapshots](#entity-snapshot).

**Use:** "Each entity type has an entity schema that defines its fields, merge policies, and identity rules."

**Example:** "The built-in invoice entity schema declares fields such as `invoice_number`, `invoice_date`, `amount_due`, and `vendor_name`, uses the composite of `invoice_number`, `vendor_name`, and `invoice_date` as its identity, and lists its temporal fields."

**Forbidden synonyms:**

- "schema" (too generic; say "entity schema")
- "capability" (legacy; see [Capability](#capability))
- "record type" (entity schemas apply to entity types)
- "database schema" (an entity schema defines domain fields, not database tables)

### Entity Type

**Definition:** The classification of an [entity](#entity) that selects its [entity schema](#entity-schema) and identity rules, for example `person`, `company`, `invoice`, `transaction`, or `release`.

**Use:** "Each entity has an `entity_type` that determines which entity schema applies."

**Example:** "An entity with `entity_type: 'company'` resolves by the company identity fields, while an `invoice` entity resolves by invoice number, vendor name, and invoice date together."

**Forbidden synonyms:**

- "record type" (legacy term; see [Record Type](#record-type))
- "schema type" (the entity type is the classification; the entity schema is the definition)
- "type" (too generic)
- "category" (too informal)

### Event

**Definition:** A timeline event derived from a date field on an [entity snapshot](#entity-snapshot). An event carries `source_id`, `entity_id`, and the `source_field` that held the date.

**Use:** "Timeline events are derived from date fields, and the entity schema can name which fields count."

**Example:** "An invoice with `invoice_date: '2025-01-15'` produces an event with `event_type: 'InvoiceIssued'`, `event_timestamp: '2025-01-15T00:00:00Z'`, and `source_field: 'invoice_date'`."

**Forbidden synonyms:**

- "activity" (too informal)
- "occurrence" (verbose)

### Retrieving

**Definition:** Reading [entities](#entity), [observations](#observation), [entity snapshots](#entity-snapshot), and [relationships](#relationship) from the record: querying entities by type or identifier, reading a snapshot with its [provenance](#provenance), listing an entity's observations, and traversing relationships.

**Use:** "Use `retrieve_entities` to query entities by type, or `retrieve_entity_snapshot` to read the current values of one entity."

**Example:** "`retrieve_entities` with `entity_type: 'invoice'` returns invoice entities with their snapshots. `retrieve_entity_snapshot` returns one entity's current values and, for each field, the observation that set it."

**Forbidden synonyms:**

- "fetch" (too generic)
- "load" (implies loading into memory)
- "get" (too generic; use the specific action name)

### Extraction

**Definition:** Turning the content of a [source](#source) into fields. For a structured payload the caller supplies the fields. For a file, the agent or client extracts the fields and records them as an [interpretation](#interpretation); Neotoma does not run an extraction model over stored files.

**Use:** "The agent extracted the invoice fields from the PDF and stored them with an interpretation block."

**Example:** "A client reads `invoice.pdf`, extracts `invoice_number: 'INV-001'` and the vendor name, and stores them linked to the file's source."

**Forbidden synonyms:**

- "parsing" (too generic)
- "analysis" (implies inference)

### Storing

**Definition:** Writing data into Neotoma with the `store` action (MCP tool, `POST /store`, or `neotoma store`). A store takes structured entities (`entities`) or a file (`file_content` with `mime_type`, or `file_path` on the server's own filesystem). Files are kept as [sources](#source). Structured entities are resolved to [entities](#entity) and written as [observations](#observation); fields the [entity schema](#entity-schema) does not declare are kept as [raw fragments](#raw-fragment).

**Use:** "Storing writes observations; the reducer then recomputes each affected entity's snapshot."

**Example:** "An agent stores `{entities: [{entity_type: 'invoice', invoice_number: 'INV-001', vendor_name: 'Acme Corp'}]}`. Neotoma records the source, resolves the invoice entity, writes one observation, and derives a timeline event from the invoice date."

**Forbidden synonyms:**

- "import" (ambiguous)
- "upload" (only one step)
- "processing" (too vague)
- "ingestion" (replaced by "storing"; see [Ingestion](#ingestion))

### Interpretation

**Definition:** A record of one extraction over a stored [source](#source): the entities a client extracted from it and the configuration the client reports (provider, model, temperature, and a prompt hash). Observations written from an interpretation carry its `interpretation_id`.

**Use:** "Each new interpretation of a source adds new observations and leaves the earlier ones in place."

**Example:** "A client extracts an invoice from `invoice.pdf` with one model and stores it with an interpretation. Extracting again with a different model adds a second interpretation and new observations; the first set stays listed."

**Forbidden synonyms:**

- "interpretation run" (say "interpretation")
- "analysis" (implies inference)
- "processing" (too vague)

### Entity Graph

**Definition:** The connected set of [sources](#source), [observations](#observation), [entities](#entity), [relationships](#relationship), and [events](#event), joined by typed links.

**Use:** "The entity graph links each observation to its source and to the entity it describes."

**Example:** "Source `src_invoice_pdf` links to an observation of the invoice entity, and the payment entity has a `SETTLES` relationship to that invoice."

**Forbidden synonyms:**

- "memory graph" (retired)
- "knowledge graph" (implies semantic reasoning)
- "data graph" (too generic)

### Observation

**Definition:** A set of field values about one [entity](#entity), written at one time. Observations from a store or an [interpretation](#interpretation) are linked to their [source](#source); a correction observation has no source. The [reducer](#reducer) merges an entity's observations into its [entity snapshot](#entity-snapshot). A fact enters Neotoma as an observation.

**Use:** "Each observation records where it came from, when it was observed, and its source priority."

**Example:** "An observation of the company entity carries `fields: {name: 'Acme Corp', address: '123 Main St'}`, `source_id: 'src_001'`, `observed_at: '2025-01-15T10:30:00Z'`, and `source_priority: 0`."

**Forbidden synonyms:**

- "datum" (too technical)
- "extraction" (the observation is the result; extraction is the process)

### Provenance

**Definition:** Where a value came from: the [observation](#observation) that set it, that observation's [source](#source) and [interpretation](#interpretation) when it has them, when it was observed, and the user it belongs to. Each field of an [entity snapshot](#entity-snapshot) names the observation that set it.

**Use:** "Provenance lets an agent trace a current value back to the observation and source behind it."

**Example:** "The `vendor_name` field of an invoice snapshot names observation `obs_123`, which links to `source_id: 'src_abc123'` (the uploaded PDF) and `interpretation_id: 'int_xyz789'`, with `observed_at: '2025-01-15T10:30:00Z'`. A value set by a correction names the correction observation, which has no source."

**Forbidden synonyms:**

- "metadata" (provenance is a specific kind of metadata)
- "origin" (informal)

### Raw Fragment

**Definition:** A field value that arrived with an [observation](#observation) but is not declared in the [entity schema](#entity-schema). Raw fragments are kept with the entity, source, and interpretation they came from, so a schema can declare the field later.

**Use:** "Undeclared fields are kept as raw fragments rather than dropped."

**Example:** "An invoice stored with an undeclared `po_reference` field keeps that value as a raw fragment of the invoice entity."

**Forbidden synonyms:**

- "extra fields" (informal)
- "junk data" (the values are kept on purpose)

### Reducer

**Definition:** The function that merges an entity's [observations](#observation) into its [entity snapshot](#entity-snapshot), field by field, using the merge policy in the [entity schema](#entity-schema). The same observations and merge policies always produce the same snapshot.

**Use:** "The reducer recomputes the snapshot after every write to the entity."

**Example:** "Given observations `{name: 'Acme'}` with priority 0 and `{name: 'Acme Corp'}` with priority 100, the `highest_priority` policy produces `{name: 'Acme Corp'}`."

**Forbidden synonyms:**

- "merger" (too generic)
- "aggregator" (implies accumulation)
- "combiner" (too generic)

### Relationship

**Definition:** A typed connection between two [entities](#entity), for example `PART_OF` or `SETTLES`. The type vocabulary is a runtime registry read with `list_relationship_types`. Relationships are stored as relationship observations with [provenance](#provenance) and reduced to relationship snapshots. Deleting a relationship adds an observation that marks it deleted, and `restore_relationship` restores it; neither edits the earlier observations.

**Use:** "Relationships connect entities in the entity graph with typed links."

**Example:** "The relationship `{relationship_type: 'SETTLES', source_entity_id: 'ent_payment_456', target_entity_id: 'ent_invoice_123'}` records that the payment settles the invoice, with metadata `{amount: 1500.00}`."

**Forbidden synonyms:**

- "link" (too generic)
- "connection" (too generic)
- "edge" (implementation detail; "relationship" is the domain term)

### Entity Snapshot

**Definition:** The [reducer](#reducer)'s output for one [entity](#entity): the current value of each field, computed from all of its [observations](#observation), with each field naming the observation that set it. "Current state" is fine in prose for what a snapshot shows.

**Use:** "Entity snapshots are recomputed from observations whenever the entity changes."

**Example:** "The snapshot of the company entity merges `{name: 'Acme Corp'}`, `{address: '123 Main St'}`, and `{tax_id: '12-3456789'}` into one set of fields, and its provenance names the observation behind each."

**Forbidden synonyms:**

- "merged data" (the snapshot is the computed result)
- "aggregate" (implies accumulation)

### Snapshot

Short form of [entity snapshot](#entity-snapshot), used where the context is clear. Relationships have relationship snapshots, computed the same way.

### Source

**Definition:** The input a write arrived with: a file, raw text, or a structured payload. Files are stored with SHA-256 content hashing, unique per user, so the same file stored twice reuses one source. Observations link to their source through `source_id`.

**Use:** "Every observation from a store traces to its source."

**Example:** "A source can be `invoice.pdf`, a pasted text, or the JSON payload of a `store` call. An agent that extracts entities from the PDF stores them linked to the PDF's source."

**Source origin for MCP stores:**

- **Conversation-sourced:** data the user said in chat or that comes from the agent's dialogue; store it through the structured path (`store` with `entities`).
- **File-sourced or resource-sourced:** a user-attached file or another artifact to keep; store it through the file path (`store` with `file_content` or `file_path`) so the artifact is kept as a source.

**Forbidden synonyms:**

- "content" (say "source")
- "data" (too generic)
- "file" (a source can also be text or a structured payload)
- "document" (ambiguous)
- "source material" (older term; say "source")

## Legacy terms

These terms belong to the earlier record-based design. They are listed so older docs and code comments can be read. Do not use them in new code or docs.

### Capability

**Definition:** Legacy processing specification from the capability registry (`src/services/capability_registry.ts`), which carried canonicalization and entity extraction rules per intent. Entity schemas replaced it; the store path does not use it.

**Forbidden synonyms:**

- "schema" (say "entity schema")
- "type" (say "entity type")
- "handler" (implementation detail)

### Entity Extraction Rule

**Definition:** Legacy capability rule (`field_value`, `payload_self`, or `array_items`) that derived several entities from one structured payload. In the current store path the caller sends one entry per entity in `entities` and links them with relationships.

**Forbidden synonyms:**

- "extraction rule" (too generic)
- "mapping" (too generic)

### Ingestion

Older name for [storing](#storing). Docs that still say "ingestion" mean storing.

### Record

**Definition:** In the earlier design, a record was one stored document with its extracted properties. That data type is retired; say [source](#source) for the input and [observation](#observation) for what was extracted from it. "The record" in "system of record" means Neotoma's stored observations and snapshots as a whole, which is a different sense.

**Forbidden synonyms:**

- "document" (ambiguous with a source file)
- "memory" (too vague)
- "entry" (too generic)

### Record Type

**Definition:** Legacy classification of a record that chose its extraction rules. Say [entity type](#entity-type) for the classification of entities.

**Forbidden synonyms:**

- "schema type" (schemas apply to entity types)
- "entity type" (a record type classified documents, not entities)
- "category" (too informal)
- "class" (programming term)

## Forbidden terms in code and docs

- "dapp": say "app"
- "smart": marketing language
- "intelligent": implies inference
- "learn": Neotoma does not learn; it records observations
- "understand": Neotoma does not understand content; it stores fields
- "memory layer", "state layer", "truth layer", and "deterministic state" as names for what Neotoma is: say "system of record"

## Usage examples

Use:

- "Neotoma stores the fields an agent extracted from an uploaded file, linked to the file."
- "Entity resolution gives each vendor one canonical id."
- "The timeline shows events derived from date fields."

Avoid:

- "Neotoma understands your documents using AI."
- "Smart extraction learns from your data."
- "Neotoma is the memory layer for your agents."

## Agent Instructions

Load this page when writing code, documentation, or UI text.

Constraints:

- MUST use the canonical terms on this page
- MUST NOT use the forbidden synonyms or the retired category nouns
- MUST follow the usage examples
