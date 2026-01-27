# DATA_DIR Schema Analysis Report

Generated: 2026-01-22T12:05:59.703Z

## Overview

- Total DATA_DIR entity types: 72
- Covered by schema_definitions.ts: 47
- Missing from schema_definitions.ts: 25

## Coverage Summary

**Coverage rate**: 65%

### Covered Types

These DATA_DIR types have corresponding schemas in `schema_definitions.ts`:

- `accounts`
- `addresses`
- `arguments`
- `balances`
- `beliefs`
- `companies`
- `contacts`
- `contracts`
- `crypto_transactions`
- `domains`
- `emails`
- `emotions`
- `events`
- `exercises`
- `fixed_costs`
- `flows`
- `goals`
- `habit_completions`
- `habit_objectives`
- `habits`
- `holdings`
- `income`
- `liabilities`
- `locations`
- `meals`
- `messages`
- `notes`
- `orders`
- `outcomes`
- `processes`
- `projects`
- `properties`
- `purchases`
- `relationships`
- `research`
- `strategies`
- `task_attachments`
- `task_comments`
- `task_dependencies`
- `task_stories`
- `tasks`
- `tax_events`
- `tax_filings`
- `transactions`
- `transfers`
- `wallets`
- `workouts`

### Missing Types

These DATA_DIR types do NOT have schemas in `schema_definitions.ts`:

- `account_identifiers`
- `asset_types`
- `asset_values`
- `bank_certificates`
- `daily_triages`
- `disputes`
- `email_workflows`
- `env_var_mappings`
- `equity_units`
- `execution_plans`
- `financial_strategies`
- `foods`
- `investments`
- `mcp_server_integrations`
- `movies`
- `payroll_documents`
- `people`
- `posts`
- `property_equipment`
- `recurring_events`
- `related_materials`
- `sets`
- `songs`
- `transcriptions`
- `user_accounts`

## Priority Recommendations

High-value types that should be added to 1.0 schemas:

## Field Pattern Analysis

No field patterns analyzed (requires parquet file parsing).

## Next Steps

1. Review priority recommendations
2. Add missing schemas to `src/services/schema_definitions.ts`
3. Create corresponding fixtures in `tests/fixtures/json/`
4. Update documentation
5. Run `npm run schema:init` to register new schemas

## Notes

- This analysis identifies DATA_DIR types that could inspire schema additions
- Not all DATA_DIR types need to be added (some may be infrastructure/meta types)
- Focus on high-value personal data types first
- Field pattern analysis requires parsing parquet files (not implemented in this version)
