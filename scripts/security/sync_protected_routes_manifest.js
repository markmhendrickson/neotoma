#!/usr/bin/env node
/**
 * Sync `scripts/security/protected_routes_manifest.json` from `openapi.yaml`
 * (Gate G3 + manifest-sync CI check).
 *
 * The protected-routes manifest is the input to the topology-aware negative
 * auth matrix (`tests/security/auth_topology_matrix.test.ts`). Its rows are
 * derived from `openapi.yaml` security blocks:
 *
 *   - Global default `security: [ { bearerAuth: [] } ]` → every operation
 *     requires bearer unless it explicitly opts out with `security: []`.
 *   - Operation-level `security: []` → unauth allow-listed.
 *
 * The script also captures a small "matrix-relevant" set of fields per row
 * (operationId, expected statuses for bearer-absent / bearer-invalid, and
 * notes for guest-access endpoints). Those defaults live in this file so
 * one place owns the contract; per-route overrides are honored when present
 * in the existing manifest under the `overrides` key.
 *
 * Modes:
 *   --check   Compare regenerated manifest to the file on disk; exit 1 on drift.
 *   --write   Write regenerated manifest. Fails if `openapi.yaml` is missing.
 *   --json    Print the regenerated manifest (used by --check on stdout).
 *
 * Usage:
 *   node scripts/security/sync_protected_routes_manifest.js --write
 *   node scripts/security/sync_protected_routes_manifest.js --check
 *
 * Registered as: npm run security:manifest:check / npm run security:manifest:write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const MANIFEST_PATH = path.join(__dirname, "protected_routes_manifest.json");
const OPENAPI_PATH = path.join(repoRoot, "openapi.yaml");

// Allow-list of paths that the runtime intentionally serves without bearer
// auth in addition to anything `security: []` flags in openapi.yaml. These
// are surfaces the openapi spec does not currently model (sandbox sessions,
// favicon, root landing variants); they MUST stay in this list, not slip
// silently through `unauth-public-route` Semgrep warnings.
const RUNTIME_UNAUTH_ROUTES = [
  { method: "GET", path: "/", reason: "Root landing renders public marketing copy when allowed by env." },
  { method: "GET", path: "/favicon.ico", reason: "Static asset." },
  { method: "GET", path: "/docs", reason: "Public docs index: read-only render of repo docs/**.md with visibility filtering." },
  { method: "GET", path: "/docs/*", reason: "Public docs page: read-only render of a single docs/**.md with visibility filtering and slug sanitization." },
  { method: "POST", path: "/sandbox/session/new", reason: "Public sandbox onboarding (rate-limited)." },
  { method: "POST", path: "/sandbox/session/redeem", reason: "Public sandbox onboarding (rate-limited)." },
  { method: "GET", path: "/sandbox/session", reason: "Sandbox session probe." },
  { method: "POST", path: "/sandbox/session/reset", reason: "Sandbox self-reset." },
  { method: "DELETE", path: "/sandbox/session", reason: "Sandbox self-revoke." },
];

function parseArgs(argv) {
  const args = { mode: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.mode = "check";
    else if (a === "--write") args.mode = "write";
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: sync_protected_routes_manifest.js (--check | --write) [--json]\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  if (!args.mode) {
    process.stderr.write("Pass --check or --write.\n");
    process.exit(2);
  }
  return args;
}

function loadOpenapi() {
  const raw = fs.readFileSync(OPENAPI_PATH, "utf8");
  return yaml.load(raw);
}

function loadExistingManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return null;
  }
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function generateRoutes(openapi) {
  const globalSecurity = Array.isArray(openapi.security) ? openapi.security : [];
  const globalRequiresBearer = globalSecurity.some(
    (block) => block && Object.prototype.hasOwnProperty.call(block, "bearerAuth"),
  );
  const routes = [];
  const paths = openapi.paths || {};
  for (const apiPath of Object.keys(paths).sort()) {
    const pathItem = paths[apiPath] || {};
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      const sec = op.security;
      let requiresAuth;
      if (Array.isArray(sec) && sec.length === 0) requiresAuth = false;
      else if (Array.isArray(sec) && sec.length > 0)
        requiresAuth = sec.some((b) => b && Object.prototype.hasOwnProperty.call(b, "bearerAuth"));
      else requiresAuth = globalRequiresBearer;

      routes.push({
        path: apiPath,
        method: method.toUpperCase(),
        operation_id: op.operationId || null,
        requires_auth: requiresAuth,
        // Conservative expectations the matrix asserts. Operators can override
        // via the `overrides` array (e.g. routes that legitimately allow guest
        // tokens via `?guest_access_token=` should set
        // `accepts_guest_token: true`).
        expected_no_auth_status: requiresAuth ? [401] : [200, 400, 404, 405],
        expected_invalid_auth_status: requiresAuth ? [401] : [200, 400, 404, 405],
      });
    }
  }
  // Append the runtime-only unauth allow-list rows. Mark them with
  // `runtime_only: true` so the matrix test can distinguish them.
  for (const row of RUNTIME_UNAUTH_ROUTES) {
    routes.push({
      path: row.path,
      method: row.method,
      operation_id: null,
      requires_auth: false,
      runtime_only: true,
      reason: row.reason,
      expected_no_auth_status: [200, 204, 400, 404, 405, 429],
      expected_invalid_auth_status: [200, 204, 400, 404, 405, 429],
    });
  }
  return routes;
}

function applyOverrides(routes, existing) {
  const overrides = existing && Array.isArray(existing.overrides) ? existing.overrides : [];
  if (overrides.length === 0) return routes;
  const idx = new Map();
  for (const override of overrides) {
    if (!override.method || !override.path) continue;
    idx.set(`${override.method.toUpperCase()} ${override.path}`, override);
  }
  return routes.map((row) => {
    const key = `${row.method} ${row.path}`;
    const override = idx.get(key);
    if (!override) return row;
    return { ...row, ...override.fields, override_applied: true };
  });
}

function buildManifest(openapi, existing) {
  const generated = generateRoutes(openapi);
  const merged = applyOverrides(generated, existing);
  return {
    version: 1,
    generated_from: "openapi.yaml + scripts/security/sync_protected_routes_manifest.js",
    canonical_doc: "docs/security/threat_model.md",
    routes: merged,
    overrides: (existing && existing.overrides) || [],
  };
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function main() {
  const args = parseArgs(process.argv);
  const openapi = loadOpenapi();
  const existing = loadExistingManifest();
  const manifest = buildManifest(openapi, existing);
  const next = stableStringify(manifest);

  if (args.json) {
    process.stdout.write(next);
  }

  if (args.mode === "write") {
    fs.writeFileSync(MANIFEST_PATH, next);
    if (!args.json) {
      process.stdout.write(
        `protected_routes_manifest.json: wrote ${manifest.routes.length} routes (${path.relative(repoRoot, MANIFEST_PATH)})\n`,
      );
    }
    process.exit(0);
  }

  // --check mode
  if (!fs.existsSync(MANIFEST_PATH)) {
    process.stderr.write(
      `protected_routes_manifest.json missing. Run 'npm run security:manifest:write'.\n`,
    );
    process.exit(1);
  }
  const onDisk = fs.readFileSync(MANIFEST_PATH, "utf8");
  if (onDisk !== next) {
    process.stderr.write(
      `protected_routes_manifest.json out of date. Run 'npm run security:manifest:write' to regenerate.\n`,
    );
    if (!args.json) {
      // Show a tiny diff hint.
      const onDiskLines = onDisk.split("\n");
      const nextLines = next.split("\n");
      const max = Math.min(60, Math.max(onDiskLines.length, nextLines.length));
      for (let i = 0; i < max; i++) {
        if (onDiskLines[i] !== nextLines[i]) {
          process.stderr.write(`  - line ${i + 1}: on-disk: ${onDiskLines[i] || ""}\n`);
          process.stderr.write(`  - line ${i + 1}: should be: ${nextLines[i] || ""}\n`);
          break;
        }
      }
    }
    process.exit(1);
  }
  if (!args.json) {
    process.stdout.write(
      `protected_routes_manifest.json: in sync with openapi.yaml (${manifest.routes.length} routes)\n`,
    );
  }
  process.exit(0);
}

main();
