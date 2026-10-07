import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";

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
  descriptions: Map<string, string>;
  effectClasses: Map<string, ToolEffectClass>;
  annotationsFor(toolName: string): ToolAnnotations;
}

type ToolDescriptionsFile = {
  tools?: Record<string, string>;
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

/** Load and validate the single source of truth for tool descriptions and risk metadata. */
export function loadToolEffectCatalog(
  yamlPath: string,
  expectedToolNames: readonly string[]
): ToolEffectCatalog {
  const data = yaml.load(readFileSync(yamlPath, "utf-8")) as ToolDescriptionsFile | undefined;
  const descriptions = data?.tools && requireRecord(data.tools, "tools");
  const effectClasses = requireRecord(data?.effect_classes, "effect_classes");
  const overrides = data?.annotation_overrides
    ? requireRecord(data.annotation_overrides, "annotation_overrides")
    : {};

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
    descriptions: new Map(descriptionEntries),
    effectClasses: new Map(
      Object.entries(effectClasses).map(([name, effectClass]) => [
        name,
        effectClass as ToolEffectClass,
      ])
    ),
    annotationsFor(toolName: string): ToolAnnotations {
      const effectClass = effectClasses[toolName] as ToolEffectClass | undefined;
      if (!effectClass) throw new Error(`No effect class declared for MCP tool ${toolName}`);
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
