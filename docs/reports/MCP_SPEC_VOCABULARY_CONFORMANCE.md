# MCP Spec Vocabulary Conformance Analysis

**Date:** 2025-01-27  
**Spec:** `docs/specs/MCP_SPEC.md`  
**Canonical Terms:** `docs/vocabulary/canonical_terms.md`

## Overall Assessment

**Status:** ✅ **Mostly Conformant** with minor violations

The MCP spec generally follows canonical vocabulary well, using proper markdown links to canonical terms throughout. However, there are some instances of forbidden synonyms and legacy terminology that should be addressed.

## ✅ Correct Usage

The spec correctly uses canonical terms with proper markdown links:

- ✅ `[storing](../vocabulary/canonical_terms.md#storing)` - Used consistently
- ✅ `[source](../vocabulary/canonical_terms.md#source)` - Used consistently
- ✅ `[entity](../vocabulary/canonical_terms.md#entity)` - Used consistently
- ✅ `[entity snapshot](../vocabulary/canonical_terms.md#entity-snapshot)` - Used consistently
- ✅ `[observation](../vocabulary/canonical_terms.md#observation)` - Used consistently
- ✅ `[provenance](../vocabulary/canonical_terms.md#provenance)` - Used consistently
- ✅ `[interpretation](../vocabulary/canonical_terms.md#interpretation)` - Used consistently
- ✅ `[extraction](../vocabulary/canonical_terms.md#extraction)` - Used consistently
- ✅ `[reducer](../vocabulary/canonical_terms.md#reducer)` - Used correctly
- ✅ `[relationship](../vocabulary/canonical_terms.md#relationship)` - Used correctly
- ✅ `[event](../vocabulary/canonical_terms.md#event)` - Used correctly
- ✅ `[entity schema](../vocabulary/canonical_terms.md#entity-schema)` - Used correctly
- ✅ `[entity type](../vocabulary/canonical_terms.md#entity-type)` - Used correctly
- ✅ `[retrieving](../vocabulary/canonical_terms.md#retrieving)` - Used correctly

## ⚠️ Issues Found

### 1. Forbidden Synonyms Used

#### "upload" / "Upload" (Forbidden synonym for [storing](#storing))

**Locations:**
- Line 69: `| \`upload_file\`  | Upload file and create [source]...`
- Line 218: `**Purpose:** Upload file from local path, create [source]...`
- Line 223: `file_path: string;               // Required: Local file path`

**Issue:** The canonical terms document states:
> ❌ "upload" (only one step)

**Recommendation:** 
- Change "Upload file" to "Store file" or "Store unstructured source"
- The action name `upload_file` is acceptable as an API identifier, but the description should use canonical terminology

#### "file" / "File" (Forbidden synonym for [source](#source))

**Locations:**
- Line 62: `- Unstructured: \`{file_content, mime_type}\` for files that need [interpretation]`
- Line 70: `| \`get_file_url\` | Get signed URL for file access`
- Line 108: `**For Unstructured [Source] (Files):**`
- Line 259: `**Purpose:** Get signed URL for accessing [stored] file.`
- Line 264: `file_path: string;               // Required: File path in storage`
- Line 387: `4. **File** (original source file)`

**Issue:** The canonical terms document states:
> ❌ "file" ([source](#source) includes files but also text, URLs, structured data)

**Recommendation:**
- Line 62: Change "for files" to "for unstructured source"
- Line 70: Change "file access" to "source access" or keep as-is if referring specifically to file storage
- Line 108: Change "(Files)" to "(Unstructured Source)"
- Line 259: Change "file" to "source" or "stored source"
- Line 264: Keep `file_path` as parameter name (implementation detail), but description should reference "source"
- Line 387: Change "File" to "Source" or "Original Source"

#### "data" / "Data" (Forbidden synonym for [source](#source))

**Locations:**
- Line 39: `Domain -->|Structured Data| App`
- Line 63: `- Structured: \`{entities: [{entity_type, ...}]}\` for pre-structured data`
- Line 121: `**For Structured [Source] (Agent Data):**`
- Line 136: `2. **Structured data?** → Use \`ingest\` with \`entities\` array`

**Issue:** The canonical terms document states:
> ❌ "data" (too generic)

**Recommendation:**
- Line 39: "Structured Data" is acceptable in architecture diagram context
- Line 63: Change "pre-structured data" to "pre-structured source"
- Line 121: Change "(Agent Data)" to "(Structured Source)"
- Line 136: Change "Structured data?" to "Structured source?"

#### "content" (Forbidden synonym for [source](#source))

**Locations:**
- Line 189: `content_hash: string;                // SHA-256 hash of content`
- Line 190: `file_size?: number;                  // File size in bytes (if unstructured)`
- Line 191: `deduplicated: boolean;               // Whether content was already [stored]`

**Issue:** The canonical terms document states:
> ❌ "content" (replaced by [source](#source) for clarity)

**Recommendation:**
- Line 189: `content_hash` is acceptable as a technical field name
- Line 191: Change "content was already [stored]" to "source was already [stored]"

### 2. Acceptable Uses (Not Violations)

#### "Record<string, any>" (TypeScript Type)
**Status:** ✅ Acceptable - This is TypeScript type notation, not the forbidden "record" term.

**Locations:** Multiple (e.g., line 237, 312, 361, etc.)

#### "database schema" (Different from entity schema)
**Status:** ✅ Acceptable - Canonical terms explicitly allow this:
> ❌ "database schema" (entity schema refers to domain field definitions, not PostgreSQL table structure)

The spec correctly distinguishes between "database schema" (PostgreSQL) and "[entity schema](#entity-schema)" (domain definitions).

#### Action Names with "get"
**Status:** ✅ Acceptable - Action names like `get_entity_snapshot`, `get_file_url` are API identifiers. The canonical terms forbid using "get" as a synonym for "retrieving" in descriptions, but action names are implementation details.

**Note:** The spec correctly uses `[Retrieve]` in action descriptions (e.g., line 76: "[Retrieve] [entity] [entity snapshot]").

### 3. Legacy Terminology

**Status:** ✅ No legacy terms found

The spec does not use deprecated terms like:
- ❌ "record" (legacy term)
- ❌ "record_type" (legacy term)  
- ❌ "capability" (legacy term)

### 4. Forbidden Terms

**Status:** ✅ No forbidden terms found

The spec does not use any of the explicitly forbidden terms:
- ❌ "dapp"
- ❌ "smart"
- ❌ "intelligent"
- ❌ "learn"
- ❌ "understand"

## Detailed Line-by-Line Issues

### Section 2.1-2.2: Action Catalog

| Line | Issue | Current | Recommended |
|------|-------|---------|-------------|
| 62 | Forbidden synonym | "for files" | "for unstructured source" |
| 63 | Forbidden synonym | "pre-structured data" | "pre-structured source" |
| 69 | Forbidden synonym | "Upload file" | "Store file" or "Store unstructured source" |
| 70 | Forbidden synonym | "file access" | "source access" (or keep if file-specific) |

### Section 2.5: Using the Unified `ingest` Action

| Line | Issue | Current | Recommended |
|------|-------|---------|-------------|
| 108 | Forbidden synonym | "(Files)" | "(Unstructured Source)" |
| 121 | Forbidden synonym | "(Agent Data)" | "(Structured Source)" |
| 136 | Forbidden synonym | "Structured data?" | "Structured source?" |

### Section 3.2: `upload_file`

| Line | Issue | Current | Recommended |
|------|-------|---------|-------------|
| 218 | Forbidden synonym | "Upload file" | "Store file" or "Store unstructured source" |

### Section 3.3: `get_file_url`

| Line | Issue | Current | Recommended |
|------|-------|---------|-------------|
| 259 | Forbidden synonym | "accessing [stored] file" | "accessing [stored] source" |
| 264 | Parameter name | `file_path` | Keep name, update description to reference "source" |

### Section 3.6: `get_field_provenance`

| Line | Issue | Current | Recommended |
|------|-------|---------|-------------|
| 387 | Forbidden synonym | "**File** (original source file)" | "**Source** (original source)" |

### Section 3.1: `ingest`

| Line | Issue | Current | Recommended |
|------|-------|---------|-------------|
| 191 | Forbidden synonym | "content was already [stored]" | "source was already [stored]" |

## Recommendations

### High Priority
1. **Replace "upload" with "store"** in action descriptions (keep `upload_file` as action name)
2. **Replace "file" with "source"** in descriptive text (keep `file_path` as parameter names)
3. **Replace "data" with "source"** in structured data contexts
4. **Replace "content" with "source"** in user-facing descriptions

### Medium Priority
5. Update section headers to use canonical terminology
6. Ensure all action purpose statements use canonical terms

### Low Priority
7. Review parameter names - technical identifiers can remain as-is, but descriptions should use canonical terms

## Conformance Score

| Category | Score | Notes |
|----------|-------|-------|
| **Core Terms Usage** | 95% | Excellent use of canonical terms with proper links |
| **Forbidden Synonyms** | 70% | Some instances of "upload", "file", "data", "content" |
| **Legacy Terms** | 100% | No legacy terms found |
| **Forbidden Terms** | 100% | No forbidden terms found |
| **Overall** | **88%** | Good conformance with minor improvements needed |

## Conclusion

The MCP spec demonstrates **strong conformance** to canonical vocabulary. The main issues are:

1. Use of "upload" instead of "store" in action descriptions
2. Use of "file" instead of "source" in some contexts
3. Use of "data" instead of "source" for structured data
4. Use of "content" instead of "source" in one instance

These are relatively minor and mostly in descriptive text rather than core terminology. The spec correctly uses canonical terms with proper markdown links throughout, which is excellent practice.

**Recommendation:** Update the identified lines to use canonical terminology for full conformance.
