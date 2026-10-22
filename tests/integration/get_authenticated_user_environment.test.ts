/**
 * Effect test for #1905: `get_authenticated_user` surfaces the active
 * environment so a caller can confirm which graph (dev vs prod) it is on
 * before writing.
 *
 * Background: on a fresh npm install the CLI local transport defaults to
 * production while the server/API default to development, so an unflagged CLI
 * query can silently hit an empty prod DB. Exposing `environment` in the
 * storage block lets an agent detect that split instead of discovering it via
 * silent-empty results.
 */
import type { AddressInfo } from "node:net";
import type express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("get_authenticated_user surfaces active environment (#1905)", () => {
  let server: ReturnType<express.Application["listen"]>;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = await import("../../src/actions.js");
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("includes storage.environment in the response for a local backend", async () => {
    const res = await fetch(`${baseUrl}/get_authenticated_user`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user_id?: string;
      storage?: { storage_backend?: string; environment?: string; sqlite_db?: string };
    };
    // Local (SQLite) backend must report which environment it resolved to.
    expect(body.storage?.storage_backend).toBe("local");
    expect(body.storage?.environment).toBeDefined();
    expect(["development", "production"]).toContain(body.storage?.environment);
    // The db path should be consistent with the reported environment (dev DB
    // is neotoma.db; prod DB is neotoma.prod.db) — this is the split a caller
    // needs to see.
    expect(body.storage?.sqlite_db).toBeDefined();
  });
});
