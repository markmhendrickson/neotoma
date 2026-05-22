import { describe, expect, it, vi } from "vitest";
import {
  findUnknownFields,
  unknownFieldsGuard,
  _resetUnknownFieldsGuardCache,
} from "../../src/middleware/unknown_fields_guard.js";

function buildRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockImplementation(() => res);
  res.json = vi.fn().mockImplementation(() => res);
  return res as unknown as {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("findUnknownFields", () => {
  it("returns empty when every key is allowed", () => {
    const allowed = new Set(["user_id", "idempotency_key"]);
    expect(
      findUnknownFields({ user_id: "u", idempotency_key: "k" }, allowed),
    ).toEqual([]);
  });

  it("returns unknown top-level keys while ignoring allowed ones", () => {
    const allowed = new Set(["user_id"]);
    expect(
      findUnknownFields({ user_id: "u", attributes: {}, typo: 1 }, allowed),
    ).toEqual(["attributes", "typo"]);
  });

  it("returns [] for non-object bodies", () => {
    expect(findUnknownFields(null, new Set())).toEqual([]);
    expect(findUnknownFields([1, 2], new Set())).toEqual([]);
    expect(findUnknownFields("foo", new Set())).toEqual([]);
  });
});

describe("unknownFieldsGuard", () => {
  it("passes through requests that match a closed operation exactly", () => {
    _resetUnknownFieldsGuardCache();
    const req = {
      method: "POST",
      path: "/store",
      body: {
        user_id: "00000000-0000-0000-0000-000000000000",
        idempotency_key: "k",
        entities: [],
      },
    } as any;
    const res = buildRes();
    const next = vi.fn();
    unknownFieldsGuard(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows top-level external_actor on POST /store (issue submission provenance)", () => {
    _resetUnknownFieldsGuardCache();
    const req = {
      method: "POST",
      path: "/store",
      body: {
        idempotency_key: "k",
        entities: [],
        external_actor: {
          provider: "github",
          login: "octocat",
          id: 1,
          type: "User",
          verified_via: "claim",
          repository: "owner/repo",
          event_id: 99,
        },
      },
    } as any;
    const res = buildRes();
    const next = vi.fn();
    unknownFieldsGuard(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes through when the route is not a closed OpenAPI shape", () => {
    _resetUnknownFieldsGuardCache();
    const req = {
      method: "POST",
      path: "/_no_such_route_zzz",
      body: { anything: true, goes: "here" },
    } as any;
    const res = buildRes();
    const next = vi.fn();
    unknownFieldsGuard(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a closed-shape request with an unknown top-level field using ERR_UNKNOWN_FIELD", () => {
    _resetUnknownFieldsGuardCache();
    const req = {
      method: "POST",
      path: "/store",
      body: {
        user_id: "00000000-0000-0000-0000-000000000000",
        idempotency_key: "k",
        entities: [],
        mystery_field: 42,
      },
    } as any;
    const res = buildRes();
    const next = vi.fn();
    unknownFieldsGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json.mock.calls[0] as any[])[0];
    expect(body.error_code).toBe("ERR_UNKNOWN_FIELD");
    expect(body.details.unknown_fields).toEqual(["mystery_field"]);
    expect(body.details.json_paths).toEqual(["$.mystery_field"]);
    expect(body.details.operation).toBe("POST /store");
    expect(body.details.allowed_fields).toEqual(
      [...body.details.allowed_fields].sort(),
    );
  });

  it("skips the guard when the body is not a JSON object", () => {
    _resetUnknownFieldsGuardCache();
    const req = {
      method: "POST",
      path: "/store",
      body: undefined,
    } as any;
    const res = buildRes();
    const next = vi.fn();
    unknownFieldsGuard(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
