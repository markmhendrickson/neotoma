/**
 * In-process sandbox seeder. Seeds a fixture manifest for a specific pack by
 * spawning the seed_sandbox entrypoint as a child process. Spawning (rather
 * than importing) keeps the `src/` tsc rootDir clean — `scripts/` compiles
 * separately to `dist/scripts/` via tsconfig.scripts.json.
 *
 * In a built image the compiled `dist/scripts/seed_sandbox.js` is run with
 * plain `node`; in a dev checkout (no dist yet) it falls back to running the
 * TypeScript source via `tsx`. The pack's manifest is passed with `--manifest`
 * and the per-session bearer via the NEOTOMA_SANDBOX_BEARER env var (which is
 * what the seed script reads — a `--bearer` flag is NOT parsed by it).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

export interface SeedCommand {
  command: string;
  args: string[];
}

/**
 * Resolve how to invoke the seed entrypoint. Prefers the compiled
 * `dist/scripts/seed_sandbox.js` (present in built images and after
 * `npm run build`); falls back to running the TS source via `tsx` for dev
 * checkouts where dist has not been built. Pure + exported for testing.
 */
export function buildSeedCommand(params: {
  baseUrl: string;
  manifestPath?: string | null;
  repoRoot?: string;
  nodeExecPath?: string;
  distExists?: boolean;
}): SeedCommand {
  const repoRoot = params.repoRoot ?? REPO_ROOT;
  const node = params.nodeExecPath ?? process.execPath;
  const distScript = path.join(repoRoot, "dist", "scripts", "seed_sandbox.js");
  const srcScript = path.join(repoRoot, "scripts", "seed_sandbox.ts");
  const useDist = params.distExists ?? existsSync(distScript);

  const args = useDist
    ? [distScript, "--base-url", params.baseUrl]
    : ["--import", "tsx", srcScript, "--base-url", params.baseUrl];

  if (params.manifestPath) {
    args.push("--manifest", params.manifestPath);
  }
  return { command: node, args };
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

  const { command, args } = buildSeedCommand({
    baseUrl: options.baseUrl,
    manifestPath: pack.manifestPath,
  });

  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        // The seed script reads the bearer from this env var, not a flag.
        ...(options.bearer ? { NEOTOMA_SANDBOX_BEARER: options.bearer } : {}),
      },
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
