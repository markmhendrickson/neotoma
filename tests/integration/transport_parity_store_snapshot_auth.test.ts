/**
 * OFFLINE/local-transport parity gate.
 *
 * An external evaluator's regressions clustered in the offline/HTTP transport —
 * the path historically exercised less than MCP (#1842 issue-submit auth, #1840
 * dedup snapshot, #1819 at_ingested cutoff). This curated suite runs the SAME
 * behavioral assertions through BOTH the MCP dispatch surface and the
 * offline/local HTTP (Express) surface, failing CI if a behavior passes on one
 * transport and not the other. It is the teeth behind the `contract_parity` CI
 * lane: a behavior that broke on the offline path before now has a cross-surface
 * assertion locking the fix on both.
 *
 * Each cell asserts the EFFECT (observation count, reduced snapshot, warning
 * emission, auth outcome) — never mere input acceptance — per task_policy
 * fixed_means_behavior_verified_not_contract_accepted (ent_db0b7855d47012084477fb00)
 * and cross_surface_contract_parity_tested_all_surfaces (ent_2ad0677fe23c0c1878ae43e8).
 * New infra; ties to task ent_5850561116.
 *
 * The five curated behaviors (and the issues they lock in):
 *   1. at_ingested ingestion-time snapshot cutoff           (#1819) — MCP + offline
 *   2. at event-time snapshot cutoff                        (#1819) — MCP + offline
 *   3. dedup store: identical re-store keeps obs count = 1  (#1840) — MCP + offline
 *      (MCP additionally returns deduplicated:true + populated snapshot_after)
 *   4. NULL_CLEARED_FIELD warning under highest_priority    (#1839) — offline (by design)
 *   5. issue-submit auth: local fallback + anonymous remote (#1842, amended by
 *      #1953) — offline (by design)
 *
 * Behaviors 1–3 are true cross-transport parity cells (identical effect on both).
 * Behaviors 4–5 are single-transport BY DESIGN; each documents in the matrix WHY
 * the other transport does not expose the behavior (see transport_parity_matrix.ts).
 */

import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import { fetch as signedFetch } from "@hellocoop/httpsig";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { canonicalAauthAuthority, routeAllowsLocalIssueWriteFallback } from "../../src/actions.js";
import { mintCliAgentTokenJwt, type LoadedSignerConfig } from "../../src/cli/aauth_signer.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { createGoogleSignInHarness, perEmailUserId } from "../helpers/google_sign_in.js";
import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";
import {
  PARITY_USER_ID,
  TRANSPORT_PARITY_MATRIX,
  assertIdenticalEffect,
  callHttp,
  callMcp,
  insertObservation,
  insertSource,
  makeMcpServer,
  observationCount,
  reduceSnapshot,
  snapshotAtCutoff,
  startOfflineServer,
  stopServer,
} from "../helpers/transport_parity_matrix.js";

// The real app captured its canonical public authority at import time. This
// loopback fixture is its internal transport, like a reverse proxy: sign the
// configured public authority, then forward those unchanged headers/body.
const signingAuthority = canonicalAauthAuthority();
async function signedFixturePost(
  base: string,
  route: string,
  body: string,
  headers: Record<string, string>,
  signer: LoadedSignerConfig
): Promise<Response> {
  const jwt = await mintCliAgentTokenJwt(signer);
  const signed = (await signedFetch(`http://${signingAuthority}${route}`, {
    method: "POST",
    body,
    headers,
    signingKey: signer.privateJwk as JsonWebKey,
    signatureKey: { type: "jwt", jwt },
    label: "aasig",
    components: [
      "@method",
      "@authority",
      "@path",
      "content-type",
      "content-digest",
      "signature-key",
    ],
    dryRun: true,
  })) as unknown as { headers: Headers };
  return fetch(`${base}${route}`, { method: "POST", body, headers: signed.headers });
}

describe("OFFLINE/local-transport parity gate (curated MCP↔offline behaviors)", () => {
  let mcpServer: NeotomaServer;
  let offline: { server: Server; base: string };

  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];
  const createdSchemaTypes: string[] = [];

  beforeAll(async () => {
    mcpServer = makeMcpServer();
    offline = await startOfflineServer();
  });

  afterAll(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
    if (createdEntityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
    }
    for (const t of createdSchemaTypes) {
      await db.from("schema_registry").delete().eq("entity_type", t).eq("user_id", PARITY_USER_ID);
    }
    await stopServer(offline.server);
  });

  // Sanity: the matrix is the single source of truth for which behaviors this
  // gate covers. If a cell is added/removed, this assertion documents the count.
  it("matrix declares the five curated transport-parity behaviors", () => {
    expect(TRANSPORT_PARITY_MATRIX.map((s) => s.id)).toEqual([
      "snapshot_at_ingested_cutoff",
      "snapshot_at_event_time_cutoff",
      "store_dedup_observation_count",
      "null_cleared_field_warning",
      "issue_submit_local_auth_fallback",
    ]);
  });

  it("serves ownership guidance through canonical instructions and CLI print", async () => {
    const response = await fetch(`${offline.base}/mcp-interaction-instructions`);
    expect(response.status).toBe(200);
    const instructions = await response.text();
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["dist/cli/index.js", "--base-url", offline.base, "--json", "instructions", "print"],
      { env: { ...process.env, NEOTOMA_BEARER_TOKEN: "", NEOTOMA_ISSUES_TARGET_URL: "" } }
    );
    const printed = JSON.parse(stdout).body;
    for (const text of [instructions, printed]) {
      expect(text).toContain("Ownership metadata:");
      expect(text).toMatch(/outer `user_id` is server-owned/);
      expect(text).toContain("snapshot.user_id");
      expect(text).toContain("format: json");
      expect(text).toMatch(/not.*blanket authorization/);
      expect(text).toMatch(/producers MUST NOT substitute/);
      expect(text).toMatch(/consumers MUST fail closed/);
      expect(text).toMatch(/Guest.*omit/);
    }
  });

  it("serves the ownership distinction in the MCP snapshot tool description", async () => {
    const listed = await modernPost(offline.base, { id: randomUUID(), method: "tools/list" });
    expect(listed.status).toBe(200);
    const tools = listed.body?.result?.tools as Array<{ name: string; description: string }>;
    const description = tools.find((tool) => tool.name === "retrieve_entity_snapshot")?.description;
    expect(description).toContain("server-owned outer user_id");
    expect(description).toContain("snapshot.user_id");
    expect(description).toContain("format=json");
    expect(description).toContain("markdown omits");
    expect(description).toContain("fail closed");
    expect(description).toContain("Guest");
    expect(description).toContain("not blanket authorization");
  });

  it("preserves authoritative outer ownership through HTTP, MCP JSON, CLI and historical projections", async () => {
    const entityId = `ent_owner_parity_${randomUUID().replace(/-/g, "")}`;
    const sourceId = await insertSource("owner");
    createdEntityIds.push(entityId);
    createdSourceIds.push(sourceId);
    const now = new Date().toISOString();
    const nestedOwner = "22222222-2222-4222-8222-222222222222";
    await db.from("entities").insert({
      id: entityId,
      entity_type: "task",
      canonical_name: entityId,
      user_id: PARITY_USER_ID,
    });
    await insertObservation({
      entityId,
      sourceId,
      observedAt: now,
      createdAt: now,
      fields: { title: "Synthetic ownership fixture", user_id: nestedOwner },
    });
    const snapshotInsert = await db.from("entity_snapshots").upsert({
      entity_id: entityId,
      entity_type: "task",
      schema_version: "1.0",
      user_id: PARITY_USER_ID,
      snapshot: { title: "Synthetic ownership fixture", user_id: nestedOwner },
      provenance: {},
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });
    expect(snapshotInsert.error).toBeNull();

    const detailResponse = await fetch(`${offline.base}/entities/${entityId}`);
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail.user_id).toBe(PARITY_USER_ID);
    expect(detail.snapshot.user_id).toBe(nestedOwner);
    for (const projection of [
      {},
      { at: now },
      { at_ingested: now },
      { include_cleared_fields: true },
    ]) {
      const mcp = await callMcp(mcpServer, "retrieve_entity_snapshot", {
        entity_id: entityId,
        format: "json",
        ...projection,
      });
      const http = await callHttp(offline.base, "/get_entity_snapshot", {
        entity_id: entityId,
        ...projection,
      });
      expect(http.status).toBe(200);
      expect(mcp.user_id).toBe(PARITY_USER_ID);
      expect(http.json.user_id).toBe(PARITY_USER_ID);
    }
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "dist/cli/index.js",
        "--base-url",
        offline.base,
        "--api-only",
        "--json",
        "entities",
        "get",
        entityId,
      ],
      {
        env: { ...process.env, NEOTOMA_BEARER_TOKEN: "", NEOTOMA_ISSUES_TARGET_URL: "" },
      }
    );
    expect(JSON.parse(stdout).user_id).toBe(PARITY_USER_ID);
  });

  it("does not disclose the new owner to guests or expand an alias grant", async () => {
    const alias = `ent_guest_owner_${randomUUID().replace(/-/g, "")}`;
    const target = `ent_guest_target_${randomUUID().replace(/-/g, "")}`;
    for (const id of [alias, target]) {
      createdEntityIds.push(id);
      await db
        .from("entities")
        .insert({ id, entity_type: "issue", canonical_name: id, user_id: PARITY_USER_ID });
    }
    // Synthetic capability exists only inside the isolated test database.
    const token = await generateGuestAccessToken({ entityIds: [alias], userId: PARITY_USER_ID });
    createdEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
    const direct = await fetch(`${offline.base}/entities/${alias}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(direct.status).toBe(200);
    expect(await direct.json()).not.toHaveProperty("user_id");
    await db.from("entities").update({ merged_to_entity_id: target }).eq("id", alias);
    const denied = await fetch(`${offline.base}/entities/${alias}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(denied.ok).toBe(false);
    expect(await denied.text()).not.toContain(PARITY_USER_ID);
  });

  it("enforces authenticated ownership and alias scope on HTTP, MCP wire and CLI", async () => {
    const keys = [
      "NEOTOMA_GOOGLE_CLIENT_ID",
      "NEOTOMA_GOOGLE_CLIENT_SECRET",
      "NEOTOMA_APPROVED_EMAILS",
      "NEOTOMA_SHARED_GRAPH_USER_ID",
      "NEOTOMA_BEARER_TOKEN",
      "NEOTOMA_ACCESS_POLICY_NOTE",
      "NEOTOMA_ACCESS_POLICY_RENDERED_PAGE",
    ];
    const previous = keys.map((key) => process.env[key]);
    const email = `owner-${randomUUID()}@example.com`;
    const clientId = "ownership-test-client";
    process.env.NEOTOMA_GOOGLE_CLIENT_ID = clientId;
    process.env.NEOTOMA_GOOGLE_CLIENT_SECRET = "synthetic-test-secret";
    process.env.NEOTOMA_APPROVED_EMAILS = email;
    delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;
    delete process.env.NEOTOMA_BEARER_TOKEN;
    delete process.env.NEOTOMA_ACCESS_POLICY_NOTE;
    const harness = await createGoogleSignInHarness({ apiBase: () => offline.base, clientId });
    try {
      const userId = await perEmailUserId(email);
      const { accessToken } = await harness.signIn(email);
      const pair = await generateKeyPair("ES256", { extractable: true });
      const privateJwk = { ...(await exportJWK(pair.privateKey)), alg: "ES256" };
      const thumbprint = await calculateJwkThumbprint(await exportJWK(pair.publicKey));
      const signer = {
        privateJwk,
        sub: "apis@ateles-swarm",
        iss: "https://agent.example.com",
        kid: thumbprint,
        tokenTtlSec: 120,
      };
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      };
      const unadmitted = await signedFixturePost(
        offline.base,
        "/store",
        JSON.stringify({
          entities: [{ entity_type: "note", title: randomUUID(), content: "Must not persist" }],
          idempotency_key: randomUUID(),
        }),
        headers,
        signer
      );
      expect(unadmitted.status).toBe(500);
      expect((await unadmitted.json()).message).toContain('Access policy "closed"');
      const absent = await db
        .from("observations")
        .select("id")
        .eq("user_id", userId)
        .eq("entity_type", "note");
      expect(absent.error).toBeNull();
      expect(absent.data).toHaveLength(0);
      const granted = await fetch(`${offline.base}/agents/grants`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          label: "Synthetic ownership fixture",
          match_sub: signer.sub,
          match_iss: signer.iss,
          match_thumbprint: thumbprint,
          capabilities: [
            { op: "store", entity_types: ["note", "task", "checkpoint_brief"] },
            { op: "correct", entity_types: ["note", "task", "checkpoint_brief"] },
          ],
        }),
      });
      expect(granted.status, await granted.clone().text()).toBe(201);
      createdEntityIds.push((await granted.json()).grant.grant_id);
      const stored = await signedFixturePost(
        offline.base,
        "/store",
        JSON.stringify({
          entities: [{ entity_type: "note", title: randomUUID(), content: "Synthetic owner" }],
          idempotency_key: randomUUID(),
        }),
        headers,
        signer
      );
      expect(stored.status, await stored.clone().text()).toBe(200);
      const body = await stored.json();
      const entityId = body.entities?.[0]?.entity_id ?? body.structured?.entities?.[0]?.entity_id;
      expect(entityId).toBeTypeOf("string");
      createdEntityIds.push(entityId);
      const corrected = await signedFixturePost(
        offline.base,
        "/correct",
        JSON.stringify({
          entity_id: entityId,
          entity_type: "note",
          field: "content",
          value: "Corrected synthetic owner",
          idempotency_key: randomUUID(),
        }),
        headers,
        signer
      );
      expect(corrected.status).toBe(200);
      const observed = await fetch(`${offline.base}/entities/${entityId}/observations`, {
        headers,
      });
      expect(observed.status).toBe(200);
      const observations = (await observed.json()).observations;
      expect(observations.length).toBeGreaterThanOrEqual(2);
      for (const observation of observations) {
        expect(observation.provenance).toMatchObject({
          attribution_tier: "software",
          agent_sub: signer.sub,
          agent_thumbprint: thumbprint,
        });
      }
      // Explicit sibling-test binding; ordinary single-repo CI does not claim
      // this optional joined evidence without the supplied Ateles checkout.
      if (process.env.ATELES_TEST_ROOT) {
        const resolverPair = await generateKeyPair("ES256", { extractable: true });
        const resolverJwk = { ...(await exportJWK(resolverPair.privateKey)), alg: "ES256" };
        const resolverJkt = await calculateJwkThumbprint(await exportJWK(resolverPair.publicKey));
        const resolverGrant = await fetch(`${offline.base}/agents/grants`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            label: "Synthetic resolver fixture",
            match_sub: "ateles@ateles-swarm",
            match_iss: signer.iss,
            match_thumbprint: resolverJkt,
            capabilities: [{ op: "correct", entity_types: ["checkpoint_brief"] }],
          }),
        });
        expect(resolverGrant.status, await resolverGrant.clone().text()).toBe(201);
        createdEntityIds.push((await resolverGrant.json()).grant.grant_id);
        const taskFields = {
          title: { type: "string" },
          status: { type: "string" },
          blocked_reason: { type: "string" },
          assigned_to: { type: "string" },
          action_type: { type: "string" },
          confidence: { type: "number" },
        };
        const taskSchema = await fetch(`${offline.base}/register_schema`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            entity_type: "task",
            schema_version: "1.0",
            user_specific: true,
            activate: true,
            schema_definition: { fields: taskFields, canonical_name_fields: ["title"] },
            reducer_config: {
              merge_policies: Object.fromEntries(
                Object.keys(taskFields).map((field) => [field, { strategy: "last_write" }])
              ),
            },
          }),
        });
        expect(taskSchema.status, await taskSchema.clone().text()).toBe(200);
        const taskStored = await signedFixturePost(
          offline.base,
          "/store",
          JSON.stringify({
            entities: [
              {
                entity_type: "task",
                title: randomUUID(),
                status: "awaiting_approval",
                blocked_reason: "Synthetic hold",
                assigned_to: "cicada",
                action_type: "local_edit",
                confidence: 0.3,
              },
            ],
            idempotency_key: randomUUID(),
          }),
          headers,
          signer
        );
        expect(taskStored.status, await taskStored.clone().text()).toBe(200);
        const taskBody = await taskStored.json();
        const taskId =
          taskBody.entities?.[0]?.entity_id ?? taskBody.structured?.entities?.[0]?.entity_id;
        createdEntityIds.push(taskId);
        const task = await (await fetch(`${offline.base}/entities/${taskId}`, { headers })).json();
        const bridgeInput = {
          base: offline.base,
          canonical_base: `http://${signingAuthority}`,
          access_token: accessToken,
          producer_jkt: thumbprint,
          resolver_jkt: resolverJkt,
          user_id: userId,
          task,
        };
        const bridge = async (mode: string, extra: Record<string, unknown> = {}) => {
          const stdout = await new Promise<string>((resolve, reject) => {
            const child = execFile(
              "python3",
              ["execution/evals/checkpoint_recovery/real_transport_bridge.py", mode],
              {
                cwd: process.env.ATELES_TEST_ROOT,
                env: { ...process.env, PYTHONPATH: ".", PYTHONDONTWRITEBYTECODE: "1" },
              },
              (error, output, stderr) => {
                if (error) reject(new Error(`Synthetic bridge failed: ${stderr}`));
                else resolve(output);
              }
            );
            child.stdin?.end(JSON.stringify({ ...bridgeInput, ...extra }));
          });
          return JSON.parse(stdout);
        };
        const envelope = await bridge("envelope");
        const checkpointFields = {
          title: { type: "string" },
          body: { type: "string" },
          task_entity_id: { type: "string" },
          policy_entity_id: { type: "string" },
          gate_action: { type: "string" },
          blast_radius: { type: "string" },
          handler: { type: "string" },
          status: { type: "string" },
          resolved_dispatched: { type: "boolean" },
        };
        const schemaResponse = await fetch(`${offline.base}/register_schema`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            entity_type: "checkpoint_brief",
            schema_version: "1.0",
            user_specific: true,
            activate: true,
            schema_definition: { fields: checkpointFields, canonical_name_fields: ["title"] },
            reducer_config: {
              merge_policies: Object.fromEntries(
                Object.keys(checkpointFields).map((field) => [field, { strategy: "last_write" }])
              ),
            },
          }),
        });
        expect(schemaResponse.status, await schemaResponse.clone().text()).toBe(200);
        try {
          const checkpointStored = await signedFixturePost(
            offline.base,
            "/store",
            JSON.stringify({
              entities: [
                {
                  entity_type: "checkpoint_brief",
                  title: randomUUID(),
                  ...envelope,
                  task_entity_id: taskId,
                  handler: "apis",
                  status: "awaiting_operator",
                  resolved_dispatched: false,
                },
              ],
              idempotency_key: randomUUID(),
            }),
            headers,
            signer
          );
          expect(checkpointStored.status, await checkpointStored.clone().text()).toBe(200);
          const checkpointBody = await checkpointStored.json();
          const checkpointId =
            checkpointBody.entities?.[0]?.entity_id ??
            checkpointBody.structured?.entities?.[0]?.entity_id;
          createdEntityIds.push(checkpointId);
          const effect = await bridge("resolve", {
            checkpoint_id: checkpointId,
            task_id: taskId,
            resolver_jwk: resolverJwk,
          });
          expect(effect).toMatchObject({
            creation_verified: true,
            serialized_outer_owner_bound: true,
            resolver_attribution_verified: true,
            dispatch_count: 1,
            replay_denied: true,
          });
        } finally {
          for (const entityType of ["checkpoint_brief", "task"]) {
            await db
              .from("schema_registry")
              .delete()
              .eq("entity_type", entityType)
              .eq("user_id", userId);
          }
        }
      }
      const alias = `ent_authenticated_alias_${randomUUID().replace(/-/g, "")}`;
      const foreign = `ent_authenticated_foreign_${randomUUID().replace(/-/g, "")}`;
      createdEntityIds.push(alias, foreign);
      for (const [id, owner] of [
        [alias, userId],
        [foreign, "22222222-2222-4222-8222-222222222222"],
      ]) {
        const inserted = await db
          .from("entities")
          .insert({ id, entity_type: "note", canonical_name: id, user_id: owner });
        expect(inserted.error).toBeNull();
      }
      await db.from("entities").update({ merged_to_entity_id: entityId }).eq("id", alias);
      for (const id of [entityId, alias]) {
        const response = await fetch(`${offline.base}/entities/${id}`, { headers });
        expect(response.status).toBe(200);
        const detail = await response.json();
        expect(detail.user_id).toBe(userId);
        expect(detail.snapshot.content).toBe("Corrected synthetic owner");
        const wire = await modernPost(
          offline.base,
          {
            id: randomUUID(),
            method: "tools/call",
            params: {
              name: "retrieve_entity_snapshot",
              arguments: { entity_id: id, format: "json" },
            },
          },
          { headers }
        );
        expect(wire.status).toBe(200);
        expect(wire.body?.result?.isError).not.toBe(true);
        expect(toolResultJson(wire.body).user_id).toBe(userId);
        const { stdout } = await promisify(execFile)(
          process.execPath,
          [
            "dist/cli/index.js",
            "--base-url",
            offline.base,
            "--api-only",
            "--json",
            "entities",
            "get",
            id,
          ],
          {
            env: {
              ...process.env,
              NEOTOMA_BEARER_TOKEN: accessToken,
              NEOTOMA_ISSUES_TARGET_URL: "",
            },
          }
        );
        expect(JSON.parse(stdout).user_id).toBe(userId);
      }
      await db.from("entities").update({ merged_to_entity_id: foreign }).eq("id", alias);
      const denied = await fetch(`${offline.base}/entities/${alias}`, { headers });
      expect(denied.ok).toBe(false);
      const wireDenied = await modernPost(
        offline.base,
        {
          id: randomUUID(),
          method: "tools/call",
          params: {
            name: "retrieve_entity_snapshot",
            arguments: { entity_id: alias, format: "json" },
          },
        },
        { headers }
      );
      expect(wireDenied.body?.error?.code).toBe(-32602);
      expect(wireDenied.body?.result).toBeUndefined();
      await expect(
        promisify(execFile)(
          process.execPath,
          [
            "dist/cli/index.js",
            "--base-url",
            offline.base,
            "--api-only",
            "--json",
            "entities",
            "get",
            alias,
          ],
          {
            env: {
              ...process.env,
              NEOTOMA_BEARER_TOKEN: accessToken,
              NEOTOMA_ISSUES_TARGET_URL: "",
            },
          }
        )
      ).rejects.toMatchObject({ code: 1 });

      // The rendered detail routes use the same merge traversal as JSON detail.
      // Exercise actual entrypoints with the authenticated fixture, not a mocked
      // owner resolver. Direct DB setup is synthetic read-only fixture content.
      const pages = {
        alias: `ent_page_alias_${randomUUID().replace(/-/g, "")}`,
        own: `ent_page_own_${randomUUID().replace(/-/g, "")}`,
        foreign: `ent_page_foreign_${randomUUID().replace(/-/g, "")}`,
        missingOwner: `ent_page_missing_${randomUUID().replace(/-/g, "")}`,
      };
      const ownMarker = `Synthetic own page ${randomUUID()}`;
      const foreignMarker = `Synthetic restricted page ${randomUUID()}`;
      for (const [id, owner, marker] of [
        [pages.alias, userId, ownMarker],
        [pages.own, userId, ownMarker],
        [pages.foreign, "22222222-2222-4222-8222-222222222222", foreignMarker],
        [pages.missingOwner, null, ownMarker],
      ] as const) {
        createdEntityIds.push(id);
        const row = await db.from("entities").insert({
          id,
          entity_type: "rendered_page",
          canonical_name: id,
          user_id: owner,
        });
        expect(row.error).toBeNull();
        const snapshot = await db.from("entity_snapshots").upsert({
          entity_id: id,
          entity_type: "rendered_page",
          schema_version: "1.0",
          user_id: owner,
          snapshot: { title: marker, html_body: `<p>${marker}</p>` },
          provenance: {},
          observation_count: 0,
          last_observation_at: new Date().toISOString(),
          computed_at: new Date().toISOString(),
        });
        expect(snapshot.error).toBeNull();
      }
      await db.from("entities").update({ merged_to_entity_id: pages.own }).eq("id", pages.alias);
      for (const format of ["markdown", "html"]) {
        for (const id of [pages.own, pages.alias]) {
          const response = await fetch(`${offline.base}/entities/${id}/${format}`, { headers });
          expect(response.status).toBe(200);
          expect(await response.text()).toContain(ownMarker);
        }
      }
      const aliasOnlyToken = await generateGuestAccessToken({
        entityIds: [pages.alias],
        userId,
      });
      const allowedToken = await generateGuestAccessToken({
        entityIds: [pages.alias, pages.own, pages.missingOwner],
        userId,
      });
      for (const token of [aliasOnlyToken, allowedToken]) {
        createdEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
      }
      // Arrange existing supported guest policy only in this disposable app;
      // exercise its restrictive branch before the normal scoped-read branch.
      process.env.NEOTOMA_ACCESS_POLICY_RENDERED_PAGE = "closed";
      const closedGuest = await fetch(`${offline.base}/entities/${pages.own}/html`, {
        headers: { Authorization: `Bearer ${allowedToken}` },
      });
      expect(closedGuest.ok).toBe(false);
      expect(await closedGuest.text()).not.toContain(ownMarker);
      process.env.NEOTOMA_ACCESS_POLICY_RENDERED_PAGE = "submitter_scoped";
      const guestAliasDenied = await fetch(`${offline.base}/entities/${pages.alias}/html`, {
        headers: { Authorization: `Bearer ${aliasOnlyToken}` },
      });
      expect.soft(guestAliasDenied.ok).toBe(false);
      expect.soft(await guestAliasDenied.text()).not.toContain(ownMarker);
      for (const id of [pages.own, pages.alias]) {
        const allowed = await fetch(`${offline.base}/entities/${id}/html`, {
          headers: { Authorization: `Bearer ${allowedToken}` },
        });
        expect(allowed.status, await allowed.clone().text()).toBe(200);
        const html = await allowed.text();
        expect(html).toContain(ownMarker);
        expect(html).not.toContain(userId);
      }
      for (const suffix of ["", "/html"]) {
        const guestMissingOwner = await fetch(
          `${offline.base}/entities/${pages.missingOwner}${suffix}`,
          { headers: { Authorization: `Bearer ${allowedToken}` } }
        );
        expect(guestMissingOwner.ok).toBe(false);
        expect(await guestMissingOwner.text()).not.toContain(ownMarker);
      }
      await db
        .from("entities")
        .update({ merged_to_entity_id: pages.foreign })
        .eq("id", pages.alias);
      for (const format of ["markdown", "html"]) {
        const crossOwner = await fetch(`${offline.base}/entities/${pages.alias}/${format}`, {
          headers,
        });
        expect.soft(crossOwner.status).toBe(404);
        expect.soft(await crossOwner.text()).not.toContain(foreignMarker);
        const missingOwner = await fetch(
          `${offline.base}/entities/${pages.missingOwner}/${format}`,
          { headers }
        );
        expect(missingOwner.status).toBe(404);
        expect(await missingOwner.text()).not.toContain(ownMarker);
      }
      const guestCrossOwner = await fetch(`${offline.base}/entities/${pages.alias}/html`, {
        headers: { Authorization: `Bearer ${allowedToken}` },
      });
      expect.soft(guestCrossOwner.ok).toBe(false);
      expect.soft(await guestCrossOwner.text()).not.toContain(foreignMarker);
    } finally {
      harness.restoreFetch();
      keys.forEach((key, i) => {
        if (previous[i] === undefined) delete process.env[key];
        else process.env[key] = previous[i];
      });
    }
  });

  // -------------------------------------------------------------------------
  // Cell 1 (#1819) — at_ingested ingestion-time cutoff: MCP ↔ offline parity.
  // -------------------------------------------------------------------------
  it("at_ingested cutoff excludes a late backfill — IDENTICAL effect on MCP and offline (#1819)", async () => {
    const entityId = `ent_parity_ingested_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    createdEntityIds.push(entityId);
    const sourceId = await insertSource("ingested");
    createdSourceIds.push(sourceId);

    const threeDaysAgo = new Date(Date.now() - 3 * 864e5).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString();
    const oneDayAgo = new Date(Date.now() - 1 * 864e5).toISOString();
    const now = new Date().toISOString();

    // obs_early: genuinely historical. obs_backfill: past event-time but ingested now.
    await insertObservation({
      entityId,
      sourceId,
      observedAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      fields: { title: "Early", status: "pending" },
    });
    await insertObservation({
      entityId,
      sourceId,
      observedAt: twoDaysAgo,
      createdAt: now,
      fields: { title: "Backfill", status: "done" },
    });

    // at_ingested = oneDayAgo: the backfill (created_at = now) must be excluded on
    // BOTH transports → observation_count=1, status="pending".
    const mcp = await snapshotAtCutoff("mcp", mcpServer, offline.base, {
      entityId,
      atIngested: oneDayAgo,
    });
    const off = await snapshotAtCutoff("offline", mcpServer, offline.base, {
      entityId,
      atIngested: oneDayAgo,
    });

    expect(mcp.observationCount).toBe(1);
    expect(mcp.status).toBe("pending");
    assertIdenticalEffect("at_ingested cutoff", mcp, off);
  });

  // -------------------------------------------------------------------------
  // Cell 2 (#1819) — at event-time cutoff: MCP ↔ offline parity.
  // -------------------------------------------------------------------------
  it("at event-time cutoff excludes a future observation — IDENTICAL effect on MCP and offline (#1819)", async () => {
    const entityId = `ent_parity_at_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    createdEntityIds.push(entityId);
    const sourceId = await insertSource("at");
    createdSourceIds.push(sourceId);

    const threeDaysAgo = new Date(Date.now() - 3 * 864e5).toISOString();
    const yesterday = new Date(Date.now() - 1 * 864e5).toISOString();
    const tomorrow = new Date(Date.now() + 1 * 864e5).toISOString();

    await insertObservation({
      entityId,
      sourceId,
      observedAt: threeDaysAgo,
      createdAt: threeDaysAgo,
      fields: { title: "Old", status: "pending" },
    });
    await insertObservation({
      entityId,
      sourceId,
      observedAt: tomorrow,
      createdAt: threeDaysAgo,
      fields: { title: "Future", status: "done" },
    });

    // at = yesterday: the future-observed obs must be excluded on BOTH transports
    // → observation_count=1, status="pending".
    const mcp = await snapshotAtCutoff("mcp", mcpServer, offline.base, { entityId, at: yesterday });
    const off = await snapshotAtCutoff("offline", mcpServer, offline.base, {
      entityId,
      at: yesterday,
    });

    expect(mcp.observationCount).toBe(1);
    expect(mcp.status).toBe("pending");
    assertIdenticalEffect("at event-time cutoff", mcp, off);
  });

  // -------------------------------------------------------------------------
  // Cell 3 (#1840) — dedup: identical re-store keeps observation count at 1 and
  // leaves the reduced snapshot populated on BOTH transports. MCP additionally
  // returns the #1840 response enrichment (deduplicated:true + snapshot_after).
  // -------------------------------------------------------------------------
  it("identical re-store deduplicates — obs count stays 1 + snapshot intact on MCP and offline (#1840)", async () => {
    const baseType = `parity_dedup_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

    // One schema, reused for both transports (distinct canonical_name per surface
    // so the two surfaces target distinct entities — we compare the EFFECT shape,
    // not a shared row).
    await schemaRegistry.register({
      entity_type: baseType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          value: { type: "number", required: false },
          label: { type: "string", required: true },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: {
        merge_policies: { value: { strategy: "last_write" }, label: { strategy: "last_write" } },
      },
      user_id: PARITY_USER_ID,
      user_specific: true,
      activate: true,
    });
    createdSchemaTypes.push(baseType);

    // ---- MCP transport ----
    const mcpKey = `parity-dedup-mcp-${randomUUID()}`;
    const mcpEntity = {
      entity_type: baseType,
      canonical_name: `mcp-${Date.now()}`,
      label: "t",
      value: 42,
    };
    const mcpStoreArgs = {
      user_id: PARITY_USER_ID,
      idempotency_key: mcpKey,
      entities: [mcpEntity],
      source_priority: 5,
      observation_source: "sensor",
    };
    const mcpOne = await callMcp(mcpServer, "store", mcpStoreArgs);
    const mcpEntryOne = (mcpOne.entities as Array<Record<string, unknown>>)[0]!;
    const mcpEntityId = mcpEntryOne.entity_id as string;
    createdEntityIds.push(mcpEntityId);
    if (mcpOne.source_id) createdSourceIds.push(mcpOne.source_id as string);
    expect(mcpEntryOne.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });

    const mcpTwo = await callMcp(mcpServer, "store", mcpStoreArgs);
    const mcpEntryTwo = (mcpTwo.entities as Array<Record<string, unknown>>)[0]!;
    if (mcpTwo.source_id) createdSourceIds.push(mcpTwo.source_id as string);

    // ---- Offline/HTTP transport ----
    const offKey = `parity-dedup-off-${randomUUID()}`;
    const offEntity = {
      entity_type: baseType,
      canonical_name: `off-${Date.now()}`,
      label: "t",
      value: 42,
    };
    const offBody = {
      idempotency_key: offKey,
      commit: true,
      source_priority: 5,
      observation_source: "sensor",
      entities: [offEntity],
    };
    const offOne = await callHttp(offline.base, "/store", offBody);
    expect(offOne.status).toBe(200);
    const offEntryOne = (offOne.json.entities as Array<Record<string, unknown>>)[0]!;
    const offEntityId = offEntryOne.entity_id as string;
    createdEntityIds.push(offEntityId);
    if (offOne.json.source_id) createdSourceIds.push(offOne.json.source_id as string);
    expect(offEntryOne.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });

    const offTwo = await callHttp(offline.base, "/store", offBody);
    expect(offTwo.status).toBe(200);

    // ---- PARITY INVARIANT (the data-integrity effect), identical on both ----
    // 1. The re-store created NO new observation: count stays 1 on each surface.
    const mcpObs = await observationCount(mcpEntityId);
    const offObs = await observationCount(offEntityId);
    expect(mcpObs).toBe(1);
    assertIdenticalEffect("dedup observation count", mcpObs, offObs);

    // 2. The reduced snapshot stays populated (NOT lost) on each surface.
    const mcpSnap = await reduceSnapshot(mcpEntityId);
    const offSnap = await reduceSnapshot(offEntityId);
    expect(mcpSnap).toMatchObject({ value: 42, label: "t" });
    assertIdenticalEffect("dedup reduced snapshot", mcpSnap, offSnap);

    // ---- Response enrichment from the #1840 fix — HARD PARITY (#1860) ----
    // Both transports MUST carry the deduplicated marker AND the populated
    // entity_snapshot_after on the idempotency replay. This was an MCP-only
    // divergence until #1860 (PR #1878) mirrored the #1840 fix into the
    // offline/HTTP path (src/actions.ts); this cell now asserts identical
    // effect on both surfaces rather than documenting the gap.
    const offEntryTwo = (offTwo.json.entities as Array<Record<string, unknown>>)[0]!;
    expect(mcpEntryTwo.deduplicated).toBe(true);
    expect(offEntryTwo.deduplicated).toBe(true);
    assertIdenticalEffect(
      "dedup deduplicated marker",
      mcpEntryTwo.deduplicated,
      offEntryTwo.deduplicated
    );
    expect(mcpEntryTwo.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });
    expect(offEntryTwo.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });
    assertIdenticalEffect(
      "dedup entity_snapshot_after",
      mcpEntryTwo.entity_snapshot_after,
      offEntryTwo.entity_snapshot_after
    );
  });

  // -------------------------------------------------------------------------
  // Cell 4 (#1839) — NULL_CLEARED_FIELD warning: offline path by design.
  // -------------------------------------------------------------------------
  it("NULL_CLEARED_FIELD warning fires on the offline /store path under highest_priority (#1839)", async () => {
    const nullType = `parity_null_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await schemaRegistry.register({
      entity_type: nullType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          label: { type: "string", required: false },
          value: { type: "number", required: false },
        },
        identity_opt_out: "heuristic_canonical_name",
      },
      reducer_config: { merge_policies: { value: { strategy: "highest_priority" } } },
      user_id: PARITY_USER_ID,
      user_specific: true,
      activate: true,
    });
    createdSchemaTypes.push(nullType);

    const canonical = `parity-null-${Date.now()}`;

    // Good value at source_priority 10 → reduced into the snapshot, no warning.
    const good = await callHttp(offline.base, "/store", {
      idempotency_key: `parity-null-good-${randomUUID()}`,
      commit: true,
      source_priority: 10,
      observation_source: "sensor",
      entities: [{ entity_type: nullType, canonical_name: canonical, label: "t", value: 0.18 }],
    });
    expect(good.status).toBe(200);
    const goodEntities = good.json.entities as Array<Record<string, unknown>>;
    const entityId = goodEntities[0]!.entity_id as string;
    createdEntityIds.push(entityId);
    expect((await reduceSnapshot(entityId)).value).toBe(0.18);
    const goodWarnings = (good.json.store_warnings as Array<{ code: string }> | undefined) ?? [];
    expect(goodWarnings.some((w) => w.code === "NULL_CLEARED_FIELD")).toBe(false);

    // null at a HIGHER priority → wins selection, clears the field, AND warns.
    const cleared = await callHttp(offline.base, "/store", {
      idempotency_key: `parity-null-clear-${randomUUID()}`,
      commit: true,
      source_priority: 20,
      observation_source: "sensor",
      entities: [{ entity_type: nullType, canonical_name: canonical, label: "t", value: null }],
    });
    expect(cleared.status).toBe(200);

    // Semantics unchanged: the field is cleared from the reduced snapshot.
    const reduced = await reduceSnapshot(entityId);
    expect(reduced.value === undefined || reduced.value === null).toBe(true);

    // The warning fires with the correct shape.
    const warnings =
      (cleared.json.store_warnings as
        | Array<{
            code: string;
            message: string;
            entity_type: string;
            entity_id: string;
          }>
        | undefined) ?? [];
    const warn = warnings.find((w) => w.code === "NULL_CLEARED_FIELD");
    expect(warn).toBeDefined();
    expect(warn!.entity_type).toBe(nullType);
    expect(warn!.entity_id).toBe(entityId);
    expect(warn!.message).toContain('"value"');
    expect(warn!.message).toContain("highest_priority");
  });

  // -------------------------------------------------------------------------
  // Cell 5 (#1842) — issue-submit local-loopback auth: offline path by design.
  // Local no-Bearer must be ALLOWED; remote (untrusted X-Forwarded-For) no-Bearer
  // must still be REJECTED with AUTH_REQUIRED.
  // -------------------------------------------------------------------------
  it("issue-submit: local no-bearer allowed, remote no-bearer still rejected (#1842)", async () => {
    // The fallback is scoped to exactly the issue-write routes.
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/issues/submit" })).toBe(
      true
    );
    expect(routeAllowsLocalIssueWriteFallback({ method: "POST", path: "/store" })).toBe(false);

    // Local request, NO Authorization header → must clear the auth gate.
    const local = await callHttp(offline.base, "/issues/submit", {
      title: `parity local issue ${Date.now()}`,
      body: "Created locally with no Bearer token — must not require auth.",
      visibility: "private",
      reporter_git_sha: "0".repeat(40),
      reporter_app_version: "0.0.0-test",
    });
    // The LOCAL auth gate must clear: no 401, and the write is accepted + stored
    // locally (entity_id present). Assert this via structured fields, NOT a raw
    // body string-match: the response can carry a `remote_submission_error` whose
    // text legitimately mentions AUTH_REQUIRED when the remote MIRROR to a hosted
    // Neotoma has no agent_grant (the default in CI). That remote-mirror failure
    // is orthogonal to the local-loopback auth gate this cell verifies — the local
    // submit still succeeds and stores with sync_pending for later retry.
    expect(local.status).not.toBe(401);
    const localJson = local.json as {
      entity_id?: string;
      code?: string;
      error?: string;
    };
    expect(localJson.entity_id).toBeTruthy();
    expect(localJson.code).not.toBe("AUTH_REQUIRED");
    expect(localJson.error ?? "").not.toMatch(/AUTH_REQUIRED/);

    // Remote request (untrusted X-Forwarded-For), NO Bearer → since #1953 this
    // is ALLOWED on /issues/submit specifically: a third party's agent must be
    // able to open an issue with no prior identity, because the guest access
    // token is minted BY the submit rather than required for it. The rest of
    // #1842's boundary is unchanged and asserted below.
    const remoteSubmit = await callHttp(
      offline.base,
      "/issues/submit",
      {
        title: `parity remote anonymous issue ${Date.now()}`,
        body: "Anonymous remote first contact must be able to open an issue.",
        visibility: "private",
        reporter_app_version: "0.0.0-test",
      },
      { "X-Forwarded-For": "203.0.113.7" }
    );
    expect(remoteSubmit.status).not.toBe(401);
    const remoteJson = remoteSubmit.json as { entity_id?: string; code?: string };
    expect(remoteJson.entity_id).toBeTruthy();
    expect(remoteJson.code).not.toBe("AUTH_REQUIRED");

    // ...but a remote no-Bearer caller still cannot append to an EXISTING
    // thread: by then they hold the token their submit returned, so anonymity
    // buys nothing, while writing into someone else's thread is a strictly
    // wider blast radius than opening a new one (#1953).
    const remoteAppend = await callHttp(
      offline.base,
      "/issues/add_message",
      {
        entity_id: "ent_0000000000000000000000ff",
        body: "An unidentified caller must not append to an existing thread.",
      },
      { "X-Forwarded-For": "203.0.113.7" }
    );
    expect(remoteAppend.status).toBe(401);
    expect(remoteAppend.text).toMatch(/AUTH_REQUIRED/);
  });
});
