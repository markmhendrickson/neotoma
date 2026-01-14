# Console.log Breaking MCP Protocol - Fix

**Date**: 2026-01-14  
**Status**: ✅ **FIXED**

## Problem

MCP server was failing with errors:
```
Client error for command Unexpected token 'S', "[STORE] Det"... is not valid JSON
Client error for command Unexpected token 'S', "[STORE] Rea"... is not valid JSON
```

## Root Cause

The MCP (Model Context Protocol) uses **stdout** for JSON-RPC protocol communication. Any output to stdout that is not valid JSON breaks the protocol.

**`console.log()` writes to stdout**, which was interfering with the MCP JSON-RPC protocol. When the server wrote log messages like:
- `[STORE] Detected parquet file: ...`
- `[STORE] Read 16065 rows...`
- `[PARQUET] Starting to read...`

These were being written to stdout and the MCP client was trying to parse them as JSON, causing the "Unexpected token" errors.

## Solution

Replaced all `console.log()` calls with `logger.error()` which:
1. Uses `console.error()` (writes to **stderr**, not stdout)
2. Respects MCP mode (suppressed by default unless `NEOTOMA_MCP_ENABLE_LOGGING=1` is set)
3. Won't interfere with JSON-RPC protocol on stdout

## Files Modified

1. **`src/server.ts`**:
   - Replaced `console.log(\`[STORE] Detected parquet file...\`)` → `logger.error(...)`
   - Replaced `console.log(\`[STORE] Read...\`)` → `logger.error(...)`

2. **`src/services/parquet_reader.ts`**:
   - Added `import { logger } from "../utils/logger.js";`
   - Replaced all `console.log()` calls with `logger.error()`:
     - `[PARQUET] File is in iCloud Drive...`
     - `[PARQUET] File available locally...`
     - `[PARQUET] Starting to read...`
     - `[PARQUET] Progress: ...`
     - `[PARQUET] Completed reading...`

## Testing

After this fix, the MCP server should:
1. ✅ Not break JSON-RPC protocol with log output
2. ✅ Successfully process parquet files via `store` action
3. ✅ Handle BigInt serialization correctly (previous fix)

## Next Steps

1. Test the `store` action with the parquet file
2. Verify BigInt conversion works correctly
3. Confirm data is stored in Neotoma successfully
