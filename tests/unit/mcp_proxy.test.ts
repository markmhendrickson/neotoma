/**
 * Unit tests for MCP identity proxy components:
 * - AAuth client signer (key loading, config resolution)
 * - Config scan proxy entries
 * - Proxy constants
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

describe("AAuth client signer", () => {
  describe("loadSignerConfigFromEnv", () => {
    const tmpDir = path.join(os.tmpdir(), `neotoma-test-signer-${randomUUID()}`);
    const privateJwkPath = path.join(tmpDir, "test.private.jwk");

    beforeEach(async () => {
      mkdirSync(tmpDir, { recursive: true });
      const { generateKeyPair, exportJWK } = await import("jose");
      const { privateKey } = await generateKeyPair("ES256", { extractable: true });
      const jwk = await exportJWK(privateKey);
      jwk.kid = "test-kid-123";
      jwk.alg = "ES256";
      writeFileSync(privateJwkPath, JSON.stringify(jwk));

      process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = privateJwkPath;
      process.env.NEOTOMA_AAUTH_SUB = "test@example.com";
      process.env.NEOTOMA_AAUTH_ISS = "https://example.com";
    });

    afterEach(() => {
      delete process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH;
      delete process.env.NEOTOMA_AAUTH_SUB;
      delete process.env.NEOTOMA_AAUTH_ISS;
      delete process.env.NEOTOMA_AAUTH_KID;
      delete process.env.NEOTOMA_AAUTH_TOKEN_TTL_SEC;
      delete process.env.NEOTOMA_AAUTH_AUTHORITY_OVERRIDE;
      try {
        rmSync(tmpDir, { recursive: true });
      } catch {}
    });

    it("loads config from env vars", async () => {
      process.env.NEOTOMA_AAUTH_KID = "test-kid-123";
      const { loadSignerConfigFromEnv } = await import("../../src/proxy/aauth_client_signer.js");
      const config = loadSignerConfigFromEnv();
      expect(config.sub).toBe("test@example.com");
      expect(config.iss).toBe("https://example.com");
      expect(config.kid).toBe("test-kid-123");
      expect(config.tokenTtlSec).toBe(300);
      expect(config.privateJwk).toHaveProperty("d");
    });

    it("throws when private JWK path does not exist", async () => {
      process.env.NEOTOMA_AAUTH_PRIVATE_JWK_PATH = "/nonexistent/path.jwk";
      const { loadSignerConfigFromEnv, SignerConfigError } =
        await import("../../src/proxy/aauth_client_signer.js");
      expect(() => loadSignerConfigFromEnv()).toThrow(SignerConfigError);
    });

    it("respects sub and iss from env over CLI config fallback", async () => {
      const { loadSignerConfigFromEnv } = await import("../../src/proxy/aauth_client_signer.js");
      const config = loadSignerConfigFromEnv();
      expect(config.sub).toBe("test@example.com");
      expect(config.iss).toBe("https://example.com");
    });

    it("uses custom TTL from env", async () => {
      process.env.NEOTOMA_AAUTH_TOKEN_TTL_SEC = "600";
      const { loadSignerConfigFromEnv } = await import("../../src/proxy/aauth_client_signer.js");
      const config = loadSignerConfigFromEnv();
      expect(config.tokenTtlSec).toBe(600);
    });

    it("enforces minimum TTL of 30s", async () => {
      process.env.NEOTOMA_AAUTH_TOKEN_TTL_SEC = "5";
      const { loadSignerConfigFromEnv } = await import("../../src/proxy/aauth_client_signer.js");
      const config = loadSignerConfigFromEnv();
      expect(config.tokenTtlSec).toBe(30);
    });

    it("signs with the strict AAuth component set required by Neotoma", async () => {
      process.env.NEOTOMA_AAUTH_KID = "test-kid-123";
      const { loadSignerConfigFromEnv, signedFetch } =
        await import("../../src/proxy/aauth_client_signer.js");
      const seenHeaders = await new Promise<Record<string, string | undefined>>(
        (resolve, reject) => {
          const server = createServer((req, res) => {
            resolve({
              signature: req.headers.signature as string | undefined,
              signatureInput: req.headers["signature-input"] as string | undefined,
              signatureKey: req.headers["signature-key"] as string | undefined,
              contentDigest: req.headers["content-digest"] as string | undefined,
            });
            res.end("ok");
            server.close();
          });
          server.on("error", reject);
          server.listen(0, "127.0.0.1", async () => {
            try {
              const address = server.address();
              if (!address || typeof address === "string")
                throw new Error("missing test server port");
              const response = await signedFetch(`http://127.0.0.1:${address.port}/mcp`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
                config: loadSignerConfigFromEnv(),
              });
              await response.text();
            } catch (error) {
              server.close();
              reject(error);
            }
          });
        }
      );

      expect(seenHeaders.signature).toContain("aasig=:");
      expect(seenHeaders.signatureKey).toContain("aasig=jwt");
      expect(seenHeaders.signatureInput).toContain('"@path"');
      expect(seenHeaders.signatureInput).toContain('"content-digest"');
      expect(seenHeaders.signatureInput).toContain('"signature-key"');
      expect(seenHeaders.signatureInput).not.toContain('"@target-uri"');
      expect(seenHeaders.contentDigest).toMatch(/^sha-256=:/);
    });
  });
});

describe("mcp_config_scan proxy entries", () => {
  it("exports hasAAuthKeys function", async () => {
    const mod = await import("../../src/cli/mcp_config_scan.js");
    expect(typeof mod.hasAAuthKeys).toBe("function");
  });

  it("exports neotomaProxyServerEntries function", async () => {
    const mod = await import("../../src/cli/mcp_config_scan.js");
    expect(typeof mod.neotomaProxyServerEntries).toBe("function");
  });
});

describe("Proxy constants", () => {
  it("DEFAULT_CLIENT_NAME and DEFAULT_DOWNSTREAM_URL are exported", async () => {
    const { DEFAULT_CLIENT_NAME, DEFAULT_DOWNSTREAM_URL } =
      await import("../../src/proxy/mcp_stdio_proxy.js");
    expect(DEFAULT_CLIENT_NAME).toBe("neotoma-mcp-proxy");
    expect(DEFAULT_DOWNSTREAM_URL).toBe("http://localhost:3080/mcp");
  });

  it("formats downstream errors with actionable response detail", async () => {
    const { formatDownstreamErrorMessage } =
      await import("../../src/proxy/mcp_stdio_proxy.js");
    expect(formatDownstreamErrorMessage(503, "database unavailable\ntry again")).toBe(
      "neotoma-mcp-proxy downstream error (503): database unavailable try again",
    );
  });

  it("detects recoverable unknown MCP session 503 bodies", async () => {
    const { isRecoverableMcpSessionLostError } =
      await import("../../src/proxy/mcp_stdio_proxy.js");
    const fromActions =
      '{"jsonrpc":"2.0","error":{"code":-32001,"message":"Service Unavailable: MCP session is unknown on this API instance. If you run multiple replicas, enable sticky sessions for POST /mcp (or route /mcp to a single instance). Otherwise restart the MCP client so initialize runs again after a server restart."},"id":1}';
    expect(isRecoverableMcpSessionLostError(503, fromActions)).toBe(true);
    expect(isRecoverableMcpSessionLostError(502, fromActions)).toBe(false);
    expect(isRecoverableMcpSessionLostError(503, "database unavailable")).toBe(false);
  });
});

describe("Proxy barrel export", () => {
  it("re-exports all public symbols", async () => {
    const barrel = await import("../../src/proxy/index.js");
    expect(barrel.runProxy).toBeDefined();
    expect(barrel.DEFAULT_CLIENT_NAME).toBeDefined();
    expect(barrel.DEFAULT_DOWNSTREAM_URL).toBeDefined();
    expect(barrel.signedFetch).toBeDefined();
    expect(barrel.loadSignerConfigFromEnv).toBeDefined();
    expect(barrel.SignerConfigError).toBeDefined();
    expect(barrel.runPreflight).toBeDefined();
  });
});
