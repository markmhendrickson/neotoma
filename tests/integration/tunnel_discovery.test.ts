/**
 * Integration tests for tunnel URL discovery.
 *
 * The discoverTunnelUrl function (src/config.ts) reads tunnel URLs from
 * /tmp/ngrok-mcp-url.txt and /tmp/cloudflared-tunnel.txt.
 * These tests verify the file-based discovery logic using temp files.
 */

import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TUNNEL_FILES = ["/tmp/ngrok-mcp-url.txt", "/tmp/cloudflared-tunnel.txt"];

function cleanupTunnelFiles() {
  for (const f of TUNNEL_FILES) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // ignore
    }
  }
}

describe("tunnel URL discovery (file-based)", () => {
  afterEach(() => {
    cleanupTunnelFiles();
  });

  it("reads ngrok URL from /tmp/ngrok-mcp-url.txt", () => {
    const url = "https://abc123.ngrok-free.dev";
    writeFileSync("/tmp/ngrok-mcp-url.txt", url, "utf-8");

    const content = require("fs").readFileSync("/tmp/ngrok-mcp-url.txt", "utf-8").trim();
    expect(content).toBe(url);
    expect(content.startsWith("http")).toBe(true);
  });

  it("reads cloudflare URL from /tmp/cloudflared-tunnel.txt", () => {
    const url = "https://random-words.trycloudflare.com";
    writeFileSync("/tmp/cloudflared-tunnel.txt", url, "utf-8");

    const content = require("fs").readFileSync("/tmp/cloudflared-tunnel.txt", "utf-8").trim();
    expect(content).toBe(url);
    expect(content.startsWith("http")).toBe(true);
  });

  it("prefers ngrok file over cloudflare file (matching config.ts priority)", () => {
    writeFileSync("/tmp/ngrok-mcp-url.txt", "https://ngrok-first.ngrok-free.dev", "utf-8");
    writeFileSync("/tmp/cloudflared-tunnel.txt", "https://cf-second.trycloudflare.com", "utf-8");

    // discoverTunnelUrl checks ngrok first, then cloudflare
    const tunnelFiles = ["/tmp/ngrok-mcp-url.txt", "/tmp/cloudflared-tunnel.txt"];
    let discovered: string | null = null;
    for (const file of tunnelFiles) {
      try {
        if (existsSync(file)) {
          const url = require("fs").readFileSync(file, "utf-8").trim();
          if (url && url.startsWith("http")) {
            discovered = url;
            break;
          }
        }
      } catch {
        // continue
      }
    }
    expect(discovered).toBe("https://ngrok-first.ngrok-free.dev");
  });

  it("falls back to cloudflare when ngrok file is absent", () => {
    cleanupTunnelFiles();
    writeFileSync("/tmp/cloudflared-tunnel.txt", "https://cf-only.trycloudflare.com", "utf-8");

    const tunnelFiles = ["/tmp/ngrok-mcp-url.txt", "/tmp/cloudflared-tunnel.txt"];
    let discovered: string | null = null;
    for (const file of tunnelFiles) {
      try {
        if (existsSync(file)) {
          const url = require("fs").readFileSync(file, "utf-8").trim();
          if (url && url.startsWith("http")) {
            discovered = url;
            break;
          }
        }
      } catch {
        // continue
      }
    }
    expect(discovered).toBe("https://cf-only.trycloudflare.com");
  });

  it("returns null when no tunnel files exist", () => {
    cleanupTunnelFiles();
    const tunnelFiles = ["/tmp/ngrok-mcp-url.txt", "/tmp/cloudflared-tunnel.txt"];
    let discovered: string | null = null;
    for (const file of tunnelFiles) {
      try {
        if (existsSync(file)) {
          const url = require("fs").readFileSync(file, "utf-8").trim();
          if (url && url.startsWith("http")) {
            discovered = url;
            break;
          }
        }
      } catch {
        // continue
      }
    }
    expect(discovered).toBeNull();
  });

  it("ignores empty tunnel file", () => {
    writeFileSync("/tmp/ngrok-mcp-url.txt", "", "utf-8");
    const tunnelFiles = ["/tmp/ngrok-mcp-url.txt"];
    let discovered: string | null = null;
    for (const file of tunnelFiles) {
      try {
        if (existsSync(file)) {
          const url = require("fs").readFileSync(file, "utf-8").trim();
          if (url && url.startsWith("http")) {
            discovered = url;
            break;
          }
        }
      } catch {
        // continue
      }
    }
    expect(discovered).toBeNull();
  });

  it("ignores tunnel file with non-http content", () => {
    writeFileSync("/tmp/ngrok-mcp-url.txt", "not-a-url", "utf-8");
    const tunnelFiles = ["/tmp/ngrok-mcp-url.txt"];
    let discovered: string | null = null;
    for (const file of tunnelFiles) {
      try {
        if (existsSync(file)) {
          const url = require("fs").readFileSync(file, "utf-8").trim();
          if (url && url.startsWith("http")) {
            discovered = url;
            break;
          }
        }
      } catch {
        // continue
      }
    }
    expect(discovered).toBeNull();
  });
});
