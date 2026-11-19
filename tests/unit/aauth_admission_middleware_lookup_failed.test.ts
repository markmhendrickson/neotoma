/**
 * The admission middleware's own fallback: when `admitFromAAuthContext`
 * rejects for a verified signature, the request is stamped not admitted
 * with reason `lookup_failed` (not `no_match`) and keeps flowing, so the
 * route gate can answer a retryable 503.
 */

import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/aauth_admission.js", () => ({
  admitFromAAuthContext: vi.fn(async () => {
    throw new Error("synthetic: admission service failed");
  }),
}));

vi.mock("../../src/middleware/aauth_verify.js", () => ({
  getAAuthContextFromRequest: () => ({
    verified: true,
    sub: "agent@agents.test",
    iss: "https://agents.test",
    thumbprint: "tp-middleware-fallback",
  }),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  aauthAdmission,
  getAAuthAdmissionFromRequest,
} from "../../src/middleware/aauth_admission.js";
import { logger } from "../../src/utils/logger.js";

describe("aauthAdmission middleware fallback", () => {
  it("stamps `lookup_failed` (not admitted) when admission throws", async () => {
    const req = { path: "/store", url: "/store" } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;
    aauthAdmission()(req, {} as Response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(next).toHaveBeenCalledWith(undefined);
    expect(getAAuthAdmissionFromRequest(req)).toEqual({
      admitted: false,
      reason: "lookup_failed",
    });
    expect((req as Request & { authenticatedUserId?: string }).authenticatedUserId).toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "aauth_admission lookup failed",
      expect.objectContaining({ reason: "lookup_failed" })
    );
  });
});
