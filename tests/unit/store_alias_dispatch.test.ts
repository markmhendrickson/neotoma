/**
 * Regression test for issue ent_016798e974737e4d7044bb31:
 * store_structured and store_unstructured are documented as deprecated aliases
 * for store, but were missing from the executeTool dispatch switch, causing
 * MethodNotFound errors when invoked via MCP.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverSrc = readFileSync(join(__dirname, "../../src/server.ts"), "utf-8");

describe("executeTool dispatch — store alias coverage", () => {
  it("handles store_structured so callers do not receive MethodNotFound", () => {
    // Verify the switch contains a case for store_structured that falls through to store.
    // The expected pattern is one or both aliases appearing as case statements before "store":
    expect(serverSrc).toMatch(/case\s+"store_structured"\s*:/);
  });

  it("handles store_unstructured so callers do not receive MethodNotFound", () => {
    expect(serverSrc).toMatch(/case\s+"store_unstructured"\s*:/);
  });

  it("alias cases lead to the same handler as 'store'", () => {
    // Verify that store_structured and store_unstructured fall through to the store
    // handler — they appear before the 'store' case with no intervening return/throw,
    // or immediately after grouped together.
    const storeBlock = serverSrc.match(
      /case\s+"store(?:_structured|_unstructured)?"\s*:[\s\S]*?case\s+"parse_file"\s*:/
    );
    expect(storeBlock).not.toBeNull();
    const block = storeBlock![0];
    // All three cases appear; only one return statement (the handler)
    const caseCount = (block.match(/case\s+"store/g) ?? []).length;
    expect(caseCount).toBeGreaterThanOrEqual(3);
    const returnCount = (block.match(/\breturn\s+await\s+this\.store\(/g) ?? []).length;
    expect(returnCount).toBe(1);
  });

  it("contract_mappings.ts defines the same aliases", () => {
    const contractMappings = readFileSync(
      join(__dirname, "../../src/shared/contract_mappings.ts"),
      "utf-8"
    );
    expect(contractMappings).toContain('store_structured: "store"');
    expect(contractMappings).toContain('store_unstructured: "store"');
  });
});
