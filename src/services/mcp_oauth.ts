/**
 * MCP OAuth Service
 *
 * Handles OAuth 2.0 Authorization Code flow with PKCE for MCP authentication
 */

import { randomBytes, createHash, createCipheriv, createDecipheriv, randomUUID } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient, supabase } from "../db.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { OAuthError, createOAuthError } from "./mcp_oauth_errors.js";
import { clearSqliteCache, getSqliteDb } from "../repositories/sqlite/sqlite_client.js";

// Cached service role client instance
let cachedServiceRoleClient: SupabaseClient | null = null;

/**
 * Get service role client for OAuth operations (bypasses RLS)
 * Client is cached to avoid recreation on every request
 * Used for:
 * - mcp_oauth_state operations (only allows service_role)
 * - mcp_oauth_connections operations (bypasses RLS)
 * - Dynamic OAuth client registration
 */
function getServiceRoleSupabaseClient(): SupabaseClient {
  if (!cachedServiceRoleClient) {
    cachedServiceRoleClient = getServiceRoleClient() as SupabaseClient;
  }
  return cachedServiceRoleClient;
}

// In-memory cache for dynamically registered client_id
// This avoids re-registering the same client on every request
let cachedClientId: string | null = null;
let cachedRedirectUri: string | null = null; // Track which redirect_uri was used for registration
let clientRegistrationPromise: Promise<string> | null = null;

interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _MCPConnection {
  id: string;
  user_id: string;
  connection_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  client_name: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

// Encryption key for refresh tokens (use environment variable or config)
const ENCRYPTION_KEY = process.env.MCP_TOKEN_ENCRYPTION_KEY || config.mcpTokenEncryptionKey;
const isLocalBackend = config.storageBackend === "local";

interface LocalOAuthStateRow {
  id: string;
  state: string;
  code_verifier: string;
  code_challenge: string | null;
  connection_id: string;
  redirect_uri: string;
  client_state: string | null;
  created_at: string;
  expires_at: string;
  final_redirect_uri: string | null;
}

interface LocalConnectionRow {
  id: string;
  user_id: string;
  connection_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  client_name: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateLocalToken(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

function getLocalOAuthState(state: string): LocalOAuthStateRow | null {
  const db = getSqliteDb();
  const row = db
    .prepare(
      "SELECT id, state, code_verifier, code_challenge, connection_id, redirect_uri, client_state, created_at, expires_at, final_redirect_uri FROM mcp_oauth_state WHERE state = ?"
    )
    .get(state);
  return row ? (row as LocalOAuthStateRow) : null;
}

function getLocalOAuthStateForConnection(connectionId: string): LocalOAuthStateRow | null {
  const db = getSqliteDb();
  const row = db
    .prepare(
      "SELECT id, state, code_verifier, code_challenge, connection_id, redirect_uri, client_state, created_at, expires_at, final_redirect_uri FROM mcp_oauth_state WHERE connection_id = ?"
    )
    .get(connectionId);
  return row ? (row as LocalOAuthStateRow) : null;
}

function deleteLocalOAuthState(state: string): void {
  const db = getSqliteDb();
  db.prepare("DELETE FROM mcp_oauth_state WHERE state = ?").run(state);
}

function cleanupExpiredLocalStates(): void {
  try {
    const db = getSqliteDb();
    db.prepare("DELETE FROM mcp_oauth_state WHERE expires_at < ?").run(nowIso());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[MCP OAuth] Local state cleanup failed (sqlitePath=${config.sqlitePath}): ${msg}. Clearing DB cache so next use will recreate the file if missing.`
    );
    clearSqliteCache();
  }
}

function insertLocalOAuthState(payload: {
  state: string;
  codeVerifier: string;
  codeChallenge: string | null;
  connectionId: string;
  redirectUri: string;
  clientState?: string | null;
  finalRedirectUri?: string | null;
  expiresAt: string;
}): void {
  const db = getSqliteDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO mcp_oauth_state (id, state, code_verifier, code_challenge, connection_id, redirect_uri, client_state, created_at, expires_at, final_redirect_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    payload.state,
    payload.codeVerifier,
    payload.codeChallenge,
    payload.connectionId,
    payload.redirectUri,
    payload.clientState ?? null,
    nowIso(),
    payload.expiresAt,
    payload.finalRedirectUri ?? null
  );
}

function getLocalConnectionById(connectionId: string): LocalConnectionRow | null {
  const db = getSqliteDb();
  const row = db
    .prepare(
      "SELECT id, user_id, connection_id, refresh_token, access_token, access_token_expires_at, client_name, last_used_at, created_at, revoked_at FROM mcp_oauth_connections WHERE connection_id = ? AND revoked_at IS NULL"
    )
    .get(connectionId);
  return row ? (row as LocalConnectionRow) : null;
}

function getLocalConnectionByAccessToken(accessToken: string): LocalConnectionRow | null {
  const db = getSqliteDb();
  const row = db
    .prepare(
      "SELECT id, user_id, connection_id, refresh_token, access_token, access_token_expires_at, client_name, last_used_at, created_at, revoked_at FROM mcp_oauth_connections WHERE access_token = ? AND revoked_at IS NULL"
    )
    .get(accessToken);
  return row ? (row as LocalConnectionRow) : null;
}

function upsertLocalConnection(payload: {
  userId: string;
  connectionId: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  clientName?: string | null;
}): void {
  const db = getSqliteDb();
  const existing = getLocalConnectionById(payload.connectionId);
  if (existing) {
    db.prepare(
      "UPDATE mcp_oauth_connections SET user_id = ?, refresh_token = ?, access_token = ?, access_token_expires_at = ?, client_name = ?, last_used_at = ?, revoked_at = NULL WHERE connection_id = ?"
    ).run(
      payload.userId,
      payload.refreshToken,
      payload.accessToken,
      payload.accessTokenExpiresAt,
      payload.clientName ?? null,
      nowIso(),
      payload.connectionId
    );
    return;
  }
  db.prepare(
    "INSERT INTO mcp_oauth_connections (id, user_id, connection_id, refresh_token, access_token, access_token_expires_at, client_name, last_used_at, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    randomUUID(),
    payload.userId,
    payload.connectionId,
    payload.refreshToken,
    payload.accessToken,
    payload.accessTokenExpiresAt,
    payload.clientName ?? null,
    nowIso(),
    nowIso(),
    null
  );
}

function updateLocalConnectionLastUsed(connectionId: string): void {
  const db = getSqliteDb();
  db.prepare("UPDATE mcp_oauth_connections SET last_used_at = ? WHERE connection_id = ?").run(
    nowIso(),
    connectionId
  );
}

function revokeLocalConnection(connectionId: string, userId: string): void {
  const db = getSqliteDb();
  db.prepare(
    "UPDATE mcp_oauth_connections SET revoked_at = ? WHERE connection_id = ? AND user_id = ?"
  ).run(nowIso(), connectionId, userId);
}

/**
 * Validate connection_id format
 * Must be alphanumeric with dashes and underscores, 1-100 characters
 */
function validateConnectionId(connectionId: string): void {
  if (!connectionId || typeof connectionId !== "string") {
    throw createOAuthError.stateInvalid("connection_id must be a non-empty string");
  }
  if (connectionId.length < 1 || connectionId.length > 100) {
    throw createOAuthError.stateInvalid("connection_id must be 1-100 characters");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(connectionId)) {
    throw createOAuthError.stateInvalid(
      "connection_id must contain only alphanumeric characters, dashes, and underscores"
    );
  }
}

/**
 * Validate redirect URI format
 * Must be a valid URL (http/https for web, custom scheme for apps)
 */
function validateRedirectUri(redirectUri: string): void {
  if (!redirectUri || typeof redirectUri !== "string") {
    throw createOAuthError.invalidRedirectUri("redirect_uri must be a non-empty string");
  }
  try {
    const url = new URL(redirectUri);
    // Allow http/https for web, and custom schemes for apps (cursor://, vscode://, etc.)
    if (!url.protocol.match(/^(https?|cursor|vscode|app):$/)) {
      throw createOAuthError.invalidRedirectUri(`Invalid redirect URI protocol: ${url.protocol}`);
    }
  } catch (error) {
    throw createOAuthError.invalidRedirectUri(`Invalid redirect URI format: ${redirectUri}`);
  }
}

/**
 * Validate state token format
 * Must be base64url string, reasonable length
 */
function validateState(state: string): void {
  if (!state || typeof state !== "string") {
    throw createOAuthError.stateInvalid("state must be a non-empty string");
  }
  if (state.length < 10 || state.length > 256) {
    throw createOAuthError.stateInvalid("state must be 10-256 characters");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(state)) {
    throw createOAuthError.stateInvalid(
      "state must be base64url format (alphanumeric, dash, underscore)"
    );
  }
}

/**
 * Validate encryption key format
 * Must be 64 hex characters (32 bytes)
 */
function validateEncryptionKey(key: string | undefined): void {
  if (!key) {
    throw createOAuthError.encryptionKeyMissing();
  }
  if (typeof key !== "string") {
    throw createOAuthError.encryptionKeyInvalid("key must be a string");
  }
  if (key.length !== 64) {
    throw createOAuthError.encryptionKeyInvalid(
      `key must be 64 hex characters (got ${key.length})`
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw createOAuthError.encryptionKeyInvalid("key must contain only hex characters (0-9, a-f)");
  }
}

/**
 * Generate PKCE challenge and verifier
 *
 * Creates a cryptographically secure code verifier and corresponding SHA-256 challenge
 * for OAuth 2.0 PKCE (Proof Key for Code Exchange) flow.
 *
 * @returns Object containing codeVerifier (128 chars) and codeChallenge (base64url SHA-256 hash)
 * @example
 * const { codeVerifier, codeChallenge } = generatePKCE();
 * // codeVerifier: "abc123..." (128 chars)
 * // codeChallenge: "xyz789..." (43 chars)
 */
export function generatePKCE(): PKCEChallenge {
  const codeVerifier = randomBytes(64)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 128);

  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  return { codeVerifier, codeChallenge };
}

/**
 * Generate random state token
 */
function generateState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Encrypt refresh token for storage
 * Exported for testing purposes only
 */
export function encryptRefreshToken(token: string): string {
  validateEncryptionKey(ENCRYPTION_KEY);

  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt refresh token from storage
 * Exported for testing purposes only
 */
export function decryptRefreshToken(encrypted: string): string {
  validateEncryptionKey(ENCRYPTION_KEY);

  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const parts = encrypted.split(":");

  if (parts.length !== 3) {
    throw createOAuthError.decryptionFailed("Invalid encrypted token format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encryptedData = parts[2];

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Register OAuth client dynamically using Supabase admin API
 *
 * This function registers an OAuth client when "Allow Dynamic OAuth Apps" is enabled.
 * The client_id is cached in memory to avoid re-registering on every request.
 *
 * Note: This requires "Allow Dynamic OAuth Apps" to be enabled in Supabase Dashboard.
 * If dynamic registration fails, users should manually register a client and set SUPABASE_OAUTH_CLIENT_ID.
 */
async function registerOAuthClient(redirectUri: string): Promise<string> {
  // If registration is already in progress, wait for it
  if (clientRegistrationPromise) {
    return clientRegistrationPromise;
  }

  // If we have a cached client_id, check if redirect_uri matches
  // If redirect_uri changed, clear cache and re-register
  if (cachedClientId && cachedRedirectUri === redirectUri) {
    return cachedClientId;
  }

  // Redirect URI changed - clear cache and re-register
  if (cachedClientId && cachedRedirectUri !== redirectUri) {
    cachedClientId = null;
    cachedRedirectUri = null;
  }

  // Start registration
  clientRegistrationPromise = (async (): Promise<string> => {
    try {
      if (isLocalBackend) {
        const localClientId = "local_mcp_oauth_client";
        const db = getSqliteDb();
        const existing = db
          .prepare("SELECT id, client_id FROM mcp_oauth_client_state WHERE client_id = ?")
          .get(localClientId);
        if (!existing) {
          db.prepare(
            "INSERT INTO mcp_oauth_client_state (id, client_id, redirect_uri, created_at) VALUES (?, ?, ?, ?)"
          ).run(randomUUID(), localClientId, redirectUri, nowIso());
        }
        cachedClientId = localClientId;
        cachedRedirectUri = redirectUri;
        return localClientId;
      }

      const clientName = "Neotoma MCP Client";
      const supabaseUrl = config.supabaseUrl;
      const serviceKey = config.supabaseKey;

      if (!supabaseUrl || !serviceKey) {
        throw createOAuthError.clientRegistrationFailed(
          "Supabase URL or service key not configured"
        );
      }

      // Try JavaScript client method first (if available)
      const adminClient = getServiceRoleSupabaseClient();
      const adminApi = adminClient.auth.admin as any;

      if (typeof adminApi.createOAuthClient === "function") {
        // Use JavaScript client method if available
        const { data, error } = await adminApi.createOAuthClient({
          name: clientName,
          redirect_uris: [redirectUri],
        });

        if (error) {
          logger.warn(`[MCP OAuth] Failed to register OAuth client via JS API: ${error.message}`);
          // Fall through to REST API fallback
        } else if (data?.client_id) {
          const registeredClientId = String(data.client_id);
          cachedClientId = registeredClientId;
          cachedRedirectUri = redirectUri; // Track which redirect_uri was used
          logger.info(
            `[MCP OAuth] Dynamically registered OAuth client via JS API: ${registeredClientId}`
          );
          return registeredClientId;
        }
      }

      // Fallback: Use REST API directly
      // This works even if the JavaScript client doesn't have the method
      // Note: The exact endpoint may vary - Supabase OAuth 2.1 Server is in beta
      // If this fails, manual registration is recommended
      logger.info(`[MCP OAuth] Attempting OAuth client registration via REST API...`);

      // Try the admin API endpoint for OAuth client registration
      // This endpoint may not be publicly documented yet (OAuth 2.1 Server is in beta)
      const registrationUrl = `${supabaseUrl}/auth/v1/admin/oauth/clients`;

      const response = await fetch(registrationUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          name: clientName,
          redirect_uris: [redirectUri],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }

        logger.error(`[MCP OAuth] Failed to register OAuth client via REST API: ${errorMessage}`);

        // Check for common error cases
        if (
          errorMessage.includes("not enabled") ||
          errorMessage.includes("dynamic") ||
          errorMessage.includes("403") ||
          errorMessage.includes("Forbidden")
        ) {
          throw createOAuthError.clientRegistrationFailed(
            `Dynamic OAuth client registration is not enabled or not permitted. ` +
              `Enable "Allow Dynamic OAuth Apps" in Supabase Dashboard > Authentication > OAuth Server, ` +
              `or manually register a client and set SUPABASE_OAUTH_CLIENT_ID environment variable.`,
            { errorMessage }
          );
        }

        throw createOAuthError.clientRegistrationFailed(
          `Failed to register OAuth client dynamically: ${errorMessage}. ` +
            `Ensure "Allow Dynamic OAuth Apps" is enabled in Supabase Dashboard, ` +
            `or manually register a client and set SUPABASE_OAUTH_CLIENT_ID environment variable.`,
          { errorMessage }
        );
      }

      const data = await response.json();

      if (!data?.client_id) {
        throw createOAuthError.clientRegistrationFailed(
          "OAuth client registration succeeded but no client_id returned"
        );
      }

      // Cache the client_id (ensure it's a string)
      const registeredClientId = String(data.client_id);
      cachedClientId = registeredClientId;
      cachedRedirectUri = redirectUri; // Track which redirect_uri was used
      logger.info(
        `[MCP OAuth] Dynamically registered OAuth client via REST API: ${registeredClientId}`
      );

      return registeredClientId;
    } catch (error: any) {
      // Clear the promise so we can retry
      clientRegistrationPromise = null;
      throw error;
    }
  })();

  return clientRegistrationPromise;
}

/**
 * Get OAuth client_id, registering dynamically if needed
 *
 * This function:
 * 1. First checks if SUPABASE_OAUTH_CLIENT_ID is set in config (manual registration)
 * 2. If not, attempts to register a client dynamically (requires "Allow Dynamic OAuth Apps")
 * 3. Caches the client_id to avoid re-registration
 */
async function getOrRegisterClientId(redirectUri: string): Promise<string> {
  // If client_id is explicitly configured, use it (manual registration takes precedence)
  if (config.oauthClientId) {
    return config.oauthClientId;
  }

  // Otherwise, try dynamic registration
  try {
    const clientId = await registerOAuthClient(redirectUri);

    if (!clientId) {
      throw createOAuthError.clientRegistrationFailed(
        "Dynamic registration returned null client_id"
      );
    }
    return clientId;
  } catch (error: any) {
    // If dynamic registration fails, provide helpful error message
    throw createOAuthError.clientRegistrationFailed(
      `OAuth client_id not configured and dynamic registration failed. ` +
        `Error: ${error.message}. ` +
        `Options: 1) Set SUPABASE_OAUTH_CLIENT_ID in .env file, or ` +
        `2) Enable "Allow Dynamic OAuth Apps" in Supabase Dashboard > Authentication > OAuth Server.`,
      { originalError: error.message }
    );
  }
}

/**
 * Handle RFC 7591 Dynamic Client Registration requests.
 * Used by Cursor and other MCP clients that require registration_endpoint in discovery.
 * Registers a client for the given redirect_uris and returns client metadata.
 */
export async function handleDynamicRegistration(body: {
  redirect_uris: string[];
  client_name?: string;
  scope?: string;
}): Promise<{
  client_id: string;
  client_id_issued_at: number;
  redirect_uris: string[];
  grant_types_supported: string[];
  response_types_supported: string[];
  code_challenge_methods_supported: string[];
  scope?: string;
}> {
  const { redirect_uris, scope } = body;
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    throw new Error("redirect_uris is required and must be a non-empty array");
  }
  for (const uri of redirect_uris) {
    validateRedirectUri(uri);
  }
  const redirectUri = redirect_uris[0];
  const clientId = await getOrRegisterClientId(redirectUri);
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris,
    grant_types_supported: ["authorization_code"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    ...(scope && { scope }),
  };
}

/**
 * Create Supabase OAuth authorization URL
 *
 * Uses Supabase's PKCE flow for OAuth 2.0 Authorization Code flow.
 * Note: This uses Supabase Auth's own authentication, not a third-party provider.
 *
 * **Automatic Client Registration:**
 * - If `SUPABASE_OAUTH_CLIENT_ID` is not set, this function will attempt to register a client
 *   dynamically using `supabase.auth.admin.createOAuthClient()`
 * - This requires "Allow Dynamic OAuth Apps" to be enabled in Supabase Dashboard
 * - The registered `client_id` is cached in memory to avoid re-registration
 * - If dynamic registration fails, a clear error message is provided with instructions
 *
 * **Manual Client Registration (Alternative):**
 * - Set `SUPABASE_OAUTH_CLIENT_ID` in `.env` file to use a manually registered client
 * - Manual registration takes precedence over dynamic registration
 */
export async function createAuthUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string
): Promise<string> {
  // Validate inputs
  validateState(state);
  validateRedirectUri(redirectUri);

  if (isLocalBackend) {
    const localAuthUrl = new URL(`${config.apiBase}/api/mcp/oauth/local-login`);
    localAuthUrl.searchParams.set("state", state);
    return localAuthUrl.toString();
  }

  // Use config.supabaseUrl instead of process.env directly
  const supabaseUrl = config.supabaseUrl;

  if (!supabaseUrl) {
    throw createOAuthError.clientRegistrationFailed("Supabase URL not configured");
  }

  // Get or register client_id
  const clientId = await getOrRegisterClientId(redirectUri);

  // Use OAuth 2.1 Server endpoint (requires client_id)
  const authUrl = new URL(`${supabaseUrl}/auth/v1/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const finalAuthUrl = authUrl.toString();

  return finalAuthUrl;
}

/**
 * Clean up expired OAuth states
 */
async function cleanupExpiredStates(): Promise<void> {
  try {
    if (isLocalBackend) {
      cleanupExpiredLocalStates();
      return;
    }

    // Use service role client to bypass RLS (mcp_oauth_state only allows service_role)
    const { error, count } = await getServiceRoleSupabaseClient()
      .from("mcp_oauth_state")
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (error) {
      logger.warn(`[MCP OAuth] Failed to cleanup expired states: ${error.message}`);
    } else if (count && count > 0) {
      logger.info(`[MCP OAuth] Cleaned up ${count} expired OAuth states`);
    }
  } catch (error: any) {
    logger.warn(`[MCP OAuth] Error during state cleanup: ${error.message}`);
  }
}

/**
 * Audit log for OAuth events
 * Logs security-relevant OAuth operations with full context
 */
function auditLog(
  event: string,
  context: {
    connectionId?: string;
    userId?: string;
    ipAddress?: string;
    success: boolean;
    errorMessage?: string;
    [key: string]: any;
  }
): void {
  const auditEntry = {
    event,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (context.success) {
    logger.info(`[MCP OAuth Audit] ${event}`, auditEntry);
  } else {
    logger.warn(`[MCP OAuth Audit] ${event} FAILED`, auditEntry);
  }
}

/**
 * Background job for cleaning up expired OAuth states
 * Runs every 5 minutes to remove expired state tokens
 */
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start background cleanup job
 *
 * Starts periodic cleanup of expired OAuth states (runs every 5 minutes).
 * Should be called once when HTTP server starts.
 *
 * @example
 * startStateCleanupJob();
 * // Background job runs every 5 minutes
 */
export function startStateCleanupJob(): void {
  if (cleanupInterval) {
    logger.warn("[MCP OAuth] State cleanup job already running");
    return;
  }

  // Run cleanup every 5 minutes
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  logger.info("[MCP OAuth] Starting background state cleanup job (runs every 5 minutes)");

  // Run cleanup immediately on start
  cleanupExpiredStates().catch((error) => {
    logger.error(`[MCP OAuth] Initial state cleanup failed: ${error.message}`);
  });

  // Schedule periodic cleanup
  cleanupInterval = setInterval(() => {
    cleanupExpiredStates().catch((error) => {
      logger.error(`[MCP OAuth] Scheduled state cleanup failed: ${error.message}`);
    });
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop background cleanup job
 *
 * Stops periodic state cleanup. Should be called when server is shutting down.
 *
 * @example
 * stopStateCleanupJob();
 * // Background job stops
 */
export function stopStateCleanupJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("[MCP OAuth] Stopped background state cleanup job");
  }
}

/**
 * Initiate OAuth flow for MCP connection
 *
 * Creates OAuth authorization URL with PKCE challenge and stores state in database.
 * Returns authorization URL that user should visit to complete authentication.
 *
 * @param connectionId - Unique identifier for this MCP connection (alphanumeric, dashes, underscores)
 * @param clientName - Optional name of MCP client (e.g., "Cursor", "Claude Desktop")
 * @param redirectUri - Optional redirect URI (defaults to API callback endpoint)
 * @param clientState - Optional client state to return in callback (used by Cursor)
 * @returns Authorization URL, connection ID, and state expiration time
 * @throws {OAuthError} If connection_id format is invalid or state storage fails
 * @example
 * const result = await initiateOAuthFlow("cursor-2025-01-27-abc123", "Cursor");
 * // User should visit result.authUrl to complete authentication
 */
export async function initiateOAuthFlow(
  connectionId: string,
  clientName?: string,
  redirectUri?: string,
  clientState?: string
): Promise<{ authUrl: string; connectionId: string; expiresAt: string }> {
  // Validate inputs
  validateConnectionId(connectionId);
  if (redirectUri) {
    validateRedirectUri(redirectUri);
  }

  // Note: State cleanup is now handled by background job (runs every 5 minutes)
  // No need to clean up on every request

  // Generate PKCE challenge
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();

  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  const frontendBase = process.env.FRONTEND_URL || "http://localhost:5195";
  const finalRedirectUri = redirectUri ?? `${frontendBase}/oauth`;

  if (isLocalBackend) {
    insertLocalOAuthState({
      state,
      codeVerifier,
      codeChallenge,
      connectionId,
      redirectUri: finalRedirectUri,
      finalRedirectUri,
      clientState: clientState ?? null,
      expiresAt: expiresAt.toISOString(),
    });
    const authUrl = await createAuthUrl(state, codeChallenge, finalRedirectUri);
    logger.info(`[MCP OAuth] Initiated local OAuth flow for connection: ${connectionId}`);
    auditLog("oauth_flow_initiated", {
      connectionId,
      clientName,
      success: true,
    });
    return {
      authUrl,
      connectionId,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // Supabase always redirects to our callback; we then redirect to finalRedirectUri (e.g. cursor://) if set
  // IMPORTANT: OAuth redirect URI must match what's registered in Supabase exactly
  // Default to HOST_URL (or discovered tunnel URL) so OAuth callbacks are reachable from internet
  // Still allow explicit OAUTH_REDIRECT_BASE_URL override for edge cases (e.g. Supabase registered with localhost)
  const oauthRedirectBase =
    process.env.OAUTH_REDIRECT_BASE_URL || config.apiBase;
  const supabaseRedirectUri = `${oauthRedirectBase}/api/mcp/oauth/callback`;

  const { error } = await getServiceRoleSupabaseClient()
    .from("mcp_oauth_state")
    .insert({
      state,
      connection_id: connectionId,
      code_verifier: codeVerifier,
      redirect_uri: supabaseRedirectUri, // Store the OAuth redirect URI (must match authorization URL)
      final_redirect_uri: finalRedirectUri ?? null, // Store the client's final redirect URI (e.g., cursor://)
      client_state: clientState ?? null,
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    logger.error(`[MCP OAuth] Failed to store OAuth state: ${error.message}`);

    // Provide helpful error message for schema cache issues
    if (error.message?.includes("Could not find") && error.message?.includes("column")) {
      throw createOAuthError.stateInvalid(
        `Database schema issue: ${error.message}. This usually means migrations haven't been applied or Supabase schema cache is stale. Run 'npm run migrate' to apply migrations.`,
        { originalError: error.message }
      );
    }

    throw createOAuthError.stateInvalid(`Failed to store state: ${error.message}`, {
      originalError: error.message,
    });
  }

  const authUrl = await createAuthUrl(state, codeChallenge, supabaseRedirectUri);

  logger.info(`[MCP OAuth] Initiated OAuth flow for connection: ${connectionId}`);

  // Audit log
  auditLog("oauth_flow_initiated", {
    connectionId,
    clientName,
    success: true,
  });

  return {
    authUrl,
    connectionId,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function createLocalAuthorizationRequest(params: {
  connectionId: string;
  redirectUri: string;
  clientState?: string;
  codeChallenge: string;
}): Promise<{ authUrl: string; connectionId: string; state: string; expiresAt: string }> {
  if (!isLocalBackend) {
    throw createOAuthError.stateInvalid("Local authorization requests require local storage backend");
  }

  validateConnectionId(params.connectionId);
  validateRedirectUri(params.redirectUri);

  const state = generateState();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  const codeVerifier = generatePKCE().codeVerifier;

  insertLocalOAuthState({
    state,
    codeVerifier,
    codeChallenge: params.codeChallenge,
    connectionId: params.connectionId,
    redirectUri: params.redirectUri,
    finalRedirectUri: params.redirectUri,
    clientState: params.clientState ?? null,
    expiresAt: expiresAt.toISOString(),
  });

  const authUrl = await createAuthUrl(state, params.codeChallenge, params.redirectUri);
  return {
    authUrl,
    connectionId: params.connectionId,
    state,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function completeLocalAuthorization(
  state: string,
  userId: string,
  clientName?: string | null
): Promise<{ connectionId: string; redirectUri?: string; clientState?: string }> {
  if (!isLocalBackend) {
    throw createOAuthError.stateInvalid("Local authorization completion requires local backend");
  }

  validateState(state);
  const stateData = getLocalOAuthState(state);
  if (!stateData) {
    throw createOAuthError.stateInvalid(
      "This authorization link has expired or was already used. If you have not used it before, more than one server instance may be running and state was stored on a different instance. Use a single instance or enable sticky sessions for /api/mcp/oauth so the same instance handles the full flow. Otherwise, click Connect again in Cursor to start a new authorization."
    );
  }

  deleteLocalOAuthState(state);

  if (new Date(stateData.expires_at) < new Date()) {
    throw createOAuthError.stateExpired(state);
  }

  const tokens = {
    accessToken: generateLocalToken("local_access"),
    refreshToken: generateLocalToken("local_refresh"),
    expiresIn: 3600,
  };

  const encryptedRefreshToken = encryptRefreshToken(tokens.refreshToken);
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  upsertLocalConnection({
    userId,
    connectionId: stateData.connection_id,
    refreshToken: encryptedRefreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: expiresAt.toISOString(),
    clientName: clientName ?? null,
  });

  auditLog("oauth_callback_success", {
    connectionId: stateData.connection_id,
    userId,
    success: true,
  });

  return {
    connectionId: stateData.connection_id,
    redirectUri: stateData.final_redirect_uri ?? stateData.redirect_uri ?? undefined,
    clientState: stateData.client_state ?? undefined,
  };
}

/**
 * Exchange authorization code for tokens using OAuth 2.1 Server token endpoint with PKCE
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string
): Promise<OAuthTokens> {
  if (isLocalBackend) {
    throw createOAuthError.tokenExchangeFailed(
      "Local OAuth callback is disabled. Use /api/mcp/oauth/local-login for local auth."
    );
  }

  try {
    // Use OAuth 2.1 Server token endpoint with PKCE
    const tokenUrl = `${config.supabaseUrl}/auth/v1/oauth/token`;

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: config.supabaseKey,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: clientId,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error(`[MCP OAuth] Token exchange failed: ${tokenResponse.status} ${errorText}`);

      let errorJson: any = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // Not JSON
      }

      throw createOAuthError.tokenExchangeFailed(
        `Token exchange failed: ${tokenResponse.status} ${errorJson?.error_description || errorJson?.error || errorText}`,
        {
          status: tokenResponse.status,
          error: errorJson?.error,
          error_description: errorJson?.error_description,
          body: errorText,
        }
      );
    }

    const tokenJson = await tokenResponse.json();

    if (!tokenJson || !tokenJson.access_token) {
      logger.error(`[MCP OAuth] Invalid token response: missing access_token`);
      throw createOAuthError.tokenExchangeFailed("Invalid token response: missing access_token", {
        response: tokenJson,
      });
    }

    return {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token || "",
      expiresIn: tokenJson.expires_in || 3600,
    };
  } catch (error: any) {
    logger.error(`[MCP OAuth] Token exchange error: ${error.message}`);

    if (error instanceof OAuthError) {
      throw error;
    }
    throw createOAuthError.tokenExchangeFailed(`Token exchange failed: ${error.message}`, {
      error: error.message,
    });
  }
}

/**
 * Handle OAuth callback and store connection
 *
 * Exchanges authorization code for access and refresh tokens, validates state,
 * and stores encrypted refresh token in database for long-lived authentication.
 *
 * @param code - Authorization code from OAuth provider
 * @param state - State token from OAuth flow (must match stored state)
 * @returns Connection ID, user ID, and optional redirect URI and client state
 * @throws {OAuthError} If state is invalid/expired, code exchange fails, or connection storage fails
 * @example
 * const result = await handleOAuthCallback(code, state);
 * // result.connectionId: "cursor-2025-01-27-abc123"
 * // result.userId: "44e026a5-..."
 */
export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<{
  connectionId: string;
  userId: string;
  redirectUri?: string;
  clientState?: string;
}> {
  if (isLocalBackend) {
    throw createOAuthError.stateInvalid(
      "Local OAuth callback is disabled. Use /api/mcp/oauth/local-login."
    );
  }
  // Validate inputs
  validateState(state);

  // Note: State cleanup is now handled by background job (runs every 5 minutes)
  // No need to clean up on every request

  // Get and consume OAuth state
  // Use service role client to ensure we bypass RLS (mcp_oauth_state only allows service_role)
  const { data: stateData, error: stateError } = await getServiceRoleSupabaseClient()
    .from("mcp_oauth_state")
    .select("*")
    .eq("state", state)
    .single();

  if (stateError || !stateData) {
    logger.error(`[MCP OAuth] Invalid or expired state: ${state}`);
    throw createOAuthError.stateInvalid(state);
  }

  // Delete state (consume it)
  // Use service role client to ensure we bypass RLS
  await getServiceRoleSupabaseClient().from("mcp_oauth_state").delete().eq("state", state);

  // Check if state is expired
  if (new Date(stateData.expires_at) < new Date()) {
    throw createOAuthError.stateExpired(state);
  }

  // Get client_id (same one used during authorization)
  // Use the same redirect_uri to ensure we get the same client_id
  // stateData.redirect_uri is the OAuth redirect URI (supabaseRedirectUri) stored during initiation
  const clientId = await getOrRegisterClientId(stateData.redirect_uri);

  // Exchange code for tokens
  // redirect_uri must match exactly what was used in the authorization URL
  const tokens = await exchangeCodeForTokens(
    code,
    stateData.code_verifier,
    stateData.redirect_uri,
    clientId
  );

  // Get user info from access token
  const { data: userData, error: userError } = await supabase.auth.getUser(tokens.accessToken);

  if (userError || !userData?.user) {
    logger.error(`[MCP OAuth] Failed to get user from token: ${userError?.message}`);
    throw createOAuthError.userInfoFailed(userError?.message || "No user found");
  }
  const userId = userData.user.id;

  // Encrypt refresh token
  const encryptedRefreshToken = encryptRefreshToken(tokens.refreshToken);

  // Store connection in database
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  const { error: insertError } = await supabase.from("mcp_oauth_connections").insert({
    user_id: userId,
    connection_id: stateData.connection_id,
    refresh_token: encryptedRefreshToken,
    access_token: tokens.accessToken,
    access_token_expires_at: expiresAt.toISOString(),
    client_name: null, // Will be updated later if provided
    last_used_at: new Date().toISOString(),
  });

  if (insertError) {
    logger.error(`[MCP OAuth] Failed to store connection: ${insertError.message}`);
    throw createOAuthError.stateInvalid(`Failed to store connection: ${insertError.message}`);
  }

  logger.info(
    `[MCP OAuth] Connection created: ${stateData.connection_id} for user: ${userId}`
  );

  // Audit log
  auditLog("oauth_callback_success", {
    connectionId: stateData.connection_id,
    userId,
    success: true,
  });

  return {
    connectionId: stateData.connection_id,
    userId,
    redirectUri: stateData.final_redirect_uri ?? stateData.redirect_uri ?? undefined,
    clientState: stateData.client_state ?? undefined,
  };
}

/**
 * Get valid access token for connection (refresh if needed)
 *
 * Returns cached access token if still valid (>5 minutes until expiry).
 * Automatically refreshes token using stored refresh token if expired or near expiration.
 *
 * @param connectionId - MCP connection identifier
 * @returns Access token and associated user ID
 * @throws {OAuthError} If connection not found, revoked, or token refresh fails
 * @example
 * const { accessToken, userId } = await getAccessTokenForConnection("cursor-2025-01-27-abc123");
 * // Use accessToken for authenticated Supabase requests
 */
export async function getAccessTokenForConnection(
  connectionId: string
): Promise<{ accessToken: string; userId: string }> {
  // Validate input
  validateConnectionId(connectionId);

  if (isLocalBackend) {
    const connection = getLocalConnectionById(connectionId);
    if (!connection) {
      logger.error(
        `[MCP OAuth] Connection not found: ${connectionId} (storage: ${config.storageBackend}). Re-run neotoma auth login to create a connection for this backend.`
      );
      throw createOAuthError.connectionNotFound(connectionId);
    }

    if (
      connection.access_token &&
      connection.access_token_expires_at &&
      new Date(connection.access_token_expires_at).getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS
    ) {
      updateLocalConnectionLastUsed(connectionId);
      return {
        accessToken: connection.access_token,
        userId: connection.user_id,
      };
    }

    logger.info(`[MCP OAuth] Refreshing local access token for connection: ${connectionId}`);
    auditLog("token_refresh_initiated", {
      connectionId,
      userId: connection.user_id,
      success: true,
    });

    const accessToken = generateLocalToken("local_access");
    const expiresAt = new Date(Date.now() + 3600 * 1000);
    upsertLocalConnection({
      userId: connection.user_id,
      connectionId,
      refreshToken: connection.refresh_token,
      accessToken,
      accessTokenExpiresAt: expiresAt.toISOString(),
      clientName: connection.client_name,
    });

    return {
      accessToken,
      userId: connection.user_id,
    };
  }

  // Get connection from database
  const { data: connection, error } = await supabase
    .from("mcp_oauth_connections")
    .select("*")
    .eq("connection_id", connectionId)
    .is("revoked_at", null)
    .single();

  if (error || !connection) {
    logger.error(
      `[MCP OAuth] Connection not found: ${connectionId} (storage: ${config.storageBackend}). Re-run neotoma auth login to create a connection for this backend.`
    );
    throw createOAuthError.connectionNotFound(connectionId);
  }

  // Check if cached access token is still valid
  if (
    connection.access_token &&
    connection.access_token_expires_at &&
    new Date(connection.access_token_expires_at).getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS
  ) {
    // Update last_used_at
    await supabase
      .from("mcp_oauth_connections")
      .update({ last_used_at: new Date().toISOString() })
      .eq("connection_id", connectionId);

    return {
      accessToken: connection.access_token,
      userId: connection.user_id,
    };
  }

  // Refresh access token
  logger.info(`[MCP OAuth] Refreshing access token for connection: ${connectionId}`);

  // Audit log
  auditLog("token_refresh_initiated", {
    connectionId,
    userId: connection.user_id,
    success: true,
  });

  const decryptedRefreshToken = decryptRefreshToken(connection.refresh_token);

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
    refresh_token: decryptedRefreshToken,
  });

  if (refreshError || !refreshData?.session) {
    logger.error(`[MCP OAuth] Failed to refresh token: ${refreshError?.message}`);

    // Audit log
    auditLog("token_refresh_failed", {
      connectionId,
      userId: connection.user_id,
      success: false,
      errorMessage: refreshError?.message || "Failed to refresh access token",
    });

    throw createOAuthError.tokenRefreshFailed(
      connectionId,
      refreshError?.message || "Failed to refresh access token"
    );
  }

  const session = refreshData.session;
  // Update connection with new tokens
  const newExpiresAt = new Date(Date.now() + (session.expires_in || 3600) * 1000);

  await supabase
    .from("mcp_oauth_connections")
    .update({
      access_token: session.access_token,
      access_token_expires_at: newExpiresAt.toISOString(),
      refresh_token: encryptRefreshToken(session.refresh_token),
      last_used_at: new Date().toISOString(),
    })
    .eq("connection_id", connectionId);

  return {
    accessToken: session.access_token,
    userId: connection.user_id,
  };
}

/**
 * Return OAuth token endpoint response for a connection (code=connection_id exchange)
 *
 * Used by Cursor and other RFC 8414-compliant OAuth clients after redirect with code=connection_id.
 * Returns standard OAuth 2.0 token response format.
 *
 * @param connectionId - MCP connection identifier (used as authorization code)
 * @returns OAuth token response with access_token, token_type, and expires_in
 * @throws {OAuthError} If connection not found or token retrieval fails
 * @example
 * const response = await getTokenResponseForConnection("cursor-2025-01-27-abc123");
 * // response.access_token: "eyJ..."
 * // response.token_type: "Bearer"
 * // response.expires_in: 3600
 */
export async function getTokenResponseForConnection(connectionId: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  // Validate input
  validateConnectionId(connectionId);

  const { accessToken } = await getAccessTokenForConnection(connectionId);
  if (isLocalBackend) {
    const connection = getLocalConnectionById(connectionId);
    const expiresAt = connection?.access_token_expires_at
      ? new Date(connection.access_token_expires_at).getTime()
      : Date.now() + 3600 * 1000;
    const expires_in = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in,
    };
  }

  const { data: row } = await supabase
    .from("mcp_oauth_connections")
    .select("access_token_expires_at")
    .eq("connection_id", connectionId)
    .single();
  const expiresAt = row?.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : Date.now() + 3600 * 1000;
  const expires_in = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in,
  };
}

/**
 * Validate Bearer token and get associated connection ID
 *
 * Validates the access token and returns the connection ID it belongs to.
 *
 * @param accessToken - Bearer access token from OAuth flow
 * @returns Connection ID and user ID
 * @throws {OAuthError} If token is invalid or no connection found
 * @example
 * const { connectionId, userId } = await validateTokenAndGetConnectionId("eyJ...");
 * // connectionId: "cursor-2025-01-27-abc123"
 */
export async function validateTokenAndGetConnectionId(
  accessToken: string
): Promise<{ connectionId: string; userId: string }> {
  if (isLocalBackend) {
    const connection = getLocalConnectionByAccessToken(accessToken);
    if (!connection) {
      throw createOAuthError.connectionNotFound("Connection not found for access token");
    }
    return {
      connectionId: connection.connection_id,
      userId: connection.user_id,
    };
  }

  // Query mcp_oauth_connections for the access token
  const { data: connection, error } = await supabase
    .from("mcp_oauth_connections")
    .select("connection_id, user_id")
    .eq("access_token", accessToken)
    .is("revoked_at", null)
    .single();

  if (error || !connection) {
    throw createOAuthError.connectionNotFound("Connection not found for access token");
  }

  return {
    connectionId: connection.connection_id,
    userId: connection.user_id,
  };
}

/**
 * Get connection status
 *
 * Checks if OAuth connection is pending (not yet authorized), active, or expired (revoked/deleted).
 *
 * @param connectionId - MCP connection identifier
 * @returns Connection status: "pending", "active", or "expired"
 * @example
 * const status = await getConnectionStatus("cursor-2025-01-27-abc123");
 * // status: "active" | "pending" | "expired"
 */
export async function getConnectionStatus(
  connectionId: string
): Promise<"pending" | "active" | "expired"> {
  // Validate input
  validateConnectionId(connectionId);

  if (isLocalBackend) {
    const connection = getLocalConnectionById(connectionId);
    if (connection) {
      return connection.revoked_at ? "expired" : "active";
    }
    const state = getLocalOAuthStateForConnection(connectionId);
    if (state) {
      return new Date(state.expires_at) > new Date() ? "pending" : "expired";
    }
    return "expired";
  }

  // Check if connection exists
  const { data: connection, error } = await supabase
    .from("mcp_oauth_connections")
    .select("revoked_at")
    .eq("connection_id", connectionId)
    .single();

  if (error || !connection) {
    // Check if pending in OAuth state
    // Use service role client to ensure we bypass RLS (mcp_oauth_state only allows service_role)
    const { data: state } = await getServiceRoleSupabaseClient()
      .from("mcp_oauth_state")
      .select("expires_at")
      .eq("connection_id", connectionId)
      .single();

    if (state) {
      return new Date(state.expires_at) > new Date() ? "pending" : "expired";
    }

    return "expired";
  }

  if (connection.revoked_at) {
    return "expired";
  }

  return "active";
}

/**
 * List user's MCP connections
 *
 * Returns all active (non-revoked) OAuth connections for a user.
 *
 * @param userId - User's UUID
 * @returns Array of connections with ID, client name, and timestamps
 * @throws {OAuthError} If database query fails
 * @example
 * const connections = await listConnections("44e026a5-...");
 * // connections: [{ connectionId: "cursor-...", clientName: "Cursor", ... }]
 */
export async function listConnections(userId: string): Promise<
  Array<{
    connectionId: string;
    clientName: string | null;
    createdAt: string;
    lastUsedAt: string | null;
  }>
> {
  if (isLocalBackend) {
    const db = getSqliteDb();
    const rows = db
      .prepare(
        "SELECT connection_id, client_name, created_at, last_used_at FROM mcp_oauth_connections WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC"
      )
      .all(userId);
    return (rows || []).map((conn: any) => ({
      connectionId: conn.connection_id,
      clientName: conn.client_name,
      createdAt: conn.created_at,
      lastUsedAt: conn.last_used_at,
    }));
  }

  const { data: connections, error } = await supabase
    .from("mcp_oauth_connections")
    .select("connection_id, client_name, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error(`[MCP OAuth] Failed to list connections: ${error.message}`);
    throw createOAuthError.connectionNotFound("Failed to list MCP connections");
  }

  return (connections || []).map((conn: { connection_id: string; client_name: string | null; created_at: string; last_used_at: string | null }) => ({
    connectionId: conn.connection_id,
    clientName: conn.client_name,
    createdAt: conn.created_at,
    lastUsedAt: conn.last_used_at,
  }));
}

/**
 * Revoke MCP connection
 *
 * Soft-deletes OAuth connection by setting revoked_at timestamp.
 * Connection cannot be used after revocation.
 *
 * @param connectionId - MCP connection identifier to revoke
 * @param userId - User's UUID (for authorization)
 * @throws {OAuthError} If connection not found or revocation fails
 * @example
 * await revokeConnection("cursor-2025-01-27-abc123", "44e026a5-...");
 * // Connection is now revoked
 */
export async function revokeConnection(connectionId: string, userId: string): Promise<void> {
  // Validate inputs
  validateConnectionId(connectionId);

  if (isLocalBackend) {
    revokeLocalConnection(connectionId, userId);
    logger.info(`[MCP OAuth] Connection revoked: ${connectionId}`);
    auditLog("connection_revoked", {
      connectionId,
      userId,
      success: true,
    });
    return;
  }

  const { error } = await supabase
    .from("mcp_oauth_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .eq("user_id", userId);

  if (error) {
    logger.error(`[MCP OAuth] Failed to revoke connection: ${error.message}`);
    throw createOAuthError.connectionNotFound(`Failed to revoke connection: ${error.message}`);
  }

  logger.info(`[MCP OAuth] Connection revoked: ${connectionId}`);

  // Audit log
  auditLog("connection_revoked", {
    connectionId,
    userId,
    success: true,
  });
}
