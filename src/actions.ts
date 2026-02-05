import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { supabase } from "./db.js";
import { config } from "./config.js";
import fs from "fs";
import path from "path";
import {
  ensurePublicKeyRegistered,
  getPublicKey,
  getUserIdFromBearerToken,
  isBearerTokenValid,
} from "./services/public_key_registry.js";
import { verifyRequest, parseAuthHeader } from "./crypto/auth.js";
import { encryptResponseMiddleware } from "./middleware/encrypt_response.js";
import { initServerKeys } from "./services/encryption_service.js";
import { storeRawContent } from "./services/raw_storage.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { NeotomaServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { OAuthError } from "./services/mcp_oauth_errors.js";
import { authenticateLocalUser, countLocalAuthUsers, ensureLocalDevUser } from "./services/local_auth.js";
import { getSqliteDb } from "./repositories/sqlite/sqlite_client.js";
import {
  CreateRelationshipRequestSchema,
  EntitiesQueryRequestSchema,
  EntitySnapshotRequestSchema,
  FieldProvenanceRequestSchema,
  ListObservationsRequestSchema,
  ListRelationshipsRequestSchema,
  MergeEntitiesRequestSchema,
  ObservationsQueryRequestSchema,
  StoreStructuredRequestSchema,
} from "./shared/action_schemas.js";
import {
  filterEntitiesBySearch,
  queryEntitiesWithCount,
} from "./shared/action_handlers/entity_handlers.js";
// import { setupDocumentationRoutes } from "./routes/documentation.js";

type ErrorEnvelope = {
  error_code: string;
  message: string;
  details?: Record<string, unknown>;
  trace_id?: string;
  timestamp: string;
};

export const app = express();
// Trust proxy headers (required for express-rate-limit when X-Forwarded-For is present)
app.set("trust proxy", true);
// Configure CSP to allow CDN scripts for the uploader and API connects
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
        connectSrc: ["'self'", "http:", "https:"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        objectSrc: ["'none'"],
        frameSrc: ["'self'"],
      },
    },
  })
);
// Configure CORS to allow frontend origin
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5195",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Type"],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Rate limiters for OAuth endpoints
// validate.trustProxy: false — we use trust proxy behind one proxy; skip strict IP check
const rateLimitOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false } as const,
};
const oauthInitiateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: "Too many OAuth initiation requests, please try again later",
  ...rateLimitOptions,
});

const oauthCallbackLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many OAuth callback requests, please try again later",
  ...rateLimitOptions,
});

const oauthTokenLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many token requests, please try again later",
  ...rateLimitOptions,
});

const oauthRegisterLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many registration requests, please try again later",
  ...rateLimitOptions,
});

// Favicon (no-auth) to avoid 401 noise when not present on disk
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ============================================================================
// OAuth discovery (RFC 8414 / MCP Authorization) for Cursor and other clients
// ============================================================================

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const base = config.apiBase;
  res.setHeader("Content-Type", "application/json");
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/oauth/authorize`,
    token_endpoint: `${base}/api/mcp/oauth/token`,
    registration_endpoint: `${base}/api/mcp/oauth/register`,
    scopes_supported: ["openid", "email"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code"],
  });
});

app.get("/.well-known/oauth-protected-resource", (req, res) => {
  // oauth-repro pattern: return 401 on protected resource endpoint when unauthenticated
  // This may be required for Cursor to show Connect button
  const authHeader = (req.headers["authorization"] || req.headers["Authorization"]) as
    | string
    | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${config.apiBase}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({
      error: "Unauthorized: Authentication required",
    });
  }

  res.setHeader("Content-Type", "application/json");
  res.json({
    authorization_servers: [config.apiBase],
  });
});

// Server info endpoint (no-auth) - exposes server port for MCP configuration
// When MCP_PROXY_URL is set (e.g. ngrok tunnel), mcpUrl uses it so "Add to Cursor" uses the proxy.
app.get("/api/server-info", (_req, res) => {
  const httpPort = process.env.HTTP_PORT
    ? parseInt(process.env.HTTP_PORT, 10)
    : config.httpPort || 8080;
  const mcpBase = process.env.MCP_PROXY_URL || config.apiBase;
  const base = mcpBase.replace(/\/$/, "");
  const mcpUrl = base.endsWith("/mcp") ? base : `${base}/mcp`;
  res.json({
    httpPort,
    apiBase: config.apiBase,
    mcpUrl,
  });
});

// ============================================================================
// MCP StreamableHTTP Endpoint (OAuth-enabled MCP transport)
// ============================================================================

// Store MCP transports by session ID
const mcpTransports = new Map<string, StreamableHTTPServerTransport>();
// Store server instances by session ID to preserve authentication state
const mcpServerInstances = new Map<string, NeotomaServer>();

// MCP StreamableHTTP endpoint (GET, POST, DELETE)
// This endpoint enables Cursor's "Connect" button for OAuth authentication
app.all("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Check for authentication BEFORE processing MCP requests
    // Return 401 with WWW-Authenticate header to trigger Cursor's Connect button
    // This matches oauth-repro pattern: 401 at HTTP layer before MCP handler
    // Return 401 on ALL unauthenticated requests (GET, POST, DELETE), not just initialize
    // Cursor may check auth on the initial GET request (SSE connection) first
    // CRITICAL: Return 401 whenever auth is missing, even if session exists
    // This ensures 401 is returned "on first protected call" as required by troubleshooting guide
    const authHeader = (req.headers["authorization"] || req.headers["Authorization"]) as
      | string
      | undefined;
    const connectionIdHeader = req.headers["x-connection-id"] || req.headers["X-Connection-Id"];
    const hasAuth = !!(authHeader?.startsWith("Bearer ") || connectionIdHeader);

    // Return 401 if: no auth (regardless of session existence)
    // This matches oauth-repro's app.all("/mcp*", ...) pattern
    // After OAuth, Cursor will send Bearer token or connection_id, so we allow through
    // Fix: Changed from (!sessionId && !hasAuth) to (!hasAuth) to ensure 401 on first protected call
    // even if Cursor establishes a session first (via GET for SSE)
    if (!hasAuth) {
      const wwwAuthHeader = `Bearer resource_metadata="${config.apiBase}/.well-known/oauth-protected-resource"`;
      res.setHeader("WWW-Authenticate", wwwAuthHeader);

      // For POST requests with JSON-RPC body, return JSON-RPC error format
      if (req.method === "POST" && req.body && typeof req.body === "object") {
        return res.status(401).json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Unauthorized: Authentication required",
          },
          id: req.body?.id ?? null,
        });
      }
      // For GET/DELETE requests, return simple 401
      return res.status(401).json({
        error: "Unauthorized: Authentication required",
      });
    }

    // Get or create transport
    let transport = sessionId ? mcpTransports.get(sessionId) : undefined;

    if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
      // Create new server instance for each session to ensure clean auth state
      // This ensures OAuth flow is required for each new connection
      const serverInstance = new NeotomaServer();
      const connectionIdFromReq = (req.headers["x-connection-id"] || req.headers["X-Connection-Id"]) as string | undefined;
      if (connectionIdFromReq) {
        serverInstance.setSessionConnectionId(connectionIdFromReq);
      }

      // Create new transport for initialization
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          if (transport) {
            mcpTransports.set(sid, transport);
            // Store server instance by session ID to preserve authentication state
            mcpServerInstances.set(sid, serverInstance);
            logger.info(`[MCP HTTP] Session initialized: ${sid}, server instance stored`);
          }
        },
      });

      transport.onclose = () => {
        if (transport?.sessionId) {
          mcpTransports.delete(transport.sessionId);
          mcpServerInstances.delete(transport.sessionId);
          logger.error(`[MCP HTTP] Session closed: ${transport.sessionId}`);
        }
      };

      // Connect transport to server
      await serverInstance.runHTTP(transport);
    } else if (!transport) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      });
    }

    // Handle request with the transport
    await transport.handleRequest(req, res, req.body);
  } catch (error: any) {
    logger.error("[MCP HTTP] Request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Basic redaction helpers for safer debug logs
const SENSITIVE_FIELDS = new Set([
  "token",
  "access_token",
  "accessToken",
  "public_token",
  "publicToken",
  "bearer_token",
  "bearerToken",
  "password",
  "secret",
  "api_key",
  "apiKey",
  "client_secret",
  "clientSecret",
  "authorization",
  "Authorization",
]);


function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...headers } as Record<string, unknown>;
  if (clone.authorization) clone.authorization = "[REDACTED]";
  if (clone.Authorization) clone.Authorization = "[REDACTED]";
  return clone;
}

function redactSensitiveFields(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveFields);
  }

  const redacted = { ...(obj as Record<string, unknown>) };
  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      redacted[key] = "[REDACTED]";
    } else if (typeof redacted[key] === "object" && redacted[key] !== null) {
      redacted[key] = redactSensitiveFields(redacted[key]);
    }
  }
  return redacted;
}

function logDebug(event: string, req: express.Request, extra?: Record<string, unknown>): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.debug(`[DEBUG] ${event}`, safe);
}

function logWarn(event: string, req: express.Request, extra?: Record<string, unknown>): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.warn(`[WARN] ${event}`, safe);
}

function logError(
  event: string,
  req: express.Request,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const payload = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : redactSensitiveFields(error),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${event}`, payload);
}

function buildErrorEnvelope(
  errorCode: string,
  message: string,
  details?: Record<string, unknown>,
  traceId?: string
): ErrorEnvelope {
  return {
    error_code: errorCode,
    message,
    details,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
  };
}

function sendError(
  res: express.Response,
  status: number,
  errorCode: string,
  message: string,
  details?: Record<string, unknown>
): express.Response {
  return res.status(status).json(buildErrorEnvelope(errorCode, message, details));
}

function sendValidationError(
  res: express.Response,
  issues: unknown
): express.Response {
  return res.status(400).json(
    buildErrorEnvelope("VALIDATION_INVALID_FORMAT", "Invalid request payload.", {
      issues,
    })
  );
}

// Public health endpoint (no auth)
app.get("/health", (_req, res) => {
  return res.json({ ok: true });
});

// ============================================================================
// MCP OAuth Endpoints
// ============================================================================

// Initiate MCP OAuth flow
app.post("/api/mcp/oauth/initiate", oauthInitiateLimit, async (req, res) => {
  try {
    const { connection_id, client_name, redirect_uri } = req.body;

    if (!connection_id || typeof connection_id !== "string") {
      return sendError(res, 400, "VALIDATION_MISSING_FIELD", "connection_id is required");
    }

    const { initiateOAuthFlow } = await import("./services/mcp_oauth.js");
    const frontendBase = process.env.FRONTEND_URL || "http://localhost:5195";
    const finalRedirectUri =
      typeof redirect_uri === "string" && redirect_uri.length > 0
        ? redirect_uri
        : config.storageBackend === "local"
          ? `${frontendBase}/oauth`
          : `${config.apiBase}/api/mcp/oauth/callback`;
    const result = await initiateOAuthFlow(
      connection_id,
      client_name,
      finalRedirectUri
    );

    return res.json(result);
  } catch (error: any) {
    logError("MCPOAuthInitiate", req, error);

    // Check if it's a structured OAuthError
    if (error instanceof OAuthError) {
      const oauthError = error as {
        code: string;
        message: string;
        statusCode: number;
        retryable?: boolean;
        details?: Record<string, any>;
      };

      return res.status(oauthError.statusCode).json({
        error_code: oauthError.code,
        error: oauthError.message,
        message: oauthError.message,
        retryable: oauthError.retryable || false,
        details: oauthError.details,
        timestamp: new Date().toISOString(),
        ...(oauthError.code === "OAUTH_CLIENT_REGISTRATION_FAILED" && {
          hint: "Enable 'Allow Dynamic OAuth Apps' in Supabase Dashboard > Authentication > OAuth Server, or set SUPABASE_OAUTH_CLIENT_ID in .env file",
        }),
      });
    }

    // Fallback for non-OAuth errors
    const isConfigError =
      error.message?.includes("client_id not configured") ||
      error.message?.includes("SUPABASE_OAUTH_CLIENT_ID");
    const statusCode = isConfigError ? 400 : 500;

    return res.status(statusCode).json({
      error_code: isConfigError ? "OAUTH_CLIENT_REGISTRATION_FAILED" : "INTERNAL_ERROR",
      error: error.message,
      message: error.message,
      timestamp: new Date().toISOString(),
      ...(isConfigError && {
        hint: "Enable 'Allow Dynamic OAuth Apps' in Supabase Dashboard, or set SUPABASE_OAUTH_CLIENT_ID in .env file",
      }),
    });
  }
});

// OAuth callback endpoint
app.get("/api/mcp/oauth/callback", oauthCallbackLimit, async (req, res) => {
  try {
    if (config.storageBackend === "local") {
      return res
        .status(400)
        .send("Local OAuth callback is disabled. Use /api/mcp/oauth/local-login.");
    }

    const { code, state } = req.query;

    if (!code || !state || typeof code !== "string" || typeof state !== "string") {
      return res.status(400).send("Missing code or state parameter");
    }

    const { handleOAuthCallback } = await import("./services/mcp_oauth.js");
    const { connectionId, redirectUri, clientState } = await handleOAuthCallback(code, state);

    // If client provided a redirect_uri (Cursor, CLI, or other), send code+state there
    const isLocalCallback =
      redirectUri &&
      (redirectUri.startsWith("cursor://") ||
        redirectUri.startsWith("http://127.0.0.1") ||
        redirectUri.startsWith("http://localhost"));
    if (isLocalCallback) {
      const params = new URLSearchParams({ code: connectionId, state: clientState ?? state });
      const redirectUrl = `${redirectUri}?${params.toString()}`;
      return res.redirect(redirectUrl);
    }

    // Default: redirect to frontend success page
    const successUrl = `${process.env.FRONTEND_URL || "http://localhost:5195"}/oauth?connection_id=${encodeURIComponent(connectionId)}&status=success`;
    return res.redirect(successUrl);
  } catch (error: any) {
    logError("MCPOAuthCallback", req, error);

    // Extract structured error information
    let errorCode = "OAUTH_TOKEN_EXCHANGE_FAILED";
    let errorMessage = error.message || "OAuth callback failed";
    let errorDetails: string | undefined;

    if (error instanceof OAuthError) {
      errorCode = error.code;
      errorMessage = error.message;
      if (error.details) {
        errorDetails = JSON.stringify(error.details);
      }
    }

    // Build error URL with structured error information
    const params = new URLSearchParams({
      status: "error",
      error_code: errorCode,
      error: errorMessage,
    });
    if (errorDetails) {
      params.set("error_details", errorDetails);
    }

    const errorUrl = `${process.env.FRONTEND_URL || "http://localhost:5195"}/oauth?${params.toString()}`;
    return res.redirect(errorUrl);
  }
});

// RFC 8414 authorization endpoint (GET) for Cursor and other OAuth clients
app.get("/api/mcp/oauth/authorize", async (req, res) => {
  try {
    const redirect_uri = req.query.redirect_uri as string | undefined;
    const state = req.query.state as string | undefined;
    const code_challenge = req.query.code_challenge as string | undefined;
    const code_challenge_method = req.query.code_challenge_method as string | undefined;
    const client_id = req.query.client_id as string | undefined;
    const dev_stub = req.query.dev_stub as string | undefined;

    if (!redirect_uri) {
      return res.status(400).send("redirect_uri is required");
    }
    if (!state) {
      return res.status(400).send("state is required");
    }
    if (!code_challenge || code_challenge_method !== "S256") {
      return res.status(400).send("code_challenge and code_challenge_method=S256 are required");
    }

    if (config.storageBackend === "local") {
      const { randomUUID } = await import("node:crypto");
      const connectionId = randomUUID();
      const { createLocalAuthorizationRequest, completeLocalAuthorization } = await import(
        "./services/mcp_oauth.js"
      );

      const authRequest = await createLocalAuthorizationRequest({
        connectionId,
        redirectUri: redirect_uri,
        clientState: state,
        codeChallenge: code_challenge,
      });

      if (dev_stub === "1" || dev_stub === "true") {
        const devUser = ensureLocalDevUser();
        const completion = await completeLocalAuthorization(authRequest.state, devUser.id, client_id);
        const params = new URLSearchParams({
          code: completion.connectionId,
          state: completion.clientState ?? state,
        });
        return res.redirect(`${redirect_uri}?${params.toString()}`);
      }

      return res.redirect(authRequest.authUrl);
    }

    const { randomUUID } = await import("node:crypto");
    const connectionId = randomUUID();
    const { initiateOAuthFlow } = await import("./services/mcp_oauth.js");
    const result = await initiateOAuthFlow(connectionId, client_id ?? undefined, redirect_uri, state);

    return res.redirect(result.authUrl);
  } catch (error: any) {
    logError("MCPOAuthAuthorize", req, error);
    return res.status(500).send(error.message ?? "Authorization failed");
  }
});

// Escape for HTML attribute value to avoid broken state and XSS
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Local OAuth login page (local backend only)
app.get("/api/mcp/oauth/local-login", async (req, res) => {
  if (config.storageBackend !== "local") {
    return res.status(404).send("Not found");
  }

  const state = (req.query.state as string | undefined)?.trim();
  if (!state) {
    return res.status(400).send("state is required");
  }

  const devStub = req.query.dev_stub as string | undefined;
  if (devStub === "1" || devStub === "true") {
    try {
      const devUser = ensureLocalDevUser();
      const { completeLocalAuthorization } = await import("./services/mcp_oauth.js");
      const { connectionId, redirectUri, clientState } = await completeLocalAuthorization(
        state,
        devUser.id
      );
      const frontendBase = process.env.FRONTEND_URL || "http://localhost:5195";
      const frontendOauth = `${frontendBase}/oauth`;
      if (redirectUri) {
        if (!clientState && redirectUri.startsWith(frontendOauth)) {
          const successUrl = `${frontendOauth}?connection_id=${encodeURIComponent(connectionId)}&status=success`;
          return res.redirect(successUrl);
        }
        const params = new URLSearchParams({
          code: connectionId,
          state: clientState ?? "",
        });
        return res.redirect(`${redirectUri}?${params.toString()}`);
      }
      return res.redirect(`${frontendOauth}?connection_id=${encodeURIComponent(connectionId)}&status=success`);
    } catch (error: any) {
      logError("MCPLocalLoginDevStub", req, error);
      const status = error?.code === "OAUTH_STATE_INVALID" || error?.statusCode === 400 ? 400 : 401;
      return res.status(status).send(error.message ?? "Dev account authorization failed");
    }
  }

  const hasUsers = countLocalAuthUsers() > 0;
  const heading = hasUsers ? "Local sign in" : "Create local account";
  const helper = hasUsers
    ? "Enter your local credentials to authorize this connection."
    : "Create the first local account to authorize this connection.";
  const whyCopy =
    "Local mode does not use Supabase. Email and password create (or sign into) a local account so this connection is tied to an identity.";
  const devStubUrl = `/api/mcp/oauth/local-login?state=${encodeURIComponent(state)}&dev_stub=1`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtmlAttr(heading)}</title>
  </head>
  <body>
    <h1>${escapeHtmlAttr(heading)}</h1>
    <p>${escapeHtmlAttr(helper)}</p>
    <p><small>${escapeHtmlAttr(whyCopy)}</small></p>
    <form method="post" action="/api/mcp/oauth/local-login">
      <input type="hidden" name="state" value="${escapeHtmlAttr(state)}" />
      <label>
        Email
        <input type="email" name="email" required />
      </label>
      <br />
      <label>
        Password
        <input type="password" name="password" required />
      </label>
      <br />
      <button type="submit">Continue</button>
    </form>
    <p><small><a href="${escapeHtmlAttr(devStubUrl)}">Use dev account (no password)</a></small></p>
  </body>
</html>`);
});

app.post(
  "/api/mcp/oauth/local-login",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    if (config.storageBackend !== "local") {
      return res.status(404).send("Not found");
    }

    const { state, email, password } = req.body as {
      state?: string;
      email?: string;
      password?: string;
    };

    if (!state || !email || !password) {
      return res.status(400).send("state, email, and password are required");
    }

    try {
      const allowBootstrap = countLocalAuthUsers() === 0;
      const user = authenticateLocalUser(email, password, allowBootstrap);
      const { completeLocalAuthorization } = await import("./services/mcp_oauth.js");
      const { connectionId, redirectUri, clientState } = await completeLocalAuthorization(
        state,
        user.id
      );

      const frontendBase = process.env.FRONTEND_URL || "http://localhost:5195";
      const frontendOauth = `${frontendBase}/oauth`;

      if (redirectUri) {
        if (!clientState && redirectUri.startsWith(frontendOauth)) {
          const successUrl = `${frontendOauth}?connection_id=${encodeURIComponent(connectionId)}&status=success`;
          return res.redirect(successUrl);
        }

        const params = new URLSearchParams({
          code: connectionId,
          state: clientState ?? "",
        });
        return res.redirect(`${redirectUri}?${params.toString()}`);
      }

      const successUrl = `${frontendOauth}?connection_id=${encodeURIComponent(connectionId)}&status=success`;
      return res.redirect(successUrl);
    } catch (error: any) {
      logError("MCPLocalLogin", req, error);
      const status = error?.code === "OAUTH_STATE_INVALID" || error?.statusCode === 400 ? 400 : 401;
      return res.status(status).send(error.message ?? "Local authentication failed");
    }
  }
);

// RFC 8414 token endpoint (POST) for Cursor and other OAuth clients
app.post(
  "/api/mcp/oauth/token",
  oauthTokenLimit,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      const grant_type = req.body?.grant_type;
      const code = req.body?.code;

      if (grant_type !== "authorization_code") {
        return res.status(400).json({
          error: "unsupported_grant_type",
          error_description: "Only authorization_code is supported",
        });
      }
      if (!code || typeof code !== "string") {
        return res
          .status(400)
          .json({ error: "invalid_request", error_description: "code is required" });
      }

      const { getTokenResponseForConnection } = await import("./services/mcp_oauth.js");
      const token = await getTokenResponseForConnection(code);

      res.setHeader("Content-Type", "application/json");
      return res.json(token);
    } catch (error: any) {
      logError("MCPOAuthToken", req, error);
      return res.status(400).json({
        error: "invalid_grant",
        error_description: error.message ?? "Token exchange failed",
      });
    }
  }
);

// RFC 7591 Dynamic Client Registration (for Cursor and other MCP clients)
app.post("/api/mcp/oauth/register", oauthRegisterLimit, async (req, res) => {
  try {
    const body = req.body as { redirect_uris?: string[]; client_name?: string; scope?: string };
    if (!body || typeof body !== "object") {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Request body must be JSON object with redirect_uris",
      });
    }
    const { handleDynamicRegistration } = await import("./services/mcp_oauth.js");
    const reg = await handleDynamicRegistration({
      redirect_uris: body.redirect_uris ?? [],
      client_name: body.client_name,
      scope: body.scope,
    });
    res.setHeader("Content-Type", "application/json");
    return res.status(201).json(reg);
  } catch (error: any) {
    logError("MCPOAuthRegister", req, error);
    if (error instanceof OAuthError) {
      const oauth = error as { code?: string; message?: string; statusCode?: number };
      const status = oauth.statusCode ?? 400;
      const code =
        oauth.code === "OAUTH_INVALID_REDIRECT_URI"
          ? "invalid_redirect_uri"
          : status >= 500
            ? "server_error"
            : "invalid_client_metadata";
      return res.status(status).json({
        error: code,
        error_description: oauth.message ?? "Registration failed",
      });
    }
    return res.status(400).json({
      error: "invalid_client_metadata",
      error_description: error.message ?? "Dynamic client registration failed",
    });
  }
});

// Get connection status
app.get("/api/mcp/oauth/status", async (req, res) => {
  try {
    const { connection_id } = req.query;

    if (!connection_id || typeof connection_id !== "string") {
      return sendError(res, 400, "VALIDATION_MISSING_FIELD", "connection_id is required");
    }

    const { getConnectionStatus } = await import("./services/mcp_oauth.js");
    const status = await getConnectionStatus(connection_id);

    return res.json({ status, connection_id });
  } catch (error: any) {
    logError("MCPOAuthStatus", req, error);
    return sendError(res, 500, "DB_QUERY_FAILED", error.message);
  }
});

// List user's MCP connections (authenticated)
app.get("/api/mcp/oauth/connections", async (req, res) => {
  try {
    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "AUTH_REQUIRED", "Authorization header required");
    }

    const token = authHeader.substring(7);

    // Validate token and get user
    const { validateSupabaseSessionToken } = await import("./services/mcp_auth.js");
    const { userId } = await validateSupabaseSessionToken(token);

    // List connections
    const { listConnections } = await import("./services/mcp_oauth.js");
    const connections = await listConnections(userId);

    return res.json({ connections });
  } catch (error: any) {
    logError("MCPOAuthListConnections", req, error);
    return sendError(res, 401, "AUTH_INVALID", "Invalid or expired token");
  }
});

// Revoke MCP connection (authenticated)
app.delete("/api/mcp/oauth/connections/:connection_id", async (req, res) => {
  try {
    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "AUTH_REQUIRED", "Authorization header required");
    }

    const token = authHeader.substring(7);
    const { connection_id } = req.params;

    // Validate token and get user
    const { validateSupabaseSessionToken } = await import("./services/mcp_auth.js");
    const { userId } = await validateSupabaseSessionToken(token);

    // Revoke connection
    const { revokeConnection } = await import("./services/mcp_oauth.js");
    await revokeConnection(connection_id, userId);

    return res.json({ success: true });
  } catch (error: any) {
    logError("MCPOAuthRevokeConnection", req, error);
    return sendError(res, 500, "DB_QUERY_FAILED", error.message);
  }
});

// Get OAuth authorization details (proxy to avoid CORS)
// This endpoint proxies requests to Supabase OAuth 2.1 Server to avoid CORS issues
app.get("/api/mcp/oauth/authorization-details", async (req, res) => {
  logger.info(
    `[MCP OAuth] Authorization details request: authorization_id=${req.query.authorization_id}`
  );
  try {
    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "AUTH_REQUIRED", "Authorization header required");
    }

    const token = authHeader.substring(7);
    const { authorization_id } = req.query;

    if (!authorization_id || typeof authorization_id !== "string") {
      return sendError(res, 400, "VALIDATION_MISSING_FIELD", "authorization_id is required");
    }

    // Validate token and get user (ensures user is authenticated)
    const { validateSupabaseSessionToken } = await import("./services/mcp_auth.js");
    await validateSupabaseSessionToken(token);

    if (config.storageBackend === "local") {
      const db = getSqliteDb();
      const stateData = db
        .prepare("SELECT redirect_uri FROM mcp_oauth_state WHERE state = ?")
        .get(authorization_id) as { redirect_uri?: string } | undefined;

      if (!stateData?.redirect_uri) {
        return res.status(404).json({
          error: "Authorization not found",
          error_description:
            "The authorization_id has expired or is invalid. Please try the OAuth flow again.",
        });
      }

      return res.json({
        id: authorization_id,
        status: "approved",
        client_id: "local_mcp_oauth_client",
        redirect_uri: stateData.redirect_uri,
      });
    }

    // Proxy request to Supabase OAuth 2.1 Server
    // Use /auth/v1/oauth/authorizations/ endpoint (matches Supabase client library)
    // This endpoint requires the user's access token to fetch their authorization details
    // The apikey header can be service key or anon key - service key works fine here
    const supabaseUrl = config.supabaseUrl;
    const detailsUrl = `${supabaseUrl}/auth/v1/oauth/authorizations/${encodeURIComponent(authorization_id)}`;

    logger.info(`[MCP OAuth] Fetching authorization details from Supabase: ${detailsUrl}`);

    const detailsResponse = await fetch(detailsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`, // User's access token (validates user identity)
        apikey: config.supabaseKey, // Service key for Supabase API (works for OAuth endpoints)
      },
    });

    logger.info(
      `[MCP OAuth] Supabase response status: ${detailsResponse.status} for authorization_id=${authorization_id}`
    );

    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      logger.warn(`[MCP OAuth] Supabase returned error: ${detailsResponse.status} - ${errorText}`);
      if (detailsResponse.status === 404) {
        return res.status(404).json({
          error: "Authorization not found",
          error_description:
            "The authorization_id has expired or is invalid. Please try the OAuth flow again.",
        });
      }
      return res.status(detailsResponse.status).json({
        error: "Failed to get authorization details",
        error_description: errorText,
      });
    }

    const details = await detailsResponse.json();
    return res.json(details);
  } catch (error: any) {
    logError("MCPOAuthAuthorizationDetails", req, error);
    return sendError(res, 500, "DB_QUERY_FAILED", error.message);
  }
});

// Dev-only endpoint to sign in as a specific user (for development/testing)
app.post("/api/auth/dev-signin", async (req, res) => {
  // Only allow in development mode
  if (config.environment !== "development") {
    return sendError(
      res,
      403,
      "FORBIDDEN",
      "Dev signin only available in development mode"
    );
  }
  if (config.storageBackend === "local") {
    return sendError(res, 403, "FORBIDDEN", "Dev signin is disabled in local mode");
  }

  const { userId } = req.body;

  if (!userId || typeof userId !== "string") {
    return sendError(res, 400, "VALIDATION_MISSING_FIELD", "userId is required");
  }

  // Check if userId is nil UUID - Supabase doesn't allow nil UUIDs
  const isNilUuid = userId === "00000000-0000-0000-0000-000000000000";

  try {
    let targetUserId = userId;
    let userEmail = `dev-${userId}@neotoma.local`;

    // Check if user exists (only if not nil UUID, as nil UUID lookup will fail)
    if (!isNilUuid) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      const existingUser = userData?.user;

      if (!userError && existingUser) {
        // User exists, use it
        targetUserId = existingUser.id;
        userEmail = existingUser.email || userEmail;
      } else {
        // User doesn't exist, create them with specified ID
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          id: userId,
          email: userEmail,
          email_confirm: true,
        });

        if (createError) {
          logError("DevSigninCreateUser", req, createError);
          return res
            .status(500)
            .json({ error: `Failed to create dev user: ${createError.message}` });
        }

        if (!newUser?.user) {
          return sendError(
            res,
            500,
            "DB_QUERY_FAILED",
            "Failed to create dev user: no user returned"
          );
        }
        targetUserId = newUser.user.id;
        userEmail = newUser.user.email || userEmail;
      }
    } else {
      // For nil UUID, create user without specifying ID (let Supabase generate it)
      // First check if a dev user with this email already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingDevUser = existingUsers?.users?.find(
        (u) => u.email === userEmail || u.email?.startsWith("dev-00000000")
      );

      if (existingDevUser) {
        // Use existing dev user
        targetUserId = existingDevUser.id;
        userEmail = existingDevUser.email || userEmail;
      } else {
        // Create new user without specifying ID (Supabase will generate a valid UUID)
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: userEmail,
          email_confirm: true,
        });

        if (createError) {
          logError("DevSigninCreateUser", req, createError);
          return res
            .status(500)
            .json({ error: `Failed to create dev user: ${createError.message}` });
        }

        if (!newUser?.user) {
          return sendError(
            res,
            500,
            "DB_QUERY_FAILED",
            "Failed to create dev user: no user returned"
          );
        }
        targetUserId = newUser.user.id;
        userEmail = newUser.user.email || userEmail;
      }
    }

    // Generate a magic link to get an access token
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
      options: {
        redirectTo: "http://localhost:5173",
      },
    });

    const actionLink = linkData?.properties?.action_link;
    if (linkError || !actionLink) {
      logError("DevSigninGenerateLink", req, linkError);
      return res.status(500).json({
        error: `Failed to generate link: ${linkError?.message ?? "no link data"}`,
      });
    }

    // Extract access token from the magic link URL
    const url = new URL(actionLink);
    const accessToken = url.hash.includes("access_token=")
      ? url.hash.split("access_token=")[1]?.split("&")[0]
      : url.searchParams.get("access_token");

    if (!accessToken) {
      return sendError(
        res,
        500,
        "DB_QUERY_FAILED",
        "Could not extract access token from magic link"
      );
    }

    // Get refresh token from URL as well
    const refreshToken = url.hash.includes("refresh_token=")
      ? url.hash.split("refresh_token=")[1]?.split("&")[0]
      : url.searchParams.get("refresh_token");

    return res.json({
      userId: targetUserId,
      accessToken,
      refreshToken: refreshToken || undefined,
    });
  } catch (error) {
    logError("DevSignin", req, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to sign in as dev user",
    });
  }
});

// Public key-based authentication middleware
app.use(async (req, res, next) => {
  // Bypass auth only for truly public endpoints (no user data)
  if (
    req.method === "OPTIONS" ||
    (req.method === "GET" && (req.path === "/openapi.yaml" || req.path === "/health")) ||
    (req.method === "POST" && req.path === "/api/auth/dev-signin")
  ) {
    return next();
  }

  // All data endpoints require authentication

  const headerAuth = req.headers.authorization || "";

  if (!headerAuth.startsWith("Bearer ")) {
    logWarn("AuthMissingBearer", req);
    return sendError(res, 401, "AUTH_REQUIRED", "Missing Bearer token");
  }

  const bearerToken = headerAuth.slice("Bearer ".length).trim();

  // Try to validate as Ed25519 bearer token first
  const registered = ensurePublicKeyRegistered(bearerToken);

  if (registered && isBearerTokenValid(bearerToken)) {

    // Optional: Verify signature if provided
    const { signature } = parseAuthHeader(headerAuth);
    if (signature && req.body) {
      const bodyString = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const isValid = verifyRequest(bodyString, signature, bearerToken);
      if (!isValid) {
        logWarn("AuthInvalidSignature", req);
        return sendError(res, 403, "AUTH_INVALID", "Invalid request signature");
      }
    }

    // Attach public key to request for encryption service
    (req as any).publicKey = getPublicKey(bearerToken);
    (req as any).bearerToken = bearerToken;
    // If this token was registered with a userId, set it so getAuthenticatedUserId works without query param
    const registeredUserId = getUserIdFromBearerToken(bearerToken);
    if (registeredUserId) {
      (req as any).authenticatedUserId = registeredUserId;
    }
  } else {
    // Try to validate as Supabase session token
    try {
      const { validateSupabaseSessionToken } = await import("./services/mcp_auth.js");
      const validated = await validateSupabaseSessionToken(bearerToken);
      // Attach user_id and email to request for user-scoped queries and /api/me
      (req as any).authenticatedUserId = validated.userId;
      (req as any).authenticatedUserEmail = validated.email;
      (req as any).bearerToken = bearerToken;
    } catch (authError) {
      // Not a valid token
      logWarn("AuthInvalidToken", req, {
        error: authError instanceof Error ? authError.message : String(authError),
      });
      return sendError(
        res,
        401,
        "AUTH_INVALID",
        "Unauthorized - invalid authentication token"
      );
    }
  }

  return next();
});

// Response encryption middleware (applies to all authenticated routes)
app.use(encryptResponseMiddleware);

// Current session (authenticated user details)
app.get("/api/me", async (req, res) => {
  try {
    const userId = (req as any).authenticatedUserId;
    const email = (req as any).authenticatedUserEmail;
    if (!userId) {
      return sendError(res, 401, "AUTH_REQUIRED", "Not authenticated");
    }
    return res.json({ user_id: userId, email: email ?? undefined });
  } catch (error: any) {
    logError("GetMe", req, error);
    return sendError(res, 401, "AUTH_REQUIRED", error.message ?? "Not authenticated");
  }
});

/**
 * Helper to extract authenticated user_id from request
 * Supports both Ed25519 bearer tokens (requires user_id in body/query) and Supabase session tokens
 * @param req - Express request object
 * @param providedUserId - Optional user_id from request body/query
 * @returns Authenticated user_id
 * @throws Error if not authenticated or user_id mismatch
 */
async function getAuthenticatedUserId(
  req: express.Request,
  providedUserId?: string
): Promise<string> {
  const headerAuth = req.headers.authorization || "";

  if (!headerAuth.startsWith("Bearer ")) {
    throw new Error("Not authenticated - missing Bearer token");
  }

  // Check if Supabase session token (already validated in middleware)
  const authenticatedUserId = (req as any).authenticatedUserId;
  if (authenticatedUserId) {
    // Validate provided user_id matches authenticated user
    if (providedUserId && providedUserId !== authenticatedUserId) {
      throw new Error(
        `user_id parameter (${providedUserId}) does not match authenticated user (${authenticatedUserId})`
      );
    }
    return authenticatedUserId;
  }

  // Ed25519 bearer token - user_id must be provided
  if (!providedUserId) {
    throw new Error("user_id required when using Ed25519 bearer token");
  }

  // For Ed25519 tokens, we trust the provided user_id (token validation happens in middleware)
  return providedUserId;
}

/**
 * Helper to handle errors in API endpoints, including authentication errors
 */
function handleApiError(
  req: express.Request,
  res: express.Response,
  error: unknown,
  defaultMessage: string,
  errorCode: string = "DB_QUERY_FAILED",
  logContext?: string
): express.Response {
  if (error instanceof Error && error.message.includes("Not authenticated")) {
    return res.status(401).json(
      buildErrorEnvelope("AUTH_REQUIRED", "Authentication required.", {
        detail: error.message,
      })
    );
  }
  if (error instanceof Error && error.message.includes("user_id parameter")) {
    return res.status(403).json(
      buildErrorEnvelope("FORBIDDEN", "user_id does not match authenticated user.", {
        detail: error.message,
      })
    );
  }
  logError(logContext || "APIError", req, error);
  const message = error instanceof Error ? error.message : defaultMessage;
  return res.status(500).json(buildErrorEnvelope(errorCode, message));
}

// Schemas

// ============================================================================
// v0.2.15 Entity-Based HTTP API Endpoints
// ============================================================================

// POST /api/entities/query - Query entities with filters
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.post("/api/entities/query", async (req, res) => {
  const parsed = EntitiesQueryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:entities_query", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { entity_type, search, limit, offset, include_merged } = parsed.data;
    const { entities, total } = await queryEntitiesWithCount({
      userId,
      entityType: entity_type,
      includeMerged: include_merged,
      limit,
      offset,
    });

    const filtered = filterEntitiesBySearch(entities, search);

    return res.json({
      entities: filtered,
      total: search ? filtered.length : total,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to query entities",
      "DB_QUERY_FAILED",
      "APIError:entities_query"
    );
  }
});

// GET /api/entities/:id - Get entity detail with snapshot and provenance (FU-601)
// REQUIRES AUTHENTICATION - verifies entity belongs to authenticated user
app.get("/api/entities/:id", async (req, res) => {
  try {
    const entityId = req.params.id;

    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    // Verify entity exists and belongs to authenticated user
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("id, user_id")
      .eq("id", entityId)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    if (entityError || !entity) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    const { getEntityWithProvenance } = await import("./services/entity_queries.js");
    const entityWithProvenance = await getEntityWithProvenance(entityId);

    if (!entityWithProvenance) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    return res.json(entityWithProvenance);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:entity_detail", req, error);
    const message = error instanceof Error ? error.message : "Failed to get entity";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// GET /api/entities/:id/observations - Get observations for entity (FU-601)
// REQUIRES AUTHENTICATION - verifies entity belongs to authenticated user
app.get("/api/entities/:id/observations", async (req, res) => {
  try {
    const entityId = req.params.id;

    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    // Verify entity exists and belongs to authenticated user
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("id")
      .eq("id", entityId)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    if (entityError || !entity) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get observations for this entity - filter by user_id for security
    const { data, error, count } = await supabase
      .from("observations")
      .select("*", { count: "exact" })
      .eq("entity_id", entityId)
      .eq("user_id", userId) // SECURITY: Only return observations for authenticated user
      .order("observed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({
      observations: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:entity_observations", req, error);
    const message = error instanceof Error ? error.message : "Failed to get observations";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// GET /api/entities/:id/relationships - Get relationships for entity (FU-601)
// REQUIRES AUTHENTICATION - verifies entity belongs to authenticated user
app.get("/api/entities/:id/relationships", async (req, res) => {
  try {
    const entityId = req.params.id;

    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    // Verify entity exists and belongs to authenticated user
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("id")
      .eq("id", entityId)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    if (entityError || !entity) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    // Get relationships where this entity is the source - filter by user_id
    const { data: outgoing, error: outgoingError } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("source_entity_id", entityId)
      .eq("user_id", userId); // SECURITY: Only return relationships for authenticated user

    if (outgoingError) throw outgoingError;

    // Get relationships where this entity is the target - filter by user_id
    const { data: incoming, error: incomingError } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("target_entity_id", entityId)
      .eq("user_id", userId); // SECURITY: Only return relationships for authenticated user

    if (incomingError) throw incomingError;

    // Add id field for frontend compatibility (use relationship_key)
    const formatRelationships = (rels: any[]) =>
      (rels || []).map((rel: any) => ({
        ...rel,
        id: rel.relationship_key,
      }));

    return res.json({
      outgoing: formatRelationships(outgoing),
      incoming: formatRelationships(incoming),
    });
  } catch (error) {
    logError("APIError:entity_relationships", req, error);
    const message = error instanceof Error ? error.message : "Failed to get relationships";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// GET /api/schemas - List all schemas (FU-XXX)
// REQUIRES AUTHENTICATION - returns global schemas + user-specific schemas for authenticated user
app.get("/api/schemas", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    // For Ed25519 tokens, user_id may be in query params; for Supabase tokens, it's extracted from token
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const keyword = req.query.keyword as string | undefined;
    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    // Get schemas - listEntityTypes will return global + user-specific schemas
    // The service should filter by user_id, but for now we'll filter in the endpoint
    const allSchemas = await schemaRegistry.listEntityTypes(keyword);

    // Filter to only show global schemas (user_id is null) or user-specific schemas for this user
    // Note: listEntityTypes doesn't currently filter by user_id, so we need to query directly
    // Also fetch metadata (including icons) for each schema
    const { data: dbSchemas, error: dbError } = await supabase
      .from("schema_registry")
      .select("entity_type, metadata")
      .eq("active", true)
      .or(`user_id.is.null,user_id.eq.${userId}`); // SECURITY: Only global or user's schemas

    if (dbError) throw dbError;

    const allowedEntityTypes = new Set((dbSchemas || []).map((s: any) => s.entity_type));
    const filteredSchemas = allSchemas.filter((s) => allowedEntityTypes.has(s.entity_type));

    // Enrich schemas with metadata (including icons)
    const schemaMetadataMap = new Map(
      (dbSchemas || []).map((s: any) => [s.entity_type, s.metadata || {}])
    );

    const enrichedSchemas = filteredSchemas.map((schema) => ({
      ...schema,
      metadata: schemaMetadataMap.get(schema.entity_type) || {},
    }));

    // Filter out test schemas (marked with metadata.test === true)
    const productionSchemas = enrichedSchemas.filter((schema) => {
      const metadata = (schema.metadata || {}) as Record<string, unknown>;
      return metadata["test"] !== true;
    });

    return res.json({
      schemas: productionSchemas,
      total: productionSchemas.length,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list schemas",
      "DB_QUERY_FAILED",
      "APIError:schemas_list"
    );
  }
});

// GET /api/schemas/:entity_type - Get specific schema (FU-XXX)
app.get("/api/schemas/:entity_type", async (req, res) => {
  try {
    const entityType = decodeURIComponent(req.params.entity_type);
    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    // Handle authentication - support both Ed25519 and Supabase session tokens
    const headerAuth = req.headers.authorization || "";
    let userId: string | undefined = req.query.user_id as string | undefined;

    if (headerAuth.startsWith("Bearer ")) {
      const token = headerAuth.slice("Bearer ".length).trim();

      // Try to validate as Ed25519 bearer token first
      const registered = ensurePublicKeyRegistered(token);
      if (!registered || !isBearerTokenValid(token)) {
        // Try to validate as Supabase session token
        try {
          const { validateSupabaseSessionToken } = await import("./services/mcp_auth.js");
          const validated = await validateSupabaseSessionToken(token);
          // Use validated user ID if not provided in query
          userId = userId || validated.userId;
        } catch (authError) {
          // Not a valid token - continue without user_id (will try global schema)
        }
      }
      // If Ed25519 token is valid, use user_id from query (Ed25519 tokens don't contain user info)
    }

    // Try to load active schema (global or user-specific)
    const schema = await schemaRegistry.loadActiveSchema(entityType, userId);

    if (!schema) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", `Schema not found: ${entityType}`);
    }

    return res.json(schema);
  } catch (error) {
    logError("APIError:schema_detail", req, error);
    const message = error instanceof Error ? error.message : "Failed to get schema";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// GET /api/relationships - List all relationships with filtering (FU-XXX)
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.get("/api/relationships", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const relationshipType = req.query.relationship_type as string | undefined;
    const sourceEntityId = req.query.source_entity_id as string | undefined;
    const targetEntityId = req.query.target_entity_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query - ALWAYS filter by authenticated user_id
    let query = supabase
      .from("relationship_snapshots")
      .select("*", { count: "exact" })
      .eq("user_id", userId); // SECURITY: Always filter by authenticated user

    if (relationshipType) {
      query = query.eq("relationship_type", relationshipType);
    }
    if (sourceEntityId) {
      query = query.eq("source_entity_id", sourceEntityId);
    }
    if (targetEntityId) {
      query = query.eq("target_entity_id", targetEntityId);
    }

    const { data, error, count } = await query
      .order("last_observation_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get unique entity IDs to fetch entity details
    const entityIds = new Set<string>();
    (data || []).forEach((rel: any) => {
      entityIds.add(rel.source_entity_id);
      entityIds.add(rel.target_entity_id);
    });

    // Fetch entity details - filter by user_id for security
    let entityMap = new Map<string, { canonical_name: string; entity_type: string }>();
    if (entityIds.size > 0) {
      const { data: entities, error: entityError } = await supabase
        .from("entities")
        .select("id, canonical_name, entity_type")
        .in("id", Array.from(entityIds))
        .eq("user_id", userId); // SECURITY: Only return entities for authenticated user

      if (!entityError && entities) {
        entityMap = new Map(
          entities.map((e: any) => [
            e.id,
            { canonical_name: e.canonical_name, entity_type: e.entity_type },
          ])
        );
      }
    }

    // Add id field and entity information for frontend compatibility
    const relationships = (data || []).map((rel: any) => {
      const sourceEntity = entityMap.get(rel.source_entity_id);
      const targetEntity = entityMap.get(rel.target_entity_id);

      return {
        ...rel,
        id: rel.relationship_key,
        source_canonical_name: sourceEntity?.canonical_name,
        source_entity_type: sourceEntity?.entity_type,
        target_canonical_name: targetEntity?.canonical_name,
        target_entity_type: targetEntity?.entity_type,
      };
    });

    return res.json({
      relationships,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list relationships",
      "DB_QUERY_FAILED",
      "APIError:relationships_list"
    );
  }
});

// GET /api/relationships/:id - Get specific relationship (FU-XXX)
// REQUIRES AUTHENTICATION - verifies relationship belongs to authenticated user
// Note: id is actually relationship_key (composite key)
app.get("/api/relationships/:id", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const relationshipKey = decodeURIComponent(req.params.id);

    // Verify relationship exists and belongs to authenticated user
    const { data, error } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return sendError(
          res,
          404,
          "RESOURCE_NOT_FOUND",
          `Relationship not found: ${relationshipKey}`
        );
      }
      throw error;
    }

    // Fetch entity details - filter by user_id for security
    const { data: sourceEntity } = await supabase
      .from("entities")
      .select("canonical_name, entity_type")
      .eq("id", data.source_entity_id)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    const { data: targetEntity } = await supabase
      .from("entities")
      .select("canonical_name, entity_type")
      .eq("id", data.target_entity_id)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    // Add id field and entity information for frontend compatibility
    return res.json({
      ...data,
      id: data.relationship_key,
      source_canonical_name: sourceEntity?.canonical_name,
      source_entity_type: sourceEntity?.entity_type,
      target_canonical_name: targetEntity?.canonical_name,
      target_entity_type: targetEntity?.entity_type,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get relationship",
      "DB_QUERY_FAILED",
      "APIError:relationship_detail"
    );
  }
});

// GET /api/timeline - Get timeline events with filtering (FU-303)
// REQUIRES AUTHENTICATION - filters events through sources.user_id
app.get("/api/timeline", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;
    const eventType = req.query.event_type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get source IDs for this user first (timeline_events doesn't have user_id)
    const { data: userSources, error: sourcesError } = await supabase
      .from("sources")
      .select("id")
      .eq("user_id", userId);

    if (sourcesError) throw sourcesError;

    const sourceIds = (userSources || []).map((s: any) => s.id);

    // Build query - filter by source_ids that belong to authenticated user
    let query = supabase.from("timeline_events").select("*", { count: "exact" });

    // SECURITY: Only return events from sources that belong to authenticated user
    if (sourceIds.length > 0) {
      query = query.in("source_id", sourceIds);
    } else {
      // User has no sources - return empty result
      return res.json({
        events: [],
        total: 0,
        limit,
        offset,
      });
    }

    // Filter by date range
    if (startDate) {
      query = query.gte("event_timestamp", startDate);
    }
    if (endDate) {
      query = query.lte("event_timestamp", endDate);
    }

    // Filter by event type
    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    // Sort by event timestamp (chronological)
    query = query.order("event_timestamp", { ascending: false });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      const err = error as { code?: string; message?: string };
      const errorDetails =
        typeof error === "object" && error && "details" in error
          ? (error as { details?: string }).details
          : undefined;
      const errorHint =
        typeof error === "object" && error && "hint" in error
          ? (error as { hint?: string }).hint
          : undefined;

      logError("APIError:timeline_query", req, error, {
        errorCode: err.code,
        errorMessage: err.message,
        errorDetails,
        errorHint,
        userId: userId || "none",
      });

      return sendError(res, 500, "DB_QUERY_FAILED", "Failed to query timeline events", {
        code: err.code,
        message: err.message,
        hint: errorHint,
      });
    }

    return res.json({
      events: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:timeline", req, error);
    const message = error instanceof Error ? error.message : "Failed to get timeline";
    // Include error code if available (for Supabase errors)
    const errorCode = (error as any)?.code;
    const errorDetails = errorCode ? { code: errorCode, message } : { message };
    return sendError(res, 500, "DB_QUERY_FAILED", message, errorDetails);
  }
});

// GET /api/sources - Get source list (FU-301)
app.get("/api/sources", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const search = req.query.search as string | undefined;
    const mimeType = req.query.mime_type as string | undefined;
    const sourceType = req.query.source_type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query - ALWAYS filter by authenticated user_id
    let query = supabase.from("sources").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

    // Filter by MIME type
    if (mimeType) {
      query = query.eq("mime_type", mimeType);
    }

    // Filter by source type
    if (sourceType) {
      query = query.eq("source_type", sourceType);
    }

    // Search in file names and raw text
    if (search) {
      query = query.or(`file_name.ilike.%${search}%,original_filename.ilike.%${search}%`);
    }

    // Sort by created_at descending (most recent first)
    query = query.order("created_at", { ascending: false });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      sources: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get sources",
      "DB_QUERY_FAILED",
      "APIError:sources_list"
    );
  }
});

// GET /api/sources/:id - Get source detail (FU-302)
// REQUIRES AUTHENTICATION - verifies source belongs to authenticated user
app.get("/api/sources/:id", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const sourceId = req.params.id;

    // Verify source exists and belongs to authenticated user
    const { data: source, error } = await supabase
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return sendError(res, 404, "RESOURCE_NOT_FOUND", "Source not found");
      }
      throw error;
    }

    if (!source) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Source not found");
    }

    return res.json(source);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get source",
      "DB_QUERY_FAILED",
      "APIError:source_detail"
    );
  }
});

// GET /api/interpretations - Get interpretations with filters (FU-302)
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.get("/api/interpretations", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const sourceId = req.query.source_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query - ALWAYS filter by authenticated user_id
    let query = supabase
      .from("interpretations")
      .select("*", { count: "exact" })
      .eq("user_id", userId); // SECURITY: Always filter by authenticated user

    if (sourceId) {
      query = query.eq("source_id", sourceId);
    }

    query = query.order("started_at", { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      interpretations: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    logError("APIError:interpretations_list", req, error);
    const message = error instanceof Error ? error.message : "Failed to get interpretations";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// GET /api/observations - Get observations with filters (FU-302, FU-601)
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.get("/api/observations", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const sourceId = req.query.source_id as string | undefined;
    const entityId = req.query.entity_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query - ALWAYS filter by authenticated user_id
    let query = supabase.from("observations").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

    if (sourceId) {
      query = query.eq("source_id", sourceId);
    }

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    query = query.order("observed_at", { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      observations: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get observations",
      "DB_QUERY_FAILED",
      "APIError:observations_list"
    );
  }
});

// GET /api/stats - Get dashboard statistics (FU-305)
// REQUIRES AUTHENTICATION - all stats filtered by authenticated user_id
app.get("/api/stats", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const { getDashboardStats } = await import("./services/dashboard_stats.js");
    const stats = await getDashboardStats(userId); // SECURITY: Stats filtered by authenticated user

    return res.json(stats);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get dashboard stats",
      "DB_QUERY_FAILED",
      "APIError:dashboard_stats"
    );
  }
});

// POST /api/observations/create - Create observation for entity
// REQUIRES AUTHENTICATION - validates user_id matches authenticated user
app.post("/api/observations/create", async (req, res) => {
  const schema = z.object({
    entity_type: z.string(),
    entity_identifier: z.string(),
    fields: z.record(z.unknown()),
    source_priority: z.number().optional().default(100),
    user_id: z.string().uuid(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:observations_create", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    // Get authenticated user_id and validate it matches provided user_id
    const authenticatedUserId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { entity_type, entity_identifier, fields, source_priority, user_id } = parsed.data;

    // SECURITY: Ensure provided user_id matches authenticated user
    if (user_id !== authenticatedUserId) {
      return res.status(403).json(
        buildErrorEnvelope("FORBIDDEN", "user_id does not match authenticated user.")
      );
    }

    // Use the ingestStructuredInternal helper from the MCP server
    // For HTTP, we'll implement directly here
    // Use resolveEntity to ensure entity exists with correct user_id
    // This handles the case where entity exists with null user_id
    const { resolveEntity } = await import("./services/entity_resolution.js");
    const entity_id = await resolveEntity({
      entityType: entity_type,
      fields: { name: entity_identifier }, // Use entity_identifier as name field
      userId: user_id,
    });

    // Create observation
    const observation = {
      id: randomUUID(),
      entity_id,
      entity_type,
      schema_version: "1.0",
      source_id: null, // No source for direct API creation
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 1.0,
      source_priority,
      fields,
      user_id,
      created_at: new Date().toISOString(),
    };

    const { data: obsData, error: obsError } = await supabase
      .from("observations")
      .insert(observation)
      .select()
      .single();

    if (obsError) throw obsError;

    // Get updated snapshot
    const { data: snapshot } = await supabase
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", entity_id)
      .eq("user_id", user_id)
      .single();

    return res.json({
      observation_id: obsData.id,
      entity_id,
      snapshot: snapshot?.snapshot || {},
    });
  } catch (error) {
    logError("APIError:observations_create", req, error);
    const message = error instanceof Error ? error.message : "Failed to create observation";
    return res.status(500).json(buildErrorEnvelope("DB_QUERY_FAILED", message));
  }
});

// POST /api/store - Store structured entities (for quick-entry forms)
app.post("/api/store", async (req, res) => {
  const parsed = StoreStructuredRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:store", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { entities, source_priority, idempotency_key } = parsed.data;

    // Import entity resolution service
    const { resolveEntity } = await import("./services/entity_resolution.js");

    const { data: existingSource, error: existingSourceError } = await supabase
      .from("sources")
      .select("id")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existingSourceError) {
      throw existingSourceError;
    }

    if (existingSource) {
      const { data: existingObservations, error: obsError } = await supabase
        .from("observations")
        .select("id, entity_id, entity_type")
        .eq("source_id", existingSource.id)
        .eq("user_id", userId);

      if (obsError) throw obsError;

      return res.json({
        success: true,
        entities:
          existingObservations?.map((obs: { id: string; entity_id: string; entity_type: string }) => ({
            entity_id: obs.entity_id,
            entity_type: obs.entity_type,
            observation_id: obs.id,
          })) ?? [],
      });
    }

    const jsonContent = JSON.stringify(entities, (key, value) => {
      if (typeof value === "bigint") {
        return Number(value);
      }
      return value;
    });
    const storageResult = await storeRawContent({
      userId,
      fileBuffer: Buffer.from(jsonContent, "utf-8"),
      mimeType: "application/json",
      originalFilename: "structured_data.json",
      idempotencyKey: idempotency_key,
      provenance: {
        upload_method: "api_store",
        client: "api",
        source_priority,
      },
    });

    const createdEntities = [];

    // Process each entity
    for (const entityData of entities) {
      const entity_type = entityData.entity_type as string;
      if (!entity_type) {
        throw new Error("entity_type is required for each entity");
      }

      // Remove entity_type from fields (destructure to omit from ...fields)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional omit
      const { entity_type: _removed, ...fields } = entityData;

      // Resolve or create entity
      const entity_id = await resolveEntity({
        entityType: entity_type,
        fields,
        userId,
      });

      // Create observation
      const observation = {
        id: randomUUID(),
        entity_id,
        entity_type,
        schema_version: "1.0",
        source_id: storageResult.sourceId,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 1.0,
        source_priority,
        fields,
        user_id: userId,
        created_at: new Date().toISOString(),
      };

      const { data: obsData, error: obsError } = await supabase
        .from("observations")
        .insert(observation)
        .select()
        .single();

      if (obsError) throw obsError;

      createdEntities.push({
        entity_id,
        entity_type,
        observation_id: obsData.id,
      });
    }

    return res.json({
      success: true,
      entities: createdEntities,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:store", req, error);
    const message = error instanceof Error ? error.message : "Failed to store entities";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// POST /api/observations/query - Query observations
app.post("/api/observations/query", async (req, res) => {
  const parsed = ObservationsQueryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:observations_query", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { entity_id, entity_type, limit, offset } = parsed.data;

    // Build query - ALWAYS filter by authenticated user_id
    let query = supabase.from("observations").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

    if (entity_id) {
      query = query.eq("entity_id", entity_id);
    }

    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    query = query.order("observed_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      observations: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:observations_query", req, error);
    const message = error instanceof Error ? error.message : "Failed to query observations";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// POST /api/entities/merge - Merge duplicate entities
// REQUIRES AUTHENTICATION - validates user_id matches authenticated user and entities belong to user
app.post("/api/entities/merge", async (req, res) => {
  const parsed = MergeEntitiesRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:entities_merge", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    // Get authenticated user_id and validate it matches provided user_id
    const authenticatedUserId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { from_entity_id, to_entity_id, merge_reason, user_id: providedUserId } = parsed.data;
    const user_id = providedUserId || authenticatedUserId;

    if (providedUserId && providedUserId !== authenticatedUserId) {
      return sendError(res, 403, "FORBIDDEN", "user_id does not match authenticated user.");
    }

    // Validate both entities exist and belong to authenticated user
    const { data: fromEntity } = await supabase
      .from("entities")
      .select("id, merged_to_entity_id")
      .eq("id", from_entity_id)
      .eq("user_id", authenticatedUserId) // SECURITY: Only merge entities belonging to authenticated user
      .single();

    const { data: toEntity } = await supabase
      .from("entities")
      .select("id, merged_to_entity_id")
      .eq("id", to_entity_id)
      .eq("user_id", authenticatedUserId) // SECURITY: Only merge entities belonging to authenticated user
      .single();

    if (!fromEntity || !toEntity) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    if (fromEntity.merged_to_entity_id) {
      return sendError(res, 400, "VALIDATION_INVALID_FORMAT", "Source entity already merged");
    }

    if (toEntity.merged_to_entity_id) {
      return sendError(res, 400, "VALIDATION_INVALID_FORMAT", "Target entity already merged");
    }

    // Rewrite observations
    const { data: rewriteData, error: rewriteError } = await supabase
      .from("observations")
      .update({ entity_id: to_entity_id })
      .eq("entity_id", from_entity_id)
      .eq("user_id", user_id)
      .select("id");

    if (rewriteError) throw rewriteError;

    const observations_moved = rewriteData?.length || 0;

    // Mark source entity as merged
    const { error: mergeError } = await supabase
      .from("entities")
      .update({
        merged_to_entity_id: to_entity_id,
        merged_at: new Date().toISOString(),
      })
      .eq("id", from_entity_id)
      .eq("user_id", user_id);

    if (mergeError) throw mergeError;

    // Record merge in entity_merges table
    await supabase.from("entity_merges").insert({
      user_id,
      from_entity_id,
      to_entity_id,
      reason: merge_reason,
      merged_by: "http_api",
      observations_rewritten: observations_moved,
    });

    // Delete snapshot for merged entity
    await supabase
      .from("entity_snapshots")
      .delete()
      .eq("entity_id", from_entity_id)
      .eq("user_id", user_id);

    // TODO: Trigger snapshot recomputation for to_entity

    return res.json({
      observations_moved,
      merged_at: new Date().toISOString(),
    });
  } catch (error) {
    logError("APIError:entities_merge", req, error);
    const message = error instanceof Error ? error.message : "Failed to merge entities";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});


// MCP Actions for Observation Architecture (FU-061)

// Get entity snapshot with provenance
app.post("/get_entity_snapshot", async (req, res) => {
  const parsed = EntitySnapshotRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_entity_snapshot", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  const { entity_id } = parsed.data;

  const { data, error } = await supabase
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entity_id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }
    logError("SupabaseError:get_entity_snapshot", req, error);
    return sendError(res, 500, "DB_QUERY_FAILED", error.message);
  }

  logDebug("Success:get_entity_snapshot", req, { entity_id });
  return res.json(data);
});

// List observations for entity
app.post("/list_observations", async (req, res) => {
  const parsed = ListObservationsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:list_observations", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  const { entity_id, limit = 100, offset = 0 } = parsed.data;

  const query = supabase
    .from("observations")
    .select("*")
    .eq("entity_id", entity_id)
    .order("observed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    logError("SupabaseError:list_observations", req, error);
    return sendError(res, 500, "DB_QUERY_FAILED", error.message);
  }

  logDebug("Success:list_observations", req, {
    entity_id,
    count: data?.length || 0,
  });
  return res.json({ observations: data || [] });
});

// Get field provenance (trace field to source documents)
app.post("/get_field_provenance", async (req, res) => {
  const parsed = FieldProvenanceRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_field_provenance", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  const { entity_id, field } = parsed.data;

  // Get snapshot to find observation ID for this field
  const { data: snapshot } = await supabase
    .from("entity_snapshots")
    .select("provenance")
    .eq("entity_id", entity_id)
    .single();

  if (!snapshot || !snapshot.provenance) {
    return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity or field not found");
  }

  const provenance = snapshot.provenance as Record<string, string>;
  const observationId = provenance[field];

  if (!observationId) {
    return sendError(res, 404, "RESOURCE_NOT_FOUND", "Field not found in provenance");
  }

  // Get observation(s) - may be comma-separated for merge_array
  const observationIds = observationId.split(",");

  const { data: observations, error: obsError } = await supabase
    .from("observations")
    .select("*, source_id")
    .in("id", observationIds);

  if (obsError) {
    logError("SupabaseError:get_field_provenance", req, obsError);
    return sendError(res, 500, "DB_QUERY_FAILED", obsError.message);
  }

  // Get sources for provenance
  const sourceIds = (observations || [])
    .map((obs: { source_id?: string }) => obs.source_id)
    .filter((sourceId: string | undefined): sourceId is string => Boolean(sourceId));

  const { data: sources, error: sourceError } = await supabase
    .from("sources")
    .select("id, content_hash, mime_type, storage_url, file_name, created_at")
    .in("id", sourceIds);

  if (sourceError) {
    logError("SupabaseError:get_field_provenance:sources", req, sourceError);
  }

  logDebug("Success:get_field_provenance", req, { entity_id, field });
  return res.json({
    field,
    entity_id,
    observation_ids: observationIds,
    observations: observations || [],
    sources: sources || [],
  });
});

// Create relationship
app.post("/create_relationship", async (req, res) => {
  const parsed = CreateRelationshipRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:create_relationship", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  const { relationship_type, source_entity_id, target_entity_id, source_id, metadata } =
    parsed.data;

  const userId = "00000000-0000-0000-0000-000000000000"; // v0.1.0 single-user

  const { relationshipsService } = await import("./services/relationships.js");

  try {
    const relationship = await relationshipsService.createRelationship({
      relationship_type,
      source_entity_id,
      target_entity_id,
      source_id: source_id || null,
      metadata: metadata || {},
      user_id: userId,
    });

    logDebug("Success:create_relationship", req, {
      relationship_key: relationship.relationship_key,
    });
    return res.json(relationship);
  } catch (error) {
    logError("RelationshipCreationError:create_relationship", req, error);
    return sendError(
      res,
      500,
      "DB_QUERY_FAILED",
      error instanceof Error ? error.message : "Failed to create relationship"
    );
  }
});

// List relationships
app.post("/list_relationships", async (req, res) => {
  const parsed = ListRelationshipsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:list_relationships", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  const { entity_id, direction = "both", relationship_type } = parsed.data;
  const normalizedDirection =
    direction === "incoming" || direction === "inbound"
      ? "incoming"
      : direction === "outgoing" || direction === "outbound"
        ? "outgoing"
        : "both";

  const { relationshipsService } = await import("./services/relationships.js");

  try {
    let relationships;
    if (relationship_type) {
      relationships = await relationshipsService.getRelationshipsByType(relationship_type as any);
      // Filter by entity_id
      relationships = relationships.filter(
        (rel) => rel.source_entity_id === entity_id || rel.target_entity_id === entity_id
      );
    } else {
      relationships = await relationshipsService.getRelationshipsForEntity(
        entity_id,
        normalizedDirection
      );
    }

    logDebug("Success:list_relationships", req, {
      entity_id,
      count: relationships.length,
    });
    return res.json({ relationships });
  } catch (error) {
    logError("RelationshipQueryError:list_relationships", req, error);
    return sendError(
      res,
      500,
      "DB_QUERY_FAILED",
      error instanceof Error ? error.message : "Failed to query relationships"
    );
  }
});


app.get("/get_file_url", async (req, res) => {
  const schema = z.object({
    file_path: z.string(),
    expires_in: z.coerce.number().optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    logWarn("ValidationError:get_file_url", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }
  const { file_path, expires_in } = parsed.data;

  const parts = file_path.split("/");
  const bucket = parts[0];
  const path = parts.slice(1).join("/");

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expires_in || 3600);
  if (error || !data?.signedUrl) {
    logError("SupabaseStorageError:get_file_url", req, error, { bucket, path });
    return sendError(
      res,
      500,
      "DB_QUERY_FAILED",
      error?.message ?? "Failed to create signed URL"
    );
  }

  logDebug("Success:get_file_url", req, { path: file_path });
  return res.json({ url: data.signedUrl });
});

// Chat endpoint removed - violates Application Layer constraint "MUST NOT contain conversational logic"
// Conversational interactions should be externalized to MCP-compatible agents per architecture

app.get("/openapi.yaml", (req, res) => {
  const openApiPath = path.join(process.cwd(), "openapi.yaml");
  const openApiContent = fs.readFileSync(openApiPath, "utf-8");
  res.setHeader("Content-Type", "application/yaml");
  res.send(openApiContent);
});

// Documentation routes (FU-301) - must be before SPA fallback
// setupDocumentationRoutes(app); // TODO: Re-enable after implementing routes/documentation.ts

// SPA fallback - serve index.html for non-API routes (must be after all API routes)

// Export function to start HTTP server (called explicitly, not on import)
export async function startHTTPServer() {
  // Initialize encryption service
  await initServerKeys();

  const httpPort = process.env.HTTP_PORT
    ? parseInt(process.env.HTTP_PORT, 10)
    : config.httpPort || 8080;

  app.listen(httpPort, () => {
    // eslint-disable-next-line no-console
    console.log(`HTTP Actions listening on :${httpPort}`);

    // Start background OAuth state cleanup job
    import("./services/mcp_oauth.js").then((oauth) => {
      oauth.startStateCleanupJob();
    });
  });
}

// Only auto-start if not disabled AND if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART !== "1" && isMainModule) {
  startHTTPServer().catch((err) => {
    console.error("Failed to start HTTP server:", err);
    process.exit(1);
  });
}

