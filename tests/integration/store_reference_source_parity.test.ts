/**
 * Cross-surface contract-parity matrix for `source_storage:'reference'` store.
 *
 * Retrospective ent_68a9270e2e656da847c10ced: the by-reference source-storage
 * feature shipped incomplete to an evaluator across three releases because
 * contract parity across Neotoma's surfaces (MCP, REST, CLI, SDK) was never
 * tested. Sibling tests (mcp_store_reference_source.test.ts,
 * http_store_reference_source.test.ts) each cover ONE surface in isolation;
 * this test drives the SAME scenario across BOTH the MCP `store` tool dispatch
 * and the REST `POST /store` route via a shared parity-matrix helper, asserting
 * an IDENTICAL effect (storage_mode='reference' in the sources row) for the
 * file-only shape AND the combined entities[]+file shape.
 *
 * Implements task_policy:
 *   - cross_surface_contract_parity_tested_all_surfaces (ent_2ad0677fe23c0c1878ae43e8)
 *   - fixed_means_behavior_verified_not_contract_accepted (ent_db0b7855d47012084477fb00)
 */

import { createServer } from "node:http";
import fs from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import {
  makeReferenceTempFile,
  readSourceStorageMode,
  REFERENCE_PARITY_MATRIX,
  storeReferenceViaMcp,
  storeReferenceViaRest,
} from "../helpers/store_reference_parity.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const API_PORT = 18123;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

describe("store source_storage:'reference' — MCP↔REST contract parity (#1826 retrospective)", () => {
  let httpServer: ReturnType<typeof createServer>;
  let mcpServer: NeotomaServer;
  const createdSourceIds: string[] = [];
  const tempDirs: string[] = [];

  beforeAll(async () => {
    // REST surface: real Express app over HTTP.
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    // MCP surface: NeotomaServer dispatch (the same path `/mcp` tools/call routes
    // a `store` call into). Inject the test user so no real auth token is needed.
    mcpServer = new NeotomaServer();
    (mcpServer as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
    for (const dir of tempDirs) {
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  for (const scenario of REFERENCE_PARITY_MATRIX) {
    it(`${scenario.label} → storage_mode=reference on the sources row`, async () => {
      const withEntities = scenario.shape === "file+entities";
      const tag = `${scenario.surface}-${scenario.shape}`;
      const filePath = makeReferenceTempFile(
        tempDirs,
        `parity-${tag}-${Date.now()}`,
        `parity-${tag}.txt`
      );
      const idempotencyKey = `parity-${tag}-${Date.now()}`;

      const result =
        scenario.surface === "mcp"
          ? await storeReferenceViaMcp(mcpServer, {
              userId: TEST_USER_ID,
              filePath,
              idempotencyKey,
              withEntities,
            })
          : await storeReferenceViaRest(API_BASE, {
              userId: TEST_USER_ID,
              filePath,
              idempotencyKey,
              withEntities,
            });

      // 1. The surface's response envelope reports reference mode.
      expect(result.reportedStorageMode).toBe("reference");
      expect(typeof result.sourceId).toBe("string");
      createdSourceIds.push(result.sourceId);

      // 2. The EFFECT: the persisted sources row carries storage_mode='reference'
      //    — identical outcome regardless of surface or input shape.
      const persistedMode = await readSourceStorageMode(result.sourceId);
      expect(persistedMode).toBe("reference");
    });
  }

  it("MCP and REST produce the identical persisted storage_mode for the same scenario", async () => {
    // Drive the file-only scenario on both surfaces and assert the persisted
    // effect is byte-for-byte the same value — this is the parity guarantee,
    // not just that each surface independently "works".
    const mcpFile = makeReferenceTempFile(tempDirs, `parity-cmp-mcp-${Date.now()}`, "cmp-mcp.txt");
    const restFile = makeReferenceTempFile(
      tempDirs,
      `parity-cmp-rest-${Date.now()}`,
      "cmp-rest.txt"
    );

    const mcp = await storeReferenceViaMcp(mcpServer, {
      userId: TEST_USER_ID,
      filePath: mcpFile,
      idempotencyKey: `parity-cmp-mcp-${Date.now()}`,
      withEntities: false,
    });
    const rest = await storeReferenceViaRest(API_BASE, {
      userId: TEST_USER_ID,
      filePath: restFile,
      idempotencyKey: `parity-cmp-rest-${Date.now()}`,
      withEntities: false,
    });
    createdSourceIds.push(mcp.sourceId, rest.sourceId);

    const mcpMode = await readSourceStorageMode(mcp.sourceId);
    const restMode = await readSourceStorageMode(rest.sourceId);
    expect(mcpMode).toBe("reference");
    expect(restMode).toBe(mcpMode);
  });
});
