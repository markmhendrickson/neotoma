/**
 * Issue-specific redaction guard.
 *
 * Wraps the existing `scanAndRedact` PII backstop with two issue-aware
 * behaviors so a private issue's body cannot leak through a public artifact
 * (e.g. a PR opened by the `process-issues` skill that derives from a
 * private issue):
 *
 *  - `mode: "scan"` (default) returns a redacted copy of the inputs and a
 *    summary of hits. Used inside `submitIssue` and `addIssueMessage` for
 *    public threads to apply the existing strip behavior consistently.
 *  - `mode: "guard"` is a hard refusal: when ANY PII is detected and the
 *    operation requires public emission (e.g. opening a public PR derived
 *    from a private issue), the guard throws a structured error so callers
 *    do not accidentally publish unredacted content.
 *
 * The guard does not introduce new redaction rules — it reuses
 * `scanAndRedact` so all clients agree on what counts as PII. See
 * `docs/subsystems/agent_feedback_pipeline.md` for the rule set.
 */

import {
  generateRedactionSalt,
  isExistingPlaceholder,
  scanAndRedact,
  type RedactionResult,
} from "../feedback/redaction.js";

export type RedactionGuardMode = "scan" | "guard";

export interface RedactionGuardInput {
  title: string;
  body: string;
  /** Optional additional context fields scanned the same way (e.g. branch names, PR descriptions). */
  extra_fields?: Record<string, string>;
  salt?: string;
  mode?: RedactionGuardMode;
}

export interface RedactionGuardResult {
  title: string;
  body: string;
  extra_fields?: Record<string, string>;
  hits: string[];
  applied: boolean;
  fields_redacted: number;
  /** Always returned so the caller can persist a stable per-emission salt for forensic correlation. */
  salt: string;
}

export class RedactionGuardError extends Error {
  public readonly code = "ERR_REDACTION_REQUIRED";
  public readonly hits: string[];
  public readonly fields_redacted: number;

  constructor(message: string, hits: string[], fields_redacted: number) {
    super(message);
    this.name = "RedactionGuardError";
    this.hits = hits;
    this.fields_redacted = fields_redacted;
  }
}

function scanExtraFields(
  extra: Record<string, string> | undefined,
  salt: string
): { redacted?: Record<string, string>; hits: string[]; fields_redacted: number } {
  if (!extra || Object.keys(extra).length === 0) return { hits: [], fields_redacted: 0 };
  const redacted: Record<string, string> = {};
  let totalHits: string[] = [];
  let fields_redacted = 0;
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value !== "string" || value.length === 0) {
      redacted[key] = value;
      continue;
    }
    if (isExistingPlaceholder(value)) {
      redacted[key] = value;
      continue;
    }
    const result = scanAndRedact({ title: "", body: value, salt });
    redacted[key] = result.body;
    if (result.hits.length > 0) {
      totalHits = totalHits.concat(result.hits);
      fields_redacted += 1;
    }
  }
  return { redacted, hits: totalHits, fields_redacted };
}

/**
 * Run redaction over issue title/body and optional extras.
 *
 * `mode: "scan"` — return the redacted copy plus hits.
 * `mode: "guard"` — throw `RedactionGuardError` if any hit was found, so the
 * caller cannot proceed to publish the original content.
 */
export function runRedactionGuard(input: RedactionGuardInput): RedactionGuardResult {
  const salt = input.salt ?? generateRedactionSalt();
  const baseScan: RedactionResult = scanAndRedact({
    title: input.title ?? "",
    body: input.body ?? "",
    salt,
  });
  const extras = scanExtraFields(input.extra_fields, salt);

  const hits = [...baseScan.hits, ...extras.hits];
  const fields_redacted = baseScan.fields_redacted + extras.fields_redacted;
  const applied = hits.length > 0;

  if ((input.mode ?? "scan") === "guard" && applied) {
    throw new RedactionGuardError(
      `Redaction guard refused to publish content with ${fields_redacted} field(s) containing potential PII (${hits.join(", ")}).`,
      hits,
      fields_redacted
    );
  }

  return {
    title: baseScan.title,
    body: baseScan.body,
    ...(extras.redacted ? { extra_fields: extras.redacted } : {}),
    hits,
    applied,
    fields_redacted,
    salt,
  };
}

/**
 * Convenience helper: run a `guard` pass over inputs that will land in a
 * public artifact (e.g. PR title/body) when the originating issue is
 * private. Throws on any leak so callers can surface the failure rather
 * than emitting the unredacted text.
 */
export function assertPublicEmissionIsClean(input: {
  title: string;
  body: string;
  extra_fields?: Record<string, string>;
}): RedactionGuardResult {
  return runRedactionGuard({ ...input, mode: "guard" });
}
