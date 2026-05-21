/**
 * FU-2026-05-004: Turn Summary MCP Apps Rendering — unit tests.
 *
 * Covers:
 *  - buildToolDefinitions() attaches _meta.ui.resourceUri to
 *    neotoma_turn_summary when the URI is provided, and omits it when absent.
 *  - parseResourceUri() routes `ui://neotoma/turn-summary` to the
 *    ui_turn_summary_widget resource type.
 *  - buildTurnSummaryWidgetHtml() emits a self-contained MCP Apps HTML
 *    document with the required postMessage handlers and status rendering
 *    hooks.
 *  - buildSmitheryServerCard() advertises the turn summary widget under both
 *    the resources list and the neotoma_turn_summary tool _meta.
 */
import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../../src/tool_definitions.js";
import { NeotomaServer } from "../../src/server.js";
import { buildSmitheryServerCard } from "../../src/mcp_server_card.js";

const TURN_SUMMARY_WIDGET_RESOURCE_URI = "ui://neotoma/turn-summary";

describe("neotoma_turn_summary MCP Apps widget", () => {
  describe("buildToolDefinitions()", () => {
    it("attaches _meta.ui.resourceUri to neotoma_turn_summary when URI is provided", () => {
      const tools = buildToolDefinitions(
        undefined,
        "ui://neotoma/timeline_widget",
        TURN_SUMMARY_WIDGET_RESOURCE_URI
      );
      const turnSummary = tools.find((t) => t.name === "neotoma_turn_summary");
      expect(turnSummary).toBeDefined();
      const meta = turnSummary?._meta as
        | { ui?: { resourceUri?: string }; "openai/outputTemplate"?: string }
        | undefined;
      expect(meta?.ui?.resourceUri).toBe(TURN_SUMMARY_WIDGET_RESOURCE_URI);
      expect(meta?.["openai/outputTemplate"]).toBe(TURN_SUMMARY_WIDGET_RESOURCE_URI);
    });

    it("omits _meta on neotoma_turn_summary when URI is not provided", () => {
      const tools = buildToolDefinitions(undefined, "ui://neotoma/timeline_widget");
      const turnSummary = tools.find((t) => t.name === "neotoma_turn_summary");
      expect(turnSummary).toBeDefined();
      expect(turnSummary?._meta).toBeUndefined();
    });

    it("keeps timeline widget _meta independent of turn summary _meta", () => {
      const tools = buildToolDefinitions(
        undefined,
        "ui://neotoma/timeline_widget",
        TURN_SUMMARY_WIDGET_RESOURCE_URI
      );
      const timeline = tools.find((t) => t.name === "list_timeline_events");
      const meta = timeline?._meta as { ui?: { resourceUri?: string } } | undefined;
      expect(meta?.ui?.resourceUri).toBe("ui://neotoma/timeline_widget");
    });
  });

  describe("parseResourceUri()", () => {
    it("parses ui://neotoma/turn-summary to ui_turn_summary_widget", () => {
      const server = new NeotomaServer();
      const parsed = (server as any).parseResourceUri(TURN_SUMMARY_WIDGET_RESOURCE_URI);
      expect(parsed.type).toBe("ui_turn_summary_widget");
    });

    it("rejects ui://other/turn-summary", () => {
      const server = new NeotomaServer();
      expect(() => (server as any).parseResourceUri("ui://other/turn-summary")).toThrow();
    });

    it("rejects ui://neotoma/turn-summary with extra path segments", () => {
      const server = new NeotomaServer();
      expect(() =>
        (server as any).parseResourceUri("ui://neotoma/turn-summary/extra")
      ).toThrow();
    });
  });

  describe("buildTurnSummaryWidgetHtml()", () => {
    const html = (new NeotomaServer() as any).buildTurnSummaryWidgetHtml() as string;

    it("returns a string", () => {
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    });

    it("is a self-contained HTML document", () => {
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("</html>");
    });

    it("listens for ui/initialize postMessages", () => {
      expect(html).toContain("ui/initialize");
    });

    it("listens for ui/notifications/tool-result postMessages", () => {
      expect(html).toContain("ui/notifications/tool-result");
    });

    it("renders status counts (stored, retrieved, issues)", () => {
      expect(html).toMatch(/stored/i);
      expect(html).toMatch(/retrieved/i);
      expect(html).toMatch(/issues/i);
    });

    it("supports color-scheme light dark", () => {
      expect(html).toContain("color-scheme: light dark");
    });

    it("does not load external network resources (no http(s):// references)", () => {
      // Allow the widget itself to mention "neotoma://issues" for the consent
      // link; that is a custom scheme handled by the host, not a network fetch.
      const externalUrls = html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
      expect(externalUrls).toEqual([]);
    });

    it("includes a consent prompt branch for issues > 0", () => {
      expect(html).toMatch(/flagged this turn/i);
    });
  });

  describe("buildSmitheryServerCard()", () => {
    it("advertises the turn summary widget under resources", () => {
      const card = buildSmitheryServerCard();
      const resources = card.resources as Array<{ uri?: string; name?: string; mimeType?: string }>;
      const widget = resources.find((r) => r.name === "Turn Summary Widget");
      expect(widget?.uri).toBe(TURN_SUMMARY_WIDGET_RESOURCE_URI);
      expect(widget?.mimeType).toBe("text/html;profile=mcp-app");
    });

    it("attaches _meta.ui.resourceUri to neotoma_turn_summary tool", () => {
      const card = buildSmitheryServerCard();
      const tools = card.tools as Array<{
        name?: string;
        _meta?: { ui?: { resourceUri?: string }; "openai/outputTemplate"?: string };
      }>;
      const tool = tools.find((t) => t.name === "neotoma_turn_summary");
      expect(tool?._meta?.ui?.resourceUri).toBe(TURN_SUMMARY_WIDGET_RESOURCE_URI);
      expect(tool?._meta?.["openai/outputTemplate"]).toBe(TURN_SUMMARY_WIDGET_RESOURCE_URI);
    });
  });
});
