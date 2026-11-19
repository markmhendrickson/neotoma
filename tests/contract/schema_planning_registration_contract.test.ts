import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { RegisterSchemaRequestSchema } from "../../src/shared/action_schemas.js";
import { getOpenApiInputSchemaOrThrow } from "../../src/shared/openapi_schema.js";
import { buildToolDefinitions } from "../../src/tool_definitions.js";

// Validate the actual advertised requests with the existing MCP SDK validator,
// independently of the handler's Zod parser; a response schema cannot prove this.
const requests = [
  ["OpenAPI registerSchema", getOpenApiInputSchemaOrThrow("register_schema")],
  [
    "MCP register_schema",
    buildToolDefinitions().find((tool) => tool.name === "register_schema")!.inputSchema,
  ],
] as const;
const validDefinition = {
  fields: { label: { type: "string" } },
  identity_opt_out: "heuristic_canonical_name",
  unrelated_declaration: { retained: true },
};
const request = (definition: unknown) => ({
  entity_type: "synthetic_registration_stratum",
  schema_definition: definition,
  reducer_config: { merge_policies: {} },
});

for (const [surface, schema] of requests) {
  describe(`${surface} planning request parity`, () => {
    const validate = new AjvJsonSchemaValidator().getValidator(schema);
    it("allows omission and valid declarations while retaining other schema declarations", () => {
      for (const definition of [
        validDefinition,
        ...[{ level: -3.5 }, { level: 17, read_only: true }, { level: 0, read_only: false }].map(
          (planning) => ({ ...validDefinition, planning })
        ),
      ]) {
        const value = request(definition);
        expect(validate(value).valid).toBe(true);
        expect(RegisterSchemaRequestSchema.parse(value).schema_definition).toEqual(definition);
      }
    });
    it.each([
      null,
      false,
      {},
      { level: "high" },
      { level: true },
      { level: 17, read_only: "true" },
      { level: 17, unexpected: true },
    ])("rejects malformed planning exactly as the runtime request validator: %j", (planning) => {
      const value = request({ ...validDefinition, planning });
      expect(RegisterSchemaRequestSchema.safeParse(value).success).toBe(false);
      expect(validate(value).valid).toBe(false);
    });
  });
}

describe("planning surface parity CI binding", () => {
  it("selects the real surface suite in the existing build-before-test contract lane", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const command = pkg.scripts["test:contract-parity"] as string;
    expect(command).toMatch(/^vitest run --no-file-parallelism /);
    expect(command.split(/\s+/)).toContain(
      "tests/integration/schema_planning_surface_parity.test.ts"
    );
    const workflow = load(
      readFileSync(new URL("../../.github/workflows/ci_test_lanes.yml", import.meta.url), "utf8")
    ) as any;
    const lane = workflow.jobs.contract_parity;
    const build = lane.steps.findIndex((step: any) => step.run === "npm run build:server");
    const test = lane.steps.findIndex((step: any) => step.run === "npm run test:contract-parity");
    expect(build).toBeGreaterThanOrEqual(0);
    expect(test).toBeGreaterThan(build);
    expect(lane["continue-on-error"]).not.toBe(true);
    expect(lane.steps[test]["continue-on-error"]).not.toBe(true);
  });
});
