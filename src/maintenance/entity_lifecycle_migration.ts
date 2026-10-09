/** Internal offline entry point. Recoverable WIP: preview/verify remain unavailable. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const TOP_LEVEL = [
  "version",
  "candidate",
  "target",
  "expected_before",
  "backup",
  "maintenance",
  "action_binding",
  "expected_after",
  "evidence",
].sort();
export class LifecycleExecutorRefused extends Error {
  constructor(readonly category: string) {
    super(category);
  }
}
export function parseLifecycleExecutorArguments(args: readonly string[]): {
  manifest: string;
  mode: "preview" | "verify" | "apply";
  output: string;
} {
  const fields: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (
      !["--manifest", "--mode", "--output"].includes(key) ||
      key in fields ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new LifecycleExecutorRefused("arguments_invalid");
    fields[key] = args[i + 1];
  }
  if (
    Object.keys(fields).length !== 3 ||
    !["preview", "verify", "apply"].includes(fields["--mode"])
  )
    throw new LifecycleExecutorRefused("arguments_invalid");
  return {
    manifest: fields["--manifest"],
    mode: fields["--mode"] as "preview" | "verify" | "apply",
    output: fields["--output"],
  };
}
export async function runLifecycleExecutor(args: readonly string[]): Promise<never> {
  const parsed = parseLifecycleExecutorArguments(args);
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(parsed.manifest, "utf8"));
  } catch {
    throw new LifecycleExecutorRefused("manifest_invalid");
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(TOP_LEVEL) ||
    (manifest as Record<string, unknown>).version !== "entity_lifecycle_executor_v1"
  )
    throw new LifecycleExecutorRefused("manifest_invalid");
  // EMPTY supported-method set. No database/driver/config/service imports precede this refusal.
  if (parsed.mode === "apply") throw new LifecycleExecutorRefused("action_method_unavailable");
  // Next implementation slice must add closed nested manifests and complete target/evidence checks.
  throw new LifecycleExecutorRefused("execution_preparation_incomplete");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLifecycleExecutor(process.argv.slice(2)).catch((error: unknown) => {
    const category = error instanceof LifecycleExecutorRefused ? error.category : "executor_failed";
    process.stderr.write(JSON.stringify({ category, reference: randomUUID() }) + "\n");
    process.exitCode = 1;
  });
}
