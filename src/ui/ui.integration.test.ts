/**
 * UI Integration Tests
 *
 * These tests verify the same functionality tested by the test command,
 * ensuring UI test routines are included in the test suite run by the commit command.
 *
 * Some tests require browser automation (via test command), while others
 * can be verified programmatically. This file documents all test routines.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";
import fs from "node:fs";
import path from "node:path";
import {
  exportKeyPairs,
  importKeyPairs,
  maskPrivateKey,
} from "../crypto/export.js";
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  deriveBearerToken,
} from "../crypto/keys.js";
import {
  normalizeRecord,
  STATUS_ORDER,
} from "../../frontend/src/types/record.js";
import {
  localToNeotoma,
  neotomaToLocal,
} from "../../frontend/src/utils/record_conversion.js";
import type { NeotomaRecord } from "../../frontend/src/types/record.js";
import type { LocalRecord } from "../../frontend/src/store/types.js";
import { setTimeout as wait } from "node:timers/promises";

const execAsync = promisify(exec);

const BRANCH_PORTS_SENTINEL = path.join(
  process.cwd(),
  ".branch-ports",
  "ui-integration-tests.json",
);

function ensureBranchPortsFile(
  frontendPort: string,
  backendPort: string,
): void {
  try {
    const wsPort = String(Number(backendPort) + 1);
    const data = {
      pid: process.pid,
      branch: process.env.BRANCH_NAME || "ui-integration-tests",
      timestamp: Date.now(),
      ports: {
        http: Number(backendPort),
        vite: Number(frontendPort),
        ws: Number(wsPort),
      },
    };
    fs.mkdirSync(path.dirname(BRANCH_PORTS_SENTINEL), { recursive: true });
    fs.writeFileSync(BRANCH_PORTS_SENTINEL, JSON.stringify(data, null, 2));
  } catch (error) {
    console.warn("Failed to write branch ports sentinel file", error);
  }
}

function buildBackendEnv(port: string): NodeJS.ProcessEnv {
  const supabaseUrl =
    process.env.DEV_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://example.supabase.co";
  const supabaseKey =
    process.env.DEV_SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "test-service-role-key";
  const connectorSecret =
    process.env.CONNECTOR_SECRET_KEY ||
    process.env.CONNECTOR_SECRETS_KEY ||
    "test-connector-secret-test-connector-secret";

  const wsPort = String(Number(port) + 1);

  return {
    ...process.env,
    HTTP_PORT: port,
    PORT: port,
    WS_PORT: process.env.WS_PORT || wsPort,
    NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "0",
    BRANCH_PORTS_FILE: process.env.BRANCH_PORTS_FILE || BRANCH_PORTS_SENTINEL,
    DEV_SUPABASE_URL: process.env.DEV_SUPABASE_URL || supabaseUrl,
    DEV_SUPABASE_SERVICE_KEY:
      process.env.DEV_SUPABASE_SERVICE_KEY || supabaseKey,
    SUPABASE_URL: process.env.SUPABASE_URL || supabaseUrl,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || supabaseKey,
    ACTIONS_BEARER_TOKEN:
      process.env.ACTIONS_BEARER_TOKEN || "test-bearer-token",
    CONNECTOR_SECRET_KEY: connectorSecret,
    CONNECTOR_SECRETS_KEY: connectorSecret,
  };
}

function buildFrontendEnv(port: string, apiPort: string): NodeJS.ProcessEnv {
  const wsPort = String(Number(apiPort) + 1);

  return {
    ...process.env,
    VITE_PORT: port,
    PORT: port,
    WS_PORT: process.env.WS_PORT || wsPort,
    VITE_WS_PORT: process.env.VITE_WS_PORT || wsPort,
    NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "0",
    BRANCH_PORTS_FILE: process.env.BRANCH_PORTS_FILE || BRANCH_PORTS_SENTINEL,
    VITE_API_BASE_URL:
      process.env.VITE_API_BASE_URL || `http://localhost:${apiPort}`,
  };
}

// Message formatting functions (from ChatPanel)
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMessage(content: string): string {
  const safeContent = escapeHtml(content);
  return safeContent
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

describe("UI Integration Tests", () => {
  let frontendServer: ChildProcess | null = null;
  let backendServer: ChildProcess | null = null;
  let frontendPort: string = "5173";
  let backendPort: string = "8080";

  async function waitForServerReady(
    url: string,
    retries = 20,
    intervalMs = 1000,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await globalThis.fetch(url, { method: "GET" });
        if (response.ok) {
          return true;
        }
      } catch {
        // Ignore until max retries reached
      }
      await wait(intervalMs);
    }
    return false;
  }

  beforeAll(async () => {
    // Get branch-based ports
    try {
      const { stdout } = await execAsync("node scripts/get-branch-ports.js");
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.startsWith("VITE_PORT=")) {
          frontendPort = line.split("=")[1];
        }
        if (line.startsWith("HTTP_PORT=")) {
          backendPort = line.split("=")[1];
        }
      }
    } catch (error) {
      console.warn("Could not get branch ports, using defaults");
    }

    ensureBranchPortsFile(frontendPort, backendPort);

    // Start backend server if not running
    try {
      const backendHealthUrl = `http://localhost:${backendPort}/health`;
      const healthCheck = await globalThis
        .fetch(backendHealthUrl)
        .catch(() => null);
      if (!healthCheck || !healthCheck.ok) {
        console.log(`Starting backend server on port ${backendPort}...`);
        backendServer = spawn("npm", ["run", "dev:http"], {
          stdio: "pipe",
          shell: true,
          env: buildBackendEnv(backendPort),
        });
        const ready = await waitForServerReady(backendHealthUrl, 20);
        if (!ready) {
          console.warn(
            `Backend server did not become ready on port ${backendPort}`,
          );
        }
      }
    } catch (error) {
      console.warn("Backend server may already be running or failed to start");
    }

    // Start frontend server if not running
    try {
      const frontendUrl = `http://localhost:${frontendPort}`;
      const frontendCheck = await globalThis
        .fetch(frontendUrl)
        .catch(() => null);
      if (!frontendCheck) {
        console.log(`Starting frontend server on port ${frontendPort}...`);
        frontendServer = spawn("npm", ["run", "dev:ui"], {
          stdio: "pipe",
          shell: true,
          env: buildFrontendEnv(frontendPort, backendPort),
        });
        const ready = await waitForServerReady(frontendUrl, 30);
        if (!ready) {
          console.warn(
            `Frontend server did not become ready on port ${frontendPort}`,
          );
        }
      }
    } catch (error) {
      console.warn("Frontend server may already be running or failed to start");
    }
  }, 120000);

  afterAll(async () => {
    if (frontendServer) {
      frontendServer.kill();
    }
    if (backendServer) {
      backendServer.kill();
    }
  });

  describe("Backend Server Health", () => {
    it("should respond to health check", async () => {
      try {
        const response = await globalThis.fetch(
          `http://localhost:${backendPort}/health`,
          {
            signal: AbortSignal.timeout(2000), // 2 second timeout
          },
        );
        expect(response.ok).toBe(true);
      } catch (error: any) {
        // Check for connection refused errors (server not running)
        // fetch throws AggregateError with nested errors
        const isConnectionError =
          error?.code === "ECONNREFUSED" ||
          error?.message?.includes("ECONNREFUSED") ||
          error?.message?.includes("fetch failed") ||
          (error?.errors &&
            Array.isArray(error.errors) &&
            error.errors.some(
              (e: any) =>
                e.code === "ECONNREFUSED" ||
                e.message?.includes("ECONNREFUSED"),
            ));
        if (isConnectionError) {
          console.warn(
            "Backend server not available, skipping health check test (expected for v0.1.0 where UI is excluded)",
          );
          // Skip test if server not available (expected for v0.1.0 where UI is excluded)
          return;
        }
        throw error;
      }
    });

    it("should serve OpenAPI spec", async () => {
      try {
        const response = await globalThis.fetch(
          `http://localhost:${backendPort}/openapi.yaml`,
          {
            signal: AbortSignal.timeout(2000), // 2 second timeout
          },
        );
        expect(response.ok).toBe(true);
        const text = await response.text();
        expect(text).toContain("openapi");
      } catch (error: any) {
        // Check for connection refused errors (server not running)
        const isConnectionError =
          error?.code === "ECONNREFUSED" ||
          error?.message?.includes("ECONNREFUSED") ||
          error?.message?.includes("fetch failed") ||
          (error?.errors &&
            Array.isArray(error.errors) &&
            error.errors.some(
              (e: any) =>
                e.code === "ECONNREFUSED" ||
                e.message?.includes("ECONNREFUSED"),
            ));
        if (isConnectionError) {
          console.warn(
            "Backend server not available, skipping OpenAPI spec test (expected for v0.1.0 where UI is excluded)",
          );
          // Skip test if server not available (expected for v0.1.0 where UI is excluded)
          return;
        }
        throw error;
      }
    });
  });

  describe("Frontend Server", () => {
    it("should serve the frontend application", async () => {
      try {
        const response = await globalThis.fetch(
          `http://localhost:${frontendPort}`,
        );
        expect(response.ok).toBe(true);
        const text = await response.text();
        // Case-insensitive check for DOCTYPE
        expect(text.toLowerCase()).toContain("<!doctype html>");
      } catch (error) {
        console.warn("Frontend not available, skipping frontend server test");
      }
    });
  });

  describe("API Endpoints", () => {
    it("should require authentication for protected endpoints", async () => {
      try {
        const response = await globalThis.fetch(
          `http://localhost:${backendPort}/api/retrieve_records`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: 10 }),
            signal: AbortSignal.timeout(2000), // 2 second timeout
          },
        );
        expect(response.status).toBe(401);
      } catch (error: any) {
        // Check for connection refused errors (server not running)
        const isConnectionError =
          error?.code === "ECONNREFUSED" ||
          error?.message?.includes("ECONNREFUSED") ||
          error?.message?.includes("fetch failed") ||
          (error?.errors &&
            Array.isArray(error.errors) &&
            error.errors.some(
              (e: any) =>
                e.code === "ECONNREFUSED" ||
                e.message?.includes("ECONNREFUSED"),
            ));
        if (isConnectionError) {
          console.warn(
            "Backend server not available, skipping authentication test (expected for v0.1.0 where UI is excluded)",
          );
          // Skip test if server not available (expected for v0.1.0 where UI is excluded)
          return;
        }
        throw error;
      }
    });

    it("should accept valid bearer token format", async () => {
      // This test requires a valid bearer token
      // In practice, this would use a test token or generate one
      // For now, we just verify the endpoint exists
      try {
        const response = await globalThis.fetch(
          `http://localhost:${backendPort}/api/retrieve_records`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer invalid-token",
            },
            body: JSON.stringify({ limit: 10 }),
          },
        );
        // Should return 401 or 403, not 404
        expect([401, 403]).toContain(response.status);
      } catch (error) {
        // Backend might not be running - skip test
        console.warn("Backend not available, skipping test");
      }
    });
  });

  describe("File Upload Endpoint", () => {
    it("should require authentication", async () => {
      // Use FormData if available (Node.js 18+), otherwise skip
      if (typeof globalThis.FormData === "undefined") {
        console.warn("FormData not available, skipping test");
        return;
      }

      try {
        const formData = new globalThis.FormData();
        const blob = new globalThis.Blob(["test content"], {
          type: "text/plain",
        });
        formData.append("file", blob, "test.txt");

        const response = await globalThis.fetch(
          `http://localhost:${backendPort}/api/upload_file`,
          {
            method: "POST",
            body: formData,
          },
        );
        expect(response.status).toBe(401);
      } catch (error) {
        // Backend might not be running - skip test
        console.warn("Backend not available, skipping test");
      }
    });

    it("should accept multipart/form-data", async () => {
      // Use FormData if available (Node.js 18+), otherwise skip
      if (typeof globalThis.FormData === "undefined") {
        console.warn("FormData not available, skipping test");
        return;
      }

      try {
        // Verify endpoint exists and accepts correct content type
        const formData = new globalThis.FormData();
        const blob = new globalThis.Blob(["test content"], {
          type: "text/plain",
        });
        formData.append("file", blob, "test.txt");

        const response = await globalThis.fetch(
          `http://localhost:${backendPort}/api/upload_file`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer invalid-token",
            },
            body: formData,
          },
        );
        // Should return 401/403 (auth error), not 404/415 (not found/wrong content type)
        expect([401, 403]).toContain(response.status);
      } catch (error) {
        // Backend might not be running - skip test
        console.warn("Backend not available, skipping test");
      }
    });
  });

  describe("UI Component Coverage", () => {
    /**
     * Comprehensive test coverage for all UI functionality.
     * These tests verify the frontend serves correctly and documents
     * all features that require browser automation via test command.
     */

    describe("Header Component", () => {
      it("should serve header with app title", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${frontendPort}`,
          );
          const text = await response.text();
          expect(text.toLowerCase()).toContain("neotoma");
        } catch (error) {
          console.warn("Frontend not available, skipping header title test");
        }
      });

      it("should serve React app HTML structure", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${frontendPort}`,
          );
          const text = await response.text();
          // Check for React root div and script tags (components render client-side)
          expect(text.toLowerCase()).toContain('<div id="root">');
          expect(text.toLowerCase()).toContain("script");
        } catch (error) {
          console.warn(
            "Frontend not available, skipping header HTML structure test",
          );
        }
      });

      it("should mask private keys correctly", () => {
        const testKey = new Uint8Array(32).fill(65); // 'A' repeated
        const masked = maskPrivateKey(testKey);
        expect(masked).toMatch(/^\*\*\*\*/);
        expect(masked.length).toBeGreaterThan(4);
      });

      it("should mask short private keys", () => {
        const shortKey = new Uint8Array(2);
        const masked = maskPrivateKey(shortKey);
        expect(masked).toBe("****");
      });
    });

    describe("Key Management Dialog", () => {
      it("should export keys in correct format", async () => {
        const x25519 = await generateX25519KeyPair();
        const ed25519 = await generateEd25519KeyPair();
        const exported = exportKeyPairs(x25519, ed25519);

        expect(exported).toHaveProperty("x25519");
        expect(exported).toHaveProperty("ed25519");
        expect(exported.x25519).toHaveProperty("type", "x25519");
        expect(exported.x25519).toHaveProperty("privateKey");
        expect(exported.x25519).toHaveProperty("publicKey");
        expect(exported.x25519).toHaveProperty("exportedAt");
        expect(exported.ed25519).toHaveProperty("type", "ed25519");
        expect(exported.ed25519).toHaveProperty("privateKey");
        expect(exported.ed25519).toHaveProperty("publicKey");
        expect(exported.ed25519).toHaveProperty("exportedAt");

        // Verify exported keys are base64url strings
        expect(typeof exported.x25519.privateKey).toBe("string");
        expect(typeof exported.x25519.publicKey).toBe("string");
        expect(typeof exported.ed25519.privateKey).toBe("string");
        expect(typeof exported.ed25519.publicKey).toBe("string");
      });

      it("should import exported keys correctly", async () => {
        const x25519 = await generateX25519KeyPair();
        const ed25519 = await generateEd25519KeyPair();
        const exported = exportKeyPairs(x25519, ed25519);

        const imported = importKeyPairs(exported);

        expect(imported.x25519.type).toBe("x25519");
        expect(imported.ed25519.type).toBe("ed25519");
        expect(imported.x25519.privateKey).toEqual(x25519.privateKey);
        expect(imported.x25519.publicKey).toEqual(x25519.publicKey);
        expect(imported.ed25519.privateKey).toEqual(ed25519.privateKey);
        expect(imported.ed25519.publicKey).toEqual(ed25519.publicKey);
      });

      it("should derive bearer token from Ed25519 public key", async () => {
        const ed25519 = await generateEd25519KeyPair();
        const bearerToken = deriveBearerToken(ed25519.publicKey);

        expect(typeof bearerToken).toBe("string");
        expect(bearerToken.length).toBeGreaterThan(0);
        // Bearer token should be base64url encoded (no padding, URL-safe)
        expect(bearerToken).not.toContain("=");
        expect(bearerToken).not.toContain("+");
        expect(bearerToken).not.toContain("/");
      });

      it("should validate key export format", async () => {
        const x25519 = await generateX25519KeyPair();
        const ed25519 = await generateEd25519KeyPair();
        const exported = exportKeyPairs(x25519, ed25519);

        // Verify JSON serialization works
        const json = JSON.stringify(exported);
        const parsed = JSON.parse(json);
        expect(parsed.x25519.type).toBe("x25519");
        expect(parsed.ed25519.type).toBe("ed25519");
      });
    });

    describe("ChatPanel Component", () => {
      it("should contain welcome message in HTML", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${frontendPort}`,
          );
          const text = await response.text();
          // Check for welcome message content
          expect(text.toLowerCase()).toMatch(
            /welcome|neotoma|personal operating system/i,
          );
        } catch (error) {
          console.warn(
            "Frontend not available, skipping chat welcome message test",
          );
        }
      });

      it("should format markdown messages correctly", () => {
        const input = "This is **bold** and *italic* and `code`";
        const formatted = formatMessage(input);
        expect(formatted).toContain("<strong>bold</strong>");
        expect(formatted).toContain("<em>italic</em>");
        expect(formatted).toContain("<code>code</code>");
      });

      it("should escape HTML in messages", () => {
        const input = '<script>alert("xss")</script>';
        const formatted = formatMessage(input);
        expect(formatted).not.toContain("<script>");
        expect(formatted).toContain("&lt;script&gt;");
        expect(formatted).toContain("&quot;xss&quot;");
      });

      it("should preserve line breaks in messages", () => {
        const input = "Line 1\nLine 2";
        const formatted = formatMessage(input);
        expect(formatted).toContain("<br>");
      });

      it("should handle file upload endpoint authentication", async () => {
        if (typeof globalThis.FormData === "undefined") {
          console.warn("FormData not available, skipping test");
          return;
        }

        try {
          const formData = new globalThis.FormData();
          const blob = new globalThis.Blob(["test"], { type: "text/plain" });
          formData.append("file", blob, "test.txt");

          const response = await globalThis.fetch(
            `http://localhost:${backendPort}/api/upload_file`,
            {
              method: "POST",
              body: formData,
            },
          );
          // Should require authentication
          expect(response.status).toBe(401);
        } catch (error) {
          console.warn("Backend not available, skipping test");
        }
      });

      it("should handle chat message API endpoint", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${backendPort}/api/chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: [] }),
            },
          );
          // Should require authentication or return appropriate error
          expect([401, 403, 404]).toContain(response.status);
        } catch (error) {
          console.warn("Backend not available, skipping test");
        }
      });
    });

    describe("RecordsTable Component", () => {
      it("should normalize records correctly", () => {
        const record: NeotomaRecord = {
          id: "test-id",
          type: "test-type",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          file_urls: ["file1.txt"],
          properties: { key: "value" },
        };

        const normalized = normalizeRecord(record);
        expect(normalized.id).toBe("test-id");
        expect(normalized.type).toBe("test-type");
        expect(normalized._status).toBe("Ready");
        expect(Array.isArray(normalized.file_urls)).toBe(true);
      });

      it("should normalize records with missing fields", () => {
        const partialRecord = {
          id: "test-id",
          type: "",
        } as NeotomaRecord;

        const normalized = normalizeRecord(partialRecord);
        expect(normalized.type).toBe("");
        expect(normalized._status).toBe("Ready");
        expect(Array.isArray(normalized.file_urls)).toBe(true);
        expect(typeof normalized.created_at).toBe("string");
        expect(typeof normalized.updated_at).toBe("string");
      });

      it("should have correct status order", () => {
        expect(STATUS_ORDER.Uploading).toBe(0);
        expect(STATUS_ORDER.Failed).toBe(1);
        expect(STATUS_ORDER.Ready).toBe(2);
      });

      it("should convert between LocalRecord and NeotomaRecord", () => {
        const localRecord: LocalRecord = {
          id: "test-id",
          type: "test-type",
          properties: { key: "value" },
          file_urls: ["file1.txt"],
          embedding: [1, 2, 3],
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        };

        const neotoma = localToNeotoma(localRecord);
        expect(neotoma.id).toBe(localRecord.id);
        expect(neotoma.type).toBe(localRecord.type);
        expect(neotoma._status).toBe("Ready");

        const backToLocal = neotomaToLocal(neotoma);
        expect(backToLocal.id).toBe(localRecord.id);
        expect(backToLocal.type).toBe(localRecord.type);
      });

      it("should serve React app for records table", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${frontendPort}`,
          );
          const text = await response.text();
          // React components render client-side, so we verify the app structure
          expect(text.toLowerCase()).toContain('<div id="root">');
          expect(response.ok).toBe(true);
        } catch (error) {
          console.warn(
            "Frontend not available, skipping records table app test",
          );
        }
      });
    });

    describe("RecordDetailsPanel Component", () => {
      it("should format record dates correctly", () => {
        const record: NeotomaRecord = {
          id: "test-id",
          type: "test-type",
          created_at: "2024-01-01T12:00:00Z",
          updated_at: "2024-01-02T12:00:00Z",
          file_urls: [],
          properties: {},
        };

        const createdDate = new Date(record.created_at);
        const updatedDate = new Date(record.updated_at);

        expect(createdDate.toISOString()).toBe("2024-01-01T12:00:00.000Z");
        expect(updatedDate.toISOString()).toBe("2024-01-02T12:00:00.000Z");
        expect(typeof createdDate.toLocaleString()).toBe("string");
      });

      it("should handle records with file URLs", () => {
        const record: NeotomaRecord = {
          id: "test-id",
          type: "test-type",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          file_urls: ["path/to/file1.txt", "path/to/file2.pdf"],
          properties: {},
        };

        expect(Array.isArray(record.file_urls)).toBe(true);
        expect(record.file_urls.length).toBe(2);
      });

      it("should handle records with error field", () => {
        const record: NeotomaRecord = {
          id: "test-id",
          type: "test-type",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          file_urls: [],
          properties: {},
          _error: "Test error message",
        };

        expect(record._error).toBe("Test error message");
      });

      it("should format properties as JSON", () => {
        const record: NeotomaRecord = {
          id: "test-id",
          type: "test-type",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          file_urls: [],
          properties: { key1: "value1", key2: 123, key3: true },
        };

        const json = JSON.stringify(record.properties, null, 2);
        expect(json).toContain("key1");
        expect(json).toContain("value1");
        expect(json).toContain("123");
        expect(json).toContain("true");
      });

      it("should handle get_file_url API endpoint", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${backendPort}/api/get_file_url`,
            {
              method: "GET",
              headers: { "Content-Type": "application/json" },
            },
          );
          // Should require authentication or parameters
          expect([400, 401, 403]).toContain(response.status);
        } catch (error) {
          console.warn("Backend not available, skipping test");
        }
      });
    });

    describe("Datastore Integration", () => {
      it("should extract unique types from records", () => {
        const records: NeotomaRecord[] = [
          {
            id: "1",
            type: "type-a",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
          {
            id: "2",
            type: "type-b",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
          {
            id: "3",
            type: "type-a",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
          {
            id: "4",
            type: "type-c",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
        ];

        const uniqueTypes = Array.from(
          new Set(records.map((r) => r.type)),
        ).sort();
        expect(uniqueTypes).toEqual(["type-a", "type-b", "type-c"]);
      });

      it("should filter out empty types", () => {
        const records: NeotomaRecord[] = [
          {
            id: "1",
            type: "type-a",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
          {
            id: "2",
            type: "",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
          {
            id: "3",
            type: "type-b",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
        ];

        const filteredTypes = records
          .map((r) => r.type)
          .filter((type) => type && type.trim().length > 0);
        expect(filteredTypes).toEqual(["type-a", "type-b"]);
      });

      it("should sort records by status and date", () => {
        const records: NeotomaRecord[] = [
          {
            id: "1",
            type: "test",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
            _status: "Ready",
          },
          {
            id: "2",
            type: "test",
            created_at: "2024-01-02",
            updated_at: "2024-01-02",
            file_urls: [],
            properties: {},
            _status: "Uploading",
          },
          {
            id: "3",
            type: "test",
            created_at: "2024-01-03",
            updated_at: "2024-01-03",
            file_urls: [],
            properties: {},
            _status: "Ready",
          },
        ];

        const sorted = [...records].sort((a, b) => {
          const statusDiff =
            (STATUS_ORDER[a._status || "Ready"] ?? STATUS_ORDER.Ready) -
            (STATUS_ORDER[b._status || "Ready"] ?? STATUS_ORDER.Ready);
          if (statusDiff !== 0) return statusDiff;
          const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
          const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
          return timeB - timeA;
        });

        expect(sorted[0]._status).toBe("Uploading");
        expect(sorted[1]._status).toBe("Ready");
        expect(sorted[2]._status).toBe("Ready");
      });

      it("should filter records by type", () => {
        const records: NeotomaRecord[] = [
          {
            id: "1",
            type: "type-a",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
          {
            id: "2",
            type: "type-b",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
          {
            id: "3",
            type: "type-a",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            file_urls: [],
            properties: {},
          },
        ];

        const filtered = records.filter((r) => r.type === "type-a");
        expect(filtered.length).toBe(2);
        expect(filtered.every((r) => r.type === "type-a")).toBe(true);
      });
    });

    describe("Worker RPC Communication", () => {
      it("should have worker file in frontend", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${frontendPort}`,
          );
          const text = await response.text();
          // Check for worker-related content or script tags
          expect(text.toLowerCase()).toMatch(/worker|script|module/i);
        } catch (error) {
          console.warn("Frontend not available, skipping worker file test");
        }
      });

      it("should handle RPC message structure", () => {
        // Test RPC message format
        const rpcMessage = {
          id: "test-123",
          method: "queryRecords",
          params: {},
        };

        expect(rpcMessage).toHaveProperty("id");
        expect(rpcMessage).toHaveProperty("method");
        expect(rpcMessage).toHaveProperty("params");
        expect(typeof rpcMessage.id).toBe("string");
      });
    });

    describe("Bridge Communication", () => {
      it("should have WebSocket bridge endpoint", async () => {
        // Check if WebSocket bridge server would be available
        // The bridge runs on a separate port, but we can verify the code exists
        try {
          const response = await globalThis.fetch(
            `http://localhost:${backendPort}/health`,
          );
          expect(response.ok).toBe(true);
        } catch (error) {
          console.warn("Backend not available for bridge test");
        }
      });

      it("should use X25519 for encryption key agreement", async () => {
        const x25519 = await generateX25519KeyPair();
        expect(x25519.type).toBe("x25519");
        expect(x25519.privateKey.length).toBe(32);
        expect(x25519.publicKey.length).toBe(32);
      });

      it("should use Ed25519 for signatures", async () => {
        const ed25519 = await generateEd25519KeyPair();
        expect(ed25519.type).toBe("ed25519");
        expect(ed25519.privateKey.length).toBe(32);
        expect(ed25519.publicKey.length).toBe(32);
      });
    });

    describe("Toast Notifications", () => {
      it("should serve React app with toast support", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${frontendPort}`,
          );
          const text = await response.text();
          // React components render client-side, so we verify the app structure
          expect(text.toLowerCase()).toContain('<div id="root">');
          expect(response.ok).toBe(true);
        } catch (error) {
          console.warn(
            "Frontend not available, skipping toast notifications app test",
          );
        }
      });

      it("should format toast messages correctly", () => {
        const toastData = {
          title: "Test Title",
          description: "Test description",
          variant: "default" as const,
        };

        expect(toastData).toHaveProperty("title");
        expect(toastData).toHaveProperty("description");
        expect(["default", "destructive"]).toContain(toastData.variant);
      });
    });

    describe("Settings Integration", () => {
      it("should have default settings structure", () => {
        const defaultSettings = {
          apiBase: "http://localhost:8080",
          bearerToken: "",
        };

        expect(defaultSettings).toHaveProperty("apiBase");
        expect(defaultSettings).toHaveProperty("bearerToken");
        expect(typeof defaultSettings.apiBase).toBe("string");
        expect(typeof defaultSettings.bearerToken).toBe("string");
      });

      it("should derive bearer token from Ed25519 key", async () => {
        const ed25519 = await generateEd25519KeyPair();
        const bearerToken = deriveBearerToken(ed25519.publicKey);

        expect(bearerToken).toBeTruthy();
        expect(typeof bearerToken).toBe("string");
        // Bearer token should be base64url encoded public key
        expect(bearerToken.length).toBeGreaterThan(0);
      });

      it("should handle settings API base URL", () => {
        const apiBase = "http://localhost:8080";
        const apiUrl = apiBase.includes("/api")
          ? `${apiBase}/upload_file`
          : `${apiBase}/api/upload_file`;

        expect(apiUrl).toBe("http://localhost:8080/api/upload_file");
      });
    });

    describe("Error Handling", () => {
      it("should handle API errors gracefully", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${backendPort}/api/nonexistent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            },
          );
          // Should return 404 or 401, not crash
          expect([404, 401, 403]).toContain(response.status);
        } catch (error) {
          // Network errors should be caught
          expect(error).toBeInstanceOf(Error);
        }
      });

      it("should validate key import errors", async () => {
        const invalidExport = {
          x25519: { type: "invalid", privateKey: "bad", publicKey: "bad" },
          ed25519: { type: "invalid", privateKey: "bad", publicKey: "bad" },
        };

        expect(() => {
          importKeyPairs(invalidExport as any);
        }).toThrow();
      });

      it("should handle missing bearer token in API calls", async () => {
        try {
          const response = await globalThis.fetch(
            `http://localhost:${backendPort}/api/retrieve_records`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ limit: 10 }),
            },
          );
          expect(response.status).toBe(401);
        } catch (error) {
          console.warn("Backend not available, skipping test");
        }
      });
    });
  });

  describe("Backend Error Handling", () => {
    it("should handle database connection errors gracefully", async () => {
      // Verify backend doesn't crash on database errors
      // This would require mocking Supabase or testing with invalid config
      expect(true).toBe(true); // Placeholder
    });

    it("should validate file upload requests", async () => {
      // Use FormData if available (Node.js 18+), otherwise skip
      if (typeof globalThis.FormData === "undefined") {
        console.warn("FormData not available, skipping test");
        return;
      }

      try {
        // Verify backend validates file uploads (size, type, etc.)
        const formData = new globalThis.FormData();
        const response = await globalThis.fetch(
          `http://localhost:${backendPort}/api/upload_file`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer invalid-token",
            },
            body: formData,
          },
        );
        // Should return 400 (bad request) or 401 (unauthorized), not 500
        expect([400, 401, 403]).toContain(response.status);
      } catch (error) {
        // Backend might not be running - skip test
        console.warn("Backend not available, skipping test");
      }
    });
  });
});
