import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as yaml from "js-yaml";
import { resolveNeotomaPackageRoot } from "../mcp_instruction_doc.js";

/** Catalog location relative to a Neotoma root (source checkout or installed package). */
export const TOOL_CATALOG_SEGMENTS = [
  "docs",
  "developer",
  "mcp",
  "tool_descriptions.yaml",
] as const;

/** Repo-relative path of the catalog, as shipped in the npm package and the image. */
export const TOOL_CATALOG_RELATIVE_PATH = TOOL_CATALOG_SEGMENTS.join("/");

/**
 * The product-level effect of a tool. This complements the MCP risk hints:
 * effect classes are a Neotoma vocabulary while annotations are protocol hints.
 */
export type ToolEffectClass = "read" | "write" | "external";

export type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
};

export interface ToolEffectCatalog {
  /** Absolute path of the catalog file these entries were read from. */
  sourcePath: string;
  descriptions: Map<string, string>;
  /** Human-readable display name per tool (MCP `Tool.title`). */
  titles: Map<string, string>;
  effectClasses: Map<string, ToolEffectClass>;
  annotationsFor(toolName: string): ToolAnnotations;
}

type ToolDescriptionsFile = {
  tools?: Record<string, string>;
  titles?: Record<string, string>;
  effect_classes?: Record<string, string>;
  annotation_overrides?: Record<string, Partial<ToolAnnotations>>;
};

const EFFECT_CLASSES = new Set<ToolEffectClass>(["read", "write", "external"]);
const ANNOTATION_KEYS = new Set<keyof ToolAnnotations>([
  "readOnlyHint",
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
]);

/**
 * Conservative protocol-native defaults. Individual overrides may only make a
 * stronger claim after the corresponding handler's side effects are known.
 *
 * MCP defines destructive/idempotent hints only for tools that write. We omit
 * them from read-only tools rather than making semantically meaningless claims.
 */
function annotationsForEffectClass(effectClass: ToolEffectClass): ToolAnnotations {
  switch (effectClass) {
    case "read":
      return { readOnlyHint: true, openWorldHint: false };
    case "write":
      return {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      };
    case "external":
      return {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      };
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`tool_descriptions.yaml requires an object at ${field}`);
  }
  return value as Record<string, unknown>;
}

function validateToolSet(
  field: string,
  entries: Record<string, unknown>,
  expectedToolNames: readonly string[]
): void {
  const expected = new Set(expectedToolNames);
  const unknown = Object.keys(entries).filter((name) => !expected.has(name));
  const missing = expectedToolNames.filter((name) => !(name in entries));
  if (unknown.length || missing.length) {
    throw new Error(
      `tool_descriptions.yaml ${field} must match the MCP tool inventory` +
        `${missing.length ? `; missing: ${missing.join(", ")}` : ""}` +
        `${unknown.length ? `; unknown: ${unknown.join(", ")}` : ""}`
    );
  }
}

/**
 * Load and validate the single source of truth for tool descriptions and risk
 * metadata. Every failure names the exact file that was read, so an operator
 * can tell a stale or foreign catalog from a broken install.
 */
export function loadToolEffectCatalog(
  yamlPath: string,
  expectedToolNames: readonly string[]
): ToolEffectCatalog {
  try {
    return parseToolEffectCatalog(yamlPath, expectedToolNames);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Neotoma cannot start its MCP server: the tool catalog at ${yamlPath} is not ` +
        `valid for this build (${reason}). The catalog must match the running ` +
        `version's tool inventory; reinstall the neotoma package, or point ` +
        `NEOTOMA_PROJECT_ROOT at a checkout of the same version.`
    );
  }
}

function parseToolEffectCatalog(
  yamlPath: string,
  expectedToolNames: readonly string[]
): ToolEffectCatalog {
  const data = yaml.load(readFileSync(yamlPath, "utf-8")) as ToolDescriptionsFile | undefined;
  const descriptions = data?.tools && requireRecord(data.tools, "tools");
  const effectClasses = requireRecord(data?.effect_classes, "effect_classes");
  const titles = requireRecord(data?.titles, "titles");
  const overrides = data?.annotation_overrides
    ? requireRecord(data.annotation_overrides, "annotation_overrides")
    : {};

  validateToolSet("titles", titles, expectedToolNames);
  for (const [name, value] of Object.entries(titles)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`tool_descriptions.yaml titles.${name} must be a non-empty string`);
    }
  }
  validateToolSet("effect_classes", effectClasses, expectedToolNames);
  for (const [name, value] of Object.entries(effectClasses)) {
    if (typeof value !== "string" || !EFFECT_CLASSES.has(value as ToolEffectClass)) {
      throw new Error(
        `tool_descriptions.yaml effect_classes.${name} must be read, write, or external`
      );
    }
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (!expectedToolNames.includes(name)) {
      throw new Error(`tool_descriptions.yaml annotation_overrides has unknown tool ${name}`);
    }
    const annotation = requireRecord(value, `annotation_overrides.${name}`);
    for (const [key, hint] of Object.entries(annotation)) {
      if (!ANNOTATION_KEYS.has(key as keyof ToolAnnotations) || typeof hint !== "boolean") {
        throw new Error(
          `tool_descriptions.yaml annotation_overrides.${name}.${key} must be a boolean MCP hint`
        );
      }
    }
  }

  const descriptionEntries: Array<[string, string]> = descriptions
    ? Object.entries(descriptions).flatMap(([name, description]) =>
        typeof description === "string" ? [[name, description] as [string, string]] : []
      )
    : [];

  return {
    sourcePath: yamlPath,
    descriptions: new Map(descriptionEntries),
    titles: new Map(Object.entries(titles).map(([name, title]) => [name, String(title).trim()])),
    effectClasses: new Map(
      Object.entries(effectClasses).map(([name, effectClass]) => [
        name,
        effectClass as ToolEffectClass,
      ])
    ),
    annotationsFor(toolName: string): ToolAnnotations {
      const effectClass = effectClasses[toolName] as ToolEffectClass | undefined;
      if (!effectClass) {
        throw new Error(`No effect class declared for MCP tool ${toolName} in ${yamlPath}`);
      }
      const annotations: ToolAnnotations = {
        ...annotationsForEffectClass(effectClass),
        ...(overrides[toolName] as Partial<ToolAnnotations> | undefined),
      };
      if (annotations.readOnlyHint) {
        // The protocol defines these only for mutators. An external probe may
        // still be read-only, so do not inherit the external default here.
        delete annotations.destructiveHint;
        delete annotations.idempotentHint;
      }
      return annotations;
    },
  };
}

/**
 * Find the catalog under the first root that has it, in the order given.
 *
 * Throws one clear startup error naming the file and every place searched,
 * rather than a raw ENOENT, because the catalog is fail-closed by design:
 * without it the server cannot advertise titles or permission hints.
 */
export function resolveToolCatalogPath(roots: readonly string[]): string {
  const searched: string[] = [];
  for (const root of roots) {
    const candidate = join(resolve(root), ...TOOL_CATALOG_SEGMENTS);
    if (searched.includes(candidate)) continue;
    searched.push(candidate);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Neotoma cannot start its MCP server: the tool catalog ${TOOL_CATALOG_RELATIVE_PATH} ` +
      `is missing. It declares every tool's title and permission hints, and the server ` +
      `refuses to advertise tools without it. Searched: ${searched.join(", ")}. ` +
      `Reinstall the neotoma package, or set NEOTOMA_PROJECT_ROOT to a Neotoma checkout.`
  );
}

/**
 * Load the catalog that ships with the running code.
 *
 * The running package's own root is searched FIRST. The catalog is versioned
 * data tied to the compiled tool inventory (both directions are checked), so a
 * copy from any other version fails validation. The configured project root
 * (cwd, NEOTOMA_PROJECT_ROOT, or a CLI `repo_root`) can be a checkout at a
 * different version, and searching it first would let that stale file shadow
 * the package's matching copy and stop the server. The project root is only a
 * fallback; in a source run the two roots are the same directory anyway.
 */
export function loadInstalledToolEffectCatalog(
  projectRoot: string,
  expectedToolNames: readonly string[]
): ToolEffectCatalog {
  return loadToolEffectCatalog(
    resolveToolCatalogPath([resolveNeotomaPackageRoot(), projectRoot]),
    expectedToolNames
  );
}
