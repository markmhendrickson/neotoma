/**
 * E2E: sandbox pack picker on the Inspector home (served at `/` in sandbox mode).
 *
 * Boots a dedicated Neotoma server in sandbox mode (NEOTOMA_SANDBOX_MODE=1) on
 * an isolated temp data dir, then drives the picker the way a visitor does:
 * land on `/`, pick a fixture pack, click Start, and confirm a per-visitor
 * ephemeral session is created and redeemed.
 *
 * Scope is the picker's own contract (render + session create/redeem). The
 * seeded-*data* path is owned by the pack-seeding fix and covered by its own
 * unit/integration tests; this spec deliberately does not assert entity counts
 * so it stays green independent of that change.
 *
 * Requires a built Inspector (`npm run build:inspector` / `test:e2e:inspector`).
 * When `dist/inspector/index.html` (or `inspector/dist`) is missing, the suite
 * is skipped.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

import { waitForHttp } from "../../utils/servers.js";
import { isInspectorDistBuilt } from "../../utils/inspector_e2e.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));

test.skip(!isInspectorDistBuilt(), "Inspector SPA not built; run npm run build:inspector");

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not acquire a free port")));
      }
    });
  });
}

let server: ChildProcessWithoutNullStreams | undefined;
let dataDir: string | undefined;
let origin = "";

test.beforeAll(async () => {
  const port = await getFreePort();
  origin = `http://127.0.0.1:${port}`;
  dataDir = mkdtempSync(path.join(tmpdir(), "neotoma-sandbox-e2e-"));

  server = spawn("node", ["--import", "tsx", "src/actions.ts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEOTOMA_SANDBOX_MODE: "1",
      NEOTOMA_TENANT_SCOPED_ENTITY_IDS: "1",
      NEOTOMA_DATA_DIR: dataDir,
      HTTP_PORT: String(port),
      PORT: String(port),
      NEOTOMA_HTTP_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (process.env.PLAYWRIGHT_VERBOSE_SERVERS === "1") {
    server.stdout.setEncoding("utf8");
    server.stderr.setEncoding("utf8");
    server.stdout.on("data", (c: string) => process.stdout.write(`[sandbox] ${c}`));
    server.stderr.on("data", (c: string) => process.stderr.write(`[sandbox] ${c}`));
  }

  await waitForHttp(`${origin}/health`, { timeoutMs: 60_000 });
});

test.afterAll(async () => {
  if (server && server.exitCode === null && !server.killed) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    if (server.exitCode === null && !server.killed) server.kill("SIGKILL");
  }
  if (dataDir) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

test.describe("sandbox pack picker", () => {
  test("Inspector serves at root with the pack picker in sandbox mode", async ({ page }) => {
    await page.goto(`${origin}/`);
    const picker = page.getByTestId("sandbox-pack-picker");
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("button", { name: /start session/i })).toBeVisible();
    // The pack <select> is populated from the root JSON (sandbox_packs).
    const select = picker.getByLabel("Sandbox data pack");
    await expect(select).toBeEnabled();
    await expect(select.locator("option")).not.toHaveCount(0);
  });

  test("starting a pack creates and redeems an ephemeral session", async ({ page }) => {
    await page.goto(`${origin}/`);
    const picker = page.getByTestId("sandbox-pack-picker");
    await expect(picker).toBeVisible();

    await picker.getByLabel("Sandbox data pack").selectOption("generic");

    const sessionResP = page.waitForResponse(
      (r) => r.url().endsWith("/sandbox/session/new") && r.request().method() === "POST"
    );
    const redeemResP = page.waitForResponse(
      (r) => r.url().endsWith("/sandbox/session/redeem") && r.request().method() === "POST"
    );
    // The picker reloads the page after a successful redeem; capture that load
    // so we read storage only after the navigation settles (not mid-reload).
    const reloadP = page.waitForEvent("load");

    await picker.getByRole("button", { name: /start session/i }).click();

    // Assert on status only — the page reloads right after redeem, which
    // discards the network response bodies (getResponseBody races the reload).
    // Pack correctness is verified below via the persisted session descriptor.
    const sessionRes = await sessionResP;
    expect(sessionRes.ok(), "POST /sandbox/session/new succeeds").toBeTruthy();

    const redeemRes = await redeemResP;
    expect(redeemRes.ok(), "POST /sandbox/session/redeem succeeds").toBeTruthy();

    // After redeem + reload the session descriptor is persisted, so the app
    // hydrates as the per-visitor ephemeral user with the chosen pack.
    await reloadP;
    const stored = await page.evaluate(() =>
      sessionStorage.getItem("neotoma_inspector_sandbox_session")
    );
    expect(stored, "sandbox session persisted after redeem").toBeTruthy();
    expect(JSON.parse(stored as string).packId).toBe("generic");
  });
});
