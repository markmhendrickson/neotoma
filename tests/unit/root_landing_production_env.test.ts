/**
 * `resolveLandingMode` (src/services/root_landing/index.ts) has its own
 * production-environment detector, deliberately duplicated from
 * `src/actions.ts::isLocalRequest` so this module carries no upward
 * dependency on that file (see the docstring on its private
 * `isLoopbackRequest`). Before ateles ent_1cc5662e217133323890a90f, that
 * duplicate — like the one in actions.ts — only honoured `NEOTOMA_ENV`, so a
 * deploy setting only `NODE_ENV=production` was landed-page-classified as a
 * loopback caller ("local" mode) even in production. This locks in that both
 * detectors now agree.
 */

import { describe, expect, it } from "vitest";

import { resolveLandingMode } from "../../src/services/root_landing/index.js";

function loopbackReq(forwardedFor?: string): import("express").Request {
  return {
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as import("express").Request;
}

describe("resolveLandingMode honours NODE_ENV=production (ateles ent_1cc5662e217133323890a90f)", () => {
  it("a loopback caller with only NODE_ENV=production set resolves to personal, not local", () => {
    const env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    expect(resolveLandingMode(loopbackReq(), env)).toBe("personal");
  });

  it("still resolves to local in development (no env vars set)", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(resolveLandingMode(loopbackReq(), env)).toBe("local");
  });

  it("still resolves to local when NEOTOMA_TRUST_PROD_LOOPBACK=1 is set alongside NODE_ENV=production", () => {
    const env = {
      NODE_ENV: "production",
      NEOTOMA_TRUST_PROD_LOOPBACK: "1",
    } as NodeJS.ProcessEnv;
    expect(resolveLandingMode(loopbackReq(), env)).toBe("local");
  });

  it("an explicit NEOTOMA_ENV=development still wins over NODE_ENV=production", () => {
    const env = {
      NEOTOMA_ENV: "development",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv;
    expect(resolveLandingMode(loopbackReq(), env)).toBe("local");
  });

  it("matches the existing NEOTOMA_ENV=production behaviour (personal, not local)", () => {
    const env = { NEOTOMA_ENV: "production" } as NodeJS.ProcessEnv;
    expect(resolveLandingMode(loopbackReq(), env)).toBe("personal");
  });
});
