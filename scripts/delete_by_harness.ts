#!/usr/bin/env tsx
/**
 * Delete agent_session entities with a given harness value, via AAuth signing.
 *
 * Used to clean up the stale `claude_code` (underscore) agent_session entities
 * after re-storing them under the standardized `claude-code` (hyphen) harness.
 * agent_session identity is ["harness","native_session_id"], so the harness
 * value is part of the canonical name — changing it creates NEW entities and
 * leaves the old ones behind. This removes the old ones.
 *
 * Enumerates via POST /entities/query (snapshot_filters on harness) and deletes
 * each via POST /delete_entity (reversible deletion observation). Both requests
 * are AAuth-signed with the local keypair via cliSignedFetch, the same path as
 * store_via_aauth.ts.
 *
 * Usage:
 *   tsx scripts/delete_by_harness.ts [--harness claude_code] [--entity-type agent_session] [--base-url URL] [--dry-run]
 */

import { cliSignedFetch } from "../src/cli/aauth_signer.js";

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const baseUrl = arg("--base-url", "https://neotoma.markmhendrickson.com")!;
const entityType = arg("--entity-type", "agent_session")!;
const harness = arg("--harness", "claude_code")!;
const dryRun = args.includes("--dry-run");

async function queryPage(offset: number, limit: number): Promise<Array<{ entity_id: string }>> {
  const res = await cliSignedFetch(`${baseUrl}/entities/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity_type: entityType,
      snapshot_filters: { harness: { op: "eq", value: harness } },
      include_snapshots: false,
      include_merged: false,
      limit,
      offset,
    }),
  });
  if (!res.ok) {
    throw new Error(`query @${offset} failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { entities?: Array<{ entity_id: string }> };
  return data.entities ?? [];
}

// Enumerate all matching entity ids. Re-query from offset 0 each round is not
// needed here because we read before deleting; collect everything first.
const limit = 500;
const ids: string[] = [];
let offset = 0;
for (;;) {
  const page = await queryPage(offset, limit);
  for (const e of page) ids.push(e.entity_id);
  if (page.length < limit) break;
  offset += limit;
}
console.log(
  `${ids.length} ${entityType} entities with harness=${harness} -> ${baseUrl}/delete_entity${dryRun ? " (dry-run)" : ""}`,
);

let ok = 0;
let fail = 0;
for (const id of ids) {
  if (dryRun) {
    ok++;
    continue;
  }
  let res: Response;
  try {
    res = await cliSignedFetch(`${baseUrl}/delete_entity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity_id: id,
        entity_type: entityType,
        reason: `harness value standardization ${harness} -> claude-code`,
      }),
    });
  } catch (err) {
    fail++;
    console.error(`\n  delete ${id} threw:`, (err as Error).message);
    continue;
  }
  if (res.ok) {
    ok++;
  } else {
    fail++;
    if (fail <= 5) console.error(`\n  delete ${id} failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  if ((ok + fail) % 100 === 0) process.stdout.write(`\r  ${ok + fail}/${ids.length}`);
}
console.log(`\ndelete complete: ${ok} ok, ${fail} failed${dryRun ? " (dry-run)" : ""}`);
