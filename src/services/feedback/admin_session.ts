import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { AgentIdentity, AttributionTier } from "../../crypto/agent_identity.js";

export const FEEDBACK_ADMIN_COOKIE = "neotoma_feedback_admin";
export const FEEDBACK_ADMIN_ALLOWED_TIERS: AttributionTier[] = [
  "hardware",
  "software",
  "operator_attested",
];

const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

interface AdminChallenge {
  challenge: string;
  createdAt: number;
  expiresAt: number;
  sessionToken?: string;
}

export interface FeedbackAdminSession {
  token: string;
  tier: AttributionTier;
  thumbprint?: string;
  sub?: string;
  iss?: string;
  createdAt: number;
  expiresAt: number;
}

export interface FeedbackAdminSessionSnapshot {
  active: boolean;
  tier?: AttributionTier;
  thumbprint?: string;
  sub?: string;
  iss?: string;
  expires_at?: string;
}

const challenges = new Map<string, AdminChallenge>();
const sessions = new Map<string, FeedbackAdminSession>();

function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function challengeTtlMs(): number {
  const parsed = Number.parseInt(
    process.env.NEOTOMA_FEEDBACK_ADMIN_CHALLENGE_TTL_MS ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHALLENGE_TTL_MS;
}

function sessionTtlMs(): number {
  const parsed = Number.parseInt(
    process.env.NEOTOMA_FEEDBACK_ADMIN_SESSION_TTL_MS ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TTL_MS;
}

function now(): number {
  return Date.now();
}

function isAllowedTier(tier: AttributionTier | undefined): tier is AttributionTier {
  return !!tier && FEEDBACK_ADMIN_ALLOWED_TIERS.includes(tier);
}

function pruneExpired(at = now()): void {
  for (const [key, challenge] of challenges) {
    if (challenge.expiresAt <= at) challenges.delete(key);
  }
  for (const [key, session] of sessions) {
    if (session.expiresAt <= at) sessions.delete(key);
  }
}

function sessionSnapshot(session: FeedbackAdminSession | null): FeedbackAdminSessionSnapshot {
  if (!session) return { active: false };
  return {
    active: true,
    tier: session.tier,
    thumbprint: session.thumbprint,
    sub: session.sub,
    iss: session.iss,
    expires_at: new Date(session.expiresAt).toISOString(),
  };
}

export function createFeedbackAdminChallenge(): {
  challenge: string;
  expires_at: string;
} {
  pruneExpired();
  const createdAt = now();
  const challenge = token();
  const expiresAt = createdAt + challengeTtlMs();
  challenges.set(challenge, { challenge, createdAt, expiresAt });
  return { challenge, expires_at: new Date(expiresAt).toISOString() };
}

export function redeemFeedbackAdminChallenge(
  challenge: string,
  identity: AgentIdentity | null,
): FeedbackAdminSession {
  pruneExpired();
  const record = challenges.get(challenge);
  if (!record || record.expiresAt <= now()) {
    throw new Error("Admin unlock challenge is missing or expired.");
  }
  if (!isAllowedTier(identity?.tier)) {
    throw new Error(
      `Admin unlock requires hardware/software/operator_attested AAuth tier. Resolved tier: ${
        identity?.tier ?? "anonymous"
      }.`,
    );
  }

  const createdAt = now();
  const session: FeedbackAdminSession = {
    token: token(),
    tier: identity.tier,
    thumbprint: identity.thumbprint,
    sub: identity.sub,
    iss: identity.iss,
    createdAt,
    expiresAt: createdAt + sessionTtlMs(),
  };
  sessions.set(session.token, session);
  record.sessionToken = session.token;
  return session;
}

export function readFeedbackAdminCookie(req: Request): string | undefined {
  const fromParser = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    FEEDBACK_ADMIN_COOKIE
  ];
  if (fromParser) return fromParser;
  const raw = req.headers?.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === FEEDBACK_ADMIN_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function getFeedbackAdminSessionFromRequest(
  req: Request,
): FeedbackAdminSession | null {
  pruneExpired();
  const cookie = readFeedbackAdminCookie(req);
  if (!cookie) return null;
  const session = sessions.get(cookie);
  if (!session || session.expiresAt <= now()) {
    if (cookie) sessions.delete(cookie);
    return null;
  }
  return session;
}

export function getRedeemedFeedbackAdminSession(
  challenge: string,
): FeedbackAdminSession | null {
  pruneExpired();
  const record = challenges.get(challenge);
  if (!record?.sessionToken) return null;
  const session = sessions.get(record.sessionToken);
  if (!session || session.expiresAt <= now()) return null;
  return session;
}

export function setFeedbackAdminCookie(
  res: Response,
  session: FeedbackAdminSession,
): void {
  res.cookie(FEEDBACK_ADMIN_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

export function clearFeedbackAdminCookie(res: Response): void {
  res.clearCookie(FEEDBACK_ADMIN_COOKIE, { path: "/" });
}

export function revokeFeedbackAdminSessionFromRequest(req: Request): void {
  const cookie = readFeedbackAdminCookie(req);
  if (cookie) sessions.delete(cookie);
}

export function describeFeedbackAdminSession(
  req: Request,
): FeedbackAdminSessionSnapshot {
  return sessionSnapshot(getFeedbackAdminSessionFromRequest(req));
}

export function describeFeedbackAdminSessionForChallenge(
  challenge: string | undefined,
): FeedbackAdminSessionSnapshot {
  if (!challenge) return { active: false };
  return sessionSnapshot(getRedeemedFeedbackAdminSession(challenge));
}

export function clearFeedbackAdminStateForTests(): void {
  challenges.clear();
  sessions.clear();
}
