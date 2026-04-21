import { describe, expect, it } from "vitest";
import { buildSmitheryServerCard } from "../../src/mcp_server_card.js";

describe("buildSmitheryServerCard", () => {
  it("returns serverInfo, tools, and stable resource stubs", () => {
    const card = buildSmitheryServerCard();
    expect(card.serverInfo).toBeDefined();
    expect(typeof (card.serverInfo as { name?: string }).name).toBe("string");
    expect(Array.isArray(card.tools)).toBe(true);
    expect((card.tools as unknown[]).length).toBeGreaterThan(0);
    const first = (card.tools as Array<{ name?: string }>)[0];
    expect(first?.name).toBeTruthy();
    expect(Array.isArray(card.resources)).toBe(true);
    expect(Array.isArray(card.prompts)).toBe(true);
  });
});
