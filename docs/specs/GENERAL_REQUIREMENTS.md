## MVP Ingestion
- The ingestion pipeline MUST deterministically ingest all user-selected source files in the configured import set and create **Records** with:
  - Extracted properties defined by the active **Schema Types**
  - Complete **Provenance** (file, timestamps, user, path or upload source)
  - Links into the **Memory Graph** (to related Records, Entities, and Events)
- The normalization layer MUST include a deterministic OCR pipeline for image-based and scanned documents, such that:
  - Given the same input image/PDF, the OCR output text is identical across runs (no randomness, no model drift in MVP), and
  - OCR failures or low-confidence regions are surfaced explicitly in metadata without fabricating or inferring missing content.
- For any source file that represents more than one logical **Event** (e.g., logs, chats, multi-transaction statements), ingestion MUST:
  - Create at least one **file-level Record** representing the source file, and
  - Create additional **Records and/or Events** for each logical event, with deterministic, rule-based mapping from the file content, and
  - Link all event-derived records back to the file-level Record in the Memory Graph.
- For CSV and spreadsheet source files, ingestion MUST:
  - Create one **file-level Record** for the spreadsheet, and
  - Create one **row-level Record** per non-header row according to the configured Schema Type, and
  - Preserve deterministic linkage between each row-level Record and the file-level Record in the Memory Graph.
- For chat transcripts (e.g., logs exported from LLM apps), MVP MUST provide a **separate CLI tool or flow** (outside the Truth Layer ingestion pipeline) that can:
  - Non-deterministically convert a raw chat export into well-structured JSON files (one record per JSON object with explicit schema types and properties), and then
  - Feed the resulting JSON files into the standard deterministic ingestion path described above, so that Neotoma itself never performs non-deterministic interpretation of chat content.
### MVP Schema Catalog
- For MVP, the system MUST use a curated **Tier 1 / Tier 2 schema catalog** (financial, tax, transactional, and core administrative document types) defined statically in the canonical type mappings and extraction rules, with a deterministic generic fallback (e.g., `PDFDocument`) for unrecognized documents.
- The initial schema catalog SHOULD be fleshed out **within Tier 1 (and selectively Tier 2)** by:
  - Deriving additional Tier 1 schema types from representative real-world sample files (including those in the initial import set), and
  - Adding only those Tier 2 schemas that are clearly high-leverage for the MVP ICPs,
  - Always preserving all determinism, explainability, and schema-first constraints from the Neotoma manifest.
## MVP UI
- The design system MUST present information at an effective density comparable to Notion, implemented via:
  - Compact but readable typography and spacing, and
  - Layouts that surface all core properties of a selected Record without excessive scrolling.
- The UI MUST present one primary data focus per screen or panel (e.g., Records list, Record detail, Timeline, Entities), and MUST NOT present multi-surface dashboards that mix unrelated data types in a way that overwhelms users in MVP.
