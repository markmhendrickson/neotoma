/**
 * E2E: Neotoma Inspector SPA (served at `/inspector/` on the HTTP server).
 *
 * Requires a built Inspector (`npm run build:inspector` or `test:e2e:inspector`).
 * When `dist/inspector/index.html` is missing, all tests in this file are skipped.
 */

import { LOCAL_DEV_USER_ID } from "../../../src/services/local_auth.js";
import { expect, test } from "../../fixtures/servers.js";
import { isInspectorDistBuilt } from "../../utils/inspector_e2e.js";

test.skip(!isInspectorDistBuilt(), "Inspector SPA not built; run npm run build:inspector");

test.describe("Inspector entity detail", () => {
  test("shows seeded note title and summary from snapshot", async ({
    page,
    bearerToken,
    neotomaHttpOrigin,
    inspectorSpaUrl,
  }) => {
    // Same-origin Inspector + local SQLite: omit Bearer so the API uses
    // `local_no_bearer` (dev user). Priming Ed25519 bearer would require
    // `user_id` on every Inspector GET, which the SPA does not send.
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

    const title = `PWInspectorNote${Date.now()}`;
    const summary = "Playwright inspector E2E seed summary";

    const storeRes = await fetch(`${neotomaHttpOrigin}/store`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: LOCAL_DEV_USER_ID,
        entities: [
          {
            entity_type: "note",
            title,
            summary,
            data_source: "playwright_inspector_e2e",
          },
        ],
        idempotency_key: `pw-inspector-entity-${Date.now()}`,
      }),
    });

    const storeText = await storeRes.text();
    if (!storeRes.ok) {
      throw new Error(`POST /store failed: ${storeRes.status} ${storeText.slice(0, 800)}`);
    }
    const body = JSON.parse(storeText) as {
      structured?: { entities?: Array<{ entity_id: string }> };
      entities?: Array<{ entity_id: string }>;
    };
    const entityId =
      body.structured?.entities?.[0]?.entity_id ?? body.entities?.[0]?.entity_id;
    expect(entityId).toBeTruthy();

    await page.goto(`${inspectorSpaUrl}entities/${encodeURIComponent(entityId!)}`, {
      waitUntil: "domcontentloaded",
    });

    const heading = page.getByRole("heading", { level: 1, name: new RegExp(title) }).first();
    await expect(heading).toBeVisible({ timeout: 45_000 });
    await expect(heading).toContainText(title, { timeout: 15_000 });

    await expect(page.getByText(summary, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
