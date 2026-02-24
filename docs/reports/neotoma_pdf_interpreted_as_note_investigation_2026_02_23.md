# Neotoma: PDF interpreted as "note" instead of invoice/document — Investigation

**Date:** 2026-02-23  
**Purpose:** Root-cause analysis for file interpretation entity typing when an invoice PDF produced a `note` entity populated from the client message instead of an `invoice` (or `document`) with PDF-derived fields.

---

## 1. Summary

- **Symptom:** Invoice PDFs stored via `store_structured` with `file_path` + structured `agent_message` produced entities with `entity_type: "note"`, snapshot content = client message text, and `extraction_field_keys` / `extracted_keys` = `["role", "content", "turn_key", "schema_version"]` (i.e. structured message keys, not PDF-derived fields).
- **Root cause:** When the client sends **both** `entities` and `file_path` with the **same** `idempotency_key` (and no `file_idempotency_key`), the server runs the structured store first, then the unstructured store with that same key. The unstructured store finds the **existing source created by the structured store** (JSON body of the entities), re-downloads that JSON, and runs interpretation on it. The PDF is never stored or interpreted; the “document” sent to the LLM is the serialized conversation/agent_message, so the LLM returns `note` with message fields.
- **Fix (implemented):** When both entities and unstructured (file) are present and `file_idempotency_key` is omitted, the server now uses a derived key for the file (e.g. `{idempotency_key}-file`) so the file gets its own source and interpretation runs on the PDF, not on the structured payload.

---

## 2. Context (from report)

- **Client:** Store two PDFs via `store_structured` with `file_path` + `mime_type`: invoice `342_25_MARK_P.ALIO.pdf`, work report `Detalle.pdf`.
- **Payload:** Each call included a structured `agent_message` (role, content, turn_key) alongside the file, e.g. content: `"Attached: 342_25_MARK_P.ALIO.pdf (invoice 342/25). Retry for interpretation."`
- **Result:** Interpretation ran (on retry). Both PDFs produced entities with `entity_type: "note"`; snapshot content was the client message text; no invoice/document fields.

---

## 3. Root cause: idempotency key collision

### 3.1 Store flow when both entities and file are present

1. **Structured store runs first** (`storeStructuredInternal`) with `idempotency_key` (e.g. `conversation-{id}-{turn}-retry`).
2. It creates a **source** by calling `storeRawContent` with:
   - `fileBuffer = Buffer.from(JSON.stringify(entities), "utf-8")`
   - `mimeType: "application/json"`
   - `idempotencyKey: idempotency_key`
3. So the first source for that key is the **JSON body** of the entities (conversation + agent_message).
4. **Unstructured store** is then called with `idempotency_key: parsed.file_idempotency_key ?? parsed.idempotency_key`. If the client did not send `file_idempotency_key`, this is the **same** key.
5. The unstructured branch looks up an existing source by `idempotency_key` and finds the one just created (the JSON source).
6. It enters the **idempotency-key reinterpret** path: downloads “raw content” (the JSON), calls `extractTextFromBuffer`. For `application/json`, that returns `buffer.toString("utf8")` — the full JSON string.
7. `raw_text_length` is therefore the length of that JSON (e.g. a few hundred chars). The code then calls `extractWithLLM(rawText, ...)` with that string as “Document content.”
8. The LLM sees the JSON of the conversation and agent_message and “extracts” an entity — naturally returning something like `entity_type: "note"` and fields such as `role`, `content`, `turn_key`, `schema_version` from the message object.
9. The **PDF is never stored and never interpreted.** The “file” source for that idempotency key is the structured payload, not the PDF.

So:

- **Type selection:** The type is “note” because the “document” is the agent message JSON, not the invoice PDF.
- **Refinement source:** The refinement step correctly uses “extracted” fields, but those fields come from the LLM run on the JSON, so they are the structured message keys. There is no bug in refinement logic per se; the input to interpretation is wrong.
- **Extraction length:** The 202/194 character “raw text” is the length of the JSON string passed as document content, not a limit of PDF extraction.

### 3.2 Code references

- **Combined store:** `src/server.ts` — when `hasEntities && hasUnstructured`, unstructured is called with `idempotency_key: parsed.file_idempotency_key ?? parsed.idempotency_key` (same key if `file_idempotency_key` omitted).
- **Structured source creation:** `storeStructuredInternal` (same file) calls `storeRawContent` with the JSON buffer and that `idempotencyKey`.
- **Idempotency reinterpret:** Same file, idempotency hit branch downloads content, `extractTextFromBuffer` for JSON returns string; that string is passed to `extractWithLLM`.

---

## 4. How entity type and refinement work (for reference)

- **Type selection:** In `runInterpretation`, `entityType` comes from `entityData.entity_type` or `entityData.type` or `"generic"`, then alias resolution and optional LLM inference. So the type is whatever the **extraction** (LLM or CSV) produced. For the bug case, extraction was run on the JSON, so the LLM returned `note`.
- **Refinement:** `refineEntityTypeFromExtractedFields` in `schema_definitions.ts` treats `note` and `generic` as generic. It scores extracted field keys against schema required/optional fields. With only `role`, `content`, `turn_key`, `schema_version`, the note schema (e.g. `content` required) fits; invoice requires e.g. `invoice_number`, `invoice_date`, `amount_due`, `currency` — so refinement does not switch to invoice. Behavior is correct given the wrong extraction input.
- **Invoice/document detection:** There is no separate “invoice vs document” detector. The LLM extraction prompt (`docs/prompts/llm_extraction_system_prompt.md`) defines entity_type criteria (receipt, invoice, note, etc.). If the input to the LLM is the PDF body (after the fix), the LLM can classify invoice vs note correctly; previously the input was the message JSON.

---

## 5. Follow-ups and recommendations

### 5.1 Implemented

- **Idempotency key for file when both entities and file are present:** When `hasEntities && hasUnstructured` and `file_idempotency_key` is not provided, the server now uses a derived key for the unstructured store (`{idempotency_key}-file`) so the file is stored and interpreted under its own source. The PDF is then interpreted correctly; the structured source keeps the original `idempotency_key`. Change: `src/server.ts` (unstructuredOnlyArgs).

- **Reinterpret uses file source when available:** When the client calls `reinterpret(source_id)` and that source is the "structured twin" (mime_type `application/json`, has `idempotency_key` not ending with `-file`), the server looks up a sibling source with key `{idempotency_key}-file` for the same user. If found, it uses that file source’s stored content for extraction and LLM, then runs interpretation still against the requested `source_id` (so new observations attach to the source the user asked to reinterpret). Response includes `interpretation_used_file_source: true` when the linked file source was used. This fixes reinterpret for sources created *after* the idempotency-key fix (where both JSON and file sources exist). Sources created by the old bug (only JSON source, no `-file` sibling) still reinterpret the JSON; re-storing the file is required to get a file source for those.

### 5.2 Documentation

- **Document** in MCP/developer docs that when storing both entities (e.g. conversation + message) and a file, clients should send a **distinct** `file_idempotency_key` for the file (e.g. `file-<slug>`) so file and structured payload do not share a key. The server now auto-derives a file key when omitted, but explicit `file_idempotency_key` remains clearer and stable across retries.

### 5.3 Optional client hint for entity_type

- The pipeline does not currently accept a client hint for desired `entity_type` for file interpretation. Adding an optional hint (e.g. `interpret_entity_type_hint: "invoice"`) could be considered so the LLM or refinement prefers that type when the document is ambiguous.

### 5.4 PDF extraction limits

- PDF text extraction (`file_text_extraction.ts`) uses `pdf-parse` and returns full extracted text (no artificial page/size cap in code). Short extraction (e.g. 202 chars) in the bug case was from the JSON string, not from the PDF. For real PDFs, if extraction is short (e.g. image-only or scanned), the code already has a vision fallback (first-page image + vision model).

---

## 6. Related

- `reports/neotoma-import-debug-report-2026-02-10.md` — import and interpretation debugging.
- `reports/neotoma-mcp-interpretation-expected-vs-actual-2026-02-11.md` — interpretation expected vs actual.
- MCP spec: `file_idempotency_key` is optional; when both entities and file are present, using it avoids key collision (and the server now mitigates when it is omitted).
