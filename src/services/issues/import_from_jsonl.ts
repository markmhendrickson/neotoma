/**
 * JSONL batch import for issues (`importIssuesFromJsonl`).
 *
 * Each line of the JSONL input is treated as a plain issue object. Fields map
 * directly onto the `issue` entity type. Unknown extra fields are ignored so
 * that exports from other systems are accepted without pre-processing.
 *
 * Identity: the import uses a deterministic idempotency key derived from the
 * issue object so re-running the same file is safe (idempotent). The key is
 * built from the most reliable unique fields available: `github_number` +
 * `repo`, or falling back to `title` + `created_at` when GitHub metadata is
 * absent.
 *
 * Relationship graph: each imported issue is stored as a standalone `issue`
 * entity — no conversation or message entities are created. Callers that need
 * full thread data should use `issuesSync` after import.
 */

import { readFile } from "node:fs/promises";
import type { Operations, StoreEntityInput } from "../../core/operations.js";

export interface ImportFromJsonlResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Import issues from a JSONL string or file path into the local Neotoma graph.
 *
 * @param ops  Neotoma operations handle (created by the HTTP handler with the
 *             authenticated user context).
 * @param jsonl     Raw JSONL content (one JSON object per line).
 * @param filePath  Absolute path to a JSONL file on the local filesystem.
 *
 * Exactly one of `jsonl` or `filePath` must be supplied.
 */
export async function importIssuesFromJsonl(
  ops: Operations,
  { jsonl, filePath }: { jsonl?: string; filePath?: string }
): Promise<ImportFromJsonlResult> {
  const result: ImportFromJsonlResult = { imported: 0, skipped: 0, errors: [] };

  // Resolve raw content.
  let raw: string;
  if (typeof jsonl === "string") {
    raw = jsonl;
  } else if (typeof filePath === "string") {
    try {
      raw = await readFile(filePath, "utf8");
    } catch (err) {
      result.errors.push(`Failed to read file "${filePath}": ${(err as Error).message}`);
      return result;
    }
  } else {
    result.errors.push("Provide jsonl or file_path");
    return result;
  }

  const lines = raw.split("\n");
  const now = new Date().toISOString();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (!line) {
      result.skipped++;
      continue;
    }

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch (err) {
      result.errors.push(`Line ${lineIndex + 1}: JSON parse error — ${(err as Error).message}`);
      continue;
    }

    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      result.errors.push(`Line ${lineIndex + 1}: Expected a JSON object`);
      continue;
    }

    // Build a deterministic idempotency key.
    const idempotencyKey = buildIdempotencyKey(obj);

    // Map the plain object onto a StoreEntityInput for the `issue` type.
    const entity: StoreEntityInput = buildIssueEntity(obj, now);

    try {
      await ops.store({
        entities: [entity],
        relationships: [],
        idempotency_key: idempotencyKey,
      });
      result.imported++;
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      // Idempotent re-run: the store layer surfaces a distinct error when the
      // same idempotency_key is replayed with an identical payload. Treat that
      // as a skip rather than an error so re-running the same file is safe.
      if (isIdempotentReplay(msg)) {
        result.skipped++;
      } else {
        result.errors.push(`Line ${lineIndex + 1}: Store failed — ${msg}`);
      }
    }
  }

  return result;
}

/**
 * Build a deterministic idempotency key for a parsed issue object.
 *
 * Preference order:
 * 1. github_number + repo (most stable — survives title edits).
 * 2. title + created_at (fallback for issues without GitHub metadata).
 * 3. Line content hash (last resort — raw JSON string).
 */
function buildIdempotencyKey(obj: Record<string, unknown>): string {
  const githubNumber = obj["github_number"];
  const repo = obj["repo"];
  if (
    (typeof githubNumber === "number" || typeof githubNumber === "string") &&
    typeof repo === "string" &&
    repo.length > 0
  ) {
    return `issue-import-gh-${repo}-${githubNumber}`;
  }

  const title = typeof obj["title"] === "string" ? obj["title"] : "";
  const createdAt = typeof obj["created_at"] === "string" ? obj["created_at"] : "";
  if (title.length > 0 && createdAt.length > 0) {
    return `issue-import-title-${encodeURIComponent(title.slice(0, 80))}-${createdAt}`;
  }

  // Last resort: hash the raw JSON string deterministically.
  return `issue-import-raw-${stableJsonHash(obj)}`;
}

/**
 * Map a plain JSON object onto a StoreEntityInput for the `issue` entity type.
 * Unknown fields are forwarded as-is; missing required-ish fields fall back to
 * sensible defaults so the store does not reject the row.
 */
function buildIssueEntity(obj: Record<string, unknown>, now: string): StoreEntityInput {
  return {
    entity_type: "issue",
    title: typeof obj["title"] === "string" ? obj["title"] : "(untitled)",
    body: typeof obj["body"] === "string" ? obj["body"] : "",
    status: typeof obj["status"] === "string" ? obj["status"] : "open",
    labels: Array.isArray(obj["labels"])
      ? (obj["labels"] as unknown[]).filter((l): l is string => typeof l === "string")
      : [],
    github_number:
      typeof obj["github_number"] === "number" || typeof obj["github_number"] === "string"
        ? obj["github_number"]
        : null,
    github_url: typeof obj["github_url"] === "string" ? obj["github_url"] : undefined,
    repo: typeof obj["repo"] === "string" ? obj["repo"] : undefined,
    visibility: typeof obj["visibility"] === "string" ? obj["visibility"] : "private",
    author: typeof obj["author"] === "string" ? obj["author"] : "import",
    created_at: typeof obj["created_at"] === "string" ? obj["created_at"] : now,
    closed_at: typeof obj["closed_at"] === "string" ? obj["closed_at"] : undefined,
    last_synced_at: now,
    sync_pending: false,
    data_source: `jsonl-import ${now.slice(0, 10)}`,
  } as StoreEntityInput;
}

/**
 * Returns true when a store error looks like an idempotent replay (same
 * idempotency_key, same payload) rather than a true failure.
 */
function isIdempotentReplay(message: string): boolean {
  return (
    message.includes("idempotency") ||
    message.includes("IDEMPOTENT") ||
    message.includes("already exists")
  );
}

/**
 * Produce a short stable fingerprint of a JSON object for use as an
 * idempotency key suffix. Not cryptographic — purely for dedup.
 */
function stableJsonHash(obj: Record<string, unknown>): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return (hash >>> 0).toString(16);
}
