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

  it("advertises the timeline widget with an MCP Apps UI URI", () => {
    const card = buildSmitheryServerCard();
    const resources = card.resources as Array<{ uri?: string; name?: string }>;
    const timelineResource = resources.find((resource) => resource.name === "Timeline Widget");
    expect(timelineResource?.uri).toBe("ui://neotoma/timeline_widget");

    const tools = card.tools as Array<{
      name?: string;
      _meta?: {
        ui?: { resourceUri?: string };
        "openai/outputTemplate"?: string;
      };
    }>;
    const timelineTool = tools.find((tool) => tool.name === "list_timeline_events");
    expect(timelineTool?._meta?.ui?.resourceUri).toBe("ui://neotoma/timeline_widget");
    expect(timelineTool?._meta?.["openai/outputTemplate"]).toBe("ui://neotoma/timeline_widget");
  });
});
