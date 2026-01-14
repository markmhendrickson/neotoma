# Parquet MCP Server - Implementation Fixes

**Date**: 2026-01-14  
**Purpose**: Implementation guide to fix issues with `user-parquet (user)` MCP server

## Issues to Fix

1. **Pretty-printed JSON responses** - Causes massive file sizes (28.6 MB for 16,065 records)
2. **No pagination support** - Reads entire dataset at once
3. **Large response handling** - Should use compact JSON and streaming

## Recommended Fixes

### Fix 1: Use Compact JSON (No Pretty-Printing)

**Problem**: JSON responses are pretty-printed, causing:
- 16,065 records × ~43 fields = ~690,000 lines
- 28.6 MB file size for what should be ~5-10 MB

**Solution**: Use `json.dumps()` with `separators` parameter for compact output

**Python Implementation**:
```python
import json

# ❌ BAD: Pretty-printed (current behavior)
response = json.dumps(data, indent=2)

# ✅ GOOD: Compact JSON
response = json.dumps(data, separators=(',', ':'))

# ✅ BETTER: Compact with ensure_ascii=False for Unicode
response = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
```

**TypeScript/JavaScript Implementation**:
```typescript
// ❌ BAD: Pretty-printed (current behavior)
const response = JSON.stringify(data, null, 2);

// ✅ GOOD: Compact JSON
const response = JSON.stringify(data);
```

### Fix 2: Add Pagination Support

**Problem**: `limit` parameter exists but no `offset` parameter for pagination

**Current Tool Schema** (from `read_parquet.json`):
```json
{
  "limit": {
    "type": "integer",
    "description": "Maximum number of rows to return (default: 1000)",
    "default": 1000
  }
}
```

**Recommended Addition**:
```json
{
  "limit": {
    "type": "integer",
    "description": "Maximum number of rows to return (default: 1000, max: 10000)",
    "default": 1000,
    "maximum": 10000
  },
  "offset": {
    "type": "integer",
    "description": "Number of rows to skip (for pagination)",
    "default": 0,
    "minimum": 0
  }
}
```

**Python Implementation**:
```python
def read_parquet(data_type: str, limit: int = 1000, offset: int = 0, **kwargs):
    """
    Read parquet file with pagination support.
    
    Args:
        data_type: The data type name
        limit: Maximum number of rows to return (default: 1000, max: 10000)
        offset: Number of rows to skip (for pagination)
    """
    # Enforce maximum limit to prevent huge responses
    limit = min(limit, 10000)
    
    # Read parquet file
    df = pd.read_parquet(f"{DATA_DIR}/{data_type}/{data_type}.parquet")
    
    # Apply filters, sorting, etc. (existing logic)
    # ...
    
    # Apply pagination
    total_rows = len(df)
    paginated_df = df.iloc[offset:offset + limit]
    
    # Convert to records
    records = paginated_df.to_dict('records')
    
    # Return compact JSON response
    return {
        "count": len(records),
        "total_rows": total_rows,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total_rows,
        "data": records  # Will be serialized as compact JSON
    }
```

### Fix 3: Automatic Pagination for Large Requests

**Problem**: When `limit` exceeds threshold, should automatically paginate or warn

**Implementation**:
```python
def read_parquet(data_type: str, limit: int = 1000, offset: int = 0, **kwargs):
    # Warn if limit is very large
    if limit > 10000:
        # Option 1: Auto-limit to 10000
        limit = 10000
        warning = f"Limit capped at 10000 for performance. Use pagination with offset for more rows."
        
        # Option 2: Return error
        # raise ValueError("Limit cannot exceed 10000. Use pagination with offset parameter.")
    
    # Read and paginate
    df = pd.read_parquet(f"{DATA_DIR}/{data_type}/{data_type}.parquet")
    total_rows = len(df)
    
    # Apply pagination
    paginated_df = df.iloc[offset:offset + limit]
    records = paginated_df.to_dict('records')
    
    response = {
        "count": len(records),
        "total_rows": total_rows,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total_rows,
        "data": records
    }
    
    # Add warning if limit was capped
    if 'warning' in locals():
        response['warning'] = warning
    
    return response
```

### Fix 4: Response Serialization (MCP Server)

**Current Issue**: MCP server returns pretty-printed JSON

**Python MCP Server Fix**:
```python
from mcp.types import TextContent
import json

@app.call_tool()
async def handle_read_parquet(arguments: dict) -> list[TextContent]:
    """Handle read_parquet tool call."""
    try:
        data_type = arguments.get("data_type")
        limit = arguments.get("limit", 1000)
        offset = arguments.get("offset", 0)
        
        # Read parquet data (with pagination)
        result = read_parquet(
            data_type=data_type,
            limit=limit,
            offset=offset,
            filters=arguments.get("filters"),
            sort_by=arguments.get("sort_by"),
            columns=arguments.get("columns")
        )
        
        # ✅ Use compact JSON (no pretty-printing)
        response_text = json.dumps(result, separators=(',', ':'), ensure_ascii=False)
        
        return [TextContent(
            type="text",
            text=response_text
        )]
        
    except Exception as e:
        error_response = json.dumps({
            "error": str(e),
            "error_type": type(e).__name__
        }, separators=(',', ':'))
        
        return [TextContent(
            type="text",
            text=error_response
        )]
```

**TypeScript MCP Server Fix**:
```typescript
async function handleReadParquet(args: {
  data_type: string;
  limit?: number;
  offset?: number;
  filters?: Record<string, any>;
  sort_by?: Array<{column: string; ascending?: boolean}>;
  columns?: string[];
}): Promise<Array<TextContent>> {
  try {
    const limit = Math.min(args.limit || 1000, 10000);
    const offset = args.offset || 0;
    
    // Read parquet data
    const result = await readParquetFile({
      dataType: args.data_type,
      limit,
      offset,
      filters: args.filters,
      sortBy: args.sort_by,
      columns: args.columns
    });
    
    // ✅ Use compact JSON (no pretty-printing)
    const responseText = JSON.stringify(result);
    
    return [{
      type: "text",
      text: responseText
    }];
    
  } catch (error: any) {
    const errorResponse = JSON.stringify({
      error: error.message,
      error_type: error.constructor.name
    });
    
    return [{
      type: "text",
      text: errorResponse
    }];
  }
}
```

## Complete Implementation Example

### Python (using pandas/pyarrow)

```python
import json
import pandas as pd
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_DIR = Path(os.getenv("DATA_DIR", "~/data"))

def read_parquet_file(
    data_type: str,
    limit: int = 1000,
    offset: int = 0,
    filters: Optional[Dict[str, Any]] = None,
    sort_by: Optional[List[Dict[str, Any]]] = None,
    columns: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Read parquet file with pagination and filtering.
    
    Returns compact JSON-serializable response.
    """
    # Enforce maximum limit
    limit = min(limit, 10000)
    
    # Construct file path
    file_path = DATA_DIR / data_type / f"{data_type}.parquet"
    
    if not file_path.exists():
        raise FileNotFoundError(f"Parquet file not found: {file_path}")
    
    # Read parquet file
    df = pd.read_parquet(file_path, columns=columns)
    
    # Apply filters (existing filter logic)
    if filters:
        df = apply_filters(df, filters)
    
    # Apply sorting (existing sort logic)
    if sort_by:
        df = apply_sorting(df, sort_by)
    
    # Get total count before pagination
    total_rows = len(df)
    
    # Apply pagination
    paginated_df = df.iloc[offset:offset + limit]
    
    # Convert to records (list of dicts)
    records = paginated_df.to_dict('records')
    
    # Build response
    response = {
        "count": len(records),
        "total_rows": total_rows,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total_rows,
        "data": records
    }
    
    # Add warning if limit was capped
    if limit >= 10000 and args.get("limit", 1000) > 10000:
        response["warning"] = "Limit capped at 10000 for performance. Use pagination with offset for more rows."
    
    return response

# MCP Server handler
@app.call_tool()
async def handle_read_parquet(arguments: dict) -> list[TextContent]:
    """Handle read_parquet tool call with compact JSON."""
    try:
        result = read_parquet_file(
            data_type=arguments["data_type"],
            limit=arguments.get("limit", 1000),
            offset=arguments.get("offset", 0),
            filters=arguments.get("filters"),
            sort_by=arguments.get("sort_by"),
            columns=arguments.get("columns")
        )
        
        # ✅ Compact JSON (no pretty-printing)
        response_text = json.dumps(result, separators=(',', ':'), ensure_ascii=False)
        
        return [TextContent(type="text", text=response_text)]
        
    except Exception as e:
        error_response = json.dumps({
            "error": str(e),
            "error_type": type(e).__name__
        }, separators=(',', ':'))
        
        return [TextContent(type="text", text=error_response)]
```

## Testing

### Before Fix
- Request: `read_parquet(data_type="tasks", limit=16065)`
- Response: 28.6 MB file, 690,801 lines
- Format: Pretty-printed JSON

### After Fix
- Request: `read_parquet(data_type="tasks", limit=10000, offset=0)`
- Response: ~8-10 MB, compact JSON
- Format: Compact JSON (single line per record in array)
- Pagination: Use `offset=10000` for next page

## Migration Guide

1. **Update tool schema** - Add `offset` parameter to `read_parquet.json`
2. **Update implementation** - Use compact JSON serialization
3. **Add pagination logic** - Implement offset-based pagination
4. **Enforce limits** - Cap maximum limit at 10,000 rows
5. **Update documentation** - Document pagination usage

## Expected Results

- **File size reduction**: 28.6 MB → ~8-10 MB (for 16,065 records)
- **Line count reduction**: 690,801 lines → ~16,065 lines (one per record)
- **Performance**: Faster serialization, lower memory usage
- **Usability**: Easier to process responses, supports pagination
