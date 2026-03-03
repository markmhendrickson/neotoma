import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("MCP stdio output safety", () => {
  it("avoids console.log in schema registry to prevent stdout protocol noise", () => {
    const schemaRegistryPath = resolve(process.cwd(), "src/services/schema_registry.ts");
    const source = readFileSync(schemaRegistryPath, "utf8");
    expect(source.includes("console.log(")).toBe(false);
  });
});
