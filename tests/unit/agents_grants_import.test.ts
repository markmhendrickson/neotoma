/**
 * Unit coverage for the `neotoma agents grants import` CLI helper.
 *
 * The migration is a thin shim over `src/services/agent_grants.ts`; we
 * mock the service so the test can assert the import contract without
 * spinning up SQLite. Three behaviours that matter to operators are
 * pinned here:
 *  1. A first run with a known registry shape creates one grant per
 *     entry, stamping `import_source: "env_config"`.
 *  2. A second run is idempotent — agents whose capabilities already
 *     match the legacy entry are reported as skipped (no churn).
 *  3. Diffing entries cause a targeted update via `updateGrantFields`
 *     so existing grants do not lose their stable `grant_id`.
 */

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runAgentsGrantsImport, formatImportResult } from "../../src/cli/agents_grants_import.js";
import type { AgentGrant } from "../../src/services/agent_grants.js";

const grants: AgentGrant[] = [];
let nextId = 1;

function makeGrant(partial: Partial<AgentGrant>): AgentGrant {
  return {
    grant_id: `ent_grant_${nextId++}`,
    user_id: "user-test",
    label: "label",
    capabilities: [],
    status: "active",
    match_sub: null,
    match_iss: null,
    match_thumbprint: null,
    import_source: null,
    last_match_at: null,
    last_match_thumbprint: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

vi.mock("../../src/services/agent_grants.js", () => ({
  createGrant: vi.fn(async (userId: string, draft) => {
    const g = makeGrant({
      user_id: userId,
      label: draft.label,
      capabilities: draft.capabilities ?? [],
      status: draft.status ?? "active",
      match_sub: draft.match_sub ?? null,
      match_iss: draft.match_iss ?? null,
      match_thumbprint: draft.match_thumbprint ?? null,
      import_source: draft.import_source ?? null,
    });
    grants.push(g);
    return g;
  }),
  listGrantsForUser: vi.fn(async (userId: string) =>
    grants.filter((g) => g.user_id === userId),
  ),
  updateGrantFields: vi.fn(async (userId: string, grantId: string, updates) => {
    const idx = grants.findIndex(
      (g) => g.user_id === userId && g.grant_id === grantId,
    );
    if (idx === -1) throw new Error("not found");
    const next = { ...grants[idx], ...updates };
    grants[idx] = next;
    return next;
  }),
}));

import {
  createGrant,
  listGrantsForUser,
  updateGrantFields,
} from "../../src/services/agent_grants.js";

const fixtureRoot = path.resolve(__dirname, "../fixtures/agents_grants_import");

describe("runAgentsGrantsImport", () => {
  beforeEach(() => {
    grants.length = 0;
    nextId = 1;
    vi.clearAllMocks();
    delete process.env.NEOTOMA_AGENT_CAPABILITIES_JSON;
    delete process.env.NEOTOMA_AGENT_CAPABILITIES_FILE;
  });

  afterEach(() => {
    delete process.env.NEOTOMA_AGENT_CAPABILITIES_JSON;
    delete process.env.NEOTOMA_AGENT_CAPABILITIES_FILE;
  });

  it("returns source=none when no registry source is available", async () => {
    const result = await runAgentsGrantsImport({
      ownerUserId: "user-test",
      // Point at a path with no config to force the "none" branch.
      repoRoot: fixtureRoot,
    });
    expect(result.source).toBe("none");
    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
    expect(createGrant).not.toHaveBeenCalled();
  });

  it("creates one grant per registry entry, stamped with import_source=env_config", async () => {
    process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
      default_deny: false,
      agents: {
        "agent-site@neotoma.io": {
          match: {
            sub: "agent-site@neotoma.io",
            iss: "https://agent.neotoma.io",
          },
          capabilities: [
            { op: "store_structured", entity_types: ["neotoma_feedback"] },
            { op: "retrieve", entity_types: ["neotoma_feedback"] },
          ],
        },
      },
    });

    const result = await runAgentsGrantsImport({ ownerUserId: "user-test" });

    expect(result.source).toBe("json");
    expect(result.total).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(createGrant).toHaveBeenCalledTimes(1);
    expect(createGrant).toHaveBeenCalledWith(
      "user-test",
      expect.objectContaining({
        label: "agent-site@neotoma.io",
        import_source: "env_config",
        match_sub: "agent-site@neotoma.io",
        match_iss: "https://agent.neotoma.io",
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            op: "store_structured",
            entity_types: ["neotoma_feedback"],
          }),
        ]),
      }),
    );
  });

  it("is idempotent — reruns skip entries whose capabilities already match", async () => {
    process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
      agents: {
        "agent-site@neotoma.io": {
          match: { sub: "agent-site@neotoma.io" },
          capabilities: [
            { op: "store_structured", entity_types: ["neotoma_feedback"] },
          ],
        },
      },
    });

    const first = await runAgentsGrantsImport({ ownerUserId: "user-test" });
    expect(first.created).toBe(1);

    const second = await runAgentsGrantsImport({ ownerUserId: "user-test" });
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.outcomes[0]).toMatchObject({ kind: "skipped" });
    // Idempotency means we did not call updateGrantFields when nothing
    // diverged from the legacy entry.
    expect(updateGrantFields).not.toHaveBeenCalled();
  });

  it("updates existing grants in place when capabilities diverge", async () => {
    process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
      agents: {
        "agent-site@neotoma.io": {
          match: { sub: "agent-site@neotoma.io" },
          capabilities: [
            { op: "store_structured", entity_types: ["neotoma_feedback"] },
          ],
        },
      },
    });
    const first = await runAgentsGrantsImport({ ownerUserId: "user-test" });
    expect(first.created).toBe(1);
    const grantId = grants[0].grant_id;

    process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
      agents: {
        "agent-site@neotoma.io": {
          match: { sub: "agent-site@neotoma.io" },
          capabilities: [
            { op: "store_structured", entity_types: ["neotoma_feedback", "task"] },
            { op: "retrieve", entity_types: ["neotoma_feedback"] },
          ],
        },
      },
    });
    const second = await runAgentsGrantsImport({ ownerUserId: "user-test" });

    expect(second.updated).toBe(1);
    expect(second.created).toBe(0);
    expect(updateGrantFields).toHaveBeenCalledTimes(1);
    expect(updateGrantFields).toHaveBeenCalledWith(
      "user-test",
      grantId,
      expect.objectContaining({
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            op: "store_structured",
          }),
          expect.objectContaining({ op: "retrieve" }),
        ]),
      }),
    );
    // Stable grant_id across reruns is the migration story we promise
    // operators in docs/subsystems/agent_capabilities.md.
    expect(grants[0].grant_id).toBe(grantId);
  });

  it("skips entries whose match has neither sub nor thumbprint", async () => {
    process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
      agents: {
        "no-match": {
          match: { iss: "https://example.org" },
          capabilities: [
            { op: "store_structured", entity_types: ["task"] },
          ],
        },
      },
    });
    const result = await runAgentsGrantsImport({ ownerUserId: "user-test" });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.outcomes[0]).toMatchObject({
      kind: "skipped",
      reason: expect.stringContaining("sub or thumbprint"),
    });
    expect(createGrant).not.toHaveBeenCalled();
  });

  it("rejects an empty owner user id", async () => {
    await expect(
      runAgentsGrantsImport({ ownerUserId: "   " }),
    ).rejects.toThrow(/owner-user-id/);
  });

  it("surfaces parse errors with the source detail", async () => {
    process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = "{not json";
    await expect(
      runAgentsGrantsImport({ ownerUserId: "user-test" }),
    ).rejects.toThrow(/Failed to parse capability registry/);
    expect(listGrantsForUser).not.toHaveBeenCalled();
  });
});

describe("formatImportResult", () => {
  it("renders a friendly summary for the empty 'none' source", () => {
    const text = formatImportResult({
      source: "none",
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      outcomes: [],
    });
    expect(text).toContain("No legacy capability registry was found.");
    expect(text).toContain("NEOTOMA_AGENT_CAPABILITIES_JSON");
  });

  it("renders created / updated / skipped lines per outcome", () => {
    const grant = makeGrant({ grant_id: "ent_grant_42", label: "L" });
    const text = formatImportResult({
      source: "json",
      source_detail: "NEOTOMA_AGENT_CAPABILITIES_JSON",
      total: 3,
      created: 1,
      updated: 1,
      skipped: 1,
      outcomes: [
        { kind: "created", grant, label: "alpha" },
        { kind: "updated", grant, label: "beta", changed: ["capabilities"] },
        { kind: "skipped", reason: "no fields differ", label: "gamma" },
      ],
    });
    expect(text).toContain("Total: 3  Created: 1  Updated: 1  Skipped: 1");
    expect(text).toContain("+ created  alpha");
    expect(text).toContain("~ updated  beta  (capabilities)");
    expect(text).toContain("- skipped  gamma  (no fields differ)");
  });
});
