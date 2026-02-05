#!/usr/bin/env node
/**
 * Neotoma health check: environment, security, and optional backend checks.
 * Run with: npm run doctor
 * See: docs/operations/health_check.md
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const ENV_PATH = resolve(ROOT, ".env");

if (existsSync(ENV_PATH)) {
  config({ path: ENV_PATH });
}

type Status = "ok" | "fail" | "warn";

function run(): void {
  console.log("\n🔍 Neotoma Health Check\n");

  const results: { name: string; status: Status; message: string }[] = [];

  // Environment: .env exists
  const envExists = existsSync(ENV_PATH);
  results.push({
    name: "Environment",
    status: envExists ? "ok" : "warn",
    message: envExists ? "Config present (.env)" : ".env not found (optional for local defaults)",
  });

  // Backend-specific required vars (when .env exists we could load it; here we use process.env as set by caller)
  const backend = process.env.NEOTOMA_STORAGE_BACKEND ?? "local";
  if (backend === "supabase") {
    const hasSupabase =
      (process.env.DEV_SUPABASE_PROJECT_ID || process.env.DEV_SUPABASE_URL) &&
      process.env.DEV_SUPABASE_SERVICE_KEY;
    results.push({
      name: "Supabase config",
      status: hasSupabase ? "ok" : "fail",
      message: hasSupabase
        ? "DEV_SUPABASE_* set"
        : "Supabase backend requires DEV_SUPABASE_PROJECT_ID (or URL) and DEV_SUPABASE_SERVICE_KEY",
    });
  } else {
    results.push({
      name: "Storage backend",
      status: "ok",
      message: `Backend: ${backend}`,
    });
  }

  // Security: .env should be gitignored
  let gitIgnored = false;
  try {
    execSync("git check-ignore -v .env", { cwd: ROOT, encoding: "utf8" });
    gitIgnored = true;
  } catch {
    // check-ignore exits 1 if file is not ignored
  }
  results.push({
    name: "Security",
    status: gitIgnored || !envExists ? "ok" : "warn",
    message: envExists
      ? gitIgnored
        ? ".env is gitignored"
        : ".env is not gitignored (do not commit it)"
      : "N/A (no .env)",
  });

  // Database / Tables / RLS / Migrations / MCP: placeholder for full implementation
  results.push({
    name: "Database",
    status: "warn",
    message: "Run migrations and check:advisors for full verification",
  });
  results.push({
    name: "MCP",
    status: "warn",
    message: "Run 'npm run dev' to verify server starts",
  });

  // Print
  const symbols: Record<Status, string> = {
    ok: "✅",
    fail: "❌",
    warn: "⚠️ ",
  };
  for (const r of results) {
    console.log(`${symbols[r.status]} ${r.name}: ${r.message}`);
  }

  const failed = results.filter((r) => r.status === "fail");
  const warnings = results.filter((r) => r.status === "warn");
  console.log("");
  if (failed.length > 0) {
    console.log(`Overall: ❌ UNHEALTHY (${failed.length} failure(s))`);
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log(`Overall: ✅ HEALTHY (${warnings.length} warning(s))`);
  } else {
    console.log("Overall: ✅ HEALTHY");
  }
  console.log("");
}

run();
