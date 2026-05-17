import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";

export const LOCAL_DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Dedicated public-user id for the `NEOTOMA_SANDBOX_MODE` deployment at
 * `sandbox.neotoma.io`. Kept distinct from `LOCAL_DEV_USER_ID` so any future
 * data migration can tell sandbox-written entities apart from local-dev ones
 * and so the body-level `user_id` override (granted to LOCAL_DEV_USER_ID in
 * `getAuthenticatedUserId`) does NOT leak to public sandbox writers.
 */
export const SANDBOX_PUBLIC_USER_ID = "11111111-1111-1111-1111-111111111111";

export interface LocalAuthUser {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
}

interface PasswordHash {
  salt: string;
  hash: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt?: string): PasswordHash {
  const resolvedSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, resolvedSalt, 64).toString("hex");
  return { salt: resolvedSalt, hash };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const computed = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(expectedHash, "hex"));
}

function hashStringToUserId(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function hashEmailToUserId(email: string): string {
  return hashStringToUserId(email);
}

export function getLocalAuthUserByEmail(email: string): LocalAuthUser | null {
  const db = getSqliteDb();
  const normalized = normalizeEmail(email);
  const row = db
    .prepare(
      "SELECT id, email, created_at, updated_at, last_login_at FROM local_auth_users WHERE email = ?"
    )
    .get(normalized);
  return row ? (row as LocalAuthUser) : null;
}

export function getLocalAuthUserById(userId: string): LocalAuthUser | null {
  const db = getSqliteDb();
  const row = db
    .prepare(
      "SELECT id, email, created_at, updated_at, last_login_at FROM local_auth_users WHERE id = ?"
    )
    .get(userId);
  return row ? (row as LocalAuthUser) : null;
}

export function countLocalAuthUsers(): number {
  const db = getSqliteDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM local_auth_users").get() as
    | { count: number }
    | undefined;
  return row?.count ? Number(row.count) : 0;
}

export function createLocalAuthUser(email: string, password: string): LocalAuthUser {
  const db = getSqliteDb();
  const normalized = normalizeEmail(email);
  const existing = getLocalAuthUserByEmail(normalized);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const userId = hashEmailToUserId(normalized);
  const { salt, hash } = hashPassword(password);

  db.prepare(
    "INSERT INTO local_auth_users (id, email, password_hash, password_salt, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(userId, normalized, hash, salt, now, now, null);

  return {
    id: userId,
    email: normalized,
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };
}

export function authenticateLocalUser(
  email: string,
  password: string,
  allowBootstrap: boolean
): LocalAuthUser {
  const db = getSqliteDb();
  const normalized = normalizeEmail(email);

  const existing = db
    .prepare(
      "SELECT id, email, password_hash, password_salt, created_at, updated_at, last_login_at FROM local_auth_users WHERE email = ?"
    )
    .get(normalized) as
    | (LocalAuthUser & { password_hash: string; password_salt: string })
    | undefined;

  if (!existing) {
    const existingCount = countLocalAuthUsers();
    if (!allowBootstrap || existingCount > 0) {
      throw new Error("Local user not found. Create a local user first.");
    }
    return createLocalAuthUser(normalized, password);
  }

  if (!verifyPassword(password, existing.password_salt, existing.password_hash)) {
    throw new Error("Invalid local credentials.");
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE local_auth_users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(
    now,
    now,
    existing.id
  );

  return {
    id: existing.id,
    email: existing.email,
    created_at: existing.created_at,
    updated_at: now,
    last_login_at: now,
  };
}

export function ensureLocalDevUser(): LocalAuthUser {
  const db = getSqliteDb();
  const existing = getLocalAuthUserById(LOCAL_DEV_USER_ID);
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  const email = "local-dev@neotoma.local";
  const { salt, hash } = hashPassword("dev-only");
  db.prepare(
    "INSERT INTO local_auth_users (id, email, password_hash, password_salt, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(LOCAL_DEV_USER_ID, email, hash, salt, now, now, null);
  return {
    id: LOCAL_DEV_USER_ID,
    email,
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };
}

/**
 * Ensure the shared sandbox public user exists, used by sandbox-mode bearer
 * bypass for unauthenticated writes on `sandbox.neotoma.io`. Idempotent; safe
 * to call on every request.
 */
export function ensureSandboxPublicUser(): LocalAuthUser {
  const db = getSqliteDb();
  const existing = getLocalAuthUserById(SANDBOX_PUBLIC_USER_ID);
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  const email = "sandbox-public@neotoma.local";
  const { salt, hash } = hashPassword("sandbox-public-no-password");
  db.prepare(
    "INSERT INTO local_auth_users (id, email, password_hash, password_salt, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(SANDBOX_PUBLIC_USER_ID, email, hash, salt, now, now, null);
  return {
    id: SANDBOX_PUBLIC_USER_ID,
    email,
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };
}

/**
 * Ensure a deterministic per-thumbprint sandbox user exists for AAuth-verified
 * requests on `sandbox.neotoma.io`. The same thumbprint always resolves to the
 * same user_id (via sha256("aauth:" + thumbprint) mapped to UUID shape), so
 * sandbox writes signed by a given AAuth key are partitioned away from the
 * public sandbox user and from other agents' keys.
 *
 * The synthetic user is functionally inert for login: the password hash is
 * derived from the thumbprint itself (not user-supplied) and the
 * `@sandbox.neotoma.local` email is not exposed to `authenticateLocalUser`
 * via any external surface. Idempotent; safe to call on every request.
 */
export function ensureSandboxAauthUser(thumbprint: string): LocalAuthUser {
  if (!thumbprint || typeof thumbprint !== "string") {
    throw new Error("ensureSandboxAauthUser requires a non-empty thumbprint");
  }
  const db = getSqliteDb();
  const userId = hashStringToUserId(`aauth:${thumbprint}`);
  const existing = getLocalAuthUserById(userId);
  if (existing) {
    return existing;
  }
  const short = thumbprint
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12)
    .toLowerCase();
  const email = `aauth-${short}@sandbox.neotoma.local`;
  const now = new Date().toISOString();
  const { salt, hash } = hashPassword(`sandbox-aauth-no-password:${thumbprint}`);
  db.prepare(
    "INSERT INTO local_auth_users (id, email, password_hash, password_salt, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(userId, email, hash, salt, now, now, null);
  return {
    id: userId,
    email,
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };
}
