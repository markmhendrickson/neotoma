# Neotoma Authentication and Authorization
*(Auth Flows, Permissions, and Access Control)*

---

## Purpose

Defines authentication flows, permission models, and Row-Level Security (RLS) policies for Neotoma.

---

## Authentication

**Provider:** Supabase Auth

**Flows:**
- Email/password
- OAuth (Google, GitHub)
- Magic link

**Token:** JWT issued by Supabase, validated on every request.

---

## Authorization

**MVP:** All authenticated users can access all records (no per-user isolation).

**Future:** Row-Level Security (RLS) by `user_id`.

```sql
-- Future RLS policy
CREATE POLICY "Users see only their records" ON records
  FOR SELECT
  USING (user_id = auth.uid());
```

---

## MCP Authentication

MCP clients MUST authenticate via session token.

```typescript
// MCP connection
const mcpClient = new MCPClient({
  token: sessionToken, // From Supabase auth
});
```

---

## Error Handling

| Error Code | Meaning | HTTP Status |
|------------|---------|-------------|
| `AUTH_REQUIRED` | No token provided | 401 |
| `AUTH_INVALID` | Invalid token | 401 |
| `AUTH_EXPIRED` | Token expired | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |

---

## Agent Instructions

Load when implementing auth logic, securing endpoints, or adding permissions.

Required co-loaded: `docs/subsystems/privacy.md`, `docs/subsystems/errors.md`

Constraints:
- MUST validate tokens on every request
- MUST NOT log tokens or PII
- MUST use RLS for data isolation (future)





