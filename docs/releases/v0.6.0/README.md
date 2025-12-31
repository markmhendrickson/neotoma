# Neotoma v0.6.0 - Complete Architecture Migration

**Status:** Draft  
**Breaking Changes:** Yes  
**Migration Required:** Yes

## Overview

Version 0.6.0 completes Neotoma's architectural migration to a sources-first, observation-based truth model. This release eliminates the legacy records table and unifies all data ingestion through the sources/observations architecture.

See `release_plan.md` for complete details.

## Quick Links

- **Release Plan:** [release_plan.md](./release_plan.md)
- **Migration Script:** `../../scripts/migrate-records-to-sources-v0.6.0.ts`
- **SQL Migrations:** `./migrations/`

## Breaking Changes Summary

### Removed APIs
- ❌ HTTP: `/store_record`, `/update_record`, `/retrieve_records`, `/delete_record`
- ❌ MCP: `update_record`, `retrieve_records`, `delete_record`

### New APIs
- ✅ HTTP: `/entities/query`, `/observations/create`, `/entities/merge`
- ✅ MCP: Already available (`retrieve_entities`, etc.)

### Removed Database Tables
- ❌ `records`
- ❌ `record_relationships`
- ❌ `record_entity_edges`
- ❌ `record_event_edges`

## Migration Quickstart

```bash
# 1. Backup database
pg_dump neotoma > backup_$(date +%Y%m%d).sql

# 2. Dry run
npm run migrate:records-to-sources -- --user-id <uuid> --dry-run

# 3. Execute
npm run migrate:records-to-sources -- --user-id <uuid>

# 4. Apply schema migrations
npm run migrate:up
```

## Support

Questions? See the full release plan or contact the development team.

