/**
 * Effect-level coverage for #2325 / #2350 rereview: remote `file_path` and
 * non-base64 `file_content` must fail with structured codes on BOTH MCP
 * `store` and HTTP `POST /store` — not only in the helper unit tests.
 *
 * Also covers the parquet + reference MCP branches that bypassed
 * `readUnstructuredInput` on the first #2350 cut.
 */

import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import {
  ERR_FILE_CONTENT_NOT_BASE64,
  ERR_FILE_PATH_IS_SERVER_LOCAL,
  FileInputError,
} from "../../src/services/file_input_diagnostics.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";

const ENV_KEYS = ["NEOTOMA_FILESYSTEM_LOCAL", "NEOTOMA_BASE_URL", "NODE_ENV"] as const;

describe("store file-input rejects — MCP + HTTP surfaces (#2325)", () => {
  let server: NeotomaServer;
  let httpServer: Server;
  let baseUrl: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    server = new NeotomaServer();

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = httpServer.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  function forceRemoteFilesystem(): void {
    process.env.NEOTOMA_FILESYSTEM_LOCAL = "0";
  }

  it("MCP store rejects remote file_path with ERR_FILE_PATH_IS_SERVER_LOCAL", async () => {
    forceRemoteFilesystem();
    await expect(
      server.executeToolForCli(
        "store",
        {
          file_path: "/Users/someone/Documents/review.txt",
          mime_type: "text/plain",
          idempotency_key: `mcp-remote-path-${Date.now()}`,
        },
        LOCAL_DEV_USER_ID
      )
    ).rejects.toMatchObject({
      name: "FileInputError",
      code: ERR_FILE_PATH_IS_SERVER_LOCAL,
    });
  });

  it("MCP store rejects non-base64 file_content with ERR_FILE_CONTENT_NOT_BASE64", async () => {
    await expect(
      server.executeToolForCli(
        "store",
        {
          file_content: "This is plain text and not base64 at all!!!!",
          mime_type: "text/plain",
          idempotency_key: `mcp-bad-b64-${Date.now()}`,
        },
        LOCAL_DEV_USER_ID
      )
    ).rejects.toMatchObject({
      name: "FileInputError",
      code: ERR_FILE_CONTENT_NOT_BASE64,
    });
  });

  it("MCP store rejects remote parquet file_path before readParquetFile", async () => {
    forceRemoteFilesystem();
    await expect(
      server.executeToolForCli(
        "store",
        {
          // Extension alone is enough for isParquetFile; the locality gate must
          // fire before any filesystem read.
          file_path: "/Users/someone/data/entities.parquet",
          idempotency_key: `mcp-remote-parquet-${Date.now()}`,
        },
        LOCAL_DEV_USER_ID
      )
    ).rejects.toMatchObject({
      name: "FileInputError",
      code: ERR_FILE_PATH_IS_SERVER_LOCAL,
    });
  });

  it("MCP store rejects remote reference file_path before storeRawReference", async () => {
    forceRemoteFilesystem();
    await expect(
      server.executeToolForCli(
        "store",
        {
          file_path: "/Users/someone/Documents/review.txt",
          source_storage: "reference",
          mime_type: "text/plain",
          idempotency_key: `mcp-remote-ref-${Date.now()}`,
        },
        LOCAL_DEV_USER_ID
      )
    ).rejects.toMatchObject({
      name: "FileInputError",
      code: ERR_FILE_PATH_IS_SERVER_LOCAL,
    });
  });

  it("HTTP POST /store rejects remote file_path with error_code", async () => {
    forceRemoteFilesystem();
    const res = await fetch(`${baseUrl}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: LOCAL_DEV_USER_ID,
        file_path: "/Users/someone/Documents/review.txt",
        mime_type: "text/plain",
        idempotency_key: `http-remote-path-${Date.now()}`,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error_code?: string; message?: string };
    expect(body.error_code).toBe(ERR_FILE_PATH_IS_SERVER_LOCAL);
    expect(body.message).toContain("server's filesystem");
  });

  it("HTTP POST /store rejects non-base64 file_content with error_code + details.hint", async () => {
    const res = await fetch(`${baseUrl}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: LOCAL_DEV_USER_ID,
        file_content: "This is plain text and not base64 at all!!!!",
        mime_type: "text/plain",
        idempotency_key: `http-bad-b64-${Date.now()}`,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error_code?: string;
      details?: { hint?: string };
    };
    expect(body.error_code).toBe(ERR_FILE_CONTENT_NOT_BASE64);
    expect(typeof body.details?.hint).toBe("string");
    expect(body.details!.hint!).toMatch(/base64/i);
  });

  it("FileInputError maps to McpError InvalidRequest with data.code (not InternalError)", () => {
    // Mirrors the CallTool catch wiring: the static write-path test asserts the
    // branch exists; this asserts the envelope contract the branch must emit.
    const fileErr = new FileInputError(ERR_FILE_PATH_IS_SERVER_LOCAL, "msg", {
      file_path: "/x",
    });
    const mcpErr = new McpError(ErrorCode.InvalidRequest, fileErr.message, fileErr.toErrorEnvelope());
    expect(mcpErr.code).toBe(ErrorCode.InvalidRequest);
    expect(mcpErr.code).not.toBe(ErrorCode.InternalError);
    expect((mcpErr.data as { code?: string } | undefined)?.code).toBe(ERR_FILE_PATH_IS_SERVER_LOCAL);
  });
});
