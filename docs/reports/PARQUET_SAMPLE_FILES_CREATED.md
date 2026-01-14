# Parquet Sample Files Created

**Date**: 2026-01-14  
**Status**: ✅ **COMPLETE**

## Summary

Created sample versions of all main parquet files with 50 records each (or fewer if the file has less than 50 records) for testing parquet → Neotoma imports before processing full files.

## Files Created

All sample files are saved in the same directory as the source file with `_sample` suffix:

1. ✅ `tax_events/tax_events_sample.parquet` (49 rows)
2. ✅ `research/research_sample.parquet` (5 rows)
3. ✅ `tasks/tasks_missing_gid_sample.parquet` (6 rows)
4. ✅ `tasks/tasks_sample.parquet` (50 rows)
5. ✅ `purchases/purchases_sample.parquet` (50 rows)
6. ✅ `crypto_transactions/crypto_transactions_sample.parquet` (50 rows)
7. ✅ `messages/messages_sample.parquet` (39 rows)
8. ✅ `user_accounts/user_accounts_sample.parquet` (50 rows)
9. ✅ `domains/domains_sample.parquet` (1 row)
10. ✅ `tax_filings/tax_filings_sample.parquet` (25 rows)
11. ✅ `task_comments/task_comments_sample.parquet` (50 rows)
12. ✅ `goals/goals_sample.parquet` (38 rows)
13. ✅ `recurring_events/recurring_events_sample.parquet` (50 rows)

**Total**: 13 sample files created

## Script

The script `scripts/create_sample_parquet_files_simple.sh`:
- Uses Python pandas to read and write parquet files
- Takes first 50 rows (or all if file has fewer rows)
- Skips files larger than 100MB (to avoid timeouts)
- Skips files that already have sample versions
- Preserves all columns and schema from original files

## Usage

```bash
npm run parquet:samples
```

## Next Steps

1. Test importing sample files into Neotoma using MCP `store` action
2. Verify data integrity and schema enhancement
3. Once confirmed working, process full files
