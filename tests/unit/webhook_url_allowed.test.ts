/**
 * Tests for `isWebhookUrlAllowed` (`src/services/subscriptions/webhook_delivery.ts`).
 *
 * This is an outbound-delivery scheme gate: in production, plaintext `http:`
 * is only allowed to `localhost`/`127.0.0.1`; everywhere else it must be
 * `https:`. In development, any `http:`/`https:` URL is allowed.
 *
 * Before ateles ent_1cc5662e217133323890a90f this function had no test
 * coverage at all. Its own `isProductionEnvironment()` precedence used to be
 * an unconditional OR of `NEOTOMA_ENV === "production"` / `NODE_ENV ===
 * "production"`; the shared-detector consolidation temporarily loosened this
 * for one combination (`NEOTOMA_ENV=development` + `NODE_ENV=production`),
 * which this suite's table locks in as fixed: EITHER variable saying
 * production is sufficient to restrict this gate, matching the repo's
 * fail-closed rule.
 */

import { describe, it, expect } from "vitest";
import { isWebhookUrlAllowed } from "../../src/services/subscriptions/webhook_delivery.ts";

/**
 * Runs `isWebhookUrlAllowed` under a given NEOTOMA_ENV/NODE_ENV combination
 * by mutating process.env for the duration of the callback (the function
 * reads process.env directly, with no injectable-env overload).
 */
function withEnv<T>(
  overrides: { NEOTOMA_ENV?: string; NODE_ENV?: string },
  fn: () => T
): T {
  const prevNeotomaEnv = process.env.NEOTOMA_ENV;
  const prevNodeEnv = process.env.NODE_ENV;
  if (overrides.NEOTOMA_ENV === undefined) delete process.env.NEOTOMA_ENV;
  else process.env.NEOTOMA_ENV = overrides.NEOTOMA_ENV;
  if (overrides.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = overrides.NODE_ENV;
  try {
    return fn();
  } finally {
    if (prevNeotomaEnv === undefined) delete process.env.NEOTOMA_ENV;
    else process.env.NEOTOMA_ENV = prevNeotomaEnv;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  }
}

describe("isWebhookUrlAllowed", () => {
  it("always allows https: regardless of environment", () => {
    withEnv({ NEOTOMA_ENV: "production" }, () => {
      expect(isWebhookUrlAllowed("https://example.com/hook")).toBe(true);
    });
    withEnv({}, () => {
      expect(isWebhookUrlAllowed("https://example.com/hook")).toBe(true);
    });
  });

  it("rejects an unparseable URL", () => {
    withEnv({}, () => {
      expect(isWebhookUrlAllowed("not-a-url")).toBe(false);
    });
  });

  describe("table: NEOTOMA_ENV x NODE_ENV -> http: to an arbitrary (non-localhost) host", () => {
    // The restrictive outcome (false = rejected) must hold wherever EITHER
    // variable says production, or NEOTOMA_ENV is unrecognized — the same
    // fail-closed rule as isProductionEnvironment itself. This is the exact
    // combination the security lens flagged as loosened by the shared
    // detector: NEOTOMA_ENV=development + NODE_ENV=production must reject
    // plaintext http: to an arbitrary host, not allow it.
    const CASES: {
      neotomaEnv?: string;
      nodeEnv?: string;
      expectAllowed: boolean;
      label: string;
    }[] = [
      { expectAllowed: true, label: "both unset -> development -> allowed" },
      { nodeEnv: "development", expectAllowed: true, label: "NODE_ENV=development -> allowed" },
      { nodeEnv: "production", expectAllowed: false, label: "NODE_ENV=production -> rejected" },
      {
        neotomaEnv: "development",
        expectAllowed: true,
        label: "NEOTOMA_ENV=development -> allowed",
      },
      {
        neotomaEnv: "production",
        expectAllowed: false,
        label: "NEOTOMA_ENV=production -> rejected",
      },
      {
        neotomaEnv: "development",
        nodeEnv: "production",
        expectAllowed: false,
        label:
          "NEOTOMA_ENV=development + NODE_ENV=production -> rejected (CVE-shape: was loosened, now fixed)",
      },
      {
        neotomaEnv: "production",
        nodeEnv: "development",
        expectAllowed: false,
        label: "NEOTOMA_ENV=production + NODE_ENV=development -> rejected",
      },
      {
        neotomaEnv: "staging",
        nodeEnv: "development",
        expectAllowed: false,
        label: "NEOTOMA_ENV=staging (unrecognized) + NODE_ENV=development -> rejected",
      },
      {
        neotomaEnv: "staging",
        expectAllowed: false,
        label: "NEOTOMA_ENV=staging (unrecognized) alone -> rejected",
      },
    ];

    for (const { neotomaEnv, nodeEnv, expectAllowed, label } of CASES) {
      it(label, () => {
        withEnv({ NEOTOMA_ENV: neotomaEnv, NODE_ENV: nodeEnv }, () => {
          expect(isWebhookUrlAllowed("http://example.com/hook")).toBe(expectAllowed);
        });
      });
    }
  });

  it("allows http://localhost and http://127.0.0.1 even in production", () => {
    withEnv({ NEOTOMA_ENV: "production" }, () => {
      expect(isWebhookUrlAllowed("http://localhost:3000/hook")).toBe(true);
      expect(isWebhookUrlAllowed("http://127.0.0.1:3000/hook")).toBe(true);
    });
  });

  it("rejects http:// to a non-loopback host in production even with NEOTOMA_ENV=development + NODE_ENV=production", () => {
    withEnv({ NEOTOMA_ENV: "development", NODE_ENV: "production" }, () => {
      expect(isWebhookUrlAllowed("http://192.0.2.10/hook")).toBe(false);
    });
  });
});
