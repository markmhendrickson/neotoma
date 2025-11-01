# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Neotoma is a Model Context Protocol (MCP) server for extensible object storage with ChatGPT Actions integration. It provides flexible CRUD operations for any data type with unstructured JSONB properties, backed by Supabase (PostgreSQL + Storage).

## Essential Commands

### Development
```bash
npm install          # Install dependencies
npm run dev          # Run MCP server (stdio mode)
npm run dev:http     # Run HTTP Actions server on port 8080
npm test            # Run integration tests (requires live Supabase)
npm run build       # Compile TypeScript to dist/
npm run lint        # Run ESLint
npm run type-check  # Type-check without emitting files
```

### Testing
Tests run against live Supabase - ensure `.env` is configured with valid credentials before running `npm test`.

## Architecture

### Dual-Mode Server Design

The codebase implements **two parallel server modes** that expose the same functionality through different transport layers:

1. **MCP Server (stdio)**: `src/index.ts` + `src/server.ts`
   - Uses MCP SDK with stdio transport
   - Entry point: `npm run dev` → `src/index.ts`
   - Designed for MCP clients (ChatGPT Atlas, etc.)
   - Tools exposed via `NeotomaServer` class handlers

2. **HTTP Actions Server**: `src/actions.ts`
   - Express.js REST API
   - Entry point: `npm run dev:http` → `src/actions.ts`
   - Designed for ChatGPT Actions / HTTP clients
   - Bearer token auth (except `/health`, `/openapi.yaml`)
   - Serves OpenAPI spec at `/openapi.yaml`

**Both modes share the same database layer** (`src/db.ts`) and configuration (`src/config.ts`).

### Core Components

- **`src/config.ts`**: Environment variable validation and config export
- **`src/db.ts`**: Supabase client initialization and `NeotomaRecord` interface
- **`src/server.ts`**: `NeotomaServer` class implementing MCP protocol with 6 tool handlers
- **`src/actions.ts`**: Express server exposing REST endpoints for the same 6 operations
- **`supabase/schema.sql`**: Database schema with `objects` table, GIN indexes, and triggers

### Database Schema

Single `objects` table with:
- `id` (UUID primary key)
- `type` (TEXT, indexed) - flexible object type identifier
- `properties` (JSONB, GIN indexed) - unstructured key-value storage
- `file_urls` (JSONB array) - paths to associated files in Supabase Storage
- `created_at`, `updated_at` (timestamps, auto-managed)

### Six Core Operations

Both server modes implement identical operations:
1. `store_object` - Create new object
2. `update_object` - Merge-update properties/files
3. `retrieve_objects` - Query by type/properties with client-side property filtering
4. `delete_object` - Remove object
5. `upload_file` - Upload to Supabase Storage and associate with object
6. `get_file_url` - Generate signed URL for file access

### Key Implementation Details

- **Property filtering**: `retrieve_objects` does client-side filtering after database query (line filtering in both `src/server.ts:251-256` and `src/actions.ts:117-124`)
- **Property merging**: `update_object` merges new properties with existing ones via spread operator
- **File storage**: Uses Supabase Storage bucket (default: `files`), stores paths in `file_urls` array
- **Auth**: HTTP mode uses `ACTIONS_BEARER_TOKEN` bearer auth; MCP mode has no auth (stdio is local)

## Environment Variables

Required for all modes:
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
```

HTTP mode only:
```
HTTP_PORT=8080                      # Defaults to 3000 if not set
ACTIONS_BEARER_TOKEN=<random-token>  # Required for HTTP auth
```

## Development Workflow

### When modifying operations
- Update **both** `src/server.ts` (MCP handler) AND `src/actions.ts` (HTTP endpoint)
- Keep schemas in sync (Zod schemas in both files)
- Update `openapi.yaml` if changing HTTP API contracts

### When adding new operations
1. Add tool definition to `src/server.ts` ListToolsRequestSchema handler
2. Add case to `src/server.ts` CallToolRequestSchema handler
3. Add corresponding Express route in `src/actions.ts`
4. Update `openapi.yaml` with new endpoint
5. Add integration test in `src/index.test.ts`

### Database changes
1. Modify `supabase/schema.sql`
2. Run manually in Supabase SQL Editor (no migration system currently)
3. Update `src/db.ts` interface if schema changes

## MCP Client Configuration

The `.mcp.json` file configures MCP clients to launch the server:
```json
{
  "mcpServers": {
    "neotoma": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "SUPABASE_URL": "${SUPABASE_URL}",
        "SUPABASE_SERVICE_KEY": "${SUPABASE_SERVICE_KEY}"
      }
    }
  }
}
```

Ensure `npm run build` has been run before MCP clients launch the server, or use `tsx` instead of `node` with `src/index.ts`.

## Deployment

Fly.io configuration in `fly.toml` and `Dockerfile` (multi-stage build). Deploy HTTP server with:
```bash
fly secrets set SUPABASE_URL="..." SUPABASE_SERVICE_KEY="..." ACTIONS_BEARER_TOKEN="..."
fly deploy --remote-only
```

Exposes port 8080 (internal) for HTTP Actions mode only.
