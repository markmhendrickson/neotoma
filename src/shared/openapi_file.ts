import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OPENAPI_FILENAME = "openapi.yaml";
const OPENAPI_ACTIONS_FILENAME = "openapi_actions.yaml";

function getPackageRootFromModule(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, "..", "..");
}

export function resolveOpenApiPath(): string {
  const fromEnv = process.env.NEOTOMA_OPENAPI_PATH?.trim();
  const candidates = [
    fromEnv || "",
    join(getPackageRootFromModule(), OPENAPI_FILENAME),
    join(process.cwd(), OPENAPI_FILENAME),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`OpenAPI schema not found. Tried: ${candidates.join(", ")}`);
}

export function readOpenApiFile(): string {
  return readFileSync(resolveOpenApiPath(), "utf-8");
}

export function resolveOpenApiActionsPath(): string {
  const root = getPackageRootFromModule();
  const path = join(root, OPENAPI_ACTIONS_FILENAME);
  if (!existsSync(path)) {
    throw new Error(`OpenAPI actions schema not found: ${path}`);
  }
  return path;
}

export function readOpenApiActionsFile(): string {
  return readFileSync(resolveOpenApiActionsPath(), "utf-8");
}
