/**
 * FU-2026-05-004: Turn Summary MCP Apps Rendering — integration tests.
 *
 * Verifies the end-to-end MCP Apps wiring: tool definition advertises
 * _meta.ui.resourceUri pointing at the static turn-summary widget URI, and
 * the URI parser resolves it to the turn-summary widget resource type so
 * readResource can serve self-contained MCP Apps HTML.
 *
 * Does not require DB access — the listResources DB-derived counts are
 * exercised by the broader mcp_resources integration suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { buildSmitheryServerCard } from "../../src/mcp_server_card.js";

const TURN_SUMMARY_WIDGET_RESOURCE_URI = "ui://neotoma/turn-summary";

describe("FU-2026-05-004: Turn Summary MCP Apps wiring", () => {
  let server: NeotomaServer;

  beforeAll(() => {
    server = new NeotomaServer();
  });

  it("parses the turn summary widget URI", () => {
    const parsed = (server as any).parseResourceUri(TURN_SUMMARY_WIDGET_RESOURCE_URI);
    expect(parsed.type).toBe("ui_turn_summary_widget");
  });

  it("advertises the widget on the static server card", () => {
    const card = buildSmitheryServerCard();
    const resources = card.resources as Array<{ uri?: string; mimeType?: string; name?: string }>;
    const widget = resources.find((r) => r.uri === TURN_SUMMARY_WIDGET_RESOURCE_URI);
    expect(widget).toBeDefined();
    expect(widget?.mimeType).toBe("text/html;profile=mcp-app");
    expect(widget?.name).toBe("Turn Summary Widget");
  });

  it("attaches _meta.ui.resourceUri to the neotoma_turn_summary tool definition", () => {
    const card = buildSmitheryServerCard();
    const tools = card.tools as Array<{
      name?: string;
      _meta?: { ui?: { resourceUri?: string }; "openai/outputTemplate"?: string };
    }>;
    const tool = tools.find((t) => t.name === "neotoma_turn_summary");
    expect(tool).toBeDefined();
    expect(tool?._meta?.ui?.resourceUri).toBe(TURN_SUMMARY_WIDGET_RESOURCE_URI);
  });

  it("serves MCP Apps HTML from the widget builder", () => {
    const html = (server as any).buildTurnSummaryWidgetHtml() as string;
    expect(html).toContain("<!doctype html>");
    // Must echo the per-turn payload via postMessage, not URI query params.
    expect(html).toContain("ui/initialize");
    expect(html).toContain("ui/notifications/tool-result");
    // No external network fetches — bundled fonts/CSS only.
    expect(html).not.toMatch(/https?:\/\//);
  });
});
