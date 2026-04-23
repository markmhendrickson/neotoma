import { createHash, randomBytes } from "node:crypto";

export function generateFeedbackId(): string {
  const bytes = randomBytes(12).toString("hex");
  const t = Date.now().toString(36);
  return `fbk_${t}_${bytes}`;
}

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
