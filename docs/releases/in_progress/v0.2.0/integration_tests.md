# Release v0.2.0 — Integration Tests

**Release**: Chat Transcript Extraction Tool  
**Status**: `planning`  
**Last Updated**: 2024-12-19

---

## 1. Purpose

Define the **integration test suite** for Release `v0.2.0` (Chat Transcript Extraction Tool). These tests:

- Validate end-to-end conversion from chat transcripts to structured JSON files
- Verify CLI output can be ingested deterministically by Neotoma's Truth Layer
- Validate tool handles multiple input formats consistently
- Verify interactive field mapping mode functionality
- Are required to pass before release approval

---

## 2. Test Matrix

| ID     | Name                            | FUs Involved | Acceptance Criteria Covered |
| ------ | ------------------------------- | ------------ | --------------------------- |
| IT-001 | Chat Transcript Conversion Flow | FU-106       | Product, Technical          |
| IT-002 | JSON Ingestion Validation       | FU-106       | Product, Technical          |
| IT-003 | Multiple Format Support         | FU-106       | Product, Technical          |
| IT-004 | Interactive Field Mapping Mode  | FU-106       | Product                     |

---

## 3. Test Definitions

### IT-001: Chat Transcript Conversion Flow

**Purpose**: Validate end-to-end conversion from chat transcript to JSON files

**Purpose**: Validate end-to-end conversion from chat transcript to JSON files

**Preconditions:**

- CLI tool installed and accessible (`npm run chat-to-json`)
- OpenAI/Anthropic API key configured in environment
- Sample ChatGPT JSON export file available
- Output directory exists and is writable

**Steps:**

1. User exports chat transcript from ChatGPT (JSON format)
2. Run CLI: `npm run chat-to-json -- chat-export.json output_dir/`
3. Tool parses transcript
4. Tool uses LLM to interpret content and extract records
5. Tool outputs JSON files (one per extracted record) with schema types
6. User reviews/corrects field mappings in interactive mode (if needed)
7. Final JSON files exported to output directory

**Expected Results:**

- Tool successfully parses input transcript
- LLM interpretation extracts records with correct schema types
- Output JSON files follow standard record format:
  ```json
  {
    "type": "message",
    "properties": {
      "schema_version": "1.0",
      "sender": "user",
      "recipient": "assistant",
      "subject": "...",
      "body": "...",
      "sent_at": "2024-01-15T10:30:00Z"
    },
    "file_urls": ["local://chat-export.json"],
    "summary": "..."
  }
  ```
- Each JSON file contains one record object
- Schema types are correctly assigned (e.g., "message", "note", "task")

**Postconditions:**

- Output directory contains JSON files (one per extracted record)
- All JSON files are valid and parseable
- Each JSON file follows standard record format
- Schema types are assigned correctly

**Acceptance Criteria:**

- ✅ Tool completes without errors
- ✅ Output JSON files are valid JSON
- ✅ Output JSON files follow standard record format
- ✅ Schema types are correctly assigned
- ✅ Field accuracy ≥80%

---

### IT-002: JSON Ingestion Validation

**Purpose**: Validate that CLI output can be ingested deterministically by Neotoma

**Preconditions:**

- JSON files generated from IT-001 (Chat Transcript Conversion Flow)
- Neotoma ingestion pipeline operational
- Database accessible and initialized
- Standard ingestion path functional

**Steps:**

1. Generate JSON files using CLI tool (from Test Scenario 1)
2. Ingest JSON files via Neotoma's standard ingestion path
3. Verify records created in database
4. Verify records have correct schema types
5. Verify properties extracted correctly
6. Re-ingest same JSON files
7. Verify deterministic ingestion (same JSON → same record)

**Expected Results:**

- JSON files successfully ingested
- Records created with correct schema types
- Properties match JSON file contents
- Same JSON file → same record (deterministic)
- No errors during ingestion

**Postconditions:**

- Records exist in database with correct schema types
- Properties match JSON file contents
- Re-ingestion produces identical records (deterministic)

**Acceptance Criteria:**

- ✅ JSON files ingested successfully
- ✅ Records created with correct types
- ✅ Properties match JSON contents
- ✅ Ingestion is deterministic (same input → same output)

---

### IT-003: Multiple Format Support

**Purpose**: Validate tool handles different input formats consistently

**Preconditions:**

- CLI tool installed and accessible
- OpenAI/Anthropic API key configured
- Sample files available for each format:
  - ChatGPT JSON export
  - HTML export
  - Plain text export
- Output directory exists and is writable

**Test Cases:**

#### 3.1 ChatGPT JSON Export

- Input: ChatGPT JSON export format
- Expected: JSON files with correct schema types

#### 3.2 HTML Export

- Input: HTML export format
- Expected: JSON files with correct schema types

#### 3.3 Plain Text Export

- Input: Plain text export format
- Expected: JSON files with correct schema types

**Expected Results:**

- Tool successfully parses all input formats
- Output JSON format is consistent across all input formats
- Schema types correctly assigned regardless of input format
- Field accuracy ≥80% for all formats

**Postconditions:**

- JSON files generated for all input formats
- Output format is consistent across all formats
- Schema types correctly assigned regardless of input format

**Acceptance Criteria:**

- ✅ All formats parsed successfully
- ✅ Consistent JSON output format
- ✅ Schema types correctly assigned
- ✅ Field accuracy ≥80% for all formats

---

### IT-004: Interactive Field Mapping Mode

**Purpose**: Validate interactive mode allows users to correct field mappings

**Preconditions:**

- CLI tool installed with interactive mode support
- OpenAI/Anthropic API key configured
- Sample chat transcript file available
- Output directory exists and is writable
- Terminal supports interactive input/output

**Steps:**

1. Run CLI with interactive flag: `npm run chat-to-json -- --interactive chat-export.json output_dir/`
2. Tool displays extracted fields and proposed mappings
3. User reviews and corrects mappings
4. User confirms or modifies schema type assignments
5. Tool exports final JSON files with corrected mappings

**Expected Results:**

- Interactive mode displays extracted fields
- User can correct field mappings
- User can modify schema type assignments
- Final JSON files reflect user corrections

**Postconditions:**

- Final JSON files reflect user corrections
- Field mappings match user input
- Schema types match user selections

**Acceptance Criteria:**

- ✅ Interactive mode functional
- ✅ User can correct field mappings
- ✅ User can modify schema types
- ✅ Final output reflects corrections

---

## 4. Test Data Requirements

### 4.1 Required Sample Files

**ChatGPT JSON Export:**

- Format: Standard ChatGPT export JSON structure
- Content: Multi-turn conversation with various topics
- Size: 10-50 messages
- Edge cases: Include messages with code blocks, lists, timestamps

**HTML Export:**

- Format: HTML file with chat transcript structure
- Content: Similar conversation content as JSON export
- Structure: Common HTML export formats (ChatGPT HTML, custom HTML)
- Edge cases: Nested elements, special characters, formatting

**Plain Text Export:**

- Format: Plain text file with chat transcript
- Content: Similar conversation content
- Structure: Common text export formats (line-separated, markdown-like)
- Edge cases: Multi-line messages, special characters

### 4.2 Representative Chat Transcripts

**Variety Requirements:**

- Short conversations (5-10 messages)
- Long conversations (50+ messages)
- Mixed topics (technical, personal, business)
- Code-heavy conversations
- Task-oriented conversations
- Q&A format conversations

**Edge Cases:**

- Conversations with timestamps
- Conversations with attachments/links
- Conversations with formatting (bold, italic, code)
- Conversations with multiple participants
- Conversations with deleted/edited messages (if present in export)

### 4.3 Expected Schema Types

Test data should produce records with various schema types:

- `message` (most common)
- `note` (extracted notes/insights)
- `task` (action items)
- `code` (code snippets)
- Other relevant types from schema catalog

---

## 5. Test Environment

### 5.1 Required Components

- **Node.js**: v18+ with npm
- **CLI Tool**: `scripts/chat-to-json.ts` compiled and accessible
- **LLM API Access**: OpenAI or Anthropic API key configured
- **Neotoma Ingestion Pipeline**: For E2E tests (IT-002)
- **Database**: Supabase instance with schema initialized

### 5.2 Environment Variables

- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (required for LLM interpretation)
- `SUPABASE_URL` (required for E2E ingestion tests)
- `SUPABASE_KEY` (required for E2E ingestion tests)

### 5.3 Test Execution

**Unit Tests:**

- Format parsers (JSON, HTML, text)
- JSON output validation
- Schema type assignment logic

**Integration Tests:**

- Full CLI workflow (transcript → JSON)
- Interactive mode flow
- Error handling

**E2E Tests:**

- CLI output → Neotoma ingestion
- Deterministic ingestion validation

---

## 6. Notes

- Tests validate separation between non-deterministic interpretation (CLI) and deterministic ingestion (Truth Layer)
- Tool preserves Truth Layer determinism constraints
- E2E tests verify integration with Neotoma ingestion pipeline
- Field accuracy target: ≥80% (measured by comparing extracted fields to ground truth)
- Determinism validation: Same JSON file ingested twice must produce identical records (same ID, same properties)
