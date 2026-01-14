# BigInt Serialization Error - Debug Analysis

**Date**: 2026-01-14  
**Status**: ⚠️ **ONGOING** - Error persists after multiple fixes

## Problem

When storing tasks from parquet file via MCP `store` action:
```
Error: Failed to process parquet file: Do not know how to serialize a BigInt
```

## Investigation Results

### ✅ What Works
1. **Direct function call**: `readParquetFile()` works when called directly via Node.js
   - Test: `node -e "readParquetFile('/path/to/tasks.parquet')"` → Success: 16065 rows
2. **Unit tests**: All 10 parquet_reader tests pass
3. **BigInt conversion**: `convertBigIntValues()` function works correctly
4. **Code compilation**: TypeScript builds successfully

### ❌ What Doesn't Work
1. **MCP store action**: Fails with BigInt serialization error
2. **Error occurs**: During `readParquetFile()` call within MCP handler
3. **Error message**: "Do not know how to serialize a BigInt" (standard JavaScript error)

## Root Cause Hypothesis

The error "Do not know how to serialize a BigInt" is thrown by JavaScript's `JSON.stringify()` when it encounters a BigInt value without a replacer function. Since:

1. Direct function call works ✅
2. Unit tests pass ✅
3. BigInt conversion is implemented ✅

The error is likely happening in one of these scenarios:

### Hypothesis 1: MCP SDK Error Serialization
The MCP SDK might be trying to serialize the error object, and the error object contains BigInt values (perhaps from the parquet result or entities array that was partially read).

### Hypothesis 2: Error Object Contains BigInt
When an error occurs in `readParquetFile`, the error object might contain:
- Partially read entities with BigInt values
- Metadata with BigInt values
- Stack trace or other properties with BigInt values

### Hypothesis 3: Console.log Serialization
The `console.log()` statements might be trying to serialize objects containing BigInt values (though this is unlikely as console.log typically handles BigInt).

### Hypothesis 4: Progress Callback
The `options?.onProgress` callback might be trying to serialize data containing BigInt values.

## Fixes Applied

1. ✅ Added `convertBigIntValues()` function with recursive conversion
2. ✅ Added BigInt replacers to all `JSON.stringify()` calls
3. ✅ Added deep conversion pass before returning results
4. ✅ Added error message sanitization
5. ✅ Added try-catch around conversion with fallback
6. ✅ Added final serialization check before returning
7. ✅ Fixed TypeScript compilation errors

## Next Steps

1. **Check MCP server logs**: Enable logging to see where exactly the error occurs
2. **Add more defensive error handling**: Wrap entire operation in try-catch that sanitizes all BigInt values
3. **Test with smaller file**: Try with a smaller parquet file to isolate the issue
4. **Check parquet library**: The `@dsnp/parquetjs` library might be serializing something internally

## Recommendation

Since the direct function call works, the issue is likely in the MCP error handling or serialization. Consider:

1. **Restart MCP server** after rebuild (may have cached old code)
2. **Add logging** to identify exact location of error
3. **Test with minimal example** to isolate the issue
