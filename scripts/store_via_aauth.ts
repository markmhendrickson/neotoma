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
 * Accepts either:
 *   - a JSON array of entities (flat) — consecutive [agent_session, session_transcript]
 *     pairs get PART_OF relationships inferred via the shared helper
 *   - a single store envelope `{ entities, relationships }`
 *   - an array of store envelopes
 *
 * Usage:
 *   tsx scripts/store_via_aauth.ts --file entities.json [--base-url URL] [--batch N] [--dry-run]
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cliSignedFetch } from "../src/cli/aauth_signer.js";
import {
  inferSessionTranscriptRelationships,
  type StoreEnvelope,
} from "./lib/agent_session_store.js";

export interface StoreViaAauthOptions {
  /** Flat entity list (legacy / dump format). Mutually exclusive with `envelopes`. */
  entities?: Array<Record<string, unknown>>;
  /**
   * When posting a flat `entities` list without envelopes, optional relationships
   * for the whole list. Prefer envelopes for index-relative PART_OF edges.
   */
  relationships?: Array<Record<string, unknown>>;
  /**
   * Prefer this for agent_session + session_transcript pairs built by
   * `buildSessionTranscriptEnvelope` — each envelope is one /store POST so
   * relationship indexes stay correct.
   */
  envelopes?: StoreEnvelope[];
  /**
   * When true (default) and posting a flat entity batch, attach PART_OF edges
   * for consecutive [agent_session, session_transcript] pairs via the shared
   * helper. Set false to preserve legacy entity-only posts.
   */
  inferRelationships?: boolean;
  baseUrl: string;
  batchSize: number;
  dryRun: boolean;
  /** Injectable fetch for tests; defaults to cliSignedFetch. */
  signedFetch?: typeof cliSignedFetch;
}

export interface StoreViaAauthPostedBody {
  entities: Array<Record<string, unknown>>;
  relationships?: Array<Record<string, unknown>>;
  idempotency_key: string;
  observation_source: string;
}

export interface StoreViaAauthResult {
  ok: number;
  fail: number;
  batches: number;
  /** Per-batch request bodies that would be / were POSTed (for effect assertions). */
  postedBodies: StoreViaAauthPostedBody[];
}

export function batchKey(
  batch: Array<Record<string, unknown>>,
  relationships?: Array<Record<string, unknown>>
): string {
  // Content-derived so re-runs with identical content reuse the key (idempotent),
  // and changed content (including relationship shape) produces a new key.
  const payload =
    relationships && relationships.length > 0 ? { entities: batch, relationships } : batch;
  return (
    "aauth-bulk-" + createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24)
  );
}

function buildPostedBody(
  entities: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>> | undefined
): StoreViaAauthPostedBody {
  const body: StoreViaAauthPostedBody = {
    entities,
    idempotency_key: batchKey(entities, relationships),
    observation_source: "import",
  };
  if (relationships && relationships.length > 0) {
    body.relationships = relationships;
  }
  return body;
}

/**
 * Signed bulk /store. Effect: each batch/envelope is POSTed to `{baseUrl}/store`
 * with AAuth signing, `observation_source: "import"`, content-derived
 * idempotency_key, and (for session/transcript pairs) the same PART_OF
 * `relationships` the Bearer ingest path emits.
 */
export async function storeViaAauth(opts: StoreViaAauthOptions): Promise<StoreViaAauthResult> {
  const fetchFn = opts.signedFetch ?? cliSignedFetch;
  let ok = 0;
  let fail = 0;
  let batches = 0;
  const postedBodies: StoreViaAauthPostedBody[] = [];

  const postOne = async (body: StoreViaAauthPostedBody, entityCount: number): Promise<void> => {
    postedBodies.push(body);
    batches++;
    if (opts.dryRun) {
      ok += entityCount;
      return;
    }
    let res: Response;
    try {
      res = await fetchFn(`${opts.baseUrl}/store`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      fail += entityCount;
      console.error(`\n  batch threw:`, (err as Error).message);
      return;
    }
    if (res.ok) {
      ok += entityCount;
    } else {
      fail += entityCount;
      const text = await res.text().catch(() => "");
      console.error(`\n  batch failed ${res.status}: ${text.slice(0, 300)}`);
    }
  };

  if (opts.envelopes && opts.envelopes.length > 0) {
    for (const envelope of opts.envelopes) {
      await postOne(
        buildPostedBody(envelope.entities, envelope.relationships),
        envelope.entities.length
      );
      process.stdout.write(`\r  ${postedBodies.length}/${opts.envelopes.length} envelopes`);
    }
    return { ok, fail, batches, postedBodies };
  }

  const entities = opts.entities ?? [];
  const infer = opts.inferRelationships !== false;

  // When inferring PART_OF for session+transcript pairs, post each consecutive
  // pair as its own envelope so batchSize cannot split indexes mid-pair.
  if (infer && (!opts.relationships || opts.relationships.length === 0)) {
    let i = 0;
    const total = entities.length;
    while (i < entities.length) {
      if (
        i + 1 < entities.length &&
        entities[i]?.entity_type === "agent_session" &&
        entities[i + 1]?.entity_type === "session_transcript"
      ) {
        const pair = [entities[i], entities[i + 1]];
        const relationships = inferSessionTranscriptRelationships(pair);
        await postOne(buildPostedBody(pair, relationships), 2);
        i += 2;
      } else {
        // Accumulate non-pair entities up to batchSize.
        const batch: Array<Record<string, unknown>> = [];
        while (
          i < entities.length &&
          batch.length < opts.batchSize &&
          !(
            i + 1 < entities.length &&
            entities[i]?.entity_type === "agent_session" &&
            entities[i + 1]?.entity_type === "session_transcript"
          )
        ) {
          batch.push(entities[i]);
          i++;
        }
        if (batch.length > 0) {
          await postOne(buildPostedBody(batch, undefined), batch.length);
        }
      }
      process.stdout.write(`\r  ${i}/${total}`);
    }
    return { ok, fail, batches, postedBodies };
  }

  for (let i = 0; i < entities.length; i += opts.batchSize) {
    const batch = entities.slice(i, i + opts.batchSize);
    // Index-relative relationships are only valid for a single unsplit POST.
    if (opts.relationships && opts.relationships.length > 0 && entities.length > opts.batchSize) {
      throw new Error(
        "storeViaAauth: explicit relationships require batchSize >= entities.length " +
          "(or pass envelopes so each pair is its own POST)"
      );
    }
    await postOne(buildPostedBody(batch, opts.relationships), batch.length);
    process.stdout.write(`\r  ${Math.min(i + opts.batchSize, entities.length)}/${entities.length}`);
  }

  return { ok, fail, batches, postedBodies };
}

/** Parse --file JSON into either flat entities or envelopes. */
export function parseStoreViaAauthFile(raw: unknown): {
  entities?: Array<Record<string, unknown>>;
  envelopes?: StoreEnvelope[];
} {
  if (Array.isArray(raw)) {
    if (
      raw.length > 0 &&
      raw.every(
        (item) =>
          item != null &&
          typeof item === "object" &&
          Array.isArray((item as StoreEnvelope).entities)
      )
    ) {
      return { envelopes: raw as StoreEnvelope[] };
    }
    return { entities: raw as Array<Record<string, unknown>> };
  }
  if (raw != null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.envelopes)) {
      return { envelopes: obj.envelopes as StoreEnvelope[] };
    }
    if (Array.isArray(obj.entities)) {
      return {
        envelopes: [
          {
            entities: obj.entities as Array<Record<string, unknown>>,
            relationships: Array.isArray(obj.relationships)
              ? (obj.relationships as Array<Record<string, unknown>>)
              : [],
          },
        ],
      };
    }
  }
  throw new Error(
    "Expected JSON array of entities, a {entities, relationships} envelope, or an envelopes array"
  );
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

  const parsed = parseStoreViaAauthFile(JSON.parse(readFileSync(file, "utf-8")));
  const count = parsed.envelopes
    ? parsed.envelopes.reduce((n, e) => n + e.entities.length, 0)
    : (parsed.entities?.length ?? 0);
  console.log(
    `${count} entities${parsed.envelopes ? ` in ${parsed.envelopes.length} envelopes` : ""}, batch ${batchSize} -> ${baseUrl}/store${dryRun ? " (dry-run)" : ""}`
  );

  const result = await storeViaAauth({
    entities: parsed.entities,
    envelopes: parsed.envelopes,
    baseUrl,
    batchSize,
    dryRun,
  });
  console.log(
    `\nstore complete: ${result.ok} ok, ${result.fail} failed${dryRun ? " (dry-run)" : ""}`
  );
  if (result.fail > 0) process.exit(1);
}
