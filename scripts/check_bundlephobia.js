#!/usr/bin/env node

/**
 * Pre-release check: query Bundlephobia for the published package.
 *
 * - If the package builds on Bundlephobia (200 + size data): pass.
 * - If Bundlephobia returns a build error and package has "browser": false:
 *   pass (expected for Node-only packages).
 * - If Bundlephobia returns a build error and package does not have "browser": false:
 *   fail so you can fix or set "browser": false.
 * - On network/timeout/5xx: fail (re-run or check bundlephobia.com).
 *
 * Usage:
 *   node scripts/check_bundlephobia.js           # check current package.json version
 *   node scripts/check_bundlephobia.js 0.4.0     # check a specific version (e.g. pre-publish)
 *
 * Run before release or after npm publish to catch Bundlephobia build errors.
 * If the request times out, re-run or check https://bundlephobia.com/package/<name> manually.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pkgPath = path.join(repoRoot, "package.json");
const TIMEOUT_MS = 90_000;
const BUNDLEPHOBIA_SIZE_URL = "https://bundlephobia.com/api/size";

function readPackage() {
  const raw = fs.readFileSync(pkgPath, "utf8");
  return JSON.parse(raw);
}

async function fetchWithTimeout(url) {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "neotoma-check-bundlephobia/1.0",
      },
    });
    clearTimeout(timeout);
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      throw new Error(`Bundlephobia request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw e;
  }
}

function main() {
  const pkg = readPackage();
  const name = pkg.name;
  const version = process.argv[2] || pkg.version;
  const isNodeOnly = pkg.browser === false;

  if (!name || !version) {
    console.error("Missing package name or version in package.json");
    process.exit(1);
  }

  const spec = `${name}@${version}`;
  const url = `${BUNDLEPHOBIA_SIZE_URL}?package=${encodeURIComponent(spec)}`;

  console.log("Checking Bundlephobia for", spec, "...");

  fetchWithTimeout(url)
    .then(({ ok, status, body }) => {
      if (ok && body && (body.size != null || body.gzip != null)) {
        console.log("Bundlephobia: OK (package builds; size available)");
        if (body.size != null) console.log("  size:", body.size, "bytes");
        if (body.gzip != null) console.log("  gzip:", body.gzip, "bytes");
        process.exit(0);
      }

      const errorName = body?.error || body?.name || (ok ? null : "HttpError");
      const message = body?.message || body?.errorMessage || body?.error || `HTTP ${status}`;

      if (status === 404 || (body && message && /not found|unknown package/i.test(String(message)))) {
        console.error("Bundlephobia: package version not found:", spec);
        console.error("  Publish the package first, or run this check for an already-published version.");
        process.exit(1);
      }

      const isBuildError =
        errorName === "BuildError" ||
        (typeof message === "string" && message.includes("Failed to build")) ||
        status === 504;
      if (isBuildError) {
        if (status === 504) {
          console.log("Bundlephobia: 504 Gateway Timeout (build timed out on their side)");
        } else {
          console.log("Bundlephobia: BuildError");
          console.log("  Message:", message);
        }
        if (isNodeOnly) {
          console.log("  (Expected for Node-only package; browser: false)");
          process.exit(0);
        }
        console.error("  Fix: add \"browser\": false to package.json if this package is Node-only, or fix the build.");
        process.exit(1);
      }

      if (status === 403) {
        console.error("Bundlephobia: 403 Forbidden (API may block script/CI requests).");
        console.error("  Check manually: https://bundlephobia.com/package/" + encodeURIComponent(spec));
        process.exit(1);
      }

      if (status >= 400) {
        console.error("Bundlephobia: request failed", status, message);
        process.exit(1);
      }

      console.error("Bundlephobia: unexpected response", { ok, status, body });
      process.exit(1);
    })
    .catch((err) => {
      console.error("Bundlephobia check failed:", err.message);
      process.exit(1);
    });
}

main();
