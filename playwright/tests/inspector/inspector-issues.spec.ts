/**
 * E2E: Inspector Issues list and issue detail (`/issues`, `/issues/:segment`).
 *
 * Same harness as `inspector-entity-detail.spec.ts`: built Inspector under
 * `/inspector/`, Neotoma HTTP `POST /store` with dev user_id, no Bearer in SPA.
 */

import { LOCAL_DEV_USER_ID } from "../../../src/services/local_auth.js";
import { expect, test } from "../../fixtures/servers.js";
import { isInspectorDistBuilt } from "../../utils/inspector_e2e.js";

test.skip(!isInspectorDistBuilt(), "Inspector SPA not built; run npm run build:inspector");

async function clearInspectorAuthInit(page: import("@playwright/test").Page): Promise<void> {
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
}

async function seedOpenIssue(
  neotomaHttpOrigin: string,
  bearerToken: string,
): Promise<{ entityId: string; title: string; body: string }> {
  const title = `PWInspectorIssue${Date.now()}`;
  const body = "Playwright Inspector issues E2E seed body.";
  const createdAt = new Date().toISOString();
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
          entity_type: "issue",
          title,
          body,
          status: "open",
          author: "playwright-inspector-e2e",
          created_at: createdAt,
          labels: ["playwright-inspector-e2e"],
          data_source: `playwright_inspector_issues_e2e ${createdAt}`,
        },
      ],
      idempotency_key: `pw-inspector-issues-${Date.now()}`,
    }),
  });

  const storeText = await storeRes.text();
  if (!storeRes.ok) {
    throw new Error(`POST /store (issue) failed: ${storeRes.status} ${storeText.slice(0, 800)}`);
  }
  const bodyJson = JSON.parse(storeText) as {
    structured?: { entities?: Array<{ entity_id: string }> };
    entities?: Array<{ entity_id: string }>;
  };
  const entityId =
    bodyJson.structured?.entities?.[0]?.entity_id ?? bodyJson.entities?.[0]?.entity_id;
  expect(entityId).toBeTruthy();
  return { entityId: entityId!, title, body };
}

test.describe("Inspector issues", () => {
  test("issues list shows seeded open issue title", async ({
    page,
    bearerToken,
    neotomaHttpOrigin,
    inspectorSpaUrl,
  }) => {
    await clearInspectorAuthInit(page);
    const { title } = await seedOpenIssue(neotomaHttpOrigin, bearerToken);

    await page.goto(`${inspectorSpaUrl}issues`, { waitUntil: "domcontentloaded" });

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible({ timeout: 45_000 });
    await expect(h1).toHaveText("Issues");

    await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("issue detail shows title, open status, and body", async ({
    page,
    bearerToken,
    neotomaHttpOrigin,
    inspectorSpaUrl,
  }) => {
    await clearInspectorAuthInit(page);
    const { entityId, title, body } = await seedOpenIssue(neotomaHttpOrigin, bearerToken);

    await page.goto(`${inspectorSpaUrl}issues/${encodeURIComponent(entityId)}`, {
      waitUntil: "domcontentloaded",
    });

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible({ timeout: 45_000 });
    await expect(h1).toHaveText(title, { timeout: 30_000 });

    await expect(page.getByText("open", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(body, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });
});
