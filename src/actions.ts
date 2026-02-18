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
import { ensureLocalDevUser, LOCAL_DEV_USER_ID } from "./services/local_auth.js";
import { getSqliteDb } from "./repositories/sqlite/sqlite_client.js";
import { getMcpAuthToken } from "./repositories/sqlite/supabase_adapter.js";
import {
  AnalyzeSchemaCandidatesRequestSchema,
  CorrectEntityRequestSchema,
  CreateRelationshipRequestSchema,
  DeleteEntityRequestSchema,
  DeleteRelationshipRequestSchema,
  EntitiesQueryRequestSchema,
  EntitySnapshotRequestSchema,
  FieldProvenanceRequestSchema,
  GetSchemaRecommendationsRequestSchema,
  ListObservationsRequestSchema,
  ListRelationshipsRequestSchema,
  MergeEntitiesRequestSchema,
  ObservationsQueryRequestSchema,
  RegisterSchemaRequestSchema,
  RelationshipSnapshotRequestSchema,
  ReinterpretRequestSchema,
  RestoreEntityRequestSchema,
  RestoreRelationshipRequestSchema,
  RetrieveEntityByIdentifierSchema,
  RetrieveGraphNeighborhoodSchema,
  RetrieveRelatedEntitiesSchema,
  StoreStructuredRequestSchema,
  StoreUnstructuredRequestSchema,
  UpdateSchemaIncrementalRequestSchema,
} from "./shared/action_schemas.js";
import { queryEntitiesWithCount } from "./shared/action_handlers/entity_handlers.js";
import {
  prepareEntitySnapshotWithEmbedding,
  upsertEntitySnapshotWithEmbedding,
} from "./services/entity_snapshot_embedding.js";
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
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Connection-Id",
    "mcp-session-id",
  ],
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
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

app.get("/.well-known/oauth-protected-resource", async (req, res) => {
  // oauth-repro pattern: return 401 on protected resource endpoint when unauthenticated
  // Validate X-Connection-Id here so Cursor gets consistent invalid_token signal (helps trigger Connect prompt)
  const authHeader = (req.headers["authorization"] || req.headers["Authorization"]) as
    | string
    | undefined;
  const connectionIdHeader = req.headers["x-connection-id"] || req.headers["X-Connection-Id"];

  // If X-Connection-Id is sent, validate it. Invalid/expired connection → 401 with error=invalid_token
  // so Cursor may clear stored credentials and show Connect button.
  if (connectionIdHeader && !authHeader?.startsWith("Bearer ")) {
    try {
      const { getAccessTokenForConnection } = await import("./services/mcp_oauth.js");
      await getAccessTokenForConnection(connectionIdHeader as string);
    } catch {
      const wwwAuth = `Bearer resource_metadata="${config.apiBase}/.well-known/oauth-protected-resource", error="invalid_token", error_description="Connection invalid or expired. Remove X-Connection-Id from mcp.json and click Connect to re-authenticate."`;
      res.setHeader("WWW-Authenticate", wwwAuth);
      return res.status(401).json({
        error: "invalid_token",
        error_description:
          "Connection invalid or expired. Remove X-Connection-Id from mcp.json and click Connect to re-authenticate.",
      });
    }
  }

  if (!authHeader?.startsWith("Bearer ") && !connectionIdHeader) {
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

/** True when request is to localhost/127.0.0.1 (local access). Tunnel requests have a non-local Host. */
function isLocalRequest(req: express.Request): boolean {
  const host = (((req.headers["host"] || req.headers["Host"]) as string) || "")
    .split(":")[0]
    .toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

// MCP StreamableHTTP endpoint (GET, POST, DELETE)
// This endpoint enables Cursor's "Connect" button for OAuth authentication
app.all("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Check for authentication BEFORE processing MCP requests
    // When encryption off: no auth by default; optional NEOTOMA_BEARER_TOKEN (or OAuth)
    // When encryption on: require Bearer token derived from private key (same key as data encryption)
    const authHeader = (req.headers["authorization"] || req.headers["Authorization"]) as
      | string
      | undefined;
    let connectionIdHeader = (req.headers["x-connection-id"] || req.headers["X-Connection-Id"]) as
      | string
      | undefined;

    if (config.encryption.enabled) {
      // Encryption on: require static token derived from user's private key
      const expectedToken = getMcpAuthToken();
      if (authHeader?.startsWith("Bearer ") && expectedToken) {
        const token = authHeader.slice(7).trim();
        if (token === expectedToken) {
          req.headers["x-connection-id"] = "dev-local";
          connectionIdHeader = "dev-local";
        }
      }
    } else {
      // Encryption off: local requests can use no-auth. HTTP (insecure) defaults to anonymous 000... user; HTTPS/localhost can use dev-local.
      if (!authHeader?.startsWith("Bearer ") && !connectionIdHeader) {
        if (isLocalRequest(req)) {
          const isInsecure = req.protocol === "http" || !(req as any).secure;
          if (isInsecure) {
            req.headers["x-connection-id"] = "dev-local-http";
            connectionIdHeader = "dev-local-http";
          } else {
            req.headers["x-connection-id"] = "dev-local";
            connectionIdHeader = "dev-local";
          }
        }
      }
      if (authHeader?.startsWith("Bearer ") && process.env.NEOTOMA_BEARER_TOKEN) {
        const token = authHeader.slice(7).trim();
        if (token === process.env.NEOTOMA_BEARER_TOKEN) {
          req.headers["x-connection-id"] = "dev-local";
          connectionIdHeader = "dev-local";
        }
      }
    }

    const hasAuth = !!(authHeader?.startsWith("Bearer ") || connectionIdHeader);

    // When encryption is on, only the key-derived token is accepted
    if (config.encryption.enabled && connectionIdHeader !== "dev-local") {
      const wwwAuthHeader = `Bearer resource_metadata="${config.apiBase}/.well-known/oauth-protected-resource"`;
      res.setHeader("WWW-Authenticate", wwwAuthHeader);
      const msg =
        "Encryption is enabled. Use MCP token from your private key: run 'neotoma auth mcp-token' and add Authorization: Bearer <token> to mcp.json.";
      if (req.method === "POST" && req.body && typeof req.body === "object") {
        return res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: msg },
          id: req.body?.id ?? null,
        });
      }
      return res.status(401).json({ error: "Unauthorized", error_description: msg });
    }

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

    // Validate X-Connection-Id when that is the auth method (no Bearer). Invalid IDs return 401
    // so Cursor shows Connect button instead of blocking on "Loading tools".
    // Skip validation for dev-local and dev-local-http (no-auth defaults).
    if (
      connectionIdHeader &&
      connectionIdHeader !== "dev-local" &&
      connectionIdHeader !== "dev-local-http" &&
      !authHeader?.startsWith("Bearer ")
    ) {
      try {
        const { getAccessTokenForConnection } = await import("./services/mcp_oauth.js");
        await getAccessTokenForConnection(connectionIdHeader as string);
      } catch {
        logger.info(
          `[MCP HTTP] Invalid or expired X-Connection-Id: ${connectionIdHeader}. Returning 401 to show Connect button.`
        );
        // RFC 6750: error=invalid_token signals client to clear credentials and re-authenticate.
        // Use consistent error format so Cursor may show Connect prompt.
        const desc =
          "Connection invalid or expired. Remove X-Connection-Id from mcp.json and click Connect to re-authenticate.";
        const wwwAuthHeader = `Bearer resource_metadata="${config.apiBase}/.well-known/oauth-protected-resource", error="invalid_token", error_description="${desc}"`;
        res.setHeader("WWW-Authenticate", wwwAuthHeader);
        if (req.method === "POST" && req.body && typeof req.body === "object") {
          return res.status(401).json({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: desc,
            },
            id: req.body?.id ?? null,
          });
        }
        return res.status(401).json({
          error: "invalid_token",
          error_description: desc,
        });
      }
    }

    // Get or create transport
    let transport = sessionId ? mcpTransports.get(sessionId) : undefined;

    if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
      // Create new server instance for each session to ensure clean auth state
      // This ensures OAuth flow is required for each new connection
      const serverInstance = new NeotomaServer();
      const connectionIdFromReq = (req.headers["x-connection-id"] ||
        req.headers["X-Connection-Id"]) as string | undefined;
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

function sendValidationError(res: express.Response, issues: unknown): express.Response {
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
    const result = await initiateOAuthFlow(connection_id, client_name, finalRedirectUri);

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
      const { createLocalAuthorizationRequest, completeLocalAuthorization } =
        await import("./services/mcp_oauth.js");

      const authRequest = await createLocalAuthorizationRequest({
        connectionId,
        redirectUri: redirect_uri,
        clientState: state,
        codeChallenge: code_challenge,
      });

      if (dev_stub === "1" || dev_stub === "true") {
        const devUser = ensureLocalDevUser();
        const completion = await completeLocalAuthorization(
          authRequest.state,
          devUser.id,
          client_id
        );
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
    const result = await initiateOAuthFlow(
      connectionId,
      client_id ?? undefined,
      redirect_uri,
      state
    );

    return res.redirect(result.authUrl);
  } catch (error: any) {
    logError("MCPOAuthAuthorize", req, error);
    return res.status(500).send(error.message ?? "Authorization failed");
  }
});

// Local OAuth login page (local backend only)
// With MCP-style auth: encryption off = auto dev-local, encryption on = Bearer token only (no OAuth)
app.get("/api/mcp/oauth/local-login", async (req, res) => {
  if (config.storageBackend !== "local") {
    return res.status(404).send("Not found");
  }

  const state = (req.query.state as string | undefined)?.trim();
  if (!state) {
    return res.status(400).send("state is required");
  }

  // When encryption is enabled: OAuth is not supported (MCP handler requires key-derived token)
  if (config.encryption.enabled) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>OAuth not supported with encryption</title>
  </head>
  <body>
    <h1>OAuth not supported when encryption is enabled</h1>
    <p>
      When encryption is enabled (NEOTOMA_ENCRYPTION_ENABLED=true), MCP authentication 
      uses a key-derived Bearer token instead of OAuth.
    </p>
    <h2>How to configure:</h2>
    <ol>
      <li>Run <code>neotoma auth mcp-token</code> to get your token</li>
      <li>Add to .cursor/mcp.json under neotoma server:
        <pre>"headers": { "Authorization": "Bearer &lt;your-token&gt;" }</pre>
      </li>
      <li>Remove <code>X-Connection-Id</code> if present</li>
      <li>Restart Cursor</li>
    </ol>
    <p>See <a href="https://github.com/neotoma/neotoma/blob/main/docs/developer/mcp_oauth_troubleshooting.md">MCP OAuth Troubleshooting</a> for details.</p>
  </body>
</html>`);
  }

  // When encryption is off: auto-use dev account (no email/password form needed)
  // This aligns with MCP-style auth: encryption off = no auth required, auto dev-local
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
    return res.redirect(
      `${frontendOauth}?connection_id=${encodeURIComponent(connectionId)}&status=success`
    );
  } catch (error: any) {
    logError("MCPLocalLoginDevStub", req, error);
    const status = error?.code === "OAUTH_STATE_INVALID" || error?.statusCode === 400 ? 400 : 401;
    return res.status(status).send(error.message ?? "Dev account authorization failed");
  }
});

// POST handler removed: local-login now auto-uses dev account (no email/password form)

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
    return sendError(res, 403, "FORBIDDEN", "Dev signin only available in development mode");
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
// MCP-style auth (same patterns as /mcp): encryption off = no auth or dev token; encryption on = key-derived token
app.use(async (req, res, next) => {
  // Bypass auth only for truly public endpoints (no user data)
  if (
    req.method === "OPTIONS" ||
    (req.method === "GET" && (req.path === "/openapi.yaml" || req.path === "/health")) ||
    (req.method === "POST" && req.path === "/api/auth/dev-signin")
  ) {
    return next();
  }

  const headerAuth = (req.headers.authorization || req.headers.Authorization || "") as string;

  // MCP-style auth (aligns CLI and REST API with MCP). Local requests can skip Bearer; tunnel requires Bearer or OAuth.
  if (config.encryption.enabled) {
    const expectedToken = getMcpAuthToken();
    if (headerAuth.startsWith("Bearer ") && expectedToken) {
      const token = headerAuth.slice(7).trim();
      if (token === expectedToken) {
        const devUser = ensureLocalDevUser();
        (req as any).authenticatedUserId = devUser.id;
        return next();
      }
    }
  } else {
    if (!headerAuth.startsWith("Bearer ")) {
      if (isLocalRequest(req)) {
        const devUser = ensureLocalDevUser();
        (req as any).authenticatedUserId = devUser.id;
        return next();
      }
    }
    if (process.env.NEOTOMA_BEARER_TOKEN) {
      const token = headerAuth.slice(7).trim();
      if (token === process.env.NEOTOMA_BEARER_TOKEN) {
        const devUser = ensureLocalDevUser();
        (req as any).authenticatedUserId = devUser.id;
        return next();
      }
    }
  }

  // Bearer required for remaining paths (Ed25519, OAuth)
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
      return sendError(res, 401, "AUTH_INVALID", "Unauthorized - invalid authentication token");
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
 * Supports: middleware-set user (e.g. dev-local when encryption off), Supabase session token, Ed25519 bearer
 * @param req - Express request object
 * @param providedUserId - Optional user_id from request body/query
 * @returns Authenticated user_id
 * @throws Error if not authenticated or user_id mismatch
 */
async function getAuthenticatedUserId(
  req: express.Request,
  providedUserId?: string
): Promise<string> {
  // Use user already set by auth middleware (e.g. dev-local when encryption off and no Bearer)
  const authenticatedUserId = (req as any).authenticatedUserId;
  if (authenticatedUserId) {
    if (providedUserId && providedUserId !== authenticatedUserId) {
      // In dev mode (no encryption, local dev user), allow user_id override for testing and development.
      // This allows CLI tests to use custom user IDs without requiring full OAuth auth.
      if (!config.encryption.enabled && authenticatedUserId === LOCAL_DEV_USER_ID) {
        return providedUserId;
      }
      throw new Error(
        `user_id parameter (${providedUserId}) does not match authenticated user (${authenticatedUserId})`
      );
    }
    return authenticatedUserId;
  }

  const headerAuth = req.headers.authorization || "";
  if (!headerAuth.startsWith("Bearer ")) {
    throw new Error("Not authenticated - missing Bearer token");
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
      search,
      limit,
      offset,
    });

    return res.json({
      entities,
      total,
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
    const filterEntityType = req.query.entity_type as string | undefined;
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
    let filteredSchemas = allSchemas.filter((s) => allowedEntityTypes.has(s.entity_type));

    // Filter by entity_type if provided
    if (filterEntityType) {
      filteredSchemas = filteredSchemas.filter((s) => s.entity_type === filterEntityType);
    }

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

// POST /api/relationships/snapshot - Get relationship snapshot with provenance
app.post("/api/relationships/snapshot", async (req, res) => {
  const parsed = RelationshipSnapshotRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_relationship_snapshot", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, undefined);
    const { relationship_type, source_entity_id, target_entity_id } = parsed.data;
    const relationshipKey = `${relationship_type}:${source_entity_id}:${target_entity_id}`;

    const { data: snapshot, error: snapshotError } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId)
      .maybeSingle();

    if (snapshotError) throw snapshotError;
    if (!snapshot) {
      return sendError(
        res,
        404,
        "RESOURCE_NOT_FOUND",
        `Relationship not found: ${relationshipKey}`
      );
    }

    const { data: observations, error: obsError } = await supabase
      .from("relationship_observations")
      .select("id, source_id, observed_at, specificity_score, source_priority, metadata")
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId)
      .order("observed_at", { ascending: false });

    if (obsError) throw obsError;

    return res.json({ snapshot, observations: observations ?? [] });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get relationship snapshot",
      "DB_QUERY_FAILED",
      "APIError:relationship_snapshot"
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
    const entityId = req.query.entity_id as string | undefined;
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

    // Filter by entity_id
    if (entityId) {
      query = query.eq("entity_id", entityId);
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
      return res
        .status(403)
        .json(buildErrorEnvelope("FORBIDDEN", "user_id does not match authenticated user."));
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

    const { entities, source_priority, idempotency_key, original_filename } = parsed.data;

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

      const existingEntities = existingObservations?.map(
        (obs: { id: string; entity_id: string; entity_type: string }) => ({
          entity_id: obs.entity_id,
          entity_type: obs.entity_type,
          observation_id: obs.id,
        })
      ) ?? [];

      return res.json({
        success: true,
        source_id: existingSource.id,
        entities_created: existingEntities.length,
        observations_created: existingEntities.length,
        entities: existingEntities,
      });
    }

    const jsonContent = JSON.stringify(entities, (key, value) => {
      if (typeof value === "bigint") {
        return Number(value);
      }
      return value;
    });
    // Omit filename when not provided: agent-provided structured data has no real file origin.
    const filenameForStorage = original_filename?.trim() || undefined;
    const storageResult = await storeRawContent({
      userId,
      fileBuffer: Buffer.from(jsonContent, "utf-8"),
      mimeType: "application/json",
      originalFilename: filenameForStorage,
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
      source_id: storageResult.sourceId,
      entities_created: createdEntities.length,
      observations_created: createdEntities.length,
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

// POST /api/store/unstructured - Store raw file (base64), optional AI interpretation
app.post("/api/store/unstructured", async (req, res) => {
  const parsed = StoreUnstructuredRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:store_unstructured", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const {
      file_content,
      mime_type,
      idempotency_key: providedIdempotencyKey,
      original_filename,
      interpret,
    } = parsed.data;

    const fileBuffer = Buffer.from(file_content, "base64");
    const idempotencyKey =
      providedIdempotencyKey ??
      (await import("node:crypto")).createHash("sha256").update(fileBuffer).digest("hex");

    const storageResult = await storeRawContent({
      userId,
      fileBuffer,
      mimeType: mime_type,
      originalFilename: original_filename?.trim() || undefined,
      idempotencyKey,
      provenance: { upload_method: "api_store_unstructured", client: "api" },
    });

    const response: {
      source_id: string;
      content_hash: string;
      file_size: number;
      deduplicated?: boolean;
      entities_created?: number;
      observations_created?: number;
      interpretation_run_id?: string;
      interpretation?: unknown;
      interpretation_debug?: Record<string, unknown>;
      entity_ids?: string[];
    } = {
      source_id: storageResult.sourceId,
      content_hash: storageResult.contentHash,
      file_size: storageResult.fileSize,
      deduplicated: storageResult.deduplicated,
      entities_created: 0,
      observations_created: 0,
    };

    if (interpret && storageResult.sourceId) {
      const { extractTextFromBuffer, getPdfFirstPageImageDataUrl, getPdfWorkerDebug } =
        await import("./services/file_text_extraction.js");
      const {
        extractWithLLM,
        extractWithLLMFromImage,
        extractFromCSVWithChunking,
        isLLMExtractionAvailable,
      } = await import("./services/llm_extraction.js");
      const { runInterpretation } = await import("./services/interpretation.js");

      const rawText = await extractTextFromBuffer(
        fileBuffer,
        mime_type,
        original_filename || "file"
      );

      if (!isLLMExtractionAvailable()) {
        response.interpretation = {
          skipped: true,
          reason: "openai_not_configured",
          message: "Set OPENAI_API_KEY in .env to enable AI interpretation",
        };
        return res.status(200).json(response);
      }

      const isCsv = mime_type?.toLowerCase() === "text/csv";
      const isPdf =
        (mime_type || "").toLowerCase().includes("pdf") ||
        (original_filename || "").toLowerCase().endsWith(".pdf");
      const rawTextLength = typeof rawText === "string" ? rawText.length : 0;

      let extractionResult:
        | Awaited<ReturnType<typeof extractWithLLM>>
        | Awaited<ReturnType<typeof extractFromCSVWithChunking>>;
      const pdfDebug = getPdfWorkerDebug();
      const interpretationDebug: Record<string, unknown> = {
        raw_text_length: rawTextLength,
        pdf_worker_wrapper_used: pdfDebug.configured,
        pdf_worker_wrapper_path_tried: pdfDebug.wrapper_path_tried,
        pdf_worker_set_worker_error: pdfDebug.set_worker_error,
      };
      if (rawTextLength === 0 && isPdf) {
        interpretationDebug.vision_fallback_attempted = true;
        const imageResult = await getPdfFirstPageImageDataUrl(
          fileBuffer,
          mime_type,
          original_filename || "file",
          { returnError: true }
        );
        const imageDataUrl = typeof imageResult === "object" ? imageResult.dataUrl : imageResult;
        if (typeof imageResult === "object" && imageResult.error) {
          interpretationDebug.vision_fallback_image_error = imageResult.error;
        }
        interpretationDebug.vision_fallback_image_got = Boolean(imageDataUrl);
        if (imageDataUrl) {
          try {
            extractionResult = await extractWithLLMFromImage(
              imageDataUrl,
              original_filename || "file",
              mime_type,
              "gpt-4o"
            );
            interpretationDebug.used_vision_fallback = true;
          } catch (visionErr) {
            interpretationDebug.vision_fallback_error =
              visionErr instanceof Error ? visionErr.message : String(visionErr);
            extractionResult = await extractWithLLM(
              rawText,
              original_filename || "file",
              mime_type,
              "gpt-4o"
            );
          }
        } else {
          extractionResult = await extractWithLLM(
            rawText,
            original_filename || "file",
            mime_type,
            "gpt-4o"
          );
        }
      } else {
        extractionResult = isCsv
          ? await extractFromCSVWithChunking(
              rawText,
              original_filename || "file",
              mime_type,
              "gpt-4o"
            )
          : await extractWithLLM(rawText, original_filename || "file", mime_type, "gpt-4o");
      }

      let extractedData: Array<Record<string, unknown>>;
      if ("entities" in extractionResult) {
        extractedData = extractionResult.entities.map((e) => ({
          entity_type: e.entity_type,
          ...e.fields,
        }));
      } else {
        const { entity_type, fields } = extractionResult;
        extractedData = [{ entity_type, ...fields }];
      }

      const defaultConfig = {
        provider: "openai",
        model_id: "gpt-4o",
        temperature: 0,
        prompt_hash: "llm_extraction_v2_idempotent",
        code_version: "v0.2.0",
      };
      interpretationDebug.extraction_field_keys = extractedData.flatMap((d) =>
        Object.keys(d).filter((k) => k !== "entity_type" && k !== "type")
      );
      response.interpretation_debug = interpretationDebug;
      try {
        const interpretationResult = await runInterpretation({
          userId,
          sourceId: storageResult.sourceId,
          extractedData,
          config: defaultConfig,
        });
        response.interpretation = interpretationResult;
        if (interpretationResult.entities?.length) {
          response.entity_ids = interpretationResult.entities.map((e) => e.entityId);
          response.entities_created = interpretationResult.entities.length;
          response.observations_created = interpretationResult.entities.length;
        }
        if (interpretationResult.interpretationId) {
          response.interpretation_run_id = interpretationResult.interpretationId;
        }
      } catch (interpretError) {
        response.interpretation = {
          error: interpretError instanceof Error ? interpretError.message : String(interpretError),
          skipped: true,
        };
      }
    }

    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:store_unstructured", req, error);
    const message = error instanceof Error ? error.message : "Failed to store unstructured file";
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

    const { observation_id, entity_id, entity_type, source_id, limit, offset } = parsed.data;

    // Build query - ALWAYS filter by authenticated user_id
    let query = supabase.from("observations").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

    if (observation_id) {
      query = query.eq("id", observation_id);
    }

    if (entity_id) {
      query = query.eq("entity_id", entity_id);
    }

    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    if (source_id) {
      query = query.eq("source_id", source_id);
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
    return sendError(res, 500, "DB_QUERY_FAILED", error?.message ?? "Failed to create signed URL");
  }

  logDebug("Success:get_file_url", req, { path: file_path });
  return res.json({ url: data.signedUrl });
});

// ========== New HTTP REST endpoints for Phase 0 E2E test coverage ==========

// POST /retrieve_entity_by_identifier - Search for entity by identifier
app.post("/retrieve_entity_by_identifier", async (req, res) => {
  const parsed = RetrieveEntityByIdentifierSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:retrieve_entity_by_identifier", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const { identifier, entity_type } = parsed.data;

    // Import normalization and ID generation functions
    const { normalizeEntityValue, generateEntityId } =
      await import("./services/entity_resolution.js");

    // Normalize the identifier
    const normalized = entity_type
      ? normalizeEntityValue(entity_type, identifier)
      : identifier.trim().toLowerCase();

    // Search in entities table
    let query = supabase
      .from("entities")
      .select("*")
      .or(`canonical_name.ilike.%${normalized}%,aliases.cs.["${normalized}"]`);

    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    const { data: entities, error } = await query.limit(100);

    if (error) {
      logError("SupabaseError:retrieve_entity_by_identifier", req, error);
      return sendError(res, 500, "DB_QUERY_FAILED", error.message);
    }

    // Try entity ID match if no results
    if ((!entities || entities.length === 0) && entity_type) {
      const possibleId = generateEntityId(entity_type, identifier);
      const { data: entityById, error: idError } = await supabase
        .from("entities")
        .select("*")
        .eq("id", possibleId)
        .single();

      if (!idError && entityById) {
        return res.json({ entities: [entityById], total: 1 });
      }
    }

    logDebug("Success:retrieve_entity_by_identifier", req, { identifier, count: entities?.length });
    return res.json({ entities: entities || [], total: entities?.length || 0 });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to retrieve entity by identifier",
      "DB_QUERY_FAILED",
      "APIError:retrieve_entity_by_identifier"
    );
  }
});

// POST /retrieve_related_entities - Get entities connected via relationships
app.post("/retrieve_related_entities", async (req, res) => {
  const parsed = RetrieveRelatedEntitiesSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:retrieve_related_entities", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const {
      entity_id,
      relationship_types,
      direction = "both",
      max_hops: _max_hops = 1,
      include_entities = true,
    } = parsed.data;

    // Simple 1-hop query implementation
    const relationships: any[] = [];

    // Get outbound relationships
    if (direction === "outbound" || direction === "both") {
      let query = supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entity_id);

      if (relationship_types && relationship_types.length > 0) {
        query = query.in("relationship_type", relationship_types);
      }

      const { data, error } = await query;
      if (!error && data) {
        relationships.push(...data);
      }
    }

    // Get inbound relationships
    if (direction === "inbound" || direction === "both") {
      let query = supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", entity_id);

      if (relationship_types && relationship_types.length > 0) {
        query = query.in("relationship_type", relationship_types);
      }

      const { data, error } = await query;
      if (!error && data) {
        relationships.push(...data);
      }
    }

    // Get entities if requested
    let entities: any[] = [];
    if (include_entities && relationships.length > 0) {
      const relatedIds = new Set<string>();
      relationships.forEach((rel) => {
        if (rel.source_entity_id !== entity_id) relatedIds.add(rel.source_entity_id);
        if (rel.target_entity_id !== entity_id) relatedIds.add(rel.target_entity_id);
      });

      if (relatedIds.size > 0) {
        const { data, error } = await supabase
          .from("entities")
          .select("*")
          .in("id", Array.from(relatedIds));

        if (!error && data) {
          entities = data;
        }
      }
    }

    logDebug("Success:retrieve_related_entities", req, { entity_id, count: relationships.length });
    return res.json({ relationships, entities });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to retrieve related entities",
      "DB_QUERY_FAILED",
      "APIError:retrieve_related_entities"
    );
  }
});

// POST /retrieve_graph_neighborhood - Get complete graph neighborhood
app.post("/retrieve_graph_neighborhood", async (req, res) => {
  const parsed = RetrieveGraphNeighborhoodSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:retrieve_graph_neighborhood", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const {
      node_id,
      node_type = "entity",
      include_relationships = true,
      include_sources = true,
      include_events: _include_events = true,
      include_observations = false,
    } = parsed.data;

    const result: any = { node_id, node_type };

    if (node_type === "entity") {
      // Get entity
      const { data: entity, error: entityError } = await supabase
        .from("entities")
        .select("*")
        .eq("id", node_id)
        .single();

      if (!entityError && entity) {
        result.entity = entity;
      }

      // Get relationships if requested
      if (include_relationships) {
        const { data: relationships, error: relError } = await supabase
          .from("relationship_snapshots")
          .select("*")
          .or(`source_entity_id.eq.${node_id},target_entity_id.eq.${node_id}`);

        if (!relError) {
          result.relationships = relationships || [];
        }
      }

      // Get observations if requested
      if (include_observations) {
        const { data: observations, error: obsError } = await supabase
          .from("observations")
          .select("*")
          .eq("entity_id", node_id);

        if (!obsError) {
          result.observations = observations || [];
        }
      }

      // Get sources if requested
      if (include_sources && include_observations) {
        const sourceIds = result.observations?.map((o: any) => o.source_id).filter(Boolean) || [];
        if (sourceIds.length > 0) {
          const { data: sources, error: srcError } = await supabase
            .from("source")
            .select("*")
            .in("id", sourceIds);

          if (!srcError) {
            result.sources = sources || [];
          }
        }
      }
    } else if (node_type === "source") {
      // Get source
      const { data: source, error: srcError } = await supabase
        .from("source")
        .select("*")
        .eq("id", node_id)
        .single();

      if (!srcError && source) {
        result.source = source;
      }

      // Get observations from this source
      if (include_observations) {
        const { data: observations, error: obsError } = await supabase
          .from("observations")
          .select("*")
          .eq("source_id", node_id);

        if (!obsError) {
          result.observations = observations || [];
        }
      }
    }

    logDebug("Success:retrieve_graph_neighborhood", req, { node_id });
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to retrieve graph neighborhood",
      "DB_QUERY_FAILED",
      "APIError:retrieve_graph_neighborhood"
    );
  }
});

// POST /delete_entity - Soft delete entity
app.post("/delete_entity", async (req, res) => {
  const parsed = DeleteEntityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:delete_entity", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { entity_id, entity_type, reason } = parsed.data;

    const { softDeleteEntity } = await import("./services/deletion.js");

    const result = await softDeleteEntity(entity_id, entity_type, userId, reason);

    if (!result.success) {
      return sendError(res, 500, "DELETE_FAILED", result.error || "Failed to delete entity");
    }

    logDebug("Success:delete_entity", req, { entity_id });
    return res.json({ success: true, entity_id, observation_id: result.observation_id });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to delete entity",
      "DB_QUERY_FAILED",
      "APIError:delete_entity"
    );
  }
});

// POST /restore_entity - Restore soft-deleted entity
app.post("/restore_entity", async (req, res) => {
  const parsed = RestoreEntityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:restore_entity", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { entity_id, entity_type, reason } = parsed.data;

    const { restoreEntity } = await import("./services/deletion.js");

    const result = await restoreEntity(entity_id, entity_type, userId, reason);

    if (!result.success) {
      return sendError(res, 500, "RESTORE_FAILED", result.error || "Failed to restore entity");
    }

    logDebug("Success:restore_entity", req, { entity_id });
    return res.json({ success: true, entity_id, observation_id: result.observation_id });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to restore entity",
      "DB_QUERY_FAILED",
      "APIError:restore_entity"
    );
  }
});

// POST /delete_relationship - Soft delete relationship
app.post("/delete_relationship", async (req, res) => {
  const parsed = DeleteRelationshipRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:delete_relationship", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { relationship_type, source_entity_id, target_entity_id, reason } = parsed.data;

    const { softDeleteRelationship } = await import("./services/deletion.js");

    // Construct relationship key
    const relationshipKey = `${relationship_type}:${source_entity_id}:${target_entity_id}`;

    const result = await softDeleteRelationship(
      relationshipKey,
      relationship_type,
      source_entity_id,
      target_entity_id,
      userId,
      reason
    );

    if (!result.success) {
      return sendError(res, 500, "DELETE_FAILED", result.error || "Failed to delete relationship");
    }

    logDebug("Success:delete_relationship", req, {
      relationship_type,
      source_entity_id,
      target_entity_id,
    });
    return res.json({ success: true, observation_id: result.observation_id });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to delete relationship",
      "DB_QUERY_FAILED",
      "APIError:delete_relationship"
    );
  }
});

// POST /restore_relationship - Restore soft-deleted relationship
app.post("/restore_relationship", async (req, res) => {
  const parsed = RestoreRelationshipRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:restore_relationship", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { relationship_type, source_entity_id, target_entity_id, reason } = parsed.data;

    const { restoreRelationship } = await import("./services/deletion.js");

    // Construct relationship key
    const relationshipKey = `${relationship_type}:${source_entity_id}:${target_entity_id}`;

    const result = await restoreRelationship(
      relationshipKey,
      relationship_type,
      source_entity_id,
      target_entity_id,
      userId,
      reason
    );

    if (!result.success) {
      return sendError(
        res,
        500,
        "RESTORE_FAILED",
        result.error || "Failed to restore relationship"
      );
    }

    logDebug("Success:restore_relationship", req, {
      relationship_type,
      source_entity_id,
      target_entity_id,
    });
    return res.json({ success: true, observation_id: result.observation_id });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to restore relationship",
      "DB_QUERY_FAILED",
      "APIError:restore_relationship"
    );
  }
});

// POST /analyze_schema_candidates - Analyze raw fragments for schema promotion
app.post("/analyze_schema_candidates", async (req, res) => {
  const parsed = AnalyzeSchemaCandidatesRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:analyze_schema_candidates", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { entity_type, min_frequency = 5, min_confidence = 0.8 } = parsed.data;

    // Query raw_fragments for field frequency analysis
    let query = supabase
      .from("raw_fragments")
      .select("fragment_key, fragment_value, fragment_type");

    if (entity_type) {
      query = query.eq("fragment_type", entity_type);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: fragments, error } = await query;

    if (error) {
      logError("SupabaseError:analyze_schema_candidates", req, error);
      return sendError(res, 500, "DB_QUERY_FAILED", error.message);
    }

    // Analyze field frequency
    const fieldFrequency = new Map<string, number>();
    (fragments || []).forEach((frag: any) => {
      const count = fieldFrequency.get(frag.fragment_key) || 0;
      fieldFrequency.set(frag.fragment_key, count + 1);
    });

    // Build candidates
    const candidates = Array.from(fieldFrequency.entries())
      .filter(([, count]) => count >= min_frequency)
      .map(([field_name, frequency]) => ({
        field_name,
        frequency,
        confidence: Math.min(frequency / 100, 1), // Simple confidence based on frequency
        recommended_type: "string", // Default type
      }))
      .filter((c) => c.confidence >= min_confidence);

    logDebug("Success:analyze_schema_candidates", req, { entity_type, count: candidates.length });
    return res.json({ candidates });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to analyze schema candidates",
      "DB_QUERY_FAILED",
      "APIError:analyze_schema_candidates"
    );
  }
});

// POST /get_schema_recommendations - Get schema update recommendations
app.post("/get_schema_recommendations", async (req, res) => {
  const parsed = GetSchemaRecommendationsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_schema_recommendations", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { entity_type, source, status } = parsed.data;

    // Query schema_recommendations table
    let query = supabase.from("schema_recommendations").select("*").eq("entity_type", entity_type);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (source) {
      query = query.eq("source", source);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: recommendations, error } = await query.order("confidence", { ascending: false });

    if (error) {
      logError("SupabaseError:get_schema_recommendations", req, error);
      return sendError(res, 500, "DB_QUERY_FAILED", error.message);
    }

    logDebug("Success:get_schema_recommendations", req, {
      entity_type,
      count: recommendations?.length,
    });
    return res.json({ recommendations: recommendations || [] });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get schema recommendations",
      "DB_QUERY_FAILED",
      "APIError:get_schema_recommendations"
    );
  }
});

// POST /update_schema_incremental - Incrementally update schema with new fields
app.post("/update_schema_incremental", async (req, res) => {
  const parsed = UpdateSchemaIncrementalRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:update_schema_incremental", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const {
      entity_type,
      fields_to_add,
      schema_version,
      user_specific = false,
      activate = true,
    } = parsed.data;

    // Get current schema
    let query = supabase
      .from("schema_registry")
      .select("*")
      .eq("entity_type", entity_type)
      .eq("active", true);

    if (user_specific && userId) {
      query = query.eq("user_id", userId);
    } else {
      query = query.is("user_id", null);
    }

    const { data: currentSchema, error: fetchError } = await query.single();

    if (fetchError && fetchError.code !== "PGRST116") {
      logError("SupabaseError:update_schema_incremental", req, fetchError);
      return sendError(res, 500, "DB_QUERY_FAILED", fetchError.message);
    }

    // Build new schema definition
    const baseSchema = currentSchema?.schema_definition || { fields: {} };
    const newFields: Record<string, any> = {};

    fields_to_add.forEach((field: any) => {
      newFields[field.field_name] = {
        type: field.field_type,
        required: field.required || false,
        reducer_strategy: field.reducer_strategy || "highest_priority",
      };
    });

    const updatedSchema = {
      ...baseSchema,
      fields: { ...baseSchema.fields, ...newFields },
    };

    // Insert new schema version
    const { data: newSchemaVersion, error: insertError } = await supabase
      .from("schema_registry")
      .insert({
        entity_type,
        schema_version: schema_version || `${parseInt(currentSchema?.schema_version || "1") + 1}`,
        schema_definition: updatedSchema,
        reducer_config: currentSchema?.reducer_config || {},
        user_id: user_specific ? userId : null,
        active: activate,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      logError("SupabaseError:update_schema_incremental", req, insertError);
      return sendError(res, 500, "DB_QUERY_FAILED", insertError.message);
    }

    // Deactivate old schema if activating new one
    if (activate && currentSchema) {
      await supabase.from("schema_registry").update({ active: false }).eq("id", currentSchema.id);
    }

    logDebug("Success:update_schema_incremental", req, {
      entity_type,
      fields_added: fields_to_add.length,
    });
    return res.json({ success: true, schema: newSchemaVersion });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to update schema incrementally",
      "DB_QUERY_FAILED",
      "APIError:update_schema_incremental"
    );
  }
});

// POST /register_schema - Register new schema or schema version
app.post("/register_schema", async (req, res) => {
  const parsed = RegisterSchemaRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:register_schema", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const {
      entity_type,
      schema_definition,
      reducer_config,
      schema_version = "1.0",
      user_specific = false,
      activate = false,
    } = parsed.data;

    // Insert new schema
    const { data: newSchema, error } = await supabase
      .from("schema_registry")
      .insert({
        entity_type,
        schema_version,
        schema_definition,
        reducer_config,
        user_id: user_specific ? userId : null,
        active: activate,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logError("SupabaseError:register_schema", req, error);
      return sendError(res, 500, "DB_QUERY_FAILED", error.message);
    }

    // If activating, deactivate other schemas for this entity type
    if (activate) {
      await supabase
        .from("schema_registry")
        .update({ active: false })
        .eq("entity_type", entity_type)
        .not("id", "eq", newSchema.id);

      if (user_specific) {
        await supabase.from("schema_registry").update({ active: false }).eq("user_id", userId);
      }
    }

    logDebug("Success:register_schema", req, { entity_type, schema_version });
    return res.json({ success: true, schema: newSchema });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to register schema",
      "DB_QUERY_FAILED",
      "APIError:register_schema"
    );
  }
});

// POST /reinterpret - Re-run AI interpretation on existing source
app.post("/reinterpret", async (req, res) => {
  const parsed = ReinterpretRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:reinterpret", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    let { source_id } = parsed.data;
    const { interpretation_config, interpretation_id } = parsed.data;

    // Look up source_id from interpretation if not provided directly
    if (!source_id && interpretation_id) {
      const { data: interp, error: interpError } = await supabase
        .from("interpretations")
        .select("source_id")
        .eq("id", interpretation_id)
        .maybeSingle();
      if (interpError || !interp) {
        return sendError(res, 404, "RESOURCE_NOT_FOUND", "Interpretation not found");
      }
      source_id = interp.source_id;
    }

    if (!source_id) {
      return sendError(res, 400, "VALIDATION_ERROR", "source_id is required");
    }

    // Get source
    const { data: source, error: srcError } = await supabase
      .from("sources")
      .select("*")
      .eq("id", source_id)
      .single();

    if (srcError || !source) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Source not found");
    }

    // Re-extract from source.raw_text based on mime_type
    let extractedData: Array<Record<string, unknown>> = [];

    if (source.raw_text) {
      const mimeType = source.mime_type || "text/plain";
      const fileName = source.original_filename;

      // Import extraction functions
      const { extractWithLLM, extractFromCSVWithChunking } =
        await import("./services/llm_extraction.js");

      // Get model ID from config or use default
      const modelId =
        interpretation_config && typeof interpretation_config.model_id === "string"
          ? interpretation_config.model_id
          : "gpt-4o";

      // Handle CSV files with chunking support
      if (mimeType === "text/csv" || fileName?.toLowerCase().endsWith(".csv")) {
        const extractionResult = await extractFromCSVWithChunking(
          source.raw_text,
          fileName,
          mimeType,
          modelId
        );

        // Handle both single-entity and multi-entity results
        if ("entities" in extractionResult) {
          // Multi-entity result from CSV chunking
          extractedData = extractionResult.entities.map((entity) => ({
            entity_type: entity.entity_type,
            ...entity.fields,
          }));
        } else {
          // Single entity result
          const { entity_type, fields } = extractionResult;
          extractedData = [
            {
              entity_type,
              ...fields,
            },
          ];
        }
      } else {
        // Non-CSV files - use standard extraction
        const extractionResult = await extractWithLLM(source.raw_text, fileName, mimeType, modelId);

        const { entity_type, fields } = extractionResult;
        extractedData = [
          {
            entity_type,
            ...fields,
          },
        ];
      }
    }

    const { runInterpretation } = await import("./services/interpretation.js");

    // Re-run interpretation with re-extracted data
    const result = await runInterpretation({
      userId: source.user_id,
      sourceId: source_id,
      extractedData,
      config: (interpretation_config || {}) as any,
    });

    logDebug("Success:reinterpret", req, { source_id });
    return res.json({
      success: true,
      interpretation_id: result.interpretationId,
      observations_created: result.observationsCreated,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to reinterpret source",
      "DB_QUERY_FAILED",
      "APIError:reinterpret"
    );
  }
});

// POST /correct - Create correction observation to override field value
app.post("/correct", async (req, res) => {
  const parsed = CorrectEntityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:correct", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { entity_id, entity_type, field, value, idempotency_key } = parsed.data;

    // Create correction observation
    const correctionSourceId = `correction_${idempotency_key}`;

    // Insert correction observation with highest priority
    const { data: observation, error } = await supabase
      .from("observations")
      .insert({
        entity_id,
        entity_type,
        field,
        value,
        source_id: correctionSourceId,
        source_priority: 1000, // Highest priority for manual corrections
        user_id: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Duplicate key - idempotent
        return res.json({ success: true, message: "Correction already applied" });
      }
      logError("SupabaseError:correct", req, error);
      return sendError(res, 500, "DB_QUERY_FAILED", error.message);
    }

    logDebug("Success:correct", req, { entity_id, field });
    return res.json({ success: true, observation });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to create correction",
      "DB_QUERY_FAILED",
      "APIError:correct"
    );
  }
});

// POST /get_authenticated_user - Get authenticated user ID
app.post("/get_authenticated_user", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, undefined);

    logDebug("Success:get_authenticated_user", req, { user_id: userId });
    return res.json({ user_id: userId });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get authenticated user",
      "AUTH_REQUIRED",
      "APIError:get_authenticated_user"
    );
  }
});

// POST /health_check_snapshots - Check for stale entity snapshots
app.post("/health_check_snapshots", async (req, res) => {
  const schema = z.object({
    auto_fix: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:health_check_snapshots", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const { auto_fix } = parsed.data;

    // Query for stale snapshots (observation_count=0 but observations exist)
    const { data: staleSnapshots, error } = await supabase
      .from("entity_snapshots")
      .select("entity_id, entity_type, observation_count")
      .eq("observation_count", 0);

    if (error) {
      logError("SupabaseError:health_check_snapshots", req, error);
      return sendError(res, 500, "DB_QUERY_FAILED", error.message);
    }

    // Check if these entities actually have observations
    const staleEntities = [];
    for (const snapshot of staleSnapshots || []) {
      const { data: observations, error: obsError } = await supabase
        .from("observations")
        .select("id")
        .eq("entity_id", snapshot.entity_id)
        .limit(1);

      if (!obsError && observations && observations.length > 0) {
        staleEntities.push(snapshot);
      }
    }

    let fixedCount = 0;
    if (auto_fix && staleEntities.length > 0) {
      // Recompute snapshots for stale entities using observationReducer
      const { observationReducer } = await import("./reducers/observation_reducer.js");

      for (const entity of staleEntities) {
        try {
          // Get all observations for this entity
          const { data: observations } = await supabase
            .from("observations")
            .select("*")
            .eq("entity_id", entity.entity_id)
            .order("observed_at", { ascending: false });

          if (!observations || observations.length === 0) continue;

          // Recompute snapshot
          const newSnapshot = await observationReducer.computeSnapshot(
            entity.entity_id,
            observations as any
          );
          if (!newSnapshot) continue;

          const rowWithEmbedding = await prepareEntitySnapshotWithEmbedding({
            entity_id: newSnapshot.entity_id,
            entity_type: newSnapshot.entity_type,
            schema_version: newSnapshot.schema_version,
            snapshot: newSnapshot.snapshot,
            computed_at: newSnapshot.computed_at,
            observation_count: newSnapshot.observation_count,
            last_observation_at: newSnapshot.last_observation_at,
            provenance: newSnapshot.provenance,
            user_id: newSnapshot.user_id,
          });
          await upsertEntitySnapshotWithEmbedding(rowWithEmbedding);

          fixedCount++;
        } catch (error) {
          console.error(`Failed to fix snapshot for ${entity.entity_id}:`, error);
        }
      }
    }

    logDebug("Success:health_check_snapshots", req, {
      stale_count: staleEntities.length,
      auto_fix,
    });
    return res.json({
      healthy: staleEntities.length === 0,
      message:
        staleEntities.length === 0
          ? "All snapshots healthy"
          : auto_fix
            ? `Found ${staleEntities.length} stale snapshots, fixed ${fixedCount}`
            : `Found ${staleEntities.length} stale snapshots`,
      checked: staleSnapshots?.length || 0,
      stale: staleEntities.length,
      fixed: auto_fix ? fixedCount : undefined,
      stale_snapshots: staleEntities,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to check snapshot health",
      "DB_QUERY_FAILED",
      "APIError:health_check_snapshots"
    );
  }
});

// ========== End of Phase 0 endpoints ==========

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

/** Try to bind on a port; resolves with server and port, or rejects on error (e.g. EADDRINUSE). */
function tryListen(
  port: number
): Promise<{ server: ReturnType<express.Express["listen"]>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve({ server, port });
    });
    server.once("error", (err: NodeJS.ErrnoException) => {
      server.close();
      reject(err);
    });
  });
}

// Export function to start HTTP server (called explicitly, not on import)
export async function startHTTPServer() {
  // Initialize encryption service
  await initServerKeys();

  const basePort = process.env.HTTP_PORT
    ? parseInt(process.env.HTTP_PORT, 10)
    : config.httpPort || 8080;
  const portFile = process.env.NEOTOMA_SESSION_PORT_FILE;
  const maxTries = 20;

  for (let offset = 0; offset < maxTries; offset++) {
    const port = basePort + offset;
    try {
      await tryListen(port);
      if (portFile) {
        fs.writeFileSync(portFile, String(port), "utf-8");
      }
      // eslint-disable-next-line no-console
      console.log(`HTTP Actions listening on :${port}`);

      // Start background OAuth state cleanup job
      import("./services/mcp_oauth.js").then((oauth) => {
        oauth.startStateCleanupJob();
      });
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EADDRINUSE" && offset < maxTries - 1) {
        continue;
      }
      throw err;
    }
  }
}

// Only auto-start if not disabled AND if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART !== "1" && isMainModule) {
  startHTTPServer().catch((err) => {
    console.error("Failed to start HTTP server:", err);
    process.exit(1);
  });
}
