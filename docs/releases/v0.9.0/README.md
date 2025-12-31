# Neotoma v0.9.0 - MCP Support System

**Status:** Planning  
**Origin:** Split from v0.2.1  
**Breaking Changes:** No

## Overview

Version 0.9.0 adds MCP-based support inquiry capabilities, enabling users to get help without leaving their AI tool environment. Uses the documentation generated in v0.2.1 as the knowledge base for a RAG-powered support agent.

## Feature Units

### FU-302: MCP Support Inquiry Endpoint
New MCP action `query_support` that accepts support queries and returns agent-generated responses with citations.

### FU-303: Support Agent System
RAG-based support agent that:
- Retrieves relevant documentation context
- Generates accurate responses
- Includes citations to source documentation
- Handles edge cases gracefully

## Dependencies

**Required from previous releases:**
- v0.2.1: Documentation generation (FU-300) - knowledge base
- v0.2.1: Documentation web server (FU-301) - searchable index
- v0.1.0: MCP Server Core (FU-200) - MCP protocol

## Why v0.9.0?

Originally part of v0.2.1, but support capabilities are better positioned immediately before v1.0.0:
- Documentation foundation established early (v0.2.1)
- Support system valuable when user base exists (v1.0.0)
- Reduces v0.2.1 scope for faster delivery
- Better sequencing: docs first, support later

## Usage Example

```typescript
// Query support via MCP
const response = await mcp.call('query_support', {
  query: 'How do I submit a transaction payload?',
  context: ['mcp', 'transactions']
});

// Response includes:
{
  answer: "To submit a transaction payload...",
  citations: [
    { doc: "MCP_SPEC.md", section: "submit_payload" },
    { doc: "payload_model.md", section: "Capability Registry" }
  ],
  related: ["submit_payload", "capabilities"]
}
```

## Timeline

- **Week 1:** MCP Support Endpoint (FU-302)
- **Week 2-3:** Support Agent System (FU-303)
- **Week 4:** Testing & Validation

**Total:** 4 weeks

## Success Criteria

- MCP `query_support` action operational
- Support agent accuracy ≥ 80% on test queries
- Response time < 3s (p95)
- Citations included in all responses
- Edge cases handled gracefully

See `release_plan.md` for complete details.

