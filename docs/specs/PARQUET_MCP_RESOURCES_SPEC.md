# Parquet MCP Resources Specification

**Date**: 2026-01-15  
**Status**: 📋 **SPECIFICATION** - Implementation guide for adding resources to parquet MCP server

## Purpose

This document specifies the resource URI patterns and implementation requirements for adding MCP resources capability to the `user-parquet (user)` MCP server. Resources enable browseable, read-only access to parquet data without requiring complex tool calls.

## Resource URI Scheme

**Base scheme**: `parquet://`

All resource URIs follow the pattern: `parquet://{resource_type}/{identifier}`

## Resource Types

### 1. Data Type Collections

**URI Pattern**: `parquet://data_types/{data_type}`

**Description**: Access all rows from a specific data type's parquet file

**Examples**:

- `parquet://data_types/task` - All task rows
- `parquet://data_types/invoice` - All invoice rows
- `parquet://data_types/transaction` - All transaction rows

**Implementation**:

- List all available data types via `list_data_types` tool
- For each data type, create resource: `parquet://data_types/{data_type}`
- When reading resource, use `read_parquet` with `data_type` parameter
- Limit to first 100 rows (for resource browsing)
- Return compact JSON (not pretty-printed)

### 2. Data Type List

**URI Pattern**: `parquet://data_types`

**Description**: List all available data types

**Implementation**:

- Call `list_data_types` tool
- Return list of data types with metadata (row counts, file sizes if available)

### 3. Schema Resources

**URI Pattern**: `parquet://schemas/{data_type}`

**Description**: Get schema information for a specific data type

**Examples**:

- `parquet://schemas/task` - Task schema
- `parquet://schemas/invoice` - Invoice schema

**Implementation**:

- Call `get_schema` tool with `data_type` parameter
- Return schema information (column names, types, nullable flags)

### 4. File Resources

**URI Pattern**: `parquet://files/{filename}`

**Description**: Access parquet file by filename (if file-based access is supported)

**Examples**:

- `parquet://files/task.parquet`
- `parquet://files/tasks/tasks.parquet` (if subdirectory structure)

**Implementation**:

- List all parquet files in DATA_DIR
- For each file, create resource: `parquet://files/{relative_path}`
- When reading, use file path to read parquet file

## Resource List Implementation

### `list_resources` Handler

**Returns**: Array of resource descriptors

```python
{
  "resources": [
    {
      "uri": "parquet://data_types",
      "name": "Data Types",
      "description": "List all available data types",
      "mimeType": "application/json"
    },
    {
      "uri": "parquet://data_types/task",
      "name": "Task Data",
      "description": "All task rows from parquet file",
      "mimeType": "application/json"
    },
    {
      "uri": "parquet://data_types/invoice",
      "name": "Invoice Data",
      "description": "All invoice rows from parquet file",
      "mimeType": "application/json"
    },
    {
      "uri": "parquet://schemas/task",
      "name": "Task Schema",
      "description": "Schema information for task data type",
      "mimeType": "application/json"
    }
    // ... more resources
  ]
}
```

**Implementation Steps**:

1. **Get all data types**:

   ```python
   # Use existing list_data_types tool logic
   data_types = list_data_types()
   ```

2. **Create data type collection resources**:

   ```python
   for data_type in data_types:
       resources.append({
           "uri": f"parquet://data_types/{data_type}",
           "name": f"{data_type.capitalize()} Data",
           "description": f"All {data_type} rows from parquet file",
           "mimeType": "application/json"
       })
   ```

3. **Create schema resources**:

   ```python
   for data_type in data_types:
       resources.append({
           "uri": f"parquet://schemas/{data_type}",
           "name": f"{data_type.capitalize()} Schema",
           "description": f"Schema information for {data_type} data type",
           "mimeType": "application/json"
       })
   ```

4. **Add data types collection resource**:
   ```python
   resources.append({
       "uri": "parquet://data_types",
       "name": "Data Types",
       "description": "List all available data types",
       "mimeType": "application/json"
   })
   ```

## Resource Read Implementation

### `read_resource` Handler

**Parameters**: `{ uri: string }`

**Returns**: Resource content

**URI Parsing**:

```python
def parse_resource_uri(uri: str) -> dict:
    """Parse parquet resource URI into components."""
    if not uri.startswith("parquet://"):
        raise ValueError(f"Invalid URI scheme: {uri}")

    path = uri[10:]  # Remove "parquet://" prefix
    segments = [s for s in path.split("/") if s]

    if len(segments) == 0:
        raise ValueError("Empty resource path")

    resource_type = segments[0]

    if resource_type == "data_types":
        if len(segments) == 1:
            return {"type": "data_types_list"}
        elif len(segments) == 2:
            return {"type": "data_type_collection", "data_type": segments[1]}
        else:
            raise ValueError(f"Invalid data_types path: {uri}")

    elif resource_type == "schemas":
        if len(segments) == 2:
            return {"type": "schema", "data_type": segments[1]}
        else:
            raise ValueError(f"Invalid schemas path: {uri}")

    elif resource_type == "files":
        if len(segments) >= 2:
            filename = "/".join(segments[1:])
            return {"type": "file", "filename": filename}
        else:
            raise ValueError(f"Invalid files path: {uri}")

    else:
        raise ValueError(f"Unknown resource type: {resource_type}")
```

**Resource Handlers**:

```python
async def handle_read_resource(uri: str) -> dict:
    """Handle read_resource request."""
    parsed = parse_resource_uri(uri)

    if parsed["type"] == "data_types_list":
        # Return list of all data types
        data_types = list_data_types()
        return {
            "type": "data_types_list",
            "data_types": data_types,
            "count": len(data_types)
        }

    elif parsed["type"] == "data_type_collection":
        # Read parquet data (limit to 100 rows for resource browsing)
        data_type = parsed["data_type"]
        result = read_parquet(
            data_type=data_type,
            limit=100,  # Limit for resource browsing
            offset=0
        )
        return {
            "type": "data_type_collection",
            "data_type": data_type,
            "data": result["data"],
            "total_rows": result.get("total_rows", len(result["data"])),
            "returned": len(result["data"]),
            "note": "Limited to 100 rows. Use read_parquet tool for full dataset or pagination."
        }

    elif parsed["type"] == "schema":
        # Get schema information
        data_type = parsed["data_type"]
        schema = get_schema(data_type=data_type)
        return {
            "type": "schema",
            "data_type": data_type,
            "schema": schema
        }

    elif parsed["type"] == "file":
        # Read file by filename
        filename = parsed["filename"]
        # Implementation depends on file access pattern
        # Could use read_parquet with file_path if supported
        raise NotImplementedError("File resources not yet implemented")

    else:
        raise ValueError(f"Unknown resource type: {parsed['type']}")
```

## Response Format

**Important**: Use compact JSON (not pretty-printed) for all resource responses to minimize size.

```python
# ✅ GOOD: Compact JSON
response_text = json.dumps(data, separators=(',', ':'), ensure_ascii=False)

# ❌ BAD: Pretty-printed (causes large responses)
response_text = json.dumps(data, indent=2)
```

**MCP Response Format**:

```python
{
    "contents": [
        {
            "uri": "parquet://data_types/task",
            "mimeType": "application/json",
            "text": "{\"type\":\"data_type_collection\",\"data_type\":\"task\",\"data\":[...],\"total_rows\":16065,\"returned\":100}"
        }
    ]
}
```

## Integration with Existing Tools

Resources should complement existing tools:

- **Resources**: For discovery and simple browsing (limited to 100 rows)
- **Tools**: For complex queries, filtering, pagination, mutations

**Example Workflow**:

1. **Discovery**: Use `list_resources` to see available data types
2. **Browse**: Use `read_resource` with `parquet://data_types/task` to see sample data
3. **Query**: Use `read_parquet` tool for full dataset with filters/pagination

## Benefits

1. **Discovery**: Agents can discover available data types without calling tools
2. **Browsing**: Quick access to sample data for exploration
3. **Consistency**: Aligns with Neotoma MCP resource pattern
4. **Efficiency**: Reduces tool calls for simple browsing operations

## Implementation Checklist

- [ ] Add `list_resources` handler to parquet MCP server
- [ ] Add `read_resource` handler to parquet MCP server
- [ ] Implement URI parsing for `parquet://` scheme
- [ ] Implement resource handlers for each resource type
- [ ] Use compact JSON (not pretty-printed) for responses
- [ ] Limit data collection resources to 100 rows
- [ ] Add resource descriptors to MCP server capabilities
- [ ] Test resource discovery via `list_resources`
- [ ] Test resource reading via `read_resource`
- [ ] Document resource URIs in MCP server documentation

## Related Documents

- [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) - Complete MCP action specification
- [`src/server.ts`](../../src/server.ts) - Neotoma MCP resource implementation (reference)
