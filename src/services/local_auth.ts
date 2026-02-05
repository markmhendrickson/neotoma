import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";

export const LOCAL_DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

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

function hashEmailToUserId(email: string): string {
  const hash = createHash("sha256").update(email).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
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
  const row = db.prepare("SELECT COUNT(*) as count FROM local_auth_users").get() as { count: number } | undefined;
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
