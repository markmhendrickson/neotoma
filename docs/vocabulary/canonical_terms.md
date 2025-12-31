# Neotoma Canonical Vocabulary
## Core Terms
### Truth Layer
**Definition:** Neotoma's architectural role — deterministic, immutable structured memory substrate.
**Use:** "Neotoma is the Truth Layer beneath Strategy Layer (e.g., Agentic Portfolio) and Execution Layer (e.g., Agentic Wallet)."
**Forbidden Synonyms:**
- ❌ "data layer" (too generic)
- ❌ "memory layer" (ambiguous)
- ❌ "knowledge base" (implies semantic search)
### Record
**Definition:** A single ingested document with extracted truth (metadata + properties + provenance).
**Use:** "Upload a file to create a record."
**Forbidden Synonyms:**
- ❌ "document" (ambiguous with source file)
- ❌ "memory" (too vague)
- ❌ "entry" (too generic)
### Schema Type
**Definition:** The classification of a record (e.g., `FinancialRecord`, `IdentityDocument`).
**Use:** "Schema type determines which fields to extract."
**Forbidden Synonyms:**
- ❌ "record type" (close, but use schema_type)
- ❌ "category" (too informal)
- ❌ "class" (programming term confusion)
### Entity
**Definition:** A canonical representation of a person, company, or location with deterministic ID.
**Use:** "Entity resolution generates canonical entity IDs."
**Forbidden Synonyms:**
- ❌ "object" (programming term)
- ❌ "item" (too generic)
### Event
**Definition:** A timeline event derived from extracted date fields.
**Use:** "Events appear on the timeline view."
**Forbidden Synonyms:**
- ❌ "activity" (too informal)
- ❌ "occurrence" (verbose)
### Ingestion
**Definition:** The process of uploading, extracting, and inserting a file into the memory graph.
**Use:** "Ingestion pipeline processes PDFs deterministically."
**Forbidden Synonyms:**
- ❌ "import" (ambiguous)
- ❌ "upload" (only one step)
- ❌ "processing" (too vague)
### Extraction
**Definition:** Deterministic rule-based field extraction from raw text.
**Use:** "Extraction uses regex to find invoice numbers."
**Forbidden Synonyms:**
- ❌ "parsing" (too generic)
- ❌ "analysis" (implies inference)
### Provenance
**Definition:** The source metadata for a record (file, timestamp, user).
**Use:** "Provenance ensures every record traces to its source."
**Forbidden Synonyms:**
- ❌ "metadata" (provenance is specific type of metadata)
- ❌ "origin" (informal)
### Memory Graph
**Definition:** The interconnected graph of records, entities, and events with typed edges.
**Use:** "The memory graph connects records to entities."
**Forbidden Synonyms:**
- ❌ "knowledge graph" (implies semantic reasoning)
- ❌ "data graph" (too generic)
## Forbidden Terms (Never Use)
### In Code or Docs:
- ❌ "dapp" → Use "app" (per user rules)
- ❌ "smart" (marketing language)
- ❌ "intelligent" (implies non-determinism)
- ❌ "learn" (Neotoma doesn't learn, it extracts)
- ❌ "understand" (Neotoma doesn't understand, it structures)
## Correct Usage Examples
**✅ Good:**
- "Neotoma extracts structured fields from uploaded files."
- "Entity resolution generates canonical IDs for vendors."
- "The timeline displays events derived from date fields."
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
