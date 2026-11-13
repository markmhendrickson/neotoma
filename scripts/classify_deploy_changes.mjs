#!/usr/bin/env node
/**
 * Decides whether a push to `main` needs a redeploy of the operator instance.
 *
 * Used by `.github/workflows/deploy-operator-instance.yml` before it waits for
 * CI and runs `flyctl deploy`. Every deploy replaces the machine, and the
 * instance blocks writes for roughly half a minute while it boots, so a deploy
 * that cannot change what the instance runs costs something and buys nothing.
 *
 * THE BASE IS THE COMMIT THE INSTANCE SERVES, not `github.event.before`.
 * After a failed deploy, the next push's `before` is the commit that never
 * reached the instance. Diffing from it, a docs-only follow-up would read as
 * "nothing to deploy" and leave the failed commit's runtime change undeployed.
 * Diffing from the served `git_sha` (the unauthenticated `GET /` root JSON the
 * workflow's own verify step checks) covers every commit the instance lacks.
 *
 * FAILS TOWARD DEPLOYING. It skips only when it can prove every changed file is
 * outside the image. It deploys when:
 *   - the run is not a push (workflow_dispatch always deploys);
 *   - the served git_sha cannot be read or is not a 40-hex commit;
 *   - the served commit is not an ancestor of the commit being deployed
 *     (or cannot be found within the bounded history fetch);
 *   - any changed path is a build input, or is not on the skip list at all;
 *   - package.json changed in any key outside the metadata allowlist;
 *   - anything here throws.
 *
 * Writes `deploy=true|false` and `reason=<one line>` to $GITHUB_OUTPUT, and a
 * human-readable account to $GITHUB_STEP_SUMMARY so a skipped run explains
 * itself rather than looking broken. Always exits 0 when it reaches a decision.
 *
 * Usage:
 *   node scripts/classify_deploy_changes.mjs --event push --head <sha> \
 *     --served-url https://<host>/        # or --served-sha <sha>
 *
 * Node built-ins only: the deploy job does not install dependencies.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/;
const THIS_WORKFLOW = ".github/workflows/deploy-operator-instance.yml";

/**
 * Paths that ALWAYS deploy. Checked before the skip rules, so a Markdown file
 * under `src/` still deploys: `scripts/copy_bundle_assets.js` copies every
 * non-TS file under `src/services/bundles/` (including SKILL.md and README.md)
 * into the image.
 */
const ALWAYS_DEPLOY = [
  { test: (p) => p.startsWith("src/"), why: "server source" },
  { test: (p) => p.startsWith("inspector/"), why: "Inspector build input" },
  { test: (p) => p.startsWith("scripts/"), why: "build or sandbox script" },
  { test: (p) => p === "openapi.yaml", why: "copied into the image" },
  { test: (p) => p === "Dockerfile", why: "image definition" },
  { test: (p) => p === ".dockerignore", why: "changes the build context" },
  { test: (p) => p === "fly.operator.toml", why: "operator instance config" },
  { test: (p) => p === "package-lock.json", why: "dependency lockfile" },
  { test: (p) => /^tsconfig[^/]*\.json$/.test(p), why: "compiler config" },
  { test: (p) => p.startsWith("tests/fixtures/json/"), why: "copied into the image" },
  { test: (p) => p.startsWith("tests/fixtures/sandbox/"), why: "copied into the image" },
  { test: (p) => p === THIS_WORKFLOW, why: "this deploy workflow" },
];

/**
 * Paths that cannot change the image. Each was checked against the
 * Dockerfile and .dockerignore: either the build context excludes it, or the
 * build never reads it and the runtime stage never copies it.
 */
const SKIP = [
  { test: (p) => p.startsWith("docs/"), why: "docs (excluded from build context)" },
  { test: (p) => p.startsWith("site/"), why: "marketing site" },
  { test: (p) => p.endsWith(".md"), why: "Markdown" },
  { test: (p) => p.startsWith("frontend/"), why: "excluded from build context" },
  { test: (p) => p.startsWith("site_pages/"), why: "excluded from build context" },
  { test: (p) => p.startsWith("public/"), why: "excluded from build context" },
  { test: (p) => p.startsWith("packages/"), why: "excluded from build context" },
  { test: (p) => p.startsWith("mcp/"), why: "excluded from build context" },
  { test: (p) => p.startsWith(".claude/"), why: "excluded from build context" },
  { test: (p) => p.startsWith("playwright/"), why: "browser tests" },
  { test: (p) => p.startsWith("tests/"), why: "tests (not copied into the image)" },
  { test: (p) => /^vitest[^/]*\.ts$/.test(p), why: "test runner config" },
  { test: (p) => p.startsWith(".cursor/"), why: "editor config" },
  { test: (p) => p.startsWith(".github/"), why: "repository automation" },
  { test: (p) => p === "server.json", why: "MCP registry metadata" },
  { test: (p) => p === "fly.toml", why: "not the operator instance config" },
  { test: (p) => p === "fly.sandbox.toml", why: "not the operator instance config" },
];

const PACKAGE_METADATA_KEYS = new Set([
  "description",
  "keywords",
  "homepage",
  "repository",
  "bugs",
  "author",
]);
const SKIPPABLE_SCRIPT_RE = /^(test|lint|e2e)/;

/** @returns {{ verdict: "deploy" | "skip" | "package_json", why: string }} */
export function classifyPath(path) {
  for (const rule of ALWAYS_DEPLOY) {
    if (rule.test(path)) return { verdict: "deploy", why: rule.why };
  }
  if (path === "package.json") return { verdict: "package_json", why: "package manifest" };
  for (const rule of SKIP) {
    if (rule.test(path)) return { verdict: "skip", why: rule.why };
  }
  return { verdict: "deploy", why: "not on the skip list" };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compares two package.json texts by parsed value.
 *
 * @param {string | null} before  null when the file did not exist
 * @param {string | null} after   null when the file was deleted
 * @returns {{ skippable: boolean, why: string }}
 */
export function classifyPackageJsonChange(before, after) {
  if (before == null || after == null) {
    return { skippable: false, why: "package.json added or removed" };
  }
  let a;
  let b;
  try {
    a = JSON.parse(before);
    b = JSON.parse(after);
  } catch {
    return { skippable: false, why: "package.json did not parse" };
  }
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) ||
    Array.isArray(b)
  ) {
    return { skippable: false, why: "package.json is not an object" };
  }

  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changed = keys.filter((k) => canonical(a[k]) !== canonical(b[k]));
  if (changed.length === 0) return { skippable: true, why: "formatting only" };

  const blocking = changed.filter((k) => k !== "scripts" && !PACKAGE_METADATA_KEYS.has(k));
  if (blocking.length) {
    return { skippable: false, why: `package.json changed ${blocking.join(", ")}` };
  }

  if (changed.includes("scripts")) {
    const sa = a.scripts && typeof a.scripts === "object" ? a.scripts : {};
    const sb = b.scripts && typeof b.scripts === "object" ? b.scripts : {};
    if (typeof a.scripts !== typeof b.scripts) {
      return { skippable: false, why: "package.json scripts changed shape" };
    }
    const names = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].sort();
    const changedScripts = names.filter((n) => canonical(sa[n]) !== canonical(sb[n]));
    const unsafe = changedScripts.filter((n) => !SKIPPABLE_SCRIPT_RE.test(n));
    if (unsafe.length) {
      return { skippable: false, why: `package.json changed script(s) ${unsafe.join(", ")}` };
    }
    // A test/lint/e2e script is only inert if no build or lifecycle script
    // runs it. Check every other script in both revisions for a reference.
    const others = [sa, sb].flatMap((s) =>
      Object.entries(s)
        .filter(([n]) => !SKIPPABLE_SCRIPT_RE.test(n))
        .map(([, cmd]) => String(cmd))
    );
    for (const name of changedScripts) {
      const ref = new RegExp(`(^|[^\\w:.-])${escapeRegExp(name)}($|[^\\w:.-])`);
      if (others.some((cmd) => ref.test(cmd))) {
        return { skippable: false, why: `package.json script ${name} is run by another script` };
      }
    }
  }
  return { skippable: true, why: `package.json changed only ${changed.join(", ")}` };
}

/**
 * Classifies a set of changed paths.
 *
 * @param {string[]} paths
 * @param {() => { skippable: boolean, why: string }} packageJsonVerdict
 *        called only when package.json is among the paths
 */
export function classifyChanges(paths, packageJsonVerdict) {
  const rows = paths.map((path) => {
    const c = classifyPath(path);
    if (c.verdict !== "package_json") return { path, deploy: c.verdict === "deploy", why: c.why };
    const pj = packageJsonVerdict();
    return { path, deploy: !pj.skippable, why: pj.why };
  });
  const deploying = rows.filter((r) => r.deploy);
  if (rows.length === 0) {
    return { deploy: true, reason: "no changed files found; deploying to be safe", rows };
  }
  if (deploying.length) {
    const first = deploying[0];
    const more = deploying.length > 1 ? ` (+${deploying.length - 1} more)` : "";
    return {
      deploy: true,
      reason: `${first.path} can change the image: ${first.why}${more}`,
      rows,
    };
  }
  return {
    deploy: false,
    reason: `all ${rows.length} changed file(s) are outside the deployed image`,
    rows,
  };
}

function git(cwd, args, opts = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: opts.encoding ?? "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitStatus(cwd, args) {
  try {
    execFileSync("git", args, { cwd, stdio: "ignore" });
    return 0;
  } catch (err) {
    return typeof err.status === "number" ? err.status : 128;
  }
}

/** Reads `git_sha` from the instance's root JSON. Never throws. */
export async function readServedSha(
  url,
  { attempts = 3, retryDelayMs = 5000, timeoutMs = 20000 } = {}
) {
  let last = "no attempt made";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
      if (!res.ok) {
        last = `HTTP ${res.status}`;
      } else {
        const body = await res.json();
        const sha = body && typeof body.git_sha === "string" ? body.git_sha : "";
        if (SHA_RE.test(sha)) return { sha };
        // A 200 with no commit is not going to change on retry.
        return { sha: "", error: "root JSON has no 40-hex git_sha" };
      }
    } catch (err) {
      last = err && err.name ? err.name : "request failed";
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  return { sha: "", error: last };
}

/**
 * Makes sure `served` is reachable from `head`, deepening a shallow checkout
 * in bounded steps. Returns "ancestor", "not_ancestor" or "unknown".
 */
function servedIsAncestor(cwd, served, head, { remote, maxDepth, log }) {
  let fetched = 0;
  let step = 50;
  for (;;) {
    const s = gitStatus(cwd, ["merge-base", "--is-ancestor", served, head]);
    if (s === 0) return "ancestor";
    const shallow = git(cwd, ["rev-parse", "--is-shallow-repository"]).trim() === "true";
    const present = gitStatus(cwd, ["cat-file", "-e", `${served}^{commit}`]) === 0;
    // In a full clone, or once the served commit is in hand, the answer is final.
    if (!shallow || (present && s === 1)) return "not_ancestor";
    if (fetched >= maxDepth) return "unknown";
    try {
      git(cwd, ["fetch", "--quiet", "--no-tags", `--deepen=${step}`, remote, head]);
    } catch {
      log("history fetch failed");
      return "unknown";
    }
    fetched += step;
    step = Math.min(step * 2, 400);
  }
}

function readAt(cwd, rev, path) {
  try {
    return git(cwd, ["show", `${rev}:${path}`]);
  } catch {
    return null;
  }
}

/**
 * Reaches a decision. Never throws: any failure is a deploy.
 *
 * @returns {Promise<{ deploy: boolean, reason: string, served?: string, rows: Array<{path: string, deploy: boolean, why: string}> }>}
 */
export async function decide({
  event,
  head,
  servedSha,
  servedUrl,
  cwd = process.cwd(),
  remote = "origin",
  maxDepth = 2000,
  fetchOptions,
  log = () => {},
}) {
  try {
    if (event !== "push") {
      return { deploy: true, reason: `${event || "unknown"} runs always deploy`, rows: [] };
    }
    let served = servedSha;
    if (served === undefined) {
      if (!servedUrl) {
        return { deploy: true, reason: "no served-sha source given; deploying", rows: [] };
      }
      const r = await readServedSha(servedUrl, fetchOptions);
      if (r.error) log(`served git_sha unreadable: ${r.error}`);
      served = r.sha;
    }
    served = String(served ?? "").trim();
    if (!SHA_RE.test(served)) {
      return {
        deploy: true,
        reason: "could not read the instance's served git_sha; deploying",
        rows: [],
      };
    }
    let headSha;
    try {
      headSha = git(cwd, ["rev-parse", "--verify", `${head}^{commit}`]).trim();
    } catch {
      return { deploy: true, reason: `cannot resolve ${head}; deploying`, served, rows: [] };
    }
    if (served === headSha) {
      return {
        deploy: true,
        reason: "instance already serves this commit; redeploying as asked",
        served,
        rows: [],
      };
    }
    const ancestry = servedIsAncestor(cwd, served, headSha, { remote, maxDepth, log });
    if (ancestry !== "ancestor") {
      return {
        deploy: true,
        reason:
          ancestry === "not_ancestor"
            ? `served ${served.slice(0, 12)} is not an ancestor of ${headSha.slice(0, 12)}; deploying`
            : `could not find served ${served.slice(0, 12)} in the history of ${headSha.slice(0, 12)}; deploying`,
        served,
        rows: [],
      };
    }
    const out = git(cwd, ["diff", "--name-only", "--no-renames", "-z", served, headSha]);
    const paths = out.split("\0").filter(Boolean);
    const result = classifyChanges(paths, () =>
      classifyPackageJsonChange(
        readAt(cwd, served, "package.json"),
        readAt(cwd, headSha, "package.json")
      )
    );
    return { ...result, served };
  } catch (err) {
    return {
      deploy: true,
      reason: `classifier error (${err && err.message ? err.message.split("\n")[0] : err}); deploying`,
      rows: [],
    };
  }
}

function oneLine(s) {
  return String(s).replace(/[\r\n]+/g, " ");
}

/** The $GITHUB_STEP_SUMMARY text for a decision. */
export function summaryMarkdown(result) {
  const lines = [];
  if (result.deploy) {
    lines.push("### Operator instance: deploying", "", oneLine(result.reason), "");
    return lines.join("\n");
  }
  lines.push(
    "### Operator instance deploy skipped",
    "",
    `Not a failure. The instance already serves \`${result.served}\`, and every file changed since then is outside the deployed image, so this run did not wait for CI or redeploy. The next push that touches the image deploys everything since \`${result.served.slice(0, 12)}\`. To deploy anyway, run this workflow by hand (workflow_dispatch always deploys).`,
    "",
    "| Path | Classified as non-image because |",
    "| --- | --- |"
  );
  const LIMIT = 200;
  for (const r of result.rows.slice(0, LIMIT)) {
    lines.push(`| \`${oneLine(r.path).replace(/\|/g, "\\|")}\` | ${r.why} |`);
  }
  if (result.rows.length > LIMIT) lines.push(`| … | ${result.rows.length - LIMIT} more |`);
  lines.push("");
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1] ?? "";
    i++;
  }
  return out;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const log = (m) => console.log(`[classify] ${m}`);
  const result = await decide({
    event: args.event,
    head: args.head || "HEAD",
    servedSha: Object.prototype.hasOwnProperty.call(args, "served-sha")
      ? args["served-sha"]
      : undefined,
    servedUrl: args["served-url"],
    remote: args.remote || "origin",
    fetchOptions: env.CLASSIFY_SERVED_RETRY_DELAY_MS
      ? { retryDelayMs: Number(env.CLASSIFY_SERVED_RETRY_DELAY_MS) }
      : undefined,
    log,
  });
  for (const r of result.rows) log(`${r.deploy ? "DEPLOY" : "skip  "} ${r.path} (${r.why})`);
  log(`deploy=${result.deploy}: ${result.reason}`);
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      `deploy=${result.deploy}\nreason=${oneLine(result.reason)}\n`
    );
  }
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summaryMarkdown(result));
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((err) => {
    // decide() never throws; this is for I/O on the output files. Exiting
    // non-zero fails the step, which skips the deploy steps AND fires the
    // workflow's failure escalation, so it cannot pass as a quiet skip.
    console.error(`[classify] ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}
