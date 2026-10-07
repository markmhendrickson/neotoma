/**
 * MCP Apps widgets: drive the served HTML through a simulated host.
 *
 * The previous version of this suite only checked that the string
 * "ui/initialize" appeared in the HTML, so it passed while the widgets never
 * started the handshake and therefore never received data on any host. These
 * tests load each widget in a DOM, act as the host (the iframe's parent), and
 * follow the MCP Apps sequence:
 *
 *   View → ui/initialize (request)           Host → result
 *   View → ui/notifications/initialized      View → ui/notifications/size-changed
 *   Host → ui/notifications/tool-result (params = CallToolResult)
 *   View → ui/open-link (request) when a link is activated
 *
 * A widget that skips the handshake fails the first assertion; one that reads
 * `params.result` instead of `params.structuredContent` renders nothing and
 * fails the rendering assertions.
 */
import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { NeotomaServer } from "../../src/server.js";
import { buildSmitheryServerCard } from "../../src/mcp_server_card.js";
import {
  buildTurnSummaryCard,
  renderTurnSummaryFallbackText,
} from "../../src/services/turn_summary_view.js";
import { MCP_APPS_PROTOCOL_VERSION } from "../../src/services/mcp_app_bridge.js";

const TURN_SUMMARY_WIDGET_RESOURCE_URI = "ui://neotoma/turn-summary";

type JsonRpc = {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

/** Load widget HTML with a fake parent window that records what the View posts. */
function mountWidget(html: string) {
  const sent: JsonRpc[] = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      const host = { postMessage: (message: JsonRpc) => sent.push(message) };
      Object.defineProperty(window, "parent", { value: host, configurable: true });
    },
  });
  const { window } = dom;
  const hostSend = (message: JsonRpc) => {
    window.dispatchEvent(new window.MessageEvent("message", { data: message }));
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { window, sent, hostSend, flush };
}

/** Complete the handshake the way a spec host does. */
async function initialize(widget: ReturnType<typeof mountWidget>) {
  const init = widget.sent.find((m) => m.method === "ui/initialize");
  expect(init, "widget must send ui/initialize on load").toBeDefined();
  widget.hostSend({
    jsonrpc: "2.0",
    id: init!.id,
    result: {
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
      hostInfo: { name: "test-host", version: "1" },
      hostCapabilities: { openLinks: {} },
      hostContext: {},
    },
  });
  await widget.flush();
}

function sampleTurnSummaryResult() {
  const card = buildTurnSummaryCard({
    created: [
      { entity_id: "ent_t", entity_type: "task", label: "Buy bread" },
      { entity_id: "ent_i", entity_type: "issue", label: "Store drops a field" },
    ],
    updated: [{ entity_id: "ent_c", entity_type: "contact", label: "Ada" }],
    retrieved: Array.from({ length: 4 }, (_, i) => ({
      entity_id: `ent_r${i}`,
      entity_type: "note",
      label: `Note ${i}`,
    })),
    ambiguous: [
      { entity_id: "ent_a", entity_type: "company", label: "Acme", identity_rule: "name_key:name" },
    ],
    origin: "https://neotoma.example.com",
    conversation_entity_id: "ent_conv",
    conversation_label: "Planning <b>",
    turn_number: 4,
    issues_count: 1,
  });
  const fallback_text = renderTurnSummaryFallbackText(card);
  const structured = { status_line: "msg 4/4, stored 3, retrieved 4", card, fallback_text };
  return {
    card,
    fallback_text,
    callToolResult: {
      content: [
        { type: "text", text: JSON.stringify(structured) },
        { type: "text", text: fallback_text },
      ],
      structuredContent: structured,
    },
  };
}

describe("Turn Summary MCP Apps wiring", () => {
  const server = new NeotomaServer();

  it("parses the turn summary widget URI", () => {
    const parsed = (server as any).parseResourceUri(TURN_SUMMARY_WIDGET_RESOURCE_URI);
    expect(parsed.type).toBe("ui_turn_summary_widget");
  });

  it("advertises the widget on the static server card", () => {
    const card = buildSmitheryServerCard();
    const resources = card.resources as Array<{ uri?: string; mimeType?: string; name?: string }>;
    const widget = resources.find((r) => r.uri === TURN_SUMMARY_WIDGET_RESOURCE_URI);
    expect(widget?.mimeType).toBe("text/html;profile=mcp-app");
    expect(widget?.name).toBe("Turn Summary Widget");
  });

  it("attaches _meta.ui.resourceUri to the neotoma_turn_summary tool definition", () => {
    const card = buildSmitheryServerCard();
    const tools = card.tools as Array<{ name?: string; _meta?: { ui?: { resourceUri?: string } } }>;
    const tool = tools.find((t) => t.name === "neotoma_turn_summary");
    expect(tool?._meta?.ui?.resourceUri).toBe(TURN_SUMMARY_WIDGET_RESOURCE_URI);
  });
});

describe.each([
  ["turn summary", "buildTurnSummaryWidgetHtml"],
  ["timeline", "buildTimelineWidgetHtml"],
] as const)("%s widget handshake", (_name, builder) => {
  const html = (new NeotomaServer() as any)[builder]() as string;

  it("is self-contained (no network URLs)", () => {
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("opens with a spec ui/initialize request and nothing else before the host answers", async () => {
    const widget = mountWidget(html);
    await widget.flush();
    expect(widget.sent).toHaveLength(1);
    const [init] = widget.sent;
    expect(init.jsonrpc).toBe("2.0");
    expect(typeof init.id).toBe("number");
    expect(init.method).toBe("ui/initialize");
    expect(init.params?.protocolVersion).toBe(MCP_APPS_PROTOCOL_VERSION);
    expect((init.params?.appInfo as { name?: string })?.name).toMatch(/^neotoma-/);
    expect(init.params?.appCapabilities).toBeDefined();
  });

  it("sends ui/notifications/initialized and its size once the host answers", async () => {
    const widget = mountWidget(html);
    await initialize(widget);
    const methods = widget.sent.map((m) => m.method);
    expect(methods.slice(0, 3)).toEqual([
      "ui/initialize",
      "ui/notifications/initialized",
      "ui/notifications/size-changed",
    ]);
    const size = widget.sent[2].params as { width?: unknown; height?: unknown };
    expect(typeof size.width).toBe("number");
    expect(typeof size.height).toBe("number");
    expect(widget.sent[1].id).toBeUndefined();
  });

  it("answers ping and resource teardown, and rejects unknown host requests", async () => {
    const widget = mountWidget(html);
    await initialize(widget);
    widget.hostSend({ jsonrpc: "2.0", id: 900, method: "ping", params: {} });
    widget.hostSend({ jsonrpc: "2.0", id: 901, method: "ui/resource-teardown", params: {} });
    widget.hostSend({ jsonrpc: "2.0", id: 902, method: "ui/unknown", params: {} });
    expect(widget.sent.find((m) => m.id === 900)?.result).toEqual({});
    expect(widget.sent.find((m) => m.id === 901)?.result).toEqual({});
    expect(widget.sent.find((m) => m.id === 902)?.error).toMatchObject({ code: -32601 });
  });
});

describe("turn summary widget rendering", () => {
  const html = (new NeotomaServer() as any).buildTurnSummaryWidgetHtml() as string;

  it("renders structuredContent from params (the CallToolResult), matching fallback_text row for row", async () => {
    const widget = mountWidget(html);
    await initialize(widget);
    const { callToolResult, fallback_text } = sampleTurnSummaryResult();
    widget.hostSend({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: callToolResult,
    });
    const doc = widget.window.document;
    const rows = Array.from(doc.getElementById("card")!.children).flatMap((node) =>
      node.tagName === "UL"
        ? Array.from(node.children).map((li) => li.textContent ?? "")
        : [node.textContent ?? ""]
    );
    const textRows = fallback_text.split("\n").map((line) =>
      line
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^\*\*(.*)\*\*$/, "$1")
        .replace(/^- /, "")
        .replace(/\\(.)/g, "$1")
    );
    expect(rows).toEqual(textRows);
    // Labels are written as text, never parsed as HTML.
    expect(doc.querySelector("b")).toBeNull();
  });

  it("falls back to the JSON text block when structuredContent is absent", async () => {
    const widget = mountWidget(html);
    await initialize(widget);
    const { callToolResult } = sampleTurnSummaryResult();
    widget.hostSend({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { content: callToolResult.content },
    });
    expect(widget.window.document.getElementById("card")!.textContent).toContain("Buy bread");
  });

  it("does not read the non-spec params.result shape", async () => {
    const widget = mountWidget(html);
    await initialize(widget);
    const { callToolResult } = sampleTurnSummaryResult();
    widget.hostSend({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { result: callToolResult.structuredContent } as Record<string, unknown>,
    });
    expect(widget.window.document.getElementById("card")!.textContent).not.toContain("Buy bread");
  });

  it("opens links through ui/open-link with an https URL, including the issues review link", async () => {
    const widget = mountWidget(html);
    await initialize(widget);
    const { callToolResult } = sampleTurnSummaryResult();
    widget.hostSend({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: callToolResult,
    });
    const doc = widget.window.document;
    const links = Array.from(doc.querySelectorAll("a"));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.getAttribute("href")).toMatch(/^https:\/\//);
    expect(html).not.toContain("neotoma://");

    const issuesLink = doc.querySelector(".consent a") as HTMLAnchorElement;
    issuesLink.dispatchEvent(
      new widget.window.MouseEvent("click", { bubbles: true, cancelable: true })
    );
    const openLink = widget.sent.find((m) => m.method === "ui/open-link");
    expect(openLink?.params).toEqual({ url: "https://neotoma.example.com/issues" });
    expect(typeof openLink?.id).toBe("number");
  });
});

describe("timeline widget rendering", () => {
  it("renders the event count from structuredContent", async () => {
    const html = (new NeotomaServer() as any).buildTimelineWidgetHtml() as string;
    const widget = mountWidget(html);
    await initialize(widget);
    const payload = { events: [{ id: "e1" }, { id: "e2" }], total: 2 };
    widget.hostSend({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      },
    });
    expect(widget.window.document.getElementById("summary")!.textContent).toBe("2 events");
  });
});

describe("widget failure states and link safety", () => {
  const turnHtml = (new NeotomaServer() as any).buildTurnSummaryWidgetHtml() as string;
  const timelineHtml = (new NeotomaServer() as any).buildTimelineWidgetHtml() as string;

  it.each([
    ["an isError tool result", { content: [{ type: "text", text: "boom" }], isError: true }],
    [
      "a tool result carrying an error envelope",
      {
        content: [{ type: "text", text: "{}" }],
        structuredContent: { error: { code: "ERR_TURN_SUMMARY_MESSAGE_NOT_FOUND", message: "x" } },
      },
    ],
    ["an unreadable tool result", { content: [{ type: "text", text: "not json" }] }],
  ])("turn summary leaves the waiting state on %s", async (_label, params) => {
    const widget = mountWidget(turnHtml);
    await initialize(widget);
    widget.hostSend({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params });
    const text = widget.window.document.getElementById("card")!.textContent ?? "";
    expect(text).not.toContain("Waiting");
    expect(text).toMatch(/unavailable/i);
  });

  it("turn summary shows a cancelled state on ui/notifications/tool-cancelled", async () => {
    const widget = mountWidget(turnHtml);
    await initialize(widget);
    widget.hostSend({ jsonrpc: "2.0", method: "ui/notifications/tool-cancelled", params: {} });
    expect(widget.window.document.getElementById("card")!.textContent).toMatch(/cancelled/i);
  });

  it("timeline shows a failure state on an isError result", async () => {
    const widget = mountWidget(timelineHtml);
    await initialize(widget);
    widget.hostSend({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { content: [{ type: "text", text: "boom" }], isError: true },
    });
    expect(widget.window.document.getElementById("summary")!.textContent).toMatch(/unavailable/i);
  });

  it("never sets a non-http(s) href, even if the card carries one", async () => {
    const widget = mountWidget(turnHtml);
    await initialize(widget);
    const { callToolResult } = sampleTurnSummaryResult();
    const structured = JSON.parse(JSON.stringify(callToolResult.structuredContent));
    structured.card.groups[0].items[0].url = "javascript:alert(1)";
    structured.card.header.conversation_url = "data:text/html,hi";
    widget.hostSend({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { content: callToolResult.content, structuredContent: structured },
    });
    const doc = widget.window.document;
    for (const a of Array.from(doc.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
    }
    expect(doc.getElementById("card")!.textContent).toContain("Buy bread");
  });
});
