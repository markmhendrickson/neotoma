import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";
import fs from "fs";
import path from "path";
import { writeLocalHttpPortFile } from "./utils/local_http_port_file.js";
import yaml from "js-yaml";
import {
  ensurePublicKeyRegistered,
  getPublicKey,
  getUserIdFromBearerToken,
  isBearerTokenValid,
} from "./services/public_key_registry.js";
import { verifyRequest, parseAuthHeader } from "./crypto/auth.js";
import { encryptResponseMiddleware } from "./middleware/encrypt_response.js";
import { unknownFieldsGuard } from "./middleware/unknown_fields_guard.js";
import {
  aauthVerify,
  getAAuthContextFromRequest,
  getAttributionDecisionFromRequest,
} from "./middleware/aauth_verify.js";
import { attributionContext } from "./middleware/attribution_context.js";
import { aauthAdmission, getAAuthAdmissionFromRequest } from "./middleware/aauth_admission.js";
import { buildSessionInfo } from "./services/session_info.js";
import { AttributionPolicyError, enforceAttributionPolicy } from "./services/attribution_policy.js";
import {
  AgentCapabilityError,
  contextFromAgentIdentity,
  enforceAgentCapability,
} from "./services/agent_capabilities.js";
import {
  assertGuestWriteAllowed,
  AccessPolicyError,
  type GuestIdentity,
} from "./services/access_policy.js";
import { hashGuestAccessToken } from "./services/guest_access_token.js";
import { IssueTransportError, IssueValidationError } from "./services/issues/errors.js";
import {
  getCurrentAAuthAdmission,
  getCurrentAgentIdentity,
  getCurrentAttribution,
  getCurrentExternalActor,
  getRequestContext,
  runWithExternalActor,
  runWithRequestContext,
} from "./services/request_context.js";
import { assertCanWriteProtectedBatch } from "./services/protected_entity_types.js";
import {
  createAgentIdentity as buildAgentIdentity,
  type ExternalActor,
  type AgentIdentity,
  getAgentIdentityFromRequest,
  normaliseClientName,
} from "./crypto/agent_identity.js";
import { initServerKeys } from "./services/encryption_service.js";
import {
  storeRawContent,
  downloadRawContent,
  resolveLocalSourceFilePath,
  SourceFileNotFoundError,
} from "./services/raw_storage.js";
import { attachSourceLabelsToObservations } from "./services/observation_source_label.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { NeotomaServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { formatRequestLogLine } from "./utils/safe_request_log_format.js";
import {
  emitEntitySnapshotChange,
  emitObservationCreated,
  shallowFieldsChanged,
} from "./events/substrate_store_emit.js";
import { OAuthError } from "./services/mcp_oauth_errors.js";
import {
  ensureLocalDevUser,
  ensureSandboxAauthUser,
  ensureSandboxPublicUser,
  LOCAL_DEV_USER_ID,
  SANDBOX_PUBLIC_USER_ID,
} from "./services/local_auth.js";
import {
  isSandboxMode,
  sandboxDestructiveGuard,
  sandboxHeaderMiddleware,
} from "./services/sandbox_mode.js";
import {
  createSandboxSession,
  redeemOneTimeCode,
  resolveSessionFromRequest,
  revokeSession,
  purgeSessionUserData,
  sweepExpiredSessions,
  SESSION_COOKIE_NAME,
} from "./services/sandbox/sessions.js";
import {
  buildLandingContext,
  buildRootLandingHtml,
  buildRootLandingJson,
  buildRootLandingMarkdown,
  buildRobotsTxt,
  readNeotomaConfigEnvironment,
  wantsHtml as acceptWantsHtml,
  wantsMarkdown as acceptWantsMarkdown,
} from "./services/root_landing/index.js";
import { installInspectorMount } from "./services/inspector_mount.js";
import { getSandboxTermsResponse } from "./services/sandbox/terms.js";
import { resolveSandboxReportTransport } from "./services/sandbox/transport.js";
import type { SandboxReportReason } from "./services/sandbox/types.js";
import { getSqliteDb } from "./repositories/sqlite/sqlite_client.js";
import { getMcpAuthToken } from "./crypto/mcp_auth_token.js";
import {
  isOauthKeyCredentialValid,
  normalizeOauthNextPath,
  OAuthKeySessionStore,
} from "./services/oauth_key_gate.js";
import {
  AnalyzeSchemaCandidatesRequestSchema,
  CorrectEntityRequestSchema,
  CreateInterpretationRequestSchema,
  CreateRelationshipsRequestSchema,
  CreateRelationshipRequestSchema,
  DeleteEntityRequestSchema,
  DeleteRelationshipRequestSchema,
  IssuesBulkEntityIdsRequestSchema,
  IssuesAddMessageRequestSchema,
  IssuesGetStatusRequestSchema,
  IssuesSubmitRequestSchema,
  IssuesSyncRequestSchema,
  EntitiesQueryRequestSchema,
  EntitySnapshotRequestSchema,
  FieldProvenanceRequestSchema,
  GetSchemaRecommendationsRequestSchema,
  ListObservationsRequestSchema,
  ListRelationshipsRequestSchema,
  MergeEntitiesRequestSchema,
  SplitEntityRequestSchema,
  ObservationsQueryRequestSchema,
  RegisterSchemaRequestSchema,
  RelationshipSnapshotRequestSchema,
  RestoreEntityRequestSchema,
  RestoreRelationshipRequestSchema,
  RetrieveEntityByIdentifierSchema,
  RetrieveGraphNeighborhoodSchema,
  RetrieveRelatedEntitiesSchema,
  RELATIONSHIP_ENTITY_ID_FORMAT_HINT,
  RELATIONSHIP_ENTITY_ID_FORMAT_ISSUE_CODE,
  StoreRequestSchema,
  type StoreInterpretationInput,
  UpdateSchemaIncrementalRequestSchema,
} from "./shared/action_schemas.js";
import { getMimeTypeFromExtension } from "./services/file_text_extraction.js";
import { queryEntitiesWithCount } from "./shared/action_handlers/entity_handlers.js";
import { retrieveEntityByIdentifierWithFallback } from "./shared/action_handlers/entity_identifier_handler.js";
import {
  prepareEntitySnapshotWithEmbedding,
  upsertEntitySnapshotWithEmbedding,
} from "./services/entity_snapshot_embedding.js";
import { isNeotomaEntityId } from "./shared/neotoma_entity_id.js";
import { readOpenApiActionsFile, readOpenApiFile } from "./shared/openapi_file.js";
import { buildSmitheryServerCard } from "./mcp_server_card.js";
import {
  listRecentRecordActivity,
  parseRecordActivityTypesQuery,
} from "./services/recent_record_activity.js";
import {
  getRecentConversationById,
  listRecentConversations,
} from "./services/recent_conversations.js";
import { listConversationTurns, getConversationTurn } from "./services/conversation_turn.js";
import { buildComplianceScorecard } from "./services/compliance/scorecard.js";
import { getAgent, listAgentRecords, listAgents } from "./services/agents_directory.js";
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
// SECURITY: CSP tightened per docs/reports/security_audit_2026_04_22.md S-9.
// Operators who need to broaden connectSrc (e.g. self-hosted API at a
// different origin) can set NEOTOMA_CSP_CONNECT_SRC to a comma-separated list.
const extraConnectSrc = (process.env.NEOTOMA_CSP_CONNECT_SRC || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
        connectSrc: ["'self'", ...extraConnectSrc],
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
  origin: process.env.NEOTOMA_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:5195",
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
// Capture raw body for AAuth HTTP Message Signature verification. The JSON
// parser's `verify` hook runs before the body is consumed, so we can stash a
// Buffer on `req.rawBody` without affecting downstream handlers that read
// `req.body` as parsed JSON. See src/middleware/aauth_verify.ts.
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  })
);
app.use(morgan("dev"));
app.use(cookieParser());
app.use(unknownFieldsGuard);

// Sandbox-mode response header. Stamped on every response so clients can
// detect public-sandbox deployments (sandbox.neotoma.io) without an extra
// API call. See src/services/sandbox_mode.ts.
if (isSandboxMode()) {
  app.use(sandboxHeaderMiddleware);
  logger.info(
    "[Sandbox] NEOTOMA_SANDBOX_MODE=1 — bearer bypass to SANDBOX_PUBLIC_USER_ID, destructive routes gated, weekly reset expected"
  );
}

// Inspector SPA mount. Deliberately registered before all auth / rate-limit
// middleware so the SPA shell + assets are reachable without a bearer — the
// API calls the Inspector makes still flow through the normal auth stack below.
installInspectorMount(app, process.env, logger);

// ── Sandbox session endpoints ───────────────────────────────────────────
// Registered before general auth so the session handshake works for
// unauthenticated visitors. Routes exist only when NEOTOMA_SANDBOX_MODE=1.
if (isSandboxMode()) {
  const sessionRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip || "")}`,
    validate: { trustProxy: false } as never,
  });

  app.post("/sandbox/session/new", sessionRateLimit, (req, res) => {
    try {
      const packId = typeof req.body?.pack_id === "string" ? req.body.pack_id : "generic";
      const session = createSandboxSession(packId);
      res.cookie(SESSION_COOKIE_NAME, session.bearerToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: new Date(session.expiresAt),
      });
      res.json({
        one_time_code: session.oneTimeCode,
        expires_at: session.expiresAt,
        pack_id: session.packId,
      });
    } catch (err) {
      logger.error(`[Sandbox] session/new failed: ${(err as Error).message}`);
      res
        .status(500)
        .json({ error_code: "SESSION_CREATE_FAILED", message: (err as Error).message });
    }
  });

  app.post("/sandbox/session/redeem", (req, res) => {
    try {
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      if (!code) {
        res.status(400).json({ error_code: "MISSING_CODE", message: "code is required" });
        return;
      }
      const result = redeemOneTimeCode(code);
      if (!result) {
        res
          .status(404)
          .json({ error_code: "INVALID_CODE", message: "Code expired or already redeemed" });
        return;
      }
      res.cookie(SESSION_COOKIE_NAME, result.bearerToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: new Date(result.expiresAt),
      });
      res.json({
        bearer_token: result.bearerToken,
        user_id: result.userId,
        expires_at: result.expiresAt,
        pack_id: result.packId,
      });
    } catch (err) {
      logger.error(`[Sandbox] session/redeem failed: ${(err as Error).message}`);
      res
        .status(500)
        .json({ error_code: "SESSION_REDEEM_FAILED", message: (err as Error).message });
    }
  });

  app.get("/sandbox/session", (req, res) => {
    const session = resolveSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error_code: "NO_SESSION", message: "No active sandbox session" });
      return;
    }
    res.json({
      user_id: session.userId,
      pack_id: session.packId,
      created_at: session.createdAt,
      expires_at: session.expiresAt,
    });
  });

  app.post("/sandbox/session/reset", (req, res) => {
    const session = resolveSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error_code: "NO_SESSION", message: "No active sandbox session" });
      return;
    }
    const packId = typeof req.body?.pack_id === "string" ? req.body.pack_id : undefined;
    purgeSessionUserData(session.userId);
    const newSession = createSandboxSession(packId ?? session.packId);
    res.cookie(SESSION_COOKIE_NAME, newSession.bearerToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(newSession.expiresAt),
    });
    res.json({
      user_id: newSession.userId,
      pack_id: newSession.packId,
      expires_at: newSession.expiresAt,
    });
  });

  app.delete("/sandbox/session", (req, res) => {
    const session = resolveSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error_code: "NO_SESSION", message: "No active sandbox session" });
      return;
    }
    revokeSession(session.userId);
    purgeSessionUserData(session.userId);
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  setInterval(
    () => {
      const purged = sweepExpiredSessions();
      if (purged > 0) {
        logger.info(`[Sandbox] Swept ${purged} expired session(s)`);
      }
    },
    15 * 60 * 1000
  );

  logger.info("[Sandbox] Session endpoints registered");
}

// Rate limiters for OAuth endpoints
// validate.trustProxy: false — we use trust proxy behind one proxy; skip strict IP check
const rateLimitOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false } as const,
};

// SECURITY: timing-safe equality for short operator-controlled tokens.
// Plain `===` leaks token length and prefix matches via response time.
// See docs/reports/security_audit_2026_04_22.md S-13.
function safeCompareTokens(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// SECURITY: write-path rate limiting (docs/reports/
// security_audit_2026_04_22.md S-8). Keyed by authenticated user when
// available so a single abusive client does not starve others. Operators
// can tune with NEOTOMA_WRITE_RATE_LIMIT_PER_MIN.
const WRITE_RATE_LIMIT_PER_MIN = Math.max(
  1,
  Number.parseInt(process.env.NEOTOMA_WRITE_RATE_LIMIT_PER_MIN || "", 10) || 120
);
const writeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: WRITE_RATE_LIMIT_PER_MIN,
  keyGenerator: (req) => {
    const userId =
      ((req as express.Request & { authenticatedUserId?: string }).authenticatedUserId as
        | string
        | undefined) || "";
    if (userId) return `u:${userId}`;
    // Use the library-provided IPv6-safe key helper; keying directly on
    // req.ip lets IPv6 callers rotate the low-64 bits to bypass limits.
    return `ip:${ipKeyGenerator(req.ip || "")}`;
  },
  message: "Write rate limit exceeded, please slow down",
  ...rateLimitOptions,
});

// SECURITY: guest-capable write routes (issue submission / thread append,
// subscribe / unsubscribe) should not share the broader `/store` bucket.
// Key by cryptographic guest identity first, then scoped guest token, then IP.
const GUEST_WRITE_RATE_LIMIT_PER_MIN = Math.max(
  1,
  Number.parseInt(process.env.NEOTOMA_GUEST_WRITE_RATE_LIMIT_PER_MIN || "", 10) || 30
);

// SECURITY: sandbox write paths share a single user_id, so keying only by
// user starves legitimate callers when one IP abuses the endpoint. Sandbox
// rate limiter keys by IP so each visitor gets their own bucket, and uses a
// tighter per-minute cap tuned for the `sandbox.neotoma.io` demo.
const SANDBOX_WRITE_RATE_LIMIT_PER_MIN = Math.max(
  1,
  Number.parseInt(process.env.NEOTOMA_SANDBOX_WRITE_RATE_LIMIT_PER_MIN || "", 10) || 30
);
const sandboxWriteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: SANDBOX_WRITE_RATE_LIMIT_PER_MIN,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip || "")}`,
  message: "Sandbox write rate limit exceeded. Install Neotoma locally for unlimited use.",
  ...rateLimitOptions,
});

/**
 * Sandbox-only middleware. Applies the tighter sandbox write rate limit +
 * destructive-op gate before every write-adjacent handler runs. Skipped on
 * non-sandbox deployments so local/dev Fly behaviour is unchanged.
 */
function sandboxWriteGate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!isSandboxMode()) return next();
  sandboxDestructiveGuard(req, res, (destructiveErr?: unknown) => {
    if (destructiveErr) return next(destructiveErr);
    if (res.headersSent) return;
    // Only POST/PUT/PATCH/DELETE hit the write bucket.
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return sandboxWriteRateLimit(req, res, next);
    }
    next();
  });
}
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
// Root landing page + robots.txt (no-auth, content-negotiated)
// ============================================================================
// HTML for browsers (identity, harness connect snippets, Learn index).
// JSON for agents/curl (same content, structured). See
// src/services/root_landing/index.ts.
app.get("/", (req, res) => {
  try {
    const ctx = buildLandingContext(req);
    res.setHeader("Cache-Control", "public, max-age=60");
    if (acceptWantsHtml(req.headers.accept)) {
      return res.type("html").send(buildRootLandingHtml(ctx));
    }
    if (acceptWantsMarkdown(req.headers.accept)) {
      res.type("text/markdown; charset=utf-8");
      return res.send(buildRootLandingMarkdown(ctx));
    }
    return res.type("application/json").json(buildRootLandingJson(ctx));
  } catch (err) {
    logger.error("[RootLanding] Failed to render landing page", { err });
    return res
      .status(500)
      .type("application/json")
      .json({
        error: "root_landing_error",
        error_description: (err as Error).message,
      });
  }
});

app.get("/robots.txt", (req, res) => {
  try {
    const ctx = buildLandingContext(req);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.type("text/plain").send(buildRobotsTxt(ctx.mode, ctx.publicDocsUrl));
  } catch (err) {
    logger.error("[RootLanding] Failed to render robots.txt", { err });
    return res.status(500).type("text/plain").send("# error rendering robots.txt\n");
  }
});

// Smithery / MCP registry static metadata when automatic scan cannot finish (same host as /mcp)
app.get("/.well-known/mcp/server-card.json", (_req, res) => {
  const override = process.env.NEOTOMA_MCP_SERVER_CARD_JSON?.trim();
  if (override) {
    try {
      const parsed = JSON.parse(override) as Record<string, unknown>;
      res.type("application/json");
      return res.json(parsed);
    } catch {
      return res.status(500).type("application/json").json({
        error: "invalid_server_card_json",
        error_description: "NEOTOMA_MCP_SERVER_CARD_JSON is not valid JSON",
      });
    }
  }
  res.type("application/json");
  res.json(buildSmitheryServerCard());
});

// ============================================================================
// OAuth discovery (RFC 8414 / MCP Authorization) for Cursor and other clients
// ============================================================================

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.header("host");
  const proto = forwardedProto || req.protocol || "http";
  const base = host ? `${proto}://${host}` : config.apiBase;
  logger.info("[MCP OAuth] Discovery request received", {
    host: req.header("host") ?? null,
    resolved_base: base,
    user_agent: req.header("user-agent") ?? null,
  });
  res.setHeader("Content-Type", "application/json");
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/mcp/oauth/authorize`,
    token_endpoint: `${base}/mcp/oauth/token`,
    registration_endpoint: `${base}/mcp/oauth/register`,
    scopes_supported: ["openid", "email"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

app.get("/.well-known/oauth-protected-resource", async (req, res) => {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.header("host");
  const proto = forwardedProto || req.protocol || "http";
  const base = host ? `${proto}://${host}` : config.apiBase;
  logger.info("[MCP OAuth] Protected resource metadata request received", {
    host: req.header("host") ?? null,
    resolved_base: base,
    has_authorization: Boolean(
      (req.headers["authorization"] || req.headers["Authorization"]) as string | undefined
    ),
    has_connection_id: Boolean(req.headers["x-connection-id"] || req.headers["X-Connection-Id"]),
  });
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
      const wwwAuth = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", error="invalid_token", error_description="Connection invalid or expired. Remove X-Connection-Id from mcp.json and click Connect to re-authenticate."`;
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
      `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({
      error: "Unauthorized: Authentication required",
    });
  }

  res.setHeader("Content-Type", "application/json");
  res.json({
    authorization_servers: [base],
  });
});

// AAuth resource server metadata. Exposed publicly so AAuth client libraries
// can auto-configure issuer / supported algs / signature window without an
// out-of-band conversation. Neotoma is verifier-only: it never hosts agent
// JWKs, so jwks_uri is null and agents convey their public keys per-request
// via the Signature-Key header (with thumbprint binding via the jkt claim).
// See docs/proposals/agent-trust-framework.md and src/middleware/aauth_verify.ts.
app.get("/.well-known/aauth-resource.json", (_req, res) => {
  const authorityHost = canonicalAauthAuthority();
  const issuer = authorityHost.startsWith("http") ? authorityHost : `https://${authorityHost}`;
  res.setHeader("Content-Type", "application/json");
  res.json({
    issuer,
    client_name: "Neotoma",
    signature_window: 60,
    supported_algs: ["ES256", "EdDSA"],
    supported_typ: ["aa-agent+jwt"],
    jwks_uri: null,
    jwks_uri_reason:
      "Neotoma is verifier-only; agent JWKs are conveyed per-request via the Signature-Key header (with thumbprint binding via the jkt claim).",
  });
});

// Server info endpoint (no-auth) - exposes server port for MCP configuration
// When NEOTOMA_MCP_PROXY_URL or MCP_PROXY_URL is set (e.g. ngrok tunnel), mcpUrl uses it so "Add to Cursor" uses the proxy.
app.get("/server-info", (_req, res) => {
  const httpPortEnv = process.env.NEOTOMA_HTTP_PORT || process.env.HTTP_PORT;
  const httpPort = httpPortEnv ? parseInt(httpPortEnv, 10) : config.httpPort || 3080;
  const mcpBase = process.env.NEOTOMA_MCP_PROXY_URL || process.env.MCP_PROXY_URL || config.apiBase;
  const base = mcpBase.replace(/\/$/, "");
  const mcpUrl = base.endsWith("/mcp") ? base : `${base}/mcp`;
  res.json({
    httpPort,
    apiBase: config.apiBase,
    mcpUrl,
    neotoma_env: readNeotomaConfigEnvironment(),
  });
});

app.get("/mcp-interaction-instructions", (_req, res) => {
  const instructionsPath = path.join(
    config.projectRoot,
    "docs",
    "developer",
    "mcp",
    "instructions.md"
  );
  try {
    const raw = fs.readFileSync(instructionsPath, "utf-8");
    const match = raw.match(/```\s*\n?([\s\S]*?)```/);
    if (match && match[1]) {
      const text = match[1].trim();
      if (text) {
        res.type("text/plain").send(text);
        return;
      }
    }
  } catch {
    // fall through to 404
  }
  res.status(404).json({ error: "instructions_not_found" });
});

// ============================================================================
// MCP StreamableHTTP Endpoint (OAuth-enabled MCP transport)
// ============================================================================

// Store MCP transports by session ID
const mcpTransports = new Map<string, StreamableHTTPServerTransport>();
// Store server instances by session ID to preserve authentication state
const mcpServerInstances = new Map<string, NeotomaServer>();

function isLoopbackAddress(value: string | undefined): boolean {
  const remote = (value || "").trim().toLowerCase();
  if (!remote) return false;
  if (remote === "127.0.0.1" || remote === "::1") return true;
  if (remote.startsWith("127.")) return true;
  if (remote.startsWith("::ffff:127.")) return true;
  return false;
}

/**
 * Parse NEOTOMA_TRUSTED_PROXY_IPS into an array of IP/CIDR strings.
 * Accepts comma-separated values. Returns empty array when unset.
 */
function parseTrustedProxyIPs(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.NEOTOMA_TRUSTED_PROXY_IPS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns true when the given IP is within the configured NEOTOMA_TRUSTED_PROXY_IPS.
 * Supports exact IPv4 match, IPv4 /8–/32 CIDR notation, and ::ffff:<ipv4> mapped addresses.
 * When NEOTOMA_TRUSTED_PROXY_IPS is not set this always returns false.
 */
export function isTrustedProxyIP(ip: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const candidates = parseTrustedProxyIPs(env);
  if (candidates.length === 0) return false;

  // Strip IPv4-mapped IPv6 prefix for comparison
  const normalized = ip.trim().replace(/^::ffff:/i, "");

  for (const candidate of candidates) {
    if (candidate === normalized || candidate === ip.trim()) return true;

    // Simple IPv4 CIDR check (covers the common case: 100.64.0.0/10 for Cloudflare Tunnel egress)
    const slashIdx = candidate.indexOf("/");
    if (slashIdx !== -1) {
      const cidrBase = candidate.slice(0, slashIdx);
      const prefixLen = parseInt(candidate.slice(slashIdx + 1), 10);
      if (!isNaN(prefixLen) && prefixLen >= 0 && prefixLen <= 32) {
        const ipParts = normalized.split(".").map(Number);
        const cidrParts = cidrBase.split(".").map(Number);
        if (ipParts.length === 4 && cidrParts.length === 4) {
          const ipNum =
            ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
          const cidrNum =
            ((cidrParts[0] << 24) | (cidrParts[1] << 16) | (cidrParts[2] << 8) | cidrParts[3]) >>>
            0;
          const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
          if ((ipNum & mask) === (cidrNum & mask)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Redact an IP for log output. IPv4 is shown as `a.b.c.x/24`; IPv6 as `a:b::/48`.
 * Set NEOTOMA_DEBUG_TUNNEL=1 in the operator environment to bypass redaction
 * and surface the full address. Raw client IPs are PII; the default log path
 * MUST NOT emit them. See docs/subsystems/privacy.md.
 */
function redactIpForLog(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    return parts.slice(0, 3).join(":") + "::/48";
  }
  const v4 = trimmed.split(".");
  if (v4.length === 4) {
    return `${v4[0]}.${v4[1]}.${v4[2]}.x/24`;
  }
  return "<redacted>";
}

function forwardedForValues(req: express.Request): string[] {
  const raw = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env.NEOTOMA_ENV || "development").trim().toLowerCase();
  return value === "production" || value === "prod";
}

/**
 * True when the request is genuinely local to this process.
 *
 * SECURITY: a same-host reverse proxy (Caddy, nginx, Cloudflare tunnel, etc.)
 * connects to Node over loopback even for public internet callers. In
 * production, loopback alone is therefore not enough to grant local-dev auth.
 *
 * NEOTOMA_TRUSTED_PROXY_IPS: comma-separated list of IPs or IPv4 CIDRs whose
 * XFF entries are trusted and do not disqualify a loopback-socket request from
 * being considered local. Use this for tunnel setups where cloudflared (or
 * similar) injects a non-loopback XFF entry that represents a controlled
 * internal hop, not a public internet caller.
 *
 * The XFF IP that cloudflared injects depends on its forwarding mode:
 * - Warp / CGNAT mode: typically 100.64.x.x (CGNAT range, NEOTOMA_TRUSTED_PROXY_IPS=100.64.0.0/10)
 * - Passthrough mode: the upstream client IP (Vercel egress, CDN edge, etc.)
 *
 * To find the actual IP: start the server, make a request through the tunnel,
 * and check Neotoma stderr for "isLocalRequest rejected: XFF contains <ip>".
 * Set NEOTOMA_TRUSTED_PROXY_IPS to that IP or its enclosing CIDR.
 *
 * NEOTOMA_TRUSTED_PROXY_IPS and NEOTOMA_TRUST_PROD_LOOPBACK=1 are independent
 * and can coexist. NEOTOMA_TRUST_PROD_LOOPBACK=1 bypasses the XFF check
 * entirely and remains valid for single-host deployments without a tunnel.
 */
export function isLocalRequest(req: express.Request): boolean {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;

  const forwardedFor = forwardedForValues(req);
  if (forwardedFor.length > 0) {
    // A forwarded-for entry disqualifies the request as local unless every
    // entry is either a loopback address or an explicitly trusted proxy IP.
    if (forwardedFor.every((ip) => isLoopbackAddress(ip) || isTrustedProxyIP(ip))) {
      return true;
    }
    const untrusted = forwardedFor.filter((ip) => !isLoopbackAddress(ip) && !isTrustedProxyIP(ip));
    const debugTunnel = process.env.NEOTOMA_DEBUG_TUNNEL === "1";
    const displayed = debugTunnel ? untrusted.join(", ") : untrusted.map(redactIpForLog).join(", ");
    process.stderr.write(
      `[neotoma] isLocalRequest: loopback socket rejected because XFF contains untrusted IP(s): ${displayed}. ` +
        `Set NEOTOMA_TRUSTED_PROXY_IPS to trust these addresses` +
        (debugTunnel ? "" : " (set NEOTOMA_DEBUG_TUNNEL=1 to see full IPs)") +
        `.\n`
    );
    return false;
  }

  if (isProductionEnvironment() && process.env.NEOTOMA_TRUST_PROD_LOOPBACK === "1") {
    return true;
  }

  return !isProductionEnvironment();
}

const OAUTH_KEY_SESSION_COOKIE = "neotoma_oauth_key_session";
const oauthKeySessions = new OAuthKeySessionStore();

function readCookie(req: express.Request, name: string): string | undefined {
  const header = (req.headers["cookie"] || req.headers["Cookie"] || "") as string;
  if (!header) return undefined;
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    if (key !== name) continue;
    return decodeURIComponent(part.slice(eq + 1));
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOauthPage(params: {
  title: string;
  subtitle?: string;
  contentHtml: string;
}): string {
  const subtitle = params.subtitle ? `<p class="subtitle">${escapeHtml(params.subtitle)}</p>` : "";
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
    <style>
      :root {
        color-scheme: light dark;
        --background: 38 22% 98%;
        --foreground: 28 22% 18%;
        --card: 35 20% 96%;
        --card-foreground: 28 22% 18%;
        --primary: 12 48% 38%;
        --primary-foreground: 0 0% 100%;
        --muted: 35 18% 94%;
        --muted-foreground: 28 14% 44%;
        --border: 32 18% 88%;
        --input: 32 18% 88%;
        --ring: 12 48% 38%;
        --radius: 0.5rem;
      }
      body {
        margin: 0;
        font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 0.8125rem;
        line-height: 1.6;
        background: hsl(var(--background));
        color: hsl(var(--foreground));
      }
      .wrap {
        max-width: 860px;
        margin: 48px auto;
        padding: 0 16px;
      }
      .card {
        background: hsl(var(--card));
        color: hsl(var(--card-foreground));
        border: 1px solid hsl(var(--border));
        border-radius: var(--radius);
        box-shadow: 0 10px 28px rgba(52, 35, 26, 0.08);
        padding: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.75rem;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }
      .subtitle {
        margin: 0 0 20px;
        color: hsl(var(--muted-foreground));
        font-size: 15px;
      }
      .tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .tab-btn {
        border: 1px solid hsl(var(--border));
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 14px;
        cursor: pointer;
      }
      .tab-btn.active {
        background: hsl(var(--primary));
        border-color: hsl(var(--primary));
        color: hsl(var(--primary-foreground));
      }
      .tab-panel {
        display: none;
      }
      .tab-panel.active {
        display: block;
      }
      .row {
        margin-bottom: 12px;
      }
      label {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        font-weight: 600;
      }
      input, textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid hsl(var(--input));
        border-radius: calc(var(--radius) - 2px);
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        padding: 10px 12px;
        font-size: 14px;
        font-family: inherit;
      }
      textarea {
        min-height: 96px;
        resize: vertical;
      }
      input:focus-visible, textarea:focus-visible, .tab-btn:focus-visible, button:focus-visible, .btn-link:focus-visible {
        outline: 2px solid hsl(var(--ring));
        outline-offset: 1px;
      }
      .help {
        margin: 6px 0 0;
        color: hsl(var(--muted-foreground));
        font-size: 13px;
      }
      .notice {
        margin-top: 14px;
        padding: 10px 12px;
        border: 1px solid hsl(32 85% 75%);
        background: hsl(35 20% 95%);
        color: hsl(24 55% 32%);
        border-radius: calc(var(--radius) - 2px);
        font-size: 13px;
      }
      .actions {
        margin-top: 16px;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      button, .btn-link {
        border: 0;
        border-radius: calc(var(--radius) - 2px);
        padding: 10px 14px;
        font-size: 14px;
        cursor: pointer;
        font-weight: 600;
        background: hsl(var(--primary));
        color: hsl(var(--primary-foreground));
        text-decoration: none;
      }
      .btn-link.secondary {
        border: 1px solid hsl(var(--border));
        background: hsl(var(--muted));
        color: hsl(var(--foreground));
      }
      code {
        font-family: "JetBrains Mono", "Fira Code", "Roboto Mono", "Courier New", monospace;
        font-size: 0.8125rem;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --background: 222 47% 11%;
          --foreground: 210 40% 95%;
          --card: 217 33% 18%;
          --card-foreground: 210 40% 95%;
          --primary: 217 91% 60%;
          --primary-foreground: 0 0% 100%;
          --muted: 217 33% 25%;
          --muted-foreground: 215 20% 65%;
          --border: 217 33% 25%;
          --input: 217 33% 25%;
          --ring: 217 91% 60%;
        }
        body {
          background: hsl(var(--background));
          color: hsl(var(--foreground));
        }
        .card {
          background: hsl(var(--card));
          border-color: hsl(var(--border));
          box-shadow: none;
        }
        .notice {
          border-color: hsl(32 65% 32%);
          background: hsl(24 34% 20%);
          color: hsl(42 95% 72%);
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${escapeHtml(params.title)}</h1>
        ${subtitle}
        ${params.contentHtml}
      </div>
    </div>
  </body>
</html>`;
}

function hasValidOAuthKeySession(req: express.Request): boolean {
  const token = readCookie(req, OAUTH_KEY_SESSION_COOKIE);
  return oauthKeySessions.isValid(token);
}

function setOAuthKeySessionCookie(req: express.Request, res: express.Response): void {
  const token = oauthKeySessions.create();
  const forwardedProto =
    ((req.headers["x-forwarded-proto"] || req.headers["X-Forwarded-Proto"]) as string | undefined)
      ?.split(",")[0]
      ?.trim()
      ?.toLowerCase() || "";
  const secure = req.secure || req.protocol === "https" || forwardedProto === "https";
  res.cookie(OAUTH_KEY_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/mcp/oauth",
    maxAge: 15 * 60 * 1000,
  });
}

/**
 * Derive the canonical `@authority` the AAuth profile requires (AAuth §10.3.1).
 * We trust explicit configuration first, then fall back to the host the
 * process is actually listening on. We must NOT trust `Host:` headers from
 * the request path — an attacker could smuggle signatures authored against
 * a different authority. See src/middleware/aauth_verify.ts.
 */
export function canonicalAauthAuthority(): string {
  const explicit = process.env.NEOTOMA_AAUTH_AUTHORITY?.trim();
  if (explicit) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(explicit)) {
      try {
        const url = new URL(explicit);
        return url.host;
      } catch {
        return explicit;
      }
    }
    return explicit;
  }
  const publicBase = process.env.NEOTOMA_PUBLIC_BASE_URL?.trim();
  if (publicBase) {
    try {
      return new URL(publicBase).host;
    } catch {
      // Keep falling through to apiBase; malformed env should not break boot.
    }
  }
  try {
    const url = new URL(config.apiBase);
    return url.host;
  } catch {
    return "localhost";
  }
}

// AAuth middleware — runs before every handler so `req.aauth` is populated
// uniformly across HTTP surfaces. Non-blocking by design (see middleware
// docstring), so OAuth, bearer-token, and unauthenticated clients keep
// flowing through unchanged. Mounted on `/` (instead of the narrower
// per-route list used previously) so direct-write endpoints like `/store`,
// `/observations/create`, `/create_relationship`, and `/correct` honour
// AAuth headers with the same semantics as the MCP handler. See
// `docs/subsystems/agent_attribution_integration.md` for the full matrix.
app.use(
  aauthVerify({
    authority: canonicalAauthAuthority(),
    verbose: process.env.NEOTOMA_AAUTH_VERBOSE === "1",
  })
);

// Thread the resolved agent identity into the per-request
// `AsyncLocalStorage` context for every request. `attributionContext` is
// purely wiring — write-path services call `enforceAttributionPolicy` to
// turn the identity into a policy decision. Routes that resolve a richer
// server-level identity (the MCP HTTP handler is the canonical example)
// may nest a more specific `runWithRequestContext` — nested scopes
// shadow outer ones exactly as intended.
app.use(attributionContext());

// Stronger AAuth Admission plan: resolve verified AAuth identities to
// `agent_grant` entities and stamp `req.aauthAdmission` /
// `req.authenticatedUserId`. Runs after attributionContext so the
// admission middleware can nest a richer request context (admission +
// identity) for downstream guards. Cheap public discovery routes are
// short-circuited inside the middleware.
app.use(aauthAdmission());

// MCP StreamableHTTP endpoint (GET, POST, DELETE)
// This endpoint enables Cursor's "Connect" button for OAuth authentication
app.all("/mcp", async (req, res) => {
  try {
    const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || req.header("host");
    const proto = forwardedProto || req.protocol || "http";
    const base = host ? `${proto}://${host}` : config.apiBase;
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
    let bearerValidated = false;

    // Key-derived Bearer token is accepted whenever a key source is configured (regardless of
    // NEOTOMA_ENCRYPTION_ENABLED). This lets tunnel setups authenticate via `neotoma auth mcp-token`
    // without enabling full data-at-rest encryption.
    const mcpExpectedToken = getMcpAuthToken();
    if (authHeader?.startsWith("Bearer ") && mcpExpectedToken) {
      const token = authHeader.slice(7).trim();
      if (safeCompareTokens(token, mcpExpectedToken)) {
        req.headers["x-connection-id"] = "dev-local";
        connectionIdHeader = "dev-local";
        bearerValidated = true;
      }
    }

    if (config.encryption.enabled) {
      // Encryption on: only key-derived Bearer is accepted; no further no-Bearer paths.
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
        if (safeCompareTokens(token, process.env.NEOTOMA_BEARER_TOKEN)) {
          req.headers["x-connection-id"] = "dev-local";
          connectionIdHeader = "dev-local";
          bearerValidated = true;
        }
      }
      if (authHeader?.startsWith("Bearer ") && !bearerValidated && !connectionIdHeader) {
        try {
          const token = authHeader.slice(7).trim();
          const { validateTokenAndGetConnectionId } = await import("./services/mcp_oauth.js");
          const { connectionId } = await validateTokenAndGetConnectionId(token);
          req.headers["x-connection-id"] = connectionId;
          connectionIdHeader = connectionId;
          bearerValidated = true;
        } catch {
          logger.info("[MCP HTTP] Invalid or expired Bearer token. Returning 401 invalid_token.");
          const desc =
            "Invalid or expired Bearer token. Remove Authorization from mcp.json and click Connect to re-authenticate.";
          const wwwAuthHeader = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", error="invalid_token", error_description="${desc}"`;
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
    }

    // Stronger AAuth Admission: a verified AAuth identity that resolves
    // to an active `agent_grant` for some user is a valid remote auth
    // path. Bearer / OAuth / X-Connection-Id remain fully supported.
    const aauthAdmissionForRequest = getAAuthAdmissionFromRequest(req);
    const aauthAdmitted = !!(aauthAdmissionForRequest && aauthAdmissionForRequest.admitted);
    const hasAuth = !!(bearerValidated || connectionIdHeader || aauthAdmitted);

    // When encryption is on, only the key-derived token is accepted
    if (config.encryption.enabled && connectionIdHeader !== "dev-local") {
      const wwwAuthHeader = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`;
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
      const wwwAuthHeader = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`;
      res.setHeader("WWW-Authenticate", wwwAuthHeader);
      const unauthMessage = config.requireKeyForOauth
        ? "Unauthorized: Authentication required (key-authenticated OAuth or Bearer token)."
        : "Unauthorized: Authentication required";

      // For POST requests with JSON-RPC body, return JSON-RPC error format
      if (req.method === "POST" && req.body && typeof req.body === "object") {
        return res.status(401).json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: unauthMessage,
          },
          id: req.body?.id ?? null,
        });
      }
      // For GET/DELETE requests, return simple 401
      return res.status(401).json({
        error: unauthMessage,
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
        const wwwAuthHeader = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", error="invalid_token", error_description="${desc}"`;
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
    let serverInstance: NeotomaServer | undefined = sessionId
      ? mcpServerInstances.get(sessionId)
      : undefined;

    if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
      // Create new server instance for each session to ensure clean auth state
      // This ensures OAuth flow is required for each new connection
      serverInstance = new NeotomaServer();
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
            mcpServerInstances.set(sid, serverInstance!);
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
      const rpcId =
        req.body &&
        typeof req.body === "object" &&
        !Array.isArray(req.body) &&
        "id" in req.body &&
        (typeof (req.body as { id: unknown }).id === "string" ||
          typeof (req.body as { id: unknown }).id === "number")
          ? (req.body as { id: string | number }).id
          : null;
      const hadSessionHeader = typeof sessionId === "string" && sessionId.length > 0;
      if (hadSessionHeader) {
        logger.warn(
          `[MCP HTTP] Unknown or expired Mcp-Session-Id (first 8 chars): ${sessionId!.slice(0, 8)}... often wrong replica behind a load balancer, API restart, or stale client state`
        );
        return res.status(503).json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message:
              "Service Unavailable: MCP session is unknown on this API instance. If you run multiple replicas, enable sticky sessions for POST /mcp (or route /mcp to a single instance). Otherwise restart the MCP client so initialize runs again after a server restart.",
          },
          id: rpcId,
        });
      }
      return res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Bad Request: No MCP session on this request. Send an initialize JSON-RPC message first, then include the mcp-session-id response header on every subsequent POST.",
        },
        id: rpcId,
      });
    }

    // Thread AAuth / clientInfo fallback attribution into the server for
    // this request. On reused sessions the clientInfo was captured at
    // initialize time; we still refresh the AAuth context since each POST
    // may carry its own signature (Phase 1.4).
    const aauthContext = getAAuthContextFromRequest(req);
    if (serverInstance) {
      serverInstance.setSessionAgentIdentity(aauthContext);
    }

    // Build the provenance attribution to propagate via AsyncLocalStorage so
    // write-path services (observations, relationships, sources, …) stamp
    // every row with the resolved identity without plumbing through call
    // sites. The server instance is the authoritative source since it also
    // knows the clientInfo from initialize. Fall back to a request-scoped
    // identity when no server instance is available yet (pre-init POSTs
    // never actually reach this branch, but defense in depth).
    const connectionIdHeaderForCtx =
      req.headers["x-connection-id"] || req.headers["X-Connection-Id"];
    const fallbackIdentity = (() => {
      if (serverInstance) return serverInstance.getAgentIdentity();
      const connId = Array.isArray(connectionIdHeaderForCtx)
        ? connectionIdHeaderForCtx[0]
        : connectionIdHeaderForCtx;
      if (!aauthContext && !connId) return null;
      return buildAgentIdentity({
        publicKey: aauthContext?.publicKey,
        thumbprint: aauthContext?.thumbprint,
        algorithm: aauthContext?.algorithm,
        sub: aauthContext?.sub,
        iss: aauthContext?.iss,
        clientName: normaliseClientName(undefined),
        connectionId: typeof connId === "string" ? connId : undefined,
      });
    })();

    // Handle request with the transport inside the attribution context.
    const attributionDecision = getAttributionDecisionFromRequest(req);
    await runWithRequestContext({ agentIdentity: fallbackIdentity, attributionDecision }, () =>
      transport!.handleRequest(req, res, req.body)
    );
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
  "refresh_token",
  "refreshToken",
  "id_token",
  "idToken",
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
  "mnemonic",
  "private_key",
  "privateKey",
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
  console.debug(formatRequestLogLine("DEBUG", event, safe));
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
  console.warn(formatRequestLogLine("WARN", event, safe));
}

function sanitizeRedirectUriForLog(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

function logError(
  event: string,
  req: express.Request,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  // SECURITY: stacks are gated on development. Production log sinks are often
  // shared with lower-trust consumers; keeping stacks there leaks file paths
  // and internal structure. Operators who need stacks can set
  // NEOTOMA_LOG_STACKS=1. See docs/reports/security_audit_2026_04_22.md S-5.
  const includeStacks =
    config.environment !== "production" ||
    process.env.NEOTOMA_LOG_STACKS === "1" ||
    process.env.NEOTOMA_LOG_STACKS === "true";
  const payload = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            ...(includeStacks ? { stack: error.stack } : {}),
          }
        : redactSensitiveFields(error),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.error(formatRequestLogLine("ERROR", event, payload));
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

type ZodValidationIssueLike = {
  code?: string;
  message?: string;
  path?: Array<string | number>;
  params?: {
    code?: string;
    hint?: string;
  };
};

function getRelationshipEntityIdFormatIssues(issues: unknown): ZodValidationIssueLike[] {
  if (!Array.isArray(issues)) {
    return [];
  }
  return issues.filter((issue): issue is ZodValidationIssueLike => {
    if (!issue || typeof issue !== "object") {
      return false;
    }
    const params = (issue as ZodValidationIssueLike).params;
    return (
      params?.code === RELATIONSHIP_ENTITY_ID_FORMAT_ISSUE_CODE &&
      params?.hint === RELATIONSHIP_ENTITY_ID_FORMAT_HINT
    );
  });
}

function sendStoreValidationError(res: express.Response, issues: unknown): express.Response {
  const relationshipIdFormatIssues = getRelationshipEntityIdFormatIssues(issues);
  if (relationshipIdFormatIssues.length > 0) {
    return res.status(400).json({
      error: {
        code: "ERR_STORE_RESOLUTION_FAILED",
        message: "Structured store relationship validation failed.",
        issues: relationshipIdFormatIssues.map((issue) => ({
          code: RELATIONSHIP_ENTITY_ID_FORMAT_ISSUE_CODE,
          message: issue.message ?? "Relationship entity id format is invalid.",
          details: {
            path: issue.path ?? [],
          },
          hint: issue.params?.hint ?? RELATIONSHIP_ENTITY_ID_FORMAT_HINT,
        })),
      },
    });
  }
  return sendValidationError(res, issues);
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
  let version = "0.0.0";
  try {
    const pkgPath = path.join(config.projectRoot || process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    version = pkg.version || "0.0.0";
  } catch {
    // fallback
  }
  return res.json({ ok: true, version });
});

// ============================================================================
// Sandbox endpoints
//
// Public-read routes that power the Inspector's /sandbox page at
// sandbox.neotoma.io. These endpoints are mounted regardless of
// NEOTOMA_SANDBOX_MODE so a self-hosted Neotoma can still surface its own
// terms/report forms if operators want to.
// ============================================================================

app.get("/sandbox/terms", (_req, res) => {
  return res.json(getSandboxTermsResponse());
});

// Tight per-IP limiter for /sandbox/report so bots can't flood the forwarder.
const SANDBOX_REPORT_RATE_LIMIT_PER_MIN = Math.max(
  1,
  Number.parseInt(process.env.NEOTOMA_SANDBOX_REPORT_RATE_LIMIT_PER_MIN || "", 10) || 5
);
const sandboxReportRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: SANDBOX_REPORT_RATE_LIMIT_PER_MIN,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip || "")}`,
  message:
    "Sandbox report rate limit exceeded. Please wait a minute before submitting another report.",
  ...rateLimitOptions,
});

const VALID_REPORT_REASONS: ReadonlyArray<SandboxReportReason> = [
  "abuse",
  "pii_leak",
  "illegal_content",
  "spam",
  "bug",
  "other",
];

app.post("/sandbox/report", sandboxReportRateLimit, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Partial<{
      reason: string;
      description: string;
      entity_id: string;
      url: string;
      reporter_contact: string;
      metadata: Record<string, unknown>;
    }>;

    const reason = body.reason as SandboxReportReason | undefined;
    if (!reason || !VALID_REPORT_REASONS.includes(reason)) {
      return sendError(
        res,
        400,
        "VALIDATION_INVALID_FIELD",
        `reason must be one of: ${VALID_REPORT_REASONS.join(", ")}`
      );
    }
    const description = (body.description ?? "").toString().trim();
    if (!description) {
      return sendError(res, 400, "VALIDATION_MISSING_FIELD", "description is required");
    }

    const submitterIp = req.ip || "";
    const transport = resolveSandboxReportTransport();
    const result = await transport.submit(
      {
        reason,
        description,
        entity_id: body.entity_id,
        url: body.url,
        reporter_contact: body.reporter_contact,
        metadata: body.metadata,
      },
      submitterIp
    );
    return res.json(result);
  } catch (err) {
    logError("SandboxReportSubmit", req, err);
    return sendError(res, 500, "SANDBOX_REPORT_ERROR", (err as Error).message);
  }
});

app.get("/sandbox/report/status", async (req, res) => {
  try {
    const accessToken = (req.query.access_token || "").toString().trim();
    if (!accessToken) {
      return sendError(res, 400, "VALIDATION_MISSING_FIELD", "access_token is required");
    }
    const transport = resolveSandboxReportTransport();
    const result = await transport.status(accessToken);
    return res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (/not found/i.test(msg)) {
      return sendError(res, 404, "NOT_FOUND", msg);
    }
    logError("SandboxReportStatus", req, err);
    return sendError(res, 500, "SANDBOX_REPORT_ERROR", msg);
  }
});

// ============================================================================
// MCP OAuth Endpoints
// ============================================================================

// Initiate MCP OAuth flow
app.post("/mcp/oauth/initiate", oauthInitiateLimit, async (req, res) => {
  try {
    const { connection_id, client_name, redirect_uri } = req.body;

    if (!connection_id || typeof connection_id !== "string") {
      return sendError(res, 400, "VALIDATION_MISSING_FIELD", "connection_id is required");
    }

    const { initiateOAuthFlow } = await import("./services/mcp_oauth.js");

    // Tunnel preflight: warn when apiBase is localhost but request arrives via tunnel
    if (!isLocalRequest(req) && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(config.apiBase)) {
      logger.warn(
        `[MCP OAuth] Tunnel request detected but config.apiBase is ${config.apiBase}. ` +
          `OAuth callbacks may fail. Set NEOTOMA_HOST_URL to the tunnel URL or restart the server after the tunnel starts.`
      );
    }

    const frontendBase =
      process.env.NEOTOMA_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:5195";
    const finalRedirectUri =
      typeof redirect_uri === "string" && redirect_uri.length > 0
        ? redirect_uri
        : config.storageBackend === "local"
          ? `${frontendBase}/oauth`
          : `${config.apiBase}/mcp/oauth/callback`;
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
          hint: "Enable 'Allow Dynamic OAuth Apps' in auth server, or set NEOTOMA_OAUTH_CLIENT_ID in .env file",
        }),
      });
    }

    // Fallback for non-OAuth errors
    const isConfigError =
      error.message?.includes("client_id not configured") ||
      error.message?.includes("OAUTH_CLIENT_ID");
    const statusCode = isConfigError ? 400 : 500;

    return res.status(statusCode).json({
      error_code: isConfigError ? "OAUTH_CLIENT_REGISTRATION_FAILED" : "INTERNAL_ERROR",
      error: error.message,
      message: error.message,
      timestamp: new Date().toISOString(),
      ...(isConfigError && {
        hint: "Enable 'Allow Dynamic OAuth Apps' in auth server, or set NEOTOMA_OAUTH_CLIENT_ID in .env file",
      }),
    });
  }
});

// OAuth callback endpoint
app.get("/mcp/oauth/callback", oauthCallbackLimit, async (req, res) => {
  try {
    if (config.storageBackend === "local") {
      return res.status(400).send("Local OAuth callback is disabled. Use /mcp/oauth/local-login.");
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
    const frontendBase =
      process.env.NEOTOMA_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:5195";
    const successUrl = `${frontendBase}/oauth?connection_id=${encodeURIComponent(connectionId)}&status=success`;
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

    const frontendBaseForError =
      process.env.NEOTOMA_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:5195";
    const errorUrl = `${frontendBaseForError}/oauth?${params.toString()}`;
    return res.redirect(errorUrl);
  }
});

// RFC 8414 authorization endpoint (GET) for Cursor and other OAuth clients
app.get("/mcp/oauth/key-auth", async (req, res) => {
  if (!config.requireKeyForOauth) {
    const nextPath = normalizeOauthNextPath((req.query.next as string | undefined) || undefined);
    return res.redirect(nextPath);
  }

  const nextPath = normalizeOauthNextPath((req.query.next as string | undefined) || undefined);
  if (hasValidOAuthKeySession(req)) {
    return res.redirect(nextPath);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const nextPathEscaped = escapeHtml(nextPath);
  const hasBearerFallback = Boolean((process.env.NEOTOMA_BEARER_TOKEN || "").trim());
  const defaultCredentialMode = hasBearerFallback ? "bearer" : "private_key";
  return res.send(
    renderOauthPage({
      title: "Authenticate OAuth preflight",
      subtitle: "Choose one credential path below, then continue to complete OAuth authorization.",
      contentHtml: `
      <form method="post" action="/mcp/oauth/key-auth" id="oauth-key-auth-form">
        <input type="hidden" name="next" value="${nextPathEscaped}" />
        <input type="hidden" name="credential_mode" id="credential_mode" value="${defaultCredentialMode}" />
        <div class="tabs" role="tablist" aria-label="Credential paths">
          ${hasBearerFallback ? `<button type="button" class="tab-btn ${defaultCredentialMode === "bearer" ? "active" : ""}" data-tab="bearer">Bearer token</button>` : ""}
          <button type="button" class="tab-btn ${defaultCredentialMode === "private_key" ? "active" : ""}" data-tab="private_key">Private key hex</button>
          <button type="button" class="tab-btn" data-tab="mnemonic">Mnemonic</button>
        </div>

        <section class="tab-panel ${defaultCredentialMode === "private_key" ? "active" : ""}" data-panel="private_key">
          <div class="row">
            <label for="private_key_hex">Private key hex</label>
            <input id="private_key_hex" name="private_key_hex" type="password" autocomplete="off" />
            <p class="help">Use the same private key configured for this server.</p>
          </div>
        </section>

        <section class="tab-panel" data-panel="mnemonic">
          <div class="row">
            <label for="mnemonic">Mnemonic phrase</label>
            <textarea id="mnemonic" name="mnemonic" autocomplete="off"></textarea>
          </div>
          <div class="row">
            <label for="mnemonic_passphrase">Mnemonic passphrase (optional)</label>
            <input id="mnemonic_passphrase" name="mnemonic_passphrase" type="password" autocomplete="off" />
          </div>
        </section>

        ${
          hasBearerFallback
            ? `<section class="tab-panel ${defaultCredentialMode === "bearer" ? "active" : ""}" data-panel="bearer">
          <div class="row">
            <label for="bearer_token">Bearer token</label>
            <input id="bearer_token" name="bearer_token" type="password" autocomplete="off" />
            <p class="help">Useful for default/local-user setups using <code>NEOTOMA_BEARER_TOKEN</code>.</p>
          </div>
        </section>`
            : ""
        }

        <div class="notice">
          OAuth key preflight is enabled on this server. If you cannot provide key credentials, configure
          <code>NEOTOMA_BEARER_TOKEN</code> and use Bearer auth directly.
        </div>

        <div class="actions">
          <button type="submit">Authenticate and continue</button>
        </div>
      </form>

      <script>
        (function() {
          const form = document.getElementById('oauth-key-auth-form');
          if (!form) return;
          const modeInput = document.getElementById('credential_mode');
          const buttons = Array.from(form.querySelectorAll('.tab-btn'));
          const panels = Array.from(form.querySelectorAll('.tab-panel'));
          function activate(tab) {
            buttons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
            panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
            if (modeInput) modeInput.value = tab;
          }
          buttons.forEach((btn) => {
            btn.addEventListener('click', () => activate(btn.dataset.tab || 'private_key'));
          });
        })();
      </script>
      `,
    })
  );
});

app.post("/mcp/oauth/key-auth", express.urlencoded({ extended: true }), async (req, res) => {
  const nextPath = normalizeOauthNextPath((req.body?.next as string | undefined) || undefined);

  if (!config.requireKeyForOauth) {
    return res.redirect(nextPath);
  }

  const defaultCredentialMode = (process.env.NEOTOMA_BEARER_TOKEN || "").trim()
    ? "bearer"
    : "private_key";
  const postedMode = ((req.body?.credential_mode as string | undefined) || "").trim();
  const postedBearer = ((req.body?.bearer_token as string | undefined) || "").trim();
  // Robust fallback: if a bearer token was submitted, prioritize bearer validation even if
  // tab state/JS failed to set credential_mode.
  const credentialMode = postedBearer.length > 0 ? "bearer" : postedMode || defaultCredentialMode;
  const result =
    credentialMode === "bearer"
      ? isOauthKeyCredentialValid({ bearerToken: req.body?.bearer_token })
      : credentialMode === "mnemonic"
        ? isOauthKeyCredentialValid({
            mnemonic: req.body?.mnemonic,
            mnemonicPassphrase: req.body?.mnemonic_passphrase,
          })
        : isOauthKeyCredentialValid({
            privateKeyHex: req.body?.private_key_hex,
          });

  if (!result.ok) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const retryHref = `/mcp/oauth/key-auth?next=${encodeURIComponent(nextPath)}`;
    return res.status(401).send(
      renderOauthPage({
        title: "Authentication failed",
        subtitle: result.reason || "Unable to validate credentials.",
        contentHtml: `<div class="actions">
          <a class="btn-link secondary" href="${escapeHtml(retryHref)}">Try again</a>
        </div>`,
      })
    );
  }

  setOAuthKeySessionCookie(req, res);
  return res.redirect(nextPath);
});

// RFC 8414 authorization endpoint (GET) for Cursor and other OAuth clients
app.get("/mcp/oauth/authorize", async (req, res) => {
  try {
    const redirect_uri = req.query.redirect_uri as string | undefined;
    const state = req.query.state as string | undefined;
    const code_challenge = req.query.code_challenge as string | undefined;
    const code_challenge_method = req.query.code_challenge_method as string | undefined;
    const client_id = req.query.client_id as string | undefined;
    const dev_stub = req.query.dev_stub as string | undefined;
    logger.info("[MCP OAuth] Authorize request received", {
      client_id: client_id ?? null,
      redirect_uri: sanitizeRedirectUriForLog(redirect_uri),
      has_state: Boolean(state),
      has_pkce: Boolean(code_challenge) && code_challenge_method === "S256",
      host: req.header("host") ?? null,
    });

    if (!redirect_uri) {
      logger.warn("[MCP OAuth] Authorize rejected: missing redirect_uri");
      return res.status(400).send("redirect_uri is required");
    }
    if (!state) {
      logger.warn("[MCP OAuth] Authorize rejected: missing state");
      return res.status(400).send("state is required");
    }
    const isOpenAiCustomGptRedirect =
      redirect_uri &&
      (redirect_uri.includes("chatgpt.com") || redirect_uri.includes("chat.openai.com"));
    const hasPkce = code_challenge && code_challenge_method === "S256";

    if (!hasPkce && !isOpenAiCustomGptRedirect) {
      logger.warn("[MCP OAuth] Authorize rejected: missing PKCE for non-OpenAI redirect", {
        redirect_uri: sanitizeRedirectUriForLog(redirect_uri),
      });
      return res.status(400).send("code_challenge and code_challenge_method=S256 are required");
    }
    if (!hasPkce && isOpenAiCustomGptRedirect) {
      // Allow OAuth without client PKCE for OpenAI Custom GPT only (weaker security; see docs).
      // Server generates PKCE for state storage; OpenAI does not send code_verifier at token exchange.
    }
    if (config.requireKeyForOauth && !hasValidOAuthKeySession(req)) {
      const nextPath = normalizeOauthNextPath(req.originalUrl);
      return res.redirect(`/mcp/oauth/key-auth?next=${encodeURIComponent(nextPath)}`);
    }
    if (dev_stub === "1" || dev_stub === "true") {
      return res
        .status(400)
        .send("dev_stub is disabled. OAuth requires key authentication via /mcp/oauth/key-auth.");
    }

    if (config.storageBackend === "local") {
      // When reached via tunnel, only allow redirect_uri to localhost, app schemes, or OpenAI Custom GPT
      if (!isLocalRequest(req)) {
        const { isRedirectUriAllowedForTunnel } = await import("./services/mcp_oauth.js");
        if (!isRedirectUriAllowedForTunnel(redirect_uri)) {
          logger.warn("[MCP OAuth] Authorize rejected: redirect_uri not allowed for tunnel", {
            redirect_uri: sanitizeRedirectUriForLog(redirect_uri),
          });
          return res
            .status(400)
            .send(
              "redirect_uri is not allowed when connecting via a tunnel. Use cursor://, localhost, loopback, or trusted callback URLs (OpenAI/Claude)."
            );
        }
      }

      const { randomUUID } = await import("node:crypto");
      const connectionId = randomUUID();
      const { createLocalAuthorizationRequest, generatePKCE: generatePKCEFromService } =
        await import("./services/mcp_oauth.js");

      const pkce = hasPkce
        ? undefined
        : (() => {
            const p = generatePKCEFromService();
            return { codeChallenge: p.codeChallenge, codeVerifier: p.codeVerifier };
          })();

      const authRequest = await createLocalAuthorizationRequest({
        connectionId,
        redirectUri: redirect_uri,
        clientState: state,
        codeChallenge: pkce ? pkce.codeChallenge : (code_challenge as string),
        codeVerifier: pkce?.codeVerifier,
      });
      // Keep local OAuth redirects on the current origin (tunnel or localhost) even if
      // authRequest.authUrl was built from a different absolute base URL.
      try {
        const parsed = new URL(authRequest.authUrl);
        logger.info("[MCP OAuth] Authorize accepted (local backend)", {
          connection_id: connectionId,
          redirect_uri: sanitizeRedirectUriForLog(redirect_uri),
        });
        return res.redirect(`${parsed.pathname}${parsed.search}`);
      } catch {
        logger.info("[MCP OAuth] Authorize accepted (local backend fallback URL)", {
          connection_id: connectionId,
          redirect_uri: sanitizeRedirectUriForLog(redirect_uri),
        });
        return res.redirect(authRequest.authUrl);
      }
    }

    const { randomUUID } = await import("node:crypto");
    const connectionId = randomUUID();
    const { initiateOAuthFlow, generatePKCE: generatePKCEFromService } =
      await import("./services/mcp_oauth.js");
    const serverPkce = hasPkce
      ? undefined
      : (() => {
          const p = generatePKCEFromService();
          return { codeVerifier: p.codeVerifier, codeChallenge: p.codeChallenge };
        })();
    const result = await initiateOAuthFlow(
      connectionId,
      client_id ?? undefined,
      redirect_uri,
      state,
      serverPkce
    );
    logger.info("[MCP OAuth] Authorize accepted (remote backend)", {
      connection_id: connectionId,
      redirect_uri: sanitizeRedirectUriForLog(redirect_uri),
    });

    return res.redirect(result.authUrl);
  } catch (error: any) {
    logError("MCPOAuthAuthorize", req, error);
    return res.status(500).send(error.message ?? "Authorization failed");
  }
});

// Local OAuth login page (local backend only)
// With MCP-style auth: encryption off = auto dev-local, encryption on = Bearer token only (no OAuth)
app.get("/mcp/oauth/local-login", async (req, res) => {
  if (config.storageBackend !== "local") {
    return res.status(404).send("Not found");
  }

  const state = (req.query.state as string | undefined)?.trim();
  if (!state) {
    return res.status(400).send("state is required");
  }
  if (config.requireKeyForOauth && !hasValidOAuthKeySession(req)) {
    const nextPath = normalizeOauthNextPath(req.originalUrl);
    return res.redirect(`/mcp/oauth/key-auth?next=${encodeURIComponent(nextPath)}`);
  }

  // When encryption is enabled: OAuth is not supported (MCP handler requires key-derived token)
  if (config.encryption.enabled) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(
      renderOauthPage({
        title: "OAuth unavailable with encryption",
        subtitle:
          "When NEOTOMA_ENCRYPTION_ENABLED=true, authenticate with a key-derived Bearer token instead of OAuth.",
        contentHtml: `
          <ol>
            <li>Run <code>neotoma auth mcp-token</code> to generate your token.</li>
            <li>Add header config (for example in <code>.cursor/mcp.json</code>):<br /><code>"headers": { "Authorization": "Bearer &lt;your-token&gt;" }</code></li>
            <li>Remove <code>X-Connection-Id</code> if present.</li>
            <li>Restart your MCP client.</li>
          </ol>
          <div class="actions">
            <a class="btn-link secondary" href="https://github.com/neotoma/neotoma/blob/main/docs/developer/mcp_oauth_troubleshooting.md">MCP OAuth troubleshooting</a>
          </div>
        `,
      })
    );
  }

  // When encryption is off: local requests auto-approve; tunnel requests require explicit approval
  const fromTunnel = !isLocalRequest(req);
  if (fromTunnel && req.query.approve !== "1") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const base = `${req.protocol}://${req.get("host") || ""}`;
    const approveUrl = `${base}${req.path}?${new URLSearchParams({ state, approve: "1" }).toString()}`;
    return res.send(
      renderOauthPage({
        title: "Approve connection",
        subtitle:
          "A client requested access to Neotoma. Approve only if you initiated this connection.",
        contentHtml: `
          <div class="actions">
            <a class="btn-link" href="${escapeHtml(approveUrl)}">Approve this connection</a>
          </div>
          <div class="notice">If you did not expect this request, close this tab. No access will be granted.</div>
        `,
      })
    );
  }

  try {
    const devUser = ensureLocalDevUser();
    const { completeLocalAuthorization } = await import("./services/mcp_oauth.js");
    const { connectionId, redirectUri, clientState } = await completeLocalAuthorization(
      state,
      devUser.id
    );
    const frontendBase =
      process.env.NEOTOMA_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:5195";
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
    return res.status(status).send(
      renderOauthPage({
        title: "Authorization failed",
        subtitle: error?.message ?? "Dev account authorization failed",
        contentHtml: `<div class="actions">
          <a class="btn-link secondary" href="/mcp/oauth/key-auth?next=${encodeURIComponent(req.originalUrl || "/mcp/oauth/authorize")}">Back to authentication</a>
        </div>`,
      })
    );
  }
});

// POST handler removed: local-login now auto-uses dev account (no email/password form)

// RFC 8414 token endpoint (POST) for Cursor and other OAuth clients
app.post(
  "/mcp/oauth/token",
  oauthTokenLimit,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      const grant_type = req.body?.grant_type;
      const code = req.body?.code;
      const refresh_token = req.body?.refresh_token;
      logger.info("[MCP OAuth] Token request received", {
        grant_type: grant_type ?? null,
        has_code: typeof code === "string" && code.length > 0,
        code_hint: typeof code === "string" ? code.slice(0, 8) : null,
        has_refresh_token: typeof refresh_token === "string" && refresh_token.length > 0,
        host: req.header("host") ?? null,
      });

      if (grant_type !== "authorization_code" && grant_type !== "refresh_token") {
        logger.warn("[MCP OAuth] Token rejected: unsupported grant_type", {
          grant_type: grant_type ?? null,
        });
        return res.status(400).json({
          error: "unsupported_grant_type",
          error_description: "Only authorization_code and refresh_token are supported",
        });
      }
      if (grant_type === "refresh_token") {
        if (!refresh_token || typeof refresh_token !== "string") {
          logger.warn("[MCP OAuth] Token refresh rejected: missing refresh_token");
          return res
            .status(400)
            .json({ error: "invalid_request", error_description: "refresh_token is required" });
        }

        const { refreshAccessToken } = await import("./services/mcp_oauth.js");
        const token = await refreshAccessToken(refresh_token);
        logger.info("[MCP OAuth] Token refreshed", {
          has_refresh_token: Boolean((token as { refresh_token?: string }).refresh_token),
        });

        res.setHeader("Content-Type", "application/json");
        return res.json(token);
      }
      if (!code || typeof code !== "string") {
        logger.warn("[MCP OAuth] Token rejected: missing code");
        return res
          .status(400)
          .json({ error: "invalid_request", error_description: "code is required" });
      }

      const { getTokenResponseForConnection } = await import("./services/mcp_oauth.js");
      const token = await getTokenResponseForConnection(code);
      logger.info("[MCP OAuth] Token issued", {
        code_hint: code.slice(0, 8),
        has_refresh_token: Boolean((token as { refresh_token?: string }).refresh_token),
      });

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
app.post("/mcp/oauth/register", oauthRegisterLimit, async (req, res) => {
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
app.get("/mcp/oauth/status", async (req, res) => {
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
app.get("/mcp/oauth/connections", async (req, res) => {
  try {
    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "AUTH_REQUIRED", "Authorization header required");
    }

    const token = authHeader.substring(7);

    // Validate token and get user
    const { validateSessionToken } = await import("./services/mcp_auth.js");
    const { userId } = await validateSessionToken(token);

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
app.delete("/mcp/oauth/connections/:connection_id", async (req, res) => {
  try {
    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "AUTH_REQUIRED", "Authorization header required");
    }

    const token = authHeader.substring(7);
    const { connection_id } = req.params;

    // Validate token and get user
    const { validateSessionToken } = await import("./services/mcp_auth.js");
    const { userId } = await validateSessionToken(token);

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
// This endpoint proxies requests to OAuth 2.1 Server to avoid CORS issues
app.get("/mcp/oauth/authorization-details", async (req, res) => {
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
    const { validateSessionToken } = await import("./services/mcp_auth.js");
    await validateSessionToken(token);

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
  } catch (error: any) {
    logError("MCPOAuthAuthorizationDetails", req, error);
    return sendError(res, 500, "DB_QUERY_FAILED", error.message);
  }
});

// Dev-only endpoint to sign in as a specific user (for development/testing)
app.post("/auth/dev-signin", async (req, res) => {
  // Only allow in development mode
  if (config.environment !== "development") {
    return sendError(res, 403, "FORBIDDEN", "Dev signin only available in development mode");
  }
  return sendError(res, 403, "FORBIDDEN", "Dev signin endpoint is disabled in local-only mode");
});

type UserPrincipal = {
  kind: "user";
  userId: string;
};

type GuestPrincipal = {
  kind: "guest";
  guestId: GuestIdentity;
  agentIdentity?: AgentIdentity | null;
  accessToken?: string;
};

type RoutePrincipal = UserPrincipal | GuestPrincipal;

function requestPrincipal(req: express.Request): RoutePrincipal | undefined {
  return (req as express.Request & { principal?: RoutePrincipal }).principal;
}

function stampUserPrincipal(req: express.Request, userId: string): void {
  (req as any).authenticatedUserId = userId;
  (req as express.Request & { principal?: RoutePrincipal }).principal = {
    kind: "user",
    userId,
  };
}

function stampGuestPrincipal(req: express.Request, principal: GuestPrincipal): void {
  (req as express.Request & { principal?: RoutePrincipal }).principal = principal;
}

function guestAccessTokenFromRequest(req: express.Request): string | undefined {
  const explicitToken = explicitGuestAccessTokenFromRequest(req);
  if (explicitToken) return explicitToken;

  const headerAuth = (req.headers.authorization || req.headers.Authorization || "") as string;
  if (headerAuth.startsWith("Bearer ")) {
    const token = headerAuth.slice("Bearer ".length).trim();
    if (token) return token;
  }
  return undefined;
}

function explicitGuestAccessTokenFromRequest(req: express.Request): string | undefined {
  const queryToken = req.query.access_token;
  if (typeof queryToken === "string" && queryToken.trim()) return queryToken.trim();
  const body = req.body as { access_token?: unknown; guest_access_token?: unknown } | undefined;
  if (typeof body?.guest_access_token === "string" && body.guest_access_token.trim()) {
    return body.guest_access_token.trim();
  }
  if (typeof body?.access_token === "string" && body.access_token.trim()) {
    return body.access_token.trim();
  }
  return undefined;
}

/** Exported for unit tests: routes where guest (AAuth / guest token) may be stamped before handlers run. */
export function routeAcceptsGuestPrincipal(req: Pick<express.Request, "method" | "path">): boolean {
  const path = req.path;
  if (
    (req.method === "POST" &&
      (path === "/issues/submit" ||
        path === "/api/issues/submit" ||
        path === "/issues/status" ||
        path === "/api/issues/status" ||
        path === "/issues/add_message" ||
        path === "/api/issues/add_message" ||
        path === "/subscribe" ||
        path === "/unsubscribe" ||
        path === "/list_subscriptions" ||
        path === "/get_subscription_status")) ||
    (req.method === "GET" &&
      (/^\/entities\/[^/]+(?:\/(?:observations|relationships))?$/.test(path) ||
        path === "/events/stream"))
  ) {
    return true;
  }
  return false;
}

/** Exported for unit tests: guest-capable routes that mutate state and should consume a guest write-rate budget. */
export function routeConsumesGuestWriteBudget(
  req: Pick<express.Request, "method" | "path">
): boolean {
  const path = req.path;
  return (
    req.method === "POST" &&
    (path === "/issues/submit" ||
      path === "/api/issues/submit" ||
      path === "/issues/add_message" ||
      path === "/api/issues/add_message" ||
      path === "/subscribe" ||
      path === "/unsubscribe")
  );
}

/** Exported for unit tests: guest-rate-limit key precedence is thumbprint -> guest token -> IP. */
export function guestWriteRateLimitKey(req: express.Request): string {
  const principal = requestPrincipal(req);
  if (principal?.kind === "guest") {
    const thumbprint = principal.guestId.thumbprint?.trim();
    if (thumbprint) {
      return `guest-thumbprint:${thumbprint}`;
    }
    const accessToken = principal.accessToken ?? principal.guestId.accessToken;
    if (typeof accessToken === "string" && accessToken.trim()) {
      return `guest-token:${hashGuestAccessToken(accessToken.trim()).slice(0, 16)}`;
    }
  }
  return `ip:${ipKeyGenerator(req.ip || "")}`;
}

const guestWriteRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: GUEST_WRITE_RATE_LIMIT_PER_MIN,
  keyGenerator: guestWriteRateLimitKey,
  message: "Guest write rate limit exceeded, please slow down",
  ...rateLimitOptions,
});

function guestWriteRateLimit(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!routeConsumesGuestWriteBudget(req)) return next();
  if (requestPrincipal(req)?.kind !== "guest") return next();
  void guestWriteRateLimitMiddleware(req, res, next);
}

function buildGuestPrincipalFromRequest(req: express.Request): GuestPrincipal | null {
  const agentIdentity = getCurrentAgentIdentity();
  const accessToken = guestAccessTokenFromRequest(req);
  const guestId: GuestIdentity = {
    thumbprint: agentIdentity?.thumbprint,
    sub: agentIdentity?.sub,
    iss: agentIdentity?.iss,
    accessToken,
  };
  if (!guestId.thumbprint && !guestId.accessToken) {
    return null;
  }
  return {
    kind: "guest",
    guestId,
    agentIdentity,
    accessToken,
  };
}

async function maybeStampGuestPrincipal(req: express.Request): Promise<boolean> {
  if (!routeAcceptsGuestPrincipal(req)) return false;
  const guestPrincipal = buildGuestPrincipalFromRequest(req);
  if (!guestPrincipal) return false;

  const headerAuth = (req.headers.authorization || req.headers.Authorization || "") as string;
  if (headerAuth.startsWith("Bearer ") && guestPrincipal.accessToken) {
    const { validateGuestAccessToken } = await import("./services/guest_access_token.js");
    if (!(await validateGuestAccessToken(guestPrincipal.accessToken))) {
      return false;
    }
  }

  stampGuestPrincipal(req, guestPrincipal);
  return true;
}

async function resolveRoutePrincipal(
  req: express.Request,
  accept: ReadonlyArray<RoutePrincipal["kind"]>
): Promise<RoutePrincipal> {
  if (accept.includes("guest") && explicitGuestAccessTokenFromRequest(req)) {
    const guestPrincipal = buildGuestPrincipalFromRequest(req);
    if (guestPrincipal) {
      stampGuestPrincipal(req, guestPrincipal);
      return guestPrincipal;
    }
  }

  const existing = requestPrincipal(req);
  if (existing && accept.includes(existing.kind)) return existing;

  if (accept.includes("guest")) {
    const guestPrincipal = buildGuestPrincipalFromRequest(req);
    if (guestPrincipal && (await maybeStampGuestPrincipal(req))) {
      return requestPrincipal(req) as GuestPrincipal;
    }
  }

  if (accept.includes("user")) {
    const userId = await getAuthenticatedUserId(
      req,
      ((req.body as { user_id?: string } | undefined)?.user_id ??
        (req.query.user_id as string | undefined)) as string | undefined
    );
    return { kind: "user", userId };
  }

  throw new Error("Not authenticated - route does not accept the resolved principal");
}

/**
 * Derive a userId for a guest principal from the validated token grant.
 *
 * Resolution order:
 *   1. `(req as any).authenticatedUserId` — set by earlier auth middleware
 *      (covers the rare case where user-level auth was stamped before the
 *      guest branch).
 *   2. The `user_id` stored on the `guest_access_token` entity that matches
 *      the guest's access token. This is the owner who generated the token.
 *   3. Local-only fallback: when the request originates from localhost and
 *      does not carry a Bearer token, use the local dev user. This keeps
 *      local-only developer flows working without a real token grant.
 *
 * Returns `null` for non-guest principals so callers can fall through to
 * `getAuthenticatedUserId`. Throws for remote/hosted guests that cannot
 * be resolved — prevents silent mis-attribution.
 */
export async function resolveGuestUserId(
  req: express.Request,
  principal: RoutePrincipal
): Promise<string | null> {
  if (principal.kind !== "guest") return null;

  const authenticatedUserId = (req as any).authenticatedUserId;
  if (authenticatedUserId) return authenticatedUserId;

  if (principal.guestId.accessToken) {
    const { hashGuestAccessToken } = await import("./services/guest_access_token.js");
    const tokenHash = hashGuestAccessToken(principal.guestId.accessToken);
    const tokenEntityId = `guest_token_${tokenHash.slice(0, 16)}`;
    const { data: tokenEntity } = await db
      .from("entities")
      .select("user_id")
      .eq("id", tokenEntityId)
      .single();
    if (tokenEntity?.user_id) {
      return tokenEntity.user_id;
    }
  }

  const headerAuth = (req.headers.authorization || "") as string;
  if (isLocalRequest(req) && !headerAuth.startsWith("Bearer ")) {
    return ensureLocalDevUser().id;
  }

  throw new Error(
    "Not authenticated - guest principal cannot resolve a user_id: no valid token grant and not a local request"
  );
}

async function assertValidGuestAccessToken(principal: GuestPrincipal): Promise<void> {
  const accessToken = principal.guestId.accessToken;
  if (!accessToken) return;

  const { validateGuestAccessToken } = await import("./services/guest_access_token.js");
  const tokenGrant = await validateGuestAccessToken(accessToken);
  if (!tokenGrant) {
    throw new Error("Not authenticated - invalid guest access token");
  }
}

async function resolveGuestScopedEntityAccess(
  principal: GuestPrincipal,
  entityId: string,
  expectedEntityType?: string
): Promise<{ userId: string; entityType: string }> {
  await assertValidGuestAccessToken(principal);

  const { data: entity, error: entityError } = await db
    .from("entities")
    .select("id, entity_type, user_id")
    .eq("id", entityId)
    .single();

  if (entityError || !entity || (expectedEntityType && entity.entity_type !== expectedEntityType)) {
    throw new Error(
      expectedEntityType === "issue" ? "Issue entity not found." : "Entity not found."
    );
  }

  const { resolveGuestReadAccess } = await import("./services/access_policy.js");
  const decision = await resolveGuestReadAccess(entity.entity_type, principal.guestId);
  if (!decision.allowed) {
    throw new AccessPolicyError({
      op: "retrieve",
      entityType: entity.entity_type,
      mode: decision.mode,
      reason: decision.reason,
    });
  }

  if (decision.scopeFilter === "submitter_only") {
    if (principal.guestId.accessToken) {
      const { tokenGrantsAccessTo, hashGuestAccessToken } =
        await import("./services/guest_access_token.js");
      if (await tokenGrantsAccessTo(principal.guestId.accessToken, entityId)) {
        return { userId: entity.user_id, entityType: entity.entity_type };
      }
      if (entity.entity_type === "issue") {
        const tokenHash = hashGuestAccessToken(principal.guestId.accessToken);
        const { data: issueObservations } = await db
          .from("observations")
          .select("fields")
          .eq("entity_id", entityId);
        for (const observation of issueObservations ?? []) {
          const rawFields = (observation as { fields?: unknown; payload?: unknown }).fields;
          const fields =
            typeof rawFields === "string"
              ? JSON.parse(rawFields)
              : rawFields && typeof rawFields === "object"
                ? rawFields
                : undefined;
          if (
            (fields as { guest_access_token_hash?: string } | undefined)
              ?.guest_access_token_hash === tokenHash
          ) {
            return { userId: entity.user_id, entityType: entity.entity_type };
          }
        }
        const { data: issueRelationships } = await db
          .from("relationship_snapshots")
          .select("target_entity_id")
          .eq("source_entity_id", entityId)
          .eq("relationship_type", "REFERS_TO");
        for (const relationship of issueRelationships ?? []) {
          const conversationId = (relationship as { target_entity_id?: string }).target_entity_id;
          if (
            conversationId &&
            (await tokenGrantsAccessTo(principal.guestId.accessToken, conversationId))
          ) {
            return { userId: entity.user_id, entityType: entity.entity_type };
          }
        }
      }
    }

    const { data: observations } = await db
      .from("observations")
      .select("id, agent_thumbprint")
      .eq("entity_id", entityId);
    const hasMatch = observations?.some((obs: { agent_thumbprint?: string }) => {
      return Boolean(
        principal.guestId.thumbprint && obs.agent_thumbprint === principal.guestId.thumbprint
      );
    });
    if (!hasMatch) {
      throw new AccessPolicyError({
        op: "retrieve",
        entityType: entity.entity_type,
        mode: decision.mode,
        reason: "submitter_scoped_no_matching_token_or_thumbprint",
      });
    }
  }

  return { userId: entity.user_id, entityType: entity.entity_type };
}

// Public key-based authentication middleware
// MCP-style auth (same patterns as /mcp): encryption off = no auth or dev token; encryption on = key-derived token
app.use(async (req, res, next) => {
  // Bypass auth only for truly public endpoints (no user data)
  if (
    req.method === "OPTIONS" ||
    (req.method === "GET" &&
      (req.path === "/openapi.yaml" ||
        req.path === "/openapi_actions.yaml" ||
        req.path === "/health")) ||
    (req.method === "POST" && req.path === "/auth/dev-signin")
  ) {
    return next();
  }

  const headerAuth = (req.headers.authorization || req.headers.Authorization || "") as string;

  // Local mode: when storage is local and request is from localhost, no Bearer → default user (00..) by default
  if (
    config.storageBackend === "local" &&
    isLocalRequest(req) &&
    !headerAuth.startsWith("Bearer ")
  ) {
    if (await maybeStampGuestPrincipal(req)) {
      logger.info(`[Auth] ${req.method} ${req.path} auth_method=guest_capability`);
      return next();
    }
    const devUser = ensureLocalDevUser();
    stampUserPrincipal(req, devUser.id);
    logger.info(
      `[Auth] ${req.method} ${req.path} auth_method=local_no_bearer user_id=${devUser.id}`
    );
    return next();
  }

  // Sandbox ephemeral session: resolve from cookie or Bearer token before
  // falling back to the shared public user. Expired/revoked sessions 401.
  if (isSandboxMode()) {
    const sessionInfo = resolveSessionFromRequest(req);
    if (sessionInfo) {
      stampUserPrincipal(req, sessionInfo.userId);
      logger.info(
        `[Auth] ${req.method} ${req.path} auth_method=sandbox_session user_id=${sessionInfo.userId}`
      );
      return next();
    }
  }

  // Sandbox mode: public deployment at sandbox.neotoma.io where anonymous
  // callers are attributed to SANDBOX_PUBLIC_USER_ID without a Bearer. AAuth
  // still runs (earlier in the chain via aauthVerify) so agents exercising the
  // full AAuth roundtrip get their hardware/software tier. Destructive admin
  // routes are separately gated by sandboxDestructiveGuard.
  if (isSandboxMode() && !headerAuth.startsWith("Bearer ")) {
    // α (sandbox attribution partitioning): when the request carries a verified
    // AAuth signature, attribute writes/reads to a deterministic per-thumbprint
    // user instead of the shared SANDBOX_PUBLIC_USER_ID. Same key on two
    // requests resolves to the same user_id; different keys → different
    // user_ids. Unsigned requests keep the public-user fallback unchanged.
    // Read partitioning falls out automatically because every read path scopes
    // queries by req.authenticatedUserId.
    const aauthCtx = (
      req as express.Request & { aauth?: { verified?: boolean; thumbprint?: string } }
    ).aauth;
    if (aauthCtx?.verified === true && typeof aauthCtx.thumbprint === "string") {
      const aauthUser = ensureSandboxAauthUser(aauthCtx.thumbprint);
      stampUserPrincipal(req, aauthUser.id);
      logger.info(
        `[Auth] ${req.method} ${req.path} auth_method=sandbox_aauth user_id=${aauthUser.id} thumbprint=${aauthCtx.thumbprint}`
      );
      return next();
    }
    const sandboxUser = ensureSandboxPublicUser();
    stampUserPrincipal(req, sandboxUser.id);
    logger.info(
      `[Auth] ${req.method} ${req.path} auth_method=sandbox_public user_id=${sandboxUser.id}`
    );
    return next();
  }

  // MCP-style auth (aligns CLI and REST API with MCP). Local requests can skip Bearer; tunnel requires Bearer or OAuth.
  // Key-derived bearer token is accepted whenever a key source is configured, regardless of whether full encryption
  // is enabled. This allows tunnel setups (Cloudflare, autossh, etc.) to authenticate via key-derived Bearer
  // even when NEOTOMA_ENCRYPTION_ENABLED is not set.
  const mcpExpectedToken = getMcpAuthToken();
  if (headerAuth.startsWith("Bearer ") && mcpExpectedToken) {
    const token = headerAuth.slice(7).trim();
    if (safeCompareTokens(token, mcpExpectedToken)) {
      const devUser = ensureLocalDevUser();
      stampUserPrincipal(req, devUser.id);
      logger.info(
        `[Auth] ${req.method} ${req.path} auth_method=bearer_mcp_token user_id=${devUser.id}`
      );
      return next();
    }
  }

  if (config.encryption.enabled) {
    // Encryption on: no further no-Bearer paths — all non-key auth is rejected below.
  } else {
    if (!headerAuth.startsWith("Bearer ")) {
      if (await maybeStampGuestPrincipal(req)) {
        logger.info(`[Auth] ${req.method} ${req.path} auth_method=guest_capability`);
        return next();
      }
      if (isLocalRequest(req)) {
        const devUser = ensureLocalDevUser();
        stampUserPrincipal(req, devUser.id);
        logger.info(
          `[Auth] ${req.method} ${req.path} auth_method=local_no_bearer user_id=${devUser.id}`
        );
        return next();
      }
    }
    if (headerAuth.startsWith("Bearer ") && process.env.NEOTOMA_BEARER_TOKEN) {
      const token = headerAuth.slice(7).trim();
      if (safeCompareTokens(token, process.env.NEOTOMA_BEARER_TOKEN)) {
        const devUser = ensureLocalDevUser();
        stampUserPrincipal(req, devUser.id);
        logger.info(
          `[Auth] ${req.method} ${req.path} auth_method=bearer_env user_id=${devUser.id}`
        );
        return next();
      }
    }
  }

  // Stronger AAuth Admission: a verified AAuth identity that resolved
  // to an active `agent_grant` is a valid remote auth path. The
  // admission middleware has already populated `req.aauthAdmission`
  // and `req.authenticatedUserId`. We accept it here even when no
  // Bearer is present so agents holding an active grant can reach
  // direct write routes (`/store`, `/observations/create`,
  // `/create_relationship`, `/correct`) without OAuth/Bearer.
  const admissionForRequest = getAAuthAdmissionFromRequest(req);
  if (
    admissionForRequest?.admitted &&
    admissionForRequest.user_id &&
    (req as any).authenticatedUserId === admissionForRequest.user_id
  ) {
    stampUserPrincipal(req, admissionForRequest.user_id);
    logger.info(
      `[Auth] ${req.method} ${req.path} auth_method=aauth_admitted user_id=${admissionForRequest.user_id} grant_id=${admissionForRequest.grant_id ?? "?"}`
    );
    return next();
  }

  // Bearer required for remaining paths (Ed25519, OAuth)
  if (!headerAuth.startsWith("Bearer ")) {
    if (await maybeStampGuestPrincipal(req)) {
      logger.info(`[Auth] ${req.method} ${req.path} auth_method=guest_capability`);
      return next();
    }
    logWarn("AuthMissingBearer", req);
    return sendError(res, 401, "AUTH_REQUIRED", "Missing Bearer token", {
      hint:
        "AAuth-signed agents can authenticate without Bearer once an active agent_grant matches their identity. " +
        "Create a grant via Inspector → Agents → Grants.",
    });
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
      stampUserPrincipal(req, registeredUserId);
    }
    logger.info(
      `[Auth] ${req.method} ${req.path} auth_method=ed25519_bearer user_id=${(req as any).authenticatedUserId ?? "(from token)"}`
    );
  } else {
    // Try to validate as session token
    try {
      const { validateSessionToken } = await import("./services/mcp_auth.js");
      const validated = await validateSessionToken(bearerToken);
      // Attach user_id and email to request for user-scoped queries and /me
      stampUserPrincipal(req, validated.userId);
      (req as any).authenticatedUserEmail = validated.email;
      (req as any).bearerToken = bearerToken;
      logger.info(
        `[Auth] ${req.method} ${req.path} auth_method=session_bearer user_id=${validated.userId}`
      );
    } catch (authError) {
      if (await maybeStampGuestPrincipal(req)) {
        logger.info(`[Auth] ${req.method} ${req.path} auth_method=guest_capability`);
        return next();
      }
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

// Sandbox-mode write gate: destructive routes blocked + tighter per-IP rate
// limit on all write methods. No-op outside sandbox.
app.use(sandboxWriteGate);

// Current session (authenticated user details)
app.get("/me", async (req, res) => {
  try {
    const userId = (req as any).authenticatedUserId;
    const email = (req as any).authenticatedUserEmail;
    if (!userId) {
      return sendError(res, 401, "AUTH_REQUIRED", "Not authenticated");
    }
    // SECURITY: only disclose absolute filesystem paths to local callers.
    // Remote (tunnel) callers receive just the backend label. See
    // docs/reports/security_audit_2026_04_22.md S-10.
    const storage =
      config.storageBackend === "local"
        ? isLocalRequest(req)
          ? {
              storage_backend: "local" as const,
              data_dir: config.dataDir,
              sqlite_db: config.sqlitePath,
            }
          : { storage_backend: "local" as const }
        : undefined;
    return res.json({ user_id: userId, email: email ?? undefined, storage });
  } catch (error: any) {
    logError("GetMe", req, error);
    return sendError(res, 401, "AUTH_REQUIRED", error.message ?? "Not authenticated");
  }
});

/**
 * Helper to extract authenticated user_id from request.
 * Supports: middleware-set user (Bearer / OAuth / dev-local / AAuth admission),
 * session token, Ed25519 bearer.
 *
 * Stronger AAuth Admission plan: admitted AAuth callers carry
 * `req.authenticatedUserId` resolved from the matching `agent_grant`'s
 * owner. This helper applies the same `user_id` mismatch rules to them
 * as to OAuth/Bearer — payload-driven user pivots are rejected. The
 * local-dev override remains available only for the local dev user;
 * AAuth admission can never resolve to that id, so admitted agents are
 * structurally locked to their grant owner.
 * @param req - Express request object
 * @param providedUserId - Optional user_id from request body/query
 * @returns Authenticated user_id
 * @throws Error if not authenticated or user_id mismatch
 */
async function getAuthenticatedUserId(
  req: express.Request,
  providedUserId?: string
): Promise<string> {
  const principal = requestPrincipal(req);
  if (principal?.kind === "guest") {
    throw new Error("Not authenticated - guest principal cannot resolve a user_id");
  }
  const authenticatedUserId = (req as any).authenticatedUserId;
  const aauthAdmissionForRequest = getAAuthAdmissionFromRequest(req);
  if (authenticatedUserId) {
    if (providedUserId && providedUserId !== authenticatedUserId) {
      // AAuth admission: never honour payload user_id overrides — the
      // grant owner is the only valid scope for an admitted agent.
      // Bearer/OAuth flows fall through to the existing rules below.
      if (aauthAdmissionForRequest?.admitted) {
        throw new Error(
          `user_id parameter (${providedUserId}) does not match admitted AAuth user (${authenticatedUserId}); grants only resolve to their owner`
        );
      }
      // When authenticated as local dev user, allow body/query user_id override for CLI tests and dev flows.
      // The sandbox public user is intentionally excluded so public sandbox
      // callers cannot pivot into other users' data by spoofing user_id.
      if (
        authenticatedUserId === LOCAL_DEV_USER_ID &&
        authenticatedUserId !== SANDBOX_PUBLIC_USER_ID
      ) {
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
  if (error instanceof AttributionPolicyError) {
    logWarn(logContext || "AttributionPolicyRejection", req, error.toErrorEnvelope());
    return res
      .status(403)
      .json(buildErrorEnvelope(error.code, error.message, error.toErrorEnvelope()));
  }
  if (error instanceof AgentCapabilityError) {
    logWarn(logContext || "AgentCapabilityRejection", req, error.toErrorEnvelope());
    return res
      .status(403)
      .json(buildErrorEnvelope(error.code, error.message, error.toErrorEnvelope()));
  }
  if (error instanceof AccessPolicyError) {
    logWarn(logContext || "AccessPolicyRejection", req, error.toErrorEnvelope());
    return res
      .status(403)
      .json(buildErrorEnvelope(error.code, error.message, error.toErrorEnvelope()));
  }
  if (error instanceof IssueValidationError) {
    logWarn(logContext || "IssueValidationError", req, {
      code: error.code,
      details: error.toErrorEnvelopeDetails(),
    });
    return res
      .status(400)
      .json(buildErrorEnvelope(error.code, error.message, error.toErrorEnvelopeDetails()));
  }
  if (error instanceof IssueTransportError) {
    logWarn(logContext || "IssueTransportError", req, {
      code: error.code,
      details: error.toErrorEnvelopeDetails(),
    });
    return res
      .status(error.status)
      .json(buildErrorEnvelope(error.code, error.message, error.toErrorEnvelopeDetails()));
  }
  logError(logContext || "APIError", req, error);
  // SECURITY: do not echo raw Error.message to clients in production; SQLite /
  // filesystem errors frequently leak paths and schema. In development we keep
  // the detailed message for debugging. See docs/reports/
  // security_audit_2026_04_22.md S-5.
  const includeDetail =
    config.environment !== "production" ||
    process.env.NEOTOMA_VERBOSE_ERRORS === "1" ||
    process.env.NEOTOMA_VERBOSE_ERRORS === "true";
  const message = includeDetail && error instanceof Error ? error.message : defaultMessage;
  return res.status(500).json(buildErrorEnvelope(errorCode, message));
}

// Schemas

// ============================================================================
// v0.2.15 Entity-Based HTTP API Endpoints
// ============================================================================

// POST /api/entities/query - Query entities with filters
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.post("/entities/query", async (req, res) => {
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

    const {
      entity_type,
      search,
      limit,
      offset,
      sort_by,
      sort_order,
      published,
      published_after,
      published_before,
      include_snapshots,
      include_merged,
      updated_since,
      created_since,
      identity_basis,
    } = parsed.data;
    const { entities, total } = await queryEntitiesWithCount({
      userId,
      entityType: entity_type,
      includeMerged: include_merged,
      includeSnapshots: include_snapshots,
      sortBy: sort_by,
      sortOrder: sort_order,
      published,
      publishedAfter: published_after,
      publishedBefore: published_before,
      search,
      limit,
      offset,
      updatedSince: updated_since,
      createdSince: created_since,
      identityBasis: identity_basis,
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
app.get("/entities/:id", async (req, res) => {
  try {
    const entityId = req.params.id;
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);

    if (principal.kind === "guest") {
      await resolveGuestScopedEntityAccess(principal, entityId);
    } else {
      const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
      const { data: entity, error: entityError } = await db
        .from("entities")
        .select("id, user_id")
        .eq("id", entityId)
        .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
        .single();

      if (entityError || !entity) {
        return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
      }
    }

    const { getEntityWithProvenance } = await import("./services/entity_queries.js");
    const entityWithProvenance = await getEntityWithProvenance(entityId);

    if (!entityWithProvenance) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    // OpenAPI + clients expect `EntitySnapshot` at the root (not `{ entity: ... }`).
    return res.json(entityWithProvenance);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get entity",
      "DB_QUERY_FAILED",
      "APIError:entity_detail"
    );
  }
});

// GET /api/entities/:id/markdown - Canonical markdown rendering of an entity
// snapshot (Phase 4). Backs Inspector's markdown preview panel and the
// `neotoma memory-export` CLI. Deterministic: same inputs produce byte-for-byte
// identical output across calls, matching the filesystem mirror.
app.get("/entities/:id/markdown", async (req, res) => {
  try {
    const entityId = req.params.id;
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const { data: entity, error: entityError } = await db
      .from("entities")
      .select("id, user_id")
      .eq("id", entityId)
      .eq("user_id", userId)
      .single();

    if (entityError || !entity) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    const { getEntityWithProvenance } = await import("./services/entity_queries.js");
    const current = await getEntityWithProvenance(entityId);
    if (!current) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    let schemaFieldOrder: string[] | undefined;
    try {
      const { schemaRegistry } = await import("./services/schema_registry.js");
      const schema = await schemaRegistry.loadActiveSchema(current.entity_type, userId);
      if (schema?.schema_definition?.fields) {
        schemaFieldOrder = Object.keys(schema.schema_definition.fields);
      }
    } catch {
      // Alphabetical fallback when schema is unavailable.
    }

    const { renderEntityMarkdown } = await import("./services/canonical_markdown.js");
    const markdown = renderEntityMarkdown(
      {
        entity_id: current.entity_id ?? entityId,
        entity_type: current.entity_type,
        schema_version: current.schema_version ?? "1.0",
        snapshot: (current.snapshot as Record<string, unknown>) ?? {},
        computed_at: current.computed_at ?? null,
        observation_count: current.observation_count ?? 0,
        last_observation_at: current.last_observation_at ?? null,
      },
      schemaFieldOrder
    );

    // etag is derived from last_observation_at — any new observation moves it,
    // which is exactly the Phase 4 optimistic concurrency boundary.
    const etag = current.last_observation_at
      ? `W/"${Buffer.from(current.last_observation_at).toString("base64")}"`
      : undefined;
    if (etag) res.setHeader("ETag", etag);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.send(markdown);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:entity_markdown", req, error);
    const message = error instanceof Error ? error.message : "Failed to render entity markdown";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// POST /entities/:id/batch_correct - Atomic multi-field correction (Phase 4).
// Shares the same backend as Phase 4b `neotoma edit` CLI; the Inspector Edit
// tab issues one of these per save instead of N POST /correct calls so the
// optimistic concurrency check and schema validation are atomic.
app.post("/entities/:id/batch_correct", async (req, res) => {
  try {
    const entityId = req.params.id;
    const userId = await getAuthenticatedUserId(req, req.body?.user_id as string | undefined);

    const { data: entity, error: entityError } = await db
      .from("entities")
      .select("id, user_id")
      .eq("id", entityId)
      .eq("user_id", userId)
      .single();

    if (entityError || !entity) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }

    const body = req.body as
      | {
          changes?: Array<{ field: string; value: unknown }>;
          expected_last_observation_at?: string | null;
          overwrite?: boolean;
          idempotency_prefix?: string;
        }
      | undefined;
    if (!body?.changes || !Array.isArray(body.changes)) {
      return sendError(res, 400, "VALIDATION_ERROR", "`changes` array is required");
    }

    const { applyBatchCorrection } = await import("./services/batch_correction.js");
    const result = await applyBatchCorrection({
      entity_id: entityId,
      user_id: userId,
      expected_last_observation_at: body.expected_last_observation_at ?? null,
      overwrite: body.overwrite === true,
      changes: body.changes,
      idempotency_prefix: body.idempotency_prefix,
    });

    if (result.status === "conflict") {
      return res.status(409).json({ success: false, ...result });
    }
    if (result.status === "validation_error") {
      return res.status(400).json({ success: false, ...result });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:entity_batch_correct", req, error);
    const message = error instanceof Error ? error.message : "Failed to apply batch correction";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// GET /api/entities/:id/observations - Get observations for entity (FU-601)
// REQUIRES AUTHENTICATION - verifies entity belongs to authenticated user
app.get("/entities/:id/observations", async (req, res) => {
  try {
    const entityId = req.params.id;
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    let userId: string;

    if (principal.kind === "guest") {
      userId = (await resolveGuestScopedEntityAccess(principal, entityId)).userId;
    } else {
      userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
      const { data: entity, error: entityError } = await db
        .from("entities")
        .select("id")
        .eq("id", entityId)
        .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
        .single();

      if (entityError || !entity) {
        return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
      }
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get observations for this entity - filter by user_id for security
    const { data, error, count } = await db
      .from("observations")
      .select("*", { count: "exact" })
      .eq("entity_id", entityId)
      .eq("user_id", userId) // SECURITY: Only return observations for authenticated user
      .order("observed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const rows = (data || []) as Record<string, unknown>[];
    const enriched = await attachSourceLabelsToObservations(userId, rows);

    return res.json({
      observations: enriched,
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
      "APIError:entity_observations"
    );
  }
});

// GET /api/entities/:id/relationships - Get relationships for entity (FU-601)
// REQUIRES AUTHENTICATION - verifies entity belongs to authenticated user
app.get("/entities/:id/relationships", async (req, res) => {
  try {
    const entityId = req.params.id;
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    let userId: string;

    if (principal.kind === "guest") {
      userId = (await resolveGuestScopedEntityAccess(principal, entityId)).userId;
    } else {
      userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
      const { data: entity, error: entityError } = await db
        .from("entities")
        .select("id")
        .eq("id", entityId)
        .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
        .single();

      if (entityError || !entity) {
        return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
      }
    }

    // Get relationships where this entity is the source - filter by user_id
    const { data: outgoing, error: outgoingError } = await db
      .from("relationship_snapshots")
      .select("*")
      .eq("source_entity_id", entityId)
      .eq("user_id", userId); // SECURITY: Only return relationships for authenticated user

    if (outgoingError) throw outgoingError;

    // Get relationships where this entity is the target - filter by user_id
    const { data: incoming, error: incomingError } = await db
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

    const formattedOutgoing = formatRelationships(outgoing);
    const formattedIncoming = formatRelationships(incoming);

    const expandEntities = req.query.expand_entities === "true";
    let relatedEntities: Record<string, any> | undefined;

    if (expandEntities) {
      const relatedIds = new Set<string>();
      for (const rel of [...(outgoing || []), ...(incoming || [])]) {
        if (rel.source_entity_id && rel.source_entity_id !== entityId)
          relatedIds.add(rel.source_entity_id);
        if (rel.target_entity_id && rel.target_entity_id !== entityId)
          relatedIds.add(rel.target_entity_id);
      }
      if (relatedIds.size > 0) {
        const idsArr = Array.from(relatedIds);
        const [snapshotsResult, entitiesResult] = await Promise.all([
          db.from("entity_snapshots").select("*").in("entity_id", idsArr).eq("user_id", userId),
          db
            .from("entities")
            .select("id, canonical_name, entity_type")
            .in("id", idsArr)
            .eq("user_id", userId),
        ]);

        // Merge snapshot + entity rows so callers always get canonical_name
        // and entity_type even when the snapshot row is missing.
        const canonicalNames = new Map<string, string>();
        const entityTypes = new Map<string, string>();
        if (!entitiesResult.error && entitiesResult.data) {
          for (const ent of entitiesResult.data) {
            if (ent.canonical_name) canonicalNames.set(ent.id, ent.canonical_name);
            if (ent.entity_type) entityTypes.set(ent.id, ent.entity_type);
          }
        }

        relatedEntities = {};
        if (!snapshotsResult.error && snapshotsResult.data) {
          for (const e of snapshotsResult.data) {
            if (!e.canonical_name && canonicalNames.has(e.entity_id)) {
              e.canonical_name = canonicalNames.get(e.entity_id);
            }
            if (!e.entity_type && entityTypes.has(e.entity_id)) {
              e.entity_type = entityTypes.get(e.entity_id);
            }
            relatedEntities[e.entity_id] = e;
          }
        }
        // Fill in entities that have no snapshot row yet.
        for (const rid of idsArr) {
          if (relatedEntities[rid]) continue;
          relatedEntities[rid] = {
            entity_id: rid,
            canonical_name: canonicalNames.get(rid) ?? null,
            entity_type: entityTypes.get(rid) ?? null,
          };
        }

        // Resolve schema-derived entity_type_label via the registry once per
        // distinct type (best effort; non-fatal).
        try {
          const { SchemaRegistryService } = await import("./services/schema_registry.js");
          const registry = new SchemaRegistryService();
          const distinctTypes = [...new Set(Array.from(entityTypes.values()).filter(Boolean))];
          const labelByType = new Map<string, string>();
          for (const t of distinctTypes) {
            const schema = await registry.loadActiveSchema(t, userId);
            if (schema?.metadata?.label) labelByType.set(t, schema.metadata.label);
          }
          for (const rid of Object.keys(relatedEntities)) {
            const type = relatedEntities[rid]?.entity_type;
            if (type && labelByType.has(type)) {
              relatedEntities[rid].entity_type_label = labelByType.get(type);
            }
          }
        } catch (err) {
          // Ignore — expansions without labels are still useful.
          console.warn(
            "Failed to attach entity_type_label to related entities:",
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    // Decorate relationship rows with top-level convenience fields so clients
    // don't have to look up `related_entities` per row. Only populated when
    // `expand_entities=true`.
    const decorateRelationship = (rel: any) => {
      if (!relatedEntities) return rel;
      const src = relatedEntities[rel.source_entity_id];
      const tgt = relatedEntities[rel.target_entity_id];
      return {
        ...rel,
        source_entity_name: src?.canonical_name ?? null,
        source_entity_type: src?.entity_type ?? null,
        source_entity_type_label: src?.entity_type_label ?? null,
        target_entity_name: tgt?.canonical_name ?? null,
        target_entity_type: tgt?.entity_type ?? null,
        target_entity_type_label: tgt?.entity_type_label ?? null,
      };
    };

    const decoratedOutgoing = expandEntities
      ? formattedOutgoing.map(decorateRelationship)
      : formattedOutgoing;
    const decoratedIncoming = expandEntities
      ? formattedIncoming.map(decorateRelationship)
      : formattedIncoming;

    const responseBody: Record<string, any> = {
      outgoing: decoratedOutgoing,
      incoming: decoratedIncoming,
      relationships: [...decoratedOutgoing, ...decoratedIncoming],
    };
    if (relatedEntities) {
      responseBody.related_entities = relatedEntities;
    }

    return res.json(responseBody);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get relationships",
      "DB_QUERY_FAILED",
      "APIError:entity_relationships"
    );
  }
});

// GET /api/schemas - List all schemas (FU-XXX)
// REQUIRES AUTHENTICATION - returns global schemas + user-specific schemas for authenticated user
app.get("/schemas", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    // For Ed25519 tokens, user_id may be in query params; for session tokens, it's extracted from token
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const keyword = req.query.keyword as string | undefined;
    const filterEntityType = req.query.entity_type as string | undefined;
    const limitRaw = req.query.limit as string | undefined;
    const offsetRaw = req.query.offset as string | undefined;
    const limit = limitRaw && /^\d+$/.test(limitRaw) ? Math.max(0, parseInt(limitRaw, 10)) : 100;
    const offset = offsetRaw && /^\d+$/.test(offsetRaw) ? Math.max(0, parseInt(offsetRaw, 10)) : 0;

    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    // Get schemas - listEntityTypes will return global + user-specific schemas
    // The service should filter by user_id, but for now we'll filter in the endpoint
    const allSchemas = await schemaRegistry.listEntityTypes(keyword);

    // Filter to only show global schemas (user_id is null) or user-specific schemas for this user
    // Note: listEntityTypes doesn't currently filter by user_id, so we need to query directly
    // Also fetch metadata (including icons) for each schema
    const { data: dbSchemas, error: dbError } = await db
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

    const sortedSchemas = productionSchemas.sort((a, b) =>
      String(a.entity_type).localeCompare(String(b.entity_type))
    );
    const paginatedSchemas = sortedSchemas.slice(offset, offset + limit);

    return res.json({
      schemas: paginatedSchemas,
      total: productionSchemas.length,
      limit,
      offset,
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
app.get("/schemas/:entity_type", async (req, res) => {
  try {
    const entityType = decodeURIComponent(req.params.entity_type);
    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    // Handle authentication - support both Ed25519 and session tokens
    const headerAuth = req.headers.authorization || "";
    let userId: string | undefined = req.query.user_id as string | undefined;

    if (headerAuth.startsWith("Bearer ")) {
      const token = headerAuth.slice("Bearer ".length).trim();

      // Try to validate as Ed25519 bearer token first
      const registered = ensurePublicKeyRegistered(token);
      if (!registered || !isBearerTokenValid(token)) {
        // Try to validate as session token
        try {
          const { validateSessionToken } = await import("./services/mcp_auth.js");
          const validated = await validateSessionToken(token);
          // Use validated user ID if not provided in query
          userId = userId || validated.userId;
        } catch {
          // Not a valid token - continue without user_id (will try global schema)
        }
      }
      // If Ed25519 token is valid, use user_id from query (Ed25519 tokens don't contain user info)
    }

    // Try to load active schema (global or user-specific), then fallback to code-defined schemas
    let schema = await schemaRegistry.loadActiveSchema(entityType, userId);

    if (!schema) {
      const { ENTITY_SCHEMAS } = await import("./services/schema_definitions.js");
      const normalized = entityType.toLowerCase().trim().replace(/\s+/g, "_");
      const codeSchema = ENTITY_SCHEMAS[entityType] ?? ENTITY_SCHEMAS[normalized];
      if (codeSchema) {
        schema = {
          id: "",
          entity_type: codeSchema.entity_type,
          schema_version: codeSchema.schema_version,
          schema_definition: codeSchema.schema_definition,
          reducer_config: codeSchema.reducer_config,
          active: true,
          created_at: new Date().toISOString(),
        };
      }
    }

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

/**
 * Fetch the most recent `relationship_observations.provenance` for each
 * relationship_key in the supplied set, and return the resulting
 * agent-attribution block keyed by relationship_key.
 *
 * `RelationshipSnapshot.provenance` is reducer provenance (field →
 * observation_id) and is NOT the AAuth / clientInfo attribution block the
 * Inspector wants to render. The actual attribution lives on the
 * contributing `relationship_observations` rows' `provenance` column (see
 * `src/crypto/agent_identity.ts` and `src/services/interpretation.ts`). To
 * avoid overloading the existing field, relationship responses now expose a
 * separate top-level `agent_attribution` field derived here.
 */
async function fetchLatestRelationshipAttribution(
  relationshipKeys: string[],
  userId: string
): Promise<Record<string, Record<string, unknown>>> {
  if (relationshipKeys.length === 0) return {};
  const { data, error } = await db
    .from("relationship_observations")
    .select("relationship_key, provenance, observed_at")
    .in("relationship_key", relationshipKeys)
    .eq("user_id", userId)
    .order("observed_at", { ascending: false });
  if (error || !data) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const row of data as Array<{
    relationship_key: string;
    provenance: unknown;
    observed_at: string;
  }>) {
    if (out[row.relationship_key]) continue; // first (most recent) wins
    const prov = normaliseJsonBlob(row.provenance);
    if (prov && hasAttributionKeys(prov)) {
      out[row.relationship_key] = prov;
    }
  }
  return out;
}

function normaliseJsonBlob(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function hasAttributionKeys(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.agent_public_key === "string" ||
    typeof obj.agent_thumbprint === "string" ||
    typeof obj.agent_sub === "string" ||
    typeof obj.client_name === "string" ||
    typeof obj.attribution_tier === "string" ||
    typeof obj.connection_id === "string"
  );
}

// GET /api/relationships - List all relationships with filtering (FU-XXX)
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.get("/relationships", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const relationshipType = req.query.relationship_type as string | undefined;
    const sourceEntityId = req.query.source_entity_id as string | undefined;
    const targetEntityId = req.query.target_entity_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query - ALWAYS filter by authenticated user_id
    let query = db
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
      const { data: entities, error: entityError } = await db
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

    // Fetch latest agent attribution per relationship from
    // relationship_observations.provenance. The snapshot's own `provenance`
    // field is reducer provenance (field → observation_id), not AAuth /
    // clientInfo attribution, so we surface agent attribution separately.
    const attributionByKey = await fetchLatestRelationshipAttribution(
      (data || []).map((rel: any) => rel.relationship_key),
      userId
    );

    // Add id field and entity information for frontend compatibility
    const relationships = (data || []).map((rel: any) => {
      const sourceEntity = entityMap.get(rel.source_entity_id);
      const targetEntity = entityMap.get(rel.target_entity_id);
      const agentAttribution = attributionByKey[rel.relationship_key] ?? null;

      return {
        ...rel,
        id: rel.relationship_key,
        source_canonical_name: sourceEntity?.canonical_name,
        source_entity_type: sourceEntity?.entity_type,
        target_canonical_name: targetEntity?.canonical_name,
        target_entity_type: targetEntity?.entity_type,
        agent_attribution: agentAttribution,
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
app.get("/relationships/:id", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const relationshipKey = decodeURIComponent(req.params.id);

    // Verify relationship exists and belongs to authenticated user
    const { data, error } = await db
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
    const { data: sourceEntity } = await db
      .from("entities")
      .select("canonical_name, entity_type")
      .eq("id", data.source_entity_id)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    const { data: targetEntity } = await db
      .from("entities")
      .select("canonical_name, entity_type")
      .eq("id", data.target_entity_id)
      .eq("user_id", userId) // SECURITY: Only return if belongs to authenticated user
      .single();

    // Derive agent attribution from the most recent contributing
    // relationship_observations.provenance row.
    const attributionByKey = await fetchLatestRelationshipAttribution(
      [data.relationship_key],
      userId
    );

    // Add id field and entity information for frontend compatibility
    return res.json({
      ...data,
      id: data.relationship_key,
      source_canonical_name: sourceEntity?.canonical_name,
      source_entity_type: sourceEntity?.entity_type,
      target_canonical_name: targetEntity?.canonical_name,
      target_entity_type: targetEntity?.entity_type,
      agent_attribution: attributionByKey[data.relationship_key] ?? null,
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
app.post("/relationships/snapshot", async (req, res) => {
  const parsed = RelationshipSnapshotRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_relationship_snapshot", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const { relationship_type, source_entity_id, target_entity_id, user_id } = parsed.data;
    const userId = await getAuthenticatedUserId(req, user_id);
    const relationshipKey = `${relationship_type}:${source_entity_id}:${target_entity_id}`;

    const { data: snapshot, error: snapshotError } = await db
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

    const { data: observations, error: obsError } = await db
      .from("relationship_observations")
      .select(
        "id, source_id, observed_at, specificity_score, source_priority, metadata, provenance"
      )
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId)
      .order("observed_at", { ascending: false });

    if (obsError) throw obsError;

    // Derive the snapshot-level agent attribution from the most recent
    // observation that carries attribution keys. Reducer provenance on the
    // snapshot row is intentionally left untouched (it is a field →
    // observation_id map, not AAuth / clientInfo data).
    let agentAttribution: Record<string, unknown> | null = null;
    for (const obs of (observations ?? []) as Array<{
      provenance: unknown;
    }>) {
      const prov = normaliseJsonBlob(obs.provenance);
      if (prov && hasAttributionKeys(prov)) {
        agentAttribution = prov;
        break;
      }
    }

    return res.json({
      snapshot: { ...snapshot, agent_attribution: agentAttribution },
      observations: observations ?? [],
    });
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
app.get("/timeline", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;
    const eventType = req.query.event_type as string | undefined;
    const entityId = req.query.entity_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const rawOrderBy = String(req.query.order_by ?? "event_timestamp")
      .trim()
      .toLowerCase();
    const orderByColumn = rawOrderBy === "created_at" ? "created_at" : "event_timestamp";

    // Get source IDs for this user first (timeline_events doesn't have user_id)
    const { data: userSources, error: sourcesError } = await db
      .from("sources")
      .select("id")
      .eq("user_id", userId);

    if (sourcesError) throw sourcesError;

    const sourceIds = (userSources || []).map((s: any) => s.id);

    // Build query - filter by source_ids that belong to authenticated user
    let query = db.from("timeline_events").select("*", { count: "exact" });

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

    // Default: sort by event_timestamp (document dates). Use order_by=created_at for "what changed recently".
    // Secondary sort on id is a deterministic tie-breaker — events with identical
    // event_timestamp values (common when many are ingested from the same source)
    // otherwise produce non-stable page boundaries across offset queries.
    query = query.order(orderByColumn, { ascending: false }).order("id", { ascending: true });

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

    // Enrich events with entity canonical names and types
    const events = data || [];
    const entityIds = [...new Set(events.map((e: any) => e.entity_id).filter(Boolean))];
    const entityLookup = new Map<string, { canonical_name: string; entity_type: string }>();
    if (entityIds.length > 0) {
      const { data: entities } = await db
        .from("entities")
        .select("id, canonical_name, entity_type")
        .in("id", entityIds);
      if (entities) {
        for (const ent of entities) {
          entityLookup.set(ent.id, {
            canonical_name: ent.canonical_name,
            entity_type: ent.entity_type,
          });
        }
      }
    }
    const enrichedEvents = events.map((ev: any) => {
      const entity = ev.entity_id ? entityLookup.get(ev.entity_id) : undefined;
      return {
        ...ev,
        entity_name: entity?.canonical_name || undefined,
        entity_type: entity?.entity_type || undefined,
      };
    });

    return res.json({
      events: enrichedEvents,
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
    // Include error code if available (for db errors)
    const errorCode = (error as any)?.code;
    const errorDetails = errorCode ? { code: errorCode, message } : { message };
    return sendError(res, 500, "DB_QUERY_FAILED", message, errorDetails);
  }
});

// GET /api/timeline/:id - Get one timeline event by ID (FU-303)
// REQUIRES AUTHENTICATION - verifies event source belongs to authenticated user
app.get("/timeline/:id", async (req, res) => {
  try {
    const eventId = decodeURIComponent(req.params.id);
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    // Get source IDs for this user first (timeline_events doesn't have user_id)
    const { data: userSources, error: sourcesError } = await db
      .from("sources")
      .select("id")
      .eq("user_id", userId);

    if (sourcesError) throw sourcesError;
    const sourceIds = (userSources || []).map((source: { id: string }) => source.id);

    if (sourceIds.length === 0) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Timeline event not found");
    }

    const { data: event, error } = await db
      .from("timeline_events")
      .select("*")
      .eq("id", eventId)
      .in("source_id", sourceIds)
      .maybeSingle();

    if (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === "PGRST116") {
        return sendError(res, 404, "RESOURCE_NOT_FOUND", "Timeline event not found");
      }
      throw error;
    }

    if (!event) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Timeline event not found");
    }

    return res.json({ event });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    logError("APIError:timeline_detail", req, error);
    const message = error instanceof Error ? error.message : "Failed to get timeline event";
    const errorCode = (error as { code?: string })?.code;
    const errorDetails = errorCode ? { code: errorCode, message } : { message };
    return sendError(res, 500, "DB_QUERY_FAILED", message, errorDetails);
  }
});

// GET /api/record_activity - Cross-table recent rows for inspector (ordered by latest timestamps)
// REQUIRES AUTHENTICATION
app.get("/record_activity", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const recordTypes = parseRecordActivityTypesQuery(req.query.record_types);
    const result = listRecentRecordActivity(userId, {
      limit,
      offset,
      ...(recordTypes?.length ? { recordTypes } : {}),
    });
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list recent record activity",
      "DB_QUERY_FAILED",
      "APIError:record_activity"
    );
  }
});

// GET /api/agents — Directory of distinct agents seen across the write-path tables
// REQUIRES AUTHENTICATION
app.get("/agents", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const result = listAgents(userId);
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list agents",
      "DB_QUERY_FAILED",
      "APIError:agents_list"
    );
  }
});

// ============================================================================
// /agents/grants — Stronger AAuth Admission management surface
//
// Ergonomic wrappers over the agent_grant entity store for the Inspector
// grants page and CLI tooling. The structured-store routes
// (`store_structured`, `correct`) remain available for agents that hold
// the bootstrap capability and want to manage grants programmatically.
// All routes require an authenticated user and operate strictly within
// that user's scope. Cross-user grant access is rejected at the route
// layer (not just the UI). See docs/subsystems/agent_attribution_integration.md.
//
// REGISTERED BEFORE `/agents/:key` so Express's first-match ordering does
// not route `/agents/grants` into the observed-agents handler.
// ============================================================================

const grantsCommonHandlers = {
  errorEnvelopeFromGrantError: (err: unknown) => {
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (
      e &&
      typeof e === "object" &&
      typeof e.code === "string" &&
      typeof e.statusCode === "number"
    ) {
      return {
        statusCode: e.statusCode,
        envelope: buildErrorEnvelope(e.code.toUpperCase(), e.message ?? "Grant error", {
          code: e.code,
        }),
      };
    }
    return null;
  },
};

app.get("/agents/grants", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const { listGrantsForUser } = await import("./services/agent_grants.js");
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const query = typeof req.query.q === "string" ? req.query.q : undefined;
    const grants = await listGrantsForUser(userId, {
      status: (status as any) || "all",
      query,
    });
    return res.json({ grants });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list agent grants",
      "DB_QUERY_FAILED",
      "APIError:agents_grants_list"
    );
  }
});

app.get("/agents/grants/:id", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const { getGrant } = await import("./services/agent_grants.js");
    const grant = await getGrant(userId, req.params.id);
    if (!grant) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", `Agent grant not found: ${req.params.id}`);
    }
    return res.json({ grant });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to fetch agent grant",
      "DB_QUERY_FAILED",
      "APIError:agents_grants_detail"
    );
  }
});

app.post("/agents/grants", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(
      req,
      (req.body?.user_id as string | undefined) ?? undefined
    );
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { createGrant } = await import("./services/agent_grants.js");
    const grant = await createGrant(userId, {
      label: typeof body.label === "string" ? body.label : "",
      capabilities: Array.isArray(body.capabilities) ? (body.capabilities as any) : [],
      status: (body.status as any) ?? "active",
      match_sub: typeof body.match_sub === "string" ? body.match_sub : null,
      match_iss: typeof body.match_iss === "string" ? body.match_iss : null,
      match_thumbprint: typeof body.match_thumbprint === "string" ? body.match_thumbprint : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return res.status(201).json({ grant });
  } catch (error) {
    const mapped = grantsCommonHandlers.errorEnvelopeFromGrantError(error);
    if (mapped) {
      return res.status(mapped.statusCode).json(mapped.envelope);
    }
    return handleApiError(
      req,
      res,
      error,
      "Failed to create agent grant",
      "DB_QUERY_FAILED",
      "APIError:agents_grants_create"
    );
  }
});

app.patch("/agents/grants/:id", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(
      req,
      (req.body?.user_id as string | undefined) ?? undefined
    );
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { updateGrantFields } = await import("./services/agent_grants.js");
    const updates: Record<string, unknown> = {};
    if (typeof body.label === "string") updates.label = body.label;
    if (Array.isArray(body.capabilities)) updates.capabilities = body.capabilities;
    if (body.notes === null || typeof body.notes === "string") updates.notes = body.notes;
    if (body.match_sub === null || typeof body.match_sub === "string")
      updates.match_sub = body.match_sub;
    if (body.match_iss === null || typeof body.match_iss === "string")
      updates.match_iss = body.match_iss;
    if (body.match_thumbprint === null || typeof body.match_thumbprint === "string") {
      updates.match_thumbprint = body.match_thumbprint;
    }
    const grant = await updateGrantFields(userId, req.params.id, updates as any);
    return res.json({ grant });
  } catch (error) {
    const mapped = grantsCommonHandlers.errorEnvelopeFromGrantError(error);
    if (mapped) {
      return res.status(mapped.statusCode).json(mapped.envelope);
    }
    return handleApiError(
      req,
      res,
      error,
      "Failed to update agent grant",
      "DB_QUERY_FAILED",
      "APIError:agents_grants_update"
    );
  }
});

async function setGrantStatusRoute(
  req: express.Request,
  res: express.Response,
  next: "active" | "suspended" | "revoked"
) {
  try {
    const userId = await getAuthenticatedUserId(
      req,
      (req.body?.user_id as string | undefined) ?? undefined
    );
    const { setStatus } = await import("./services/agent_grants.js");
    const grant = await setStatus(userId, req.params.id, next);
    return res.json({ grant });
  } catch (error) {
    const mapped = grantsCommonHandlers.errorEnvelopeFromGrantError(error);
    if (mapped) {
      return res.status(mapped.statusCode).json(mapped.envelope);
    }
    return handleApiError(
      req,
      res,
      error,
      `Failed to ${next === "active" ? "restore" : next} agent grant`,
      "DB_QUERY_FAILED",
      `APIError:agents_grants_${next}`
    );
  }
}

app.post("/agents/grants/:id/suspend", (req, res) => setGrantStatusRoute(req, res, "suspended"));
app.post("/agents/grants/:id/revoke", (req, res) => setGrantStatusRoute(req, res, "revoked"));
app.post("/agents/grants/:id/restore", (req, res) => setGrantStatusRoute(req, res, "active"));

// GET /api/agents/:key — One agent's identity + rollup counts
// REQUIRES AUTHENTICATION
app.get("/agents/:key", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const agentKey = decodeURIComponent(req.params.key);
    const agent = getAgent(userId, agentKey);
    if (!agent) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", `Agent not found: ${agentKey}`);
    }
    return res.json({ agent });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get agent",
      "DB_QUERY_FAILED",
      "APIError:agents_detail"
    );
  }
});

// GET /api/agents/:key/records — Records (observations / sources / relationships / etc.)
// written by this agent, in `RecordActivityItem` shape for reuse in the
// Inspector's activity feed component.
// REQUIRES AUTHENTICATION
app.get("/agents/:key/records", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const agentKey = decodeURIComponent(req.params.key);
    const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const result = listAgentRecords(userId, agentKey, limit, offset);
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list agent records",
      "DB_QUERY_FAILED",
      "APIError:agents_records"
    );
  }
});

// GET /recent_conversations/:conversation_id — Inspector: one conversation with nested messages
app.get("/recent_conversations/:conversation_id", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const conversationId = String(req.params.conversation_id ?? "").trim();
    const item = getRecentConversationById(userId, conversationId);
    if (!item) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Conversation not found");
    }
    return res.json(item);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to load conversation",
      "DB_QUERY_FAILED",
      "APIError:recent_conversation_detail"
    );
  }
});

// GET /recent_conversations — Inspector: conversations with nested messages (SQLite)
app.get("/recent_conversations", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const limit = parseInt(String(req.query.limit ?? "25"), 10) || 25;
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const activity_after =
      typeof req.query.activity_after === "string" ? req.query.activity_after.trim() || null : null;
    const activity_before =
      typeof req.query.activity_before === "string"
        ? req.query.activity_before.trim() || null
        : null;
    const agentKeyRaw = typeof req.query.agent_key === "string" ? req.query.agent_key.trim() : "";
    // UI and bookmarks may send agent_key=all; never treat that as a real deriveAgentKey value.
    const agent_key =
      agentKeyRaw.length > 0 && agentKeyRaw.toLowerCase() !== "all" ? agentKeyRaw : null;
    const result = listRecentConversations(userId, limit, offset, {
      activity_after,
      activity_before,
      agent_key,
    });
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list recent conversations",
      "DB_QUERY_FAILED",
      "APIError:recent_conversations"
    );
  }
});

// GET /turns — Inspector: paginated conversation_turn index
app.get("/turns", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const limit = parseInt(String(req.query.limit ?? "25"), 10) || 25;
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const harness = typeof req.query.harness === "string" ? req.query.harness.trim() || null : null;
    const status = typeof req.query.status === "string" ? req.query.status.trim() || null : null;
    const activity_after =
      typeof req.query.activity_after === "string" ? req.query.activity_after.trim() || null : null;
    const activity_before =
      typeof req.query.activity_before === "string"
        ? req.query.activity_before.trim() || null
        : null;
    const result = listConversationTurns(userId, limit, offset, {
      harness,
      status,
      activity_after,
      activity_before,
    });
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list turns",
      "DB_QUERY_FAILED",
      "APIError:turns"
    );
  }
});

// GET /turns/:turn_key — Inspector: conversation_turn detail
app.get("/turns/:turn_key", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const turnKey = decodeURIComponent(req.params.turn_key);
    const result = getConversationTurn(userId, turnKey);
    if (!result) {
      return res.status(404).json({ error: "Turn not found", code: "NOT_FOUND" });
    }
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get turn",
      "DB_QUERY_FAILED",
      "APIError:turn_detail"
    );
  }
});

// GET /admin/compliance/scorecard — Inspector: aggregated hook compliance (SQLite)
app.get("/admin/compliance/scorecard", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;
    const group_by = typeof req.query.group_by === "string" ? req.query.group_by : undefined;
    const min_turns = parseInt(String(req.query.min_turns ?? ""), 10);
    const min_backfill_rate = parseFloat(String(req.query.min_backfill_rate ?? ""));
    const top_missed_steps = parseInt(String(req.query.top_missed_steps ?? ""), 10);
    const include_synthetic =
      req.query.include_synthetic === "1" ||
      String(req.query.include_synthetic).toLowerCase() === "true";

    const result = buildComplianceScorecard(userId, {
      since,
      until,
      group_by,
      min_turns: Number.isFinite(min_turns) ? min_turns : undefined,
      min_backfill_rate: Number.isFinite(min_backfill_rate) ? min_backfill_rate : undefined,
      top_missed_steps: Number.isFinite(top_missed_steps) ? top_missed_steps : undefined,
      include_synthetic,
    });
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to build compliance scorecard",
      "DB_QUERY_FAILED",
      "APIError:compliance_scorecard"
    );
  }
});

// GET /api/sources - Get source list (FU-301)
app.get("/sources", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const search = req.query.search as string | undefined;
    const mimeType = req.query.mime_type as string | undefined;
    const sourceType = req.query.source_type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query - ALWAYS filter by authenticated user_id
    let query = db.from("sources").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

    // Filter by MIME/type query.
    // UX behavior: "wav" should match either MIME (audio/wav) OR filename extension (.wav).
    if (mimeType) {
      // SECURITY: strip commas so user input cannot break out of the
      // PostgREST-style `.or(...)` syntax and inject extra clauses. The `.or`
      // builder splits on commas to parse its parts. See docs/reports/
      // security_audit_2026_04_22.md S-3.
      const mimeNeedle = mimeType.trim().replace(/,/g, "");
      if (mimeNeedle.includes("/")) {
        query = query.ilike("mime_type", `%${mimeNeedle}%`);
      } else if (mimeNeedle.length > 0) {
        query = query.or(`mime_type.ilike.%${mimeNeedle}%,original_filename.ilike.%${mimeNeedle}%`);
      }
    }

    // Filter by source type (partial match for UX consistency)
    if (sourceType) {
      query = query.ilike("source_type", `%${sourceType}%`);
    }

    // Search in filenames
    if (search) {
      query = query.ilike("original_filename", `%${search}%`);
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
app.get("/sources/:id", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const sourceId = req.params.id;

    // Verify source exists and belongs to authenticated user
    const { data: source, error } = await db
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

    const filesystemAbsolutePath = resolveLocalSourceFilePath(
      source.storage_url as string | null | undefined
    );
    const payload =
      filesystemAbsolutePath != null
        ? { ...source, filesystem_absolute_path: filesystemAbsolutePath }
        : { ...source };

    return res.json(payload);
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

// GET /api/sources/:id/relationships - Relationships tied to this source
// Includes (1) relationship_observations stamped with this source_id and
// (2) relationship_snapshots touching any entity that has observations from this source.
// REQUIRES AUTHENTICATION
app.get("/sources/:id/relationships", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const sourceId = req.params.id;
    const expandEntities = req.query.expand_entities === "true";

    const { data: sourceRow, error: srcErr } = await db
      .from("sources")
      .select("id")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .single();

    if (srcErr || !sourceRow) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Source not found");
    }

    const snapByKey = new Map<string, Record<string, unknown>>();

    const { data: relObsRows, error: relObsErr } = await db
      .from("relationship_observations")
      .select("relationship_key")
      .eq("source_id", sourceId)
      .eq("user_id", userId);

    if (relObsErr) throw relObsErr;

    const keysFromRelObs = [
      ...new Set(
        (relObsRows || [])
          .map((r: { relationship_key?: string }) => r.relationship_key)
          .filter((k: string | undefined): k is string => typeof k === "string" && k.length > 0)
      ),
    ];

    if (keysFromRelObs.length > 0) {
      const { data: snapsFromKeys, error: snapsErr } = await db
        .from("relationship_snapshots")
        .select("*")
        .in("relationship_key", keysFromRelObs)
        .eq("user_id", userId);

      if (snapsErr) throw snapsErr;
      for (const row of snapsFromKeys || []) {
        snapByKey.set(
          (row as { relationship_key: string }).relationship_key,
          row as Record<string, unknown>
        );
      }
    }

    const { data: obsRows, error: obsErr } = await db
      .from("observations")
      .select("entity_id")
      .eq("source_id", sourceId)
      .eq("user_id", userId);

    if (obsErr) throw obsErr;

    const entityIds = [
      ...new Set(
        (obsRows || [])
          .map((o: { entity_id?: string }) => o.entity_id)
          .filter((e: string | undefined): e is string => typeof e === "string" && e.length > 0)
      ),
    ];

    if (entityIds.length > 0) {
      const { data: outSnaps, error: outErr } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("user_id", userId)
        .in("source_entity_id", entityIds);

      if (outErr) throw outErr;
      for (const row of outSnaps || []) {
        const rel = row as { relationship_key: string };
        snapByKey.set(rel.relationship_key, row as Record<string, unknown>);
      }

      const { data: inSnaps, error: inErr } = await db
        .from("relationship_snapshots")
        .select("*")
        .eq("user_id", userId)
        .in("target_entity_id", entityIds);

      if (inErr) throw inErr;
      for (const row of inSnaps || []) {
        const rel = row as { relationship_key: string };
        snapByKey.set(rel.relationship_key, row as Record<string, unknown>);
      }
    }

    let relationships = [...snapByKey.values()].map((rel) => ({
      ...rel,
      id: rel.relationship_key,
    })) as Array<Record<string, unknown>>;

    relationships.sort((a, b) =>
      String(b.last_observation_at ?? "").localeCompare(String(a.last_observation_at ?? ""))
    );

    let relatedEntities: Record<string, unknown> | undefined;

    if (expandEntities && relationships.length > 0) {
      const relatedIds = new Set<string>();
      for (const rel of relationships) {
        const sId = rel.source_entity_id as string | undefined;
        const tId = rel.target_entity_id as string | undefined;
        if (sId) relatedIds.add(sId);
        if (tId) relatedIds.add(tId);
      }

      if (relatedIds.size > 0) {
        const idsArr = Array.from(relatedIds);
        const [snapshotsResult, entitiesResult] = await Promise.all([
          db.from("entity_snapshots").select("*").in("entity_id", idsArr).eq("user_id", userId),
          db
            .from("entities")
            .select("id, canonical_name, entity_type")
            .in("id", idsArr)
            .eq("user_id", userId),
        ]);

        const canonicalNames = new Map<string, string>();
        const entityTypes = new Map<string, string>();
        if (!entitiesResult.error && entitiesResult.data) {
          for (const ent of entitiesResult.data as Array<{
            id: string;
            canonical_name?: string;
            entity_type?: string;
          }>) {
            if (ent.canonical_name) canonicalNames.set(ent.id, ent.canonical_name);
            if (ent.entity_type) entityTypes.set(ent.id, ent.entity_type);
          }
        }

        relatedEntities = {};
        if (!snapshotsResult.error && snapshotsResult.data) {
          for (const e of snapshotsResult.data as Array<
            Record<string, unknown> & { entity_id?: string }
          >) {
            const eid = e.entity_id;
            if (!eid) continue;
            if (!e.canonical_name && canonicalNames.has(eid)) {
              e.canonical_name = canonicalNames.get(eid);
            }
            if (!e.entity_type && entityTypes.has(eid)) {
              e.entity_type = entityTypes.get(eid);
            }
            relatedEntities[eid] = e;
          }
        }
        for (const rid of idsArr) {
          if (relatedEntities[rid]) continue;
          relatedEntities[rid] = {
            entity_id: rid,
            canonical_name: canonicalNames.get(rid) ?? null,
            entity_type: entityTypes.get(rid) ?? null,
          };
        }

        try {
          const { SchemaRegistryService } = await import("./services/schema_registry.js");
          const registry = new SchemaRegistryService();
          const distinctTypes = [...new Set(Array.from(entityTypes.values()).filter(Boolean))];
          const labelByType = new Map<string, string>();
          for (const t of distinctTypes) {
            const schema = await registry.loadActiveSchema(t, userId);
            if (schema?.metadata?.label) labelByType.set(t, schema.metadata.label as string);
          }
          for (const rid of Object.keys(relatedEntities)) {
            const type = (relatedEntities[rid] as { entity_type?: string }).entity_type;
            if (type && labelByType.has(type)) {
              (relatedEntities[rid] as { entity_type_label?: string }).entity_type_label =
                labelByType.get(type);
            }
          }
        } catch (err) {
          console.warn(
            "Failed to attach entity_type_label to related entities (source relationships):",
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    if (expandEntities && relatedEntities) {
      relationships = relationships.map((rel) => {
        const src = relatedEntities![rel.source_entity_id as string] as
          | { canonical_name?: string; entity_type?: string; entity_type_label?: string }
          | undefined;
        const tgt = relatedEntities![rel.target_entity_id as string] as
          | { canonical_name?: string; entity_type?: string; entity_type_label?: string }
          | undefined;
        return {
          ...rel,
          source_entity_name: src?.canonical_name ?? null,
          source_entity_type: src?.entity_type ?? null,
          source_entity_type_label: src?.entity_type_label ?? null,
          target_entity_name: tgt?.canonical_name ?? null,
          target_entity_type: tgt?.entity_type ?? null,
          target_entity_type_label: tgt?.entity_type_label ?? null,
        };
      });
    }

    const attributionByKey = await fetchLatestRelationshipAttribution(
      relationships.map((r) => r.relationship_key as string),
      userId
    );

    relationships = relationships.map((rel) => ({
      ...rel,
      agent_attribution: attributionByKey[rel.relationship_key as string] ?? null,
    }));

    const responseBody: Record<string, unknown> = { relationships };
    if (relatedEntities) {
      responseBody.related_entities = relatedEntities;
    }

    return res.json(responseBody);
  } catch (error) {
    logError("APIError:source_relationships", req, error);
    const message = error instanceof Error ? error.message : "Failed to get source relationships";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// GET /api/sources/:id/content - Download raw source file content
// REQUIRES AUTHENTICATION - verifies source belongs to authenticated user
app.get("/sources/:id/content", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const sourceId = req.params.id;

    const { data: source, error } = await db
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .eq("user_id", userId)
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
    let sourceToServe = source;

    // Some observations point to a structured JSON source row, while the actual
    // file (PDF/CSV/etc.) exists as a sibling source with the same filename.
    if (
      (source.mime_type || "").toLowerCase() === "application/json" &&
      typeof source.original_filename === "string" &&
      source.original_filename.trim()
    ) {
      const { data: siblingSource, error: siblingError } = await db
        .from("sources")
        .select("*")
        .eq("user_id", userId)
        .eq("original_filename", source.original_filename)
        .not("id", "eq", source.id)
        .not("mime_type", "eq", "application/json")
        .order("file_size", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (siblingError) throw siblingError;
      if (siblingSource?.storage_url) {
        sourceToServe = siblingSource;
      }
    }

    if (!sourceToServe.storage_url) {
      return sendError(res, 404, "NO_CONTENT", "Source has no stored file content");
    }

    const buffer = await downloadRawContent(sourceToServe.storage_url);
    const filename = sourceToServe.original_filename || `source-${sourceId}`;
    const rawMime = (sourceToServe.mime_type || "").trim().toLowerCase();
    let mimeType = (sourceToServe.mime_type || "").trim() || "application/octet-stream";
    if (!rawMime || rawMime === "application/octet-stream") {
      const f = filename.toLowerCase();
      if (f.endsWith(".wav")) mimeType = "audio/wav";
      else if (f.endsWith(".mp3")) mimeType = "audio/mpeg";
      else if (f.endsWith(".m4a")) mimeType = "audio/mp4";
      else if (f.endsWith(".aac")) mimeType = "audio/aac";
      else if (f.endsWith(".ogg") || f.endsWith(".oga")) mimeType = "audio/ogg";
      else if (f.endsWith(".flac")) mimeType = "audio/flac";
      else if (f.endsWith(".webm")) mimeType = "audio/webm";
      else if (f.endsWith(".pdf")) mimeType = "application/pdf";
      else if (f.endsWith(".png")) mimeType = "image/png";
      else if (f.endsWith(".jpg") || f.endsWith(".jpeg")) mimeType = "image/jpeg";
      else if (f.endsWith(".gif")) mimeType = "image/gif";
      else if (f.endsWith(".webp")) mimeType = "image/webp";
    }
    const inline = /^(application\/pdf|text\/|image\/|audio\/)/i.test(mimeType);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${filename.replace(/"/g, '\\"')}"`
    );
    return res.send(buffer);
  } catch (error) {
    if (error instanceof SourceFileNotFoundError) {
      return sendError(res, 404, "SOURCE_FILE_NOT_FOUND", error.message);
    }
    return handleApiError(
      req,
      res,
      error,
      "Failed to download source content",
      "DOWNLOAD_FAILED",
      "APIError:source_content"
    );
  }
});

// GET /api/interpretations - Get interpretations with filters (FU-302)
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.get("/interpretations", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const sourceId = req.query.source_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query - ALWAYS filter by authenticated user_id
    let query = db.from("interpretations").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

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

app.post("/interpretations/create", async (req, res) => {
  const parsed = CreateInterpretationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:interpretations_create", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { data: source, error: sourceError } = await db
      .from("sources")
      .select("id")
      .eq("id", parsed.data.source_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) {
      return sendError(res, 404, "SOURCE_NOT_FOUND", "Source not found for authenticated user");
    }

    const { runInterpretation } = await import("./services/interpretation.js");
    const interpretationResult = await runInterpretation({
      userId,
      sourceId: parsed.data.source_id,
      extractedData: parsed.data.entities as Record<string, unknown>[],
      config: normalizeInterpretationConfig(parsed.data.interpretation_config) as any,
    });

    const relationshipsCreated: Array<{
      relationship_type: string;
      source_entity_id: string;
      target_entity_id: string;
    }> = [];
    if (parsed.data.relationships?.length) {
      const { relationshipsService } = await import("./services/relationships.js");
      for (const rel of parsed.data.relationships as StoreRelationshipRef[]) {
        const sourceEntityId =
          typeof rel.source_entity_id === "string"
            ? rel.source_entity_id
            : typeof rel.source_index === "number"
              ? interpretationResult.entities[rel.source_index]?.entityId
              : undefined;
        const targetEntityId =
          typeof rel.target_entity_id === "string"
            ? rel.target_entity_id
            : typeof rel.target_index === "number"
              ? interpretationResult.entities[rel.target_index]?.entityId
              : undefined;
        if (!sourceEntityId || !targetEntityId) continue;
        if (typeof rel.source_entity_id === "string" && !isNeotomaEntityId(sourceEntityId)) {
          logger.warn(
            `[interpretations/create] Skipping relationship: invalid source_entity_id ` +
              `(expected ent_ + 24 hex): ${String(rel.source_entity_id)}`
          );
          continue;
        }
        if (typeof rel.target_entity_id === "string" && !isNeotomaEntityId(targetEntityId)) {
          logger.warn(
            `[interpretations/create] Skipping relationship: invalid target_entity_id ` +
              `(expected ent_ + 24 hex): ${String(rel.target_entity_id)}`
          );
          continue;
        }
        await relationshipsService.createRelationship({
          source_entity_id: sourceEntityId,
          target_entity_id: targetEntityId,
          relationship_type: rel.relationship_type as never,
          source_id: parsed.data.source_id,
          metadata: rel.metadata ?? {},
          user_id: userId,
        });
        relationshipsCreated.push({
          relationship_type: rel.relationship_type,
          source_entity_id: sourceEntityId,
          target_entity_id: targetEntityId,
        });
      }
    }

    return res.json({
      success: true,
      interpretation_id: interpretationResult.interpretationId,
      source_id: parsed.data.source_id,
      entities: interpretationResult.entities.map((entity) => ({
        entity_id: entity.entityId,
        entity_type: entity.entityType,
        observation_id: entity.observationId,
      })),
      observations_created: interpretationResult.observationsCreated,
      unknown_fields_count: interpretationResult.unknownFieldsCount,
      relationships_created: relationshipsCreated,
    });
  } catch (error) {
    logError("APIError:interpretations_create", req, error);
    const message = error instanceof Error ? error.message : "Failed to create interpretation";
    return sendError(res, 500, "INTERPRETATION_CREATE_FAILED", message);
  }
});

// GET /api/observations - Get observations with filters (FU-302, FU-601)
// REQUIRES AUTHENTICATION - all queries filtered by authenticated user_id
app.get("/observations", async (req, res) => {
  try {
    // Get authenticated user_id (REQUIRED)
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);

    const sourceId = req.query.source_id as string | undefined;
    const entityId = req.query.entity_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Build query - ALWAYS filter by authenticated user_id
    let query = db.from("observations").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

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

    const rows = (data || []) as Record<string, unknown>[];
    const enriched = await attachSourceLabelsToObservations(userId, rows);

    return res.json({
      observations: enriched,
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
app.get("/stats", async (req, res) => {
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

// GET /access_policies - List effective guest access policies
// REQUIRES AUTHENTICATION
app.get("/access_policies", async (req, res) => {
  try {
    await getAuthenticatedUserId(req);

    const { loadAccessPolicies, DEFAULT_MODE } = await import("./services/access_policy.js");
    const policies = await loadAccessPolicies();

    return res.json({ policies, default_mode: DEFAULT_MODE });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to load access policies",
      "DB_QUERY_FAILED",
      "APIError:access_policies"
    );
  }
});

// POST /api/observations/create - Create observation for entity
// REQUIRES AUTHENTICATION - validates user_id matches authenticated user
app.post("/observations/create", async (req, res) => {
  const schema = z.object({
    entity_type: z.string(),
    entity_identifier: z.string(),
    fields: z.record(z.unknown()),
    source_priority: z.number().optional().default(100),
    observation_source: z
      .enum(["sensor", "llm_summary", "workflow_state", "human", "import", "sync"])
      .optional(),
    source_peer_id: z.string().min(1).optional(),
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

    const {
      entity_type,
      entity_identifier,
      fields,
      source_priority,
      observation_source,
      source_peer_id,
      user_id,
    } = parsed.data;

    // SECURITY: Ensure provided user_id matches authenticated user
    if (user_id !== authenticatedUserId) {
      return res
        .status(403)
        .json(buildErrorEnvelope("FORBIDDEN", "user_id does not match authenticated user."));
    }

    const { resolveEntity } = await import("./services/entity_resolution.js");
    const { createObservation } = await import("./services/observation_storage.js");
    const { getSnapshot, recomputeSnapshot } = await import("./services/snapshot_computation.js");

    const entity_id = await resolveEntity({
      entityType: entity_type,
      fields: { name: entity_identifier },
      userId: user_id,
    });

    const obsData = await createObservation({
      entity_id,
      entity_type,
      schema_version: "1.0",
      source_id: null,
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 1.0,
      source_priority,
      observation_source,
      source_peer_id,
      fields,
      user_id,
    });

    await recomputeSnapshot(entity_id, user_id);
    const snapshot = await getSnapshot(entity_id, user_id);

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

type StoreRelationshipRef = {
  relationship_type: string;
  source_index?: number;
  target_index?: number;
  source_entity_id?: string;
  target_entity_id?: string;
  metadata?: Record<string, unknown>;
};

function normalizeInterpretationConfig(
  configInput?: Record<string, unknown>
): Record<string, unknown> {
  return {
    extractor_type: "agent",
    extractor_version: "unknown",
    schema_version: "1.0",
    ...configInput,
  };
}

async function createInterpretationRunForSource(params: {
  userId: string;
  sourceId: string;
  interpretationConfig?: Record<string, unknown>;
}): Promise<string> {
  enforceAttributionPolicy("interpretations", getCurrentAgentIdentity());
  const attribution = getCurrentAttribution();
  const { data, error } = await db
    .from("interpretations")
    .insert({
      user_id: params.userId,
      source_id: params.sourceId,
      interpretation_config: normalizeInterpretationConfig(params.interpretationConfig),
      status: "running",
      started_at: new Date().toISOString(),
      ...(Object.keys(attribution).length > 0 ? { provenance: attribution } : {}),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create interpretation run: ${error.message}`);
  }
  return data.id as string;
}

async function completeInterpretationRun(params: {
  interpretationId: string;
  observationsCreated: number;
  unknownFieldsCount?: number;
}): Promise<void> {
  await db
    .from("interpretations")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      observations_created: params.observationsCreated,
      unknown_fields_count: params.unknownFieldsCount ?? 0,
    })
    .eq("id", params.interpretationId);
}

export async function storeStructuredForApi(params: {
  userId: string;
  entities: Record<string, unknown>[];
  sourcePriority: number;
  observationSource?: import("./shared/action_schemas.js").ObservationSource;
  /** When set, written observations carry this peer id for sync loop prevention. */
  sourcePeerId?: string | null;
  idempotencyKey: string;
  originalFilename?: string;
  relationships?: StoreRelationshipRef[];
  interpretation?: StoreInterpretationInput;
  interpretationSourceId?: string;
  commit?: boolean;
  strict?: boolean;
}) {
  const {
    userId,
    entities,
    sourcePriority,
    observationSource,
    sourcePeerId,
    idempotencyKey,
    originalFilename,
    relationships,
    interpretation,
    interpretationSourceId,
    commit: commitInput,
    strict: strictInput,
  } = params;
  const commit = commitInput !== false;
  const strict = strictInput === true;

  // Access policy: when the caller is a guest (AAuth-verified but not admitted
  // via a grant), check per-entity-type access policies. If the policy allows
  // guest writes, the request proceeds without requiring an agent_grant.
  const requestContext = getRequestContext();
  const agentIdentity = getCurrentAgentIdentity();
  const admission = getCurrentAAuthAdmission();
  const isAAuthVerified = agentIdentity?.thumbprint != null;
  const isGuest = isAAuthVerified && (!admission || !admission.admitted);

  if (isGuest && !requestContext?.bypassGuestStoreAccessPolicy) {
    const entityTypes = entities
      .map((entity) => entity?.entity_type)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    const guestId: GuestIdentity = {
      thumbprint: agentIdentity.thumbprint,
      sub: agentIdentity.sub,
      iss: agentIdentity.iss,
    };
    await assertGuestWriteAllowed(entityTypes, guestId);
  }

  // Capability scoping: when the caller is an AAuth-verified agent covered
  // by the capability registry, gate store_structured by entity_type here
  // before any writes touch the DB. Guests who passed access policy above
  // skip grant-based capability enforcement. Unknown / anonymous callers
  // fall through (attribution_policy still gates their writes downstream).
  const capabilityCtx = contextFromAgentIdentity(getCurrentAgentIdentity());
  if (capabilityCtx && !isGuest) {
    const entityTypes = entities
      .map((entity) => entity?.entity_type)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    enforceAgentCapability("store", entityTypes, capabilityCtx);
    const relationshipOp = Array.isArray(relationships) && relationships.length > 0;
    if (relationshipOp) {
      enforceAgentCapability("create_relationship", entityTypes, capabilityCtx);
    }
  }

  // Protected-entity-types guard: governance state (`agent_grant`, etc.)
  // is gated by an explicit capability on the admitted grant. Mirrors
  // the same check made deep in `createObservation` so callers see a
  // structured `capability_denied` envelope before any writes.
  {
    const entityTypes = entities
      .map((entity) => entity?.entity_type)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    assertCanWriteProtectedBatch({
      entity_types: entityTypes,
      op: "store",
      identity: getCurrentAgentIdentity(),
      admission: getCurrentAAuthAdmission(),
    });
  }

  const { resolveEntityWithTrace, CanonicalNameUnresolvedError, MergeRefusedError } =
    await import("./services/entity_resolution.js");
  const { detectFlatPackedRows, FlatPackedRowsError } =
    await import("./services/flat_packed_detection.js");
  // R4: lazy import so the structured-store handler can attach required
  // identity-field hints when resolving fails under a reject policy.
  const registryModule = await import("./services/schema_registry.js");
  const deriveRequiredIdentityFields = registryModule.deriveRequiredIdentityFields;
  type RequiredIdentityFields = NonNullable<
    Awaited<ReturnType<typeof deriveRequiredIdentityFields>>
  >;

  // Reject flat-packed rows (whole tables smuggled into a single entity as
  // `<prefix>_<index>_<suffix>` keys). These cannot produce per-row snapshots
  // and are almost always a caller bug. The caller should split into one
  // entity per row and retry.
  for (const entityData of entities) {
    const detection = detectFlatPackedRows(entityData as Record<string, unknown>);
    if (detection.detected) {
      throw new FlatPackedRowsError(detection);
    }
  }

  const { data: existingSource, error: existingSourceError } = await db
    .from("sources")
    .select("id")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingSourceError) {
    throw existingSourceError;
  }

  if (existingSource) {
    const { listObservationsForSource } = await import("./services/observation_storage.js");
    const existingObs = await listObservationsForSource(existingSource.id, userId);

    const existingEntities = existingObs.map((obs) => ({
      entity_id: obs.entity_id,
      entity_type: obs.entity_type,
      observation_id: obs.id,
    }));

    // Idempotency replay: the source row already exists for
    // (user_id, idempotency_key). No new observations or entities were
    // written. Callers distinguish this from a zero-commit fresh write via the
    // `replayed: true` flag (v0.5.1+). See docs/architecture/idempotence_pattern.md.
    return {
      success: true,
      replayed: true,
      source_id: existingSource.id,
      entities_created: 0,
      observations_created: existingEntities.length,
      entities: existingEntities,
    };
  }

  const { createObservation } = await import("./services/observation_storage.js");

  const jsonContent = JSON.stringify(entities, (key, value) => {
    if (typeof value === "bigint") {
      return Number(value);
    }
    return value;
  });
  const filenameForStorage = originalFilename?.trim() || undefined;
  const storageResult = await storeRawContent({
    userId,
    fileBuffer: Buffer.from(jsonContent, "utf-8"),
    mimeType: "application/json",
    originalFilename: filenameForStorage,
    idempotencyKey,
    provenance: {
      upload_method: "api_store",
      client: "api",
      source_priority: sourcePriority,
    },
  });

  const resolvedInterpretationSourceId =
    interpretation?.source_id ??
    interpretationSourceId ??
    (interpretation?.source_ref === "structured" ? storageResult.sourceId : undefined);
  const interpretationId =
    commit && interpretation && resolvedInterpretationSourceId
      ? await createInterpretationRunForSource({
          userId,
          sourceId: resolvedInterpretationSourceId,
          interpretationConfig: interpretation.interpretation_config,
        })
      : null;
  const observationSourceId = resolvedInterpretationSourceId ?? storageResult.sourceId;

  // Two-pass: first resolve every entity with trace (so CanonicalNameUnresolvedError
  // / MergeRefusedError land per-observation before any writes), then commit
  // observations/snapshots/relationships. In plan mode we stop after pass 1.
  interface ResolvedEntity {
    observation_index: number;
    entity_type: string;
    entity_id: string;
    fields: Record<string, unknown>;
    trace: {
      canonical_name: string;
      resolver_path: string[];
      identity_basis: string;
      identity_rule: string;
      action: "created" | "matched_existing" | "would_create" | "would_match_existing" | "extended";
      /**
       * Non-fatal resolver warnings (R2/R3). Present when a schema declares
       * `name_collision_policy: "warn"` and resolution landed on an existing
       * entity via a heuristic path. See `ResolverWarning` in
       * `src/services/entity_resolution.ts`.
       */
      warnings?: Array<{
        code: string;
        policy: string;
        entity_type: string;
        identity_basis: string;
        identity_rule: string;
      }>;
    };
    intent?: string;
    targetId?: string;
  }

  interface ResolutionIssue {
    observation_index: number;
    entity_type: string;
    code:
      | "ERR_CANONICAL_NAME_UNRESOLVED"
      | "ERR_MERGE_REFUSED"
      | "ERR_CONVERSATION_MESSAGE_ROLE_CONFLICT";
    message: string;
    details: Record<string, unknown>;
    /**
     * R4: hint may be a free-form string (legacy attributes-hint) or a
     * structured object when derived from a schema `name_collision_policy:
     * reject` refusal. See OpenAPI `StoreResolutionIssue.hint` oneOf and
     * `RequiredIdentityFields`.
     */
    hint?: string | { text: string; required_identity_fields?: RequiredIdentityFields };
  }

  // v0.5.1: structured guidance for the v0.5.0 breaking change where callers
  // nested fields under `attributes`. If resolution failed and the only
  // observed top-level keys are `attributes` (plus optionally `entity_type`),
  // surface a hint pointing callers at the flat-payload convention.
  function buildAttributesHint(seenFields: unknown): string | undefined {
    if (!Array.isArray(seenFields)) return undefined;
    const keys = seenFields.filter((k): k is string => typeof k === "string");
    if (keys.length === 0) return undefined;
    const nonMetaKeys = keys.filter((k) => k !== "entity_type");
    if (nonMetaKeys.length === 1 && nonMetaKeys[0] === "attributes") {
      return (
        "Payload nests fields under `attributes`. Since v0.5.0, /store expects " +
        "fields at the top level of each entity object (e.g. `{ entity_type, " +
        "title, canonical_name, ... }`). Move keys out of `attributes` and retry."
      );
    }
    return undefined;
  }

  const resolved: ResolvedEntity[] = [];
  const issues: ResolutionIssue[] = [];

  for (let observation_index = 0; observation_index < entities.length; observation_index++) {
    const entityData = entities[observation_index];
    let entity_type = entityData.entity_type as string;
    if (!entity_type) {
      throw new Error("entity_type is required for each entity");
    }

    // Per-entity overrides: `intent: "create_new"` is shorthand for strict on
    // this record; `target_id` forces extend mode (bypass derivation).
    const intent =
      typeof (entityData as Record<string, unknown>).intent === "string"
        ? ((entityData as Record<string, unknown>).intent as string)
        : undefined;
    const targetId =
      typeof (entityData as Record<string, unknown>).target_id === "string"
        ? ((entityData as Record<string, unknown>).target_id as string)
        : undefined;
    const effectiveStrict = strict || intent === "create_new";

    // Schema-agnostic duplicate-type collapse (e.g. `places` -> `place`,
    // aliased-type -> canonical). Applied before storing so the resolved
    // entity_id hashes into the canonical type rather than a near-duplicate.
    try {
      const { schemaRegistry } = await import("./services/schema_registry.js");
      const active = await schemaRegistry.loadActiveSchema(entity_type, userId);
      if (!active) {
        const { findEquivalentEntityType } = await import("./services/entity_type_equivalence.js");
        const match = await findEquivalentEntityType(entity_type, { userId });
        if (match) {
          logger.warn(
            `[STORE] Collapsing new entity_type "${entity_type}" -> existing ` +
              `"${match.canonical_entity_type}" (reason: ${match.reason}).`
          );
          entity_type = match.canonical_entity_type;
        }
      }
    } catch (equivErr) {
      logger.warn(
        `Equivalence check failed for ${entity_type}: ${
          equivErr instanceof Error ? equivErr.message : String(equivErr)
        }`
      );
    }

    const {
      entity_type: _removedType,
      intent: _removedIntent,
      target_id: _removedTargetId,
      ...fields
    } = entityData as Record<string, unknown>;
    void _removedType;
    void _removedIntent;
    void _removedTargetId;

    try {
      const result = await resolveEntityWithTrace({
        entityType: entity_type,
        fields,
        userId,
        commit,
        strict: effectiveStrict,
        targetId,
      });
      resolved.push({
        observation_index,
        entity_type,
        entity_id: result.entityId,
        fields,
        trace: {
          canonical_name: result.trace.canonicalName,
          resolver_path: result.trace.path,
          identity_basis: result.trace.identityBasis,
          identity_rule: result.trace.identityRule,
          action: result.trace.action,
          ...(result.trace.warnings && result.trace.warnings.length > 0
            ? {
                warnings: result.trace.warnings.map((w) => ({
                  code: w.code,
                  policy: w.policy,
                  entity_type: w.entityType,
                  identity_basis: w.identityBasis,
                  identity_rule: w.identityRule,
                })),
              }
            : {}),
        },
        intent,
        targetId,
      });
    } catch (err) {
      if (err instanceof CanonicalNameUnresolvedError) {
        const hint = buildAttributesHint(err.seenFields);
        issues.push({
          observation_index,
          entity_type,
          code: "ERR_CANONICAL_NAME_UNRESOLVED",
          message: err.message,
          details: {
            seen_fields: err.seenFields,
            attempted_value: err.attemptedValue,
          },
          ...(hint ? { hint } : {}),
        });
      } else if (err instanceof MergeRefusedError) {
        // R4: when the refusal comes from a schema `name_collision_policy: reject`,
        // include a structured hint listing the caller-facing identity fields so
        // the agent sees exactly which key(s) to supply on the next attempt. The
        // derivation reads the schema registry — no per-type branching here.
        let hint: { text: string; required_identity_fields?: RequiredIdentityFields } | undefined;
        if (err.reason === "schema_policy") {
          try {
            const required = await deriveRequiredIdentityFields(entity_type, userId);
            if (
              required &&
              (required.anyOfFields.length > 0 || required.compositeFields.length > 0)
            ) {
              const anyLabel =
                required.anyOfFields.length > 0
                  ? required.anyOfFields.map((f) => `\`${f}\``).join(" or ")
                  : "";
              const compositeLabel =
                required.compositeFields.length > 0
                  ? required.compositeFields
                      .map((group) => `all of [${group.map((f) => `\`${f}\``).join(", ")}]`)
                      .join(" or ")
                  : "";
              const combined = [anyLabel, compositeLabel].filter(Boolean).join(" or ");
              hint = {
                text:
                  `Declare ${combined} on entity_type "${entity_type}" to match deterministically. ` +
                  "See docs/foundation/entity_resolution.md.",
                required_identity_fields: required,
              };
            }
          } catch {
            // Hint is best-effort; never block the error surface on registry IO.
          }
        }
        issues.push({
          observation_index,
          entity_type,
          code: "ERR_MERGE_REFUSED",
          message: err.message,
          details: {
            entity_id: err.entityId,
            canonical_name: err.canonicalName,
            resolver_path: err.resolverPath,
            reason: err.reason,
            ...(err.policy ? { policy: err.policy } : {}),
          },
          ...(hint ? { hint } : {}),
        });
      } else {
        throw err;
      }
    }
  }

  function isConversationMessageEntityType(entityType: string): boolean {
    const t = entityType.toLowerCase();
    return t === "conversation_message" || t === "agent_message";
  }

  function senderKindFromSnapshotOrFields(snap: Record<string, unknown>): string | undefined {
    const raw = snap.sender_kind ?? snap.role;
    if (typeof raw === "string") return raw.toLowerCase().trim();
    return undefined;
  }

  function turnKeyFromSnapshotOrFields(snap: Record<string, unknown>): string {
    const tk = snap.turn_key;
    return typeof tk === "string" ? tk.trim() : "";
  }

  function overlayConversationMessageFields(
    base: Record<string, unknown>,
    incoming: Record<string, unknown>
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const k of ["sender_kind", "role", "content", "turn_key"] as const) {
      if (k in incoming) {
        out[k] = incoming[k];
      }
    }
    return out;
  }

  const orderedResolved = [...resolved].sort((a, b) => a.observation_index - b.observation_index);
  const snapshotCache = new Map<string, Record<string, unknown>>();
  const rolledConversationMessage = new Map<string, Record<string, unknown>>();

  for (const r of orderedResolved) {
    if (!isConversationMessageEntityType(r.entity_type)) continue;

    const incomingSender = senderKindFromSnapshotOrFields(r.fields);
    const incomingTurnKey = turnKeyFromSnapshotOrFields(r.fields);
    if (!incomingTurnKey) continue;

    let priorDb = snapshotCache.get(r.entity_id);
    if (priorDb === undefined) {
      const { data: priorSnapRow } = await db
        .from("entity_snapshots")
        .select("snapshot")
        .eq("entity_id", r.entity_id)
        .eq("user_id", userId)
        .maybeSingle();
      priorDb = (priorSnapRow?.snapshot as Record<string, unknown> | null | undefined) ?? {};
      snapshotCache.set(r.entity_id, priorDb);
    }

    const rolled =
      rolledConversationMessage.get(r.entity_id) ??
      (Object.keys(priorDb).length > 0 ? { ...priorDb } : {});

    const priorSender = senderKindFromSnapshotOrFields(rolled);
    const priorTurnKey = turnKeyFromSnapshotOrFields(rolled);

    if (
      incomingSender === "assistant" &&
      priorSender === "user" &&
      priorTurnKey === incomingTurnKey
    ) {
      issues.push({
        observation_index: r.observation_index,
        entity_type: r.entity_type,
        code: "ERR_CONVERSATION_MESSAGE_ROLE_CONFLICT",
        message:
          "conversation_message would merge assistant payload into the existing user message row because `turn_key` matches the user-phase key. Use `{conversation_id}:{turn_id}:assistant` for the closing message.",
        details: {
          entity_id: r.entity_id,
          turn_key: incomingTurnKey,
          prior_sender_kind: priorSender,
          incoming_sender_kind: incomingSender,
        },
        hint: 'Set turn_key to "{conversation_id}:{turn_id}:assistant" for the assistant closing store; never reuse the user-phase turn_key without that suffix.',
      });
    }

    rolledConversationMessage.set(r.entity_id, overlayConversationMessageFields(rolled, r.fields));
  }

  if (issues.length > 0) {
    const aggregate = new Error(
      `Structured store refused: ${issues.length} observation(s) failed resolution.`
    ) as Error & {
      code: string;
      issues: ResolutionIssue[];
    };
    aggregate.code = "ERR_STORE_RESOLUTION_FAILED";
    aggregate.issues = issues;
    throw aggregate;
  }

  const createdEntities: Array<{
    entity_id: string;
    entity_type: string;
    observation_id: string | null;
    observation_index: number;
    action: ResolvedEntity["trace"]["action"];
    canonical_name: string;
    resolver_path: string[];
    identity_basis: string;
    identity_rule: string;
    warnings?: ResolvedEntity["trace"]["warnings"];
    entity_snapshot_after: Record<string, unknown> | null;
  }> = [];

  for (const r of resolved) {
    let observation_id: string | null = null;
    let snapshotAfter: Record<string, unknown> | null = null;

    if (commit) {
      const { data: priorSnapRow } = await db
        .from("entity_snapshots")
        .select("snapshot")
        .eq("entity_id", r.entity_id)
        .eq("user_id", userId)
        .maybeSingle();
      const priorSnapshot =
        (priorSnapRow?.snapshot as Record<string, unknown> | null | undefined) ?? {};

      const obsData = await createObservation({
        entity_id: r.entity_id,
        entity_type: r.entity_type,
        schema_version: "1.0",
        source_id: observationSourceId,
        interpretation_id: interpretationId,
        observed_at: new Date().toISOString(),
        specificity_score: 1.0,
        source_priority: sourcePriority,
        observation_source: observationSource,
        source_peer_id: sourcePeerId ?? undefined,
        fields: r.fields,
        user_id: userId,
        identity_basis: r.trace.identity_basis,
        identity_rule: r.trace.identity_rule,
      });
      observation_id = obsData.id;

      try {
        const { recomputeSnapshot } = await import("./services/snapshot_computation.js");
        const snap = await recomputeSnapshot(r.entity_id, userId);
        snapshotAfter =
          (snap as { snapshot?: Record<string, unknown> } | null | undefined)?.snapshot ?? null;
      } catch (snapshotErr) {
        logger.warn(`Snapshot recompute failed for ${r.entity_id}: ${snapshotErr}`);
      }

      const obsRow = obsData as { observed_at?: string; id: string };
      const emitTs = obsRow.observed_at ?? new Date().toISOString();
      const obsSourceLabel =
        observationSource === undefined || observationSource === null
          ? "llm_summary"
          : String(observationSource);
      emitObservationCreated({
        user_id: userId,
        entity_id: r.entity_id,
        entity_type: r.entity_type,
        observation_id: obsRow.id,
        timestamp: emitTs,
        source_id: observationSourceId,
        idempotency_key: idempotencyKey,
        observation_source: obsSourceLabel,
        source_peer_id: sourcePeerId ?? undefined,
      });
      if (snapshotAfter) {
        const isNewEntity = r.trace.action === "created";
        emitEntitySnapshotChange({
          user_id: userId,
          entity_id: r.entity_id,
          entity_type: r.entity_type,
          event_type: isNewEntity ? "entity.created" : "entity.updated",
          timestamp: emitTs,
          observation_id: obsRow.id,
          fields_changed: isNewEntity
            ? undefined
            : shallowFieldsChanged(priorSnapshot, snapshotAfter),
          source_id: observationSourceId,
          idempotency_key: idempotencyKey,
          observation_source: obsSourceLabel,
          source_peer_id: sourcePeerId ?? undefined,
        });
      }

      // Schema-driven auto-linking: if the entity's active schema declares
      // reference_fields, create typed relationships to the referenced
      // entities (REFERS_TO by default). Silent fallback when no schema or no
      // match exists — never invent targets.
      try {
        const { schemaRegistry } = await import("./services/schema_registry.js");
        const schemaEntry = await schemaRegistry.loadActiveSchema(r.entity_type, userId);
        if (schemaEntry?.schema_definition?.reference_fields?.length) {
          const { autoLinkReferenceFields } =
            await import("./services/schema_reference_linking.js");
          await autoLinkReferenceFields({
            entityId: r.entity_id,
            entityType: r.entity_type,
            fields: r.fields,
            schema: schemaEntry.schema_definition,
            userId,
            sourceId: observationSourceId,
          });
        }
      } catch (linkErr) {
        logger.warn(
          `Auto-link reference fields failed for ${r.entity_type}/${r.entity_id}: ${
            linkErr instanceof Error ? linkErr.message : String(linkErr)
          }`
        );
      }
    }

    createdEntities.push({
      entity_id: r.entity_id,
      entity_type: r.entity_type,
      observation_id,
      observation_index: r.observation_index,
      action: r.trace.action,
      canonical_name: r.trace.canonical_name,
      resolver_path: r.trace.resolver_path,
      identity_basis: r.trace.identity_basis,
      identity_rule: r.trace.identity_rule,
      ...(r.trace.warnings && r.trace.warnings.length > 0 ? { warnings: r.trace.warnings } : {}),
      entity_snapshot_after: snapshotAfter,
    });
  }

  // Relationships (parity with MCP store_structured). Indices are resolved
  // against the observation order; commit=false skips creation.
  const relationshipsCreated: Array<{
    relationship_type: string;
    source_entity_id: string;
    target_entity_id: string;
  }> = [];
  if (commit && relationships && relationships.length > 0) {
    const { relationshipsService } = await import("./services/relationships.js");
    for (const rel of relationships) {
      const sourceEntityId =
        typeof rel.source_entity_id === "string"
          ? rel.source_entity_id
          : typeof rel.source_index === "number"
            ? resolved[rel.source_index]?.entity_id
            : undefined;
      const targetEntityId =
        typeof rel.target_entity_id === "string"
          ? rel.target_entity_id
          : typeof rel.target_index === "number"
            ? resolved[rel.target_index]?.entity_id
            : undefined;
      if (!sourceEntityId || !targetEntityId) {
        logger.warn(
          `[STORE] Skipping relationship: invalid source reference ` +
            `(source_index=${rel.source_index}, source_entity_id=${rel.source_entity_id}) ` +
            `or target reference (target_index=${rel.target_index}, ` +
            `target_entity_id=${rel.target_entity_id}); have ${resolved.length} entities.`
        );
        continue;
      }
      if (typeof rel.source_entity_id === "string" && !isNeotomaEntityId(sourceEntityId)) {
        logger.warn(
          `[STORE] Skipping relationship: source_entity_id is not a valid Neotoma id ` +
            `(expected ent_ + 24 hex): ${String(rel.source_entity_id)}`
        );
        continue;
      }
      if (typeof rel.target_entity_id === "string" && !isNeotomaEntityId(targetEntityId)) {
        logger.warn(
          `[STORE] Skipping relationship: target_entity_id is not a valid Neotoma id ` +
            `(expected ent_ + 24 hex): ${String(rel.target_entity_id)}`
        );
        continue;
      }
      try {
        await relationshipsService.createRelationship({
          source_entity_id: sourceEntityId,
          target_entity_id: targetEntityId,
          relationship_type: rel.relationship_type as never,
          source_id: observationSourceId,
          metadata: rel.metadata ?? {},
          user_id: userId,
        });
        relationshipsCreated.push({
          relationship_type: rel.relationship_type,
          source_entity_id: sourceEntityId,
          target_entity_id: targetEntityId,
        });
      } catch (relErr) {
        logger.warn(
          `Failed to create relationship ${rel.relationship_type} ` +
            `${sourceEntityId} -> ${targetEntityId}: ${
              relErr instanceof Error ? relErr.message : String(relErr)
            }`
        );
      }
    }
  }

  // R3: aggregate non-fatal resolver warnings across the batch so callers
  // (agents, Inspector, CI) can audit identity quality without walking every
  // entity.trace. PII-free by construction — see ResolverWarning shape.
  const aggregatedWarnings: Array<{
    code: string;
    policy: string;
    observation_index: number;
    entity_type: string;
    entity_id: string;
    identity_basis: string;
    identity_rule: string;
  }> = [];
  for (const e of createdEntities) {
    if (!e.warnings) continue;
    for (const w of e.warnings) {
      aggregatedWarnings.push({
        code: w.code,
        policy: w.policy,
        observation_index: e.observation_index,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        identity_basis: w.identity_basis,
        identity_rule: w.identity_rule,
      });
    }
  }

  if (commit && interpretationId) {
    await completeInterpretationRun({
      interpretationId,
      observationsCreated: createdEntities.filter((e) => e.observation_id).length,
      unknownFieldsCount: 0,
    });
  }

  return {
    success: true,
    replayed: false,
    commit,
    source_id: commit ? storageResult.sourceId : null,
    ...(interpretationId
      ? { interpretation_id: interpretationId, interpretation_source_id: observationSourceId }
      : {}),
    entities_created: commit
      ? createdEntities.filter((e) => e.action === "created" || e.action === "extended").length
      : 0,
    observations_created: commit ? createdEntities.length : 0,
    entities: createdEntities,
    relationships_created: relationshipsCreated,
    ...(aggregatedWarnings.length > 0 ? { warnings: aggregatedWarnings } : {}),
  };
}

async function storeUnstructuredForApi(params: {
  userId: string;
  fileContent?: string;
  fileBuffer?: Buffer;
  mimeType: string;
  idempotencyKey?: string;
  originalFilename?: string;
  sourceType?: string;
}) {
  const {
    fileContent,
    fileBuffer,
    mimeType,
    idempotencyKey,
    originalFilename,
    sourceType,
    userId,
  } = params;
  const resolvedFileBuffer =
    fileBuffer ?? (fileContent !== undefined ? Buffer.from(fileContent, "base64") : undefined);
  if (!resolvedFileBuffer) {
    throw new Error("fileContent or fileBuffer is required for unstructured storage");
  }
  const resolvedIdempotencyKey =
    idempotencyKey ??
    (await import("node:crypto")).createHash("sha256").update(resolvedFileBuffer).digest("hex");

  const storageResult = await storeRawContent({
    userId,
    fileBuffer: resolvedFileBuffer,
    mimeType,
    originalFilename: originalFilename?.trim() || undefined,
    sourceType,
    idempotencyKey: resolvedIdempotencyKey,
    provenance: { upload_method: "api_store_unstructured", client: "api" },
  });

  return {
    source_id: storageResult.sourceId,
    content_hash: storageResult.contentHash,
    file_size: storageResult.fileSize,
    deduplicated: storageResult.deduplicated,
    entities_created: 0,
    observations_created: 0,
  };
}

// Shared handler body for the unified /store endpoint. Extracted so that the
// sandbox-only POST /sandbox/aauth-only/store route below can reuse the exact
// same write semantics (validation, auth, structured + unstructured flows,
// error envelopes) without duplicating logic. Both routes funnel through
// getAuthenticatedUserId, which honors the α attribution partitioning applied
// in the sandbox bypass above.
async function handleStorePost(
  req: express.Request,
  res: express.Response
): Promise<express.Response | void> {
  const parsed = StoreRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:store", req, {
      issues: parsed.error.issues,
    });
    return sendStoreValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const hasEntities = Boolean(parsed.data.entities?.length);
    const hasFileContent = Boolean(parsed.data.file_content && parsed.data.mime_type);
    const hasFilePath = Boolean(parsed.data.file_path);
    const hasUnstructured = hasFileContent || hasFilePath;

    let structuredResult: Record<string, unknown> | undefined;
    let unstructuredResult: Record<string, unknown> | undefined;

    const storeUnstructuredFromRequest = async (): Promise<Record<string, unknown> | null> => {
      const fileContent = parsed.data.file_content;
      let mimeType = parsed.data.mime_type;
      let originalFilename = parsed.data.original_filename;
      let resolvedFileBuffer: Buffer | undefined;

      if (hasFilePath) {
        const resolvedPath = path.isAbsolute(parsed.data.file_path as string)
          ? (parsed.data.file_path as string)
          : path.resolve(process.cwd(), parsed.data.file_path as string);
        resolvedFileBuffer = fs.readFileSync(resolvedPath);
        if (!mimeType) {
          const ext = path.extname(resolvedPath).toLowerCase();
          mimeType = getMimeTypeFromExtension(ext) || "application/octet-stream";
        }
        originalFilename = originalFilename || path.basename(resolvedPath);
      }

      if ((!fileContent && !resolvedFileBuffer) || !mimeType) {
        sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "Unstructured store requires file_content+mime_type or file_path"
        );
        return null;
      }

      return await storeUnstructuredForApi({
        userId,
        fileContent,
        fileBuffer: resolvedFileBuffer,
        mimeType,
        idempotencyKey:
          parsed.data.file_idempotency_key ??
          (!hasEntities ? parsed.data.idempotency_key : undefined),
        originalFilename,
        sourceType: (parsed.data as Record<string, unknown>).source_type as string | undefined,
      });
    };

    if (hasUnstructured && parsed.data.interpretation?.source_ref === "unstructured") {
      const result = await storeUnstructuredFromRequest();
      if (!result) {
        return;
      }
      unstructuredResult = result;
    }

    if (hasEntities) {
      if (!parsed.data.idempotency_key) {
        return sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "idempotency_key is required when entities are provided"
        );
      }
      const doStore = () =>
        storeStructuredForApi({
          userId,
          entities: parsed.data.entities as Record<string, unknown>[],
          sourcePriority: parsed.data.source_priority ?? 100,
          observationSource: parsed.data.observation_source,
          sourcePeerId: parsed.data.source_peer_id,
          idempotencyKey: parsed.data.idempotency_key!,
          originalFilename: parsed.data.original_filename,
          relationships: parsed.data.relationships as StoreRelationshipRef[] | undefined,
          interpretation: parsed.data.interpretation,
          interpretationSourceId:
            parsed.data.interpretation?.source_ref === "unstructured" &&
            unstructuredResult &&
            typeof unstructuredResult.source_id === "string"
              ? unstructuredResult.source_id
              : undefined,
          commit: (parsed.data as { commit?: boolean }).commit,
          strict: (parsed.data as { strict?: boolean }).strict,
        });

      const bodyActor = parsed.data.external_actor as ExternalActor | undefined;
      const existingActor = getCurrentExternalActor();
      if (bodyActor && !existingActor) {
        structuredResult = (await runWithExternalActor(bodyActor, doStore)) as Record<
          string,
          unknown
        >;
      } else {
        structuredResult = await doStore();
      }
    }

    if (hasUnstructured && !unstructuredResult) {
      const result = await storeUnstructuredFromRequest();
      if (!result) {
        return;
      }
      unstructuredResult = result;
    }

    if (structuredResult && unstructuredResult) {
      return res.json({
        structured: structuredResult,
        unstructured: unstructuredResult,
      });
    }
    if (structuredResult) {
      return res.json(structuredResult);
    }
    return res.status(200).json(unstructuredResult);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return sendError(res, 401, "AUTH_REQUIRED", error.message);
    }
    const errCode =
      error && typeof error === "object" ? (error as { code?: string }).code : undefined;
    if (errCode === "ERR_FORBIDDEN_ENTITY_TYPE" || errCode === "ERR_PLURAL_ENTITY_TYPE") {
      const message = error instanceof Error ? error.message : String(error);
      logWarn("EntityTypeGuardError:store", req, { code: errCode, message });
      return sendError(res, 400, errCode, message);
    }
    if (error && typeof error === "object" && errCode === "ERR_STORE_RESOLUTION_FAILED") {
      const err = error as {
        message: string;
        issues: Array<{
          observation_index: number;
          entity_type: string;
          code: string;
          message: string;
          details: Record<string, unknown>;
          hint?: string;
        }>;
      };
      logWarn("StoreResolutionError:store", req, {
        issue_count: err.issues?.length ?? 0,
      });
      return res.status(400).json({
        error: {
          code: "ERR_STORE_RESOLUTION_FAILED",
          message: err.message,
          issues: err.issues ?? [],
        },
      });
    }
    if (error && typeof error === "object" && errCode === "ERR_FLAT_PACKED_ROWS") {
      const err = error as {
        message: string;
        detection: {
          prefix?: string;
          indices?: number[];
          suggestedEntities?: Array<Record<string, unknown>>;
          exampleKeys?: string[];
        };
      };
      logWarn("FlatPackedRowsError:store", req, {
        prefix: err.detection.prefix,
        row_count: err.detection.indices?.length ?? 0,
      });
      return res.status(400).json({
        error: {
          code: "ERR_FLAT_PACKED_ROWS",
          message: err.message,
          prefix: err.detection.prefix,
          row_count: err.detection.indices?.length ?? 0,
          example_keys: err.detection.exampleKeys ?? [],
          suggested_entities: err.detection.suggestedEntities ?? [],
        },
      });
    }
    logError("APIError:store", req, error);
    const message = error instanceof Error ? error.message : "Failed to store payload";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
}

// POST /api/store - Unified store for structured, unstructured, or combined payloads
app.post("/store", writeRateLimit, handleStorePost);

// POST /github/webhook - Receive verified GitHub webhook events
import { verifyGithubSignature, mapEventToStore } from "./services/github_webhook.js";

app.post(
  "/github/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req: express.Request, res: express.Response) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(503).json({
        error: { code: "WEBHOOK_NOT_CONFIGURED", message: "GITHUB_WEBHOOK_SECRET is not set." },
      });
    }

    const signatureHeader = req.headers["x-hub-signature-256"] as string | undefined;
    if (!signatureHeader) {
      return res.status(401).json({
        error: { code: "SIGNATURE_MISSING", message: "X-Hub-Signature-256 header is required." },
      });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body as string);
    if (!verifyGithubSignature(rawBody, signatureHeader, secret)) {
      return res.status(401).json({
        error: { code: "SIGNATURE_INVALID", message: "Webhook signature verification failed." },
      });
    }

    const deliveryId = (req.headers["x-github-delivery"] as string) ?? `unknown-${Date.now()}`;
    const event = (req.headers["x-github-event"] as string) ?? "";

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString("utf-8"));
    } catch {
      return res.status(400).json({
        error: { code: "INVALID_JSON", message: "Could not parse webhook body." },
      });
    }

    const storePayload = mapEventToStore(event, payload, deliveryId);
    if (!storePayload) {
      return res.status(200).json({ status: "ignored", event, action: (payload as any).action });
    }

    try {
      const userId = await getAuthenticatedUserId(req);
      const result = await runWithExternalActor(storePayload.external_actor, () =>
        storeStructuredForApi({
          userId,
          entities: storePayload.entities,
          sourcePriority: 100,
          observationSource: storePayload.observation_source,
          idempotencyKey: storePayload.idempotency_key,
          relationships: storePayload.relationships as StoreRelationshipRef[],
        })
      );
      return res.status(200).json({ status: "processed", delivery_id: deliveryId, result });
    } catch (error) {
      logError("APIError:github_webhook", req, error);
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      return sendError(res, 500, "WEBHOOK_PROCESSING_FAILED", message);
    }
  }
);

// POST /sync/webhook — inbound cross-instance sync notifications (Phase 5).
// Verified with the shared secret stored on the matching `peer_config` row.
app.post(
  "/sync/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    const rawReq = req as express.Request & { rawBody?: Buffer };
    const rawBody = rawReq.rawBody
      ? rawReq.rawBody.toString("utf8")
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : String((req as express.Request).body ?? "");
    const signatureHeader =
      (req.headers["x-neotoma-sync-signature-256"] as string | undefined) ??
      (req.headers["X-Neotoma-Sync-Signature-256"] as string | undefined);
    const aauthContext = getAAuthContextFromRequest(req);
    try {
      const { applyInboundSyncWebhook } = await import("./services/sync/sync_webhook_inbound.js");
      const result = await applyInboundSyncWebhook({
        rawBody,
        signatureHeader,
        verifiedAauthThumbprint: aauthContext?.thumbprint,
      });
      return res.status(200).json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "SIGNATURE_INVALID" || msg === "PEER_UNKNOWN_OR_INACTIVE") {
        return sendError(res, 401, "SYNC_WEBHOOK_UNAUTHORIZED", msg);
      }
      if (msg === "INVALID_JSON" || msg.startsWith("VALIDATION_ERROR")) {
        return sendError(res, 400, "VALIDATION_ERROR", msg);
      }
      logError("APIError:sync_webhook", req, err);
      return sendError(res, 500, "SYNC_WEBHOOK_FAILED", msg);
    }
  }
);

// POST /sync/entities — authenticated peer listing for bilateral sync pulls.
app.post(
  "/sync/entities",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    const rawReq = req as express.Request & { rawBody?: Buffer };
    const rawBody = rawReq.rawBody
      ? rawReq.rawBody.toString("utf8")
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : String((req as express.Request).body ?? "");
    const signatureHeader =
      (req.headers["x-neotoma-sync-signature-256"] as string | undefined) ??
      (req.headers["X-Neotoma-Sync-Signature-256"] as string | undefined);
    const aauthContext = getAAuthContextFromRequest(req);
    try {
      const { applyInboundSyncEntitiesRequest } =
        await import("./services/sync/sync_webhook_inbound.js");
      const result = await applyInboundSyncEntitiesRequest({
        rawBody,
        signatureHeader,
        verifiedAauthThumbprint: aauthContext?.thumbprint,
      });
      return res.status(200).json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "SIGNATURE_INVALID" || msg === "PEER_UNKNOWN_OR_INACTIVE") {
        return sendError(res, 401, "SYNC_WEBHOOK_UNAUTHORIZED", msg);
      }
      if (msg === "INVALID_JSON" || msg.startsWith("VALIDATION_ERROR")) {
        return sendError(res, 400, "VALIDATION_ERROR", msg);
      }
      logError("APIError:sync_entities", req, err);
      return sendError(res, 500, "SYNC_ENTITIES_FAILED", msg);
    }
  }
);

// GET /peers — list configured Neotoma peers (authenticated user).
app.get("/peers", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    const { listPeersForUser } = await import("./services/sync/peer_ops.js");
    const peers = await listPeersForUser(userId);
    return res.json({ peers });
  } catch (error) {
    logError("APIError:peers_list", req, error);
    const message = error instanceof Error ? error.message : "Failed to list peers";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// POST /peers — add a peer configuration.
app.post("/peers", express.json(), async (req, res) => {
  const schema = z.object({
    peer_id: z.string().min(1),
    peer_name: z.string().min(1),
    peer_url: z.string().min(1),
    direction: z.enum(["push", "pull", "bidirectional"]),
    entity_types: z.array(z.string()).min(1),
    sync_scope: z.enum(["all", "tagged"]),
    auth_method: z.enum(["aauth", "shared_secret"]),
    conflict_strategy: z.enum(["last_write_wins", "source_priority", "manual"]),
    shared_secret: z.string().optional(),
    peer_public_key_thumbprint: z.string().optional(),
    sync_target_user_id: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const userId = await getAuthenticatedUserId(req);
    const { addPeerForUser } = await import("./services/sync/peer_ops.js");
    const out = await addPeerForUser({ userId, ...parsed.data });
    return res.status(201).json(out);
  } catch (error) {
    logError("APIError:peers_add", req, error);
    const message = error instanceof Error ? error.message : "Failed to add peer";
    if (message.includes("Maximum peers")) {
      return sendError(res, 400, "PEER_LIMIT", message);
    }
    return sendError(res, 500, "PEER_ADD_FAILED", message);
  }
});

// POST /peers/resolve_sync_conflict — stub (use `correct` today). Registered
// before `/peers/:peer_id` so `resolve_sync_conflict` is not captured as a peer_id.
app.post("/peers/resolve_sync_conflict", express.json(), async (req, res) => {
  const schema = z.object({
    entity_id: z.string().min(1),
    strategy: z.enum([
      "prefer_local",
      "prefer_remote",
      "last_write_wins",
      "source_priority",
      "manual",
    ]),
    sender_peer_url: z.string().min(1).optional(),
    guest_access_token: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const userId = await getAuthenticatedUserId(req);
    const { resolveSyncConflict } = await import("./services/sync/conflict_resolver.js");
    const result = await resolveSyncConflict({
      userId,
      entity_id: parsed.data.entity_id,
      strategy: parsed.data.strategy,
      sender_peer_url: parsed.data.sender_peer_url,
      guest_access_token: parsed.data.guest_access_token,
    });
    return res.json(result);
  } catch (error) {
    logError("APIError:peers_resolve", req, error);
    const message = error instanceof Error ? error.message : "resolve failed";
    return sendError(res, 500, "PEER_RESOLVE_FAILED", message);
  }
});

// GET /peers/:peer_id — peer status snapshot (secret redacted).
app.get("/peers/:peer_id", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    const { getPeerStatusForUser } = await import("./services/sync/peer_ops.js");
    const payload = await getPeerStatusForUser({ userId, peer_id: req.params.peer_id });
    if (!payload) {
      return sendError(res, 404, "NOT_FOUND", "peer not found");
    }
    return res.json(payload);
  } catch (error) {
    logError("APIError:peers_status", req, error);
    const message = error instanceof Error ? error.message : "Failed to load peer";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// DELETE /peers/:peer_id — deactivate peer.
app.delete("/peers/:peer_id", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    const { removePeerForUser } = await import("./services/sync/peer_ops.js");
    await removePeerForUser({ userId, peer_id: req.params.peer_id });
    return res.json({ success: true });
  } catch (error) {
    logError("APIError:peers_remove", req, error);
    const message = error instanceof Error ? error.message : "Failed to remove peer";
    if (message.includes("not found")) {
      return sendError(res, 404, "NOT_FOUND", message);
    }
    return sendError(res, 500, "PEER_REMOVE_FAILED", message);
  }
});

// POST /peers/:peer_id/sync — bounded outbound sync webhooks (see full_sync.ts).
app.post("/peers/:peer_id/sync", express.json(), async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    const bodySchema = z.object({ limit: z.number().int().positive().max(500).optional() });
    const bodyParsed = bodySchema.safeParse(req.body ?? {});
    const limit = bodyParsed.success ? bodyParsed.data.limit : undefined;
    const { syncPeerFull } = await import("./services/sync/full_sync.js");
    const result = await syncPeerFull({ userId, peer_id: req.params.peer_id, limit });
    return res.json(result);
  } catch (error) {
    logError("APIError:peers_sync", req, error);
    const message = error instanceof Error ? error.message : "sync_peer failed";
    return sendError(res, 500, "PEER_SYNC_FAILED", message);
  }
});

// γ-write: sandbox-only route that EXPLICITLY requires a verified AAuth
// signature before delegating to the same handleStorePost handler. Unlike the
// global /store endpoint (which accepts bearer auth, sandbox public-user
// fallback, OR AAuth-derived attribution), this route makes AAuth admission
// the gate: unsigned requests get 401 here. The route is only registered when
// isSandboxMode() is true, so it does not exist in production. Demo value:
// shows identity-bound provenance — a write performed by an AAuth-signed
// agent lands under the per-thumbprint user from α and is round-trippable via
// /entities/query, /entities/:id, and /stats scoped to that same identity.
if (isSandboxMode()) {
  const aauthRequired: express.RequestHandler = (req, res, next) => {
    const aauthCtx = (
      req as express.Request & { aauth?: { verified?: boolean; thumbprint?: string } }
    ).aauth;
    if (aauthCtx?.verified === true && typeof aauthCtx.thumbprint === "string") {
      return next();
    }
    return sendError(
      res,
      401,
      "AAUTH_REQUIRED",
      "POST /sandbox/aauth-only/store requires a verified AAuth signature (RFC 9421 + aa-agent+jwt)."
    );
  };
  app.post("/sandbox/aauth-only/store", writeRateLimit, aauthRequired, handleStorePost);
  logger.info("[Sandbox] AAuth-required write route enabled at POST /sandbox/aauth-only/store");
}

// POST /api/observations/query - Query observations
app.post("/observations/query", async (req, res) => {
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

    const {
      observation_id,
      entity_id,
      entity_type,
      source_id,
      limit,
      offset,
      updated_since,
      created_since,
    } = parsed.data;

    // Build query - ALWAYS filter by authenticated user_id
    let query = db.from("observations").select("*", { count: "exact" }).eq("user_id", userId); // SECURITY: Always filter by authenticated user

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

    if (updated_since) {
      // Observations are immutable; treat updated_since as a synonym for
      // observed_at >= updated_since so clients have a single "since" knob.
      query = query.gte("observed_at", updated_since);
    }

    if (created_since) {
      query = query.gte("observed_at", created_since);
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

// GET /entities/duplicates - List candidate duplicate entity pairs (R5).
// Read-only fuzzy post-hoc detector. Never auto-merges. Hands off to
// /entities/merge once an operator or agent confirms a pair.
app.get("/entities/duplicates", async (req, res) => {
  try {
    const entityType =
      typeof req.query.entity_type === "string" ? req.query.entity_type : undefined;
    if (!entityType) {
      return sendError(
        res,
        400,
        "VALIDATION_INVALID_FORMAT",
        "entity_type query parameter is required"
      );
    }
    const providedUserId = typeof req.query.user_id === "string" ? req.query.user_id : undefined;
    const authenticatedUserId = await getAuthenticatedUserId(req, providedUserId);
    if (providedUserId && providedUserId !== authenticatedUserId) {
      return sendError(res, 403, "FORBIDDEN", "user_id does not match authenticated user.");
    }

    const thresholdRaw = typeof req.query.threshold === "string" ? req.query.threshold : undefined;
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit : undefined;

    const threshold = thresholdRaw ? Number(thresholdRaw) : undefined;
    if (threshold !== undefined && (Number.isNaN(threshold) || threshold <= 0 || threshold > 1)) {
      return sendError(
        res,
        400,
        "VALIDATION_INVALID_FORMAT",
        "threshold must be a number in (0, 1]"
      );
    }
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 200)) {
      return sendError(
        res,
        400,
        "VALIDATION_INVALID_FORMAT",
        "limit must be an integer in [1, 200]"
      );
    }

    const { findDuplicateCandidates } = await import("./services/duplicate_detection.js");
    const candidates = await findDuplicateCandidates({
      entityType,
      userId: authenticatedUserId,
      threshold,
      limit,
    });

    return res.json({
      candidates,
      entity_type: entityType,
      threshold: threshold ?? null,
    });
  } catch (error) {
    logError("APIError:entities_duplicates", req, error);
    const message = error instanceof Error ? error.message : "Failed to list potential duplicates";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// POST /api/entities/merge - Merge duplicate entities
// REQUIRES AUTHENTICATION - validates user_id matches authenticated user and entities belong to user
app.post("/entities/merge", async (req, res) => {
  const parsed = MergeEntitiesRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:entities_merge", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const authenticatedUserId = await getAuthenticatedUserId(req, parsed.data.user_id);

    const { from_entity_id, to_entity_id, merge_reason, user_id: providedUserId } = parsed.data;
    const user_id = providedUserId || authenticatedUserId;

    if (providedUserId && providedUserId !== authenticatedUserId) {
      return sendError(res, 403, "FORBIDDEN", "user_id does not match authenticated user.");
    }

    const { mergeEntities } = await import("./services/entity_merge.js");
    const result = await mergeEntities({
      fromEntityId: from_entity_id,
      toEntityId: to_entity_id,
      userId: user_id,
      mergeReason: merge_reason,
      mergedBy: "http_api",
    });

    return res.json(result);
  } catch (error) {
    const { EntityNotFoundError, EntityAlreadyMergedError } =
      await import("./services/entity_merge.js");
    if (error instanceof EntityNotFoundError) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", error.message);
    }
    if (error instanceof EntityAlreadyMergedError) {
      return sendError(res, 400, "VALIDATION_INVALID_FORMAT", error.message);
    }
    logError("APIError:entities_merge", req, error);
    const message = error instanceof Error ? error.message : "Failed to merge entities";
    return sendError(res, 500, "DB_QUERY_FAILED", message);
  }
});

// POST /api/entities/split - R5 inverse of /entities/merge.
// REQUIRES AUTHENTICATION - all ids scoped to authenticated user.
app.post("/entities/split", async (req, res) => {
  const parsed = SplitEntityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:entities_split", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const authenticatedUserId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const providedUserId = parsed.data.user_id;
    if (providedUserId && providedUserId !== authenticatedUserId) {
      return sendError(res, 403, "FORBIDDEN", "user_id does not match authenticated user.");
    }
    const userId = providedUserId || authenticatedUserId;

    const { splitEntity } = await import("./services/entity_split.js");
    const result = await splitEntity({
      sourceEntityId: parsed.data.source_entity_id,
      userId,
      predicate: parsed.data.predicate,
      newEntity: {
        entity_type: parsed.data.new_entity.entity_type,
        canonical_name: parsed.data.new_entity.canonical_name,
        target_entity_id: parsed.data.new_entity.target_entity_id,
      },
      idempotencyKey: parsed.data.idempotency_key,
      reason: parsed.data.reason,
      splitBy: "http_api",
    });

    return res.json(result);
  } catch (error) {
    const {
      EntityNotFoundError,
      EntityAlreadyMergedError,
      SplitPredicateMatchedNothingError,
      SplitPredicateMatchedAllError,
      IdempotencyMismatchError,
    } = await import("./services/entity_split.js");
    if (error instanceof EntityNotFoundError) {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", error.message);
    }
    if (error instanceof EntityAlreadyMergedError) {
      return sendError(res, 400, "VALIDATION_INVALID_FORMAT", error.message);
    }
    if (error instanceof SplitPredicateMatchedNothingError) {
      return sendError(res, 400, "VALIDATION_INVALID_FORMAT", error.message);
    }
    if (error instanceof SplitPredicateMatchedAllError) {
      return sendError(res, 400, "VALIDATION_INVALID_FORMAT", error.message);
    }
    if (error instanceof IdempotencyMismatchError) {
      return sendError(res, 400, "ERR_IDEMPOTENCY_MISMATCH", error.message);
    }
    logError("APIError:entities_split", req, error);
    const message = error instanceof Error ? error.message : "Failed to split entity";
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

  const { data, error } = await db
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entity_id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return sendError(res, 404, "RESOURCE_NOT_FOUND", "Entity not found");
    }
    logError("DbError:get_entity_snapshot", req, error);
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

  const { entity_id, limit = 100, offset = 0, updated_since, created_since } = parsed.data;

  let query = db.from("observations").select("*").eq("entity_id", entity_id);

  if (updated_since) {
    query = query.gte("observed_at", updated_since);
  }
  if (created_since) {
    query = query.gte("observed_at", created_since);
  }

  const { data, error } = await query
    .order("observed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logError("DbError:list_observations", req, error);
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
  const { data: snapshot } = await db
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

  const { data: observations, error: obsError } = await db
    .from("observations")
    .select("*, source_id")
    .in("id", observationIds);

  if (obsError) {
    logError("DbError:get_field_provenance", req, obsError);
    return sendError(res, 500, "DB_QUERY_FAILED", obsError.message);
  }

  // Get sources for provenance
  const sourceIds = (observations || [])
    .map((obs: { source_id?: string }) => obs.source_id)
    .filter((sourceId: string | undefined): sourceId is string => Boolean(sourceId));

  const { data: sources, error: sourceError } = await db
    .from("sources")
    .select("id, content_hash, mime_type, storage_url, file_name, created_at")
    .in("id", sourceIds);

  if (sourceError) {
    logError("DbError:get_field_provenance:sources", req, sourceError);
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

  const { relationship_type, source_entity_id, target_entity_id, source_id, metadata, user_id } =
    parsed.data;

  const { relationshipsService } = await import("./services/relationships.js");

  try {
    const userId = await getAuthenticatedUserId(req, user_id);
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

// Create relationships in batch
app.post("/create_relationships", async (req, res) => {
  const parsed = CreateRelationshipsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:create_relationships", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  const { relationships, source_id, user_id } = parsed.data;
  const { relationshipsService } = await import("./services/relationships.js");

  try {
    const userId = await getAuthenticatedUserId(req, user_id);
    const created = [];
    const errors = [];
    for (const [index, relationship] of relationships.entries()) {
      try {
        const snapshot = await relationshipsService.createRelationship({
          relationship_type: relationship.relationship_type,
          source_entity_id: relationship.source_entity_id,
          target_entity_id: relationship.target_entity_id,
          source_id: relationship.source_id || source_id || null,
          metadata: relationship.metadata || {},
          user_id: userId,
        });
        created.push({
          index,
          ...snapshot,
        });
      } catch (error) {
        errors.push({
          index,
          relationship,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logDebug("Success:create_relationships", req, {
      requested: relationships.length,
      created: created.length,
      errors: errors.length,
    });
    return res.json({
      success: errors.length === 0,
      requested: relationships.length,
      created_count: created.length,
      error_count: errors.length,
      relationships: created,
      errors,
    });
  } catch (error) {
    logError("RelationshipCreationError:create_relationships", req, error);
    return sendError(
      res,
      500,
      "DB_QUERY_FAILED",
      error instanceof Error ? error.message : "Failed to create relationships"
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

  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, expires_in || 3600);
  if (error || !data?.signedUrl) {
    logError("StorageError:get_file_url", req, error, { bucket, path });
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
    const { identifier, entity_type, by, limit, include_observations, observations_limit } =
      parsed.data;
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const result = await retrieveEntityByIdentifierWithFallback({
      identifier,
      entityType: entity_type,
      userId,
      limit: limit ?? 100,
      by,
      includeObservations: include_observations,
      observationsLimit: observations_limit,
    });

    logDebug("Success:retrieve_entity_by_identifier", req, {
      identifier,
      count: result.entities.length,
    });
    return res.json(result);
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
    const userId = await getAuthenticatedUserId(req, undefined);

    // Simple 1-hop query implementation
    const relationships: any[] = [];

    // Get outbound relationships
    if (direction === "outbound" || direction === "both") {
      let query = db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", entity_id)
        .eq("user_id", userId)
        .order("relationship_key", { ascending: true });

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
      let query = db
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", entity_id)
        .eq("user_id", userId)
        .order("relationship_key", { ascending: true });

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
        const { data, error } = await db
          .from("entities")
          .select("*")
          .eq("user_id", userId)
          .order("canonical_name", { ascending: true })
          .order("id", { ascending: true })
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
      const { data: entity, error: entityError } = await db
        .from("entities")
        .select("*")
        .eq("id", node_id)
        .single();

      if (!entityError && entity) {
        result.entity = entity;
      }

      // Get relationships if requested
      if (include_relationships) {
        const { data: relationships, error: relError } = await db
          .from("relationship_snapshots")
          .select("*")
          .or(`source_entity_id.eq.${node_id},target_entity_id.eq.${node_id}`);

        if (!relError) {
          result.relationships = relationships || [];
          const relatedEntityIds = Array.from(
            new Set(
              (relationships || [])
                .flatMap((relationship: any) => [
                  relationship.source_entity_id,
                  relationship.target_entity_id,
                ])
                .filter(
                  (entityId: string | undefined): entityId is string =>
                    typeof entityId === "string" && entityId.length > 0 && entityId !== node_id
                )
            )
          );
          if (relatedEntityIds.length > 0) {
            const { data: relatedEntities, error: relatedEntitiesError } = await db
              .from("entities")
              .select("*")
              .in("id", relatedEntityIds);

            if (!relatedEntitiesError) {
              result.related_entities = relatedEntities || [];
            }
          }
        }
      }

      // Get observations if requested
      if (include_observations) {
        const { data: observations, error: obsError } = await db
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
          const { data: sources, error: srcError } = await db
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
      const { data: source, error: srcError } = await db
        .from("source")
        .select("*")
        .eq("id", node_id)
        .single();

      if (!srcError && source) {
        result.source = source;
      }

      // Get observations from this source
      if (include_observations) {
        const { data: observations, error: obsError } = await db
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
      const status = result.error === "Entity not found" ? 404 : 500;
      return sendError(res, status, "DELETE_FAILED", result.error || "Failed to delete entity");
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

// POST /issues/bulk_close — Close issues (GitHub PATCH when linked), persist closed state
app.post("/issues/bulk_close", async (req, res) => {
  const parsed = IssuesBulkEntityIdsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:issues_bulk_close", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { bulkCloseIssues } = await import("./services/issues/inspector_bulk.js");
    const { results } = await bulkCloseIssues(userId, parsed.data.entity_ids);
    logDebug("Success:issues_bulk_close", req, { count: results.length });
    return res.json({ results });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to bulk close issues",
      "DB_QUERY_FAILED",
      "APIError:issues_bulk_close"
    );
  }
});

// POST /issues/bulk_remove — Close on GitHub when linked and open, then soft-delete locally
app.post("/issues/bulk_remove", async (req, res) => {
  const parsed = IssuesBulkEntityIdsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:issues_bulk_remove", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { bulkRemoveIssues } = await import("./services/issues/inspector_bulk.js");
    const { results } = await bulkRemoveIssues(userId, parsed.data.entity_ids);
    logDebug("Success:issues_bulk_remove", req, { count: results.length });
    return res.json({ results });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to bulk remove issues",
      "DB_QUERY_FAILED",
      "APIError:issues_bulk_remove"
    );
  }
});

// POST /issues/add_message — Append thread message (MCP add_issue_message parity)
// Alias under /api for same-origin Inspector when operators proxy only /api/* to Node.
const handleIssuesAddMessageHttp: express.RequestHandler = async (req, res) => {
  const parsed = IssuesAddMessageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:issues_add_message", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    const userId =
      principal.kind === "guest"
        ? (
            await resolveGuestScopedEntityAccess(
              principal,
              parsed.data.entity_id?.trim() || "",
              "issue"
            )
          ).userId
        : await getAuthenticatedUserId(req, parsed.data.user_id);
    const { createOperations } = await import("./core/operations.js");
    const { NeotomaServer } = await import("./server.js");
    const { addIssueMessage, appendGuestIssueMessage } =
      await import("./services/issues/issue_operations.js");
    const server = new NeotomaServer();
    const ops = createOperations({ server, userId });
    try {
      const result =
        principal.kind === "guest"
          ? {
              github_comment_id: null,
              ...(await appendGuestIssueMessage(ops, {
                issue_entity_id: parsed.data.entity_id?.trim() || "",
                body: parsed.data.body,
              })),
              pushed_to_github: false,
              submitted_to_neotoma: true,
            }
          : await addIssueMessage(ops, {
              entity_id: parsed.data.entity_id?.trim() || undefined,
              issue_number: parsed.data.issue_number,
              body: parsed.data.body,
              ...(parsed.data.guest_access_token
                ? { guest_access_token: parsed.data.guest_access_token.trim() }
                : {}),
              ...(parsed.data.reporter_git_sha
                ? { reporter_git_sha: parsed.data.reporter_git_sha }
                : {}),
              ...(parsed.data.reporter_git_ref
                ? { reporter_git_ref: parsed.data.reporter_git_ref }
                : {}),
              ...(parsed.data.reporter_channel
                ? { reporter_channel: parsed.data.reporter_channel }
                : {}),
              ...(parsed.data.reporter_app_version
                ? { reporter_app_version: parsed.data.reporter_app_version }
                : {}),
              ...(parsed.data.entity_ids_to_link
                ? { entity_ids_to_link: parsed.data.entity_ids_to_link }
                : {}),
            });
      logDebug("Success:issues_add_message", req, { message_entity_id: result.message_entity_id });
      return res.json(result);
    } finally {
      await ops.dispose();
    }
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to add issue message",
      "ISSUE_MESSAGE_FAILED",
      "APIError:issues_add_message"
    );
  }
};
app.post("/issues/add_message", guestWriteRateLimit, handleIssuesAddMessageHttp);
app.post("/api/issues/add_message", guestWriteRateLimit, handleIssuesAddMessageHttp);

// POST /issues/submit — Create issue (MCP submit_issue parity)
const handleIssuesSubmitHttp: express.RequestHandler = async (req, res) => {
  const parsed = IssuesSubmitRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:issues_submit", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    const guestSubmitPayload = Boolean(
      parsed.data.github_url ||
      parsed.data.github_number ||
      parsed.data.author ||
      parsed.data.local_issue_id ||
      parsed.data.submission_timestamp
    );
    const userId =
      principal.kind === "guest" && !principal.accessToken
        ? ensureLocalDevUser().id
        : principal.kind === "guest" || guestSubmitPayload
          ? ((await resolveGuestUserId(req, principal)) ??
            (await getAuthenticatedUserId(req, parsed.data.user_id)))
          : await getAuthenticatedUserId(req, parsed.data.user_id);
    const { createOperations } = await import("./core/operations.js");
    const { NeotomaServer } = await import("./server.js");
    const { submitIssue, submitGuestIssue } = await import("./services/issues/issue_operations.js");
    const server = new NeotomaServer();
    const ops = createOperations({ server, userId });
    try {
      const result = await (async () => {
        if (principal.kind === "guest" || guestSubmitPayload) {
          const guestResult = await submitGuestIssue(ops, {
            userId,
            title: parsed.data.title,
            body: parsed.data.body,
            labels: parsed.data.labels,
            visibility: parsed.data.visibility,
            githubUrl: parsed.data.github_url,
            githubNumber: parsed.data.github_number,
            author: parsed.data.author,
            local_issue_id: parsed.data.local_issue_id,
            submission_timestamp: parsed.data.submission_timestamp,
          });
          return {
            issue_number: 0,
            github_url: "",
            entity_id: guestResult.issue_entity_id,
            issue_entity_id: guestResult.issue_entity_id,
            conversation_id: guestResult.conversation_id,
            remote_entity_id: guestResult.issue_entity_id,
            pushed_to_github: false,
            submitted_to_neotoma: true,
            guest_access_token: guestResult.guest_access_token,
            entity_ids: guestResult.entity_ids,
            github_mirror_guidance: null,
          };
        }
        return submitIssue(ops, {
          title: parsed.data.title,
          body: parsed.data.body,
          labels: parsed.data.labels,
          visibility: parsed.data.visibility,
          reporter_git_sha: parsed.data.reporter_git_sha,
          reporter_git_ref: parsed.data.reporter_git_ref,
          reporter_channel: parsed.data.reporter_channel,
          reporter_app_version: parsed.data.reporter_app_version,
          reporter_ci_run_id: parsed.data.reporter_ci_run_id,
          reporter_patch_source_id: parsed.data.reporter_patch_source_id,
          ...(parsed.data.entity_ids_to_link
            ? { entity_ids_to_link: parsed.data.entity_ids_to_link }
            : {}),
        });
      })();
      logDebug("Success:issues_submit", req, { entity_id: result.entity_id });
      return res.json(result);
    } finally {
      await ops.dispose();
    }
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to submit issue",
      "ISSUE_SUBMIT_FAILED",
      "APIError:issues_submit"
    );
  }
};
app.post("/issues/submit", guestWriteRateLimit, handleIssuesSubmitHttp);
app.post("/api/issues/submit", guestWriteRateLimit, handleIssuesSubmitHttp);

// POST /issues/status — Issue status + thread (MCP get_issue_status parity)
const handleIssuesGetStatusHttp: express.RequestHandler = async (req, res) => {
  const parsed = IssuesGetStatusRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:issues_status", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    const issueEntityId = parsed.data.entity_id?.trim() || "";
    const userId =
      principal.kind === "guest"
        ? (await resolveGuestScopedEntityAccess(principal, issueEntityId, "issue")).userId
        : await getAuthenticatedUserId(req, parsed.data.user_id);
    const { createOperations } = await import("./core/operations.js");
    const { NeotomaServer } = await import("./server.js");
    const { getIssueStatus, loadIssueStatusFromGraph } =
      await import("./services/issues/issue_operations.js");
    const { loadIssuesConfig } = await import("./services/issues/config.js");
    const server = new NeotomaServer();
    const ops = createOperations({ server, userId });
    try {
      const result =
        principal.kind === "guest"
          ? await loadIssueStatusFromGraph(ops, issueEntityId, await loadIssuesConfig())
          : await getIssueStatus(ops, {
              entity_id: parsed.data.entity_id?.trim() || undefined,
              issue_number: parsed.data.issue_number,
              skip_sync: parsed.data.skip_sync,
              ...(parsed.data.guest_access_token
                ? { guest_access_token: parsed.data.guest_access_token.trim() }
                : {}),
            });
      logDebug("Success:issues_status", req, { issue_entity_id: result.issue_entity_id });
      return res.json(result);
    } finally {
      await ops.dispose();
    }
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get issue status",
      "ISSUE_STATUS_FAILED",
      "APIError:issues_status"
    );
  }
};
app.post("/issues/status", handleIssuesGetStatusHttp);
app.post("/api/issues/status", handleIssuesGetStatusHttp);

// POST /issues/sync — GitHub mirror ingest (MCP sync_issues parity)
const handleIssuesSyncHttp: express.RequestHandler = async (req, res) => {
  const parsed = IssuesSyncRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:issues_sync", req, { issues: parsed.error.issues });
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const userId = await getAuthenticatedUserId(req, parsed.data.user_id);
    const { createOperations } = await import("./core/operations.js");
    const { NeotomaServer } = await import("./server.js");
    const { syncIssuesFromGitHub } = await import("./services/issues/sync_issues_from_github.js");
    const server = new NeotomaServer();
    const ops = createOperations({ server, userId });
    try {
      const result = await syncIssuesFromGitHub(ops, {
        since: parsed.data.since,
        state: parsed.data.state,
        labels: parsed.data.labels,
      });
      logDebug("Success:issues_sync", req, {
        issues_synced: result.issues_synced,
        messages_synced: result.messages_synced,
      });
      return res.json(result);
    } finally {
      await ops.dispose();
    }
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to sync issues",
      "ISSUE_SYNC_FAILED",
      "APIError:issues_sync"
    );
  }
};
app.post("/issues/sync", handleIssuesSyncHttp);
app.post("/api/issues/sync", handleIssuesSyncHttp);

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
    let query = db.from("raw_fragments").select("fragment_key, frequency_count, entity_type");

    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: fragments, error } = await query;

    if (error) {
      logError("DbError:analyze_schema_candidates", req, error);
      return sendError(res, 500, "DB_QUERY_FAILED", error.message);
    }

    // Analyze field frequency
    const fieldFrequency = new Map<string, number>();
    (fragments || []).forEach((frag: any) => {
      const key = String(frag.fragment_key ?? "");
      if (!key) return;
      const increment =
        typeof frag.frequency_count === "number" && Number.isFinite(frag.frequency_count)
          ? frag.frequency_count
          : 1;
      const count = fieldFrequency.get(key) ?? 0;
      fieldFrequency.set(key, count + increment);
    });

    // Build candidates
    const candidates = Array.from(fieldFrequency.entries())
      .filter(([, count]) => count >= min_frequency)
      .map(([field_name, frequency]) => {
        const confidence = Math.min(frequency / 100, 1);
        const recommendedType =
          /\b(date|dated|dob)\b/i.test(field_name) || /_at$/i.test(field_name) ? "date" : "string";
        return {
          field_name,
          frequency,
          confidence,
          recommended_type: recommendedType,
        };
      })
      .filter((c) => c.confidence >= min_confidence)
      .sort((a, b) => {
        if (b.frequency !== a.frequency) return b.frequency - a.frequency;
        return a.field_name.localeCompare(b.field_name);
      });

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
    let query = db.from("schema_recommendations").select("*").eq("entity_type", entity_type);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (source && source !== "all") {
      query = query.eq("source", source);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: recommendations, error } = await query
      .order("confidence_score", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      logError("DbError:get_schema_recommendations", req, error);
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

// POST /update_schema_incremental - Incrementally update schema by adding or removing fields
//
// Routes through SchemaRegistryService.updateSchemaIncremental so that:
//   - Version bumps are consistent across CLI, MCP and HTTP.
//   - Schema-level declarations (canonical_name_fields, temporal_fields,
//     reference_fields, aliases) are preserved across incremental updates.
//   - migrate_existing correctly backfills raw_fragments → observations.
//   - Reducer policies track added/removed fields.
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
      fields_to_remove,
      schema_version,
      user_specific = false,
      activate = true,
      migrate_existing = false,
      force = false,
    } = parsed.data;

    const { schemaRegistry } = await import("./services/schema_registry.js");

    let newSchema;
    try {
      newSchema = await schemaRegistry.updateSchemaIncremental({
        entity_type,
        fields_to_add: (fields_to_add || []) as Parameters<
          typeof schemaRegistry.updateSchemaIncremental
        >[0]["fields_to_add"],
        fields_to_remove: fields_to_remove || [],
        schema_version,
        user_specific,
        user_id: userId,
        activate,
        migrate_existing,
        force,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "ERR_FORBIDDEN_ENTITY_TYPE" || code === "ERR_PLURAL_ENTITY_TYPE") {
        return sendError(res, 400, code, (err as Error).message);
      }
      throw err;
    }

    logDebug("Success:update_schema_incremental", req, {
      entity_type,
      fields_added: (fields_to_add || []).length,
      fields_removed: (fields_to_remove || []).length,
      migrate_existing,
    });
    return res.json({
      success: true,
      schema: newSchema,
      schema_version: newSchema.schema_version,
      fields_removed: fields_to_remove || [],
    });
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
//
// Routes through SchemaRegistryService.register so that schema_definition and
// reducer_config are validated consistently across CLI, MCP and HTTP, and
// schema-level declarations (canonical_name_fields, temporal_fields,
// reference_fields, aliases) are rejected early when malformed.
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
      force = false,
    } = parsed.data;

    const { schemaRegistry } = await import("./services/schema_registry.js");

    // R2 back-compat: existing HTTP/CLI callers may register schemas
    // without declaring canonical_name_fields or identity_opt_out (e.g. the
    // bootstrap path from `neotoma schemas register`). Default to an
    // explicit identity_opt_out so registration still succeeds while
    // surfacing the gap loudly via startup logs and stats. Clients that
    // want strong identity should set `canonical_name_fields` on the
    // request payload.
    const definitionWithIdentity = (() => {
      const def = schema_definition as Record<string, unknown> | undefined;
      if (!def || typeof def !== "object") return schema_definition;
      if (def.canonical_name_fields || def.identity_opt_out) return schema_definition;
      logWarn("DefaultIdentityOptOut:register_schema", req, { entity_type });
      return { ...def, identity_opt_out: "heuristic_canonical_name" };
    })();

    let newSchema;
    try {
      newSchema = await schemaRegistry.register({
        entity_type,
        schema_version,
        schema_definition: definitionWithIdentity as unknown as Parameters<
          typeof schemaRegistry.register
        >[0]["schema_definition"],
        reducer_config: (reducer_config || { merge_policies: {} }) as unknown as Parameters<
          typeof schemaRegistry.register
        >[0]["reducer_config"],
        user_id: userId,
        user_specific,
        activate,
        force,
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : String(err);
      logWarn("ValidationError:register_schema", req, { error: message });
      if (code === "ERR_FORBIDDEN_ENTITY_TYPE" || code === "ERR_PLURAL_ENTITY_TYPE") {
        return sendError(res, 400, code, message);
      }
      return sendError(res, 400, "SCHEMA_VALIDATION_FAILED", message);
    }

    if (activate) {
      try {
        await schemaRegistry.activate(entity_type, newSchema.schema_version);
      } catch (err) {
        logWarn("ActivateError:register_schema", req, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logDebug("Success:register_schema", req, { entity_type, schema_version });
    return res.json({
      success: true,
      schema: newSchema,
      schema_version: newSchema.schema_version,
    });
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

    const correctCtx = contextFromAgentIdentity(getCurrentAgentIdentity());
    if (correctCtx) {
      enforceAgentCapability("correct", [entity_type], correctCtx);
    }
    assertCanWriteProtectedBatch({
      entity_types: [entity_type],
      op: "correct",
      identity: getCurrentAgentIdentity(),
      admission: getCurrentAAuthAdmission(),
    });

    const { createCorrection } = await import("./services/correction.js");
    const result = await createCorrection({
      entity_id,
      entity_type,
      field,
      value,
      schema_version: "1.0",
      user_id: userId,
      idempotency_key,
    });

    logDebug("Success:correct", req, { entity_id, field });
    return res.json({
      success: true,
      observation_id: result.observation_id,
      snapshot: result.snapshot,
    });
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
    const storage =
      config.storageBackend === "local"
        ? {
            storage_backend: "local" as const,
            data_dir: config.dataDir,
            sqlite_db: config.sqlitePath,
          }
        : undefined;

    logDebug("Success:get_authenticated_user", req, { user_id: userId });
    return res.json({ user_id: userId, storage });
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

// GET /session — Resolved attribution for the current request.
//
// Read-only preflight used by local proxies and operators to verify the
// tier and identity fields Neotoma has resolved for a request BEFORE any
// write is attempted. Safe to call repeatedly; MUST NOT create rows or
// emit telemetry. See `src/services/session_info.ts` and
// `docs/subsystems/agent_attribution_integration.md`.
app.get("/session", async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const connectionIdHeader =
      (req.headers["x-connection-id"] as string | string[] | undefined) ??
      (req.headers["X-Connection-Id"] as string | string[] | undefined);
    const connectionId = Array.isArray(connectionIdHeader)
      ? connectionIdHeader[0]
      : connectionIdHeader;
    const rawClientName = typeof req.query.client_name === "string" ? req.query.client_name : null;
    const identity = getAgentIdentityFromRequest(req, {
      clientName: rawClientName,
      clientVersion: typeof req.query.client_version === "string" ? req.query.client_version : null,
      connectionId: typeof connectionId === "string" ? connectionId : null,
    });
    const session = buildSessionInfo({
      userId,
      identity,
      middlewareDecision: getAttributionDecisionFromRequest(req),
      rawClientInfoName: rawClientName,
      admission: getAAuthAdmissionFromRequest(req),
    });
    return res.json(session);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to resolve session identity",
      "AUTH_REQUIRED",
      "APIError:session"
    );
  }
});

// POST /subscribe — Create substrate event subscription (webhook or SSE)
app.post("/subscribe", guestWriteRateLimit, async (req, res) => {
  const schema = z.object({
    user_id: z.string().optional(),
    entity_types: z.array(z.string()).optional(),
    entity_ids: z.array(z.string()).optional(),
    event_types: z.array(z.string()).optional(),
    delivery_method: z.enum(["webhook", "sse"]),
    webhook_url: z.string().optional(),
    webhook_secret: z.string().optional(),
    max_failures: z.number().int().min(1).max(100).optional(),
    sync_peer_id: z.string().min(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    const userId =
      (await resolveGuestUserId(req, principal)) ??
      (await getAuthenticatedUserId(req, parsed.data.user_id));
    const { subscribeUser } = await import("./services/subscriptions/subscription_actions.js");
    const result = await subscribeUser({
      userId,
      input: {
        entity_types: parsed.data.entity_types,
        entity_ids: parsed.data.entity_ids,
        event_types: parsed.data.event_types,
        delivery_method: parsed.data.delivery_method,
        webhook_url: parsed.data.webhook_url,
        webhook_secret: parsed.data.webhook_secret,
        max_failures: parsed.data.max_failures,
        sync_peer_id: parsed.data.sync_peer_id,
      },
    });
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to create subscription",
      "SUBSCRIPTION_ERROR",
      "APIError:subscribe"
    );
  }
});

// POST /unsubscribe — Deactivate subscription
app.post("/unsubscribe", guestWriteRateLimit, async (req, res) => {
  const schema = z.object({
    user_id: z.string().optional(),
    subscription_id: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    const userId =
      (await resolveGuestUserId(req, principal)) ??
      (await getAuthenticatedUserId(req, parsed.data.user_id));
    const { unsubscribeUser } = await import("./services/subscriptions/subscription_actions.js");
    await unsubscribeUser({ userId, subscription_id: parsed.data.subscription_id });
    return res.json({ success: true });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to unsubscribe",
      "SUBSCRIPTION_ERROR",
      "APIError:unsubscribe"
    );
  }
});

// POST /list_subscriptions — List subscriptions (secrets redacted)
app.post("/list_subscriptions", async (req, res) => {
  const schema = z.object({ user_id: z.string().optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    const userId =
      (await resolveGuestUserId(req, principal)) ??
      (await getAuthenticatedUserId(req, parsed.data.user_id));
    const { listSubscriptionsForUser, redactSubscriptionForClient } =
      await import("./services/subscriptions/subscription_actions.js");
    const rows = await listSubscriptionsForUser(userId);
    return res.json({ subscriptions: rows.map(redactSubscriptionForClient) });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to list subscriptions",
      "SUBSCRIPTION_ERROR",
      "APIError:list_subscriptions"
    );
  }
});

// POST /get_subscription_status — One subscription snapshot (secret redacted)
app.post("/get_subscription_status", async (req, res) => {
  const schema = z.object({
    user_id: z.string().optional(),
    subscription_id: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues);
  }
  try {
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    const userId =
      (await resolveGuestUserId(req, principal)) ??
      (await getAuthenticatedUserId(req, parsed.data.user_id));
    const { getSubscriptionStatus, redactSubscriptionForClient } =
      await import("./services/subscriptions/subscription_actions.js");
    const row = await getSubscriptionStatus({
      userId,
      subscription_id: parsed.data.subscription_id,
    });
    if (!row) {
      return res.json({ subscription: null });
    }
    return res.json({ subscription: redactSubscriptionForClient(row) });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get subscription status",
      "SUBSCRIPTION_ERROR",
      "APIError:get_subscription_status"
    );
  }
});

// POST /submit/:entity_type — Generic submission (config-driven)
app.post("/submit/:entity_type", express.json(), async (req, res) => {
  const entity_type = req.params.entity_type;
  if (!entity_type || entity_type.includes("..")) {
    return sendError(res, 400, "VALIDATION_ERROR", "Invalid entity_type");
  }
  try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<
      string,
      unknown
    >;
    const user_id = typeof body.user_id === "string" ? body.user_id : undefined;
    const initial_message =
      typeof body.initial_message === "string" ? body.initial_message : undefined;
    const fields =
      body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
        ? (body.fields as Record<string, unknown>)
        : Object.fromEntries(
            Object.entries(body).filter(([k]) => k !== "user_id" && k !== "initial_message")
          );
    const userId = await getAuthenticatedUserId(req, user_id);
    const { createOperations } = await import("./core/operations.js");
    const { NeotomaServer } = await import("./server.js");
    const server = new NeotomaServer();
    const ops = createOperations({ server, userId });
    const { submitEntity } = await import("./services/entity_submission/submission_service.js");
    const result = await submitEntity(ops, {
      userId,
      entity_type,
      fields,
      initial_message,
    });
    await ops.dispose();
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to submit entity",
      "SUBMISSION_ERROR",
      "APIError:submit_entity"
    );
  }
});

// POST /submit/:entity_type/:entity_id/message — Follow-up message on a submitted root entity
app.post("/submit/:entity_type/:entity_id/message", express.json(), async (req, res) => {
  const entity_id = req.params.entity_id;
  try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<
      string,
      unknown
    >;
    const message =
      typeof body.message === "string"
        ? body.message
        : typeof body.body === "string"
          ? body.body
          : "";
    if (!message.trim()) {
      return sendError(res, 400, "VALIDATION_ERROR", "message or body is required");
    }
    const userId = await getAuthenticatedUserId(
      req,
      typeof body.user_id === "string" ? body.user_id : undefined
    );
    const { createOperations } = await import("./core/operations.js");
    const { NeotomaServer } = await import("./server.js");
    const server = new NeotomaServer();
    const ops = createOperations({ server, userId });
    const { addEntityMessage } = await import("./services/entity_submission/submission_service.js");
    const result = await addEntityMessage(ops, { userId, entity_id, message });
    await ops.dispose();
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to add entity message",
      "SUBMISSION_ERROR",
      "APIError:add_entity_message"
    );
  }
});

// GET /submit/:entity_type/:entity_id — Submission status (JSON snapshot); optional guest_access_token query
app.get("/submit/:entity_type/:entity_id", async (req, res) => {
  const entity_id = req.params.entity_id;
  const guest_access_token =
    typeof req.query.guest_access_token === "string" ? req.query.guest_access_token : undefined;
  try {
    const userId = await getAuthenticatedUserId(req, req.query.user_id as string | undefined);
    const { createOperations } = await import("./core/operations.js");
    const { NeotomaServer } = await import("./server.js");
    const server = new NeotomaServer();
    const ops = createOperations({ server, userId });
    const { getEntitySubmissionStatus } =
      await import("./services/entity_submission/submission_service.js");
    const result = await getEntitySubmissionStatus({ ops, entity_id, guest_access_token });
    await ops.dispose();
    return res.json(result);
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to get submission status",
      "SUBMISSION_ERROR",
      "APIError:get_entity_submission_status"
    );
  }
});

// GET /events/stream — SSE for an SSE-mode subscription
app.get("/events/stream", async (req, res) => {
  const subscription_id =
    typeof req.query.subscription_id === "string" ? req.query.subscription_id : "";
  if (!subscription_id) {
    return sendError(res, 400, "VALIDATION_ERROR", "subscription_id query parameter is required");
  }
  try {
    const principal = await resolveRoutePrincipal(req, ["user", "guest"]);
    const userId =
      (await resolveGuestUserId(req, principal)) ??
      (await getAuthenticatedUserId(req, req.query.user_id as string | undefined));
    const { getSubscriptionStatus } =
      await import("./services/subscriptions/subscription_actions.js");
    const { registerSseClient, getRingEntriesAfter } =
      await import("./services/subscriptions/sse_hub.js");
    const { subscriptionMatchesEvent } =
      await import("./services/subscriptions/subscription_types.js");

    const sub = await getSubscriptionStatus({ userId, subscription_id });
    if (!sub) {
      return sendError(res, 404, "NOT_FOUND", "subscription not found");
    }
    if (!sub.active) {
      return sendError(res, 410, "SUBSCRIPTION_INACTIVE", "subscription is not active");
    }
    if (sub.delivery_method !== "sse") {
      return sendError(
        res,
        400,
        "INVALID_DELIVERY",
        "subscription must use delivery_method sse for this endpoint"
      );
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof (res as { flushHeaders?: () => void }).flushHeaders === "function") {
      (res as { flushHeaders: () => void }).flushHeaders();
    }

    const lastEventIdHeader = req.headers["last-event-id"];
    const lastEventId = Array.isArray(lastEventIdHeader) ? lastEventIdHeader[0] : lastEventIdHeader;

    for (const entry of getRingEntriesAfter(lastEventId, (ev) =>
      subscriptionMatchesEvent(sub, ev)
    )) {
      res.write(`id: ${entry.id}\n`);
      res.write(`event: ${entry.event.event_type}\n`);
      res.write(`data: ${JSON.stringify(entry.event)}\n\n`);
    }

    const client = {
      userId,
      subscription: sub,
      res,
      lastEventId: lastEventId ?? undefined,
    };
    const unregister = registerSseClient(client);

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
        unregister();
      }
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unregister();
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to open event stream",
      "SUBSCRIPTION_ERROR",
      "APIError:events_stream"
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
    const { data: staleSnapshots, error } = await db
      .from("entity_snapshots")
      .select("entity_id, entity_type, observation_count")
      .eq("observation_count", 0);

    if (error) {
      logError("DbError:health_check_snapshots", req, error);
      return sendError(res, 500, "DB_QUERY_FAILED", error.message);
    }

    // Check if these entities actually have observations
    const staleEntities = [];
    for (const snapshot of staleSnapshots || []) {
      const { data: observations, error: obsError } = await db
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
          const { data: observations } = await db
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

// POST /recompute_snapshots_by_type - Batch recompute all snapshots for an entity type
app.post("/recompute_snapshots_by_type", async (req, res) => {
  const schema = z.object({
    entity_type: z.string(),
    dry_run: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:recompute_snapshots_by_type", req, {
      issues: parsed.error.issues,
    });
    return sendValidationError(res, parsed.error.issues);
  }

  try {
    const userId = await getAuthenticatedUserId(req);
    const { entity_type, dry_run } = parsed.data;

    const { data: snapshots, error: snapError } = await db
      .from("entity_snapshots")
      .select("entity_id")
      .eq("entity_type", entity_type)
      .eq("user_id", userId);

    if (snapError) {
      logError("DbError:recompute_snapshots_by_type", req, snapError);
      return sendError(res, 500, "DB_QUERY_FAILED", snapError.message);
    }

    const entityIds = (snapshots || []).map((s: { entity_id: string }) => s.entity_id);

    if (dry_run) {
      return res.json({
        entity_type,
        dry_run: true,
        entities_to_recompute: entityIds.length,
        entity_ids: entityIds,
      });
    }

    // Use recomputeSnapshot so that:
    //   - The active schema is loaded and applied (schema-driven canonical_name
    //     and timeline events).
    //   - Embedding preparation, snapshot upsert, and timeline event upsert
    //     all run through the shared pipeline.
    const { recomputeSnapshot } = await import("./services/snapshot_computation.js");
    let recomputed = 0;
    let errors = 0;
    const errorDetails: Array<{ entity_id: string; error: string }> = [];

    for (const entityId of entityIds) {
      try {
        const snapshot = await recomputeSnapshot(entityId, userId);
        if (snapshot) recomputed++;
      } catch (err) {
        errors++;
        errorDetails.push({
          entity_id: entityId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logDebug("Success:recompute_snapshots_by_type", req, {
      entity_type,
      total: entityIds.length,
      recomputed,
      errors,
    });

    return res.json({
      entity_type,
      total: entityIds.length,
      recomputed,
      errors,
      error_details: errorDetails.length > 0 ? errorDetails : undefined,
    });
  } catch (error) {
    return handleApiError(
      req,
      res,
      error,
      "Failed to recompute snapshots",
      "DB_QUERY_FAILED",
      "APIError:recompute_snapshots_by_type"
    );
  }
});

// ========== End of Phase 0 endpoints ==========

// Chat endpoint removed - violates Application Layer constraint "MUST NOT contain conversational logic"
// Conversational interactions should be externalized to MCP-compatible agents per architecture

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** True if url is a non-local base URL (safe to use as public server in OpenAPI). */
function isNonLocalBaseUrl(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  try {
    return !isLocalHostname(new URL(url.replace(/\/$/, "")).hostname);
  } catch {
    return false;
  }
}

/** Request base URL (protocol + host) for import-from-URL; respects X-Forwarded-* when behind a proxy. When the request host is localhost and config.apiBase is set to a non-local URL (e.g. tunnel), use apiBase so the schema lists the public URL. */
function getRequestBaseUrl(req: express.Request): string {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.get("host") || "";
  const proto = forwardedProto || req.protocol || "http";
  const fromRequest = host ? `${proto}://${host}`.replace(/\/$/, "") : "";
  if (fromRequest) {
    try {
      const reqHostname = new URL(fromRequest).hostname;
      if (isLocalHostname(reqHostname)) {
        const baseUrl = (config.apiBase || "").replace(/\/$/, "");
        if (isNonLocalBaseUrl(baseUrl)) return baseUrl;
      }
    } catch {
      // use fromRequest
    }
  }
  return fromRequest;
}

/** Filter OpenAPI servers to only those with the same hostname as the request; if none match, use request origin. */
function filterServersToRequestHost(
  spec: { servers?: Array<{ url: string; description?: string }> },
  req: express.Request
): void {
  const requestBase = getRequestBaseUrl(req);
  if (!spec.servers?.length) return;
  let requestHostname: string;
  try {
    requestHostname = requestBase ? new URL(requestBase).hostname : "";
  } catch {
    return;
  }
  if (!requestHostname) return;
  const sameHost = spec.servers.filter((s) => {
    try {
      return new URL(s.url).hostname === requestHostname;
    } catch {
      return false;
    }
  });
  if (sameHost.length > 0) {
    spec.servers = sameHost;
  } else if (requestBase) {
    spec.servers = [{ url: requestBase, description: spec.servers[0]?.description }];
  }
}

/** If the spec still has a local server URL but we have a non-local apiBase (e.g. tunnel), use apiBase so import-from-URL gets the public root. */
function ensureNonLocalServerWhenConfigured(spec: {
  servers?: Array<{ url: string; description?: string }>;
}): void {
  if (!spec.servers?.length) return;
  const baseUrl = (config.apiBase || "").replace(/\/$/, "");
  if (!isNonLocalBaseUrl(baseUrl)) return;
  try {
    const first = new URL(spec.servers[0].url);
    if (isLocalHostname(first.hostname)) {
      spec.servers = [{ url: baseUrl, description: spec.servers[0].description }];
    }
  } catch {
    // leave as-is
  }
}

app.get("/openapi.yaml", (req, res) => {
  const openApiContent = readOpenApiFile();
  const spec = yaml.load(openApiContent) as {
    servers?: Array<{ url: string; description?: string }>;
  };
  filterServersToRequestHost(spec, req);
  ensureNonLocalServerWhenConfigured(spec);
  res.setHeader("Content-Type", "application/yaml");
  res.send(yaml.dump(spec, { lineWidth: -1 }));
});

app.get("/openapi_actions.yaml", (req, res) => {
  const content = readOpenApiActionsFile();
  const spec = yaml.load(content) as { servers?: Array<{ url: string; description?: string }> };
  filterServersToRequestHost(spec, req);
  ensureNonLocalServerWhenConfigured(spec);
  res.setHeader("Content-Type", "application/yaml");
  res.send(yaml.dump(spec, { lineWidth: -1 }));
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
      // When `port === 0` the OS assigns an ephemeral port. We must report
      // the actually-bound port back to callers (the eval harness's
      // isolated server fixture writes it to NEOTOMA_SESSION_PORT_FILE so
      // the test harness can hit /health). Without this, a port file would
      // contain the literal "0" and the health probe would never connect.
      const addr = server.address();
      const boundPort =
        addr && typeof addr === "object" && typeof addr.port === "number" ? addr.port : port;

      // Extend keep-alive so MCP SSE streams and long-lived Inspector
      // connections survive behind reverse proxies (Cloudflare Tunnel,
      // ngrok, etc.). Node 18+ defaults keepAliveTimeout to 5 s, which is
      // shorter than most proxy idle timeouts (60–300 s) and causes the
      // proxy to receive a TCP RST mid-stream, triggering a 502/reconnect
      // cycle that looks like "bearer token expired." headersTimeout must
      // exceed keepAliveTimeout to avoid a Node bug where the socket is
      // closed before the headers timeout fires.
      // Both values are configurable via env vars (milliseconds).
      server.keepAliveTimeout = parseInt(process.env.NEOTOMA_KEEPALIVE_TIMEOUT_MS ?? "120000", 10);
      server.headersTimeout = parseInt(process.env.NEOTOMA_HEADERS_TIMEOUT_MS ?? "125000", 10);

      resolve({ server, port: boundPort });
    });
    server.once("error", (err: NodeJS.ErrnoException) => {
      server.close();
      reject(err);
    });
  });
}

// Export function to start HTTP server (called explicitly, not on import)
export async function startHTTPServer() {
  // Stronger AAuth Admission plan: capabilities now live on agent_grant
  // entities. If the legacy NEOTOMA_AGENT_CAPABILITIES_* env vars are
  // still set, fail fast with a structured pointer to the migration
  // command. See docs/subsystems/agent_attribution_integration.md.
  const { assertNoLegacyCapabilityEnv, LegacyAgentCapabilityEnvError } =
    await import("./services/agent_capabilities.js");
  try {
    assertNoLegacyCapabilityEnv();
  } catch (err) {
    if (err instanceof LegacyAgentCapabilityEnvError) {
      logger.error(
        JSON.stringify({
          event: "boot_failed_legacy_agent_capabilities_env",
          variables: err.variables,
          migration_command: err.migrationCommand,
          message: err.message,
        })
      );
      throw err;
    }
    throw err;
  }

  // Initialize encryption service
  await initServerKeys();

  // Seed `issue` schema for the GitHub Issues integration.
  try {
    const { seedIssueSchema } = await import("./services/issues/seed_schema.js");
    await seedIssueSchema();
    logger.info("[Issues] issue schema seeded");
  } catch (err) {
    logger.warn(`[Issues] failed to seed issue schema: ${(err as Error).message}`);
  }

  // Seed generic `plan` schema (harness-authored plans, issue-resolution plans, ad-hoc agent plans).
  try {
    const { seedPlanSchema } = await import("./services/plans/seed_schema.js");
    await seedPlanSchema();
    logger.info("[Plans] plan schema seeded");
  } catch (err) {
    logger.warn(`[Plans] failed to seed plan schema: ${(err as Error).message}`);
  }

  try {
    const { seedSubscriptionSchema } = await import("./services/subscriptions/seed_schema.js");
    await seedSubscriptionSchema();
    logger.info("[Subscriptions] subscription schema seeded");
  } catch (err) {
    logger.warn(`[Subscriptions] failed to seed subscription schema: ${(err as Error).message}`);
  }

  try {
    const { seedSubmissionDefaults } =
      await import("./services/entity_submission/seed_submission_defaults.js");
    await seedSubmissionDefaults();
    logger.info("[entity_submission] submission_config schema bootstrap complete");
  } catch (err) {
    logger.warn(
      `[entity_submission] failed submission_config schema bootstrap: ${(err as Error).message}`
    );
  }

  try {
    const { seedPeerConfigSchema } = await import("./services/sync/seed_peer_schema.js");
    await seedPeerConfigSchema();
    logger.info("[sync] peer_config schema seeded");
  } catch (err) {
    logger.warn(`[sync] failed to seed peer_config schema: ${(err as Error).message}`);
  }

  // Sandbox mode: ensure the `sandbox_abuse_report` entity type is registered
  // before any report comes in so forwarded records can attach cleanly to the
  // entity graph. Non-sandbox deployments still benefit from having the schema
  // available in case operators run a self-hosted abuse form.
  if (isSandboxMode()) {
    try {
      const { seedSandboxAbuseReportSchema } = await import("./services/sandbox/seed_schema.js");
      await seedSandboxAbuseReportSchema();
      logger.info("[Sandbox] sandbox_abuse_report schema seeded");
    } catch (err) {
      logger.warn(
        `[Sandbox] failed to seed sandbox_abuse_report schema: ${(err as Error).message}`
      );
    }
  }

  const httpPortEnv = process.env.NEOTOMA_HTTP_PORT || process.env.HTTP_PORT;
  const basePort = httpPortEnv ? parseInt(httpPortEnv, 10) : config.httpPort || 3080;
  const portFile = process.env.NEOTOMA_SESSION_PORT_FILE;
  const maxTries = 20;
  // basePort === 0 means OS-assigned ephemeral port; retrying on EADDRINUSE
  // makes no sense (and would try port 1, 2, ...). The eval harness uses
  // ephemeral ports to avoid colliding with the operator's dev server.
  const triesLimit = basePort === 0 ? 1 : maxTries;

  for (let offset = 0; offset < triesLimit; offset++) {
    const port = basePort + offset;
    try {
      const { server, port: boundPort } = await tryListen(port);
      if (portFile) {
        fs.writeFileSync(portFile, String(boundPort), "utf-8");
      }
      // eslint-disable-next-line no-console
      console.log(`HTTP Actions listening on :${boundPort}`);
      if (process.env.NODE_ENV !== "test") {
        writeLocalHttpPortFile(config.projectRoot, boundPort, config.environment);
      }

      // Start background OAuth state cleanup job
      import("./services/mcp_oauth.js").then((oauth) => {
        oauth.startStateCleanupJob();
      });
      const subscriptionBridge =
        await import("./services/subscriptions/install_subscription_bridge.js");
      subscriptionBridge.installSubscriptionBridge();
      logger.info("[Subscriptions] substrate event bridge installed");
      return { server, port: boundPort };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EADDRINUSE" && offset < triesLimit - 1) {
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
