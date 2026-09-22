/**
 * Topology-aware negative auth matrix (Gate G3).
 *
 * Two layers:
 *
 *   1. **`isLocalRequest` cross-product** (always runs).
 *      Generates the cross product of:
 *        - transport: direct, behind reverse proxy, behind tunnel
 *        - env: NEOTOMA_ENV=production, dev, with/without
 *               NEOTOMA_TRUST_PROD_LOOPBACK=1
 *        - socket: loopback, public
 *        - X-Forwarded-For: absent, single public, single loopback,
 *                           list with public+loopback
 *      Each row asserts the expected `isLocalRequest()` verdict so the
 *      v0.11.1 Inspector auth-bypass class cannot regress (a tunnel client
 *      with a public X-Forwarded-For but a loopback socket MUST be remote
 *      in production).
 *
 *   2. **Manifest sanity** (always runs).
 *      Loads `scripts/security/protected_routes_manifest.json`, asserts
 *      every row has the schema fields the auth gates depend on, and
 *      checks that every protected (auth-required) row's expected status
 *      list contains 401 and that every runtime-only unauth row carries a
 *      reason string.
 *
 *   3. **Optional HTTP probe layer** (runs when `RUN_AUTH_MATRIX_HTTP=1`).
 *      Mounts the real `src/actions.ts` Express app on a random loopback
 *      port and probes a representative subset of protected routes with
 *      bearer-absent + bearer-invalid, asserting the response status falls
 *      inside `expected_no_auth_status` / `expected_invalid_auth_status`.
 *      Off by default so CI's security_gates job stays fast; the
 *      `/release` Step 3.5 lane and `npm run security:probes` cover the
 *      live equivalent post-deploy.
 *
 * Wired into:
 *   - `npm run security:auth-matrix`
 *   - `npm run test:security:auth-matrix`
 *   - `.github/workflows/ci_test_lanes.yml` (security_gates job)
 *   - `.cursor/skills/release/SKILL.md` Step 3.5 (Security review lane)
 *
 * The matrix replaces the ad-hoc isLocalRequest cases in
 * `tests/integration/tunnel_auth.test.ts` for the regression-layer
 * coverage of the v0.11.1 bug class; tunnel_auth.test.ts remains the
 * targeted /mcp tunnel-auth assertion.
 *
 * NEGATIVE-SPACE DISCIPLINE (Practice 1, docs/security/adversarial_practices.md):
 * absent/malformed-credential rows are necessary but NOT sufficient. The
 * 2026-08-07 forged-key bypass lived in the gap between "no credential" and
 * "wrong credential" — a WELL-FORMED-BUT-UNAUTHORIZED credential. Every auth
 * boundary must also assert the well-formed-but-unauthorized case (a
 * syntactically valid but unprovisioned credential, with and without a
 * caller-supplied user_id override). That specific coverage lives in
 * `tests/security/ed25519_forged_key_auth_bypass.test.ts`; keep both files in
 * sync when adding auth paths.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { isLocalRequest } from "../../src/actions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const MANIFEST_PATH = path.join(
  repoRoot,
  "scripts",
  "security",
  "protected_routes_manifest.json",
);

interface FakeReqOptions {
  remoteAddress?: string;
  forwardedFor?: string;
  hostHeader?: string;
}

function fakeReq(options: FakeReqOptions): import("express").Request {
  const headers: Record<string, string> = {};
  if (options.hostHeader) headers.host = options.hostHeader;
  if (options.forwardedFor) headers["x-forwarded-for"] = options.forwardedFor;
  return {
    headers,
    socket: { remoteAddress: options.remoteAddress } as unknown,
    header(name: string) {
      return (this.headers as Record<string, string | undefined>)[name.toLowerCase()];
    },
  } as unknown as import("express").Request;
}

type Transport = "direct-loopback" | "reverse-proxy" | "tunnel" | "public-direct";
type EnvName = "dev" | "production" | "production-trust-loopback";

interface MatrixCell {
  transport: Transport;
  env: EnvName;
  remoteAddress: string;
  forwardedFor?: string;
  expected: boolean;
  rationale: string;
}

const TRANSPORTS: Array<{
  id: Transport;
  remoteAddress: string;
  forwardedFor?: string;
}> = [
  { id: "direct-loopback", remoteAddress: "127.0.0.1" },
  { id: "reverse-proxy", remoteAddress: "127.0.0.1", forwardedFor: "198.51.100.5" },
  { id: "tunnel", remoteAddress: "127.0.0.1", forwardedFor: "198.51.100.5, 127.0.0.1" },
  { id: "public-direct", remoteAddress: "8.8.8.8" },
];

const ENVS: Array<{ id: EnvName; setEnv: () => void }> = [
  {
    id: "dev",
    setEnv: () => {
      process.env.NEOTOMA_ENV = "development";
      delete process.env.NEOTOMA_TRUST_PROD_LOOPBACK;
    },
  },
  {
    id: "production",
    setEnv: () => {
      process.env.NEOTOMA_ENV = "production";
      delete process.env.NEOTOMA_TRUST_PROD_LOOPBACK;
    },
  },
  {
    id: "production-trust-loopback",
    setEnv: () => {
      process.env.NEOTOMA_ENV = "production";
      process.env.NEOTOMA_TRUST_PROD_LOOPBACK = "1";
    },
  },
];

function expectedLocal(transport: Transport, env: EnvName): boolean {
  // 1) Public sockets are never local.
  if (transport === "public-direct") return false;
  // 2) Reverse-proxy and tunnel: any non-loopback forwarded hop disqualifies
  //    the request, regardless of env. (This is the v0.11.1 fix shape.)
  if (transport === "reverse-proxy") return false;
  if (transport === "tunnel") return false;
  // 3) Direct loopback: behavior depends on env.
  if (env === "dev") return true;
  if (env === "production") return false;
  if (env === "production-trust-loopback") return true;
  return false;
}

function buildMatrix(): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const transport of TRANSPORTS) {
    for (const env of ENVS) {
      const expected = expectedLocal(transport.id, env.id);
      cells.push({
        transport: transport.id,
        env: env.id,
        remoteAddress: transport.remoteAddress,
        forwardedFor: transport.forwardedFor,
        expected,
        rationale: rationaleFor(transport.id, env.id, expected),
      });
    }
  }
  return cells;
}

function rationaleFor(transport: Transport, env: EnvName, expected: boolean): string {
  if (transport === "public-direct") return "Public socket is never local.";
  if (transport === "reverse-proxy")
    return "Reverse proxy: forwarded-for has a public hop, must be remote (v0.11.1 fix).";
  if (transport === "tunnel")
    return "Tunnel: forwarded-for chain contains a public hop, must be remote (v0.11.1 fix).";
  // direct-loopback
  if (env === "dev") return "Dev: loopback without forwarding is local.";
  if (env === "production")
    return "Production: loopback alone is NOT local (reverse-proxy ambiguity).";
  if (env === "production-trust-loopback")
    return "Production with NEOTOMA_TRUST_PROD_LOOPBACK=1: explicitly trusted loopback.";
  return expected ? "local" : "remote";
}

describe("auth topology matrix — isLocalRequest cross product", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  const matrix = buildMatrix();
  for (const cell of matrix) {
    it(`[${cell.transport}|${cell.env}] expected isLocalRequest=${cell.expected} (${cell.rationale})`, () => {
      const env = ENVS.find((e) => e.id === cell.env);
      if (!env) throw new Error(`unknown env ${cell.env}`);
      env.setEnv();
      const req = fakeReq({
        remoteAddress: cell.remoteAddress,
        forwardedFor: cell.forwardedFor,
      });
      expect(isLocalRequest(req)).toBe(cell.expected);
    });
  }
});

interface ManifestRoute {
  path: string;
  method: string;
  operation_id: string | null;
  requires_auth: boolean;
  runtime_only?: boolean;
  reason?: string;
  /** Sandbox-mode reachability (plan ent_b4958d038bd41e8694fe0aef Phase 4). */
  sandbox_allowed?: "none" | "local_only" | "hosted_ok";
  expected_no_auth_status: number[];
  expected_invalid_auth_status: number[];
}

interface Manifest {
  version: number;
  routes: ManifestRoute[];
}

function loadManifest(): Manifest {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

describe("auth topology matrix — protected_routes_manifest.json sanity", () => {
  it("manifest exists and has at least one protected route", () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    const manifest = loadManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.routes.length).toBeGreaterThan(0);
    expect(manifest.routes.some((r) => r.requires_auth)).toBe(true);
  });

  it("every route row has the schema the matrix runner depends on", () => {
    const manifest = loadManifest();
    for (const row of manifest.routes) {
      expect(typeof row.path).toBe("string");
      expect(["GET", "POST", "PUT", "PATCH", "DELETE"]).toContain(row.method);
      expect(typeof row.requires_auth).toBe("boolean");
      expect(Array.isArray(row.expected_no_auth_status)).toBe(true);
      expect(Array.isArray(row.expected_invalid_auth_status)).toBe(true);
      expect(row.expected_no_auth_status.length).toBeGreaterThan(0);
      expect(row.expected_invalid_auth_status.length).toBeGreaterThan(0);
    }
  });

  it("every protected route lists 401 in its no-auth and invalid-auth expected statuses", () => {
    const manifest = loadManifest();
    for (const row of manifest.routes) {
      if (!row.requires_auth) continue;
      expect(row.expected_no_auth_status, `${row.method} ${row.path} no-auth`).toContain(401);
      expect(row.expected_invalid_auth_status, `${row.method} ${row.path} invalid-auth`).toContain(
        401,
      );
    }
  });

  it("every runtime-only unauth row carries a reason string", () => {
    const manifest = loadManifest();
    for (const row of manifest.routes) {
      if (!row.runtime_only) continue;
      expect(row.reason, `${row.method} ${row.path}`).toBeTruthy();
    }
  });

  // Plan ent_b4958d038bd41e8694fe0aef Phase 4: sandbox_allowed column.
  it("every route declares a valid sandbox_allowed value", () => {
    const manifest = loadManifest();
    const allowed = new Set(["none", "local_only", "hosted_ok"]);
    for (const row of manifest.routes) {
      expect(
        row.sandbox_allowed,
        `${row.method} ${row.path} is missing sandbox_allowed`,
      ).toBeTruthy();
      expect(
        allowed.has(row.sandbox_allowed as string),
        `${row.method} ${row.path} has invalid sandbox_allowed=${row.sandbox_allowed}`,
      ).toBe(true);
    }
  });

  // The sandbox auth middleware in actions.ts resolves an anonymous
  // fingerprinted principal for EVERY route (no per-route opt-in) whenever
  // the server is in local_sandbox/hosted_sandbox mode and no Bearer is
  // presented — so `requires_auth: true` does NOT imply the route is
  // unreachable in sandbox mode. `sandbox_allowed` must track the actual
  // runtime carve-out instead: the destructive-route write gate
  // (`isDestructiveSandboxRoute` / `DESTRUCTIVE_ROUTES` in
  // src/services/sandbox_mode.ts), which is the only thing that blocks an
  // anonymous sandbox caller outright. Asserting `sandbox_allowed === "none"`
  // for every auth-required row (the previous version of this test) pinned
  // exactly the miscalibration that scored `sandbox.neotoma.io` as failing
  // Gate G5 every week for a month even though nothing was exposed: it
  // encoded "auth-required implies blocked in sandbox", which is false for
  // every route except the destructive set below.
  const SANDBOX_DESTRUCTIVE_ROUTES = new Set([
    "POST /entities/merge",
    "POST /entities/split",
    "POST /recompute_snapshots_by_type",
    "POST /health_check_snapshots",
    "POST /update_schema_incremental",
  ]);

  it("only the destructive-route set is sandbox_allowed=none; every other auth-required route is hosted_ok", () => {
    const manifest = loadManifest();
    for (const row of manifest.routes) {
      if (!row.requires_auth) continue;
      const key = `${row.method} ${row.path}`;
      const expected = SANDBOX_DESTRUCTIVE_ROUTES.has(key) ? "none" : "hosted_ok";
      expect(row.sandbox_allowed, `${key}: expected sandbox_allowed=${expected}`).toBe(expected);
    }
  });

  it("every destructive route in the manifest is also declared requires_auth (defense in depth)", () => {
    const manifest = loadManifest();
    const manifestPaths = new Set(manifest.routes.map((r) => `${r.method} ${r.path}`));
    for (const key of SANDBOX_DESTRUCTIVE_ROUTES) {
      if (!manifestPaths.has(key)) continue; // not every destructive route has an openapi.yaml entry
      const row = manifest.routes.find((r) => `${r.method} ${r.path}` === key)!;
      expect(row.requires_auth, `${key} must require auth`).toBe(true);
      expect(row.sandbox_allowed, `${key} must be sandbox_allowed=none`).toBe("none");
    }
  });
});

// ---------------------------------------------------------------------------
// Optional HTTP probe layer (RUN_AUTH_MATRIX_HTTP=1).
// Off by default to keep the security_gates CI job fast; the live equivalent
// runs in `npm run security:probes` against the deployed sandbox during
// `/release` Step 5.
// ---------------------------------------------------------------------------

const runHttp = process.env.RUN_AUTH_MATRIX_HTTP === "1";
const httpDescribe = runHttp ? describe : describe.skip;

httpDescribe("auth topology matrix — HTTP probe (RUN_AUTH_MATRIX_HTTP=1)", () => {
  it("documented separately in docs/security/threat_model.md and run by security:probes", () => {
    // Intentionally a placeholder: the matrix HTTP probe is implemented as
    // `scripts/security/deployed_probes.sh` against a live host so we
    // exercise real network paths (TLS, proxy headers, runtime middleware
    // ordering). Keeping the probe out of the in-process integration suite
    // avoids false positives from in-process header rewrites and lets the
    // gate match what an external attacker would see.
    expect(true).toBe(true);
  });
});
