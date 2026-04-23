/**
 * MCP-side copy of the server-side redaction scanner. Kept in sync with
 * `services/agent-site/netlify/lib/redaction.ts` — changes must land in both
 * files to maintain parity between local and HTTP transports.
 *
 * The two files stay intentionally duplicated rather than cross-imported so
 * the Netlify build surface does not reach into the main TS monorepo.
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
const TOKEN_RE =
  /\b(?:sk-[a-zA-Z0-9_-]{16,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._~+/=-]{16,})/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HOME_PATH_RE = /(?:\/Users\/[^/\s"']+|\/home\/[^/\s"']+|C:\\\\Users\\\\[^\\\s"']+)/g;
const EXISTING_PLACEHOLDER_RE = /<(NAME|EMAIL|PHONE|ADDRESS|ID|ACCOUNT|PATH|TOKEN):[0-9a-f]{4}>/g;

export function isExistingPlaceholder(value: string): boolean {
  const re = new RegExp(`^${EXISTING_PLACEHOLDER_RE.source}$`);
  return re.test(value);
}

export function makePlaceholder(
  label: "EMAIL" | "PHONE" | "TOKEN" | "UUID" | "PATH",
  matched: string,
  salt: string,
): string {
  const hash = createHash("sha256").update(salt + ":" + matched).digest("hex").slice(0, 4);
  return `<${label}:${hash}>`;
}

export function generateRedactionSalt(): string {
  return randomBytes(16).toString("hex");
}

function scanField(value: string, salt: string, hits: string[]): string {
  if (!value) return value;
  let out = value;
  out = out.replace(EMAIL_RE, (m) => {
    if (isExistingPlaceholder(m)) return m;
    hits.push("email");
    return makePlaceholder("EMAIL", m, salt);
  });
  out = out.replace(TOKEN_RE, (m) => {
    hits.push("token");
    return makePlaceholder("TOKEN", m, salt);
  });
  out = out.replace(PHONE_RE, (m) => {
    if (/^\d{4,}-\d{4,}-\d{4,}$/.test(m)) return m;
    if (m.replace(/\D/g, "").length < 7) return m;
    hits.push("phone");
    return makePlaceholder("PHONE", m, salt);
  });
  out = out.replace(UUID_RE, (m) => {
    hits.push("uuid");
    return makePlaceholder("UUID", m, salt);
  });
  out = out.replace(HOME_PATH_RE, () => {
    hits.push("home_path");
    return "~";
  });
  return out;
}

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
  const fields_redacted =
    [title !== input.title, body !== input.body, error_message !== input.error_message].filter(Boolean).length;
  return { title, body, error_message, hits, applied: hits.length > 0, fields_redacted };
}
