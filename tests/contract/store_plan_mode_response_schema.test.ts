/**
 * Contract test: REAL plan-mode (`commit: false`) `/store` responses must
 * conform to the response schemas declared in `openapi.yaml`.
 *
 * Why this exists (#2493, #2471 review round 3, arch lens): the plan-mode
 * response reports `source_id: null`, but `StoreUnstructuredResponse.source_id`
 * was declared `type: string` with no `nullable`, so a schema-conformant client
 * had no way to type the value the server actually returns. The property-
 * presence test in `openapi_schema.test.ts` ("declares source_id") could not
 * catch that class: it checks a field exists, not that the real payload fits
 * the declared type.
 *
 * This test drives the actual Express app (the same in-process server
 * `transport_parity_matrix.ts` uses), captures the real response for each
 * plan-mode shape, and validates every declared property of it against the
 * schema in `openapi.yaml`: declared type, `nullable`, `enum`, nested objects
 * and arrays, `$ref` and `allOf`. Undeclared extra properties are tolerated
 * (the response schemas do not set `additionalProperties: false`), matching how
 * a tolerant client reads them.
 *
 * The validator is deliberately small and local rather than a new dependency;
 * the first describe block proves it can fail (null against a non-nullable
 * string, wrong type, bad enum), so a green result on the real responses is
 * not vacuous.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveOpenApiPath } from "../../src/shared/openapi_file.js";
import { callHttp, startOfflineServer, stopServer } from "../helpers/transport_parity_matrix.js";

type Schema = {
  $ref?: string;
  type?: string;
  nullable?: boolean;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  items?: Schema;
  allOf?: Schema[];
  additionalProperties?: boolean | Schema;
};

const spec = load(readFileSync(resolveOpenApiPath(), "utf-8")) as {
  components: { schemas: Record<string, Schema> };
};

function resolveRef(schema: Schema): Schema {
  if (!schema.$ref) return schema;
  const prefix = "#/components/schemas/";
  if (!schema.$ref.startsWith(prefix)) {
    throw new Error(`Unsupported $ref in contract test: ${schema.$ref}`);
  }
  const target = spec.components.schemas[schema.$ref.slice(prefix.length)];
  if (!target) throw new Error(`Unresolved $ref: ${schema.$ref}`);
  return resolveRef(target);
}

/** Returns a list of human-readable violations (empty when `value` conforms). */
function validate(value: unknown, rawSchema: Schema, at = "$"): string[] {
  const schema = resolveRef(rawSchema);
  const errors: string[] = [];

  for (const part of schema.allOf ?? []) {
    errors.push(...validate(value, part, at));
  }

  if (value === null) {
    // OpenAPI `nullable: true` is the only way this spec admits null.
    if (schema.nullable === true) return errors;
    if (schema.type !== undefined) {
      errors.push(`${at}: null is not allowed (declared type ${schema.type}, not nullable)`);
    }
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  switch (schema.type) {
    case "string":
      if (typeof value !== "string") errors.push(`${at}: expected string, got ${typeof value}`);
      break;
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${at}: expected boolean, got ${typeof value}`);
      break;
    case "integer":
      if (!Number.isInteger(value)) errors.push(`${at}: expected integer, got ${String(value)}`);
      break;
    case "number":
      if (typeof value !== "number") errors.push(`${at}: expected number, got ${typeof value}`);
      break;
    case "array":
      if (!Array.isArray(value)) {
        errors.push(`${at}: expected array`);
      } else if (schema.items) {
        value.forEach((item, i) => errors.push(...validate(item, schema.items!, `${at}[${i}]`)));
      }
      break;
    case "object":
      if (typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${at}: expected object`);
      } else {
        for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
          const propValue = (value as Record<string, unknown>)[key];
          if (propValue !== undefined)
            errors.push(...validate(propValue, propSchema, `${at}.${key}`));
        }
      }
      break;
    default:
      break;
  }
  return errors;
}

function expectConforms(value: unknown, schemaName: string): void {
  const errors = validate(value, { $ref: `#/components/schemas/${schemaName}` });
  expect(errors, `response does not conform to ${schemaName}`).toEqual([]);
}

describe("contract-test validator can fail (so a pass on real responses is not vacuous)", () => {
  it("rejects null against a non-nullable string", () => {
    expect(validate(null, { type: "string" })).not.toEqual([]);
  });

  it("accepts null against a nullable string", () => {
    expect(validate(null, { type: "string", nullable: true })).toEqual([]);
  });

  it("rejects a wrong scalar type and an enum miss", () => {
    expect(validate(1, { type: "string" })).not.toEqual([]);
    expect(validate("x", { type: "string", enum: ["reference"] })).not.toEqual([]);
  });

  it("flags a null source_id on a schema that declares it non-nullable", () => {
    const strict: Schema = {
      type: "object",
      properties: { source_id: { type: "string" } },
    };
    expect(validate({ source_id: null }, strict)).not.toEqual([]);
  });
});

describe("StoreUnstructuredResponse / StoreStructuredResponse: plan-mode source_id is declared nullable", () => {
  it.each(["StoreUnstructuredResponse", "StoreStructuredResponse"])(
    "%s.source_id is nullable",
    (name) => {
      const props = spec.components.schemas[name]?.properties ?? {};
      expect(props.source_id?.nullable, `${name}.source_id must be nullable`).toBe(true);
    }
  );
});

describe("real plan-mode /store responses conform to the OpenAPI response schemas", () => {
  let offline: { server: Server; base: string };
  let dir: string;

  beforeAll(async () => {
    offline = await startOfflineServer();
    dir = join(tmpdir(), `neotoma-plan-contract-${randomUUID()}`);
    await mkdir(dir, { recursive: true });
  });

  afterAll(async () => {
    await stopServer(offline.server);
    await rm(dir, { recursive: true, force: true });
  });

  it("inline unstructured (file_content + commit:false)", async () => {
    const res = await callHttp(offline.base, "/store", {
      file_content: Buffer.from(`plan contract inline ${randomUUID()}`).toString("base64"),
      mime_type: "text/plain",
      commit: false,
    });
    expect(res.status).toBe(200);
    expect(res.json.commit).toBe(false);
    expect(res.json.source_id).toBeNull();
    expectConforms(res.json, "StoreUnstructuredResponse");
  });

  it("reference unstructured (source_storage:reference + commit:false)", async () => {
    const file = join(dir, `ref-${randomUUID()}.txt`);
    await writeFile(file, `plan contract reference ${randomUUID()}`);
    const res = await callHttp(offline.base, "/store", {
      file_path: file,
      source_storage: "reference",
      commit: false,
    });
    expect(res.status).toBe(200);
    expect(res.json.commit).toBe(false);
    expect(res.json.source_id).toBeNull();
    expect(res.json.storage_mode).toBe("reference");
    expectConforms(res.json, "StoreUnstructuredResponse");
  });

  it("structured (entities + commit:false)", async () => {
    const res = await callHttp(offline.base, "/store", {
      idempotency_key: `plan-contract-structured-${randomUUID()}`,
      entities: [{ entity_type: "plan_mode_test_note", title: `plan contract ${randomUUID()}` }],
      commit: false,
    });
    expect(res.status).toBe(200);
    expect(res.json.commit).toBe(false);
    expect(res.json.source_id).toBeNull();
    expectConforms(res.json, "StoreStructuredResponse");
  });

  it("combined entities + file (commit:false) conforms to StoreResponse", async () => {
    const res = await callHttp(offline.base, "/store", {
      idempotency_key: `plan-contract-combined-${randomUUID()}`,
      entities: [{ entity_type: "plan_mode_test_note", title: `plan contract ${randomUUID()}` }],
      file_content: Buffer.from(`plan contract combined ${randomUUID()}`).toString("base64"),
      mime_type: "text/plain",
      commit: false,
    });
    expect(res.status).toBe(200);
    const structured = res.json.structured as Record<string, unknown>;
    const unstructured = res.json.unstructured as Record<string, unknown>;
    expect(structured?.source_id).toBeNull();
    expect(unstructured?.source_id).toBeNull();
    expectConforms(res.json, "StoreResponse");
  });
});
