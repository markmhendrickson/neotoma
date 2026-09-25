/**
 * `describe_instance_policy` (MCP tool, `NeotomaServer.describeInstancePolicy`
 * in src/server.ts) must let an agent tell "no policy configured" apart from
 * "policy unreadable" — the same distinction #2495 already restored for
 * `GET /instance-policy` (see
 * tests/integration/instance_policy_get_endpoint_lookup_failed.test.ts).
 *
 * Before this fix, the MCP handler called the strict
 * `getInstancePolicyResult()` but returned only
 * `{ policy: result.policy ?? null, entity_id: result.entity_id ?? null }` —
 * `lookup_failed` and `error` were read off the result and discarded. A
 * failed lookup and a genuinely unconfigured instance both collapsed to
 * `{ policy: null, entity_id: null }` on the wire, which matters more on this
 * surface than the other four this PR already fixed: this PR's own new
 * instructions sentence tells agents to call `describe_instance_policy`
 * before their first write, so during an outage an agent following that
 * guidance got a false "no policy" from the tool it was just told to trust.
 *
 * `policy: null` is kept for the not-configured case (existing callers, and
 * the entity_id-surface-parity test's exact {policy, entity_id} key set on
 * the success path, must not break); `lookup_failed: true` (and an `error`
 * message) is ADDED for the failed case, mirroring `GET /instance-policy`
 * exactly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let failInstancePolicyLookup = false;

vi.mock("../../src/db.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/db.js")>("../../src/db.js");
  const realFrom = actual.db.from.bind(actual.db);

  const wrappedFrom = (table: string) => {
    const real = realFrom(table);
    if (!failInstancePolicyLookup) return real;
    if (table !== "entity_snapshots" && table !== "entities") return real;

    const realSelect = (real as { select: (...a: unknown[]) => unknown }).select.bind(real);
    return {
      ...real,
      select: (...selectArgs: unknown[]) => {
        const chain = realSelect(...selectArgs) as Record<string, unknown>;
        const realEq = (chain.eq as (...a: unknown[]) => unknown).bind(chain);
        return {
          ...chain,
          eq: (col: string, val: unknown) => {
            if (col === "entity_type" && val === "instance_policy") {
              return {
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({
                    data: null,
                    error: { message: "mocked instance_policy lookup failure" },
                  }).then(resolve),
              };
            }
            return realEq(col, val);
          },
        };
      },
    };
  };

  return { db: { ...actual.db, from: wrappedFrom } };
});

const { NeotomaServer } = await import("../../src/server.js");
const { LOCAL_DEV_USER_ID } = await import("../../src/services/local_auth.js");

function callDescribeInstancePolicy(server: InstanceType<typeof NeotomaServer>) {
  return (
    server as unknown as {
      describeInstancePolicy: () => Promise<{ content: Array<{ text: string }> }>;
    }
  ).describeInstancePolicy();
}

describe("describe_instance_policy MCP tool — lookup_failed signal", () => {
  beforeEach(() => {
    failInstancePolicyLookup = false;
  });

  afterEach(() => {
    failInstancePolicyLookup = false;
  });

  it("returns policy: null with no lookup_failed key when no policy is configured", async () => {
    const server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = LOCAL_DEV_USER_ID;

    const result = await callDescribeInstancePolicy(server);
    const body = JSON.parse(result.content[0]!.text) as {
      policy: unknown;
      entity_id: unknown;
      lookup_failed?: boolean;
    };

    expect(body.policy).toBeNull();
    expect(body.lookup_failed).toBeFalsy();
    // Pin the exact key set on the success path, same as
    // instance_policy_entity_id_surface_parity.test.ts.
    expect(Object.keys(body).sort()).toEqual(["entity_id", "policy"]);
  });

  it("returns lookup_failed: true and keeps policy: null when the read fails", async () => {
    failInstancePolicyLookup = true;
    const server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = LOCAL_DEV_USER_ID;

    const result = await callDescribeInstancePolicy(server);
    const body = JSON.parse(result.content[0]!.text) as {
      policy: unknown;
      entity_id: unknown;
      lookup_failed?: boolean;
      error?: string;
    };

    // policy stays null on a failed read too — a caller reading only
    // `policy` and not `lookup_failed` must not observe a behavior change.
    expect(body.policy).toBeNull();
    expect(body.lookup_failed).toBe(true);
    expect(typeof body.error).toBe("string");
    expect(body.error!.length).toBeGreaterThan(0);
  });
});
