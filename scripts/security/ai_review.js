#!/usr/bin/env node
/**
 * AI adversarial security review hook (Gate G4 / `/release` Step 3.5).
 *
 * Generates the per-release security review prompt + scaffold under
 * `docs/releases/in_progress/<TAG>/security_review.md`. This file is the
 * artifact `/release` Step 3.5 requires (and which the supplement's
 * `Security hardening` section links). The hook does NOT auto-enforce
 * findings: AI output is review material, the human checkbox is the gate.
 *
 * Provider is pluggable via `NEOTOMA_AI_REVIEW_PROVIDER`:
 *   - `cursor` (default): writes the scaffold including the prompt body
 *     and a hint to paste the prompt into the named provider; the agent
 *     running `/release` will fill in findings before signing off.
 *   - `none`: keeps the scaffold fully manual when the operator wants to
 *     review without any provider-specific prompt bias.
 *
 * The scaffold ALWAYS includes:
 *   - Diff scope (base + head + classifier output).
 *   - The protected_routes_manifest summary.
 *   - Adversarial prompt (alternate-path auth, proxy trust, local-dev
 *     widening, unauth public route, guest-access widening).
 *   - Sign-off checkbox table the supplement's `Security hardening`
 *     section also references.
 *
 * Usage:
 *   node scripts/security/ai_review.js --tag vX.Y.Z [--base <ref>] [--head <ref>] [--out <path>]
 *
 * Registered as: npm run security:ai-review
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = { tag: null, base: null, head: "HEAD", out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") args.tag = argv[++i];
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: ai_review.js --tag vX.Y.Z [--base <ref>] [--head <ref>] [--out <path>]\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  if (!args.tag) {
    process.stderr.write(
      "--tag is required (use the version being released, e.g. v0.12.0).\n",
    );
    process.exit(2);
  }
  return args;
}

function defaultBase() {
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
      cwd: repoRoot,
      stdio: "pipe",
    })
      .toString()
      .trim();
    if (tag) return tag;
  } catch {
    /* fall through */
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", "origin/main"], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    return "origin/main";
  } catch {
    /* fall through */
  }
  return "HEAD~1";
}

function classifierSummary(base, head) {
  const script = path.join(__dirname, "classify_diff.js");
  try {
    const out = execFileSync(
      "node",
      [script, "--base", base, "--head", head, "--json"],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "inherit"] },
    ).toString();
    return JSON.parse(out);
  } catch (err) {
    return {
      sensitive: null,
      base_ref: base,
      head_ref: head,
      changed_file_count: 0,
      concerns: [],
      classifier_error: err.message,
    };
  }
}

function manifestSummary() {
  const manifestPath = path.join(__dirname, "protected_routes_manifest.json");
  if (!fs.existsSync(manifestPath))
    return { exists: false, total_routes: 0, protected_routes: 0 };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const total = manifest.routes?.length ?? 0;
  const protectedCount = (manifest.routes || []).filter((r) => r.requires_auth).length;
  return {
    exists: true,
    total_routes: total,
    protected_routes: protectedCount,
    runtime_only_unauth: (manifest.routes || []).filter((r) => r.runtime_only).length,
  };
}

function changedFiles(base, head, limit = 200) {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", `${base}...${head}`],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "inherit"] },
    ).toString();
    const files = out.split("\n").map((line) => line.trim()).filter(Boolean);
    return { files: files.slice(0, limit), truncated: files.length > limit, total: files.length };
  } catch {
    return { files: [], truncated: false, total: 0 };
  }
}

function provider() {
  const value = (process.env.NEOTOMA_AI_REVIEW_PROVIDER || "cursor").trim().toLowerCase();
  if (["none", "cursor", "claude", "gpt", "manual"].includes(value)) return value;
  return "cursor";
}

function buildScaffold({ tag, base, head, classifier, manifest, files }) {
  const providerName = provider();
  const sensitive = classifier.sensitive === true;
  const sections = [];
  sections.push(`# Security review — ${tag}`);
  sections.push("");
  sections.push(
    `Generated by \`npm run security:ai-review\` on ${new Date().toISOString()}. This file is the gate artifact for \`/release\` Step 3.5 (Security review lane); the supplement's \`Security hardening\` section links it.`,
  );
  sections.push("");
  sections.push("## Scope");
  sections.push("");
  sections.push(`- Base ref: \`${base}\``);
  sections.push(`- Head ref: \`${head}\``);
  sections.push(`- Diff classifier: ${sensitive ? "**sensitive**" : "not sensitive"}`);
  sections.push(
    `- Provider: \`${providerName}\` (set \`NEOTOMA_AI_REVIEW_PROVIDER\` to change; default is \`cursor\`. Use \`none\` for fully manual completion).`,
  );
  sections.push(
    `- Protected routes manifest: ${manifest.exists ? `${manifest.protected_routes} protected of ${manifest.total_routes}, ${manifest.runtime_only_unauth} runtime-only unauth` : "missing — run \`npm run security:manifest:write\`"}.`,
  );
  sections.push(`- Changed files: ${files.total}${files.truncated ? " (truncated)" : ""}`);
  sections.push("");
  if (classifier.concerns?.length) {
    sections.push("### Concerns flagged by `classify_diff.js`");
    sections.push("");
    for (const concern of classifier.concerns) {
      sections.push(`- **${concern.id}** — ${concern.description}`);
      for (const f of concern.files || []) sections.push(`  - \`${f}\``);
      if (concern.extra?.added_env_vars?.length) {
        sections.push(
          `  - new env vars: ${concern.extra.added_env_vars.map((v) => `\`${v}\``).join(", ")}`,
        );
      }
    }
    sections.push("");
  }
  sections.push("## Adversarial review prompt");
  sections.push("");
  sections.push(
    "Treat the diff as if you were an attacker. For every concern below, propose at least one *concrete* request or code path that exercises the failure mode, then either confirm the gate would catch it or describe the missing test.",
  );
  sections.push("");
  sections.push(
    "1. **Alternate-path auth.** Can an unauthenticated external caller reach a privileged path through an alternate channel — a sandbox-mode shortcut, a guest-access widening, an OAuth callback that resolves a non-bearer principal, an MCP transport that re-uses a session token, or a re-mounted Inspector / docs page? List the request shape, the route, and the expected gate.",
  );
  sections.push(
    "2. **Proxy trust.** Does any new code trust `X-Forwarded-For`, `Forwarded`, `Host`, or `req.socket.remoteAddress` outside the canonical `forwardedForValues(req)` + `isLocalRequest(req)` helpers? Construct a tunnel-shaped request that defeats the trust check.",
  );
  sections.push(
    "3. **Local-dev widening.** Does any new path reference `LOCAL_DEV_USER_ID`, the `assertExplicitlyTrusted` escape hatch, `NEOTOMA_TRUST_PROD_LOOPBACK`, or a `dev` / `sandbox` env shortcut in a way that could leak into production behavior? Describe the env / request combination that triggers the widened surface.",
  );
  sections.push(
    "4. **Unauth public route.** For every new Express route, confirm it is in `protected_routes_manifest.json` (auth-required) or in the runtime allow-list with a stated `reason`. List any new route here.",
  );
  sections.push(
    "5. **Guest-access policy widening.** Does the diff change `assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, or any guest-token issuer? Describe the policy delta in plain English and the entity types newly reachable.",
  );
  sections.push(
    "6. **AAuth / agent identity downgrade.** Does the diff make it easier to satisfy auth without a verified `aa-agent+jwt`? E.g. a fallback to `clientInfo.name` for a write that previously required `hardware`/`software` tier.",
  );
  sections.push("");
  sections.push("## Findings");
  sections.push("");
  sections.push(
    "_Fill this section before sign-off. One bullet per concern; cite the file:line touched and either the test that covers it or the residual risk._",
  );
  sections.push("");
  sections.push("- _(no findings yet)_");
  sections.push("");
  sections.push("## Suggested negative tests");
  sections.push("");
  sections.push(
    "_Either point to a row in `tests/security/auth_topology_matrix.test.ts` / `tests/integration/tunnel_auth.test.ts` / `tests/security/security_hardening.test.ts`, or write the test cases needed before sign-off._",
  );
  sections.push("");
  sections.push("- _(none yet)_");
  sections.push("");
  sections.push("## Residual risks");
  sections.push("");
  sections.push("- _(none yet)_");
  sections.push("");
  sections.push("## Sign-off");
  sections.push("");
  sections.push("| Reviewer | Verdict | Date |");
  sections.push("|----------|---------|------|");
  sections.push("| _name_ | yes / with-caveats / block | _YYYY-MM-DD_ |");
  sections.push("");
  sections.push(
    "Verdict `yes` or `with-caveats` is required to advance past `/release` Step 3.5; `block` keeps the release on the security review lane until findings are addressed.",
  );
  sections.push("");
  sections.push("## Diff appendix");
  sections.push("");
  if (files.files.length === 0) {
    sections.push("_(no files in diff scope)_");
  } else {
    for (const f of files.files) sections.push(`- \`${f}\``);
    if (files.truncated) sections.push("- _… truncated …_");
  }
  sections.push("");
  return sections.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const base = args.base || defaultBase();
  const head = args.head;
  const classifier = classifierSummary(base, head);
  const manifest = manifestSummary();
  const files = changedFiles(base, head);
  const scaffold = buildScaffold({
    tag: args.tag,
    base,
    head,
    classifier,
    manifest,
    files,
  });
  const tagDir = path.join(repoRoot, "docs", "releases", "in_progress", args.tag);
  const out = args.out || path.join(tagDir, "security_review.md");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, scaffold);
  process.stdout.write(
    `security:ai-review: wrote ${path.relative(repoRoot, out)} (provider=${provider()}, sensitive=${classifier.sensitive}, files=${files.total})\n`,
  );
}

main();
