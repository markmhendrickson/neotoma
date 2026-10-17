/** Real built generic CLI requests for explicitly declared replay steps. */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { requireOwnedCliFixture } from "../isolated_server.js";
import type { DriverInvocation, ToolCall } from "../types.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const CLI = join(ROOT, "dist/cli/index.js");
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Only earlier, successful real CLI results may supply scalar input values. */
export function resolveCliResultReferences(input: unknown, prior: readonly ToolCall[]): unknown {
  function visit(value: unknown, depth = 0): unknown {
    if (depth > 64) throw new Error("CLI input nesting exceeds replay bound");
    if (Array.isArray(value)) return value.map((item) => visit(item, depth + 1));
    if (!record(value)) return value;
    if (own(value, "$result")) {
      const ref = value.$result;
      if (
        Object.keys(value).length !== 1 ||
        !record(ref) ||
        Object.keys(ref).length !== 2 ||
        !own(ref, "call") ||
        !own(ref, "path") ||
        !Number.isSafeInteger(ref.call) ||
        (ref.call as number) < 0 ||
        (ref.call as number) >= prior.length ||
        !Array.isArray(ref.path) ||
        ref.path.length === 0 ||
        ref.path.length > 64
      ) {
        throw new Error("Invalid prior CLI result reference");
      }
      const source = prior[ref.call as number];
      if (
        source.transport !== "cli" ||
        source.error ||
        !record(source.output) ||
        source.output.exit_code !== 0
      ) {
        throw new Error("CLI result reference requires an earlier successful CLI step");
      }
      let result: unknown = source.output;
      for (const key of ref.path) {
        if (
          !(
            typeof key === "string" ||
            (typeof key === "number" && Number.isSafeInteger(key) && key >= 0)
          ) ||
          forbiddenKeys.has(String(key)) ||
          result === null ||
          typeof result !== "object" ||
          !own(result, key)
        ) {
          throw new Error("CLI result reference path does not name an own value");
        }
        result = (result as Record<string, unknown>)[key];
      }
      if (result !== null && !["string", "number", "boolean"].includes(typeof result)) {
        throw new Error("CLI result reference must resolve to a scalar");
      }
      return result;
    }
    const resolved: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) throw new Error("Unsafe CLI input key");
      resolved[key] = visit(child, depth + 1);
    }
    return resolved;
  }
  return visit(input);
}

export async function replayCliRequest(
  invocation: DriverInvocation,
  call: ToolCall,
  prior: readonly ToolCall[]
): Promise<{ output?: unknown; error?: string }> {
  let profile: string | undefined;
  try {
    if (
      call.transport !== "cli" ||
      (call.omit_auth !== undefined && typeof call.omit_auth !== "boolean") ||
      Object.keys(call).some(
        (key) =>
          !["transport", "omit_auth", "name", "input", "output", "error", "sequence"].includes(key)
      )
    ) {
      throw new Error("Unsupported CLI replay transport or authentication selector");
    }
    const dataDir = requireOwnedCliFixture(
      invocation.isolatedServer,
      invocation.neotomaBaseUrl,
      invocation.neotomaToken
    );
    const { getOpenApiOperationMapping } = await import(
      pathToFileURL(join(ROOT, "dist/shared/contract_mappings.js")).href
    );
    if (typeof call.name !== "string" || !getOpenApiOperationMapping(call.name)) {
      throw new Error("Unknown built OpenAPI operationId for CLI replay");
    }
    const input = resolveCliResultReferences(call.input, prior);
    if (!record(input)) throw new Error("CLI request params must be an object");
    profile = mkdtempSync(join(dataDir, "cli-replay-"));
    // Existing NEOTOMA_PROJECT_ROOT recognizes a package root. This empty
    // nonce root prevents both module-root dotenv and user config discovery.
    writeFileSync(join(profile, "package.json"), JSON.stringify({ name: "neotoma" }), {
      mode: 0o600,
    });
    mkdirSync(join(profile, ".config/neotoma"), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(profile, ".config/neotoma/config.json"),
      JSON.stringify({ project_root: profile, repo_root: profile }),
      { mode: 0o600 }
    );
    const env: NodeJS.ProcessEnv = {
      HOME: profile,
      USERPROFILE: profile,
      TMPDIR: profile,
      NODE_ENV: "test",
      NEOTOMA_ENV: "test",
      NEOTOMA_PROJECT_ROOT: profile,
      NEOTOMA_DATA_DIR: dataDir,
      NEOTOMA_BEARER_TOKEN: invocation.neotomaToken,
      NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
    };
    const args = [
      CLI,
      "--no-log-file",
      "--json",
      "--base-url",
      invocation.neotomaBaseUrl,
      "request",
      "--operation",
      call.name,
      "--params",
      JSON.stringify(input),
    ];
    if (call.omit_auth) args.push("--skip-auth");
    let stdout: string;
    let stderr: string;
    let exitCode = 0;
    try {
      ({ stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
        (resolveChild, reject) => {
          execFile(
            process.execPath,
            args,
            {
              cwd: profile,
              env,
              timeout: Math.min(invocation.timeoutMs ?? 30_000, 30_000),
              maxBuffer: 8 * 1024 * 1024,
            },
            (error, out, err) =>
              error
                ? reject(Object.assign(error, { stdout: out, stderr: err }))
                : resolveChild({ stdout: out, stderr: err })
          );
        }
      ));
    } catch (error) {
      const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string };
      if (typeof failure.code !== "number") {
        return {
          output: { exit_code: null, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" },
          error: "CLI child did not complete normally",
        };
      }
      exitCode = failure.code;
      stdout = failure.stdout ?? "";
      stderr = failure.stderr ?? "";
    }
    // A non-JSON/missing response is never replaced by cassette output.
    let response: unknown;
    try {
      response = JSON.parse(exitCode === 0 ? stdout.trim() : stderr.trim());
    } catch {
      return {
        output: { exit_code: exitCode, stdout, stderr },
        error: "CLI child did not return its declared JSON envelope",
      };
    }
    return {
      output: { exit_code: exitCode, response },
      ...(exitCode === 0 ? {} : { error: `CLI request exited ${exitCode}` }),
    };
  } catch (error) {
    return { error: (error as Error).message };
  } finally {
    if (profile) rmSync(profile, { recursive: true, force: true });
  }
}
