/**
 * Characterization test: attribution, peer and probe details at the three
 * observation insertion sites.
 *
 * Companion to observation_insert_sites_characterization.test.ts. That file
 * pins the persisted row shape; this one pins the parts a later change to
 * attribution stamping would be most likely to disturb, so an accidental drop
 * at any one site fails a test:
 *
 *   - `provenance` (the agent attribution blob) is stamped at the MCP
 *     structured-store core and at `createCorrection`, and is absent when no
 *     identity context is active;
 *   - `source_peer_id` persists on the MCP path when supplied;
 *   - the MCP content-addressed probe is owner-scoped and its hit branch
 *     reports `deduplicated: true` without an idempotency key;
 *   - cross-site parity of a non-null `provenance` column.
 *
 * Every assertion passes against the pre-extraction code as well; each was also
 * confirmed to fail when the corresponding behaviour is removed at the site.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { createCorrection } from "../../src/services/correction.js";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import { runWithRequestContext } from "../../src/services/request_context.js";

const MCP_USER_ID = "00000000-0000-0000-0000-000000000000";
const RUN = `obs-attr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Row = Record<string, unknown>;

async function rowsForEntity(entityId: string): Promise<Row[]> {
  const { data, error } = await db
    .from("observations")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", MCP_USER_ID);
  expect(error).toBeNull();
  return (data ?? []) as Row[];
}

/** A verified signing-agent context, as the MCP transport stashes it on the session. */
function signedSession(tag: string) {
  return {
    verified: true,
    publicKey: '{"kty":"EC","crv":"P-256"}',
    thumbprint: `tp-${tag}`,
    algorithm: "ES256",
    sub: `agent:${tag}`,
    iss: "https://agent.example",
  } as unknown as Parameters<NeotomaServer["setSessionAgentIdentity"]>[0];
}

/** A client-info identity for code paths that read the request context directly. */
function identity(name: string) {
  return createAgentIdentity({ clientName: name, clientVersion: "9.9.9" });
}

describe("observation insertion sites: attribution, peer and probe details", () => {
  const entityIds: string[] = [];
  let server: NeotomaServer;

  beforeAll(() => {
    server = new NeotomaServer();
  });

  afterEach(() => {
    server.setSessionAgentIdentity(null);
  });

  afterAll(async () => {
    for (const id of entityIds) {
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  async function mcpStore(
    title: string,
    extra: Record<string, unknown> = {}
  ): Promise<{ entityId: string; entity: Record<string, unknown> }> {
    const stored = await server.executeToolForCli(
      "store",
      { entities: [{ entity_type: "note", title }], ...extra },
      MCP_USER_ID
    );
    const entity = (
      JSON.parse(stored.content[0].text) as { entities: Array<Record<string, unknown>> }
    ).entities[0];
    const entityId = entity.entity_id as string;
    if (!entityIds.includes(entityId)) entityIds.push(entityId);
    return { entityId, entity };
  }

  describe("MCP structured-store core", () => {
    it("stamps provenance from the session identity and writes none without one", async () => {
      server.setSessionAgentIdentity(signedSession(`${RUN}-mcp`));
      const withIdentity = await mcpStore(`${RUN} mcp with identity`, {
        idempotency_key: `${RUN}-mcp-id`,
      });
      const stamped = (await rowsForEntity(withIdentity.entityId))[0];
      const provenance = stamped.provenance as Record<string, unknown> | null;
      expect(provenance).toBeTruthy();
      expect(provenance!.agent_thumbprint).toBe(`tp-${RUN}-mcp`);
      expect(provenance!.agent_sub).toBe(`agent:${RUN}-mcp`);

      server.setSessionAgentIdentity(null);
      const withoutIdentity = await mcpStore(`${RUN} mcp without identity`, {
        idempotency_key: `${RUN}-mcp-noid`,
      });
      const bare = (await rowsForEntity(withoutIdentity.entityId))[0];
      const bareProvenance = (bare.provenance ?? null) as Record<string, unknown> | null;
      // No identity: nothing about the signing agent is stamped.
      expect(bareProvenance?.agent_thumbprint ?? null).toBeNull();
      expect(bareProvenance?.agent_sub ?? null).toBeNull();
    });

    it("persists source_peer_id when supplied and leaves it null otherwise", async () => {
      const withPeer = await mcpStore(`${RUN} mcp peer`, {
        idempotency_key: `${RUN}-mcp-peer`,
        source_peer_id: `${RUN}-peer`,
      });
      expect((await rowsForEntity(withPeer.entityId))[0].source_peer_id).toBe(`${RUN}-peer`);

      const withoutPeer = await mcpStore(`${RUN} mcp no peer`, {
        idempotency_key: `${RUN}-mcp-nopeer`,
      });
      expect((await rowsForEntity(withoutPeer.entityId))[0].source_peer_id ?? null).toBeNull();
    });

    it("the probe hit reports deduplicated and writes no second row when only the idempotency key differs", async () => {
      // The observation id is content-addressed over (source, entity, fields)
      // and excludes the idempotency key, so a second request with a new key but
      // identical content bypasses the key replay cache and reaches the probe.
      const title = `${RUN} mcp dedupe`;
      const first = await mcpStore(title, { idempotency_key: `${RUN}-dedupe-1` });
      expect(first.entity.deduplicated).toBeFalsy();
      const second = await mcpStore(title, { idempotency_key: `${RUN}-dedupe-2` });

      expect(second.entityId).toBe(first.entityId);
      expect(second.entity.deduplicated).toBe(true);
      expect(await rowsForEntity(first.entityId)).toHaveLength(1);
    });
  });

  describe("createCorrection", () => {
    it("stamps provenance from the active identity context and writes none without one", async () => {
      const base = await mcpStore(`${RUN} correction base`, {
        idempotency_key: `${RUN}-corr-base`,
      });
      const correct = (suffix: string) => ({
        entity_id: base.entityId,
        entity_type: "note",
        field: "title",
        value: `${RUN} corrected ${suffix}`,
        schema_version: "1.0",
        user_id: MCP_USER_ID,
        idempotency_key: `${RUN}-corr-${suffix}`,
      });

      const stamped = await runWithRequestContext(
        { agentIdentity: identity("corr-attr-agent") },
        () => createCorrection(correct("with"))
      );
      const stampedRow = (await rowsForEntity(base.entityId)).find(
        (r) => r.id === stamped.observation_id
      )!;
      const provenance = stampedRow.provenance as Record<string, unknown> | null;
      expect(provenance).toBeTruthy();
      expect(provenance!.client_name).toBe("corr-attr-agent");

      const bare = await createCorrection(correct("without"));
      const bareRow = (await rowsForEntity(base.entityId)).find(
        (r) => r.id === bare.observation_id
      )!;
      expect(bareRow.provenance ?? null).toBeNull();
    });
  });

  describe("cross-site parity with a non-null provenance column", () => {
    it("MCP-site and createObservation rows carry the same attribution under the same identity", async () => {
      const marker = `${RUN} parity`;
      server.setSessionAgentIdentity(signedSession(`${RUN}-parity`));
      const sessionIdentity = server.getAgentIdentity();
      expect(sessionIdentity).toBeTruthy();
      const mcp = await mcpStore(marker, { idempotency_key: `${RUN}-parity` });
      const mcpRow = (await rowsForEntity(mcp.entityId))[0];
      server.setSessionAgentIdentity(null);

      const httpEntityId = `ent_${RUN}_parity_http`;
      const httpObs = await runWithRequestContext({ agentIdentity: sessionIdentity }, () =>
        createObservation({
          entity_id: httpEntityId,
          entity_type: "note",
          schema_version: mcpRow.schema_version as string,
          source_id: mcpRow.source_id as string,
          interpretation_id: null,
          observed_at: new Date().toISOString(),
          specificity_score: 1,
          source_priority: 100,
          fields: mcpRow.fields as Record<string, unknown>,
          user_id: MCP_USER_ID,
          idempotency_key: mcpRow.idempotency_key as string,
          identity_basis: mcpRow.identity_basis as string,
          identity_rule: mcpRow.identity_rule as string,
        })
      );
      entityIds.push(httpEntityId);
      const httpRow = (await rowsForEntity(httpEntityId)).find((r) => r.id === httpObs.id)!;

      expect(mcpRow.provenance).toBeTruthy();
      expect(httpRow.provenance).toBeTruthy();
      // `attributed_at` is the wall-clock moment each row was stamped.
      const { attributed_at: mcpAt, ...mcpStamp } = mcpRow.provenance as Record<string, unknown>;
      const { attributed_at: httpAt, ...httpStamp } = httpRow.provenance as Record<string, unknown>;
      expect(mcpAt).toBeTruthy();
      expect(httpAt).toBeTruthy();
      expect(httpStamp).toEqual(mcpStamp);
      expect(mcpStamp.agent_thumbprint).toBe(`tp-${RUN}-parity`);
    });
  });
});
