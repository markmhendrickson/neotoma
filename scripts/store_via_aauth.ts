#!/usr/bin/env tsx
/**
 * Bulk-store entities to a Neotoma instance with AAuth request signing.
 *
 * The CLI `store` command authenticates via Bearer only; this script signs each
 * /store POST with the local AAuth keypair (~/.neotoma/aauth/) via cliSignedFetch,
 * so it authenticates to an AAuth-gated endpoint (e.g. neotoma.markmhendrickson.com)
 * the same way `neotoma mcp proxy --aauth` does. Used to bulk-ingest agent_session
 * + session_transcript index entities that don't fit the inline MCP store path.
 *
 * Usage:
 *   tsx scripts/store_via_aauth.ts --file entities.json [--base-url URL] [--batch N] [--dry-run]
 *
 * `entities.json` is a JSON array of entity objects ({entity_type, ...fields}).
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cliSignedFetch } from "../src/cli/aauth_signer.js";

export interface StoreViaAauthOptions {
  entities: Array<Record<string, unknown>>;
  baseUrl: string;
  batchSize: number;
  dryRun: boolean;
  /** Injectable fetch for tests; defaults to cliSignedFetch. */
  signedFetch?: typeof cliSignedFetch;
}

export interface StoreViaAauthResult {
  ok: number;
  fail: number;
  batches: number;
  /** Per-batch request bodies that would be / were POSTed (for effect assertions). */
  postedBodies: Array<{
    entities: Array<Record<string, unknown>>;
    idempotency_key: string;
    observation_source: string;
  }>;
}

export function batchKey(batch: Array<Record<string, unknown>>): string {
  // Content-derived so re-runs with identical content reuse the key (idempotent),
  // and changed content produces a new observation rather than a key-reuse error.
  return (
    "aauth-bulk-" + createHash("sha256").update(JSON.stringify(batch)).digest("hex").slice(0, 24)
  );
}

/**
 * Signed bulk /store. Effect: each batch is POSTed to `{baseUrl}/store` with
 * AAuth signing, `observation_source: "import"`, and a content-derived
 * idempotency_key. Re-running identical batches reuses the same key.
 */
export async function storeViaAauth(opts: StoreViaAauthOptions): Promise<StoreViaAauthResult> {
  const fetchFn = opts.signedFetch ?? cliSignedFetch;
  let ok = 0;
  let fail = 0;
  let batches = 0;
  const postedBodies: StoreViaAauthResult["postedBodies"] = [];

  for (let i = 0; i < opts.entities.length; i += opts.batchSize) {
    const batch = opts.entities.slice(i, i + opts.batchSize);
    const body = {
      entities: batch,
      idempotency_key: batchKey(batch),
      observation_source: "import",
    };
    postedBodies.push(body);
    batches++;

    if (!opts.dryRun) {
      let res: Response;
      try {
        res = await fetchFn(`${opts.baseUrl}/store`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        fail += batch.length;
        console.error(`\n  batch @${i} threw:`, (err as Error).message);
        continue;
      }
      if (res.ok) {
        ok += batch.length;
      } else {
        fail += batch.length;
        const text = await res.text().catch(() => "");
        console.error(`\n  batch @${i} failed ${res.status}: ${text.slice(0, 300)}`);
      }
    } else {
      ok += batch.length;
    }
    process.stdout.write(
      `\r  ${Math.min(i + opts.batchSize, opts.entities.length)}/${opts.entities.length}`
    );
  }

  return { ok, fail, batches, postedBodies };
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("store_via_aauth.ts") ||
    process.argv[1].endsWith("store_via_aauth.js"));

if (isDirectRun) {
  const args = process.argv.slice(2);
  const arg = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const file = arg("--file");
  const baseUrl = arg("--base-url", "https://neotoma.markmhendrickson.com")!;
  const batchSize = parseInt(arg("--batch", "50")!, 10);
  const dryRun = args.includes("--dry-run");

  if (!file) {
    console.error("Missing --file <entities.json>");
    process.exit(1);
  }

  const entities = JSON.parse(readFileSync(file, "utf-8")) as Array<Record<string, unknown>>;
  console.log(
    `${entities.length} entities, batch ${batchSize} -> ${baseUrl}/store${dryRun ? " (dry-run)" : ""}`
  );

  const result = await storeViaAauth({ entities, baseUrl, batchSize, dryRun });
  console.log(
    `\nstore complete: ${result.ok} ok, ${result.fail} failed${dryRun ? " (dry-run)" : ""}`
  );
  if (result.fail > 0) process.exit(1);
}
