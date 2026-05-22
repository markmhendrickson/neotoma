import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD",
  "NEOTOMA_BEARER_TOKEN",
  "NEOTOMA_DATA_DIR",
  "NEOTOMA_ENCRYPTION_ENABLED",
  "NEOTOMA_ENV",
  "NEOTOMA_HOST_URL",
  "NEOTOMA_HTTP_PORT",
  "NEOTOMA_KEY_FILE_PATH",
  "NEOTOMA_MNEMONIC",
  "NEOTOMA_MNEMONIC_PASSPHRASE",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv(): void {
  for (const [key, value] of originalEnv.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("POST /mcp Bearer auth validation", () => {
  afterEach(() => {
    vi.resetModules();
    restoreEnv();
  });

  it("rejects an invalid Bearer token instead of returning unauthenticated initialize", async () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mcp-invalid-bearer-"));
    let httpServer: ReturnType<typeof createServer> | undefined;

    try {
      process.env.NEOTOMA_AUTO_DISCOVER_TUNNEL_URL_IN_PROD = "false";
      process.env.NEOTOMA_BEARER_TOKEN = "shared-secret-token";
      process.env.NEOTOMA_DATA_DIR = path.join(tmpRoot, "data");
      process.env.NEOTOMA_ENCRYPTION_ENABLED = "false";
      process.env.NEOTOMA_ENV = "development";
      process.env.NEOTOMA_HOST_URL = "http://127.0.0.1";
      process.env.NEOTOMA_HTTP_PORT = "0";
      delete process.env.NEOTOMA_KEY_FILE_PATH;
      delete process.env.NEOTOMA_MNEMONIC;
      delete process.env.NEOTOMA_MNEMONIC_PASSPHRASE;

      vi.resetModules();
      const { app } = await import("../../src/actions.js");

      httpServer = createServer(app);
      await new Promise<void>((resolve, reject) => {
        httpServer!.listen(0, "127.0.0.1", () => resolve());
        httpServer!.once("error", reject);
      });
      const address = httpServer.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const invalidKeyDerivedShapeToken = "11".repeat(32);

      const res = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${invalidKeyDerivedShapeToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "probe", version: "0.0.0" },
          },
        }),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("invalid_token");
      const body = (await res.json()) as {
        error?: { code?: number; message?: string };
        id?: number | null;
      };
      expect(body.error?.code).toBe(-32001);
      expect(body.error?.message).toMatch(/Invalid or expired Bearer token/);
      expect(body.id).toBe(1);
    } finally {
      if (httpServer) {
        await new Promise<void>((resolve, reject) => {
          httpServer!.close((error) => (error ? reject(error) : resolve()));
        });
      }
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
