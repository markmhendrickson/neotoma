/**
 * Unit coverage for the bearer handover slot (src/services/bearer_slots.ts):
 * slot matching, the fail-closed parse, constant-time comparison, the audit
 * event, and the OAuth key-auth preflight's refusal of the retiring bearer.
 * The HTTP gates are covered end to end by
 * tests/integration/bearer_handover_slot.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const timingSafeEqualSpy = vi.hoisted(() => ({ calls: 0 }));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      timingSafeEqualSpy.calls += 1;
      return actual.timingSafeEqual(a, b);
    },
  };
});

import {
  BEARER_PREVIOUS_ENV,
  BEARER_PREVIOUS_EXPIRES_AT_ENV,
  BEARER_PRIMARY_ENV,
  MAX_HANDOVER_WINDOW_MS,
  PREVIOUS_SLOT_AUDIT_INTERVAL_MS,
  __resetBearerSlotsForTests,
  announceBearerHandoverStatus,
  matchConfiguredBearer,
  parseBearerHandover,
  recordPreviousBearerUse,
} from "../../src/services/bearer_slots.js";

const PRIMARY = "unit-primary-bearer-value-5be1f0a7";
const PREVIOUS = "unit-previous-bearer-value-e83c2d19";
const UNKNOWN = "unit-unknown-bearer-value-0a9f64c2";
const NOW = Date.parse("2026-10-28T12:00:00Z");

function env(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    [BEARER_PRIMARY_ENV]: PRIMARY,
    [BEARER_PREVIOUS_ENV]: PREVIOUS,
    [BEARER_PREVIOUS_EXPIRES_AT_ENV]: "2026-10-29T12:00:00Z",
    ...extra,
  };
}

let logged: string[] = [];

beforeEach(() => {
  __resetBearerSlotsForTests();
  timingSafeEqualSpy.calls = 0;
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function assertNoValues(text: string): void {
  for (const value of [PRIMARY, PREVIOUS, UNKNOWN]) {
    expect(text).not.toContain(value);
    expect(text).not.toContain(value.slice(-8));
  }
}

describe("matchConfiguredBearer", () => {
  it("matches the primary, the previous inside the window, and nothing else", () => {
    const e = env();
    expect(matchConfiguredBearer(PRIMARY, e, NOW)).toBe("primary");
    expect(matchConfiguredBearer(PREVIOUS, e, NOW)).toBe("previous");
    expect(matchConfiguredBearer(UNKNOWN, e, NOW)).toBeNull();
    expect(matchConfiguredBearer("", e, NOW)).toBeNull();
  });

  it("rejects the previous bearer at and after the expiry instant, without a restart", () => {
    const e = env();
    const expiry = Date.parse("2026-10-29T12:00:00Z");
    expect(matchConfiguredBearer(PREVIOUS, e, expiry - 1)).toBe("previous");
    expect(matchConfiguredBearer(PREVIOUS, e, expiry)).toBeNull();
    expect(matchConfiguredBearer(PREVIOUS, e, expiry + 1)).toBeNull();
    expect(matchConfiguredBearer(PRIMARY, e, expiry + 1)).toBe("primary");
  });

  it("logs once, value-free, when a window closes while the process runs", () => {
    const e = env();
    const expiry = Date.parse("2026-10-29T12:00:00Z");
    expect(matchConfiguredBearer(PREVIOUS, e, expiry - 1)).toBe("previous");
    logged = [];
    matchConfiguredBearer(PREVIOUS, e, expiry + 1);
    matchConfiguredBearer(PREVIOUS, e, expiry + 2);
    matchConfiguredBearer(UNKNOWN, e, expiry + 3);
    const lines = logged.filter((l) => l.includes("auth_bearer_handover_expired"));
    expect(lines).toHaveLength(1);
    assertNoValues(logged.join("\n"));
  });

  it("rejects the previous bearer after an explicit retire", () => {
    const e = env({
      [BEARER_PREVIOUS_ENV]: undefined,
      [BEARER_PREVIOUS_EXPIRES_AT_ENV]: undefined,
    });
    expect(matchConfiguredBearer(PREVIOUS, e, NOW)).toBeNull();
    expect(matchConfiguredBearer(PRIMARY, e, NOW)).toBe("primary");
  });

  it("matches nothing when no primary is configured", () => {
    const e = env({ [BEARER_PRIMARY_ENV]: undefined });
    expect(matchConfiguredBearer(PREVIOUS, e, NOW)).toBeNull();
    expect(matchConfiguredBearer(PRIMARY, e, NOW)).toBeNull();
  });

  it("compares in constant time and always compares both slots", () => {
    const e = env();
    matchConfiguredBearer(UNKNOWN, e, NOW); // warm the parse (its own equality check)
    for (const presented of [PRIMARY, PREVIOUS, UNKNOWN, "short"]) {
      timingSafeEqualSpy.calls = 0;
      matchConfiguredBearer(presented, e, NOW);
      // One timingSafeEqual per configured slot, whichever slot matches:
      // a primary match does not short-circuit the previous comparison.
      expect(timingSafeEqualSpy.calls).toBe(2);
    }
  });
});

describe("parseBearerHandover (fail closed)", () => {
  const cases: Array<[string, Record<string, string | undefined>, string]> = [
    ["no expiry", { [BEARER_PREVIOUS_EXPIRES_AT_ENV]: undefined }, "expiry_missing"],
    [
      "offset-less expiry",
      { [BEARER_PREVIOUS_EXPIRES_AT_ENV]: "2026-10-29T12:00:00" },
      "expiry_malformed",
    ],
    ["date-only expiry", { [BEARER_PREVIOUS_EXPIRES_AT_ENV]: "2026-10-29" }, "expiry_malformed"],
    ["garbage expiry", { [BEARER_PREVIOUS_EXPIRES_AT_ENV]: "soon" }, "expiry_malformed"],
    [
      "impossible date",
      { [BEARER_PREVIOUS_EXPIRES_AT_ENV]: "2026-13-45T99:00:00Z" },
      "expiry_malformed",
    ],
    [
      "expiry past the maximum window",
      {
        [BEARER_PREVIOUS_EXPIRES_AT_ENV]: new Date(
          NOW + MAX_HANDOVER_WINDOW_MS + 60_000
        ).toISOString(),
      },
      "expiry_beyond_max_window",
    ],
    ["whitespace in value", { [BEARER_PREVIOUS_ENV]: `${PREVIOUS} ` }, "value_malformed"],
    ["newline in value", { [BEARER_PREVIOUS_ENV]: `${PREVIOUS}\n` }, "value_malformed"],
    [
      "control character in value",
      { [BEARER_PREVIOUS_ENV]: `${PREVIOUS}\u0007` },
      "value_malformed",
    ],
    ["value equal to the primary", { [BEARER_PREVIOUS_ENV]: PRIMARY }, "value_equals_primary"],
    ["previous without a primary", { [BEARER_PRIMARY_ENV]: undefined }, "primary_unset"],
    ["expiry without a value", { [BEARER_PREVIOUS_ENV]: "" }, "value_missing"],
  ];

  it.each(cases)("disables the slot on %s", (_label, overrides, reason) => {
    const e = env(overrides);
    const parsed = parseBearerHandover(e, NOW);
    expect(parsed.status).toEqual({ status: "disabled", reason });
    expect(parsed.previousValue).toBeNull();
    // Primary keeps working; the would-be previous value does not.
    if (e[BEARER_PRIMARY_ENV]) {
      expect(matchConfiguredBearer(PRIMARY, e, NOW)).toBe("primary");
    }
    expect(matchConfiguredBearer(PREVIOUS, e, NOW)).toBeNull();
  });

  it("accepts an expiry exactly at the maximum window and a numeric offset", () => {
    const atMax = new Date(NOW + MAX_HANDOVER_WINDOW_MS).toISOString();
    expect(
      parseBearerHandover(env({ [BEARER_PREVIOUS_EXPIRES_AT_ENV]: atMax }), NOW).status.status
    ).toBe("active");
    expect(
      parseBearerHandover(
        env({ [BEARER_PREVIOUS_EXPIRES_AT_ENV]: "2026-10-29T14:00:00+02:00" }),
        NOW
      ).status.status
    ).toBe("active");
  });

  it("reports absent when no slot is configured", () => {
    const e = env({
      [BEARER_PREVIOUS_ENV]: undefined,
      [BEARER_PREVIOUS_EXPIRES_AT_ENV]: undefined,
    });
    expect(parseBearerHandover(e, NOW).status).toEqual({ status: "absent" });
  });
});

describe("status and audit logging", () => {
  it("logs a disabled slot at ERROR with the reason and no value", () => {
    const status = announceBearerHandoverStatus(
      env({ [BEARER_PREVIOUS_EXPIRES_AT_ENV]: undefined }),
      NOW
    );
    expect(status).toEqual({ status: "disabled", reason: "expiry_missing" });
    const text = logged.join("\n");
    expect(text).toContain("auth_bearer_handover_disabled");
    expect(text).toContain("expiry_missing");
    assertNoValues(text);
    expect(console.error).toHaveBeenCalled();
  });

  it("logs an open window and an expired window, once per configuration", () => {
    const e = env();
    expect(announceBearerHandoverStatus(e, NOW).status).toBe("active");
    announceBearerHandoverStatus(e, NOW);
    matchConfiguredBearer(PRIMARY, e, NOW);
    expect(logged.filter((l) => l.includes("auth_bearer_handover_active"))).toHaveLength(1);

    __resetBearerSlotsForTests();
    logged = [];
    const expired = env({ [BEARER_PREVIOUS_EXPIRES_AT_ENV]: "2026-10-27T12:00:00Z" });
    expect(announceBearerHandoverStatus(expired, NOW).status).toBe("expired");
    expect(logged.join("\n")).toContain("auth_bearer_handover_expired");
    assertNoValues(logged.join("\n"));
  });

  it("emits a value-free audit event per client, throttled with a use count", () => {
    const e = env();
    matchConfiguredBearer(PREVIOUS, e, NOW);
    logged = [];
    const use = {
      surface: "rest" as const,
      method: "GET",
      path: "/session",
      userAgent: "daemon-a/1.0",
      clientName: "apis",
    };
    recordPreviousBearerUse(use, NOW);
    recordPreviousBearerUse(use, NOW + 1_000);
    recordPreviousBearerUse(use, NOW + 2_000);
    recordPreviousBearerUse({ ...use, userAgent: "daemon-b/2.0" }, NOW + 3_000);
    recordPreviousBearerUse(use, NOW + PREVIOUS_SLOT_AUDIT_INTERVAL_MS + 1);

    const events = logged
      .filter((l) => l.includes("auth_bearer_previous_slot_used"))
      .map((l) => JSON.parse(l.slice(l.indexOf("{"))));
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      surface: "rest",
      path: "/session",
      user_agent: "daemon-a/1.0",
      client_name: "apis",
      expires_at: "2026-10-29T12:00:00.000Z",
      uses_since_last_event: 1,
    });
    expect(events[1]).toMatchObject({ user_agent: "daemon-b/2.0", uses_since_last_event: 1 });
    expect(events[2]).toMatchObject({ user_agent: "daemon-a/1.0", uses_since_last_event: 3 });
    assertNoValues(logged.join("\n"));
    expect(console.warn).toHaveBeenCalled();
  });

  it("strips control characters, caps length, and takes the first of repeated headers", () => {
    matchConfiguredBearer(PREVIOUS, env(), NOW);
    logged = [];
    recordPreviousBearerUse(
      {
        surface: "mcp",
        method: "POST",
        path: "/mcp",
        userAgent: [`agent\u0000\n\u001b${"x".repeat(300)}`, "second"],
        clientName: "\u0007\u007f",
      },
      NOW
    );
    const line = logged.find((l) => l.includes("auth_bearer_previous_slot_used"))!;
    const event = JSON.parse(line.slice(line.indexOf("{")));
    expect(event.user_agent).toBe(`agent${"x".repeat(115)}`);
    expect(event.client_name).toBeNull();
    expect(event.surface).toBe("mcp");
  });
});

describe("OAuth key-auth preflight", () => {
  it("does not accept the retiring bearer (it would mint a credential outliving the window)", async () => {
    const keys = [BEARER_PRIMARY_ENV, BEARER_PREVIOUS_ENV, BEARER_PREVIOUS_EXPIRES_AT_ENV] as const;
    const saved = keys.map((k) => process.env[k]);
    try {
      process.env[BEARER_PRIMARY_ENV] = PRIMARY;
      process.env[BEARER_PREVIOUS_ENV] = PREVIOUS;
      process.env[BEARER_PREVIOUS_EXPIRES_AT_ENV] = new Date(Date.now() + 3_600_000).toISOString();
      const { isOauthKeyCredentialValid } = await import("../../src/services/oauth_key_gate.js");
      expect(isOauthKeyCredentialValid({ bearerToken: PRIMARY }).ok).toBe(true);
      const previous = isOauthKeyCredentialValid({ bearerToken: PREVIOUS });
      expect(previous.ok).toBe(false);
      assertNoValues(previous.reason ?? "");
    } finally {
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i];
      });
    }
  });
});
