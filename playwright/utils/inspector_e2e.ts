import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

import { repoRoot } from "./servers.js";

/** Keys used by `inspector/src/api/client.ts` for scoped auth storage (`_dev` / `_prod`). */
const INSPECTOR_AUTH_KEYS = [
  "neotoma_inspector_auth_token_dev",
  "neotoma_inspector_auth_token_prod",
] as const;

/**
 * True when a built Inspector SPA exists where the HTTP server will mount it
 * (`dist/inspector` after `npm run build:inspector`, or `inspector/dist`).
 */
export function isInspectorDistBuilt(): boolean {
  const candidates = [
    path.join(repoRoot, "dist", "inspector", "index.html"),
    path.join(repoRoot, "inspector", "dist", "index.html"),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

/**
 * Prime localStorage so the Inspector SPA sends `Authorization: Bearer` on API
 * calls. Must run before the first navigation to an Inspector URL (use
 * `page.addInitScript`).
 */
export async function primeInspectorAuth(page: Page, bearerToken: string): Promise<void> {
  await page.addInitScript(
    (payload: { keys: readonly string[]; token: string }) => {
      for (const key of payload.keys) {
        try {
          localStorage.setItem(key, payload.token);
        } catch {
          /* ignore quota / private mode */
        }
      }
    },
    { keys: [...INSPECTOR_AUTH_KEYS], token: bearerToken },
  );
}
