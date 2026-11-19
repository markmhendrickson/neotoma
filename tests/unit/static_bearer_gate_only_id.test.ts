import { afterEach, describe, expect, it } from "vitest";
import {
  STATIC_BEARER_SHARED_GRAPH_CONNECTION_ID,
  dropGateOnlyConnectionId,
  isGateOnlyConnectionId,
  resolveGateAssignedConnectionUserId,
} from "../../src/services/static_bearer_identity.js";

const SHARED_OWNER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const original = process.env.NEOTOMA_SHARED_GRAPH_USER_ID;

afterEach(() => {
  if (original === undefined) delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;
  else process.env.NEOTOMA_SHARED_GRAPH_USER_ID = original;
});

describe("gate-only connection ids", () => {
  it("recognises the static-bearer shared-graph marker and nothing else", () => {
    expect(isGateOnlyConnectionId(STATIC_BEARER_SHARED_GRAPH_CONNECTION_ID)).toBe(true);
    expect(isGateOnlyConnectionId("dev-local")).toBe(false);
    expect(isGateOnlyConnectionId("conn_abc123")).toBe(false);
    expect(isGateOnlyConnectionId(undefined)).toBe(false);
    expect(isGateOnlyConnectionId(null)).toBe(false);
  });

  it("drops a gate-only id on non-HTTP paths and keeps every other id", () => {
    expect(dropGateOnlyConnectionId(STATIC_BEARER_SHARED_GRAPH_CONNECTION_ID)).toBeUndefined();
    expect(dropGateOnlyConnectionId("conn_abc123")).toBe("conn_abc123");
    expect(dropGateOnlyConnectionId("dev-local")).toBe("dev-local");
    expect(dropGateOnlyConnectionId("")).toBeUndefined();
    expect(dropGateOnlyConnectionId(undefined)).toBeUndefined();
  });
});

describe("static-bearer shared-graph resolution", () => {
  it("resolves to the shared owner when shared-graph mode is configured", async () => {
    process.env.NEOTOMA_SHARED_GRAPH_USER_ID = SHARED_OWNER;
    await expect(
      resolveGateAssignedConnectionUserId(STATIC_BEARER_SHARED_GRAPH_CONNECTION_ID)
    ).resolves.toBe(SHARED_OWNER);
  });

  it("fails closed when shared-graph mode is no longer configured", async () => {
    delete process.env.NEOTOMA_SHARED_GRAPH_USER_ID;
    await expect(
      resolveGateAssignedConnectionUserId(STATIC_BEARER_SHARED_GRAPH_CONNECTION_ID)
    ).rejects.toThrow(/without a usable shared-graph user/);
  });

  it("returns null for an id this module does not resolve", async () => {
    process.env.NEOTOMA_SHARED_GRAPH_USER_ID = SHARED_OWNER;
    await expect(resolveGateAssignedConnectionUserId("conn_abc123")).resolves.toBeNull();
  });
});
