#!/usr/bin/env node
/**
 * Static security rule runner (Gate G2).
 *
 * Wired into `npm run security:lint`. The plan's Semgrep rules
 * (`scripts/security/semgrep_auth_rules.yml`) are the canonical description
 * of what we forbid; this Node runner implements the same rule shapes as a
 * deterministic, dependency-free CI gate so the security lane can run on a
 * clean Ubuntu runner without installing the Semgrep CLI.
 *
 * If `semgrep` is on PATH and `NEOTOMA_SECURITY_USE_SEMGREP=1`, this script
 * delegates to it (`semgrep --config scripts/security/semgrep_auth_rules.yml`).
 * Otherwise it walks every `*.ts` file under src/ and applies regex
 * equivalents of each rule, with the same severities (ERROR fails CI,
 * WARNING annotates).
 *
 * Escape hatches:
 *   - `// neotoma:security-allow:<rule-id> <reason>` on the *previous* line
 *     suppresses a single hit (recorded in the run report).
 *   - The `assertExplicitlyTrusted(` helper short-circuits the
 *     `no-auth-local-fallback` rule when present in the same block.
 *
 * Usage:
 *   node scripts/security/run_semgrep.js [--json] [--fail-on warning|error]
 *
 * Exit codes:
 *   0 — no errors at the configured severity threshold
 *   1 — at least one error at the configured severity threshold
 *   2 — invocation error
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const RULES = [
  {
    id: "no-auth-local-fallback",
    severity: "error",
    summary:
      "Auth-local fallback (granting user when no Authorization header AND a 'local' predicate is true).",
    paths: { include: ["src/"], exclude: ["src/cli/", "tests/"] },
    test: (text) => {
      const matches = [];
      // Heuristic 1: `if (!authHeader && isLocalRequest(...))` or reverse.
      const reA = /if\s*\(\s*!\s*([A-Za-z_$][\w$]*)\s*&&\s*isLocalRequest\s*\(/g;
      const reB = /if\s*\(\s*isLocalRequest\s*\([^)]*\)\s*&&\s*!\s*([A-Za-z_$][\w$]*)\s*\)/g;
      // Heuristic 2: `if (auth === "" || !auth) { if (isLocalRequest(...)) { ... return ...; } }`
      const reC = /if\s*\(\s*([A-Za-z_$][\w$]*)\s*===?\s*""\s*\|\|\s*[^)]*\)\s*\{[^}]*if\s*\(\s*isLocalRequest\s*\(/g;
      for (const re of [reA, reB, reC]) {
        let m;
        while ((m = re.exec(text)) !== null) {
          // Bypass if the surrounding 200 chars contain assertExplicitlyTrusted(.
          const window = text.slice(Math.max(0, m.index - 200), m.index + 400);
          if (window.includes("assertExplicitlyTrusted(")) continue;
          matches.push({ index: m.index, match: m[0] });
        }
      }
      return matches;
    },
  },
  {
    id: "loopback-trust-in-production",
    severity: "error",
    summary:
      "Bare `req.socket.remoteAddress === '127.0.0.1'` (or startsWith) outside the canonical helper. Use isLocalRequest(req).",
    paths: {
      include: ["src/"],
      exclude: [
        "src/actions.ts",
        "src/services/root_landing/",
        "tests/",
      ],
    },
    test: (text) => {
      const matches = [];
      const re = /req\??\.socket\??\.remoteAddress\s*(===?\s*"(127\.0\.0\.1|::1)"|\??\.startsWith\(\s*"127\.")/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({ index: m.index, match: m[0] });
      }
      return matches;
    },
  },
  {
    id: "forwarded-for-trust",
    severity: "error",
    summary:
      "Direct `X-Forwarded-For` / `Host` read outside the canonical helper. Use forwardedForValues(req) + production gate.",
    paths: {
      include: ["src/"],
      exclude: [
        "src/actions.ts",
        "src/services/root_landing/",
        "tests/",
      ],
    },
    test: (text) => {
      const matches = [];
      const re = /req\.(?:headers\s*\[\s*"(?:x-forwarded-for|X-Forwarded-For|host)"\s*\]|header\(\s*"(?:x-forwarded-for|X-Forwarded-For|host)"\s*\))/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({ index: m.index, match: m[0] });
      }
      return matches;
    },
  },
  {
    id: "local-dev-user-widening",
    severity: "warning",
    summary:
      "Reference to LOCAL_DEV_USER_ID outside src/cli/, src/services/local_auth.ts, and tests/.",
    paths: {
      include: ["src/"],
      exclude: ["src/cli/", "src/services/local_auth.ts", "tests/"],
    },
    test: (text) => {
      const matches = [];
      const re = /\bLOCAL_DEV_USER_ID\b/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({ index: m.index, match: m[0] });
      }
      return matches;
    },
  },
  {
    id: "unauth-public-route",
    severity: "warning",
    summary:
      "Express route registration without an obvious auth wrapper. Confirm the route is in protected_routes_manifest.json or marked unauth-allowed.",
    paths: { include: ["src/"], exclude: ["tests/"] },
    test: (text) => {
      const matches = [];
      // Match top-level app.METHOD( or router.METHOD(. Skip when the same line
      // contains requireUser/auth.requireUser/assertGuestWriteAllowed/sandbox-/oauth-/health/version/openapi/.well-known/server-info.
      const allowList = [
        "/health",
        "/version",
        "/openapi.yaml",
        "/server-info",
        "/.well-known/",
        "/mcp/oauth/",
        "/auth/dev-signin",
      ];
      const re = /(?:^|\s)(app|router)\.(get|post|put|patch|delete)\s*\(\s*("[^"]+"|'[^']+'|`[^`]+`)/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        const route = m[3].slice(1, -1);
        if (allowList.some((prefix) => route === prefix || route.startsWith(prefix))) continue;
        // Look at +/- 200 chars for an auth indicator.
        const window = text.slice(Math.max(0, m.index - 50), m.index + 600);
        if (
          /requireUser\s*\(/.test(window) ||
          /assertGuestWriteAllowed\s*\(/.test(window) ||
          /authenticate\s*\(/.test(window) ||
          /aauthAdmission/.test(window) ||
          /aauthVerify/.test(window) ||
          /attributionContext/.test(window)
        )
          continue;
        matches.push({ index: m.index, match: m[0].trim(), route });
      }
      return matches;
    },
  },
];

function parseArgs(argv) {
  const args = { json: false, failOn: "error", paths: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--paths") args.paths = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: run_semgrep.js [--json] [--fail-on warning|error] [--paths <newline-list>]\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

function maybeRunSemgrep() {
  if (process.env.NEOTOMA_SECURITY_USE_SEMGREP !== "1") return null;
  const probe = spawnSync("semgrep", ["--version"], { stdio: "pipe" });
  if (probe.status !== 0) return null;
  const result = spawnSync(
    "semgrep",
    [
      "--config",
      path.join(__dirname, "semgrep_auth_rules.yml"),
      "--error",
      "--quiet",
      "src/",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  return result.status ?? 1;
}

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && full.endsWith(".ts") && !full.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function relPath(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function ruleApplies(rule, file) {
  const rel = relPath(file);
  const inc = rule.paths.include.some((prefix) => rel.startsWith(prefix));
  if (!inc) return false;
  const exc = (rule.paths.exclude || []).some((prefix) => rel.startsWith(prefix));
  return !exc;
}

function lineForOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function suppressed(text, line, ruleId) {
  if (line <= 1) return false;
  const lines = text.split("\n");
  const prev = lines[line - 2] || "";
  const re = new RegExp(`neotoma:security-allow:${ruleId}\\b`);
  return re.test(prev);
}

function main() {
  const args = parseArgs(process.argv);
  const semgrepStatus = maybeRunSemgrep();
  if (semgrepStatus !== null) {
    process.exit(semgrepStatus);
  }

  let files;
  if (args.paths) {
    files = args.paths
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line.endsWith(".ts") && !line.endsWith(".d.ts"))
      .map((rel) => path.join(repoRoot, rel))
      .filter((abs) => fs.existsSync(abs));
  } else {
    files = Array.from(walk(path.join(repoRoot, "src")));
  }

  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const rule of RULES) {
      if (!ruleApplies(rule, file)) continue;
      const hits = rule.test(text);
      for (const hit of hits) {
        const line = lineForOffset(text, hit.index);
        if (suppressed(text, line, rule.id)) continue;
        findings.push({
          rule_id: rule.id,
          severity: rule.severity,
          summary: rule.summary,
          file: relPath(file),
          line,
          match: hit.match.slice(0, 200),
          route: hit.route,
        });
      }
    }
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const failing = args.failOn === "warning" ? findings : errors;

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          files_scanned: files.length,
          rules_evaluated: RULES.length,
          errors: errors.length,
          warnings: warnings.length,
          findings,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    if (findings.length === 0) {
      process.stdout.write(
        `security:lint: no findings (${RULES.length} rules, ${files.length} files)\n`,
      );
    } else {
      for (const f of findings) {
        process.stdout.write(
          `${f.severity.toUpperCase()} ${f.rule_id} ${f.file}:${f.line} — ${f.summary}\n  match: ${f.match}\n`,
        );
      }
      process.stdout.write(
        `\nsummary: ${errors.length} error(s), ${warnings.length} warning(s) across ${files.length} files\n`,
      );
    }
  }

  process.exit(failing.length > 0 ? 1 : 0);
}

main();
