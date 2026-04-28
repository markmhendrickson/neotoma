/**
 * In-process sandbox seeder. Seeds a fixture manifest for a specific pack
 * by spawning the seed_sandbox script as a child process. This avoids
 * importing from scripts/ (which is outside the src/ rootDir).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSandboxPack, DEFAULT_SANDBOX_PACK_ID, type SandboxPack } from "./pack_registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

export interface SeedForSessionOptions {
  packId?: string;
  baseUrl: string;
  bearer?: string;
  targetUserId?: string;
  logger?: (message: string) => void;
}

export async function seedForSession(options: SeedForSessionOptions): Promise<boolean> {
  const packId = options.packId ?? DEFAULT_SANDBOX_PACK_ID;
  const pack: SandboxPack | undefined = getSandboxPack(packId);
  if (!pack) {
    throw new Error(`Unknown sandbox pack: ${packId}`);
  }
  if (pack.seedPolicy === "none") {
    options.logger?.(`[seeder] pack '${packId}' has seedPolicy=none, skipping`);
    return false;
  }

  if (!pack.manifestPath) {
    options.logger?.(`[seeder] pack '${packId}' has no manifestPath, skipping`);
    return false;
  }

  options.logger?.(`[seeder] seeding pack '${packId}' from ${pack.manifestPath}`);

  const scriptPath = path.join(REPO_ROOT, "scripts", "seed_sandbox.ts");
  const args = ["--import", "tsx", scriptPath, "--base-url", options.baseUrl];
  if (options.bearer) {
    args.push("--bearer", options.bearer);
  }

  return new Promise<boolean>((resolve) => {
    const child = spawn("node", args, {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: "pipe",
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      options.logger?.(chunk.toString().trim());
    });

    child.on("close", (code) => {
      if (code !== 0) {
        options.logger?.(`[seeder] seed script exited with code ${code}: ${stderr.slice(0, 500)}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });

    child.on("error", (err) => {
      options.logger?.(`[seeder] failed to spawn seed script: ${err.message}`);
      resolve(false);
    });
  });
}
