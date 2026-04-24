/**
 * Integration tests for the sandbox-mode runtime behaviors defined in
 * `src/services/sandbox_mode.ts`. Rather than respinning the full Neotoma
 * Express app with NEOTOMA_SANDBOX_MODE=1 (which would conflict with the
 * shared test server started by vitest.global_setup.ts), we mount the
 * sandbox middleware onto a minimal Express instance and exercise it via
 * HTTP. That is sufficient to lock in the contract: header stamping,
 * destructive-op gating, and mode detection.
 */

import { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isSandboxMode,
  isDestructiveSandboxRoute,
  sandboxHeaderMiddleware,
  sandboxDestructiveGuard,
} from "../../src/services/sandbox_mode.js";

describe("sandbox_mode helpers", () => {
  describe("isSandboxMode", () => {
    it("treats 1/true/yes as enabled", () => {
      expect(isSandboxMode({ NEOTOMA_SANDBOX_MODE: "1" } as NodeJS.ProcessEnv)).toBe(true);
      expect(isSandboxMode({ NEOTOMA_SANDBOX_MODE: "true" } as NodeJS.ProcessEnv)).toBe(true);
      expect(isSandboxMode({ NEOTOMA_SANDBOX_MODE: "YES" } as NodeJS.ProcessEnv)).toBe(true);
    });
    it("treats anything else as disabled", () => {
      expect(isSandboxMode({} as NodeJS.ProcessEnv)).toBe(false);
      expect(isSandboxMode({ NEOTOMA_SANDBOX_MODE: "0" } as NodeJS.ProcessEnv)).toBe(false);
      expect(isSandboxMode({ NEOTOMA_SANDBOX_MODE: "false" } as NodeJS.ProcessEnv)).toBe(false);
      expect(isSandboxMode({ NEOTOMA_SANDBOX_MODE: "" } as NodeJS.ProcessEnv)).toBe(false);
    });
  });

  describe("isDestructiveSandboxRoute", () => {
    it("identifies admin endpoints as destructive", () => {
      expect(isDestructiveSandboxRoute("/entities/merge")).toBe(true);
      expect(isDestructiveSandboxRoute("/entities/split")).toBe(true);
      expect(isDestructiveSandboxRoute("/recompute_snapshots_by_type")).toBe(true);
      expect(isDestructiveSandboxRoute("/health_check_snapshots")).toBe(true);
      expect(isDestructiveSandboxRoute("/update_schema_incremental")).toBe(true);
    });
    it("leaves soft-delete and ordinary routes alone", () => {
      expect(isDestructiveSandboxRoute("/delete_entity")).toBe(false);
      expect(isDestructiveSandboxRoute("/delete_relationship")).toBe(false);
      expect(isDestructiveSandboxRoute("/store_structured")).toBe(false);
      expect(isDestructiveSandboxRoute("/health")).toBe(false);
    });
  });
});

describe("sandbox_mode middleware", () => {
  const app = express();
  app.use(sandboxHeaderMiddleware);
  app.use(sandboxDestructiveGuard);
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.post("/entities/merge", (_req, res) => res.json({ ok: true }));
  app.post("/store_structured", (_req, res) => res.json({ ok: true }));

  let baseUrl = "";
  let server: ReturnType<typeof app.listen>;
  const originalMode = process.env.NEOTOMA_SANDBOX_MODE;

  beforeAll(async () => {
    process.env.NEOTOMA_SANDBOX_MODE = "1";
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (originalMode === undefined) {
      delete process.env.NEOTOMA_SANDBOX_MODE;
    } else {
      process.env.NEOTOMA_SANDBOX_MODE = originalMode;
    }
  });

  it("stamps X-Neotoma-Sandbox on every response", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-neotoma-sandbox")).toBe("1");
  });

  it("returns 403 SANDBOX_DISABLED for destructive routes when sandbox mode is on", async () => {
    const res = await fetch(`${baseUrl}/entities/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error_code: string;
      message: string;
      details: { docs: string; weekly_reset: string };
    };
    expect(body.error_code).toBe("SANDBOX_DISABLED");
    expect(body.message).toMatch(/sandbox/i);
    expect(body.details.weekly_reset).toBe("Sunday 00:00 UTC");
    expect(res.headers.get("x-neotoma-sandbox")).toBe("1");
  });

  it("passes through non-destructive write routes", async () => {
    const res = await fetch(`${baseUrl}/store_structured`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(res.headers.get("x-neotoma-sandbox")).toBe("1");
  });

  it("falls through destructive-guard when sandbox mode is off", async () => {
    const originalValue = process.env.NEOTOMA_SANDBOX_MODE;
    delete process.env.NEOTOMA_SANDBOX_MODE;
    try {
      const res = await fetch(`${baseUrl}/entities/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    } finally {
      if (originalValue !== undefined) process.env.NEOTOMA_SANDBOX_MODE = originalValue;
    }
  });
});
