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
  `${entities.length} entities, batch ${batchSize} -> ${baseUrl}/store${dryRun ? " (dry-run)" : ""}`,
);

function batchKey(batch: Array<Record<string, unknown>>): string {
  // Content-derived so re-runs with identical content reuse the key (idempotent),
  // and changed content produces a new observation rather than a key-reuse error.
  return "aauth-bulk-" + createHash("sha256").update(JSON.stringify(batch)).digest("hex").slice(0, 24);
}

let ok = 0;
let fail = 0;
for (let i = 0; i < entities.length; i += batchSize) {
  const batch = entities.slice(i, i + batchSize);
  if (!dryRun) {
    let res: Response;
    try {
      res = await cliSignedFetch(`${baseUrl}/store`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entities: batch,
          idempotency_key: batchKey(batch),
          observation_source: "import",
        }),
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
  process.stdout.write(`\r  ${Math.min(i + batchSize, entities.length)}/${entities.length}`);
}
console.log(`\nstore complete: ${ok} ok, ${fail} failed${dryRun ? " (dry-run)" : ""}`);
