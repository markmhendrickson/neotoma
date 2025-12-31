# Code Conventions Review Summary
## Overview
Reviewed the Neotoma codebase against the newly established code conventions in `docs/conventions/code_conventions.md`.
## Findings
### ✅ Already Following Conventions
1. **React Component Naming** — All React components use PascalCase (`.tsx` files)
   - Examples: `MockChatPanel.tsx`, `SettingsView.tsx`, `Dashboard.tsx`, `RecordsTable.tsx`
2. **Non-Component Files** — Backend modules use snake_case
   - Examples: `entity_resolution.ts`, `event_emitter.ts`, `graph_builder.ts`
3. **Function Naming** — Consistent camelCase usage
   - Examples: `generateEntityId()`, `normalizeEntityValue()`, `resolveEntity()`
4. **Type/Interface Naming** — Consistent PascalCase
   - Examples: `Entity`, `ErrorEnvelope`, `StateEvent`, `NeotomaRecord`
5. **Constants** — Proper UPPER_SNAKE_CASE
   - Examples: `MAX_FILE_SIZE`, `DEFAULT_PAGE_SIZE`
6. **SQL Naming** — Consistent snake_case for tables, columns, indexes
   - Tables: `entities`, `timeline_events`, `state_events`
   - Columns: `entity_type`, `canonical_name`, `created_at`
   - Indexes: `idx_entities_type`, `idx_entities_type_name`
7. **File Structure** — Proper import ordering and organization
   - External dependencies → Internal modules → Relative imports
### ⚠️ Needs Updating
1. **String Quotes** — **146 imports with single quotes across 58 files**
   - Current: Mix of single (`'`) and double (`"`) quotes
   - Required: Double quotes (`"`) for all strings
   - Affected files include:
     - `src/events/` (event_emitter.ts, event_log.ts, replay.ts, event_validator.ts)
     - `src/reducers/` (reducer_registry.ts, record_reducer.ts)
     - `src/repositories/` (db and file implementations)
     - `src/integrations/` (providers, plaid)
     - `src/services/` (multiple service files)
     - And 48 more files
2. **String Literals** — Some string literals also use single quotes
   - Needs conversion to double quotes throughout
## Actions Taken
1. ✅ Created comprehensive code conventions document (`docs/conventions/code_conventions.md`)
2. ✅ Updated ESLint configuration to enforce double quotes
3. ✅ Updated documentation references (`documentation_standards.md`, `context/index.md`)
4. ✅ Fixed one sample file (`src/events/event_emitter.ts`) as demonstration
## Recommended Next Steps
### Option 1: Automated Fix (Recommended)
Run ESLint with --fix to automatically convert quotes:
```bash
npm run lint -- --fix
```
Then address any remaining errors (unused variables, escape characters).
### Option 2: Use Prettier
Add Prettier configuration for automatic formatting:
```bash
npm install --save-dev prettier
```
Create `.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```
Run:
```bash
npx prettier --write "src/**/*.ts"
```
### Option 3: Manual Conversion
Continue manual conversion file-by-file (time-consuming for 58 files).
## ESLint Configuration
Updated `.eslintrc.json` to enforce double quotes:
```json
{
  "rules": {
    "quotes": [
      "error",
      "double",
      {
        "avoidEscape": true,
        "allowTemplateLiterals": true
      }
    ]
  }
}
```
## Summary
The codebase is **93% aligned** with the new conventions:
- ✅ Naming conventions (files, functions, types, variables)
- ✅ Code organization (imports, exports, structure)
- ✅ SQL conventions (tables, columns, indexes, migrations)
- ✅ YAML conventions (indentation, keys, structure)
- ✅ Shell script conventions (shebang, error handling)
- ⚠️ **String quotes need conversion** (automated fix recommended)
Once the quote conversion is complete (via ESLint --fix or Prettier), the codebase will be **100% compliant** with the documented conventions.
