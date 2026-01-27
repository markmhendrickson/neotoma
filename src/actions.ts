import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { supabase } from "./db.js";
import { config } from "./config.js";
import { listCanonicalRecordTypes, normalizeRecordType } from "./config/record_types.js";
import { generateEmbedding, getRecordText } from "./embeddings.js";
import fs from "fs";
import path from "path";
import { normalizeRow } from "./normalize.js";
import { createRecordFromUploadedFile } from "./services/file_analysis.js";
import { generateRecordSummary } from "./services/summary.js";
import { generateRecordComparisonInsight } from "./services/record_comparison.js";
import {
  ensurePublicKeyRegistered,
  getPublicKey,
  isBearerTokenValid,
} from "./services/public_key_registry.js";
import { verifyRequest, parseAuthHeader } from "./crypto/auth.js";
import { encryptResponseMiddleware } from "./middleware/encrypt_response.js";
import { initServerKeys } from "./services/encryption_service.js";
import { isCsvLike, parseCsvRows } from "./utils/csv.js";
import { emitRecordCreated, emitRecordUpdated, emitRecordDeleted } from "./events/event_emitter.js";
import { getEventsByRecordId } from "./events/event_log.js";
import { getRecordAtTimestamp } from "./events/replay.js";
import { rankSearchResults, sortRecordsDeterministically } from "./services/search.js";
import { createObservationsFromRecord } from "./services/observation_ingestion.js";
import { serializeChatMessagesForOpenAI, type ChatMessage } from "./utils/chat.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { NeotomaServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { OAuthError } from "./services/mcp_oauth_errors.js";
// import { setupDocumentationRoutes } from "./routes/documentation.js";

export const app = express();
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
const oauthInitiateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: "Too many OAuth initiation requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

const oauthCallbackLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: "Too many OAuth callback requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

const oauthTokenLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: "Too many token requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
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
    scopes_supported: ["openid", "email"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code"],
  });
});

app.get("/.well-known/oauth-protected-resource", (req, res) => {
  // oauth-repro pattern: return 401 on protected resource endpoint when unauthenticated
  // This may be required for Cursor to show Connect button
  const authHeader = (req.headers["authorization"] || req.headers["Authorization"]) as string | undefined;
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
app.get("/api/server-info", (_req, res) => {
  const httpPort = process.env.HTTP_PORT
    ? parseInt(process.env.HTTP_PORT, 10)
    : config.httpPort || 8080;
  res.json({
    httpPort,
    apiBase: config.apiBase,
    mcpUrl: `${config.apiBase}/mcp`,
  });
});

// ============================================================================
// MCP StreamableHTTP Endpoint (OAuth-enabled MCP transport)
// ============================================================================

// Store MCP transports by session ID
const mcpTransports = new Map<string, StreamableHTTPServerTransport>();
let mcpServerInstance: NeotomaServer | null = null;

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
    const authHeader = (req.headers["authorization"] || req.headers["Authorization"]) as string | undefined;
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
      // Create new transport for initialization
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          if (transport) {
            mcpTransports.set(sid, transport);
            logger.error(`[MCP HTTP] Session initialized: ${sid}`);
          }
        },
      });

      transport.onclose = () => {
        if (transport?.sessionId) {
          mcpTransports.delete(transport.sessionId);
          logger.error(`[MCP HTTP] Session closed: ${transport.sessionId}`);
        }
      };

      // Create new server instance for each session to ensure clean auth state
      // This ensures OAuth flow is required for each new connection
      mcpServerInstance = new NeotomaServer();

      // Connect transport to server
      await mcpServerInstance.runHTTP(transport);
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

const CANONICAL_RECORD_TYPES = listCanonicalRecordTypes();
const CANONICAL_RECORD_TYPE_IDS = CANONICAL_RECORD_TYPES.map((def) => def.id);

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
    const { connection_id, client_name } = req.body;

    if (!connection_id || typeof connection_id !== "string") {
      return res.status(400).json({ error: "connection_id is required" });
    }

    const { initiateOAuthFlow } = await import("./services/mcp_oauth.js");
    const result = await initiateOAuthFlow(
      connection_id,
      client_name,
      `${config.apiBase}/api/mcp/oauth/callback`
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
    const { code, state } = req.query;

    if (!code || !state || typeof code !== "string" || typeof state !== "string") {
      return res.status(400).send("Missing code or state parameter");
    }

    const { handleOAuthCallback } = await import("./services/mcp_oauth.js");
    const { connectionId, redirectUri, clientState } = await handleOAuthCallback(code, state);

    // If client used Cursor (or other protocol) redirect_uri, return code+state there
    if (redirectUri && redirectUri.startsWith("cursor://")) {
      const params = new URLSearchParams({ code: connectionId, state: clientState ?? state });
      return res.redirect(`${redirectUri}?${params.toString()}`);
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

    if (!redirect_uri) {
      return res.status(400).send("redirect_uri is required");
    }
    if (!state) {
      return res.status(400).send("state is required");
    }
    if (!code_challenge || code_challenge_method !== "S256") {
      return res.status(400).send("code_challenge and code_challenge_method=S256 are required");
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

// RFC 8414 token endpoint (POST) for Cursor and other OAuth clients
app.post("/api/mcp/oauth/token", oauthTokenLimit, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const grant_type = req.body?.grant_type;
    const code = req.body?.code;
    const redirect_uri = req.body?.redirect_uri;

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
});

// Get connection status
app.get("/api/mcp/oauth/status", async (req, res) => {
  try {
    const { connection_id } = req.query;

    if (!connection_id || typeof connection_id !== "string") {
      return res.status(400).json({ error: "connection_id is required" });
    }

    const { getConnectionStatus } = await import("./services/mcp_oauth.js");
    const status = await getConnectionStatus(connection_id);

    return res.json({ status, connection_id });
  } catch (error: any) {
    logError("MCPOAuthStatus", req, error);
    return res.status(500).json({ error: error.message });
  }
});

// List user's MCP connections (authenticated)
app.get("/api/mcp/oauth/connections", async (req, res) => {
  try {
    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header required" });
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
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

// Revoke MCP connection (authenticated)
app.delete("/api/mcp/oauth/connections/:connection_id", async (req, res) => {
  try {
    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header required" });
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
    return res.status(500).json({ error: error.message });
  }
});

// Dev-only endpoint to sign in as a specific user (for development/testing)
app.post("/api/auth/dev-signin", async (req, res) => {
  // Only allow in development mode
  if (config.environment !== "development") {
    return res.status(403).json({ error: "Dev signin only available in development mode" });
  }

  const { userId } = req.body;

  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId is required" });
  }

  // Check if userId is nil UUID - Supabase doesn't allow nil UUIDs
  const isNilUuid = userId === "00000000-0000-0000-0000-000000000000";

  try {
    let targetUserId = userId;
    let userEmail = `dev-${userId}@neotoma.local`;

    // Check if user exists (only if not nil UUID, as nil UUID lookup will fail)
    if (!isNilUuid) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

      if (!userError && userData.user) {
        // User exists, use it
        targetUserId = userData.user.id;
        userEmail = userData.user.email || userEmail;
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

    if (linkError) {
      logError("DevSigninGenerateLink", req, linkError);
      return res.status(500).json({ error: `Failed to generate link: ${linkError.message}` });
    }

    // Extract access token from the magic link URL
    const magicLink = linkData.properties.action_link;
    const url = new URL(magicLink);
    const accessToken = url.hash.includes("access_token=")
      ? url.hash.split("access_token=")[1]?.split("&")[0]
      : url.searchParams.get("access_token");

    if (!accessToken) {
      return res.status(500).json({ error: "Could not extract access token from magic link" });
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
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  const bearerToken = headerAuth.slice("Bearer ".length).trim();

  // Try to validate as Ed25519 bearer token first
  const registered = ensurePublicKeyRegistered(bearerToken);
  let isEd25519Valid = false;

  if (registered && isBearerTokenValid(bearerToken)) {
    isEd25519Valid = true;

    // Optional: Verify signature if provided
    const { signature } = parseAuthHeader(headerAuth);
    if (signature && req.body) {
      const bodyString = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const isValid = verifyRequest(bodyString, signature, bearerToken);
      if (!isValid) {
        logWarn("AuthInvalidSignature", req);
        return res.status(403).json({ error: "Invalid request signature" });
      }
    }

    // Attach public key to request for encryption service
    (req as any).publicKey = getPublicKey(bearerToken);
    (req as any).bearerToken = bearerToken;
  } else {
    // Try to validate as Supabase session token
    try {
      const { validateSupabaseSessionToken } = await import("./services/mcp_auth.js");
      const validated = await validateSupabaseSessionToken(bearerToken);
      // Attach user_id to request for user-scoped queries
      (req as any).authenticatedUserId = validated.userId;
      (req as any).bearerToken = bearerToken;
    } catch (authError) {
      // Not a valid token
      logWarn("AuthInvalidToken", req, {
        error: authError instanceof Error ? authError.message : String(authError),
      });
      return res.status(401).json({ error: "Unauthorized - invalid authentication token" });
    }
  }

  return next();
});

// Response encryption middleware (applies to all authenticated routes)
app.use(encryptResponseMiddleware);

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

  const token = headerAuth.slice("Bearer ".length).trim();

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
  logContext?: string
): express.Response {
  if (error instanceof Error && error.message.includes("Not authenticated")) {
    return res.status(401).json({ error: error.message });
  }
  if (error instanceof Error && error.message.includes("user_id parameter")) {
    return res.status(403).json({ error: error.message });
  }
  logError(logContext || "APIError", req, error);
  const message = error instanceof Error ? error.message : defaultMessage;
  return res.status(500).json({ error: message });
}

// Schemas
const StoreSchema = z.object({
  type: z.string(),
  properties: z.record(z.unknown()).default({}),
  file_urls: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

const UpdateSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  file_urls: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

const RetrieveSchema = z.object({
  type: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  limit: z.number().int().positive().max(500).optional(),
  search: z.array(z.string()).optional(),
  search_mode: z.enum(["semantic", "keyword", "both"]).optional().default("both"),
  similarity_threshold: z.number().min(0).max(1).optional().default(0.3),
  query_embedding: z.array(z.number()).optional(),
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  include_total_count: z.boolean().optional(),
});

const StoreRecordsSchema = z.object({
  records: z.array(StoreSchema).min(1).max(100),
});

const DeleteRecordsSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

// Endpoints
app.get("/types", async (req, res) => {
  const { data, error } = await supabase.from("records").select("type").limit(1000);
  if (error) {
    logError("SupabaseError:types", req, error);
    return res.status(500).json({ error: error.message });
  }
  const set = new Set<string>();
  (data || []).forEach((r: any) => {
    if (r.type) set.add(r.type);
  });
  const custom = Array.from(set)
    .filter((type) => !CANONICAL_RECORD_TYPE_IDS.includes(type))
    .sort();
  return res.json({
    types: [...CANONICAL_RECORD_TYPE_IDS, ...custom],
    canonical: CANONICAL_RECORD_TYPES,
    custom,
  });
});

// ============================================================================
// v0.2.15 Entity-Based HTTP API Endpoints
// ============================================================================

// POST /api/entities/query - Query entities with filters
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.post("/api/entities/query", async (req, res) => {
  const schema = z.object({
    entity_type: z.string().optional(),
    search: z.string().optional(),
    limit: z.number().optional().default(100),
    offset: z.number().optional().default(0),
    user_id: z.string().uuid().optional(), // Optional - will use authenticated user_id if not provided
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:entities_query", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { entity_type, search, limit, offset } = parsed.data;

    // Build query - ALWAYS filter by authenticated user_id
    let query = supabase.from("entities").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    // Exclude merged entities
    query = query.is("merged_to_entity_id", null);

    // Apply search if provided
    if (search) {
      query = query.ilike("canonical_name", `%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      entities: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(req, res, error, "Failed to query entities", "APIError:entities_query");
  }
});

// GET /api/entities/:id - Get entity detail with snapshot and provenance (FU-601)
// REQUIRES AUTHENTICATION - verifies entity belongs to authenticated user
app.get("/api/entities/:id", async (req, res) => {
  try {
    const entityId = req.params.id;

    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req);

    // Verify entity exists and belongs to authenticated user
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("id, user_id")
      .eq("id", entityId)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    if (entityError || !entity) {
      return res.status(404).json({ error: "Entity not found" });
    }

    const { getEntityWithProvenance } = await import("./services/entity_queries.js");
    const entityWithProvenance = await getEntityWithProvenance(entityId);

    if (!entityWithProvenance) {
      return res.status(404).json({ error: "Entity not found" });
    }

    return res.json(entityWithProvenance);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return res.status(401).json({ error: error.message });
    }
    logError("APIError:entity_detail", req, error);
    const message = error instanceof Error ? error.message : "Failed to get entity";
    return res.status(500).json({ error: message });
  }
});

// GET /api/entities/:id/observations - Get observations for entity (FU-601)
// REQUIRES AUTHENTICATION - verifies entity belongs to authenticated user
app.get("/api/entities/:id/observations", async (req, res) => {
  try {
    const entityId = req.params.id;

    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req);

    // Verify entity exists and belongs to authenticated user
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("id")
      .eq("id", entityId)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    if (entityError || !entity) {
      return res.status(404).json({ error: "Entity not found" });
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
      return res.status(401).json({ error: error.message });
    }
    logError("APIError:entity_observations", req, error);
    const message = error instanceof Error ? error.message : "Failed to get observations";
    return res.status(500).json({ error: message });
  }
});

// GET /api/entities/:id/relationships - Get relationships for entity (FU-601)
// REQUIRES AUTHENTICATION - verifies entity belongs to authenticated user
app.get("/api/entities/:id/relationships", async (req, res) => {
  try {
    const entityId = req.params.id;

    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req);

    // Verify entity exists and belongs to authenticated user
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("id")
      .eq("id", entityId)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    if (entityError || !entity) {
      return res.status(404).json({ error: "Entity not found" });
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
    return res.status(500).json({ error: message });
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
    const { data: dbSchemas, error: dbError } = await supabase
      .from("schema_registry")
      .select("entity_type")
      .eq("active", true)
      .or(`user_id.is.null,user_id.eq.${userId}`); // SECURITY: Only global or user's schemas

    if (dbError) throw dbError;

    const allowedEntityTypes = new Set((dbSchemas || []).map((s: any) => s.entity_type));
    const filteredSchemas = allSchemas.filter((s) => allowedEntityTypes.has(s.entity_type));

    return res.json({
      schemas: filteredSchemas,
      total: filteredSchemas.length,
    });
  } catch (error) {
    return handleApiError(req, res, error, "Failed to list schemas", "APIError:schemas_list");
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
      return res.status(404).json({ error: `Schema not found: ${entityType}` });
    }

    return res.json(schema);
  } catch (error) {
    logError("APIError:schema_detail", req, error);
    const message = error instanceof Error ? error.message : "Failed to get schema";
    return res.status(500).json({ error: message });
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
    const userId = await getAuthenticatedUserId(req);

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
        return res.status(404).json({ error: `Relationship not found: ${relationshipKey}` });
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
      // Log detailed error information
      logError("APIError:timeline_query", req, error, {
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
        userId: userId || "none",
      });

      // Return more detailed error to help with debugging
      return res.status(500).json({
        error: "Failed to query timeline events",
        details: {
          code: error.code,
          message: error.message,
          hint: error.hint,
        },
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
      return res.status(401).json({ error: error.message });
    }
    logError("APIError:timeline", req, error);
    const message = error instanceof Error ? error.message : "Failed to get timeline";
    // Include error code if available (for Supabase errors)
    const errorCode = (error as any)?.code;
    const errorDetails = errorCode ? { code: errorCode, message } : { message };
    return res.status(500).json({ error: errorDetails });
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
    return handleApiError(req, res, error, "Failed to get sources", "APIError:sources_list");
  }
});

// GET /api/sources/:id - Get source detail (FU-302)
// REQUIRES AUTHENTICATION - verifies source belongs to authenticated user
app.get("/api/sources/:id", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req);

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
        return res.status(404).json({ error: "Source not found" });
      }
      throw error;
    }

    if (!source) {
      return res.status(404).json({ error: "Source not found" });
    }

    return res.json(source);
  } catch (error) {
    return handleApiError(req, res, error, "Failed to get source", "APIError:source_detail");
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
    return res.status(500).json({ error: message });
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
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    // Get authenticated user_id and validate it matches provided user_id
    const authenticatedUserId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { entity_type, entity_identifier, fields, source_priority, user_id } = parsed.data;

    // SECURITY: Ensure provided user_id matches authenticated user
    if (user_id !== authenticatedUserId) {
      return res.status(403).json({
        error: `user_id parameter (${user_id}) does not match authenticated user (${authenticatedUserId})`,
      });
    }

    // Use the ingestStructuredInternal helper from the MCP server
    // For HTTP, we'll implement directly here
    const { createObservationsFromRecord } = await import("./services/observation_ingestion.js");
    const { generateEntityId, normalizeEntityValue } =
      await import("./services/entity_resolution.js");

    // Use resolveEntity to ensure entity exists with correct user_id
    // This handles the case where entity exists with null user_id
    const { resolveEntity } = await import("./services/entity_resolution.js");
    const normalizedValue = normalizeEntityValue(entity_type, entity_identifier);
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
    return res.status(500).json({ error: message });
  }
});

// POST /api/observations/query - Query observations
app.post("/api/observations/query", async (req, res) => {
  const schema = z.object({
    entity_id: z.string().optional(),
    entity_type: z.string().optional(),
    limit: z.number().optional().default(100),
    offset: z.number().optional().default(0),
    user_id: z.string().uuid().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:observations_query", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
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
      return res.status(401).json({ error: error.message });
    }
    logError("APIError:observations_query", req, error);
    const message = error instanceof Error ? error.message : "Failed to query observations";
    return res.status(500).json({ error: message });
  }
});

// POST /api/entities/merge - Merge duplicate entities
// REQUIRES AUTHENTICATION - validates user_id matches authenticated user and entities belong to user
app.post("/api/entities/merge", async (req, res) => {
  const schema = z.object({
    from_entity_id: z.string(),
    to_entity_id: z.string(),
    merge_reason: z.string().optional(),
    user_id: z.string().uuid(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:entities_merge", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    // Get authenticated user_id and validate it matches provided user_id
    const authenticatedUserId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { from_entity_id, to_entity_id, merge_reason, user_id } = parsed.data;

    // SECURITY: Ensure provided user_id matches authenticated user
    if (user_id !== authenticatedUserId) {
      return res.status(403).json({
        error: `user_id parameter (${user_id}) does not match authenticated user (${authenticatedUserId})`,
      });
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
      return res.status(404).json({ error: "Entity not found" });
    }

    if (fromEntity.merged_to_entity_id) {
      return res.status(400).json({ error: "Source entity already merged" });
    }

    if (toEntity.merged_to_entity_id) {
      return res.status(400).json({ error: "Target entity already merged" });
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
    return res.status(500).json({ error: message });
  }
});

// ============================================================================
// Legacy Record-Based HTTP API Endpoints (Deprecated in v0.2.15)
// ============================================================================
// REMOVED: Legacy endpoints violate Truth Layer architecture by directly mutating state
// State updates must flow through: Domain Events → Reducers → State Updates
// Use [storing](#storing) via MCP actions (store, correct, merge_entities) instead

// Historical API endpoints for event-sourcing (FU-050)

app.post("/retrieve_records", async (req, res) => {
  const parsed = RetrieveSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:retrieve_records", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const {
    type,
    properties,
    limit,
    search,
    search_mode,
    similarity_threshold,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = parsed.data;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const includeTotalCount = include_total_count === true;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };
  const finalLimit = limit ?? 100;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  let totalCount: number | null = null;

  if (hasIdFilter) {
    try {
      const idMatches = await fetchRecordsByIds(ids, normalizedType);
      appendResults(idMatches);
    } catch (error) {
      logError("SupabaseError:retrieve_records:ids", req, error);
      return res.status(500).json({ error: (error as any)?.message || "Database error" });
    }
  }

  // Semantic search (vector similarity)
  if (search && (search_mode === "semantic" || search_mode === "both")) {
    // Generate query_embedding from search terms if not provided
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
      if (!query_embedding) {
        logWarn("EmbeddingGeneration:retrieve_records", req, {
          message: "Failed to generate query embedding",
        });
        // Fall back to keyword search only
        if (search_mode === "semantic") {
          // Switch to keyword mode if semantic was required
          const keywordQuery = supabase.from("records").select("*");
          if (normalizedType) keywordQuery.eq("type", normalizedType);
          const { data: keywordCandidates } = await keywordQuery.limit(finalLimit * 2);
          const searchTextLower = search.join(" ").toLowerCase();
          const keywordMatches = (keywordCandidates || [])
            .filter((rec: any) => {
              const typeMatch = rec.type?.toLowerCase().includes(searchTextLower);
              const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
              return typeMatch || propsText.includes(searchTextLower);
            })
            .slice(0, finalLimit);
          logDebug("Success:retrieve_records", req, {
            count: keywordMatches.length,
            search_mode: "keyword (fallback)",
          });
          return res.json(keywordMatches);
        }
      }
    }

    if (!query_embedding) {
      if (search_mode === "semantic") {
        logWarn("ValidationError:retrieve_records:no_embedding", req, {
          message:
            "query_embedding required for semantic search or OPENAI_API_KEY must be configured",
        });
        return res.status(400).json({
          error:
            "query_embedding required for semantic search, or configure OPENAI_API_KEY for automatic generation",
        });
      }
      // If both mode, just skip semantic and do keyword only
    } else if (query_embedding.length !== 1536) {
      logWarn("ValidationError:retrieve_records:embedding_dim", req, {
        received: query_embedding.length,
      });
      return res.status(400).json({
        error: "query_embedding must be 1536-dimensional (OpenAI text-embedding-3-small)",
      });
    }

    if (query_embedding) {
      // Fetch records with embeddings for similarity calculation
      // Note: For better performance at scale, create a PostgreSQL function using pgvector operators
      let embeddingQuery = supabase.from("records").select("*").not("embedding", "is", null);

      if (normalizedType) {
        embeddingQuery = embeddingQuery.eq("type", normalizedType);
      }

      // Fetch more candidates than limit to filter by similarity
      const { data: candidates, error: fetchError } = await embeddingQuery.limit(finalLimit * 10);

      if (fetchError) {
        logError("SupabaseError:retrieve_records:semantic:fetch", req, fetchError);
      } else if (candidates) {
        // Debug: Check embedding format of first candidate
        const sampleEmbedding = candidates[0]?.embedding;
        const embeddingInfo = sampleEmbedding
          ? {
              type: typeof sampleEmbedding,
              isArray: Array.isArray(sampleEmbedding),
              length: Array.isArray(sampleEmbedding) ? sampleEmbedding.length : "N/A",
              preview:
                typeof sampleEmbedding === "string"
                  ? sampleEmbedding.substring(0, 50)
                  : Array.isArray(sampleEmbedding)
                    ? `[${sampleEmbedding.slice(0, 3).join(", ")}, ...]`
                    : JSON.stringify(sampleEmbedding).substring(0, 50),
            }
          : null;

        logDebug("SemanticSearch:retrieve_records", req, {
          candidates_count: candidates.length,
          similarity_threshold,
          type_filter: normalizedType || "all",
          sample_embedding: embeddingInfo,
        });

        // Calculate cosine similarity for each record
        const queryNorm = Math.sqrt(query_embedding.reduce((sum, val) => sum + val * val, 0));

        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;

            // Handle Supabase vector format - it might be stored as string or array
            if (!recEmbedding) {
              return null;
            }

            // Convert string to array if needed (Supabase might return JSON string)
            if (typeof recEmbedding === "string") {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch (e) {
                logWarn("SemanticSearch:embedding_parse_error", req, {
                  rec_id: rec.id?.substring(0, 8),
                  error: e,
                });
                return null;
              }
            }

            // Ensure it's an array with correct dimensions
            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              logWarn("SemanticSearch:embedding_format_error", req, {
                rec_id: rec.id?.substring(0, 8),
                embedding_type: typeof recEmbedding,
                embedding_length: Array.isArray(recEmbedding) ? recEmbedding.length : "not-array",
              });
              return null;
            }

            const dotProduct = query_embedding.reduce(
              (sum, val, i) => sum + val * recEmbedding[i],
              0
            );
            const recNorm = Math.sqrt(
              recEmbedding.reduce((sum: number, val: number) => sum + val * val, 0)
            );
            const similarity = dotProduct / (queryNorm * recNorm);

            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);

        // Log top 5 similarity scores for debugging
        const topScores = scoredCandidates.slice(0, 5).map((rec: any) => ({
          id: rec.id?.substring(0, 8),
          type: rec.type,
          similarity: rec.similarity?.toFixed(4),
        }));

        logDebug("SemanticSearch:similarity_scores", req, {
          top_5_scores: topScores,
          threshold: similarity_threshold,
          candidates_scored: scoredCandidates.length,
        });

        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);

        logDebug("SemanticSearch:results", req, {
          matches_count: semanticMatches.length,
          top_similarity: scoredCandidates[0]?.similarity?.toFixed(4) || "N/A",
          threshold: similarity_threshold,
        });

        appendResults(semanticMatches);
      }
    }
  }

  // Keyword search (ILIKE pattern matching)
  if (search && (search_mode === "keyword" || search_mode === "both")) {
    let keywordQuery = supabase.from("records").select("*");

    if (normalizedType) {
      keywordQuery = keywordQuery.eq("type", normalizedType);
    }

    // Fetch candidates and filter by keyword match
    const { data: keywordCandidates, error: keywordError } = await keywordQuery.limit(
      finalLimit * 2
    );

    if (keywordError) {
      logError("SupabaseError:retrieve_records:keyword", req, keywordError);
    } else if (keywordCandidates) {
      const searchText = search.join(" ").toLowerCase();
      const keywordMatches = keywordCandidates
        .filter((rec: any) => {
          const typeMatch = rec.type?.toLowerCase().includes(searchText);
          const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
          const propsMatch = propsText.includes(searchText);
          return typeMatch || propsMatch;
        })
        .slice(0, finalLimit);

      appendResults(keywordMatches);
    }
  }

  // No search mode: use existing logic
  if (!search && !hasIdFilter) {
    let query = supabase.from("records").select("*");
    if (normalizedType) query = query.eq("type", normalizedType);
    // Use deterministic ordering: created_at DESC, then id ASC for tiebreaker
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(finalLimit);

    const { data, error } = await query;
    if (error) {
      logError("SupabaseError:retrieve_records", req, error, {
        code: (error as any).code,
      });
      return res.status(500).json({ error: error.message });
    }
    appendResults(data || []);
  }

  let results = Array.from(resultMap.values());
  // Filter by exact property matches (if specified)
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic ranking (FU-105)
  if (search && search.length > 0) {
    const searchText = search.join(" ");
    results = rankSearchResults(results, searchText);
  } else if (hasIdFilter && !properties && ids) {
    // When only IDs are provided (no search, no properties), preserve order from ids array
    const orderMap = new Map(ids.map((id, index) => [id, index]));
    const idResults: any[] = [];
    const otherResults: any[] = [];
    for (const rec of results) {
      if (orderMap.has(rec.id)) {
        idResults.push(rec);
      } else {
        otherResults.push(rec);
      }
    }
    idResults.sort((a, b) => {
      const aIndex = orderMap.get(a.id) ?? Infinity;
      const bIndex = orderMap.get(b.id) ?? Infinity;
      return aIndex - bIndex;
    });
    results = [...idResults, ...otherResults];
  } else {
    // No search query - sort deterministically
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response to reduce size (ChatGPT Actions has response size limits)
  const resultsWithoutEmbeddings = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  if (includeTotalCount) {
    if (!search && !hasIdFilter && !properties) {
      try {
        const countOptions: {
          count: "exact";
          head: true;
          eq?: [string, string];
        } = {
          count: "exact",
          head: true,
        };
        let countQuery = supabase.from("records").select("id", countOptions);
        if (normalizedType) {
          countQuery = countQuery.eq("type", normalizedType);
        }
        const { count, error: countError } = await countQuery;
        if (countError) {
          logError("SupabaseError:retrieve_records:count", req, countError);
        } else if (typeof count === "number") {
          totalCount = count;
        }
      } catch (countError) {
        logError("SupabaseError:retrieve_records:count", req, countError);
      }
    } else if (hasIdFilter && ids) {
      totalCount = ids.length;
    }
  }

  const payload = includeTotalCount
    ? {
        records: resultsWithoutEmbeddings,
        total_count: totalCount ?? resultsWithoutEmbeddings.length,
      }
    : resultsWithoutEmbeddings;

  logDebug("Success:retrieve_records", req, {
    count: resultsWithoutEmbeddings.length,
    total_count: includeTotalCount ? (totalCount ?? resultsWithoutEmbeddings.length) : undefined,
    search_mode,
    has_search: !!search,
  });
  return res.json(payload);
});

// Historical API endpoints for event-sourcing (FU-050)
app.get("/api/records/:id/history", async (req, res) => {
  const { id } = req.params;

  try {
    const events = await getEventsByRecordId(id);

    // Format events for response (exclude internal fields if needed)
    const formattedEvents = events.map((event) => ({
      id: event.id,
      event_type: event.event_type,
      payload: event.payload,
      timestamp: event.timestamp,
      record_id: event.record_id,
      reducer_version: event.reducer_version,
      created_at: event.created_at,
    }));

    return res.json({ events: formattedEvents });
  } catch (error) {
    logError("HistoricalAPIError:history", req, error);
    const message = error instanceof Error ? error.message : "Failed to retrieve event history";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/records/:id", async (req, res) => {
  const { id } = req.params;
  const { at } = req.query;

  // If "at" query parameter is provided, use historical replay
  if (at && typeof at === "string") {
    try {
      const record = await getRecordAtTimestamp(id, at);

      if (!record) {
        return res.status(404).json({ error: "Record not found at specified timestamp" });
      }

      return res.json(record);
    } catch (error) {
      logError("HistoricalAPIError:at_timestamp", req, error);
      const message =
        error instanceof Error ? error.message : "Failed to retrieve record at timestamp";

      if (message.includes("Invalid timestamp")) {
        return res.status(400).json({ error: message });
      }

      return res.status(500).json({ error: message });
    }
  }

  // Otherwise, return current state from records table
  const { data, error } = await supabase.from("records").select("*").eq("id", id).single();

  if (error) {
    logError("SupabaseError:get_record", req, error);
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: "Record not found" });
  }

  return res.json(data);
});

// MCP Actions for Observation Architecture (FU-061)

// Get entity snapshot with provenance
app.post("/get_entity_snapshot", async (req, res) => {
  const schema = z.object({ entity_id: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_entity_snapshot", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id } = parsed.data;

  const { data, error } = await supabase
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entity_id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "Entity not found" });
    }
    logError("SupabaseError:get_entity_snapshot", req, error);
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:get_entity_snapshot", req, { entity_id });
  return res.json(data);
});

// List observations for entity
app.post("/list_observations", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:list_observations", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
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
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:list_observations", req, {
    entity_id,
    count: data?.length || 0,
  });
  return res.json({ observations: data || [] });
});

// Get field provenance (trace field to source documents)
app.post("/get_field_provenance", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    field: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_field_provenance", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id, field } = parsed.data;

  // Get snapshot to find observation ID for this field
  const { data: snapshot } = await supabase
    .from("entity_snapshots")
    .select("provenance")
    .eq("entity_id", entity_id)
    .single();

  if (!snapshot || !snapshot.provenance) {
    return res.status(404).json({ error: "Entity or field not found" });
  }

  const provenance = snapshot.provenance as Record<string, string>;
  const observationId = provenance[field];

  if (!observationId) {
    return res.status(404).json({ error: "Field not found in provenance" });
  }

  // Get observation(s) - may be comma-separated for merge_array
  const observationIds = observationId.split(",");

  const { data: observations, error: obsError } = await supabase
    .from("observations")
    .select("*, source_record_id")
    .in("id", observationIds);

  if (obsError) {
    logError("SupabaseError:get_field_provenance", req, obsError);
    return res.status(500).json({ error: obsError.message });
  }

  // Get source records
  const recordIds = observations?.map((obs) => obs.source_record_id).filter(Boolean) || [];

  const { data: records, error: recordError } = await supabase
    .from("records")
    .select("id, type, properties, file_urls, created_at")
    .in("id", recordIds);

  if (recordError) {
    logError("SupabaseError:get_field_provenance:records", req, recordError);
  }

  logDebug("Success:get_field_provenance", req, { entity_id, field });
  return res.json({
    field,
    entity_id,
    observation_ids: observationIds,
    observations: observations || [],
    source_records: records || [],
  });
});

// Create relationship
app.post("/create_relationship", async (req, res) => {
  const schema = z.object({
    relationship_type: z.enum([
      "PART_OF",
      "CORRECTS",
      "REFERS_TO",
      "SETTLES",
      "DUPLICATE_OF",
      "DEPENDS_ON",
      "SUPERSEDES",
    ]),
    source_entity_id: z.string(),
    target_entity_id: z.string(),
    source_record_id: z.string().uuid().optional(),
    metadata: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:create_relationship", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { relationship_type, source_entity_id, target_entity_id, source_record_id, metadata } =
    parsed.data;

  const userId = "00000000-0000-0000-0000-000000000000"; // v0.1.0 single-user

  const { relationshipsService } = await import("./services/relationships.js");

  try {
    const relationship = await relationshipsService.createRelationship({
      relationship_type,
      source_entity_id,
      target_entity_id,
      source_record_id: source_record_id || null,
      metadata: metadata || {},
      user_id: userId,
    });

    logDebug("Success:create_relationship", req, {
      relationship_key: relationship.relationship_key,
    });
    return res.json(relationship);
  } catch (error) {
    logError("RelationshipCreationError:create_relationship", req, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create relationship",
    });
  }
});

// List relationships
app.post("/list_relationships", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    direction: z.enum(["outgoing", "incoming", "both"]).optional(),
    relationship_type: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:list_relationships", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id, direction = "both", relationship_type } = parsed.data;

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
      relationships = await relationshipsService.getRelationshipsForEntity(entity_id, direction);
    }

    logDebug("Success:list_relationships", req, {
      entity_id,
      count: relationships.length,
    });
    return res.json({ relationships });
  } catch (error) {
    logError("RelationshipQueryError:list_relationships", req, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to query relationships",
    });
  }
});

type NormalizedCsvRowResult = ReturnType<typeof normalizeRow>;

interface PreparedCsvRow {
  normalized: NormalizedCsvRowResult;
  rowIndex: number;
}

async function persistCsvRowRecords(
  rows: PreparedCsvRow[],
  parentRecordId: string,
  filePath: string,
  userId: string = "00000000-0000-0000-0000-000000000000" // v0.1.0 single-user default
): Promise<Array<{ id: string; row_index: number }>> {
  if (!rows.length) {
    return [];
  }

  const preparedEntries = rows.map(({ normalized, rowIndex }) => {
    const canonicalType = normalizeRecordType(normalized.type).type;
    const rowId = randomUUID();
    const baseProperties = (normalized.properties ?? {}) as Record<string, unknown>;
    const properties = {
      ...baseProperties,
      csv_origin: {
        parent_record_id: parentRecordId,
        row_index: rowIndex,
        file_url: filePath,
      },
    };
    return {
      payload: {
        id: rowId,
        type: canonicalType,
        properties,
        file_urls: [filePath],
        user_id: userId, // FU-701: Set user_id for RLS
      },
      rowIndex,
    };
  });

  const created: Array<{ id: string; row_index: number }> = [];
  for (let i = 0; i < preparedEntries.length; i += 25) {
    const chunk = preparedEntries.slice(i, i + 25);
    const insertPayload = chunk.map((entry) => entry.payload);
    const { error } = await supabase.from("records").insert(insertPayload);
    if (error) {
      throw error;
    }
    chunk.forEach((entry) => {
      created.push({
        id: entry.payload.id as string,
        row_index: entry.rowIndex,
      });
    });
  }

  return created;
}

// File endpoints
const upload = multer({ dest: "/tmp" });
app.post("/upload_file", upload.single("file"), async (req, res) => {
  const schema = z.object({
    record_id: z.string().uuid().optional(),
    bucket: z.string().optional(),
    properties: z.union([z.string(), z.record(z.unknown())]).optional(),
    csv_row_records: z.coerce.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:upload_file", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { record_id, bucket, properties } = parsed.data;
  const csvRowsPreference = parsed.data.csv_row_records ?? true;

  let overrideProperties: Record<string, unknown> | undefined;
  if (typeof properties === "string") {
    if (properties.trim().length === 0) {
      logWarn("ValidationError:upload_file:properties_empty", req);
      return res.status(400).json({ error: "properties must be valid JSON object when provided" });
    }
    try {
      const parsedProperties = JSON.parse(properties);
      if (
        !parsedProperties ||
        typeof parsedProperties !== "object" ||
        Array.isArray(parsedProperties)
      ) {
        logWarn("ValidationError:upload_file:properties_shape", req, {
          properties: parsedProperties,
        });
        return res.status(400).json({ error: "properties must be a JSON object" });
      }
      overrideProperties = parsedProperties as Record<string, unknown>;
    } catch (error) {
      logWarn("ValidationError:upload_file:properties_parse", req, {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(400).json({ error: "properties must be valid JSON" });
    }
  } else if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    overrideProperties = properties as Record<string, unknown>;
  }

  let existingFileUrls: string[] = [];

  const bucketName = bucket || "files";
  const tmpPath = req.file?.path;
  if (!tmpPath) {
    logWarn("ValidationError:upload_file:missing_file", req);
    return res.status(400).json({ error: "Missing file" });
  }

  const fileBuffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  const originalName = req.file?.originalname || "upload.bin";
  const mimeType = req.file?.mimetype || "application/octet-stream";
  const fileSize = req.file?.size ?? fileBuffer.length;

  const recordId = record_id ?? randomUUID();

  const isCsvFileUpload = isCsvLike(originalName, mimeType);
  const shouldGenerateCsvRows = isCsvFileUpload && csvRowsPreference;
  let preparedCsvRows: PreparedCsvRow[] = [];
  let csvRowsMeta: { truncated: boolean } | null = null;
  const csvRowWarnings: string[] = [];

  if (shouldGenerateCsvRows) {
    try {
      const parsedCsv = parseCsvRows(fileBuffer);
      if (parsedCsv.rows.length === 0) {
        logWarn("UploadFile:csv_rows_empty", req, { file: originalName });
      } else {
        const { data: typeRows, error: typeFetchError } = await supabase
          .from("records")
          .select("type")
          .limit(1000);
        if (typeFetchError) {
          logError("SupabaseError:upload_file:csv_types", req, typeFetchError);
        } else {
          const existingTypes = Array.from(
            new Set(
              ((typeRows || []) as Array<{ type: string | null }>)
                .map((row) => row.type)
                .filter(Boolean)
            )
          ) as string[];
          csvRowsMeta = { truncated: parsedCsv.truncated };
          preparedCsvRows = parsedCsv.rows.map((row, index) => {
            const normalized = normalizeRow(row, existingTypes);
            if (csvRowWarnings.length < 10 && normalized.warnings.length > 0) {
              const remainingSlots = 10 - csvRowWarnings.length;
              normalized.warnings.slice(0, remainingSlots).forEach((warning) => {
                csvRowWarnings.push(`Row ${index + 1}: ${warning}`);
              });
            }
            return { normalized, rowIndex: index };
          });
        }
      }
    } catch (error) {
      logError("UploadFile:csv_parse_failed", req, error, {
        file: originalName,
      });
    }
  }

  if (csvRowWarnings.length) {
    logWarn("UploadFile:csv_row_warnings", req, { warnings: csvRowWarnings });
  }

  const safeBase =
    path
      .basename(originalName)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 100) || "file";
  const ext = path.extname(safeBase) || ".bin";
  const baseName = safeBase.endsWith(ext)
    ? safeBase.slice(0, safeBase.length - ext.length)
    : safeBase;
  const fileName = `${recordId}/${Date.now()}-${baseName.replace(/\.+/g, "-")}${ext}`;

  if (record_id) {
    const { data: recordData, error: fetchError } = await supabase
      .from("records")
      .select("file_urls")
      .eq("id", record_id)
      .single();
    if (fetchError || !recordData) {
      logWarn("NotFound:upload_file", req, { record_id, fetchError });
      return res.status(404).json({ error: "Record not found" });
    }
    existingFileUrls = Array.isArray(recordData.file_urls)
      ? (recordData.file_urls as string[])
      : [];
  }

  // Allow tests to skip storage upload (bucket might not exist)
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  let uploadData: { path: string } | null = null;

  if (!isTestEnv) {
    const { data, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, { upsert: false });

    if (uploadError) {
      logError("SupabaseStorageError:upload_file", req, uploadError, {
        bucket: bucketName,
        fileName,
      });
      return res.status(500).json({ error: uploadError.message });
    }
    uploadData = data;
  } else {
    // In test environment, create a mock file path
    // fileName already includes recordId/, so just use it directly with test/ prefix
    uploadData = { path: `test/${fileName}` };
  }

  const filePath = uploadData.path;

  if (record_id) {
    const updatedFileUrls = [...existingFileUrls, filePath];

    const { data: updated, error: updateError } = await supabase
      .from("records")
      .update({ file_urls: updatedFileUrls })
      .eq("id", record_id)
      .select()
      .single();

    if (updateError) {
      logError("SupabaseError:upload_file:update_row", req, updateError);
      return res.status(500).json({ error: updateError.message });
    }

    logDebug("Success:upload_file", req, { record_id, filePath });
    return res.json(updated);
  }

  try {
    const created = await createRecordFromUploadedFile({
      recordId,
      buffer: fileBuffer,
      fileName: originalName,
      mimeType,
      fileSize,
      fileUrl: filePath,
      overrideProperties,
    });
    let responseRecord = created;

    if (shouldGenerateCsvRows && preparedCsvRows.length > 0) {
      try {
        const insertedRows = await persistCsvRowRecords(preparedCsvRows, created.id, filePath);
        if (insertedRows.length > 0) {
          const relationshipPayload = insertedRows.map((row) => ({
            source_id: created.id,
            target_id: row.id,
            relationship: "contains_row",
            metadata: { row_index: row.row_index },
          }));
          const { error: relationshipError } = await supabase
            .from("record_relationships")
            .insert(relationshipPayload);
          if (relationshipError) {
            logError("SupabaseError:upload_file:relationships", req, relationshipError);
          }

          const mergedProperties = {
            ...(created.properties as Record<string, unknown>),
            csv_rows: {
              linked_records: insertedRows.length,
              truncated: csvRowsMeta?.truncated ?? false,
              relationship: "contains_row",
            },
          };

          const { data: updatedDataset, error: datasetUpdateError } = await supabase
            .from("records")
            .update({ properties: mergedProperties })
            .eq("id", created.id)
            .select()
            .single();

          if (datasetUpdateError) {
            logError("SupabaseError:upload_file:update_csv_summary", req, datasetUpdateError);
            responseRecord = { ...created, properties: mergedProperties };
          } else if (updatedDataset) {
            responseRecord = updatedDataset as typeof created;
          }

          logDebug("Success:upload_file:csv_rows", req, {
            parent_record_id: created.id,
            row_count: insertedRows.length,
            truncated: csvRowsMeta?.truncated ?? false,
          });
        }
      } catch (csvRowError) {
        logError("SupabaseError:upload_file:csv_rows", req, csvRowError);
      }
    }

    // Emit RecordCreated event (event-sourcing foundation - FU-050)
    try {
      await emitRecordCreated(responseRecord as any);
    } catch (eventError) {
      // Log event emission error but don't fail the request
      logError("EventEmissionError:upload_file", req, eventError);
    }

    logDebug("Success:upload_file:create", req, {
      record_id: created.id,
      filePath,
    });
    return res.status(201).json(responseRecord);
  } catch (error) {
    logError("SupabaseError:upload_file:create_record", req, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create record from file",
    });
  }
});

app.post("/analyze_file", upload.single("file"), async (req, res) => {
  const tmpPath = req.file?.path;
  if (!tmpPath) {
    logWarn("ValidationError:analyze_file:missing_file", req);
    return res.status(400).json({ error: "Missing file" });
  }

  const fileBuffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  const originalName = req.file?.originalname || "upload.bin";
  const mimeType = req.file?.mimetype || "application/octet-stream";
  const fileSize = req.file?.size ?? fileBuffer.length;

  try {
    const { analyzeFileForRecord } = await import("./services/file_analysis.js");
    const analysis = await analyzeFileForRecord({
      buffer: fileBuffer,
      fileName: originalName,
      mimeType,
      fileSize,
    });

    logDebug("Success:analyze_file", req, {
      fileName: originalName,
      type: analysis.type,
    });
    return res.json(analysis);
  } catch (error) {
    logError("Error:analyze_file", req, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to analyze file",
    });
  }
});

app.post("/record_comparison", async (req, res) => {
  const metricsSchema = z
    .object({
      amount: z.number().optional(),
      currency: z.string().max(16).optional(),
      repetitions: z.number().optional(),
      load: z.number().optional(),
      duration_minutes: z.number().optional(),
      date: z.string().optional(),
      recipient: z.string().optional(),
      merchant: z.string().optional(),
      category: z.string().optional(),
      location: z.string().optional(),
      label: z.string().optional(),
    })
    .strict()
    .partial();

  const recordSchema = z.object({
    id: z.string(),
    type: z.string(),
    summary: z.string().nullable().optional(),
    properties: z.record(z.unknown()).optional(),
    metrics: metricsSchema.optional(),
  });

  const schema = z.object({
    new_record: recordSchema,
    similar_records: z.array(recordSchema).min(1).max(10),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:record_comparison", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!config.openaiApiKey) {
    logWarn("RecordComparison:openai_unconfigured", req);
    return res.status(503).json({ error: "OpenAI API key is not configured on the server" });
  }

  try {
    const analysis = await generateRecordComparisonInsight(parsed.data);
    return res.json({ analysis });
  } catch (error) {
    logError("RecordComparison:failure", req, error);
    return res.status(500).json({ error: "Failed to generate record comparison" });
  }
});

app.post("/generate_embedding", async (req, res) => {
  const schema = z.object({
    type: z.string(),
    properties: z.record(z.unknown()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:generate_embedding", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!config.openaiApiKey) {
    logWarn("GenerateEmbedding:openai_unconfigured", req);
    return res.status(503).json({ error: "OpenAI API key is not configured on the server" });
  }

  try {
    const { type, properties } = parsed.data;
    const normalizedType = normalizeRecordType(type).type;
    const recordText = getRecordText(normalizedType, properties);
    const embedding = await generateEmbedding(recordText);

    if (!embedding) {
      return res.status(500).json({ error: "Failed to generate embedding" });
    }

    logDebug("Success:generate_embedding", req, { type: normalizedType });
    return res.json({ embedding });
  } catch (error) {
    logError("GenerateEmbedding:failure", req, error);
    return res.status(500).json({ error: "Failed to generate embedding" });
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
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { file_path, expires_in } = parsed.data;

  const parts = file_path.split("/");
  const bucket = parts[0];
  const path = parts.slice(1).join("/");

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expires_in || 3600);
  if (error) {
    logError("SupabaseStorageError:get_file_url", req, error, { bucket, path });
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:get_file_url", req, { path: file_path });
  return res.json({ url: data.signedUrl });
});

async function fetchRecordsByIds(ids: string[], type?: string): Promise<any[]> {
  if (!ids.length) {
    return [];
  }
  let query = supabase.from("records").select("*").in("id", ids);
  if (type) {
    query = query.eq("type", type);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  const orderMap = new Map(ids.map((id, index) => [id, index]));
  return (data ?? []).sort((a, b) => {
    const aIndex = orderMap.get(a.id) ?? 0;
    const bIndex = orderMap.get(b.id) ?? 0;
    return aIndex - bIndex;
  });
}

// Helper function to execute retrieve_records logic (reusable for chat endpoint)
async function executeRetrieveRecords(params: {
  type?: string;
  properties?: Record<string, unknown>;
  limit?: number;
  search?: string[];
  search_mode?: "semantic" | "keyword" | "both";
  similarity_threshold?: number;
  query_embedding?: number[];
  ids?: string[];
  include_total_count?: boolean;
}): Promise<{ records: any[]; totalCount?: number }> {
  const {
    type,
    properties,
    limit,
    search,
    search_mode = "both",
    similarity_threshold = 0.3,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = params;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };

  const finalLimit = limit ?? 100;
  const includeTotalCount = include_total_count === true;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  const hasSearch = Array.isArray(search) && search.length > 0;
  let totalCount: number | null = null;

  if (hasIdFilter) {
    const idMatches = await fetchRecordsByIds(ids, normalizedType);
    appendResults(idMatches);
    if (includeTotalCount) {
      totalCount = ids.length;
    }
  }

  // Semantic search (vector similarity)
  if (hasSearch && (search_mode === "semantic" || search_mode === "both")) {
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
    }

    if (query_embedding && query_embedding.length === 1536) {
      let embeddingQuery = supabase.from("records").select("*").not("embedding", "is", null);

      if (normalizedType) {
        embeddingQuery = embeddingQuery.eq("type", normalizedType);
      }

      const { data: candidates, error: fetchError } = await embeddingQuery.limit(finalLimit * 10);

      if (!fetchError && candidates) {
        const queryNorm = Math.sqrt(query_embedding.reduce((sum, val) => sum + val * val, 0));

        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;

            if (!recEmbedding) return null;

            if (typeof recEmbedding === "string") {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch {
                return null;
              }
            }

            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              return null;
            }

            const dotProduct = query_embedding.reduce(
              (sum, val, i) => sum + val * recEmbedding[i],
              0
            );
            const recNorm = Math.sqrt(
              recEmbedding.reduce((sum: number, val: number) => sum + val * val, 0)
            );
            const similarity = dotProduct / (queryNorm * recNorm);

            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);

        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);
        appendResults(semanticMatches);
      }
    }
  }

  // Keyword search
  if (hasSearch && (search_mode === "keyword" || search_mode === "both")) {
    let keywordQuery = supabase.from("records").select("*");

    if (normalizedType) {
      keywordQuery = keywordQuery.eq("type", normalizedType);
    }

    const { data: keywordCandidates, error: keywordError } = await keywordQuery.limit(
      finalLimit * 2
    );

    if (!keywordError && keywordCandidates) {
      const searchText = search.join(" ").toLowerCase();
      const keywordMatches = keywordCandidates
        .filter((rec: any) => {
          const typeMatch = rec.type?.toLowerCase().includes(searchText);
          const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
          const propsMatch = propsText.includes(searchText);
          return typeMatch || propsMatch;
        })
        .slice(0, finalLimit);
      appendResults(keywordMatches);
    }
  }

  // No search mode
  if (!hasSearch && !hasIdFilter) {
    let query = supabase.from("records").select("*");
    if (normalizedType) query = query.eq("type", normalizedType);
    // Use deterministic ordering: created_at DESC, then id ASC for tiebreaker
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(finalLimit);

    const { data, error } = await query;
    if (!error && data) {
      appendResults(data);
    }
  }

  // Filter by exact property matches
  let results = Array.from(resultMap.values());
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic sorting if no search was performed
  if (!hasSearch) {
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response
  const sanitized = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  if (includeTotalCount && totalCount === null && !hasSearch && !properties) {
    try {
      let countQuery = supabase.from("records").select("id", { count: "exact", head: true });
      if (normalizedType) {
        countQuery = countQuery.eq("type", normalizedType);
      }
      const { count } = await countQuery;
      if (typeof count === "number") {
        totalCount = count;
      }
    } catch {
      totalCount = null;
    }
  }

  return {
    records: sanitized,
    totalCount: includeTotalCount ? (totalCount ?? sanitized.length) : undefined,
  };
}

// Local-only version of executeRetrieveRecords that works with in-memory records
async function executeRetrieveRecordsLocal(
  localRecords: any[],
  params: {
    type?: string;
    properties?: Record<string, unknown>;
    limit?: number;
    search?: string[];
    search_mode?: "semantic" | "keyword" | "both";
    similarity_threshold?: number;
    query_embedding?: number[];
    ids?: string[];
    include_total_count?: boolean;
  }
): Promise<{ records: any[]; totalCount?: number }> {
  const {
    type,
    properties,
    limit,
    search,
    search_mode = "both",
    similarity_threshold = 0.3,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = params;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };

  const finalLimit = limit ?? 100;
  const includeTotalCount = include_total_count === true;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  const hasSearch = Array.isArray(search) && search.length > 0;
  let totalCount: number | null = null;

  // Start with all local records
  let candidates = [...localRecords];

  // Filter by type if specified
  if (normalizedType) {
    candidates = candidates.filter((rec: any) => rec.type === normalizedType);
  }

  // Filter by IDs if specified
  if (hasIdFilter) {
    const idMatches = candidates.filter((rec: any) => ids.includes(rec.id));
    appendResults(idMatches);
    if (includeTotalCount) {
      totalCount = idMatches.length;
    }
  }

  // Semantic search (vector similarity)
  if (hasSearch && (search_mode === "semantic" || search_mode === "both")) {
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
    }

    if (query_embedding && Array.isArray(query_embedding) && query_embedding.length === 1536) {
      const recordsWithEmbeddings = candidates.filter((rec: any) => {
        if (!rec.embedding) return false;
        let recEmbedding = rec.embedding;
        if (typeof recEmbedding === "string") {
          try {
            recEmbedding = JSON.parse(recEmbedding);
          } catch {
            return false;
          }
        }
        return Array.isArray(recEmbedding) && recEmbedding.length === 1536;
      });

      const queryNorm = Math.sqrt(query_embedding.reduce((sum, val) => sum + val * val, 0));

      const scoredCandidates = recordsWithEmbeddings
        .map((rec: any) => {
          let recEmbedding = rec.embedding;
          if (typeof recEmbedding === "string") {
            try {
              recEmbedding = JSON.parse(recEmbedding);
            } catch {
              return null;
            }
          }

          if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
            return null;
          }

          const dotProduct = query_embedding.reduce(
            (sum, val, i) => sum + val * recEmbedding[i],
            0
          );
          const recNorm = Math.sqrt(
            recEmbedding.reduce((sum: number, val: number) => sum + val * val, 0)
          );
          const similarity = dotProduct / (queryNorm * recNorm);

          return { ...rec, similarity };
        })
        .filter((rec: any) => rec !== null)
        .sort((a: any, b: any) => b.similarity - a.similarity);

      const semanticMatches = scoredCandidates
        .filter((rec: any) => rec.similarity >= similarity_threshold)
        .slice(0, finalLimit);
      appendResults(semanticMatches);
    }
  }

  // Keyword search
  if (hasSearch && (search_mode === "keyword" || search_mode === "both")) {
    const searchText = search.join(" ").toLowerCase();
    const keywordMatches = candidates
      .filter((rec: any) => {
        const typeMatch = rec.type?.toLowerCase().includes(searchText);
        const summaryMatch = rec.summary?.toLowerCase().includes(searchText);
        const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
        const propsMatch = propsText.includes(searchText);
        return typeMatch || summaryMatch || propsMatch;
      })
      .slice(0, finalLimit);
    appendResults(keywordMatches);
  }

  // No search mode - just return records
  if (!hasSearch && !hasIdFilter) {
    const sorted = candidates
      .sort((a: any, b: any) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, finalLimit);
    appendResults(sorted);
  }

  // Filter by exact property matches
  let results = Array.from(resultMap.values());
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic sorting if no search was performed
  if (!hasSearch) {
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response
  const sanitized = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  // Calculate total count if requested
  if (includeTotalCount && totalCount === null && !hasSearch && !properties) {
    totalCount = normalizedType
      ? candidates.filter((rec: any) => rec.type === normalizedType).length
      : candidates.length;
  }

  return {
    records: sanitized,
    totalCount: includeTotalCount ? (totalCount ?? sanitized.length) : undefined,
  };
}

function extractUUIDs(text: string): string[] {
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const matches = text.match(uuidRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

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

/**
 * Check if a record matches keyword search terms
 */
export function recordMatchesKeywordSearch(
  record: import("./db.js").NeotomaRecord,
  searchTerms: string[]
): boolean {
  const recordText = JSON.stringify(record.properties || {}).toLowerCase();
  const recordType = record.type.toLowerCase();

  return searchTerms.some((term) => {
    const termLower = term.toLowerCase();
    return recordText.includes(termLower) || recordType.includes(termLower);
  });
}
