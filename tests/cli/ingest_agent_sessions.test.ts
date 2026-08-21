/**
 * Effect-level tests for agent_session ingest + AAuth bulk-store scripts.
 *
 * Asserts observable outcomes (metadata extraction from non-first message
 * lines, content_hash / idempotency-key stability for re-ingest, blob upload
 * key shape, PART_OF relationship emission, signed /store batch bodies) —
 * not merely that schemas accept the fields.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildStoreEnvelope,
  contentHashOf,
  extractMetadata,
  idempotencyKey,
  parseSessionEntityIdFromStoreOutput,
  transcriptIdempotencyKey,
} from "../../scripts/ingest_agent_sessions.js";
import { batchKey, storeViaAauth } from "../../scripts/store_via_aauth.js";
import { getSchemaDefinition } from "../../src/services/schema_definitions.js";

/** Fixture: hook/summary on line 1; cwd/branch/model only on a later message. */
function fixtureJsonl(opts: {
  cwd: string;
  gitBranch: string;
  model: string;
  swarm?: boolean;
}): string {
  const line0 = JSON.stringify({
    type: "file-history-snapshot",
    timestamp: "2026-06-01T10:00:00.000Z",
  });
  const line1 = JSON.stringify({
    type: "user",
    timestamp: "2026-06-01T10:00:01.000Z",
    cwd: opts.cwd,
    gitBranch: opts.gitBranch,
    message: { role: "user", content: opts.swarm ? "ateles-swarm dispatch" : "hello" },
  });
  const line2 = JSON.stringify({
    type: "assistant",
    timestamp: "2026-06-01T10:00:02.000Z",
    cwd: opts.cwd,
    gitBranch: opts.gitBranch,
    message: { role: "assistant", model: opts.model, content: "hi" },
  });
  // Swarm marker must appear in the head window; put it in a system line too.
  const lineSwarm = opts.swarm
    ? JSON.stringify({ type: "system", content: "ateles-swarm agent cicada" }) + "\n"
    : "";
  return `${line0}\n${lineSwarm}${line1}\n${line2}\n`;
}

describe("ingest_agent_sessions extractMetadata (effect)", () => {
  it("extracts cwd, branch, model, and kind from non-first message lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-session-fx-"));
    const file = join(dir, "sess-abc.jsonl");
    const body = fixtureJsonl({
      cwd: "/Users/me/repos/neotoma",
      gitBranch: "feat/agent-session-capture",
      model: "claude-opus-4-20250514",
    });
    writeFileSync(file, body);

    const rec = extractMetadata(file, "auto", null, Buffer.from(body));

    expect(rec.cwd).toBe("/Users/me/repos/neotoma");
    expect(rec.branch).toBe("feat/agent-session-capture");
    expect(rec.model).toBe("claude-opus-4-20250514");
    expect(rec.repo).toBe("neotoma");
    expect(rec.kind).toBe("interactive");
    expect(rec.harness).toBe("claude-code");
    expect(rec.native_session_id).toBe("sess-abc");
    expect(rec.message_count).toBe(2);
    // Line-0-only would leave these null — assert we did not fall into that trap.
    expect(rec.cwd).not.toBeNull();
    expect(rec.branch).not.toBeNull();
    expect(rec.model).not.toBeNull();
  });

  it("marks swarm transcripts autonomous when ateles-swarm appears after line 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-session-fx-"));
    const file = join(dir, "swarm-1.jsonl");
    const body = fixtureJsonl({
      cwd: "/Users/me/repos/ateles",
      gitBranch: "main",
      model: "claude-opus-4-20250514",
      swarm: true,
    });
    writeFileSync(file, body);
    const rec = extractMetadata(file, "auto", null, Buffer.from(body));
    expect(rec.kind).toBe("autonomous");
  });

  it("uses identical content_hash + idempotency key on re-ingest of the same bytes", () => {
    const body = fixtureJsonl({
      cwd: "/tmp/repos/x",
      gitBranch: "main",
      model: "m",
    });
    const buf = Buffer.from(body);
    const hash1 = contentHashOf(buf);
    const hash2 = contentHashOf(Buffer.from(body));
    expect(hash1).toBe(hash2);
    expect(hash1).toBe(createHash("sha256").update(buf).digest("hex"));

    const dir = mkdtempSync(join(tmpdir(), "agent-session-fx-"));
    const file = join(dir, "dup.jsonl");
    writeFileSync(file, body);
    const a = extractMetadata(file, "auto", null, buf);
    const b = extractMetadata(file, "auto", null, Buffer.from(body));
    expect(a._contentHash).toBe(b._contentHash);
    expect(idempotencyKey(a)).toBe(idempotencyKey(b));
    expect(idempotencyKey(a)).toContain(a._contentHash.slice(0, 12));
  });

  it("blob upload idempotency key is content-addressed (retrievable by content_hash)", () => {
    const hash = "abcdef0123456789deadbeef0000111122223333444455556666777788889999";
    const key = transcriptIdempotencyKey(hash);
    expect(key).toBe(`transcript-${hash.slice(0, 16)}`);
    // Same hash → same key (dedupe / retrievability contract for sources blob).
    expect(transcriptIdempotencyKey(hash)).toBe(key);
  });
});

describe("ingest_agent_sessions buildStoreEnvelope (relationships)", () => {
  it("emits transcript PART_OF session via source_index/target_index", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-session-fx-"));
    const file = join(dir, "rel.jsonl");
    const body = fixtureJsonl({
      cwd: "/Users/me/repos/neotoma",
      gitBranch: "main",
      model: "m",
    });
    writeFileSync(file, body);
    const rec = extractMetadata(file, "auto", null, Buffer.from(body));
    const envelope = buildStoreEnvelope(rec);

    expect(envelope.entities).toHaveLength(2);
    expect(envelope.entities[0].entity_type).toBe("agent_session");
    expect(envelope.entities[1].entity_type).toBe("session_transcript");
    expect(envelope.relationships).toContainEqual({
      relationship_type: "PART_OF",
      source_index: 1,
      target_index: 0,
    });
    // FK starts null until entity_id is known (not bare native id).
    expect(envelope.entities[1].agent_session_id).toBeNull();
  });

  it("emits sub-agent PART_OF parent via target_entity_id and stores parent entity_id", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-session-fx-"));
    const file = join(dir, "agent-sub.jsonl");
    const body = fixtureJsonl({
      cwd: "/Users/me/repos/neotoma",
      gitBranch: "main",
      model: "m",
    });
    writeFileSync(file, body);
    const rec = extractMetadata(file, "subagent", "parent-native", Buffer.from(body));
    const parentEntityId = "ent_parentdeadbeef0001";
    const envelope = buildStoreEnvelope(rec, {
      parentEntityId,
      sessionEntityId: "ent_sessiondeadbeef02",
    });

    expect(envelope.entities[0].parent_session_id).toBe(parentEntityId);
    expect(envelope.entities[1].agent_session_id).toBe("ent_sessiondeadbeef02");
    expect(envelope.relationships).toContainEqual({
      relationship_type: "PART_OF",
      source_index: 0,
      target_entity_id: parentEntityId,
    });
  });

  it("parses session entity_id from store --json output", () => {
    const stdout = JSON.stringify({
      entities_created: [{ id: "ent_aaa111" }],
      entities: [
        { entity_type: "agent_session", entity_id: "ent_session99" },
        { entity_type: "session_transcript", entity_id: "ent_tx99" },
      ],
    });
    expect(parseSessionEntityIdFromStoreOutput(stdout)).toBe("ent_session99");
  });
});

describe("agent_session / session_transcript reference_fields (schema)", () => {
  it("declares PART_OF reference_fields for parent_session_id and agent_session_id", () => {
    const session = getSchemaDefinition("agent_session")!;
    const transcript = getSchemaDefinition("session_transcript")!;
    expect(session.schema_definition.reference_fields).toEqual([
      {
        field: "parent_session_id",
        target_entity_type: "agent_session",
        relationship_type: "PART_OF",
      },
    ]);
    expect(transcript.schema_definition.reference_fields).toEqual([
      {
        field: "agent_session_id",
        target_entity_type: "agent_session",
        relationship_type: "PART_OF",
      },
    ]);
    expect(session.schema_definition.agent_instructions).toContain("PART_OF");
    expect(session.schema_definition.agent_instructions).toContain("entity_id");
    expect(session.schema_definition.agent_instructions).not.toMatch(
      /Link the session PART_OF its conversation and to its session_transcript\.?$/
    );
  });
});

describe("store_via_aauth signed bulk /store (effect)", () => {
  it("POSTs each batch to /store with AAuth fetch, import source, and stable idempotency key", async () => {
    const entities = [
      { entity_type: "agent_session", harness: "claude-code", native_session_id: "a" },
      { entity_type: "agent_session", harness: "claude-code", native_session_id: "b" },
      { entity_type: "session_transcript", content_hash: "abc" },
    ];
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const signedFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await storeViaAauth({
      entities,
      baseUrl: "https://neotoma.example.test",
      batchSize: 2,
      dryRun: false,
      signedFetch:
        signedFetch as unknown as typeof import("../../src/cli/aauth_signer.js").cliSignedFetch,
    });

    expect(result.ok).toBe(3);
    expect(result.fail).toBe(0);
    expect(result.batches).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://neotoma.example.test/store");
    expect(calls[0].init.method).toBe("POST");

    const body1 = JSON.parse(String(calls[0].init.body)) as {
      entities: unknown[];
      idempotency_key: string;
      observation_source: string;
    };
    expect(body1.observation_source).toBe("import");
    expect(body1.entities).toHaveLength(2);
    expect(body1.idempotency_key).toBe(batchKey(entities.slice(0, 2)));

    // Re-run identical batch → same idempotency key (dedupe effect).
    expect(batchKey(entities.slice(0, 2))).toBe(body1.idempotency_key);
    expect(batchKey(entities.slice(0, 2))).not.toBe(batchKey(entities.slice(2)));
  });

  it("dry-run does not call signed fetch but still builds batch bodies", async () => {
    const signedFetch = vi.fn();
    const result = await storeViaAauth({
      entities: [{ entity_type: "agent_session", harness: "claude-code", native_session_id: "z" }],
      baseUrl: "https://neotoma.example.test",
      batchSize: 50,
      dryRun: true,
      signedFetch:
        signedFetch as unknown as typeof import("../../src/cli/aauth_signer.js").cliSignedFetch,
    });
    expect(signedFetch).not.toHaveBeenCalled();
    expect(result.ok).toBe(1);
    expect(result.postedBodies[0].observation_source).toBe("import");
  });
});
