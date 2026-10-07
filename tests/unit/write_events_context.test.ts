/**
 * Unit tests for write-event turn identity and write context (write events; turn keys #2440).
 *
 * Pins: which carriers are read, that only identifier-shaped values survive
 * (no prose, no oversized values), `_meta` precedence over headers, the
 * operation vocabulary, actor capture from the request context, and that the
 * deliverable form of an event never carries the write context.
 */

import { describe, expect, it, vi } from "vitest";

import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import type { SubstrateEvent } from "../../src/events/types.js";
import { runWithExternalActor, runWithRequestContext } from "../../src/services/request_context.js";
import {
  MCP_META_CONVERSATION_ID,
  MCP_META_TURN_KEY,
  TURN_HEADER_CONVERSATION_ID,
  TURN_HEADER_TURN_KEY,
  TURN_IDENTIFIER_MAX_LENGTH,
  checkTurnIdentifier,
  resolveToolCallTurnIdentity,
  sanitizeTurnIdentifier,
  turnIdentityFromHeaders,
  turnIdentityFromMcpMeta,
} from "../../src/services/write_events/turn_identity.js";
import {
  buildWriteContext,
  toDeliverableSubstrateEvent,
  writeOperationForEventType,
} from "../../src/services/write_events/write_context.js";
import { getCurrentTurnIdentity } from "../../src/services/request_context.js";
import { logger } from "../../src/utils/logger.js";

describe("sanitizeTurnIdentifier", () => {
  it("keeps session:turn keys, UUIDs and the ungrouped sentinel", () => {
    expect(sanitizeTurnIdentifier("6f1c2d3e-aaaa-bbbb-cccc-0123456789ab:t3")).toBe(
      "6f1c2d3e-aaaa-bbbb-cccc-0123456789ab:t3"
    );
    expect(sanitizeTurnIdentifier("  conv_123  ")).toBe("conv_123");
    expect(sanitizeTurnIdentifier("session:ungrouped")).toBe("session:ungrouped");
  });

  it("drops prose, empty, oversized and non-string values", () => {
    expect(sanitizeTurnIdentifier("please store my note about the meeting")).toBeUndefined();
    expect(sanitizeTurnIdentifier("")).toBeUndefined();
    expect(sanitizeTurnIdentifier("   ")).toBeUndefined();
    expect(sanitizeTurnIdentifier("a".repeat(TURN_IDENTIFIER_MAX_LENGTH + 1))).toBeUndefined();
    expect(sanitizeTurnIdentifier("a".repeat(TURN_IDENTIFIER_MAX_LENGTH))).toBe(
      "a".repeat(TURN_IDENTIFIER_MAX_LENGTH)
    );
    expect(sanitizeTurnIdentifier(42)).toBeUndefined();
    expect(sanitizeTurnIdentifier({ turn: 1 })).toBeUndefined();
    expect(sanitizeTurnIdentifier("line1\nline2")).toBeUndefined();
  });
});

describe("turn identity carriers", () => {
  it("reads both headers", () => {
    expect(
      turnIdentityFromHeaders({
        [TURN_HEADER_CONVERSATION_ID]: "conv-1",
        [TURN_HEADER_TURN_KEY]: "sess-1:t1",
      })
    ).toEqual({ conversation_id: "conv-1", turn_key: "sess-1:t1", source: "header" });
  });

  it("drops a repeated header instead of picking one of its values", () => {
    // Node joins a repeated request header into "a, b"; an array is the other shape.
    expect(
      turnIdentityFromHeaders({
        [TURN_HEADER_CONVERSATION_ID]: "conv-1",
        [TURN_HEADER_TURN_KEY]: "sess-1:t1, sess-1:t2",
      })
    ).toEqual({ conversation_id: "conv-1", source: "header" });
    expect(
      turnIdentityFromHeaders({ [TURN_HEADER_TURN_KEY]: ["sess-1:t1", "sess-1:t2"] })
    ).toBeNull();
  });

  it("returns null when no header carries a usable identifier", () => {
    expect(turnIdentityFromHeaders({})).toBeNull();
    expect(turnIdentityFromHeaders(undefined)).toBeNull();
    expect(turnIdentityFromHeaders({ [TURN_HEADER_TURN_KEY]: "not an id" })).toBeNull();
  });

  it("reads io.neotoma/* keys from MCP _meta and ignores everything else", () => {
    expect(
      turnIdentityFromMcpMeta({
        [MCP_META_TURN_KEY]: "sess-2:t9",
        "io.modelcontextprotocol/clientInfo": { name: "x" },
      })
    ).toEqual({ turn_key: "sess-2:t9", source: "mcp_meta" });
    expect(turnIdentityFromMcpMeta(null)).toBeNull();
    expect(turnIdentityFromMcpMeta(["x"])).toBeNull();
    expect(turnIdentityFromMcpMeta({ turn_key: "sess:t1" })).toBeNull();
  });

  it("prefers the tool call's _meta over the inherited header identity", () => {
    const inherited = { turn_key: "hdr:t1", source: "header" as const };
    expect(
      resolveToolCallTurnIdentity(
        { [MCP_META_TURN_KEY]: "meta:t2", [MCP_META_CONVERSATION_ID]: "c" },
        inherited
      )
    ).toEqual({ turn_key: "meta:t2", conversation_id: "c", source: "mcp_meta" });
    expect(resolveToolCallTurnIdentity(undefined, inherited)).toBe(inherited);
    expect(resolveToolCallTurnIdentity(undefined, null)).toBeNull();
  });

  it("a _meta carrying only a conversation id replaces the header identity as a whole", () => {
    const inherited = {
      conversation_id: "hdr-conv",
      turn_key: "hdr:t1",
      source: "header" as const,
    };
    // No field-by-field merge: the header's turn key does not survive.
    expect(
      resolveToolCallTurnIdentity({ [MCP_META_CONVERSATION_ID]: "meta-conv" }, inherited)
    ).toEqual({ conversation_id: "meta-conv", source: "mcp_meta" });
  });

  it("a _meta whose identifiers are all unusable falls back to the header identity", () => {
    const inherited = { turn_key: "hdr:t1", source: "header" as const };
    expect(resolveToolCallTurnIdentity({ [MCP_META_TURN_KEY]: "not an id" }, inherited)).toBe(
      inherited
    );
  });

  it("survives runWithExternalActor's context clone", async () => {
    const turn = { turn_key: "keep:t1", source: "header" as const };
    const seen = await runWithRequestContext({ agentIdentity: null, turn }, () =>
      runWithExternalActor(null, () => getCurrentTurnIdentity())
    );
    expect(seen).toEqual(turn);
  });
});

describe("checkTurnIdentifier drop reasons", () => {
  it("names why an identifier was not used", () => {
    expect(checkTurnIdentifier(7)).toEqual({ ok: false, reason: "not_a_string" });
    expect(checkTurnIdentifier("  ")).toEqual({ ok: false, reason: "empty" });
    expect(checkTurnIdentifier("a".repeat(TURN_IDENTIFIER_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(checkTurnIdentifier("two words")).toEqual({ ok: false, reason: "invalid_characters" });
    expect(checkTurnIdentifier("caf\u00e9:t1")).toEqual({
      ok: false,
      reason: "invalid_characters",
    });
    expect(checkTurnIdentifier("a:t1, a:t2")).toEqual({ ok: false, reason: "repeated_header" });
    expect(checkTurnIdentifier(["a", "b"])).toEqual({ ok: false, reason: "repeated_header" });
    expect(checkTurnIdentifier(" s:t1 ")).toEqual({ ok: true, value: "s:t1" });
  });

  it("logs a dropped identifier at debug with its reason and length, never its value", () => {
    const spy = vi.spyOn(logger, "debug").mockImplementation(() => {});
    try {
      turnIdentityFromHeaders({ [TURN_HEADER_TURN_KEY]: "secret prose here" });
      expect(spy).toHaveBeenCalledTimes(1);
      const [message, details] = spy.mock.calls[0] as [string, Record<string, unknown>];
      expect(message).toContain("ignored client turn identifier");
      expect(details).toEqual({
        source: "header",
        field: "turn_key",
        reason: "invalid_characters",
        length: "secret prose here".length,
      });
      expect(JSON.stringify(spy.mock.calls)).not.toContain("secret prose");
      // Absent headers are not drops and log nothing.
      spy.mockClear();
      turnIdentityFromHeaders({});
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("buildWriteContext", () => {
  it("maps every event type to an operation", () => {
    expect(writeOperationForEventType("entity.created")).toBe("created");
    expect(writeOperationForEventType("entity.updated")).toBe("updated");
    expect(writeOperationForEventType("observation.created")).toBe("stored");
    expect(writeOperationForEventType("entity.deleted")).toBe("deleted");
    expect(writeOperationForEventType("entity.restored")).toBe("restored");
    expect(writeOperationForEventType("entity.merged")).toBe("merged");
    expect(writeOperationForEventType("entity.split")).toBe("split");
    expect(writeOperationForEventType("relationship.created")).toBe("relationship_created");
    expect(writeOperationForEventType("relationship.deleted")).toBe("relationship_deleted");
    expect(writeOperationForEventType("relationship.restored")).toBe("relationship_restored");
  });

  it("captures actor ids and turn identity from the active request", async () => {
    const ctx = await runWithRequestContext(
      {
        agentIdentity: createAgentIdentity({ clientName: "unit-harness", clientVersion: "2.0.0" }),
        authenticatedPrincipal: { actorId: "mbr_unit" } as never,
        turn: { conversation_id: "conv-u", turn_key: "sess-u:t4", source: "mcp_meta" },
      },
      () => buildWriteContext("entity.updated", "corrected")
    );
    expect(ctx.operation).toBe("corrected");
    expect(ctx.actor.client_name).toBe("unit-harness");
    expect(ctx.actor.client_version).toBe("2.0.0");
    expect(ctx.actor.attribution_tier).toBe("unverified_client");
    expect(ctx.actor.authenticated_actor_id).toBe("mbr_unit");
    expect(ctx).toMatchObject({
      conversation_id: "conv-u",
      turn_key: "sess-u:t4",
      turn_source: "mcp_meta",
    });
    // Identifiers only: the agent public key never reaches the write record.
    expect(JSON.stringify(ctx)).not.toContain("public_key");
  });

  it("outside a request: operation only, empty actor, no turn", () => {
    expect(buildWriteContext("entity.deleted")).toEqual({ operation: "deleted", actor: {} });
  });
});

describe("toDeliverableSubstrateEvent", () => {
  const base: SubstrateEvent = {
    event_id: "e1",
    event_type: "entity.created",
    timestamp: "2026-10-01T00:00:00.000Z",
    user_id: "u",
    entity_id: "ent_x",
    entity_type: "note",
    action: "created",
  };

  it("removes write_context and leaves every other field", () => {
    const withContext: SubstrateEvent = {
      ...base,
      write_context: { operation: "created", actor: { client_name: "c" }, turn_key: "s:t" },
    };
    const out = toDeliverableSubstrateEvent(withContext);
    expect(out).toEqual(base);
    expect("write_context" in out).toBe(false);
    // The persisted object is not mutated.
    expect(withContext.write_context).toBeDefined();
  });

  it("returns an event without context unchanged", () => {
    expect(toDeliverableSubstrateEvent(base)).toBe(base);
  });
});
