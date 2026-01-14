# Parquet MCP Tool Bug Report

**Date**: 2026-01-14  
**Issue**: Unexpected file writing behavior and massive output file generation

## Problem

When calling `user-parquet (user).read_parquet` with `limit: 16065`:

### Issue 1: Unexpected File Writing
- **Expected**: JSON response returned directly via MCP protocol
- **Actual**: Message "Output has been written to: /Users/.../agent-tools/...txt (28.6 MB, 690,801 lines)"
- **Root Cause**: Cursor IDE is intercepting large MCP responses and writing them to files instead of returning JSON directly

### Issue 2: Pretty-Printed JSON
- **Expected**: Compact JSON response with 16,065 records
- **Actual**: 28.6 MB file with 690,801 lines
- **Root Cause**: The parquet MCP tool is pretty-printing the JSON response, causing:
  - Each record (~43 fields) spans ~43 lines
  - 16,065 records × ~43 lines = ~690,000 lines
  - Massive file size (28.6 MB) for what should be a smaller response

## Impact

1. **Unexpected Behavior**: MCP tools should return JSON directly, not write to files
2. **Performance**: Slow response times, high memory usage
3. **Storage**: Unnecessary disk usage for temporary files
4. **Usability**: Difficult to process large responses
5. **Protocol Violation**: MCP tools should return responses via JSON-RPC, not file paths

## Root Causes

1. **Cursor IDE Behavior**: Cursor is automatically writing large MCP responses to files (likely a size threshold feature)
2. **Parquet MCP Tool**: Pretty-printing JSON instead of using compact format
3. **No Pagination**: Tool reads entire dataset at once instead of supporting pagination

## Workaround

For reimporting tasks, use the `store` action with `file_path` instead of reading all data via `read_parquet`.

## Recommendations

### For Parquet MCP Server
1. **Use compact JSON** (no pretty-printing) for all responses
2. **Support pagination** for datasets > 1000 rows (limit + offset parameters)
3. **Stream responses** instead of buffering entire dataset
4. **Return JSON directly** via MCP protocol, not file paths

### For Cursor IDE
1. **Document the file-writing behavior** for large responses
2. **Provide configuration** to disable file writing for MCP responses
3. **Return JSON directly** for responses under a configurable size threshold
4. **Support streaming** for very large responses

## Expected Behavior

MCP tools should return JSON responses directly via the JSON-RPC protocol:

```json
{
  "count": 16065,
  "total_rows": 16065,
  "data": [{"task_id": "...", ...}, ...]
}
```

Not:
```
"Output has been written to: /path/to/file.txt"
```
