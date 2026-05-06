import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_ADMIN_COOKIE,
  clearFeedbackAdminStateForTests,
  createFeedbackAdminChallenge,
  getFeedbackAdminSessionFromRequest,
  redeemFeedbackAdminChallenge,
} from "../../src/services/feedback/admin_session.js";

describe("feedback admin session helper", () => {
  beforeEach(() => {
    clearFeedbackAdminStateForTests();
    delete process.env.NEOTOMA_FEEDBACK_ADMIN_CHALLENGE_TTL_MS;
    delete process.env.NEOTOMA_FEEDBACK_ADMIN_SESSION_TTL_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
    clearFeedbackAdminStateForTests();
    delete process.env.NEOTOMA_FEEDBACK_ADMIN_CHALLENGE_TTL_MS;
    delete process.env.NEOTOMA_FEEDBACK_ADMIN_SESSION_TTL_MS;
  });

  it("rejects challenge redemption without an allowed AAuth tier", () => {
    const { challenge } = createFeedbackAdminChallenge();
    expect(() => redeemFeedbackAdminChallenge(challenge, null)).toThrow(
      /requires hardware\/software\/operator_attested/,
    );
  });

  it("resolves and expires sessions from the httpOnly cookie value", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));
    process.env.NEOTOMA_FEEDBACK_ADMIN_SESSION_TTL_MS = "1000";
    const { challenge } = createFeedbackAdminChallenge();
    const session = redeemFeedbackAdminChallenge(challenge, {
      tier: "operator_attested",
      thumbprint: "thumb",
      sub: "agent",
      iss: "https://issuer.example",
    });

    const req = {
      headers: {
        cookie: `${FEEDBACK_ADMIN_COOKIE}=${encodeURIComponent(session.token)}`,
      },
    } as any;

    expect(getFeedbackAdminSessionFromRequest(req)?.tier).toBe("operator_attested");
    vi.advanceTimersByTime(1001);
    expect(getFeedbackAdminSessionFromRequest(req)).toBeNull();
  });
});
