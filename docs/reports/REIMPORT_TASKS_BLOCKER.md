# Reimport Tasks - Current Blocker

**Date**: 2026-01-14  
**Task**: Reimport all tasks using MCP tools and check for data parity

## Current Status: ⚠️ BLOCKED

### Issue 1: Parquet MCP Tool Bug (Identified)

**Problem**: `user-parquet (user).read_parquet` generates massive output files
- Requested: 16,065 rows
- Generated: 28.6 MB file with 690,801 lines
- Cause: Pretty-printed JSON (each record × ~43 fields = ~43 lines per record)

**Impact**: 
- Inefficient for large datasets
- Difficult to process responses
- High memory/disk usage

**Workaround**: Use `store` action with `file_path` instead

### Issue 2: File Path Resolution

**Problem**: `store` action cannot resolve `tasks/tasks.parquet` path
- Error: `File not found: tasks/tasks.parquet`
- Previous success used `${DATA_DIR}/tasks/tasks.parquet` format
- MCP server may not expand environment variables

**Attempted Paths**:
- ❌ `tasks/tasks.parquet` - File not found
- ❌ `${DATA_DIR}/tasks/tasks.parquet` - Literal string, not expanded

**Required**: Absolute path or path relative to MCP server working directory

## Next Steps

1. **Determine DATA_DIR location** - Need to know where parquet files are stored
2. **Use absolute path** - Construct full path to `tasks/tasks.parquet`
3. **Alternative**: Parse the large output file from `read_parquet` (not ideal)

## Recommendation

The parquet MCP tool should:
1. Use compact JSON (no pretty-printing) for large responses
2. Support pagination for datasets > 1000 rows
3. Stream responses instead of buffering entire dataset

For file path resolution, the MCP server should:
1. Support environment variable expansion (`${DATA_DIR}`)
2. Or document the expected path format (absolute vs relative)
