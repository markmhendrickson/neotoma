/**
 * neotoma#2070 — `Mcp-Method` / `Mcp-Name` standard headers on POST /mcp.
 *
 * MCP 2026-07-28 (SEP-2243) requires clients to mirror the JSON-RPC method
 * (`Mcp-Method`) and, for tools/call / resources/read / prompts/get, the
 * target name (`Mcp-Name`) into headers so gateways can route without parsing
 * the body. Servers must reject a missing or mismatched value with 400 and
 * HeaderMismatch (-32020).
 *
 * Legal gate (binding): those headers are visible to every intermediary, so
 * they may carry only a method and a tool/resource/prompt name. A value shaped
 * like a credential or personal data is rejected with 400, on either protocol
 * era, and:
 *   - the response never echoes the value;
 *   - logs record header presence and length only, never the value.
 * The log assertion spies on every console method, which is where the logger
 * and the request-logging middleware both write.
 *
 * Old clients: a legacy (initialize + session) client that sends a clean
 * header is unaffected; only credential/PII-shaped values are refused.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  bootMcpApp,
  modernPost,
  prepareMcpTestEnv,
  type BootedMcpApp,
  type McpTestEnv,
} from "../helpers/mcp_http_modern.js";

// Synthetic credential- and PII-shaped values. None is a real secret.
const FAKE_BEARER = "Bearer nt2070FakeTokenValue0123456789abcdefXYZ";
const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LTIwNzAifQ.c2lnbmF0dXJlLTIwNzAtZmFrZQ";
const FAKE_API_KEY = "sk-nt2070fakekeyvalue0123456789";
const FAKE_OPAQUE = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const FAKE_EMAIL = "someone.2070@example.com";
const FAKE_USER_ID = "3f2c9a10-2070-4c1d-9e8f-0a1b2c3d4e5f";

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

describe("POST /mcp Mcp-Method / Mcp-Name headers (#2070)", () => {
  let env: McpTestEnv;
  let app: BootedMcpApp;
  let spies: MockInstance[] = [];

  function loggedText(): string {
    return spies
      .flatMap((spy) => spy.mock.calls)
      .map((call) => call.map(stringifyArg).join(" "))
      .join("\n");
  }

  beforeEach(async () => {
    env = prepareMcpTestEnv("neotoma-mcp-2070-headers-");
    app = await bootMcpApp();
    spies = CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined)
    );
  });

  afterEach(async () => {
    for (const spy of spies) spy.mockRestore();
    spies = [];
    await app.close();
    vi.resetModules();
    env.restore();
  });

  it("accepts valid Mcp-Method / Mcp-Name on a 2026-07-28 request, including a base64-sentinel name", async () => {
    const plain = await modernPost(app.baseUrl, {
      id: 1,
      method: "tools/call",
      params: { name: "get_authenticated_user", arguments: {} },
    });
    expect(plain.status, plain.text).toBe(200);
    expect(plain.body?.result?.isError).not.toBe(true);

    const encoded = `=?base64?${Buffer.from("get_authenticated_user", "utf8").toString("base64")}?=`;
    const sentinel = await modernPost(
      app.baseUrl,
      { id: 2, method: "tools/call", params: { name: "get_authenticated_user", arguments: {} } },
      { headers: { "Mcp-Name": encoded } }
    );
    expect(sentinel.status, sentinel.text).toBe(200);

    const list = await modernPost(app.baseUrl, { id: 3, method: "tools/list" });
    expect(list.status, list.text).toBe(200);
  });

  it("rejects missing, empty or mismatched headers with 400 HeaderMismatch and no echo", async () => {
    const cases: Array<{ label: string; headers: Record<string, string | null> }> = [
      { label: "missing Mcp-Method", headers: { "Mcp-Method": null } },
      { label: "empty Mcp-Method", headers: { "Mcp-Method": "" } },
      { label: "mismatched Mcp-Method", headers: { "Mcp-Method": "tools/list" } },
      { label: "missing Mcp-Name", headers: { "Mcp-Name": null } },
      { label: "empty Mcp-Name", headers: { "Mcp-Name": "" } },
      { label: "mismatched Mcp-Name", headers: { "Mcp-Name": "retrieve_entities" } },
      { label: "missing MCP-Protocol-Version", headers: { "MCP-Protocol-Version": null } },
      { label: "mismatched MCP-Protocol-Version", headers: { "MCP-Protocol-Version": "2025-11-25" } },
    ];
    for (const [i, testCase] of cases.entries()) {
      const reply = await modernPost(
        app.baseUrl,
        {
          id: 10 + i,
          method: "tools/call",
          params: { name: "get_authenticated_user", arguments: {} },
        },
        { headers: testCase.headers }
      );
      expect(reply.status, testCase.label).toBe(400);
      expect(reply.body?.error?.code, testCase.label).toBe(-32020);
      expect(reply.body?.id, testCase.label).toBe(10 + i);
      // The mismatched value is not repeated back.
      if (testCase.headers["Mcp-Name"]) {
        expect(reply.text, testCase.label).not.toContain(testCase.headers["Mcp-Name"]);
      }
    }
  });

  it("rejects credential- and PII-shaped values with 400, never echoed, logged as length only", async () => {
    const cases: Array<{
      header: "Mcp-Method" | "Mcp-Name";
      value: string;
      reason: "credential_shaped" | "personal_data_shaped";
    }> = [
      { header: "Mcp-Name", value: FAKE_BEARER, reason: "credential_shaped" },
      { header: "Mcp-Name", value: FAKE_JWT, reason: "credential_shaped" },
      { header: "Mcp-Name", value: FAKE_API_KEY, reason: "credential_shaped" },
      { header: "Mcp-Name", value: FAKE_OPAQUE, reason: "credential_shaped" },
      { header: "Mcp-Method", value: FAKE_JWT, reason: "credential_shaped" },
      { header: "Mcp-Name", value: FAKE_EMAIL, reason: "personal_data_shaped" },
      { header: "Mcp-Name", value: FAKE_USER_ID, reason: "personal_data_shaped" },
      {
        header: "Mcp-Name",
        value: `=?base64?${Buffer.from(FAKE_API_KEY, "utf8").toString("base64")}?=`,
        reason: "credential_shaped",
      },
    ];
    for (const [i, testCase] of cases.entries()) {
      const reply = await modernPost(
        app.baseUrl,
        {
          id: 30 + i,
          method: "tools/call",
          params: { name: "get_authenticated_user", arguments: {} },
        },
        { headers: { [testCase.header]: testCase.value } }
      );
      const label = `${testCase.header}=${testCase.reason}#${i}`;
      expect(reply.status, label).toBe(400);
      expect(reply.body?.error?.code, label).toBe(-32020);
      expect(reply.body?.error?.data?.error_code, label).toBe("MCP_HEADER_VALUE_REJECTED");
      expect(reply.body?.error?.data?.details, label).toEqual({
        header: testCase.header,
        reason: testCase.reason,
      });
      expect(reply.body?.error?.data?.hint, label).toBeTruthy();
      expect(reply.text, label).not.toContain(testCase.value);
      expect(reply.text, label).not.toContain("nt2070");
      expect(reply.text, label).not.toContain(FAKE_EMAIL);
    }

    const logs = loggedText();
    expect(logs).toContain(`Rejected Mcp-Name header (reason=credential_shaped, length=${FAKE_BEARER.length})`);
    expect(logs).toContain("present(len=");
    for (const testCase of cases) {
      expect(logs).not.toContain(testCase.value);
    }
    expect(logs).not.toContain("nt2070");
    expect(logs).not.toContain(FAKE_EMAIL);
    expect(logs).not.toContain(FAKE_USER_ID);
  });

  it("legacy session path: clean headers keep working, credential-shaped values are refused", async () => {
    const initBody = (id: number) =>
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "neotoma-2070-legacy", version: "0.0.0" },
        },
      });
    const baseHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };

    const clean = await fetch(`${app.baseUrl}/mcp`, {
      method: "POST",
      headers: { ...baseHeaders, "Mcp-Method": "initialize" },
      body: initBody(50),
    });
    expect(clean.status).toBe(200);
    expect(clean.headers.get("mcp-session-id")).toBeTruthy();
    await clean.text();

    const smuggled = await fetch(`${app.baseUrl}/mcp`, {
      method: "POST",
      headers: { ...baseHeaders, "Mcp-Name": FAKE_BEARER },
      body: initBody(51),
    });
    const smuggledText = await smuggled.text();
    expect(smuggled.status).toBe(400);
    expect(smuggled.headers.get("mcp-session-id")).toBeNull();
    expect(smuggledText).toContain("-32020");
    expect(smuggledText).not.toContain("nt2070");
    expect(loggedText()).not.toContain("nt2070");
  });
});
