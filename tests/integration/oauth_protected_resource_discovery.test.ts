/**
 * Effect-level regression for RFC 9728 OAuth protected-resource discovery
 * (neotoma#2049). Unauthenticated clients must receive 200 metadata so MCP
 * login can bootstrap; stale X-Connection-Id may still 401 invalid_token, but
 * that response's resource_metadata URL must itself return 200 unauthenticated.
 */

import { beforeAll, describe, expect, it } from "vitest";

function resolveApiBase(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18080";
  return `http://127.0.0.1:${port}`;
}

function extractResourceMetadataUrl(wwwAuthenticate: string | null): string | null {
  if (!wwwAuthenticate) return null;
  const match = wwwAuthenticate.match(/resource_metadata="([^"]+)"/);
  return match?.[1] ?? null;
}

async function assertRfc9728Body(res: Response, apiBase: string): Promise<void> {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/application\/json/);
  const body = (await res.json()) as {
    resource?: unknown;
    authorization_servers?: unknown;
  };
  expect(typeof body.resource).toBe("string");
  expect((body.resource as string).length).toBeGreaterThan(0);
  expect(body.resource).toBe(`${apiBase}/mcp`);
  expect(Array.isArray(body.authorization_servers)).toBe(true);
  expect((body.authorization_servers as string[]).length).toBeGreaterThan(0);
}

describe("oauth_protected_resource_discovery", () => {
  let apiBase: string;

  beforeAll(() => {
    apiBase = resolveApiBase();
  });

  it("P0 unauth bare: GET /.well-known/oauth-protected-resource → 200 RFC 9728 body", async () => {
    const res = await fetch(`${apiBase}/.well-known/oauth-protected-resource`);
    await assertRfc9728Body(res, apiBase);
  });

  it("P0 unauth /mcp: GET /.well-known/oauth-protected-resource/mcp → 200", async () => {
    const res = await fetch(`${apiBase}/.well-known/oauth-protected-resource/mcp`);
    await assertRfc9728Body(res, apiBase);
  });

  it("P0 stale connection: unknown X-Connection-Id → 401 invalid_token without self-deadlock", async () => {
    const res = await fetch(`${apiBase}/.well-known/oauth-protected-resource`, {
      headers: { "X-Connection-Id": "cicada-test-unknown-connection-id-2049" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string; error_description?: string };
    expect(body.error).toBe("invalid_token");
    expect(typeof body.error_description).toBe("string");
    expect(JSON.stringify(body)).not.toContain("cicada-test-unknown-connection-id-2049");

    const www = res.headers.get("www-authenticate");
    expect(www).toMatch(/error="invalid_token"/);
    expect(www).toMatch(/resource_metadata=/);
    expect(www).not.toContain("cicada-test-unknown-connection-id-2049");

    const metadataUrl = extractResourceMetadataUrl(www);
    expect(metadataUrl).toBeTruthy();
    const metaRes = await fetch(metadataUrl!);
    expect(metaRes.status).toBe(200);
  });

  it("Lock AS public: GET /.well-known/oauth-authorization-server unauth → 200", async () => {
    const res = await fetch(`${apiBase}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
  });

  it("P0 openid path: GET /.well-known/openid-configuration unauth → 404 (not 401)", async () => {
    const res = await fetch(`${apiBase}/.well-known/openid-configuration`);
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(401);
  });

  it("Cross-endpoint invariant: /mcp 401 resource_metadata target returns 200 unauth", async () => {
    // Invalid Bearer forces the /mcp auth path to emit WWW-Authenticate even when
    // local no-auth would otherwise inject a dev connection id.
    const mcpRes = await fetch(`${apiBase}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer cicada-2049-definitely-invalid-token",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "cicada-2049", version: "0.0.0" },
        },
      }),
    });
    expect(mcpRes.status).toBe(401);
    const www = mcpRes.headers.get("www-authenticate");
    expect(www).toMatch(/resource_metadata=/);
    const metadataUrl = extractResourceMetadataUrl(www);
    expect(metadataUrl).toBeTruthy();
    const metaRes = await fetch(metadataUrl!);
    expect(metaRes.status).toBe(200);
  });

  it("Regression: Bearer still OK without connection-id → 200", async () => {
    const res = await fetch(`${apiBase}/.well-known/oauth-protected-resource`, {
      headers: { Authorization: "Bearer not-a-real-token-but-non-empty" },
    });
    await assertRfc9728Body(res, apiBase);
  });

  it("Edge: empty / whitespace Authorization without connection-id → 200", async () => {
    const empty = await fetch(`${apiBase}/.well-known/oauth-protected-resource`, {
      headers: { Authorization: "" },
    });
    await assertRfc9728Body(empty, apiBase);

    const whitespace = await fetch(`${apiBase}/.well-known/oauth-protected-resource`, {
      headers: { Authorization: "   " },
    });
    await assertRfc9728Body(whitespace, apiBase);
  });

  it("Edge: connection-id + valid Bearer does not take invalid_token path", async () => {
    const res = await fetch(`${apiBase}/.well-known/oauth-protected-resource`, {
      headers: {
        Authorization: "Bearer not-a-real-token-but-non-empty",
        "X-Connection-Id": "cicada-test-unknown-connection-id-2049",
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { error?: string };
    expect(body.error).not.toBe("invalid_token");
  });
});
