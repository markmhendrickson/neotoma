#!/usr/bin/env node
/**
 * Security-sensitive diff classifier (Gate G1).
 *
 * Classifies whether a PR or release diff touches a "security-sensitive" path
 * — auth middleware, proxy / loopback trust helpers, local-dev shortcuts,
 * subscriptions / sync / issues / entity-submission / access-policy, OpenAPI
 * security blocks, and protected-route surfaces. When sensitive, `/release`
 * Step 3.5 ("Security review lane") and the supplement's "Security hardening"
 * section become mandatory; the new `security_gates` CI job runs the static
 * rules + the topology-aware auth matrix.
 *
 * The plain-text contract is intentionally simple (single line):
 *
 *   sensitive=true   (or false)
 *
 * with `--json` returning a structured payload describing every concern hit
 * and the file globs that triggered it. The classifier never looks at line
 * content; "concern touched" is a path-level signal that triggers the lane,
 * and downstream gates (G2 static rules + G3 auth matrix) decide whether the
 * change is actually correct.
 *
 * Path coverage (kept in lock-step with `docs/security/threat_model.md`):
 *   - src/actions.ts (auth middleware, isLocalRequest)
 *   - src/services/root_landing/**
 *   - src/middleware/**
 *   - src/services/auth/**, src/services/aauth/**
 *   - src/services/subscriptions/**, src/services/sync/**
 *   - src/services/issues/gh_auth.ts, src/services/entity_submission/**
 *   - src/services/access_policy.ts
 *   - openapi.yaml (any `security:` block, /sources/**, /inspector/**, /me)
 *   - any new env var matching LOCAL_DEV_USER_ID|TRUST_PROD_LOOPBACK|*_AUTH_*
 *
 * Usage:
 *   node scripts/security/classify_diff.js [--base <ref>] [--head <ref>] [--json]
 *
 * Registered as: npm run security:classify-diff
 *
 * Exit codes:
 *   0 — classification produced (sensitive may be true OR false)
 *   2 — invocation / git error
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = { base: null, head: "HEAD", json: false, files: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--files") args.files = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: classify_diff.js [--base <ref>] [--head <ref>] [--json] [--files <newline-list>]\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

function defaultBaseRef() {
  // Prefer origin/main when available; fall back to the most recent tag, then HEAD~1.
  try {
    execFileSync("git", ["rev-parse", "--verify", "origin/main"], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    return "origin/main";
  } catch {
    /* try tag */
  }
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
      cwd: repoRoot,
      stdio: "pipe",
    })
      .toString()
      .trim();
    if (tag) return tag;
  } catch {
    /* try HEAD~1 */
  }
  return "HEAD~1";
}

function changedFiles(baseRef, headRef) {
  const out = execFileSync(
    "git",
    ["diff", "--name-only", `${baseRef}...${headRef}`],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "inherit"] },
  ).toString();
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const CONCERNS = [
  {
    id: "auth-middleware",
    description:
      "Express auth middleware and isLocalRequest helper (the v0.11.1 bypass surface).",
    matcher: (file) => file === "src/actions.ts",
  },
  {
    id: "root-landing",
    description: "Root landing route handlers (mirror isLocalRequest logic).",
    matcher: (file) => file.startsWith("src/services/root_landing/"),
  },
  {
    id: "middleware",
    description:
      "Generic Express middleware (admission, attribution, encryption, unknown-fields, AAuth verify).",
    matcher: (file) => file.startsWith("src/middleware/"),
  },
  {
    id: "auth-services",
    description: "Bearer / OAuth / AAuth services, public-key registry, token gate.",
    matcher: (file) =>
      file.startsWith("src/services/auth/") || file.startsWith("src/services/aauth/"),
  },
  {
    id: "subscriptions",
    description:
      "Substrate subscriptions transport (webhook signing, SSE bridge).",
    matcher: (file) => file.startsWith("src/services/subscriptions/"),
  },
  {
    id: "sync",
    description: "Cross-instance peer sync transport and webhook signing.",
    matcher: (file) => file.startsWith("src/services/sync/"),
  },
  {
    id: "issues-gh-auth",
    description: "GitHub mirror auth for the issues subsystem.",
    matcher: (file) => file === "src/services/issues/gh_auth.ts",
  },
  {
    id: "entity-submission",
    description: "Guest entity submission orchestration and tokens.",
    matcher: (file) => file.startsWith("src/services/entity_submission/"),
  },
  {
    id: "access-policy",
    description:
      "Guest access policy (read/write gating for non-owner principals).",
    matcher: (file) => file === "src/services/access_policy.ts",
  },
  {
    id: "local-auth",
    description:
      "Local dev user provisioning (LOCAL_DEV_USER_ID widening risk).",
    matcher: (file) =>
      file === "src/services/local_auth.ts" ||
      file === "src/services/sandbox_mode.ts",
  },
  {
    id: "inspector-mount",
    description:
      "Inspector SPA mount: a security-sensitive surface because it serves the database UI.",
    matcher: (file) => file === "src/services/inspector_mount.ts",
  },
  {
    id: "openapi-security",
    description: "OpenAPI security blocks, protected /sources, /inspector, /me.",
    matcher: (file) => file === "openapi.yaml",
  },
  {
    id: "protected-routes-manifest",
    description:
      "Protected routes manifest (auto-derived from openapi.yaml; matrix runner reads this).",
    matcher: (file) =>
      file === "scripts/security/protected_routes_manifest.json" ||
      file === "protected_routes_manifest.json",
  },
  {
    id: "security-gates",
    description:
      "Security-gate scripts/configs themselves (changes here loop the lane).",
    matcher: (file) => file.startsWith("scripts/security/"),
  },
];

const ENV_VAR_PATTERN = /^(?:LOCAL_DEV_USER_ID|TRUST_PROD_LOOPBACK|NEOTOMA_TRUST_PROD_LOOPBACK|.*_AUTH_.*)$/;

function envVarConcern(file, baseRef, headRef) {
  if (
    file !== ".env.example" &&
    file !== ".env" &&
    !file.endsWith(".env.example") &&
    !file.endsWith(".env.template")
  ) {
    return null;
  }
  // Look for *added* env-var lines (lines starting with `+` and a NAME=).
  let diff;
  try {
    diff = execFileSync(
      "git",
      ["diff", `${baseRef}...${headRef}`, "--", file],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "inherit"] },
    ).toString();
  } catch {
    return null;
  }
  const added = [];
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const match = /^\+\s*([A-Z][A-Z0-9_]+)\s*=/.exec(line);
    if (match && ENV_VAR_PATTERN.test(match[1])) added.push(match[1]);
  }
  if (added.length === 0) return null;
  return {
    id: "env-var-auth-surface",
    description:
      "Newly added env var that touches local-dev / production trust / auth surface.",
    files: [file],
    extra: { added_env_vars: added },
  };
}

function classify(files, baseRef, headRef) {
  const hits = new Map();
  for (const file of files) {
    for (const concern of CONCERNS) {
      if (concern.matcher(file)) {
        if (!hits.has(concern.id)) {
          hits.set(concern.id, {
            id: concern.id,
            description: concern.description,
            files: [],
          });
        }
        hits.get(concern.id).files.push(file);
      }
    }
    const envHit = envVarConcern(file, baseRef, headRef);
    if (envHit) {
      const existing = hits.get(envHit.id);
      if (existing) {
        existing.files.push(...envHit.files.filter((f) => !existing.files.includes(f)));
        existing.extra = {
          added_env_vars: Array.from(
            new Set([
              ...(existing.extra?.added_env_vars || []),
              ...(envHit.extra.added_env_vars || []),
            ]),
          ),
        };
      } else {
        hits.set(envHit.id, envHit);
      }
    }
  }
  return Array.from(hits.values());
}

function main() {
  const args = parseArgs(process.argv);
  const baseRef = args.base || defaultBaseRef();
  const headRef = args.head;

  let files;
  if (args.files) {
    files = args.files.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } else {
    try {
      files = changedFiles(baseRef, headRef);
    } catch (err) {
      process.stderr.write(`git diff failed: ${err.message}\n`);
      process.exit(2);
    }
  }

  const concerns = classify(files, baseRef, headRef);
  const sensitive = concerns.length > 0;

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          sensitive,
          base_ref: baseRef,
          head_ref: headRef,
          changed_file_count: files.length,
          concerns,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(`sensitive=${sensitive ? "true" : "false"}\n`);
    if (sensitive) {
      for (const concern of concerns) {
        process.stdout.write(`- ${concern.id}: ${concern.files.join(", ")}\n`);
      }
    }
  }
}

main();
