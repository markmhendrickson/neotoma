/**
 * Legacy-payload corpus runner.
 *
 * Replays request bodies captured from earlier Neotoma minor versions against
 * the live test API server and asserts the declared outcome. Fails CI when a
 * PR silently tightens validation — a payload that was `valid` on a prior
 * release starts returning an error without the outcome fixture being updated.
 *
 * Directory contract is documented at:
 *   - tests/contract/legacy_payloads/README.md
 *   - docs/architecture/openapi_contract_flow.md § Legacy-payload corpus
 *
 * Each scenario is a pair:
 *   <scenario>.payload.json   — the exact request body
 *   <scenario>.outcome.yaml   — the expected current-build outcome
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Outcome = "valid" | "deprecated" | "rejected";

interface OutcomeSpec {
  endpoint: string;
  outcome: Outcome;
  error_code?: string;
  issue_code?: string;
  hint_match?: string;
  notes?: string;
}

interface Scenario {
  version: string;
  name: string;
  payloadPath: string;
  outcome: OutcomeSpec;
}

function resolveApiBase(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
  return `http://127.0.0.1:${port}`;
}

function parseEndpoint(endpoint: string): { method: string; path: string } {
  const [method, urlPath] = endpoint.trim().split(/\s+/, 2);
  if (!method || !urlPath) {
    throw new Error(`Invalid endpoint spec: "${endpoint}"`);
  }
  return { method: method.toUpperCase(), path: urlPath };
}

function loadScenarios(): Scenario[] {
  const root = __dirname;
  const versionDirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const scenarios: Scenario[] = [];
  for (const version of versionDirs) {
    const versionDir = path.join(root, version);
    const files = fs.readdirSync(versionDir);
    const payloadFiles = files.filter((f) => f.endsWith(".payload.json"));
    for (const payloadFile of payloadFiles) {
      const name = payloadFile.replace(/\.payload\.json$/, "");
      const outcomeFile = path.join(versionDir, `${name}.outcome.yaml`);
      if (!fs.existsSync(outcomeFile)) {
        throw new Error(
          `Missing outcome file for payload ${version}/${payloadFile}. ` +
            `Expected ${name}.outcome.yaml alongside it.`,
        );
      }
      const outcome = yaml.load(
        fs.readFileSync(outcomeFile, "utf-8"),
      ) as OutcomeSpec;
      if (!outcome?.endpoint || !outcome?.outcome) {
        throw new Error(
          `Invalid outcome spec at ${version}/${name}.outcome.yaml: ` +
            `requires "endpoint" and "outcome" fields.`,
        );
      }
      scenarios.push({
        version,
        name,
        payloadPath: path.join(versionDir, payloadFile),
        outcome,
      });
    }
  }
  return scenarios;
}

async function sendRequest(
  apiBase: string,
  endpoint: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const { method, path: urlPath } = parseEndpoint(endpoint);
  const url = `${apiBase}${urlPath}`;
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  let parsed: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed };
}

function stampUniquePerRun(
  body: Record<string, unknown>,
  scenario: Scenario,
): Record<string, unknown> {
  if (typeof body !== "object" || body === null) return body;
  const suffix = `${scenario.version}-${scenario.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const copy = { ...body };
  if (
    "idempotency_key" in copy &&
    typeof copy.idempotency_key === "string"
  ) {
    copy.idempotency_key = `legacy-${suffix}`;
  }
  if (
    "file_idempotency_key" in copy &&
    typeof copy.file_idempotency_key === "string"
  ) {
    copy.file_idempotency_key = `legacy-file-${suffix}`;
  }
  if (!("user_id" in copy)) {
    copy.user_id = TEST_USER_ID;
  }
  if (Array.isArray(copy.entities)) {
    copy.entities = (copy.entities as Record<string, unknown>[]).map((e) => {
      if (!e || typeof e !== "object") return e;
      const entity = { ...e };
      if (typeof entity.canonical_name === "string") {
        entity.canonical_name = `${entity.canonical_name} [${suffix}]`;
      }
      return entity;
    });
  }
  return copy;
}

/**
 * R4: hints may be a plain string (legacy) or a structured object
 * `{ text, ...metadata }` (e.g. `required_identity_fields`). Extract the
 * matchable text from either shape.
 */
function hintText(hint: unknown): string | undefined {
  if (typeof hint === "string") return hint;
  if (hint && typeof hint === "object" && typeof (hint as { text?: unknown }).text === "string") {
    return (hint as { text: string }).text;
  }
  return undefined;
}

function matchesHint(hint: unknown, spec: string): boolean {
  const text = hintText(hint);
  if (typeof text !== "string") return false;
  const trimmed = spec.trim();
  const regexMatch = /^\/(.+)\/([a-z]*)$/.exec(trimmed);
  if (regexMatch) {
    const [, pattern, flags] = regexMatch;
    return new RegExp(pattern, flags).test(text);
  }
  return text.includes(trimmed);
}

interface ResolutionErrorBody {
  error?: {
    code?: string;
    issues?: Array<{
      code?: string;
      hint?: unknown;
    }>;
  };
}

interface StandardErrorBody {
  error?: {
    error_code?: string;
    code?: string;
    hint?: unknown;
  };
}

const scenarios = loadScenarios();

describe("Legacy-payload corpus", () => {
  if (scenarios.length === 0) {
    it.skip("has no scenarios yet — seed with real payloads to activate", () => {
      /* placeholder */
    });
    return;
  }

  for (const scenario of scenarios) {
    it(`${scenario.version}/${scenario.name} → ${scenario.outcome.outcome}`, async () => {
      const apiBase = resolveApiBase();
      const raw = JSON.parse(fs.readFileSync(scenario.payloadPath, "utf-8"));
      const body =
        typeof raw === "object" && raw !== null && !Array.isArray(raw)
          ? stampUniquePerRun(raw as Record<string, unknown>, scenario)
          : raw;
      const { status, body: responseBody } = await sendRequest(
        apiBase,
        scenario.outcome.endpoint,
        body,
      );

      switch (scenario.outcome.outcome) {
        case "valid": {
          expect(
            status,
            `${scenario.version}/${scenario.name} expected 2xx, got ${status}: ${JSON.stringify(responseBody)}`,
          ).toBeGreaterThanOrEqual(200);
          expect(status).toBeLessThan(300);
          break;
        }
        case "deprecated": {
          expect(status).toBeGreaterThanOrEqual(200);
          expect(status).toBeLessThan(300);
          const deprecatedFlag =
            typeof responseBody === "object" &&
            responseBody !== null &&
            (responseBody as { deprecated?: boolean }).deprecated === true;
          if (!deprecatedFlag) {
            throw new Error(
              `${scenario.version}/${scenario.name} declared deprecated but response carries no "deprecated: true" flag. ` +
                `Either populate the flag or flip the outcome to "rejected" / "valid".`,
            );
          }
          break;
        }
        case "rejected": {
          expect(
            status,
            `${scenario.version}/${scenario.name} expected 4xx, got ${status}: ${JSON.stringify(responseBody)}`,
          ).toBeGreaterThanOrEqual(400);
          expect(status).toBeLessThan(500);

          const resolution = responseBody as ResolutionErrorBody;
          const standard = responseBody as StandardErrorBody;
          if (scenario.outcome.error_code) {
            const actualCode =
              resolution.error?.code ??
              standard.error?.error_code ??
              standard.error?.code;
            expect(actualCode).toBe(scenario.outcome.error_code);
          }
          if (scenario.outcome.issue_code) {
            const codes = (resolution.error?.issues ?? []).map((i) => i?.code);
            expect(codes).toContain(scenario.outcome.issue_code);
          }
          if (scenario.outcome.hint_match) {
            const hints: unknown[] = [
              ...(resolution.error?.issues ?? []).map((i) => i?.hint),
              standard.error?.hint,
            ].filter((h) => h !== undefined && h !== null);
            const matched = hints.some((h) =>
              matchesHint(h, scenario.outcome.hint_match!),
            );
            if (!matched) {
              throw new Error(
                `${scenario.version}/${scenario.name} expected a hint matching ${JSON.stringify(scenario.outcome.hint_match)}, ` +
                  `but saw hints: ${JSON.stringify(hints)}. ` +
                  `See docs/subsystems/errors.md § Tightening-change hint obligation.`,
              );
            }
          }
          break;
        }
      }
    });
  }
});
