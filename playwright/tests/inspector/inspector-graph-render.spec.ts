/**
 * E2E: Inspector graph RENDER smoke gate (prod bundle, PIXEL-LEVEL).
 *
 * WHAT THIS GUARDS
 * ----------------
 * This is the ship-gate for the whole class of "graph is in the DOM but paints
 * nothing" bugs that an external evaluator (Jeroen) caught twice:
 *   - v0.18.5 blank-canvas: React Flow v12's per-node ResizeObserver never fired
 *     its initial measurement, so nodes stayed unmeasured, fitView no-op'd, and
 *     edges never drew. Prod-bundle-only.
 *   - v0.18.6 /embed/graph height-collapse: the canvas container had a MIN height
 *     but no resolved height, so React Flow's root computed clientHeight = 0px and
 *     overflow:hidden clipped a correctly-laid-out graph to zero painted pixels.
 * BOTH shipped with a healthy DOM (nodes present, edges present, viewport fitted)
 * yet painted nothing. So DOM-only assertions are INSUFFICIENT — this spec asserts
 * at the PIXEL level: document.elementFromPoint() at a rendered node's center must
 * hit an element inside `.react-flow__node` (not the page background/body), AND the
 * `.react-flow` root must have non-zero clientHeight.
 *
 * WHY IT RUNS AGAINST THE BUILT BUNDLE
 * ------------------------------------
 * Both bugs reproduce ONLY in the minified prod bundle / embed shell — a dev-server
 * or jsdom render passes while prod is broken. This spec loads the built Inspector
 * SPA served by the Neotoma HTTP server at `/inspector/` (dist/inspector, produced
 * by `npm run build:inspector`). When dist is missing, the whole file skips.
 *
 * Enforces task_policy render_effect_is_the_rendered_output_tested_on_prod_bundle
 * (ent_aa78b25af71561a203bde840): "rendered" means PAINTED, not present-in-DOM.
 * Task ent_6636601b50fc2d43b21d5174 / retrospective ent_c4359aa810a5c5e6550cd631.
 */

import { LOCAL_DEV_USER_ID } from "../../../src/services/local_auth.js";
import { expect, test } from "../../fixtures/servers.js";
import { isInspectorDistBuilt } from "../../utils/inspector_e2e.js";

test.skip(!isInspectorDistBuilt(), "Inspector SPA not built; run npm run build:inspector");

type StoreResponse = {
  structured?: { entities?: Array<{ entity_id: string }> };
  entities?: Array<{ entity_id: string }>;
};

async function storeEntity(
  origin: string,
  bearer: string,
  entity: Record<string, unknown>,
  idempotencyKey: string
): Promise<string> {
  const res = await fetch(`${origin}/store`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: LOCAL_DEV_USER_ID,
      entities: [entity],
      idempotency_key: idempotencyKey,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST /store failed: ${res.status} ${text.slice(0, 800)}`);
  }
  const body = JSON.parse(text) as StoreResponse;
  const id = body.structured?.entities?.[0]?.entity_id ?? body.entities?.[0]?.entity_id;
  if (!id) throw new Error(`No entity_id in /store response: ${text.slice(0, 400)}`);
  return id;
}

async function createRelationship(
  origin: string,
  bearer: string,
  sourceId: string,
  targetId: string
): Promise<void> {
  const res = await fetch(`${origin}/create_relationship`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: LOCAL_DEV_USER_ID,
      relationship_type: "PART_OF",
      source_entity_id: sourceId,
      target_entity_id: targetId,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /create_relationship failed: ${res.status} ${text.slice(0, 800)}`);
  }
}

/**
 * Seed a focus entity linked to >=2 neighbors so the neighborhood graph renders
 * >=3 nodes and >=1 edge. Returns the focus entity id to explore.
 */
async function seedGraph(origin: string, bearer: string): Promise<string> {
  const stamp = Date.now();
  const focusId = await storeEntity(
    origin,
    bearer,
    {
      entity_type: "company",
      name: `PWGraphFocus${stamp}`,
      data_source: "playwright_graph_render_e2e",
    },
    `pw-graph-focus-${stamp}`
  );
  const neighborIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    neighborIds.push(
      await storeEntity(
        origin,
        bearer,
        {
          entity_type: "person",
          name: `PWGraphNeighbor${i}_${stamp}`,
          data_source: "playwright_graph_render_e2e",
        },
        `pw-graph-neighbor-${i}-${stamp}`
      )
    );
  }
  // focus PART_OF neighbor0, neighbor1 PART_OF focus -> 2 edges, 3 nodes total.
  await createRelationship(origin, bearer, focusId, neighborIds[0]!);
  await createRelationship(origin, bearer, neighborIds[1]!, focusId);
  return focusId;
}

/**
 * Assert the graph actually PAINTS: the React Flow root has non-zero clientHeight
 * and elementFromPoint at a rendered node's center returns an element inside a
 * `.react-flow__node` (not the page background / body). This is the assertion that
 * fails on the v0.18.5 blank-canvas and v0.18.6 height-collapse bugs and passes on
 * the fix. Runs in the page so it reads the real painted layout.
 */
async function assertGraphPaints(page: import("@playwright/test").Page): Promise<void> {
  // Wait for React Flow to mount + fit before probing pixels.
  await page.waitForSelector(".react-flow__node", { timeout: 45_000 });
  await expect
    .poll(async () => page.locator(".react-flow__node").count(), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(3);
  await expect
    .poll(async () => page.locator(".react-flow__edge").count(), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1);

  const result = await page.evaluate(() => {
    const root = document.querySelector(".react-flow") as HTMLElement | null;
    const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    const node = document.querySelector(".react-flow__node") as HTMLElement | null;
    if (!root || !node) {
      return {
        ok: false,
        reason: "missing .react-flow root or node",
        rootHeight: root?.clientHeight ?? -1,
      };
    }

    const rootHeight = root.clientHeight;

    // fitView must have fired: the viewport transform is non-identity. Identity is
    // `matrix(1, 0, 0, 1, 0, 0)` / no transform; a fitted graph translates+scales.
    const transform = viewport ? getComputedStyle(viewport).transform : "none";
    const viewportFitted = transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)";

    // PIXEL-LEVEL: hit-test the center of a rendered node. On the two shipped bugs
    // this returns the page background/body because the graph painted 0 pixels.
    const rect = node.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const hitInsideNode = !!(hit && hit.closest(".react-flow__node") !== null);

    return {
      ok: rootHeight > 0 && viewportFitted && hitInsideNode,
      rootHeight,
      transform,
      viewportFitted,
      hitInsideNode,
      hitTag: hit ? `${hit.tagName}.${hit.className}` : null,
      nodeRect: { x: cx, y: cy, w: Math.round(rect.width), h: Math.round(rect.height) },
    };
  });

  // Rich failure message so a red run tells you *which* paint invariant broke.
  expect(
    result.rootHeight,
    `.react-flow clientHeight must be > 0 (height-collapse guard). Got ${result.rootHeight}. ${JSON.stringify(result)}`
  ).toBeGreaterThan(0);
  expect(
    result.viewportFitted,
    `viewport transform must be non-identity (fitView must fire). transform=${result.transform}. ${JSON.stringify(result)}`
  ).toBe(true);
  expect(
    result.hitInsideNode,
    `elementFromPoint at a node center must hit a .react-flow__node, not the page background (blank-paint guard). hit=${result.hitTag}. ${JSON.stringify(result)}`
  ).toBe(true);
}

test.describe("Inspector graph render smoke (prod bundle, pixel-level)", () => {
  test("/graph paints a fitted graph with >=3 nodes and >=1 edge", async ({
    page,
    bearerToken,
    neotomaHttpOrigin,
    inspectorSpaUrl,
  }) => {
    // Same-origin Inspector + local SQLite: omit Bearer so the API uses the dev
    // user; clear any scoped auth/api-url so the SPA defaults to the server-injected
    // same-origin `<meta name="neotoma-api-base">`.
    await page.addInitScript(() => {
      for (const k of [
        "neotoma_inspector_auth_token_dev",
        "neotoma_inspector_auth_token_prod",
        "neotoma_inspector_api_url_dev",
        "neotoma_inspector_api_url_prod",
      ]) {
        try {
          localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      }
    });

    const focusId = await seedGraph(neotomaHttpOrigin, bearerToken);

    await page.goto(`${inspectorSpaUrl}graph?node=${encodeURIComponent(focusId)}`, {
      waitUntil: "domcontentloaded",
    });

    await assertGraphPaints(page);
  });

  test("/embed/graph paints a fitted graph with >=3 nodes and >=1 edge", async ({
    page,
    bearerToken,
    neotomaHttpOrigin,
    inspectorSpaUrl,
  }) => {
    const focusId = await seedGraph(neotomaHttpOrigin, bearerToken);

    // The embed route reads its API origin from `?apiBase=` (the `WithBase` graph
    // hook), and the focus node from `?node=`.
    const embedUrl =
      `${inspectorSpaUrl}embed/graph` +
      `?apiBase=${encodeURIComponent(neotomaHttpOrigin)}` +
      `&node=${encodeURIComponent(focusId)}`;

    await page.goto(embedUrl, { waitUntil: "domcontentloaded" });

    await assertGraphPaints(page);
  });
});
