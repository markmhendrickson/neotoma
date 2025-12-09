## Release v0.2.0 — Chat Transcript Extraction Tool

_(Pre-MVP Internal Release for Chat Transcript Processing)_

---

### 1. Release Overview

- **Release ID**: `v0.2.0`
- **Name**: Chat Transcript Extraction Tool
- **Goal**: Provide a standalone CLI tool for converting chat transcripts (e.g., ChatGPT exports) into structured JSON files with schema types that can be ingested deterministically by Neotoma's Truth Layer.
- **Priority**: P1 (pre-MVP, enables chat transcript ingestion workflow)
- **Target Ship Date**: Before MVP (v1.0.0)

#### 1.1 Canonical Specs (Authoritative Sources)

- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **General Requirements**: `docs/specs/GENERAL_REQUIREMENTS.md`
- **MVP Feature Units**: `docs/specs/MVP_FEATURE_UNITS.md` (FU-106)
- **MVP Execution Plan**: `docs/specs/MVP_EXECUTION_PLAN.md` (FU-106)

This release plan coordinates the chat transcript extraction tool into a concrete release.

---

### 2. Scope

#### 2.1 Included Feature Units

- `FU-106`: Chat Transcript to JSON CLI Tool
  - CLI tool for converting chat transcripts to structured JSON files
  - Support for common export formats (ChatGPT JSON, HTML, text)
  - LLM-based interpretation (OpenAI/Anthropic APIs allowed, outside Truth Layer)
  - Interactive field mapping/correction mode
  - JSON output with schema types (one file per record)
  - Documentation and usage examples

#### 2.2 Explicitly Excluded

- Integration with Truth Layer ingestion pipeline (tool runs separately)
- UI components (CLI-only tool)
- Multi-user infrastructure (standalone tool)
- CSV output format (JSON only)

---

### 3. CLI Interface Specification

#### 3.1 Command Syntax

**Basic Usage:**

```bash
npm run chat-to-json <input-file> <output-dir> [options]
```

**Arguments:**

- `<input-file>`: Path to chat transcript file (required)
  - Supported formats: JSON (ChatGPT export), HTML, plain text
  - Auto-detected based on file extension and content
- `<output-dir>`: Directory for output JSON files (required)
  - Created if it doesn't exist
  - One JSON file per extracted record

**Options:**

- `--interactive` / `-i`: Enable interactive field mapping mode
- `--format <format>`: Force input format (json|html|text)
- `--model <model>`: LLM model to use (default: gpt-4o-mini)
- `--provider <provider>`: LLM provider (openai|anthropic, default: openai)
- `--verbose` / `-v`: Enable verbose logging
- `--help` / `-h`: Show help message

**Examples:**

```bash
# Basic conversion
npm run chat-to-json chat-export.json ./output

# Interactive mode
npm run chat-to-json -- --interactive chat-export.json ./output

# Force format and specify model
npm run chat-to-json -- --format html --model gpt-4o chat.html ./output

# Verbose output
npm run chat-to-json -- --verbose chat-export.json ./output
```

#### 3.2 Output Format

**JSON File Structure:**
Each output file follows Neotoma's standard record format:

```json
{
  "type": "message",
  "properties": {
    "schema_version": "1.0",
    "sender": "user",
    "recipient": "assistant",
    "subject": "Question about API",
    "body": "How do I use the API?",
    "sent_at": "2024-01-15T10:30:00Z"
  },
  "file_urls": ["local://chat-export.json"],
  "summary": "User asked about API usage"
}
```

**File Naming:**

- Format: `record_<index>_<schema-type>_<timestamp>.json`
- Example: `record_001_message_20240115T103000Z.json`
- Index: Sequential number starting from 001
- Timestamp: ISO 8601 format (UTC)

#### 3.3 Error Handling

**Exit Codes:**

- `0`: Success
- `1`: General error (invalid arguments, file not found, etc.)
- `2`: LLM API error (authentication, rate limit, etc.)
- `3`: Parsing error (invalid input format)
- `4`: Output error (cannot write to output directory)

**Error Messages:**

- Clear, actionable error messages
- Include file paths and line numbers where applicable
- Suggest solutions for common issues

**Example Error Output:**

```
Error: Input file not found: chat-export.json
  Hint: Check file path and permissions

Error: LLM API authentication failed
  Hint: Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable

Error: Invalid JSON format in input file
  Hint: Verify file is valid ChatGPT export JSON
```

#### 3.4 Interactive Mode

**Flow:**

1. Tool parses input and extracts records using LLM
2. Displays extracted fields and proposed schema types
3. User can:
   - Review and edit field mappings
   - Change schema type assignments
   - Skip records
   - Confirm and proceed
4. Tool exports final JSON files with user corrections

**UI Format:**

```
Extracted Record 1/5:
Schema Type: message
Fields:
  sender: user
  recipient: assistant
  body: How do I use the API?
  sent_at: 2024-01-15T10:30:00Z

Actions:
  [E]dit fields
  [C]hange schema type
  [S]kip
  [A]ccept
  [Q]uit

>
```

---

### 4. Release-Level Acceptance Criteria

#### 4.1 Product

- CLI tool successfully converts chat transcripts to JSON files with schema types
- Output JSON files can be ingested deterministically by Neotoma's standard ingestion path
- Interactive mode allows users to correct field mappings before export
- Tool handles common export formats (ChatGPT JSON, HTML, text)

#### 4.2 Technical

**Implementation Requirements:**

- CLI script functional (`scripts/chat-to-json.ts`)
- Parsers for supported export formats (ChatGPT JSON, HTML, text)
- LLM-based interpretation working (OpenAI/Anthropic API integration)
- JSON output follows standard record format (type, properties, file_urls, summary)
- Each JSON file contains one record object with schema type
- Unit tests for format parsers
- Integration tests for full CLI workflow
- E2E tests: CLI output → Neotoma JSON ingestion

**Technical Specifications:**

- **Format Parsers:**

  - ChatGPT JSON: Parse standard ChatGPT export format
  - HTML: Extract text from HTML structure, handle nested elements
  - Plain Text: Parse line-separated or structured text formats
  - Auto-detection: Detect format from file extension and content

- **LLM Integration:**

  - Provider: OpenAI (default) or Anthropic
  - Model: Configurable (default: gpt-4o-mini)
  - Prompt: Structured prompt for record extraction and schema type assignment
  - Error Handling: Retry logic, rate limit handling, timeout management

- **JSON Output Validation:**
  - Schema validation against Neotoma record format
  - Required fields: type, properties, file_urls
  - Optional fields: summary
  - Properties must include schema_version

#### 4.3 Business

- Tool enables chat transcript ingestion workflow without violating Truth Layer determinism constraints
- Users can pre-process chat exports before ingestion
- Tool preserves separation between non-deterministic interpretation (CLI) and deterministic ingestion (Truth Layer)

---

### 5. Technical Implementation Details

#### 5.1 Architecture

**Component Structure:**

```
scripts/chat-to-json.ts (CLI entry point)
├── src/cli/parsers/
│   ├── json_parser.ts (ChatGPT JSON parser)
│   ├── html_parser.ts (HTML parser)
│   └── text_parser.ts (Plain text parser)
├── src/cli/llm/
│   ├── interpreter.ts (LLM-based interpretation)
│   └── prompts.ts (Prompt templates)
├── src/cli/interactive/
│   └── field_mapper.ts (Interactive field mapping)
└── src/cli/output/
    └── json_writer.ts (JSON file writer)
```

#### 5.2 LLM Integration

**Provider Selection:**

- Environment variable: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- CLI option: `--provider <provider>`
- Default: OpenAI if `OPENAI_API_KEY` is set, otherwise Anthropic

**Model Selection:**

- Default: `gpt-4o-mini` (cost-effective, sufficient accuracy)
- Configurable via `--model` option
- Supported models:
  - OpenAI: `gpt-4o-mini`, `gpt-4o`, `gpt-4-turbo`
  - Anthropic: `claude-3-haiku`, `claude-3-sonnet`, `claude-3-opus`

**Prompt Structure:**

```
You are extracting structured records from a chat transcript.

Input transcript:
{transcript_content}

Extract records following these rules:
1. Identify distinct records (messages, notes, tasks, code snippets)
2. Assign appropriate schema types from: {schema_types}
3. Extract fields according to schema type requirements
4. Include timestamps where available
5. Generate concise summaries

Output format: JSON array of records
```

**Error Handling:**

- Retry logic: 3 retries with exponential backoff
- Rate limit handling: Wait and retry
- Timeout: 60 seconds per LLM call
- Fallback: Return partial results if LLM fails

#### 5.3 Format Parsers

**ChatGPT JSON Parser:**

- Parse standard ChatGPT export JSON structure
- Extract messages, metadata, timestamps
- Handle nested conversation structures
- Preserve message order

**HTML Parser:**

- Use HTML parser library (e.g., `cheerio` or `jsdom`)
- Extract text content from HTML elements
- Handle common HTML export structures
- Preserve message boundaries

**Plain Text Parser:**

- Parse line-separated formats
- Detect message boundaries (timestamps, separators)
- Handle markdown-like formatting
- Preserve message order

**Format Detection:**

1. Check file extension (.json, .html, .txt)
2. Check file content (JSON structure, HTML tags, plain text)
3. Use detected format or CLI-specified format

#### 5.4 JSON Output Schema

**Record Format:**

```typescript
interface OutputRecord {
  type: string; // Schema type (e.g., "message", "note", "task")
  properties: {
    schema_version: string; // Required: "1.0"
    [key: string]: unknown; // Type-specific fields
  };
  file_urls: string[]; // Array of source file URLs
  summary?: string; // Optional human-readable summary
}
```

**Schema Type Assignment:**

- Use LLM to analyze content and assign schema types
- Supported types: `message`, `note`, `task`, `code`, etc.
- Fallback to `message` if type cannot be determined
- User can override in interactive mode

**Field Mapping:**

- Extract fields based on schema type requirements
- Map transcript fields to record properties
- Handle missing fields gracefully
- User can correct mappings in interactive mode

#### 5.5 Interactive Mode Implementation

**Data Structures:**

```typescript
interface ExtractedRecord {
  proposedType: string;
  fields: Record<string, unknown>;
  confidence: number;
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
  value: unknown;
}
```

**User Interface:**

- Terminal-based interactive prompts
- Display extracted records one at a time
- Allow editing fields, changing schema types
- Save corrections to final JSON output

**State Management:**

- Track user corrections
- Apply corrections to final output
- Support undo/redo (optional)

#### 5.6 Validation and Error Handling

**Input Validation:**

- File exists and is readable
- File format is supported
- Output directory is writable
- LLM API key is configured

**Output Validation:**

- JSON files are valid JSON
- Records follow standard format
- Required fields are present
- Schema types are valid

**Error Recovery:**

- Continue processing if one record fails
- Log errors for failed records
- Generate partial output if possible

---

### 6. Cross-FU Integration Scenarios (High-Level)

These scenarios must pass end-to-end before v0.2.0 is approved:

1. **Chat Transcript Conversion Flow**

   - User exports chat transcript from ChatGPT (JSON format)
   - Run CLI: `npm run chat-to-json -- chat-export.json output_dir/`
   - Tool parses transcript, uses LLM to interpret content
   - Tool outputs JSON files (one per extracted record) with schema types
   - User reviews/corrects field mappings in interactive mode
   - Final JSON files exported to output directory

2. **JSON Ingestion Validation**

   - Take JSON files from CLI output
   - Ingest JSON files via Neotoma's standard ingestion path
   - Verify records created with correct schema types
   - Verify properties extracted correctly
   - Verify deterministic ingestion (same JSON → same record)

3. **Multiple Format Support**
   - Test with ChatGPT JSON export
   - Test with HTML export
   - Test with plain text export
   - Verify consistent JSON output format across all input formats

---

### 7. Deployment and Rollout Strategy

- **Deployment Strategy**: `internal_only`
  - Tool available as npm script in development environment
  - No server deployment required (standalone CLI tool)
  - Documentation and usage examples provided
- **Rollback Plan**: N/A (internal release, can revert code changes directly)

---

### 8. Post-Release Validation

- Validate CLI tool functionality:
  - Tool successfully converts representative chat exports
  - Output JSON files have correct schema types
  - Output JSON files can be ingested deterministically
  - Interactive mode allows field correction
  - Documentation is clear and complete

---

### 9. Success Criteria

**Internal Release is Complete When:**

1. ✅ CLI tool functional (`npm run chat-to-json`)
2. ✅ Parsers for all supported formats (JSON, HTML, text)
3. ✅ LLM-based interpretation working
4. ✅ JSON output follows standard record format
5. ✅ Interactive field mapping mode functional
6. ✅ Unit tests passing (format parsers)
7. ✅ Integration tests passing (full CLI workflow)
8. ✅ E2E tests passing (CLI output → Neotoma ingestion)
9. ✅ Documentation complete (usage examples, format specifications)
10. ✅ Field accuracy ≥80% on representative chat exports

---

### 10. Status

- **Current Status**: `planning`
- **Owner**: Mark Hendrickson
- **Notes**:
  - Pre-MVP internal release
  - Enables chat transcript ingestion workflow
  - Preserves Truth Layer determinism by separating non-deterministic interpretation from ingestion pipeline
  - Tool runs independently from Neotoma server

---
