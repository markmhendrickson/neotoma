/**
 * HTTP-edge request-body validator for closed request shapes.
 *
 * Reads `openapi.yaml` once at module load, walks every request body whose
 * top-level schema (or referenced component) declares
 * `additionalProperties: false`, and builds a per-operation allow-list of
 * top-level field names. On each matching request, any extra top-level field
 * in the JSON body causes a 400 with the canonical error code
 * `ERR_UNKNOWN_FIELD` and the offending JSON path in `details`.
 *
 * Scope:
 *   - Only enforces at the top level of the JSON request body. Nested
 *     `additionalProperties: false` schemas are not traversed here; Zod +
 *     handler-level validation cover deeper shapes. Top-level is where the
 *     v0.5.0 `attributes`-nested regression would have been caught.
 *   - Only enforces on closed shapes. Shapes without
 *     `additionalProperties: false` (e.g. intentionally open `entities[]`
 *     payloads inside /store) are left alone.
 *
 * Home: `docs/subsystems/errors.md` § `ERR_UNKNOWN_FIELD` and
 * `docs/architecture/openapi_contract_flow.md` § Legacy-payload corpus.
 */

import type express from "express";
import yaml from "js-yaml";
import { readOpenApiFile } from "../shared/openapi_file.js";

type JsonObject = Record<string, unknown>;

interface ClosedShape {
  methodPath: string; // e.g. "POST /store"
  pathPattern: RegExp;
  method: string;
  allowedFields: Set<string>;
}

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];

function resolveRef(schema: unknown, root: JsonObject): unknown {
  if (!schema || typeof schema !== "object") return schema;
  const s = schema as JsonObject;
  const ref = s["$ref"];
  if (typeof ref === "string" && ref.startsWith("#/")) {
    const parts = ref.replace(/^#\//, "").split("/");
    let cur: unknown = root;
    for (const p of parts) {
      if (cur && typeof cur === "object") {
        cur = (cur as JsonObject)[p];
      } else {
        return schema;
      }
    }
    return cur ?? schema;
  }
  return schema;
}

function pathPatternToRegex(openApiPath: string): RegExp {
  const escaped = openApiPath.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\\\{([^/}]+)\\\}/g, "[^/]+");
  return new RegExp(`^${pattern}$`);
}

function collectClosedShapes(): ClosedShape[] {
  const spec = yaml.load(readOpenApiFile()) as JsonObject;
  const paths = (spec.paths ?? {}) as JsonObject;
  const shapes: ClosedShape[] = [];

  for (const openApiPath of Object.keys(paths)) {
    const pathObject = paths[openApiPath] as JsonObject | undefined;
    if (!pathObject || typeof pathObject !== "object") continue;
    for (const method of HTTP_METHODS) {
      const op = pathObject[method] as JsonObject | undefined;
      if (!op) continue;
      const requestBody = op.requestBody as JsonObject | undefined;
      if (!requestBody) continue;
      const resolvedBody = resolveRef(requestBody, spec) as JsonObject;
      const content = resolvedBody?.content as JsonObject | undefined;
      const appJson = content?.["application/json"] as JsonObject | undefined;
      if (!appJson?.schema) continue;
      const schema = resolveRef(appJson.schema, spec) as JsonObject;
      if (!schema || typeof schema !== "object") continue;
      if (schema.additionalProperties !== false) continue;

      const props = (schema.properties ?? {}) as JsonObject;
      const allowedFields = new Set<string>(Object.keys(props));
      const methodUpper = method.toUpperCase();
      shapes.push({
        methodPath: `${methodUpper} ${openApiPath}`,
        method: methodUpper,
        pathPattern: pathPatternToRegex(openApiPath),
        allowedFields,
      });
    }
  }

  return shapes;
}

let CACHED_SHAPES: ClosedShape[] | null = null;

function getClosedShapes(): ClosedShape[] {
  if (CACHED_SHAPES) return CACHED_SHAPES;
  try {
    CACHED_SHAPES = collectClosedShapes();
  } catch (err) {
    // Fail open rather than crashing the server; log and continue.
    // eslint-disable-next-line no-console
    console.error("[unknownFieldsGuard] Failed to load openapi.yaml; guard disabled.", err);
    CACHED_SHAPES = [];
  }
  return CACHED_SHAPES;
}

function findShapeFor(method: string, urlPath: string): ClosedShape | null {
  const shapes = getClosedShapes();
  for (const shape of shapes) {
    if (shape.method !== method) continue;
    if (shape.pathPattern.test(urlPath)) return shape;
  }
  return null;
}

/**
 * Returns the list of unknown top-level keys the body contains relative to
 * `allowed`. Exported for test use.
 */
export function findUnknownFields(body: unknown, allowed: Set<string>): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body as JsonObject).filter((k) => !allowed.has(k));
}

export function unknownFieldsGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    next();
    return;
  }
  const method = req.method?.toUpperCase() ?? "";
  const urlPath = req.path;
  const shape = findShapeFor(method, urlPath);
  if (!shape) {
    next();
    return;
  }

  const unknown = findUnknownFields(req.body, shape.allowedFields);
  if (unknown.length === 0) {
    next();
    return;
  }

  res.status(400).json({
    error_code: "ERR_UNKNOWN_FIELD",
    message: `Request body contains field(s) not declared by ${shape.methodPath}.`,
    details: {
      unknown_fields: unknown,
      json_paths: unknown.map((field) => `$.${field}`),
      allowed_fields: Array.from(shape.allowedFields).sort(),
      operation: shape.methodPath,
    },
    timestamp: new Date().toISOString(),
  });
}

/** Test-only hook: drop the cached shape table so a new openapi.yaml is re-read. */
export function _resetUnknownFieldsGuardCache(): void {
  CACHED_SHAPES = null;
}
