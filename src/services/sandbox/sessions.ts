/**
 * Sandbox ephemeral session management.
 *
 * Each visitor to sandbox.neotoma.io gets a fresh, isolated user_id with a
 * time-limited bearer token. Data is hard-ephemeral: purged completely when
 * the session expires or is terminated. The session cookie
 * (`neotoma_sandbox_session`) carries the bearer token so the Inspector SPA
 * (served at /inspector on the same origin) can authenticate without manual
 * token copy-paste.
 */

import crypto from "node:crypto";
import type { Request } from "express";
import { getSqliteDb } from "../../repositories/sqlite/sqlite_client.js";

export const SESSION_COOKIE_NAME = "neotoma_sandbox_session";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const _CODE_TTL_MS = 60 * 1000; // 60 seconds

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateCode(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateUserId(): string {
  return `sandbox-${crypto.randomBytes(8).toString("hex")}`;
}

export interface SandboxSession {
  userId: string;
  bearerToken: string;
  oneTimeCode: string;
  packId: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionInfo {
  userId: string;
  packId: string;
  createdAt: string;
  expiresAt: string;
}

export function createSandboxSession(packId: string = "generic"): SandboxSession {
  const db = getSqliteDb();
  const userId = generateUserId();
  const bearerToken = generateToken();
  const oneTimeCode = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_TTL_MS);
  const createdAt = now.toISOString();
  const expiresAtStr = expiresAt.toISOString();

  const email = `${userId}@sandbox.neotoma.local`;
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = sha256(crypto.randomBytes(32).toString("hex") + salt);

  db.prepare(
    `INSERT INTO local_auth_users (id, email, password_hash, password_salt, created_at, updated_at, is_ephemeral)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  ).run(userId, email, passwordHash, salt, createdAt, createdAt);

  db.prepare(
    `INSERT INTO sandbox_sessions (user_id, bearer_token_hash, one_time_code_hash, pack_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, sha256(bearerToken), sha256(oneTimeCode), packId, createdAt, expiresAtStr);

  return {
    userId,
    bearerToken,
    oneTimeCode,
    packId,
    createdAt,
    expiresAt: expiresAtStr,
  };
}

export interface RedeemResult {
  bearerToken: string;
  userId: string;
  packId: string;
  expiresAt: string;
}

export function redeemOneTimeCode(code: string): RedeemResult | null {
  const db = getSqliteDb();
  const codeHash = sha256(code);
  const now = new Date().toISOString();

  const row = db.prepare(
    `SELECT user_id, bearer_token_hash, pack_id, expires_at
     FROM sandbox_sessions
     WHERE one_time_code_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
  ).get(codeHash, now) as { user_id: string; bearer_token_hash: string; pack_id: string; expires_at: string } | undefined;

  if (!row) return null;

  // Clear the one-time code after redemption
  db.prepare(
    `UPDATE sandbox_sessions SET one_time_code_hash = NULL WHERE user_id = ?`,
  ).run(row.user_id);

  // We cannot reverse the bearer hash, so we regenerate a fresh bearer token
  // and update the stored hash (the code-based handoff is the only time this
  // happens, so the original bearer from createSandboxSession is invalidated).
  const freshBearer = generateToken();
  db.prepare(
    `UPDATE sandbox_sessions SET bearer_token_hash = ? WHERE user_id = ?`,
  ).run(sha256(freshBearer), row.user_id);

  return {
    bearerToken: freshBearer,
    userId: row.user_id,
    packId: row.pack_id,
    expiresAt: row.expires_at,
  };
}

export function resolveSessionFromRequest(req: Request): SessionInfo | null {
  // Try cookie first
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  // Then Authorization header
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  const token = cookieToken || headerToken;
  if (!token) return null;

  const db = getSqliteDb();
  const tokenHash = sha256(token);
  const now = new Date().toISOString();

  const row = db.prepare(
    `SELECT user_id, pack_id, created_at, expires_at
     FROM sandbox_sessions
     WHERE bearer_token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
  ).get(tokenHash, now) as { user_id: string; pack_id: string; created_at: string; expires_at: string } | undefined;

  if (!row) return null;

  return {
    userId: row.user_id,
    packId: row.pack_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function revokeSession(userId: string): void {
  const db = getSqliteDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE sandbox_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
  ).run(now, userId);
}

export function purgeSessionUserData(userId: string): void {
  const db = getSqliteDb();
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM sandbox_sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM observations WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM entity_snapshots WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM entities WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM sources WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM timeline_events WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM local_auth_users WHERE id = ? AND is_ephemeral = 1").run(userId);
  });
  transaction();
}

export function sweepExpiredSessions(): number {
  const db = getSqliteDb();
  const _now = new Date().toISOString();

  const expired = db.prepare(
    `SELECT user_id FROM sandbox_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL`,
  ).all() as { user_id: string }[];

  let purged = 0;
  for (const row of expired) {
    purgeSessionUserData(row.user_id);
    purged++;
  }
  return purged;
}

export function resetSandboxSession(userId: string, packId?: string): SandboxSession | null {
  const db = getSqliteDb();
  const existing = db.prepare(
    `SELECT pack_id FROM sandbox_sessions WHERE user_id = ? AND revoked_at IS NULL`,
  ).get(userId) as { pack_id: string } | undefined;

  if (!existing) return null;

  purgeSessionUserData(userId);
  return createSandboxSession(packId ?? existing.pack_id);
}
