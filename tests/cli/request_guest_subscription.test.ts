import { afterEach, describe, expect, it, vi } from "vitest";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

async function loadCli(): Promise<{ runCli(argv: string[]): Promise<void> }> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as {
    runCli(argv: string[]): Promise<void>;
  };
}

describe("request --operation guest subscription parity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.NEOTOMA_BEARER_TOKEN;
    process.exitCode = undefined;
  });

  it.each([
    ["subscribe", { entity_ids: ["ent_granted"], delivery_method: "sse" }],
    ["listSubscriptions", {}],
    ["getSubscriptionStatus", { subscription_id: "sub_granted" }],
    ["unsubscribe", { subscription_id: "sub_granted" }],
  ])("uses the explicit guest credential for %s", async (operation, body) => {
    process.env.NEOTOMA_BEARER_TOKEN = "owner-token-must-not-win";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestHeaders(input, init).get("authorization")).toBe("Bearer guest-token");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { runCli } = await loadCli();
    await runCli([
      "node",
      "neotoma",
      "--json",
      "--base-url",
      "http://127.0.0.1:39999",
      "request",
      "--operation",
      operation,
      "--guest-access-token",
      "guest-token",
      "--body",
      JSON.stringify(body),
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("opens eventsStream with the guest credential and emits SSE frames", async () => {
    process.env.NEOTOMA_BEARER_TOKEN = "owner-token-must-not-win";
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestUrl(input)).toContain("/events/stream?subscription_id=sub_granted");
      expect(requestHeaders(input, init).get("authorization")).toBe("Bearer guest-token");
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("event: ping\ndata: {}\n\n"));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });

    const { runCli } = await loadCli();
    await runCli([
      "node",
      "neotoma",
      "--base-url",
      "http://127.0.0.1:39999",
      "request",
      "--operation",
      "eventsStream",
      "--guest-access-token",
      "guest-token",
      "--query",
      JSON.stringify({ subscription_id: "sub_granted" }),
    ]);

    expect(stdout.join("")).toContain("event: ping");
  });
});
