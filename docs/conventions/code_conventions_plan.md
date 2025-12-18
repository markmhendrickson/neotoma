# Code Conventions Documentation Plan

## Overview

Create `docs/conventions/code_conventions.md` that defines code style, naming, organization, and patterns for all languages used in Neotoma. The document will reference existing standards (determinism, error handling, testing, architecture) and provide detailed examples.

## Languages to Cover

1. **TypeScript/TSX** (primary language)
2. **SQL** (migrations and schema)
3. **YAML** (manifests, configs)
4. **Shell scripts** (automation)

## Document Structure

Following `docs/conventions/documentation_standards.md` format:

1. **Purpose & Scope** — What's covered, what's not
2. **Foundational References** — Links to existing standards (determinism, errors, testing, architecture)
3. **TypeScript/TSX Conventions**

- Naming (files, functions, types, variables, constants)
- Code organization (imports, exports, file structure)
- Type definitions (interfaces vs types, generics)
- Error handling (ErrorEnvelope pattern, error propagation)
- Async/await patterns
- Determinism requirements (no randomness, deterministic IDs)
- Testing patterns (test structure, fixtures)
- Comments and documentation

4. **SQL Conventions**

- Naming (tables, columns, indexes, constraints)
- Migration structure (header comments, rollback)
- RLS policies (naming, structure)
- Index patterns
- Deterministic patterns (no random UUIDs, hash-based IDs)

5. **YAML Conventions**

- Structure (indentation, keys, values)
- Manifest patterns (feature units, releases)
- Config patterns
- Comments and documentation

6. **Shell Script Conventions**

- Shebang and error handling
- Variable naming
- Function patterns
- Exit codes

7. **Cross-Language Patterns**

- Determinism (references to determinism.md)
- Error codes (references to error_codes.md)
- Testing integration (references to testing_standard.md)

8. **Agent Instructions** — When to load, constraints, forbidden patterns

## Key Standards to Reference

- `docs/architecture/determinism.md` — Deterministic patterns, no randomness
- `docs/subsystems/errors.md` — ErrorEnvelope structure, error propagation
- `docs/testing/testing_standard.md` — Test structure, fixtures
- `docs/architecture/architecture.md` — Layer boundaries, error propagation
- `docs/reference/error_codes.md` — Canonical error codes
- `.eslintrc.json` — ESLint rules
- `tsconfig.json` — TypeScript strict mode

## Implementation Details

### TypeScript Section Should Include:

- **Naming:**
- Files: `kebab-case.ts` (e.g., `entity_resolution.ts`)
- Functions: `camelCase` (e.g., `generateEntityId`)
- Types/Interfaces: `PascalCase` (e.g., `Entity`, `ErrorEnvelope`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`)
- Private members: `_leadingUnderscore` (if needed)
- **Code Organization:**
- Import order: external → internal → relative
- Export patterns: named exports preferred
- File structure: one main export per file, or index.ts barrel
- **Type Patterns:**
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use generics for reusable patterns
- Avoid `any`, use `unknown` for truly unknown types
- **Error Handling:**
- Domain layer throws typed errors
- Application layer catches and converts to ErrorEnvelope
- Reference `docs/subsystems/errors.md` for structure
- **Determinism:**
- No `Math.random()`, `Date.now()` (unless explicit input)
- Hash-based IDs (reference determinism.md)
- Deterministic sorting
- **Testing:**
- Test file: `*.test.ts` alongside source
- Test structure: describe → test → expect
- Fixtures: reference `docs/testing/fixtures_standard.md`

### SQL Section Should Include:

- **Naming:**
- Tables: `snake_case` (e.g., `entities`, `timeline_events`)
- Columns: `snake_case` (e.g., `entity_type`, `canonical_name`)
- Indexes: `idx_{table}_{columns}` (e.g., `idx_entities_type_name`)
- Constraints: descriptive names (e.g., `entities_pkey`)
- **Migration Structure:**
- Header comment with migration name, date, description
- Feature Unit reference (e.g., `-- Migration: Add entities table (FU-101)`)
- RLS policies with descriptive names
- Table comments explaining purpose
- **Determinism:**
- No `gen_random_uuid()` for entity IDs
- Hash-based IDs (reference determinism.md)
- Deterministic default values

### YAML Section Should Include:

- **Structure:**
- 2-space indentation
- Keys: `snake_case` (e.g., `feature_id`, `schema_changes`)
- Lists: use `-` for items
- Comments: `#` for explanations
- **Manifest Patterns:**
- Reference existing manifest.yaml examples
- Required fields per manifest type
- Nested structure conventions

### Shell Script Section Should Include:

- **Structure:**
- Shebang: `#!/bin/bash` or `#!/usr/bin/env bash`
- `set -euo pipefail` for error handling
- Function naming: `camelCase` or `snake_case` (be consistent)
- Exit codes: 0 success, non-zero failure

## Files to Create/Modify

1. **Create:** `docs/conventions/code_conventions.md`
2. **Update:** `docs/conventions/documentation_standards.md` — Add reference to code conventions
3. **Update:** `docs/context/index.md` — Add code conventions to conventions section
4. **Update:** `.cursor/rules/instruction_documentation.md` — Ensure code conventions location is correct

## Examples to Include

- TypeScript: Function with error handling, type definition, test structure
- SQL: Complete migration example with RLS, indexes, comments
- YAML: Feature unit manifest example
- Shell: Script with error handling and functions

## Validation

- Follows `docs/conventions/documentation_standards.md` structure
- References existing standards (determinism, errors, testing)
- Includes Agent Instructions section
- Provides concrete examples for each language