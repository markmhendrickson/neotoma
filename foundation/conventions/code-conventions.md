# Code Conventions

_(Code Style, Naming, Organization, and Patterns Across All Languages)_

---

## Purpose

This document defines code style, naming conventions, organization patterns, and best practices for all programming languages used in the project. It ensures consistency, maintainability, and alignment with project architectural principles.

---

## Scope

This document covers:

- **TypeScript/TSX** — Primary application language (backend and frontend)
- **SQL** — Database migrations and schema definitions
- **YAML** — Configuration files, manifests, and definitions
- **Shell scripts** — Automation and setup scripts

This document does NOT cover:

- Documentation conventions (see `foundation/conventions/documentation-standards.md`)
- Testing patterns (see `foundation/testing/testing-standard.md`)
- Architectural decisions (see project-specific architecture docs)
- Error handling patterns (see project-specific error handling docs)

---

## Foundational References

All code MUST align with these foundational standards:

- Project-specific error handling patterns
- Testing standards (`foundation/testing/testing-standard.md`)
- Architectural guidelines (project-specific)
- Error code reference (project-specific)
- Linter configuration (e.g., `.eslintrc.json`)
- TypeScript configuration (e.g., `tsconfig.json`)

---

## 1. TypeScript/TSX Conventions

### 1.1 Naming Conventions

#### Files

**Configurable via `foundation-config.yaml`:**
- Common patterns: `snake_case.ts`, `kebab-case.ts`, `camelCase.ts`
- React components: `PascalCase.tsx` (recommended)

**Default pattern: `snake_case.ts`**

- **Non-component files:** `snake_case.ts` or `snake_case.tsx`
- **React components:** `PascalCase.tsx` (e.g., `ChatPanel.tsx`, `SettingsView.tsx`)
- **Backend modules:** `snake_case.ts` (e.g., `user_service.ts`, `record_reducer.ts`)

#### Functions

- **Format:** `camelCase`
- **Examples:** `generateUserId()`, `normalizeValue()`, `fetchData()`
- **Public functions:** No prefix
- **Private functions:** No underscore prefix (use module scope or class private)

```typescript
// Public function
export function generateUserId(
  userName: string,
  timestamp: string
): string {
  // ...
}

// Private helper (not exported)
function normalizeValue(raw: string): string {
  // ...
}
```

#### Types and Interfaces

- **Format:** `PascalCase`
- **Examples:** `User`, `ErrorResponse`, `Record`, `TimelineEvent`
- **Prefer `interface` for object shapes, `type` for unions/intersections:**

```typescript
// Use interface for object shapes
export interface User {
  id: string;
  user_name: string;
  email: string;
  created_at: string;
}

// Use type for unions/intersections
export type RecordStatus = "pending" | "processing" | "completed" | "failed";
export type Result<T, E> = { data: T } | { error: E };
```

#### Variables

- **Format:** `camelCase`
- **Examples:** `userId`, `userName`, `recordType`
- **Constants:** `UPPER_SNAKE_CASE` for module-level constants

```typescript
// Regular variable
const userId = generateUserId("john", timestamp);

// Module-level constant
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_PAGE_SIZE = 50;
```

#### Classes

- **Format:** `PascalCase`
- **Examples:** `EventRepository`, `UserService`

### 1.2 Code Organization

#### String Quotes

**Configurable via `foundation-config.yaml`**

- Default: **Use double quotes (`"`)** for all strings in TypeScript/TSX

```typescript
// ✅ Use double quotes
const name = "John Doe";
const type = "user";
import { database } from "../db.js";

// Alternative: Single quotes (if configured)
const name = 'John Doe';
```

#### Import Order

1. **External dependencies** (node_modules)
2. **Internal modules** (from `src/` or project root)
3. **Relative imports** (same directory or parent)

```typescript
// External dependencies
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";

// Internal modules
import { database } from "../db.js";
import { User } from "../types.js";

// Relative imports
import { normalizeValue } from "./normalize.js";
```

#### Export Patterns

- **Prefer named exports** over default exports
- **Use `index.ts` barrel files** for public APIs

```typescript
// ✅ Named export
export function generateUserId(...) { ... }

// ❌ Avoid default exports (except for React components)
// export default function generateUserId(...) { ... }
```

#### File Structure

- **One main export per file** (or related exports)
- **Barrel files** (`index.ts`) for grouping related exports
- **File header comment** with feature/task reference if applicable

```typescript
/**
 * User Service
 *
 * Handles user creation, authentication, and profile management.
 */

import { createHash } from "node:crypto";
import { database } from "../db.js";

export interface User {
  // ...
}

export function generateUserId(...) {
  // ...
}
```

### 1.3 Type Definitions

#### Interfaces vs Types

- **Use `interface`** for object shapes (extendable, mergeable)
- **Use `type`** for unions, intersections, computed types

```typescript
// ✅ Interface for object shape
export interface User {
  id: string;
  user_name: string;
}

// ✅ Type for union
export type RecordStatus = "pending" | "processing" | "completed" | "failed";

// ✅ Type for intersection
export type UserWithMetadata = User & {
  metadata: Record<string, unknown>;
};
```

#### Generics

- **Use generics** for reusable, type-safe patterns
- **Single-letter names:** `T`, `E`, `K`, `V`

```typescript
export function mapItems<T extends BaseType>(
  items: T[],
  mapper: (item: T) => unknown
): unknown[] {
  return items.map(mapper);
}
```

#### Avoid `any`

- **Never use `any`** (ESLint should warn)
- **Use `unknown`** for truly unknown types, then narrow

```typescript
// ❌ Never use any
function processData(data: any) { ... }

// ✅ Use unknown and narrow
function processData(data: unknown) {
  if (typeof data === "string") {
    // TypeScript knows data is string here
  }
}
```

### 1.4 Error Handling

Follow project-specific error handling patterns:

- **Domain layer:** Throws typed errors
- **Application layer:** Catches and converts to error response format
- **Presentation layer:** Displays user-friendly messages

```typescript
// Domain layer throws typed error
export class ValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateInput(text: string): Fields {
  if (!text) {
    throw new ValidationError("VALIDATION_FAILED", "Empty input");
  }
  // ...
}

// Application layer converts to error response
export async function processFile(
  file: File
): Promise<Result<Data, ErrorResponse>> {
  try {
    const fields = validateInput(text);
    // ...
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        error: {
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      };
    }
    throw error; // Unexpected error
  }
}
```

#### Error Codes

- **Use canonical error codes** (project-specific)
- **Format:** `<CATEGORY>_<SPECIFIC_ERROR>` (e.g., `VALIDATION_INVALID_INPUT`)

### 1.5 Async/Await Patterns

- **Prefer `async/await`** over Promise chains
- **Handle errors** with try/catch
- **Return `Promise<T>`** explicitly in function signatures

```typescript
// ✅ Prefer async/await
export async function fetchUser(
  userId: string
): Promise<User> {
  const normalizedId = normalizeUserId(userId);

  const { data: existing } = await database
    .from("users")
    .select("*")
    .eq("id", normalizedId)
    .single();

  if (existing) {
    return existing as User;
  }

  throw new Error("User not found");
}
```

### 1.6 Project-Specific Requirements

**Configurable patterns** (see `foundation-config.yaml`):

- ID generation strategy (hash-based, UUID, sequential)
- Timestamp handling (server-generated, client-provided)
- Sorting requirements (explicit order, default order)

### 1.7 Testing Patterns

**Reference:** `foundation/testing/testing-standard.md`

#### Test File Naming

- **Format:** `{source_file}.test.ts` alongside source
- **Examples:** `user_service.test.ts`, `validation.test.ts`

#### Test Structure

- **Use `describe`** for grouping related tests
- **Use `it`** for individual test cases
- **Descriptive test names:** "should do X when Y"

```typescript
import { describe, it, expect } from "vitest";
import { generateUserId, normalizeUserName } from "./user_service.js";

describe("generateUserId", () => {
  it("generates consistent IDs for same input", () => {
    const id1 = generateUserId("john", "2025-01-01T00:00:00Z");
    const id2 = generateUserId("john", "2025-01-01T00:00:00Z");
    expect(id1).toBe(id2);
  });

  it("generates different IDs for different inputs", () => {
    const id1 = generateUserId("john", "2025-01-01T00:00:00Z");
    const id2 = generateUserId("jane", "2025-01-01T00:00:00Z");
    expect(id1).not.toBe(id2);
  });
});

describe("normalizeUserName", () => {
  it("normalizes user names by trimming whitespace", () => {
    expect(normalizeUserName("  John Doe  ")).toBe("John Doe");
  });
});
```

#### Fixtures

- **Use fixtures** for reproducible tests
- **Store fixtures** in `tests/fixtures/` or alongside test files

### 1.8 Comments and Documentation

#### Function Comments

- **JSDoc-style comments** for exported functions
- **Describe purpose, parameters, return value**

```typescript
/**
 * Generate user ID from user name and timestamp
 *
 * @param userName - User's name
 * @param timestamp - ISO 8601 timestamp
 * @returns User ID (format configurable)
 */
export function generateUserId(
  userName: string,
  timestamp: string
): string {
  // ...
}
```

#### Inline Comments

- **Explain "why"** not "what"
- **Avoid obvious comments**

```typescript
// ❌ Obvious comment
const id = generateUserId(name, timestamp); // Generate user ID

// ✅ Explain why
// Remove common suffixes to normalize "John Doe Jr" and "John Doe Sr" to same base
const normalized = name.replace(/\s+(jr|sr|iii?)\.?$/i, "");
```

---

## 2. SQL Conventions

### 2.1 Naming Conventions

#### Tables

- **Format:** `snake_case`, plural
- **Examples:** `users`, `timeline_events`, `records`, `documents`

```sql
CREATE TABLE IF NOT EXISTS users (
  -- ...
);
```

#### Columns

- **Format:** `snake_case`
- **Examples:** `user_name`, `email`, `created_at`, `updated_at`

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Indexes

- **Format:** `idx_{table}_{columns}`
- **Examples:** `idx_users_email`, `idx_users_name_email`, `idx_records_user_id`

```sql
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_name_email ON users(user_name, email);
```

#### Constraints

- **Format:** Descriptive names
- **Examples:** `users_pkey`, `records_status_check`

```sql
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE records ADD CONSTRAINT records_status_check CHECK (status IN ('pending', 'completed', 'failed'));
```

#### RLS Policies (if using Postgres RLS)

- **Format:** Descriptive policy names with operation
- **Examples:** `"Service role full access - users"`, `"public read - users"`

```sql
CREATE POLICY "Service role full access - users" ON users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public read - users" ON users
  FOR SELECT USING (true);
```

### 2.2 Migration Structure

#### Header Comment

Every migration MUST include:

- Migration name
- Creation date
- Description
- Feature/task reference (if applicable)

```sql
-- Migration: Add users table
-- Created: 2025-12-23
-- Description: Creates users table for storing user profiles
```

#### Table Creation

- **Use `IF NOT EXISTS`** for idempotency
- **Add table comments** explaining purpose and key constraints

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment to table
COMMENT ON TABLE users IS 'Stores user profiles and authentication information.';
```

#### Indexes

- **Create indexes** after table creation
- **Use `IF NOT EXISTS`** for idempotency
- **Document index purpose** in comments if non-obvious

```sql
-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(user_name);
```

#### RLS Policies (if applicable)

- **Enable RLS** on all tables (if using Postgres RLS)
- **Create policies** with descriptive names
- **Use `DROP POLICY IF EXISTS`** before creating

```sql
-- RLS policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access - users" ON users;
CREATE POLICY "Service role full access - users" ON users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public read access
DROP POLICY IF EXISTS "public read - users" ON users;
CREATE POLICY "public read - users" ON users FOR SELECT USING (true);
```

### 2.3 Database-Specific Patterns

**Configurable patterns** (see `foundation-config.yaml`):

- ID generation (UUID, hash-based, sequential)
- Timestamp defaults (server-generated, application-provided)
- Soft deletes (deleted_at column, separate table)

```sql
-- Example: UUID-based IDs
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Example: Hash-based IDs (set by application)
CREATE TABLE users (
  id TEXT PRIMARY KEY  -- Set by application layer
);

-- Example: Sequential IDs
CREATE TABLE users (
  id SERIAL PRIMARY KEY
);
```

---

## 3. YAML Conventions

### 3.1 Structure

#### Indentation

- **Use 2 spaces** (never tabs)
- **Consistent indentation** throughout file

#### Keys

- **Format:** `snake_case`
- **Examples:** `feature_id`, `schema_changes`, `metadata`, `config`

```yaml
feature_id: "feat_001"
version: "1.0.0"
status: "draft"
priority: "high"
```

#### Values

- **Strings:** Use quotes for strings with special characters or when clarity needed
- **Booleans:** `true`/`false` (lowercase)
- **Numbers:** Unquoted integers/floats
- **Lists:** Use `-` for items

```yaml
feature_id: "feat_001"
version: "1.0.0"
enabled: true
count: 42
tags:
  - "backend"
  - "api"
```

### 3.2 Configuration Patterns

**Project-specific manifests:**

Required structure varies by project. Common patterns:

```yaml
id: "item_xxx"
version: "1.0.0"
status: "draft" | "in_progress" | "completed"
priority: "high" | "medium" | "low"

tags:
  - "tag1"
  - "tag2"

metadata:
  title: "Item Title"
  description: "Item description"
  owner: "owner@example.com"
  created_at: "2025-01-XX"
  
dependencies:
  requires:
    - id: "item_yyy"
      reason: "Reason"
```

### 3.3 Comments

- **Use `#`** for comments
- **Place comments** above the relevant section or inline

```yaml
# Configuration Example
feature_id: "feat_001"
version: "1.0.0"

# Metadata section
metadata:
  title: "Example Feature"
  # Owner is responsible for implementation
  owner: "engineering@example.com"
```

---

## 4. Shell Script Conventions

### 4.1 Structure

#### Shebang

- **Use `#!/bin/bash`** or `#!/usr/bin/env bash`
- **Use `#!/usr/bin/env node`** for Node.js scripts

```bash
#!/bin/bash
# Script description
```

#### Error Handling

- **Use `set -euo pipefail`** for strict error handling:
  - `-e`: Exit on error
  - `-u`: Exit on undefined variable
  - `-o pipefail`: Exit on pipe failure

```bash
#!/bin/bash
set -euo pipefail

# Script continues...
```

### 4.2 Naming

#### Variables

- **Format:** `UPPER_SNAKE_CASE` for constants, `lowercase` for local variables
- **Examples:** `REPO_ROOT`, `SCRIPT_DIR`, `targetDir`

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/..")"

targetDir="/path/to/target"
```

#### Functions

- **Format:** `snake_case` or `camelCase` (be consistent within script)
- **Examples:** `setup_environment()`, `copyFile()`

```bash
function setup_environment() {
  echo "Setting up environment..."
  # ...
}

function copyFile() {
  if [ -f "$1" ]; then
    cp "$1" "$2"
  fi
}
```

### 4.3 Exit Codes

- **0:** Success
- **Non-zero:** Failure (use specific codes if needed)

```bash
if [ ! -f "$REQUIRED_FILE" ]; then
  echo "Error: Required file not found: $REQUIRED_FILE"
  exit 1
fi

# Success
exit 0
```

### 4.4 Comments

- **Use `#`** for comments
- **Describe purpose** at top of script
- **Explain complex logic** inline

```bash
#!/bin/bash
# Worktree initialization script
# This can be run automatically when creating a new worktree
# or manually via: npm run setup:worktree

set -euo pipefail

# Copy env file if script exists
if [ -f "$SCRIPT_DIR/copy-env.sh" ]; then
  echo "Copying environment file..."
  bash "$SCRIPT_DIR/copy-env.sh" || {
    echo "Warning: Failed to copy env file."
  }
fi
```

---

## 5. Cross-Language Patterns

### 5.1 Project-Specific Requirements

Configure via `foundation-config.yaml`:

- **ID generation:** hash-based, UUID, sequential
- **Timestamp handling:** server-generated, client-provided
- **Sorting:** explicit order requirements
- **Error codes:** canonical error code format

### 5.2 Error Codes

Use project-specific error codes:

- **Format:** `<CATEGORY>_<SPECIFIC_ERROR>`
- **Examples:** `VALIDATION_INVALID_INPUT`, `AUTH_REQUIRED`, `DB_CONNECTION_FAILED`

### 5.3 Testing Integration

**Reference:** `foundation/testing/testing-standard.md`

- **Unit tests:** Pure functions, business logic
- **Integration tests:** Service interactions, database operations
- **E2E tests:** Full user flows
- **Coverage requirements:** Configurable per project

### 5.4 Privacy and Security

**Reference:** Project-specific privacy/security docs

- **Never log PII** (personally identifiable information)
- **Never include PII** in error messages
- **Use structured logging** with sanitized data
- **No secrets in code**

---

## Configuration

Configure code conventions via `foundation-config.yaml`:

```yaml
conventions:
  typescript:
    files: "snake_case"  # or "kebab-case", "camelCase"
    components: "PascalCase"
    functions: "camelCase"
    types: "PascalCase"
    constants: "UPPER_SNAKE_CASE"
    string_quotes: "double"  # or "single"
    prefer_named_exports: true
    
  sql:
    tables: "snake_case"
    columns: "snake_case"
    indexes: "idx_{table}_{columns}"
    use_rls: true  # Postgres Row Level Security
    
  yaml:
    indentation: 2
    keys: "snake_case"
    
  shell:
    error_handling: "strict"  # set -euo pipefail
    variables: "UPPER_SNAKE_CASE"  # for constants
    functions: "snake_case"
```

---

## Agent Instructions

### When to Load This Document

Load this document whenever:

- Writing new code in TypeScript, SQL, YAML, or Shell
- Reviewing code for style consistency
- Onboarding new contributors
- Refactoring existing code
- Creating new files or modules

### Required Co-Loaded Documents

- Project-specific architectural guidelines
- Error handling patterns (project-specific)
- Testing standards (`foundation/testing/testing-standard.md`)
- Linter configuration (e.g., `.eslintrc.json`)
- TypeScript configuration (e.g., `tsconfig.json`)

### Constraints Agents Must Enforce

1. **Naming conventions** — Files, functions, types, variables follow configured patterns
2. **String quotes** — Use configured quote style (default: double quotes)
3. **Project-specific patterns** — Follow ID generation, timestamp handling, sorting requirements
4. **Error handling** — Use project error response format and canonical error codes
5. **Type safety** — Avoid `any`, use `unknown` with narrowing
6. **Code organization** — Import order, export patterns, file structure
7. **Testing** — Test file naming, structure, fixtures
8. **Comments** — JSDoc for exported functions, explain "why" not "what"

### Forbidden Patterns

- **`any` type** — Use `unknown` and narrow
- **Default exports** — Prefer named exports (except React components)
- **Obvious comments** — Explain "why" not "what"
- **Secrets in code** — Never commit credentials or API keys
- **PII in logs/errors** — Sanitize all user data

### Validation Checklist

- [ ] File naming follows configured conventions
- [ ] Function naming follows `camelCase` convention
- [ ] Type/interface naming follows `PascalCase` convention
- [ ] String literals use configured quote style
- [ ] Project-specific ID generation pattern followed
- [ ] Project-specific timestamp handling followed
- [ ] Error handling uses project error response format
- [ ] Error codes are canonical (from project error code reference)
- [ ] No `any` type (use `unknown` with narrowing)
- [ ] Import order: external → internal → relative
- [ ] Tests follow naming and structure conventions
- [ ] Comments explain "why" not "what"
- [ ] SQL migrations include header comments
- [ ] YAML files use configured indentation and key format
- [ ] Shell scripts use `set -euo pipefail` and proper exit codes

