/**
 * #1943: Integration tests for keyset (cursor) pagination in queryEntities.
 *
 * Covers the issue's acceptance criteria:
 *  - deep cursor pagination returns in ~constant time (not scaling with depth),
 *  - cursor pages tile the whole result set with no duplicates or gaps and match
 *    the equivalent offset paging,
 *  - a deep query serves a concurrent GET /health over real HTTP without wedging
 *    the event loop (NOTE: this does not reproduce the production freeze at this
 *    fixture size — see the comment on that test for measurements), and
 *  - cross-surface parity: both request-schema shapes (REST /entities/query and
 *    MCP retrieve_entities) drive the same cursor behavior through the shared
 *    queryEntitiesWithCount core, AND the actual GET /entities REST alias
 *    (query-string cursor coerced by coerceEntitiesQueryParams) tiles pages
 *    over a real HTTP request against the booted Express app.
 */

import { createServer } from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db, getServiceRoleClient } from "../../src/db.js";
import { queryEntities, computeNextCursor } from "../../src/services/entity_queries.js";
import { queryEntitiesWithCount } from "../../src/shared/action_handlers/entity_handlers.js";
import {
  EntitiesQueryRequestSchema,
  RetrieveEntitiesRequestSchema,
} from "../../src/shared/action_schemas.js";

const serviceRoleClient = getServiceRoleClient();
const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const TEST_TYPE = "cursor_probe_1943";
// Depth matches the production repro (a client paginating contacts hit offset:1300
// and froze the server for 4.8-7.5s). The concurrency regression below races a real
// /health request against a fetch at that depth, so the seed has to actually reach it.
const TOTAL = 1400;
const PAGE = 100;
/** Cursor depth the non-blocking regression exercises — the reported repro position. */
const REPRO_DEPTH = 1300;
const API_PORT = 18260;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const createdIds: string[] = [];

describe("#1943 keyset cursor pagination", () => {
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    // Seed a deterministic block of same-type entities. ids are zero-padded so
    // ascending id order is stable and predictable for assertions.
    const rows = Array.from({ length: TOTAL }, (_, i) => ({
      id: `ent_cursor1943_${String(i).padStart(5, "0")}`,
      user_id: TEST_USER_ID,
      entity_type: TEST_TYPE,
      canonical_name: `cursor probe ${String(i).padStart(5, "0")}`,
    }));

    // Clear any residue from an earlier crashed run: ids are deterministic, so a
    // beforeAll that threw mid-seed would otherwise leave rows that collide on the
    // entity_snapshots primary key and wedge every subsequent run.
    const allIds = rows.map((r) => r.id);
    for (let i = 0; i < allIds.length; i += 100) {
      const chunk = allIds.slice(i, i + 100);
      await db.from("observations").delete().in("entity_id", chunk);
      await db.from("entity_snapshots").delete().in("entity_id", chunk);
      await db.from("entities").delete().in("id", chunk);
    }

    // Insert in chunks to stay under any bind-parameter limits.
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await serviceRoleClient.from("entities").insert(chunk);
      if (error) throw new Error(`seed insert failed: ${error.message}`);
      chunk.forEach((r) => createdIds.push(r.id));
    }

    // Give every entity observations AND a snapshot. This is what makes the seed
    // actually reproduce the reported failure rather than just look like it:
    //
    // - The pre-fix cost was NOT the entity scan itself. It was `getDeletedEntityIds`
    //   running once per scanned chunk, each call reading every observation for that
    //   chunk's ids and sorting them by (source_priority, observed_at) — against bare
    //   `entities` rows with zero observations that lookup is free, and the bug does
    //   not reproduce at any depth.
    // - `include_snapshots:true` only costs something if snapshots exist to hydrate.
    //
    // OBSERVATIONS_PER_ENTITY > 1 so the priority/recency sort has real work to do,
    // matching the production shape (entities accrue many observations over time).
    const OBSERVATIONS_PER_ENTITY = 3;
    const observations = rows.flatMap((row, i) =>
      Array.from({ length: OBSERVATIONS_PER_ENTITY }, (_, k) => ({
        id: `obs_cursor1943_${String(i).padStart(5, "0")}_${k}`,
        entity_id: row.id,
        entity_type: TEST_TYPE,
        schema_version: "1.0.0",
        observed_at: new Date(Date.UTC(2026, 0, 1, 0, 0, k)).toISOString(),
        source_priority: 100 + k,
        specificity_score: 1,
        observation_source: "import",
        // Not deleted — the visible path is what the regression exercises.
        fields: JSON.stringify({ note: `cursor probe observation ${i}.${k}` }),
        created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, k)).toISOString(),
        user_id: TEST_USER_ID,
      }))
    );
    for (let i = 0; i < observations.length; i += 100) {
      const { error } = await serviceRoleClient
        .from("observations")
        .insert(observations.slice(i, i + 100));
      if (error) throw new Error(`seed observations failed: ${error.message}`);
    }

    // Snapshots carry a non-trivial payload so include_snapshots hydration is real
    // work, as it is in production (each snapshot is a JSON blob + provenance).
    const snapshots = rows.map((row, i) => ({
      entity_id: row.id,
      entity_type: TEST_TYPE,
      schema_version: "1.0.0",
      canonical_name: row.canonical_name,
      snapshot: JSON.stringify({
        note: `cursor probe observation ${i}.${OBSERVATIONS_PER_ENTITY - 1}`,
        index: i,
        filler: "x".repeat(256),
      }),
      computed_at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
      observation_count: OBSERVATIONS_PER_ENTITY,
      last_observation_at: new Date(
        Date.UTC(2026, 0, 1, 0, 0, OBSERVATIONS_PER_ENTITY - 1)
      ).toISOString(),
      provenance: JSON.stringify({ note: `obs_cursor1943_${String(i).padStart(5, "0")}_2` }),
      user_id: TEST_USER_ID,
    }));
    // upsert, not insert: entity_snapshots is keyed by entity_id, and the write
    // path may already have materialized a snapshot for these entities when the
    // observations above landed. The seed only cares that the final row is ours.
    for (let i = 0; i < snapshots.length; i += 100) {
      const { error } = await serviceRoleClient
        .from("entity_snapshots")
        .upsert(snapshots.slice(i, i + 100));
      if (error) throw new Error(`seed snapshots failed: ${error.message}`);
    }
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      for (let i = 0; i < createdIds.length; i += 100) {
        const chunk = createdIds.slice(i, i + 100);
        // Drop dependents before the entities themselves; leaving observations or
        // snapshots behind would pollute other suites sharing this DB.
        await db.from("observations").delete().in("entity_id", chunk);
        await db.from("entity_snapshots").delete().in("entity_id", chunk);
        await db.from("entities").delete().in("id", chunk);
      }
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  /** Walk the whole TEST_TYPE listing via cursor, returning the ordered ids. */
  async function walkByCursor(includeSnapshots: boolean): Promise<string[]> {
    const seen: string[] = [];
    let cursor: string | undefined;
    // Hard stop well above the real page count so a cursor bug can't loop forever.
    for (let guard = 0; guard < TOTAL / PAGE + 5; guard++) {
      const res = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots,
        limit: PAGE,
        cursor,
      });
      for (const e of res.entities) seen.push(e.entity_id);
      if (!res.next_cursor || res.entities.length === 0) break;
      cursor = res.next_cursor;
    }
    return seen;
  }

  /**
   * Page forward (lightweight, no snapshots) until `depth` rows have been passed,
   * and return the cursor positioned there — i.e. the keyset equivalent of
   * `offset: depth`. Used to put the non-blocking regression at the exact depth the
   * production repro hit. Returns undefined if the listing runs out first.
   */
  async function cursorAtDepth(depth: number): Promise<string | undefined> {
    let cursor: string | undefined;
    let passed = 0;
    while (passed < depth) {
      const res = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: false,
        limit: PAGE,
        cursor,
      });
      passed += res.entities.length;
      if (!res.next_cursor || res.entities.length === 0) return undefined;
      cursor = res.next_cursor;
    }
    return cursor;
  }


  it("cursor pages tile the full result set with no duplicates or gaps", async () => {
    const walked = await walkByCursor(false);
    const ours = walked.filter((id) => id.startsWith("ent_cursor1943_"));
    expect(ours.length).toBe(TOTAL);
    // strictly ascending, unique
    const unique = new Set(ours);
    expect(unique.size).toBe(TOTAL);
    for (let i = 1; i < ours.length; i++) {
      expect(ours[i] > ours[i - 1]).toBe(true);
    }
  });

  it("cursor walks correctly through the includeDeleted range branch", async () => {
    // #1943 (qa lens, non-blocking): includeDeleted takes a DIFFERENT code path
    // in queryEntities — the `else if (includeDeleted)` range branch, which
    // special-cases the cursor as rangeStart=0 because the seek is already on
    // entityQuery. Correct but untested; pin it given the adjacent published bug.
    // Driven through queryEntities directly: includeDeleted is an
    // EntityQueryOptions field, not surfaced by queryEntitiesWithCount.
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < TOTAL / PAGE + 5; guard++) {
      const rows = await queryEntities({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: false,
        includeDeleted: true,
        limit: PAGE,
        cursor,
      });
      for (const r of rows) seen.push(r.entity_id);
      cursor = computeNextCursor(rows, { sortBy: "entity_id", sortOrder: "asc", limit: PAGE }) ?? undefined;
      if (!cursor || rows.length === 0) break;
    }
    const ours = seen.filter((id) => id.startsWith("ent_cursor1943_"));
    // No entity in this fixture is deleted, so the range branch covers the full
    // set, ascending, no dupes — same invariant, different branch.
    expect(ours.length).toBe(TOTAL);
    expect(new Set(ours).size).toBe(TOTAL);
    for (let i = 1; i < ours.length; i++) {
      expect(ours[i] > ours[i - 1]).toBe(true);
    }
  });

  it("descending cursor pages tile the set in reverse with no duplicates or gaps", async () => {
    // The desc seek is a SEPARATE branch (`.lt("id", …)` vs `.gt(…)` in
    // entity_queries.ts) and had only codec round-trip coverage — nothing proved
    // it returns correct pages. A wrong comparison operator here would silently
    // return the SAME page forever or skip the whole listing, and every other
    // integration test walks ascending, so neither would have been caught.
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < TOTAL / PAGE + 5; guard++) {
      const res = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: false,
        sortOrder: "desc",
        limit: PAGE,
        cursor,
      });
      for (const e of res.entities) seen.push(e.entity_id);
      if (!res.next_cursor || res.entities.length === 0) break;
      cursor = res.next_cursor;
    }

    const ours = seen.filter((id) => id.startsWith("ent_cursor1943_"));
    expect(ours.length).toBe(TOTAL);
    expect(new Set(ours).size).toBe(TOTAL); // no duplicates
    // strictly DESCENDING — the inverse of the asc walk above
    for (let i = 1; i < ours.length; i++) {
      expect(ours[i] < ours[i - 1]).toBe(true);
    }
    // and it is exactly the ascending walk reversed — no gaps
    const asc = await walkByCursor(false);
    expect(ours).toEqual(asc.filter((id) => id.startsWith("ent_cursor1943_")).reverse());
  });

  it("rejects a cursor replayed under the opposite sort_order", async () => {
    // Guards the decode-time sort_order check: an asc cursor seeks with `>`, so
    // replaying it under desc would seek the wrong direction and silently return
    // rows already served rather than the next page.
    const first = await queryEntitiesWithCount({
      userId: TEST_USER_ID,
      entityType: TEST_TYPE,
      includeSnapshots: false,
      limit: PAGE,
    });
    expect(first.next_cursor).toBeDefined();

    await expect(
      queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: false,
        sortOrder: "desc", // cursor was minted asc
        limit: PAGE,
        cursor: first.next_cursor,
      })
    ).rejects.toThrow(/sort_order/i);
  });

  it("cursor paging matches offset paging over the same window", async () => {
    // First two pages via offset...
    const viaOffset: string[] = [];
    for (let off = 0; off < PAGE * 3; off += PAGE) {
      const rows = await queryEntities({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: false,
        limit: PAGE,
        offset: off,
      });
      viaOffset.push(...rows.map((r) => r.entity_id));
    }
    // ...vs the same span via cursor.
    const viaCursor: string[] = [];
    let cursor: string | undefined;
    for (let p = 0; p < 3; p++) {
      const res = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: false,
        limit: PAGE,
        cursor,
      });
      viaCursor.push(...res.entities.map((e) => e.entity_id));
      cursor = res.next_cursor;
      if (!cursor) break;
    }
    expect(viaCursor).toEqual(viaOffset);
  });

  it("next_cursor is omitted on the final (partial) page", async () => {
    // A limit larger than the remaining tail returns a partial page → no cursor.
    const res = await queryEntitiesWithCount({
      userId: TEST_USER_ID,
      entityType: TEST_TYPE,
      includeSnapshots: false,
      limit: TOTAL + 10,
    });
    expect(res.entities.length).toBeGreaterThanOrEqual(TOTAL);
    expect(res.next_cursor).toBeUndefined();
  });

  it("deep cursor pagination is ~constant time, not scaling with depth", async () => {
    // Time page 1 vs the deepest page reached by cursor. Keyset makes both O(page);
    // the old offset scan made the deep page scale with position. We assert the
    // deep page is not dramatically slower than the first — a generous bound that
    // still fails loudly if O(offset) behavior sneaks back in.
    const time = async (fn: () => Promise<unknown>) => {
      const t0 = performance.now();
      await fn();
      return performance.now() - t0;
    };

    const firstPageMs = await time(() =>
      queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: true,
        limit: PAGE,
      })
    );

    // Walk to the last cursor to get a deep starting point.
    let cursor: string | undefined;
    let last: string | undefined;
    for (let p = 0; p < TOTAL / PAGE; p++) {
      const res = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: false,
        limit: PAGE,
        cursor,
      });
      if (res.next_cursor) last = res.next_cursor;
      cursor = res.next_cursor;
      if (!cursor) break;
    }
    expect(last).toBeDefined();

    const deepPageMs = await time(() =>
      queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: TEST_TYPE,
        includeSnapshots: true,
        limit: PAGE,
        cursor: last,
      })
    );

    // Constant-time expectation with wide slack for CI jitter: the deep page must
    // not be an order of magnitude slower than the first. O(offset) at this depth
    // would blow well past this.
    const bound = Math.max(firstPageMs * 8, 250);
    expect(
      deepPageMs,
      `deep cursor page ${deepPageMs.toFixed(1)}ms vs first ${firstPageMs.toFixed(1)}ms`
    ).toBeLessThan(bound);
  });

  it("a deep include_snapshots fetch does not block a concurrent GET /health", async () => {
    // THE regression test for this issue, in the literal shape of the production
    // repro: a client paginated contacts to offset:1300 with include_snapshots,
    // and because better-sqlite3 runs synchronously on the single Node event loop,
    // /health and every other concurrent request froze for the 4.8-7.5s duration.
    //
    // Both requests are real HTTP round trips against the booted Express app — the
    // same surface the reporter hit. An in-process race would not prove the event
    // loop stays free to accept and answer a separate connection.
    //
    // HONEST SCOPE — read before trusting this as the regression gate.
    //
    // This test does NOT currently reproduce the production freeze. Measured on this
    // fixture (1400 entities × 3 observations, local SQLite): the pre-fix offset
    // scan-and-discard costs ~10.7ms at offset:0 and ~13.4ms at offset:1300 — flat,
    // and three orders of magnitude below the 4.8-7.5s production symptom. Reverting
    // the keyset seek and re-running leaves this test GREEN.
    //
    // Why: the offset scan's cost is dominated by getDeletedEntityIds and snapshot
    // hydration over a table whose absolute size dwarfs the page. Production had
    // ~100k+ observations behind a contact listing; 4,200 rows on a local file-backed
    // SQLite is simply too small for the O(offset) term to surface above noise.
    //
    // So what this test IS: a guard that the cursor path answers a deep page and
    // serves a concurrent /health over real HTTP without wedging the loop. That is
    // worth keeping. What it is NOT: proof the fix works, per policy
    // fixed_means_behavior_verified_not_contract_accepted (ent_db0b7855d47012084477fb00).
    // Closing that gap needs a fixture at production scale — tracked in #1947 rather
    // than faked with a bound tuned to pass.
    const HEALTH_BOUND_MS = 200;

    // Walk to the repro depth by cursor, then issue the deep fetch from there.
    const deepCursor = await cursorAtDepth(REPRO_DEPTH);
    expect(deepCursor, `expected a cursor at depth ${REPRO_DEPTH}`).toBeDefined();

    // Prime the connection so we time the server, not TCP/DNS setup.
    await fetch(`${API_BASE}/health`);

    // Fire the deep, snapshot-hydrating page WITHOUT awaiting it...
    const deepFetch = fetch(`${API_BASE}/entities/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity_type: TEST_TYPE,
        include_snapshots: true,
        limit: PAGE,
        cursor: deepCursor,
        user_id: TEST_USER_ID,
      }),
    });

    // ...and race a /health request against it on a separate connection.
    const t0 = performance.now();
    const healthRes = await fetch(`${API_BASE}/health`);
    const healthMs = performance.now() - t0;

    expect(healthRes.status).toBe(200);
    expect(
      healthMs,
      `GET /health took ${healthMs.toFixed(1)}ms while a deep include_snapshots page ` +
        `(cursor depth ${REPRO_DEPTH}) was in flight; the pre-fix offset scan blocked it for seconds`
    ).toBeLessThan(HEALTH_BOUND_MS);

    // The deep page must still return correctly — non-blocking is worthless if the
    // query itself is broken.
    const deepRes = await deepFetch;
    expect(deepRes.status).toBe(200);
    const deepBody = (await deepRes.json()) as { entities?: unknown[] };
    expect(Array.isArray(deepBody.entities)).toBe(true);
  });

  describe("cross-surface parity", () => {
    it("REST /entities/query shape parses cursor and drives keyset paging", async () => {
      const parsed = EntitiesQueryRequestSchema.parse({
        entity_type: TEST_TYPE,
        limit: PAGE,
      });
      const first = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: parsed.entity_type,
        includeSnapshots: parsed.include_snapshots,
        limit: parsed.limit,
        offset: parsed.offset,
      });
      expect(first.next_cursor).toBeDefined();

      const parsed2 = EntitiesQueryRequestSchema.parse({
        entity_type: TEST_TYPE,
        limit: PAGE,
        cursor: first.next_cursor,
      });
      const second = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: parsed2.entity_type,
        includeSnapshots: parsed2.include_snapshots,
        limit: parsed2.limit,
        cursor: parsed2.cursor,
      });
      expect(second.entities.length).toBeGreaterThan(0);
      // second page starts strictly after the first page's last id
      const firstLast = first.entities[first.entities.length - 1].entity_id;
      expect(second.entities[0].entity_id > firstLast).toBe(true);
    });

    it("GET /entities REST alias drives keyset paging over a real HTTP query string", async () => {
      // Drives the actual route (coerceEntitiesQueryParams -> runEntitiesQuery)
      // rather than calling queryEntitiesWithCount directly, so a regression in
      // query-string coercion of `cursor` would fail this test.
      // No Authorization header: a loopback request with no Bearer token
      // resolves via isLocalRequest() to ensureLocalDevUser().id, i.e.
      // LOCAL_DEV_USER_ID === TEST_USER_ID (see src/services/local_auth.ts).
      const firstRes = await fetch(`${API_BASE}/entities?entity_type=${TEST_TYPE}&limit=${PAGE}`);
      expect(firstRes.status).toBe(200);
      const first = (await firstRes.json()) as {
        entities: Array<{ entity_id: string }>;
        next_cursor?: string;
      };
      expect(first.next_cursor).toBeDefined();

      const secondRes = await fetch(
        `${API_BASE}/entities?entity_type=${TEST_TYPE}&limit=${PAGE}&cursor=${encodeURIComponent(first.next_cursor as string)}`
      );
      expect(secondRes.status).toBe(200);
      const second = (await secondRes.json()) as { entities: Array<{ entity_id: string }> };
      expect(second.entities.length).toBeGreaterThan(0);
      // second page starts strictly after the first page's last id, proving the
      // GET route's coerced `cursor` query param actually drove keyset paging
      // rather than silently falling back to offset 0.
      const firstLast = first.entities[first.entities.length - 1].entity_id;
      expect(second.entities[0].entity_id > firstLast).toBe(true);
    });

    it("MCP retrieve_entities shape parses cursor and drives keyset paging", async () => {
      const parsed = RetrieveEntitiesRequestSchema.parse({
        entity_type: TEST_TYPE,
        limit: PAGE,
      });
      const first = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: parsed.entity_type,
        includeSnapshots: parsed.include_snapshots,
        limit: parsed.limit,
        offset: parsed.offset,
      });
      expect(first.next_cursor).toBeDefined();

      const parsed2 = RetrieveEntitiesRequestSchema.parse({
        entity_type: TEST_TYPE,
        limit: PAGE,
        cursor: first.next_cursor,
      });
      const second = await queryEntitiesWithCount({
        userId: TEST_USER_ID,
        entityType: parsed2.entity_type,
        includeSnapshots: parsed2.include_snapshots,
        limit: parsed2.limit,
        cursor: parsed2.cursor,
      });
      const firstLast = first.entities[first.entities.length - 1].entity_id;
      expect(second.entities[0].entity_id > firstLast).toBe(true);
    });

    it("both surfaces reject cursor + offset at the schema layer", () => {
      const cur = first_cursor();
      expect(EntitiesQueryRequestSchema.safeParse({ cursor: cur, offset: 10 }).success).toBe(false);
      expect(RetrieveEntitiesRequestSchema.safeParse({ cursor: cur, offset: 10 }).success).toBe(
        false
      );
    });

    // A malformed cursor must surface as a structured INVALID_CURSOR envelope on
    // BOTH transports. These drive the real wire on purpose: the HTTP 400 branch
    // (actions.ts handleApiError) and the MCP InvalidParams branch (server.ts) are
    // separate hand-wired catch blocks, and asserting the thrown CursorError
    // in-process would pass even if neither were connected — which is exactly the
    // wiring this pair of tests exists to guard.
    const MALFORMED_CURSOR = "!!!not-base64-json!!!";

    it("REST POST /entities/query returns a 400 INVALID_CURSOR envelope over real HTTP", async () => {
      const res = await fetch(`${API_BASE}/entities/query`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity_type: TEST_TYPE,
          limit: PAGE,
          cursor: MALFORMED_CURSOR,
          user_id: TEST_USER_ID,
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error_code?: string;
        message?: string;
        details?: { hint?: unknown };
      };
      expect(body.error_code).toBe("INVALID_CURSOR");
      expect(body.message).toMatch(/cursor/i);
      // `hint` lands flat in `details`, the slot every standard-envelope error
      // uses and the one clients read for the recovery path.
      expect(typeof body.details?.hint).toBe("string");
      expect(body.details?.hint).toMatch(/cursor/i);
    });

    it("MCP retrieve_entities surfaces ERR_CURSOR_COMBINATION with its hint over a real transport", async () => {
      // #1943 (ux lens, round 10): a Zod request-schema rejection used to fall
      // through the MCP catch block to a generic InternalError, dropping
      // `code`/`hint` and misreporting a caller mistake as a server fault. This
      // drives the REAL client/transport pair — an in-process safeParse would
      // pass even with the ZodError branch removed, which is the whole point.
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const mcpServer = new NeotomaServer();
      (mcpServer as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;

      const client = new Client(
        { name: "cursor-combination-test", version: "1.0.0" },
        { capabilities: {} }
      );
      await Promise.all([
        (
          mcpServer as unknown as {
            mcpServer: { server: { connect: (t: unknown) => Promise<void> } };
          }
        ).mcpServer.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      try {
        const call = client.callTool({
          name: "retrieve_entities",
          arguments: { entity_type: TEST_TYPE, limit: PAGE, cursor: MALFORMED_CURSOR, offset: 10 },
        });
        await expect(call).rejects.toThrow();

        const err = await call.catch((e: unknown) => e);
        const data = (err as { data?: { code?: string; hint?: string } }).data;
        expect(data?.code).toBe("ERR_CURSOR_COMBINATION");
        expect(typeof data?.hint).toBe("string");
        // Must NOT be misclassified as an internal server fault.
        expect(String((err as { message?: string }).message ?? "")).not.toMatch(/internal/i);
      } finally {
        await client.close();
      }
    });

    it("MCP retrieve_entities returns an INVALID_CURSOR error over a real client/transport pair", async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const mcpServer = new NeotomaServer();
      // Inject the test user so the tool call needs no real auth token, matching
      // the pattern in store_reference_source_parity.test.ts.
      (mcpServer as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;

      const client = new Client(
        { name: "cursor-envelope-test", version: "1.0.0" },
        { capabilities: {} }
      );
      await Promise.all([
        (mcpServer as unknown as { mcpServer: { server: { connect: (t: unknown) => Promise<void> } } })
          .mcpServer.server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      try {
        // The SDK client rejects on an MCP error response, so capture and inspect
        // it rather than asserting on a returned tool result.
        const call = client.callTool({
          name: "retrieve_entities",
          arguments: { entity_type: TEST_TYPE, limit: PAGE, cursor: MALFORMED_CURSOR },
        });
        await expect(call).rejects.toThrow(/cursor/i);

        const err = await call.catch((e: unknown) => e);
        // McpError carries the structured envelope on `data` — that's the field
        // MCP clients branch on to distinguish INVALID_CURSOR from other
        // InvalidParams rejections.
        const data = (err as { data?: { code?: string; hint?: string } }).data;
        expect(data?.code).toBe("INVALID_CURSOR");
        expect(typeof data?.hint).toBe("string");
        expect(data?.hint).toMatch(/cursor/i);
      } finally {
        await client.close();
      }
    });
  });
});

function first_cursor(): string {
  return Buffer.from(
    JSON.stringify({ v: 1, sort_by: "entity_id", sort_order: "asc", entity_id: "ent_x" }),
    "utf8"
  ).toString("base64url");
}
