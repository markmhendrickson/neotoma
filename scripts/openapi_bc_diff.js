#!/usr/bin/env node
/**
 * OpenAPI breaking-change diff.
 *
 * Compares `openapi.yaml` at a base ref (default: the latest tag) with HEAD
 * (or another target ref), classifies each schema-level change, and emits
 * both machine-readable JSON and a prose block ready to paste into the
 * release supplement's "Breaking changes" section.
 *
 * Canonical home: docs/architecture/openapi_contract_flow.md § Legacy-payload corpus
 * Wired into:    .cursor/skills/release/SKILL.md § Step 1 (Preflight)
 *
 * Classifications:
 *   - removed-path              — an entire path or operation disappeared
 *   - removed-operation         — an operation disappeared from an existing path
 *   - removed-request-field     — a request body field was dropped
 *   - removed-response-field    — a response field was dropped (breaking for clients that relied on it)
 *   - removed-error-code        — an enumerated error code disappeared
 *   - new-required-field        — a previously-optional request field became required, or a new required field was added
 *   - narrowed-enum             — an enum lost allowed values
 *   - narrowed-type             — a schema's type narrowed (e.g. string → "uuid", any → object)
 *   - tightened-additional-properties — `additionalProperties` flipped from true/absent to false
 *   - removed-optional-alias    — a previously-tolerated alternative shape was removed (manual annotation)
 *
 * Non-breaking additions (new paths, new optional fields, widened enums, new response
 * fields) are reported in a separate "non_breaking" bucket so reviewers can sanity-check
 * the classification but the preflight does not gate on them.
 *
 * Usage:
 *   node scripts/openapi_bc_diff.js [--base <ref>] [--head <ref>] [--json] [--out <path>]
 *
 * Registered as: npm run openapi:bc-diff
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { base: null, head: "HEAD", json: false, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: openapi_bc_diff.js [--base <ref>] [--head <ref>] [--json] [--out <path>]\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function resolveBaseRef() {
  try {
    const tags = git("tag", "--sort=-v:refname").split("\n").filter(Boolean);
    if (tags.length > 0) return tags[0];
  } catch {
    /* fall through */
  }
  return "HEAD~1";
}

function loadOpenApiAtRef(ref) {
  const content = git("show", `${ref}:openapi.yaml`);
  return yaml.load(content);
}

function loadOpenApiAtHead(ref) {
  if (ref === "HEAD" || ref === "WORKTREE") {
    return yaml.load(fs.readFileSync(path.join(repoRoot, "openapi.yaml"), "utf-8"));
  }
  return loadOpenApiAtRef(ref);
}

function safeGet(obj, keyPath) {
  let cur = obj;
  for (const k of keyPath) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

function resolveRef(schema, root) {
  if (!schema || typeof schema !== "object") return schema;
  if (schema.$ref && typeof schema.$ref === "string") {
    const parts = schema.$ref.replace(/^#\//, "").split("/");
    const resolved = parts.reduce((acc, p) => (acc ? acc[p] : undefined), root);
    return resolved ?? schema;
  }
  return schema;
}

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "options",
  "head",
  "trace",
];

function walkOperations(spec) {
  const out = [];
  const paths = spec?.paths ?? {};
  for (const p of Object.keys(paths)) {
    for (const m of HTTP_METHODS) {
      if (paths[p]?.[m]) {
        out.push({ path: p, method: m.toUpperCase(), op: paths[p][m] });
      }
    }
  }
  return out;
}

function collectRequestBodyShape(op, root) {
  const body = op?.requestBody;
  const resolved = resolveRef(body, root);
  const appJson = safeGet(resolved, ["content", "application/json", "schema"]);
  if (!appJson) return null;
  return resolveRef(appJson, root);
}

function collectResponseShape(op, root) {
  const responses = op?.responses ?? {};
  const out = {};
  for (const status of Object.keys(responses)) {
    const schema = safeGet(responses[status], [
      "content",
      "application/json",
      "schema",
    ]);
    if (schema) out[status] = resolveRef(schema, root);
  }
  return out;
}

function collectRequiredFields(schema) {
  const req = schema?.required;
  return Array.isArray(req) ? new Set(req) : new Set();
}

function collectProperties(schema) {
  return schema?.properties && typeof schema.properties === "object"
    ? schema.properties
    : {};
}

function collectEnum(schema) {
  return Array.isArray(schema?.enum) ? schema.enum : null;
}

function classifyChanges(baseSpec, headSpec) {
  const breaking = [];
  const nonBreaking = [];

  const baseOps = new Map(
    walkOperations(baseSpec).map((o) => [`${o.method} ${o.path}`, o]),
  );
  const headOps = new Map(
    walkOperations(headSpec).map((o) => [`${o.method} ${o.path}`, o]),
  );

  for (const key of baseOps.keys()) {
    if (!headOps.has(key)) {
      breaking.push({
        kind: "removed-operation",
        key,
        detail: `Operation ${key} was removed.`,
      });
    }
  }
  for (const key of headOps.keys()) {
    if (!baseOps.has(key)) {
      nonBreaking.push({
        kind: "added-operation",
        key,
        detail: `Operation ${key} was added.`,
      });
    }
  }

  for (const [key, headEntry] of headOps.entries()) {
    const baseEntry = baseOps.get(key);
    if (!baseEntry) continue;

    const baseBody = collectRequestBodyShape(baseEntry.op, baseSpec);
    const headBody = collectRequestBodyShape(headEntry.op, headSpec);
    diffObjectSchema(
      key,
      "request",
      baseBody,
      headBody,
      breaking,
      nonBreaking,
    );

    const baseResponses = collectResponseShape(baseEntry.op, baseSpec);
    const headResponses = collectResponseShape(headEntry.op, headSpec);
    for (const status of Object.keys(baseResponses)) {
      const baseR = baseResponses[status];
      const headR = headResponses[status];
      if (!headR) {
        breaking.push({
          kind: "removed-response-status",
          key,
          detail: `Response ${status} removed from ${key}.`,
        });
        continue;
      }
      diffObjectSchema(
        `${key} [${status}]`,
        "response",
        baseR,
        headR,
        breaking,
        nonBreaking,
      );
    }
  }

  const baseSchemas = safeGet(baseSpec, ["components", "schemas"]) ?? {};
  const headSchemas = safeGet(headSpec, ["components", "schemas"]) ?? {};
  for (const name of Object.keys(baseSchemas)) {
    if (!(name in headSchemas)) {
      breaking.push({
        kind: "removed-component-schema",
        key: `components.schemas.${name}`,
        detail: `Component schema ${name} was removed.`,
      });
    }
  }
  for (const name of Object.keys(baseSchemas)) {
    if (!(name in headSchemas)) continue;
    diffObjectSchema(
      `components.schemas.${name}`,
      "schema",
      baseSchemas[name],
      headSchemas[name],
      breaking,
      nonBreaking,
    );
  }

  return { breaking, nonBreaking };
}

function diffObjectSchema(key, surface, baseSchema, headSchema, breaking, nonBreaking) {
  if (!baseSchema && !headSchema) return;
  if (!baseSchema && headSchema) {
    nonBreaking.push({
      kind: `added-${surface}-body`,
      key,
      detail: `${surface} body added for ${key}.`,
    });
    return;
  }
  if (baseSchema && !headSchema) {
    breaking.push({
      kind: `removed-${surface}-body`,
      key,
      detail: `${surface} body removed from ${key}.`,
    });
    return;
  }

  const baseProps = collectProperties(baseSchema);
  const headProps = collectProperties(headSchema);
  const baseRequired = collectRequiredFields(baseSchema);
  const headRequired = collectRequiredFields(headSchema);

  for (const field of Object.keys(baseProps)) {
    if (!(field in headProps)) {
      breaking.push({
        kind: surface === "response" ? "removed-response-field" : "removed-request-field",
        key: `${key}.${field}`,
        detail: `${surface} field ${field} removed from ${key}.`,
      });
    }
  }
  for (const field of Object.keys(headProps)) {
    if (!(field in baseProps)) {
      if (surface === "request" && headRequired.has(field)) {
        breaking.push({
          kind: "new-required-field",
          key: `${key}.${field}`,
          detail: `New required request field ${field} added to ${key}.`,
        });
      } else {
        nonBreaking.push({
          kind: `added-${surface}-field`,
          key: `${key}.${field}`,
          detail: `${surface} field ${field} added to ${key}.`,
        });
      }
    }
  }

  for (const field of headRequired) {
    if (!baseRequired.has(field) && field in baseProps) {
      if (surface === "request") {
        breaking.push({
          kind: "promoted-to-required",
          key: `${key}.${field}`,
          detail: `Field ${field} promoted from optional to required in ${key}.`,
        });
      }
    }
  }

  for (const field of Object.keys(baseProps)) {
    if (!(field in headProps)) continue;
    diffLeafSchema(
      `${key}.${field}`,
      surface,
      baseProps[field],
      headProps[field],
      breaking,
      nonBreaking,
    );
  }

  const baseAdd = baseSchema.additionalProperties;
  const headAdd = headSchema.additionalProperties;
  const baseOpen = baseAdd === undefined || baseAdd === true || typeof baseAdd === "object";
  const headOpen = headAdd === undefined || headAdd === true || typeof headAdd === "object";
  if (baseOpen && headAdd === false) {
    breaking.push({
      kind: "tightened-additional-properties",
      key,
      detail: `${key} now sets additionalProperties: false (previously open). Undeclared fields will be rejected.`,
    });
  } else if (baseAdd === false && headOpen) {
    nonBreaking.push({
      kind: "widened-additional-properties",
      key,
      detail: `${key} widened additionalProperties (previously false).`,
    });
  }
}

function diffLeafSchema(key, surface, baseSchema, headSchema, breaking, nonBreaking) {
  if (!baseSchema || !headSchema) return;

  const baseType = baseSchema.type;
  const headType = headSchema.type;
  if (baseType && headType && baseType !== headType) {
    breaking.push({
      kind: "narrowed-type",
      key,
      detail: `${key} type changed from ${baseType} to ${headType}.`,
    });
  }

  const baseEnum = collectEnum(baseSchema);
  const headEnum = collectEnum(headSchema);
  if (baseEnum && headEnum) {
    const dropped = baseEnum.filter((v) => !headEnum.includes(v));
    const added = headEnum.filter((v) => !baseEnum.includes(v));
    if (dropped.length > 0) {
      breaking.push({
        kind: surface === "response" ? "narrowed-response-enum" : "narrowed-enum",
        key,
        detail: `${key} enum lost values: ${dropped.map((v) => JSON.stringify(v)).join(", ")}.`,
      });
    }
    if (added.length > 0 && surface === "response") {
      nonBreaking.push({
        kind: "widened-response-enum",
        key,
        detail: `${key} enum gained values: ${added.map((v) => JSON.stringify(v)).join(", ")}.`,
      });
    }
    if (added.length > 0 && surface === "request") {
      nonBreaking.push({
        kind: "widened-request-enum",
        key,
        detail: `${key} request enum gained values: ${added.map((v) => JSON.stringify(v)).join(", ")}.`,
      });
    }
  } else if (!baseEnum && headEnum) {
    breaking.push({
      kind: "introduced-enum-constraint",
      key,
      detail: `${key} gained an enum constraint (previously unconstrained).`,
    });
  }
}

function renderProse(result, { base, head }) {
  const lines = [];
  lines.push(`# OpenAPI breaking-change diff`);
  lines.push("");
  lines.push(`- Base: \`${base}\``);
  lines.push(`- Head: \`${head}\``);
  lines.push("");
  if (result.breaking.length === 0) {
    lines.push(`**No breaking changes detected.**`);
    lines.push("");
    lines.push(
      "This does not exempt the release from declaring `No breaking changes.` in the supplement's Breaking changes section (see `docs/developer/github_release_process.md` § Validation tightening is breaking).",
    );
  } else {
    lines.push(`## Breaking changes (${result.breaking.length})`);
    lines.push("");
    for (const entry of result.breaking) {
      lines.push(`- **${entry.kind}** \`${entry.key}\` — ${entry.detail}`);
    }
    lines.push("");
    lines.push(
      "Each entry MUST appear in the release supplement's Breaking changes section with a migration note, or the preflight refuses to proceed.",
    );
  }

  if (result.nonBreaking.length > 0) {
    lines.push("");
    lines.push(`## Non-breaking additions (${result.nonBreaking.length})`);
    lines.push("");
    for (const entry of result.nonBreaking) {
      lines.push(`- ${entry.kind} \`${entry.key}\` — ${entry.detail}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const base = args.base ?? resolveBaseRef();
  const head = args.head;

  let baseSpec;
  try {
    baseSpec = loadOpenApiAtRef(base);
  } catch (err) {
    process.stderr.write(
      `Failed to read openapi.yaml at ref ${base}: ${err.message}\n` +
        `Pass --base <ref> with a reachable git ref (tag, branch, or SHA).\n`,
    );
    process.exit(2);
  }
  let headSpec;
  try {
    headSpec = head === "HEAD"
      ? yaml.load(fs.readFileSync(path.join(repoRoot, "openapi.yaml"), "utf-8"))
      : loadOpenApiAtHead(head);
  } catch (err) {
    process.stderr.write(
      `Failed to read openapi.yaml at ref ${head}: ${err.message}\n`,
    );
    process.exit(2);
  }

  const result = classifyChanges(baseSpec, headSpec);
  const payload = {
    base,
    head,
    breaking_count: result.breaking.length,
    non_breaking_count: result.nonBreaking.length,
    breaking: result.breaking,
    non_breaking: result.nonBreaking,
  };

  let output;
  if (args.json) {
    output = `${JSON.stringify(payload, null, 2)}\n`;
  } else {
    output = renderProse(result, { base, head });
  }

  if (args.out) {
    fs.writeFileSync(args.out, output);
  } else {
    process.stdout.write(output);
  }

  if (result.breaking.length > 0) {
    process.exit(1);
  }
}

main();
