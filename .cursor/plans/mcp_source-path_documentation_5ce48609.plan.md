---
name: MCP source-path documentation
overview: Improve MCP instructions and documentation so agents and implementers consistently use the structured path for conversation- or tool-sourced data and the unstructured path for file- or resource-sourced data, with clear source-to-path rules and aligned wording everywhere.
todos: []
isProject: false
---

# MCP documentation: conversation- vs file/resource-sourced storage paths

## Goal

Make the **source of the data** (where it came from) the explicit basis for choosing the storage path, and align all MCP-facing text and docs to that rule so agents and readers see one consistent story.

## Current state

- **[MCP_SPEC.md](docs/specs/MCP_SPEC.md)** (sections 2.6 and 3.1): Decision logic is input-shaped ("Raw file content?" / "Structured source?") and filename guidance mentions "data from chat or another MCP, not from a file" but does not frame a single "source → path" rule.
- **[instructions.md](docs/developer/mcp/instructions.md)**: Tells agents to store from "conversational contexts" and "from chat or other MCPs (not from a file)" and to omit `original_filename` in that case; does not state "use structured path for conversation/tool-sourced, unstructured for file/resource-sourced."
- **[tool_descriptions.yaml](docs/developer/mcp/tool_descriptions.yaml)**: Describes `store` / `store_structured` / `store_unstructured` by input shape (entities vs file), not by source of data.
- **[mcp_overview.md](docs/developer/mcp_overview.md)**: Only shows a structured-store example; no guidance on when to use file vs entities or on source types.

## Recommended changes

### 1. Add a canonical "source → path" rule in MCP_SPEC

**File:** [docs/specs/MCP_SPEC.md](docs/specs/MCP_SPEC.md)

- In **section 2.6** ("Using the Unified `store` Action"), add a short **"Choosing the storage path by source"** subsection **before** the existing "For Unstructured Source" / "For Structured Source" blocks.
- State the rule explicitly:
  - **Conversation-sourced or tool-sourced:** Data from what the user said in chat, or from another MCP/tool (e.g. email, calendar) where the agent is extracting entities. Use the **structured** path: `store` or `store_structured` with an `entities` array. Omit `original_filename`.
  - **File-sourced or resource-sourced:** User attached a file, or the agent has a file/blob to preserve as an artifact (eime_type or `file_path`). Use the **unstructured** path: `store` or `store_unstructured` with `file_content`+`mime_type` or `file_path`. Do not interpret the file; pass it raw so the server can store and optionally interpret.
- Add one sentence of rationale: choosing by source keeps provenance correct (artifact vs agent-derived) and avoids double interpretation of files.
- **Reframe the existing "Decision Logic"** (currently two bullets around lines 297–299) to use this source framing, e.g.:
  - "**File- or resource-sourced** (user attachment or a file/blob to preserve) → use `store` with `file_content`+`mime_type` or `file_path`."
  - "**Conversation- or tool-sourced** (what the user said or structured data from another MCP) → use `store` with `entities`. Omit `original_filename`."
- Keep all existing schema and parameter details; only add the subsection and adjust the decision bullets.

### 2. Add the same rule to MCP server instructions

**File:** [docs/developer/mcp/instructions.md](docs/developer/mcp/instructions.md)

- Inside the instruction block (the fenced block that the server sends to clients), add one or two lines that agents see at runtime:
  - Use the **structured** path (store with `entities`) for data from **conversation** or from **other MCPs** (e.g. email, calendar) when you are extracting and storing entities; omit `original_filename`.
  - Use the **unstructured** path (store with `file_content`+`mime_type` or `file_path`) when the user **attached a file** or you have a **file/resource to preserve**; pass the raw file and do not interpret it yourself.
- Place these near the existing line "When storing structured data from chat or other MCPs (not from a file), omit original_filename" so the rule is co-located with the filename rule (e.g. immediately before or after it). Optionally fold that line into the new "structured path" line to avoid repetition.

### 3. Align tool descriptions with source framing

**File:** [docs/developer/mcp/tool_descriptions.yaml](docs/developer/mcp/tool_descriptions.yaml)

- **store:** Prepend a single sentence to the existing description: e.g. "Choose path by source: file- or resource-sourced (attachment/file to preserve) → use file_content+ mime_type or file_path; conversation- or tool-sourced (chat or other MCP) → use entities." Then keep the rest of the current store description unchanged.
- **store_structured:** Change to something like: "Store structured entities only. Use for **conversation- or tool-sourced** data (e.g. from chat or another MCP). Use when you already have entity objects and do not need file ingestion."
- **store_unstructured:** Change to something like: "Store raw files only. Use when data is **file- or resource-sourced** (user attachment or file to preserve). Provide file_content (base64) + mime_type or file_path."

Keep YAML formatting and length constraints so the server still loads the file; shorten if the combined store description exceeds client limits.

### 4. Add a short "When to use which path" note in mcp_overview

**File:** [docs/developer/mcp_overview.md](docs/developer/mcp_overview.md)

- In "What MCP provides" or immediately after the store example, add a brief note:
  - "**Storing:** Use the **structured** path (store with `entities`) for conversation- or tool-sourced data; use the **unstructured** path (store with `file_content`/`file_path`) for file- or resource-sourced data. See MCP_SPEC section 2.6 for the full rule."
- Optionally add a second example showing an unstructured-store case (e.g. store with `file_path` and `mime_type`) so both paths are represented.

### 5. Optional: vocabulary entry for source origin

**File:** [docs/vocabulary/canonical_terms.md](docs/vocabulary/canonical_terms.md)

- If you want a single place that defines the terms used in the spec and instructions, add a short note under **Source** (or a small "Source origin" subsection):
  - **Conversation-sourced:** Data from what the user said in chat or from the agent’s dialogue context; store via the structured path.
  - **File-sourced / resource-sourced:** Data that is a user-attached file or another artifact (file/blob) to preserve; store via the unstructured path so the server can store the artifact and optionally run interpretation.
- This is optional; the spec and instructions can be clear without changing the vocabulary, but it helps downstream docs and future edits to reuse the same terms.

## Out of scope

- No changes to server code ([src/server.ts](src/server.ts)) or to request/response schemas.
- No new MCP actions or parameters.
- No changes to interpretation behavior or provenance storage; only documentation and instruction text.

## Validation

- After edits: read through [docs/specs/MCP_SPEC.md](docs/specs/MCP_SPEC.md) section 2.6 and [docs/developer/mcp/instructions.md](docs/developer/mcp/instructions.md) and confirm the rule is stated the same way (conversation/tool → structured, file/resource → unstructured).
- Confirm [docs/developer/mcp/tool_descriptions.yaml](docs/developer/mcp/tool_descriptions.yaml) is valid YAML and that the server still loads instructions and tool descriptions (manual or existing test).
- If vocabulary is updated, ensure [docs/specs/MCP_SPEC.md](docs/specs/MCP_SPEC.md) and instructions reference the same terms (conversation-sourced, file-sourced, resource-sourced) for consistency.
