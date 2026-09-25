/**
 * A failed instance-policy read must reach an agent as "policy UNKNOWN", never
 * as "no policy configured".
 *
 * Both instructions-rendering call sites (`server.ts`
 * `buildAuthenticatedInitializeResponse`, `actions.ts`
 * `GET /mcp-interaction-instructions`) previously called the lossy
 * `getInstancePolicy()`, whose own docstring says it "collapses 'no policy'
 * and 'unreadable policy' back into one value" — see
 * `src/services/instance_policy.ts`. A failed lookup rendered an EMPTY policy
 * section, indistinguishable from an instance that genuinely has none
 * configured, so a connected agent read an outage as "unrestricted".
 *
 * This mirrors the fix already shipped for standing rules (#2131) and instance
 * skills (#2046/#2429) on this exact surface — see
 * `tests/integration/instance_skills_initialize_effect.test.ts`'s
 * "unknown identity ... reports unavailable, not empty" suite, which this test
 * intentionally parallels for the instance-policy signal specifically.
 *
 * `db.js` is mocked here (unlike the skills effect test) because forcing a
 * genuine driver failure for `entity_type = instance_policy` without also
 * breaking every other query on the shared `db` handle is not practical
 * against the real local backend; the unit-level query branching for
 * `getInstancePolicyResult` itself is already covered directly in
 * `tests/unit/instance_policy.test.ts` and (via the same shape)
 * `tests/unit/standing_rules.test.ts`. What this test adds is the EFFECT on
 * the two instructions surfaces once that lookup fails.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock db.js so `entity_snapshots` / `entities` queries scoped to
// entity_type = "instance_policy" fail, forcing getInstancePolicyResult() to
// report lookup_failed: true. Every other query used by session bootstrap
// (schema seeding, standing rules, skills) must keep working, or the test
// would be exercising a broken server rather than a broken policy read.
// ---------------------------------------------------------------------------

let failInstancePolicyLookup = false;

vi.mock("../../src/db.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/db.js")>("../../src/db.js");

  const realFrom = actual.db.from.bind(actual.db);

  const wrappedFrom = (table: string) => {
    const real = realFrom(table);
    if (!failInstancePolicyLookup) return real;
    if (table !== "entity_snapshots" && table !== "entities") return real;

    // Wrap select() so a call scoped to entity_type=instance_policy fails,
    // while every other query (standing_rules, skill, schema bootstrap) on
    // the same tables passes through untouched.
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

vi.mock("../../src/utils/logger.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils/logger.js")>(
    "../../src/utils/logger.js"
  );
  return actual;
});

const { NeotomaServer } = await import("../../src/server.js");
const { app } = await import("../../src/actions.js");
const { LOCAL_DEV_USER_ID } = await import("../../src/services/local_auth.js");
const { createServer } = await import("node:http");

describe("MCP initialize instructions — instance policy lookup failure (unknown, not absent)", () => {
  let server: InstanceType<typeof NeotomaServer>;

  beforeEach(() => {
    failInstancePolicyLookup = false;
    process.env.NEOTOMA_CONNECTION_ID = "test-connection-bypass";
    server = new NeotomaServer();
  });

  afterEach(() => {
    failInstancePolicyLookup = false;
    delete process.env.NEOTOMA_CONNECTION_ID;
  });

  async function buildInstructions(): Promise<string> {
    const inner = server as unknown as {
      authenticatedUserId: string | null;
      buildAuthenticatedInitializeResponse: (
        n: string | null
      ) => Promise<{ instructions?: string }>;
    };
    inner.authenticatedUserId = LOCAL_DEV_USER_ID;
    const result = await inner.buildAuthenticatedInitializeResponse(null);
    return result.instructions ?? "";
  }

  it("renders an empty policy section when no policy is configured and the read succeeds", async () => {
    failInstancePolicyLookup = false;
    const instructions = await buildInstructions();
    // NOT a bare substring check: the base MCP instructions doc's own
    // [INSTANCE DATA POLICY] prose explains this feature and mentions the
    // literal string "## Instance Data Policy" inline, in backticks, as
    // documentation — that text is always present regardless of whether a
    // policy is configured. The signal this test actually needs is whether
    // composeClientInstructions APPENDED a rendered section (which always
    // starts with a blank line then the heading on its own line); the doc's
    // inline mention never has that shape.
    expect(instructions).not.toMatch(/\n\n## Instance Data Policy\n/);
  });

  it("renders the policy-unknown section, not silence, when the lookup fails", async () => {
    failInstancePolicyLookup = true;
    const instructions = await buildInstructions();

    // Anchored the same way the previous test anchors the negative case: the
    // base MCP instructions doc's own [INSTANCE DATA POLICY] prose contains the
    // literal strings "## Instance Data Policy", "UNKNOWN", and (for the
    // sibling standing-rules feature) "treat ... as UNKNOWN rather than
    // absent" as documentation, regardless of whether this code path ever
    // renders anything — a bare .includes()/toMatch() against the whole
    // instructions blob passes on unpatched `getInstancePolicy()` too, which
    // is exactly the false-negative this test exists to catch. The signal
    // that composeClientInstructions actually APPENDED a rendered section is
    // the "\n\n## Instance Data Policy\n" shape (blank line, heading on its
    // own line) — the doc's inline backticked mention never has that shape.
    const appended = instructions.match(/\n\n## Instance Data Policy\n([\s\S]*?)(?:\n\n|$)/);
    expect(
      appended,
      `instructions carried no appended Instance Data Policy section on a failed lookup. tail: ${instructions.slice(-800)}`
    ).not.toBeNull();
    const section = appended![1];
    expect(section).toMatch(/could not be read/i);
    expect(section).toMatch(/UNKNOWN/);
    expect(section).not.toMatch(/no (instance )?policy configured/i);
  });
});

describe("GET /mcp-interaction-instructions — instance policy lookup failure", () => {
  it("composes the policy-unknown section into the served instructions on a failed lookup", async () => {
    failInstancePolicyLookup = true;
    const httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    try {
      const addr = httpServer.address();
      if (!addr || typeof addr === "string") throw new Error("expected TCP listen address");
      const res = await fetch(`http://127.0.0.1:${addr.port}/mcp-interaction-instructions`);
      expect(res.status).toBe(200);
      const text = await res.text();
      // Same anchoring fix as above — see comment there.
      const appended = text.match(/\n\n## Instance Data Policy\n([\s\S]*?)(?:\n\n|$)/);
      expect(
        appended,
        `served instructions carried no appended Instance Data Policy section on a failed lookup. tail: ${text.slice(-800)}`
      ).not.toBeNull();
      const section = appended![1];
      expect(section).toMatch(/could not be read/i);
      expect(section).toMatch(/UNKNOWN/);
    } finally {
      failInstancePolicyLookup = false;
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
