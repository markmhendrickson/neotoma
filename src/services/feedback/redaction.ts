/**
 * Server-side PII redaction scanner (backstop).
 *
 * Client agents are required to redact before sending (see the REDACTION MUST
 * clause in docs/developer/mcp/instructions.md), but we scan server-side too so
 * a submitter-side bug cannot leak PII. Hash-suffixed placeholders keep the
 * debug story intact: `<EMAIL:a3f9>` is stable within a single submission so
 * relationships stay legible.
 *
 * Two modes controlled by `REDACTION_MODE`:
 *   - "strip" (default): auto-strip with `redaction_applied=true` and hits logged.
 *   - "reject": respond 400 with `error=redaction_required` so the submitter can fix
 *     their scanner before the payload ever persists.
 */

import { createHash, randomBytes } from "node:crypto";

export interface RedactionResult {
  title: string;
  body: string;
  error_message?: string;
  hits: string[];
  applied: boolean;
  fields_redacted: number;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?<!\d)(?:\+?\d[\s\-().]?){7,15}\d(?!\d)/g;
// Neotoma entity IDs: ent_[a-f0-9]{24} — must not be matched as phone numbers.
const ENTITY_ID_RE = /\bent_[a-f0-9]{24}\b/g;
const TOKEN_RE =
  /\b(?:sk-[a-zA-Z0-9_-]{16,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._~+/=-]{16,})/g;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HOME_PATH_RE =
  /(?:\/Users\/[^/\s"']+|\/home\/[^/\s"']+|C:\\\\Users\\\\[^\\\s"']+)/g;
/**
 * Pre-existing hash-suffixed placeholder: <NAME:a3f9>, <EMAIL:b21c>. When a
 * scanner finds one that is already well-formed, preserve it rather than
 * re-hashing.
 */
const EXISTING_PLACEHOLDER_RE = /<(NAME|EMAIL|PHONE|ADDRESS|ID|ACCOUNT|PATH|TOKEN):[0-9a-f]{4}>/g;

/**
 * Shape-check a hash-suffixed placeholder so downstream redactors can
 * skip values that have already been sanitized (matches `<NAME:a3f9>` etc).
 */
export function isExistingPlaceholder(value: string): boolean {
  const re = new RegExp(`^${EXISTING_PLACEHOLDER_RE.source}$`);
  return re.test(value);
}

/**
 * Hash-suffixed placeholder per the `hash_redaction_placeholders` todo.
 * Salt is per-submission so cross-submission correlation is prevented.
 */
export function makePlaceholder(
  label: "EMAIL" | "PHONE" | "TOKEN" | "UUID" | "PATH",
  matched: string,
  salt: string,
): string {
  const hash = createHash("sha256")
    .update(salt + ":" + matched)
    .digest("hex")
    .slice(0, 4);
  return `<${label}:${hash}>`;
}

export function generateRedactionSalt(): string {
  return randomBytes(16).toString("hex");
}

function isIsoDateLiteral(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function scanField(value: string, salt: string, hits: string[]): string {
  if (!value) return value;
  let out = value;
  let changed = false;

  // Temporarily replace entity IDs with stable sentinels so PHONE_RE cannot
  // match the hex digit runs inside them.  Restored after all pattern scans.
  const entityIdSlots: string[] = [];
  out = out.replace(ENTITY_ID_RE, (m) => {
    const idx = entityIdSlots.length;
    entityIdSlots.push(m);
    return `ENTID${idx}`;
  });

  out = out.replace(EMAIL_RE, (m) => {
    if (isExistingPlaceholder(m)) return m;
    hits.push(`email`);
    changed = true;
    return makePlaceholder("EMAIL", m, salt);
  });
  out = out.replace(TOKEN_RE, (m) => {
    hits.push(`token`);
    changed = true;
    return makePlaceholder("TOKEN", m, salt);
  });
  out = out.replace(PHONE_RE, (m) => {
    if (/^\d{4,}-\d{4,}-\d{4,}$/.test(m)) return m;
    if (isIsoDateLiteral(m)) return m;
    if (m.replace(/\D/g, "").length < 7) return m;
    hits.push(`phone`);
    changed = true;
    return makePlaceholder("PHONE", m, salt);
  });
  out = out.replace(UUID_RE, (m) => {
    hits.push(`uuid`);
    changed = true;
    return makePlaceholder("UUID", m, salt);
  });
  out = out.replace(HOME_PATH_RE, () => {
    hits.push(`home_path`);
    changed = true;
    return "~";
  });

  // Restore entity ID sentinels.
  out = out.replace(/ENTID(\d+)/g, (_, idx) => entityIdSlots[Number(idx)]);

  void changed;
  return out;
}

/**
 * Scan title/body/error_message for obvious PII leakage patterns and
 * return redacted versions plus a hit list. See docs/subsystems/agent_feedback_pipeline.md
 * for the full rule set.
 */
export function scanAndRedact(input: {
  title: string;
  body: string;
  error_message?: string;
  salt: string;
}): RedactionResult {
  const hits: string[] = [];
  const title = scanField(input.title ?? "", input.salt, hits);
  const body = scanField(input.body ?? "", input.salt, hits);
  const error_message =
    input.error_message != null ? scanField(input.error_message, input.salt, hits) : undefined;
  const titleChanged = title !== input.title;
  const bodyChanged = body !== input.body;
  const errChanged = error_message !== input.error_message;
  const fields_redacted = [titleChanged, bodyChanged, errChanged].filter(Boolean).length;
  return {
    title,
    body,
    error_message,
    hits,
    applied: hits.length > 0,
    fields_redacted,
  };
}

export type RedactionMode = "strip" | "reject";

export function redactionModeFromEnv(): RedactionMode {
  const raw = (process.env.REDACTION_MODE ?? "strip").toLowerCase();
  return raw === "reject" ? "reject" : "strip";
}
