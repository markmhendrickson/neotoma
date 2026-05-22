/**
 * Redact sensitive or noisy values before they appear in Markdown test run reports.
 */

const HOME_PATTERN = new RegExp(
  String.raw`/(?:Users|home)/[^/\s]+`,
  "gi",
);

/** Strip bearer tokens and long secrets from a single string. */
export function redactString(value: string): string {
  let out = value;
  out = out.replace(/Bearer\s+[\w-_.+/=]+/gi, "Bearer <redacted>");
  out = out.replace(/access_token=[^&\s]+/gi, "access_token=<redacted>");
  out = out.replace(/NEOTOMA_ISSUES_GITHUB_TOKEN=\S+/gi, "NEOTOMA_ISSUES_GITHUB_TOKEN=<redacted>");
  out = out.replace(HOME_PATTERN, "/<home>");
  return out;
}

/** Shallow redact string values in a plain object (for JSON-ish case rows). */
export function redactRecord(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") {
      out[k] = redactString(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactRecord(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const ENV_KEYS_TO_SUMMARIZE = [
  "RUN_REMOTE_TESTS",
  "RUN_FRONTEND_TESTS",
  "WRITE_TEST_RUN_REPORT",
  "NODE_ENV",
  "NEOTOMA_HTTP_PORT",
  "HTTP_PORT",
  "NEOTOMA_DATA_DIR",
  "NEOTOMA_ISSUES_REPO",
  "CI",
] as const;

/** Build a short, redacted env summary for report headers. */
export function redactEnvSummary(): string {
  const lines: string[] = [];
  for (const key of ENV_KEYS_TO_SUMMARIZE) {
    const raw = process.env[key];
    if (raw === undefined) continue;
    const val = key === "NEOTOMA_DATA_DIR" || key === "HOME" ? redactString(raw) : raw;
    lines.push(`- ${key}=${val}`);
  }
  return lines.length ? lines.join("\n") : "_No tracked env vars set._";
}
