# MCP Server Examples from Cursor Docs

This document summarizes MCP server examples from [Cursor's MCP documentation](https://cursor.com/docs/context/mcp#servers) and the mcp-test-servers repo: two structural examples (image/instructions/OAuth repro, pg-mcp-server) and five additional OAuth servers (oauth-ping, oauth-token-refresh, oauth-debug, oauth-edge-case, oauth-callback-test). It describes how they implement server setup, auth, discovery, and initialize behavior, consolidates learnings across all servers (including Notion MCP production example), and adds a **Cursor and OAuth docs summary** drawn from Cursor’s docs, the MCP Authorization specification (2025-03-26), and RFC 8414.

## 1. msfeldstein/mcp-test-servers

**Repo:** https://github.com/msfeldstein/mcp-test-servers  
**Referenced in Cursor docs:** Image-returning tool example and OAuth test servers.

### How they do it

**Image server (stdio, no auth)**

- Uses `McpServer({ name, version })` with `StdioServerTransport`.
- Registers tools and resources; no custom `serverInfo` or `instructions`.
- No auth; env or API keys not used in the image example.

**Instructions server (stdio)**

- Uses `McpServer(serverInfo, options)` with a second argument:  
  `{ instructions: "the value is 33" }`.
- So **instructions** are passed in as **options** to the SDK `McpServer` constructor; the SDK then includes them in the initialize result.
- Neotoma sets `instructions` (and `serverInfo.title` / `serverInfo.description`) in the **initialize response** in `getUnauthenticatedResponse()` instead of at server construction, which is correct when using a custom initialize handler.

**OAuth repro server (HTTP, auth at HTTP layer)**

- **Auth is enforced before MCP:** `app.all("/mcp*", ...)` middleware returns **401 Unauthorized** with `WWW-Authenticate: Bearer resource_metadata="<url>/.well-known/oauth-protected-resource"` when the request has no or invalid Bearer token.
- Unauthenticated clients never reach the MCP `initialize` handler; they get 401 at the HTTP layer. Cursor can then show an auth/Connect flow based on that.
- Resource server exposes `/.well-known/oauth-protected-resource` with `authorization_servers: [AUTH_SERVER_URL]` so the client discovers the auth server.
- MCP server is created with `McpServer({ name, version, capabilities: { tools: {} } })`; no custom `serverInfo.title` or `description` for “Authentication needed” because unauthed users never get an MCP response.

**Takeaway for Neotoma:**  
We deliberately avoid returning 401 on `/mcp` when unauthed (that led Cursor to show “Error - Show Output”). Instead we return a successful initialize with OAuth capability, empty tools/resources, and `serverInfo.title` / `serverInfo.description` / `instructions` so the client can show “Authentication needed” and a Connect button. Our approach is the “soft” auth variant; the OAuth repro uses the “hard” 401 variant.

---

## 2. ericzakariasson/pg-mcp-server

**Repo:** https://github.com/ericzakariasson/pg-mcp-server  
**Referenced in Cursor docs:** [Building an MCP Server](https://cursor.com/docs/cookbook/building-mcp-server) cookbook (“The final results can be seen here: pg-mcp-server”).

### How they do it

**Server construction (mcp-core.ts)**

- Single shared core: `createPostgresMcpServer(transportKind)` builds one `McpServer` used by both stdio and HTTP.
- `new McpServer({ name: "postgres-mcp-server", version: "0.1.0" })` only; no `serverInfo.description`, `title`, or `instructions`.
- No MCP-level auth; access control is via `DATABASE_URL` and same-process trust.
- Tools/resources are registered with `server.registerTool` and `server.registerResource` (SDK API).

**HTTP transport (mcp-server-http.ts)**

- Node `http.createServer`: POST/GET/DELETE to `/mcp` are forwarded to `transport.handleRequest(req, res, parsed)`.
- `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` for a stateless server.
- No auth middleware; no 401. Configuration (e.g. DB) is via env.

**Takeaway for Neotoma**

- Good reference for **structure**: one “mcp-core” that creates the server and registers tools/resources; separate entrypoints for stdio vs HTTP that only differ by transport.
- They do not implement OAuth or “Authentication needed” messaging; we already do that in `getUnauthenticatedResponse()` with `serverInfo.title`, `serverInfo.description`, and `instructions`.

---

## 3. oauth-ping-server (mcp-test-servers)

**Location:** Same repo as section 1: `oauth-ping-server.js` (or equivalent in mcp-test-servers).

### How it does auth

- **SDK-driven OAuth:** Uses `ProxyOAuthServerProvider` and `mcpAuthRouter` from the MCP SDK. The SDK owns discovery and auth flow.
- **Server:** `McpServer` is created with `serverInfo.authenticationStrategies` and a `wellKnownUrl` (or equivalent) so the SDK can expose `/.well-known/mcp-configuration` (or similar) for client discovery.
- **Middleware:** `mcpExpressMiddleware(server)` wraps the MCP server; auth and token validation are handled inside the SDK layer.
- **Tools:** Tools declare `authentication: { strategies: ["oauth2-proxy-example"] }` so the SDK knows which requests require auth.

### Takeaway

- Auth and discovery live in the SDK (e.g. `/.well-known/mcp-configuration`), not in custom 401 middleware. Contrast with oauth-repro, which does 401 at the HTTP layer before MCP.

---

## 4. oauth-token-refresh-server (mcp-test-servers)

**Location:** Same repo; token-refresh test server.

### How it does auth

- **Same 401-before-MCP pattern as oauth-repro:** Unauthenticated requests to `/mcp*` get 401 with `WWW-Authenticate` and resource metadata URL.
- **Adds refresh flow:** Implements `refresh_token` grant and **short-lived access tokens** so Cursor’s token refresh behavior can be tested.
- **Auth server:** Separate auth server issues access + refresh tokens; resource server validates Bearer and can coordinate with auth server for refresh.

### Takeaway

- For clients that support refresh, the 401 pattern still applies at first request; refresh is an extension of the same OAuth model (refresh_token grant, new access token).

---

## 5. oauth-debug-server (mcp-test-servers)

**Location:** Same repo; debug/diagnostic server.

### How it does auth

- **Same 401-before-MCP pattern:** Unauthenticated calls to MCP endpoints return 401.
- **Request logging:** All incoming requests are logged for inspection.
- **Debug endpoints:** e.g. `/debug/requests`, `/debug/oauth-state` to observe Cursor’s discovery and callback behavior (e.g. which URLs are hit, in what order).

### Takeaway

- Useful for reproducing Cursor discovery bugs: see exactly what the client requests and what state the server has after OAuth callback.

---

## 6. oauth-edge-case-server (mcp-test-servers)

**Location:** Same repo; configurable edge-case server.

### How it does auth

- **Same 401-before-MCP pattern:** Resource server returns 401 when no valid Bearer token.
- **Configurable edge cases:** Environment or flags control:
  - **Response delay:** Simulate slow `/.well-known` or token responses.
  - **MULTIPLE_AUTH_SERVERS:** Expose multiple `authorization_servers` in discovery.
  - **DISCOVERY_VARIANT:** `minimal` vs `extra-fields` in discovery document to test client tolerance.

### Takeaway

- Helps verify Cursor behavior with slow networks, multiple auth servers, and different discovery document shapes.

---

## 7. oauth-callback-test-server (mcp-test-servers)

**Location:** Same repo; callback-focused test app.

### How it does auth

- **Callback-focused:** Implements routes such as `/oauth/user-hound/callback` to receive the OAuth callback from the provider.
- **Documents Cursor behavior:** Captures and documents invalid or unexpected **post-callback requests** from Cursor, e.g.:
  - Requests to `/.well-known/oauth-protected-resource/mcp` (path variants).
  - Sending the token to the resource server in ways that don’t match the spec.
- **Purpose:** Reproduce and document client bugs so server authors can design around them or report fixes.

### Takeaway

- Cursor’s post-callback sequence can send malformed or non-standard requests; having a dedicated callback test server helps document and work around these behaviors.

---

## 8. Notion MCP (Production Remote Server)

**Repo:** https://github.com/makenotion/notion-mcp-server (local, deprecated)  
**Production:** https://mcp.notion.com/mcp (remote, active)  
**Docs:** https://developers.notion.com/guides/mcp/get-started-with-mcp

### How they do it

**Configuration:**
- Simple URL-based configuration: `{"mcpServers": {"notion": {"url": "https://mcp.notion.com/mcp"}}}`
- No headers, no manual tokens, no connection IDs required
- **Connect button appears automatically** in Cursor settings

**Key characteristics:**
- **Remote HTTPS server** (not localhost)
- **OAuth authentication** via Connect button
- **Streamable HTTP transport** at `https://mcp.notion.com/mcp`
- **Production-grade** implementation used by thousands of users

**OAuth flow:**
1. User adds server via URL in Cursor settings
2. Cursor shows "Needs authentication" with **Connect button**
3. User clicks Connect, completes OAuth flow
4. Server is authenticated and ready to use

**Implementation details (inferred):**
- Must implement proper OAuth discovery endpoints (`/.well-known/oauth-authorization-server`)
- Must return proper initialize response with OAuth capabilities
- Likely uses 401 pattern before initialize (per MCP spec)
- HTTPS requirement (not localhost) may be important for Connect button

### Takeaway

- **Notion MCP proves Connect buttons work for URL-based servers**
- Production HTTPS URL (`https://mcp.notion.com/mcp`) shows Connect button
- Simple configuration (just URL, no headers)
- This contradicts the earlier finding that URL-based servers don't show Connect buttons
- **Key difference:** Production HTTPS vs localhost testing

---

## Learnings from all servers

Summarizing patterns across: **oauth-repro**, **oauth-ping**, **oauth-token-refresh**, **oauth-debug**, **oauth-edge-case**, **oauth-callback-test** (all mcp-test-servers), **pg-mcp-server**, and **Notion MCP** (production remote server with Connect button).

### Auth strategy: 401 at HTTP vs 200 + OAuth capability

- **401 (hard):** oauth-repro, oauth-token-refresh, oauth-debug, oauth-edge-case return **401 Unauthorized** on `/mcp*` (and sometimes on `/.well-known/oauth-protected-resource`) when the request has no or invalid Bearer token. Per the MCP Authorization spec, servers **MUST** use 401 when authorization is required and not yet proven. Cursor can then trigger Connect/OAuth from that 401.
- **200 + empty tools (soft):** Neotoma returns **200** with a valid MCP `initialize` that includes OAuth capability, empty tools/resources, and `serverInfo.title` / `serverInfo.description` / `instructions` stating “Authentication needed” and “Use the Connect button.” We adopted this to avoid Cursor showing “Error - Show Output” when we previously used 401.
- **SDK auth (oauth-ping):** One example uses the SDK’s built-in auth (`ProxyOAuthServerProvider`, `mcpAuthRouter`, `mcpExpressMiddleware`), with discovery at e.g. `/.well-known/mcp-configuration` and tool-level `authentication.strategies`. The rest use custom 401 middleware in front of MCP.

### Discovery and Cursor behavior

- **RFC 8414:** Discovery typically uses `/.well-known/oauth-authorization-server` (or fallbacks like `/authorize`, `/token`, `/register`). Resource servers expose `/.well-known/oauth-protected-resource` with `authorization_servers: [auth_server_url]`.
- **Cursor bugs:** The callback-test and debug servers exist to capture Cursor sending invalid or unexpected requests after callback (e.g. wrong paths, token sent to wrong endpoint). Edge-case server tests delay and multiple auth servers / discovery variants.

### Refresh and token lifetime

- **oauth-token-refresh** shows that refresh belongs in the auth server (`refresh_token` grant, short-lived access tokens). The resource server still validates Bearer tokens; 401 at HTTP layer is unchanged for unauthenticated first request.

### Structure and transport

- **pg-mcp-server** is a good structural reference: one core that builds `McpServer` and registers tools/resources; separate stdio and HTTP entrypoints that only change the transport. No OAuth.
- **instructions:** Can be set via SDK constructor options (instructions-server) or in the **initialize response** when using a custom initialize handler (Neotoma’s `getUnauthenticatedResponse()`).

### How the Connect button is triggered (server-side only)

None of the reference repos implement the Connect button itself; that is Cursor client UI. They show only what the **server** must do so Cursor shows Connect:

1. **401 path (oauth-repro, token-refresh, debug, edge-case):** The resource server returns **401 Unauthorized** on `/mcp` with header `WWW-Authenticate: Bearer resource_metadata="<base>/.well-known/oauth-protected-resource"`. Cursor then discovers the auth server from that metadata and starts the OAuth flow (Connect/auth UX). The oauth-repro source documents Cursor's **post-callback** bug (requests to wrong paths like `/.well-known/oauth-authorization-server/mcp`), inferred from server logs.

2. **200 + capability path (Neotoma):** The server returns **200** with an MCP `initialize` that includes `capabilities.authentication` (e.g. `authorizationUrl`, `tokenUrl`) and optionally `serverInfo.title` / `description` / `instructions`. Cursor can then show Connect and run the same OAuth flow without having received 401.

So the reference repos only document **server-side triggers** for Connect (401 + discovery vs 200 + auth capability). Exact Connect UI behavior is Cursor implementation detail and not shown in the repos.

### Connect UX Implementation Patterns (from mcp-test-servers)

After studying the oauth-related servers in detail, here are the specific implementation patterns for triggering Connect UX:

#### Pattern 1: HTTP Layer 401 (oauth-repro, oauth-debug, oauth-edge-case)

**Implementation:**
```javascript
// Middleware BEFORE MCP handler
app.all("/mcp*", (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.set('WWW-Authenticate', 
      `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
    return res.status(401).send('Unauthorized');
  }
  
  // Token validation...
  // If invalid/expired, return 401 with same header
  
  next(); // Continue to MCP handler only if authenticated
});
```

**Key points:**
- **401 on ALL `/mcp*` requests** (GET, POST, DELETE) when unauthenticated
- **401 on `/.well-known/oauth-protected-resource`** when unauthenticated (oauth-repro pattern)
- **WWW-Authenticate header** points to protected resource discovery endpoint
- **MCP handler never reached** for unauthenticated requests
- **Separate auth server** (different port) for authorization/token endpoints

**Why this works:**
- Cursor receives 401 before MCP initialize
- Cursor reads `WWW-Authenticate` header
- Cursor discovers auth server from `/.well-known/oauth-protected-resource`
- Cursor triggers OAuth flow and shows Connect button

#### Pattern 2: SDK-Based Auth (oauth-ping)

**Implementation:**
```javascript
// Use SDK's built-in OAuth middleware
const proxyProvider = new ProxyOAuthServerProvider({...});
app.use(mcpAuthRouter({ provider: proxyProvider, ... }));

const server = new McpServer({
  serverInfo: {
    authenticationStrategies: [{
      id: "oauth2-proxy-example",
      type: "oauth2",
      authorizationUrl: `${BASE_URL}/authorize`,
      tokenUrl: `${BASE_URL}/token`,
      scopes: ["ping_scope"],
      pkce: true,
    }],
  },
});

// Tools declare auth requirement
server.registerTool({
  toolName: "ping",
  authentication: {
    strategies: ["oauth2-proxy-example"],
  },
  run: async (params, context) => { ... },
});
```

**Key points:**
- **SDK handles 401** automatically via `mcpAuthRouter`
- **Discovery at `/.well-known/mcp-configuration`** (SDK-specific)
- **Tool-level auth** via `authentication.strategies` array
- **Server-level strategies** in `serverInfo.authenticationStrategies`

**Why this works:**
- SDK middleware returns 401 when tools require auth
- SDK exposes discovery endpoints automatically
- Cursor reads SDK discovery format and triggers OAuth

#### Pattern 3: Neotoma's Soft Auth (Current Implementation)

**Implementation:**
```typescript
// Return 200 with OAuth capability in initialize
private getUnauthenticatedResponse() {
  return {
    protocolVersion: "2025-11-25",
    capabilities: {
      authentication: {
        type: "oauth2",
        authorizationUrl: `${config.apiBase}/api/mcp/oauth/authorize`,
        tokenUrl: `${config.apiBase}/api/mcp/oauth/token`,
      },
    },
    serverInfo: {
      title: "Authentication needed",
      description: "Authentication needed. Use the Connect button to sign in.",
      authenticationStrategies: [{...}], // Optional, matches oauth-ping pattern
    },
    instructions: "Authentication needed. Use the Connect button to sign in.",
  };
}
```

**Key points:**
- **200 OK** with valid MCP initialize response
- **OAuth capability** in `capabilities.authentication`
- **User-friendly messaging** in `serverInfo.title/description/instructions`
- **Optional `authenticationStrategies`** array (matches oauth-ping pattern)
- **Discovery endpoints** also exposed (`/.well-known/oauth-authorization-server`)

**Why we use this:**
- Avoids Cursor showing "Error - Show Output" (which happened with 401)
- Still provides OAuth capability for Cursor to discover
- Better UX with clear messaging

#### Critical Finding: Notion MCP Shows Connect Button (URL-Based Server)

**Key Observation:**
- **Notion MCP** (`https://mcp.notion.com/mcp`) is a **remote URL-based server** that **DOES show a Connect button** in Cursor
- This contradicts the earlier finding that URL-based servers don't show Connect buttons
- Configuration is simple: `{"mcpServers": {"notion": {"url": "https://mcp.notion.com/mcp"}}}`

**What This Means:**
- Connect buttons **ARE possible** for URL-based servers
- The issue may be specific to:
  - **localhost URLs** (`http://localhost:8080/mcp`) vs production HTTPS
  - **Discovery endpoint implementation** differences
  - **Initialize response format** differences
  - **401 response timing** or header format

**Notion MCP Implementation (from documentation):**
- Remote server at `https://mcp.notion.com/mcp` (HTTPS, not localhost)
- Simple URL configuration, no headers required
- OAuth flow triggered automatically when first tool is used
- Connect button appears in Cursor settings

**Next Steps for Neotoma:**
1. **Test with HTTPS URL** (production deployment) instead of localhost
2. **Compare initialize response** with Notion's actual response (if accessible)
3. **Verify discovery endpoints** are being hit correctly
4. **Check if 401 pattern is required** (Notion may use 401 before initialize)

**Current Workaround (if Connect button doesn't appear):**
- Users can manually configure `X-Connection-Id` header in `.cursor/mcp.json`
- Create OAuth connection via web UI first
- Copy connection ID to `mcp.json` configuration

**Conclusion:**
- Notion MCP proves Connect buttons work for URL-based servers
- Our implementation may need adjustments for localhost vs HTTPS, or discovery/initialize response format
- Further investigation needed to match Notion's working pattern

### Where Neotoma fits

- Neotoma uses the **soft** variant (200 + OAuth capability + “Authentication needed” messaging) to improve UX in Cursor. We do not return 401 on `/mcp` when unauthed. Our OAuth discovery is communicated via `capabilities.authentication` (initiate/callback URLs) in the initialize result. This is a deliberate deviation from the spec’s “MUST 401” in order to avoid client-side error UX; the learnings from the seven servers explain both the spec-aligned (401) and the pragmatic (200 + empty tools) approaches.

---

## Cursor and OAuth docs summary

Summaries from official Cursor docs, the MCP Authorization specification, and RFC 8414. Use these to align server behavior with client expectations and to document where Neotoma intentionally differs.

### Cursor docs (context/mcp)

**Source:** [Model Context Protocol (MCP)](https://cursor.com/docs/context/mcp)

**Transports and auth:**

- **stdio:** Local, Cursor manages process, single user, auth via env/config (manual).
- **SSE / Streamable HTTP:** Local or remote, deploy as server, multiple users, **OAuth** supported.
- Remote servers use `url` (e.g. `http://localhost:3000/mcp`); optional `headers` for static tokens.

**Static OAuth for remote servers:**

- When the provider gives a fixed Client ID (and optionally Client Secret), add an `auth` object to the server entry: `CLIENT_ID` (required), `CLIENT_SECRET` (optional), `scopes` (optional).
- If `scopes` is omitted, Cursor uses **`/.well-known/oauth-authorization-server`** to discover `scopes_supported`.
- **Redirect URL:** Cursor uses a single fixed redirect for all MCP OAuth flows:  
  `cursor://anysphere.cursor-mcp/oauth/callback`  
  Register this as an allowed redirect URI at the MCP provider. Server identity is encoded in the OAuth `state` parameter.

**Config locations:** Project: `.cursor/mcp.json`; global: `~/.cursor/mcp.json`. Config interpolation is supported for `url`, `command`, `args`, `env`, `headers` (e.g. `${env:NAME}`).

**Cursor’s expectations:** Cursor “supports OAuth for servers that require it.” Discovery is via RFC 8414 (`/.well-known/oauth-authorization-server`) when using static client credentials and no scopes are provided.

### MCP Authorization specification (2025-03-26)

**Source:** [Authorization - Model Context Protocol](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)

**Applicability:** Authorization is **OPTIONAL**. When supported, HTTP-based transports **SHOULD** conform; STDIO **SHOULD NOT** (credentials from environment). Based on OAuth 2.1 (with mandatory PKCE), RFC 8414 (Authorization Server Metadata), and RFC 7591 (Dynamic Client Registration).

**401 requirement:**  
“When authorization is required and not yet proven by the client, servers **MUST** respond with **HTTP 401 Unauthorized**.” Clients start the OAuth 2.1 flow after receiving 401.

**Discovery:**

- **Clients MUST** use OAuth 2.0 Authorization Server Metadata (RFC 8414).
- **Servers SHOULD** support it; if not, **MUST** support fallback URLs.
- **Authorization base URL:** From the MCP server URL by **dropping any path**. Example: MCP at `https://api.example.com/v1/mcp` implies metadata at `https://api.example.com/.well-known/oauth-authorization-server`.
- **Fallbacks** (relative to authorization base URL): `/authorize`, `/token`, `/register`.

**Dynamic Client Registration:** Clients and servers **SHOULD** support RFC 7591. Servers that do not must provide another way to obtain client ID (and secret if needed); clients then hardcode or ask the user.

**Tokens:** Bearer token in `Authorization` header on every request. Invalid or expired tokens **MUST** receive **HTTP 401**. Status code summary: 401 (required or invalid token), 403 (invalid/insufficient scopes), 400 (malformed request).

**Security:** PKCE **REQUIRED** for all clients. Token rotation SHOULD be used. Redirect URIs MUST be validated; only localhost or HTTPS.

**Third-party auth:** Servers MAY act as both OAuth client (to third-party IdP) and OAuth authorization server (to MCP client); session binding and token lifecycle must be defined.

### RFC 8414 (OAuth 2.0 Authorization Server Metadata)

**Source:** [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)

**Purpose:** Defines a JSON metadata document that describes the auth server’s endpoints and capabilities so clients can discover them automatically.

**Well-known location:** By default, metadata is served at **`/.well-known/oauth-authorization-server`** under the authorization server’s issuer (host + optional path). Must be HTTPS. Example: issuer `https://example.com` => `GET https://example.com/.well-known/oauth-authorization-server`.

**Important metadata fields:** `issuer` (REQUIRED), `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `scopes_supported`, `response_types_supported`, `grant_types_supported`, `code_challenge_methods_supported` (PKCE), plus token endpoint auth methods and JWKS URL as applicable.

**Validation:** The `issuer` in the response MUST match the issuer used to construct the metadata URL; otherwise the client MUST NOT use the document.

### How Neotoma relates to these docs

| Topic             | Spec / Cursor                                                                             | Neotoma                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthed response | MCP spec: **MUST** return 401 when auth required and not proven                           | We return **200** + initialize with OAuth capability + empty tools and “Authentication needed” in serverInfo/instructions (soft auth) to avoid Cursor’s “Error - Show Output” UX |
| Discovery         | Cursor: uses `/.well-known/oauth-authorization-server` for scopes when using static OAuth | We advertise OAuth via **initialize** `capabilities.authentication` (initiate/callback URLs); we may also expose `/.well-known` for Cursor static-OAuth discovery                |
| Redirect          | Cursor: fixed `cursor://anysphere.cursor-mcp/oauth/callback`                              | Our OAuth callback must accept this redirect and use `state` to identify the MCP server                                                                                          |
| PKCE / tokens     | MCP spec: PKCE required; Bearer in header; 401 for invalid/expired                        | We implement OAuth 2.1 flow with PKCE; resource server validates Bearer and returns 401 for invalid/expired tokens on **authenticated** requests                                 |

**Implementation (applied):** Neotoma exposes `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`, GET `/api/mcp/oauth/authorize` (RFC 8414 authorization endpoint), and POST `/api/mcp/oauth/token` (token exchange). When the client uses Cursor's redirect URI (`cursor://...`), the callback redirects there with `code=connection_id` and `state`; Cursor then exchanges the code at the token endpoint for an access token. Initialize `capabilities.authentication` uses the same authorize and token URLs.

---

## Summary table

| Aspect                  | OAuth repro / refresh / debug / edge-case | oauth-ping (SDK auth)               | oauth-callback-test   | pg-mcp-server            | Notion MCP (remote)                                  | Neotoma                                              |
| ----------------------- | ----------------------------------------- | ----------------------------------- | --------------------- | ------------------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| Auth when unauthed      | 401 at HTTP layer                         | SDK (middleware/auth)               | Callback + doc Cursor | N/A (no auth)            | OAuth via Connect button (HTTPS URL)                 | 200 + initialize with OAuth + empty tools            |
| “Authentication needed” | Via 401 / Cursor                          | Via SDK flow                        | N/A                   | N/A                      | serverInfo.title/description + instructions          |
| OAuth discovery         | /.well-known/oauth-protected-resource     | e.g. /.well-known/mcp-configuration | Callback routes       | N/A                      | Standard OAuth discovery (implied)                   | capabilities.authentication (initiate/callback URLs) |
| instructions            | N/A (no MCP until authed)                 | SDK                                 | N/A                   | Not used                 | N/A (OAuth flow)                                      | In initialize result (getUnauthenticatedResponse)    |
| Transport               | Streamable HTTP, separate auth server     | Express + SDK middleware            | Callback + resource   | Streamable HTTP or stdio | Streamable HTTP (https://mcp.notion.com/mcp)         | Streamable HTTP in actions.ts, stdio in index        |
| Special                 | Refresh, debug, edge-case variants        | Tool-level auth strategies          | Documents Cursor bugs | One core, two transports | **Production example with Connect button**           | Soft auth for Cursor UX                              |

---

## References

- Cursor MCP overview: https://cursor.com/docs/context/mcp
- Cursor MCP overview (servers): https://cursor.com/docs/context/mcp#servers
- Cursor MCP directory: https://cursor.com/docs/context/mcp/directory
- Cursor MCP install links: https://cursor.com/docs/context/mcp/install-links
- Building an MCP Server (cookbook): https://cursor.com/docs/cookbook/building-mcp-server
- MCP Authorization specification (2025-03-26): https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization
- RFC 8414 (OAuth 2.0 Authorization Server Metadata): https://www.rfc-editor.org/rfc/rfc8414
- mcp-test-servers: https://github.com/msfeldstein/mcp-test-servers
- pg-mcp-server: https://github.com/ericzakariasson/pg-mcp-server
- Notion MCP Server (local): https://github.com/makenotion/notion-mcp-server
- Notion MCP (remote, production): https://developers.notion.com/guides/mcp/get-started-with-mcp
- Model Context Protocol (intro): https://modelcontextprotocol.io/introduction
