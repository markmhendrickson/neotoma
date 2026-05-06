import { describe, expect, it, afterEach } from "vitest";
import { buildInspectorFeedbackAdminUnlockPageUrl } from "../../src/cli/inspector_admin_unlock_url.js";

const saved = {
  NEOTOMA_INSPECTOR_BASE_URL: process.env.NEOTOMA_INSPECTOR_BASE_URL,
  NEOTOMA_INSPECTOR_BASE_PATH: process.env.NEOTOMA_INSPECTOR_BASE_PATH,
};

afterEach(() => {
  if (saved.NEOTOMA_INSPECTOR_BASE_URL === undefined) {
    delete process.env.NEOTOMA_INSPECTOR_BASE_URL;
  } else {
    process.env.NEOTOMA_INSPECTOR_BASE_URL = saved.NEOTOMA_INSPECTOR_BASE_URL;
  }
  if (saved.NEOTOMA_INSPECTOR_BASE_PATH === undefined) {
    delete process.env.NEOTOMA_INSPECTOR_BASE_PATH;
  } else {
    process.env.NEOTOMA_INSPECTOR_BASE_PATH = saved.NEOTOMA_INSPECTOR_BASE_PATH;
  }
});

describe("buildInspectorFeedbackAdminUnlockPageUrl", () => {
  it("defaults to API origin + /inspector when env overrides are unset", () => {
    delete process.env.NEOTOMA_INSPECTOR_BASE_URL;
    delete process.env.NEOTOMA_INSPECTOR_BASE_PATH;
    const url = buildInspectorFeedbackAdminUnlockPageUrl({
      apiBaseUrl: "http://127.0.0.1:3080",
      challenge: "abc123",
    });
    expect(url).toBe(
      "http://127.0.0.1:3080/inspector/feedback/admin-unlock?challenge=abc123",
    );
  });

  it("respects NEOTOMA_INSPECTOR_BASE_PATH", () => {
    delete process.env.NEOTOMA_INSPECTOR_BASE_URL;
    process.env.NEOTOMA_INSPECTOR_BASE_PATH = "/app/inspector";
    const url = buildInspectorFeedbackAdminUnlockPageUrl({
      apiBaseUrl: "http://localhost:3080/",
      challenge: "x/y",
    });
    expect(url).toContain("/app/inspector/feedback/admin-unlock?");
    expect(url).toContain(encodeURIComponent("x/y"));
  });

  it("prefers NEOTOMA_INSPECTOR_BASE_URL over derived default", () => {
    process.env.NEOTOMA_INSPECTOR_BASE_URL = "http://localhost:5175/inspector";
    const url = buildInspectorFeedbackAdminUnlockPageUrl({
      apiBaseUrl: "http://localhost:3080",
      challenge: "ch1",
    });
    expect(url).toBe(
      "http://localhost:5175/inspector/feedback/admin-unlock?challenge=ch1",
    );
  });

  it("uses explicit inspectorBaseUrl when provided", () => {
    process.env.NEOTOMA_INSPECTOR_BASE_URL = "http://wrong.example/inspector";
    const url = buildInspectorFeedbackAdminUnlockPageUrl({
      apiBaseUrl: "http://localhost:3080",
      challenge: "z",
      inspectorBaseUrl: "https://sandbox.example/inspector/",
    });
    expect(url).toBe(
      "https://sandbox.example/inspector/feedback/admin-unlock?challenge=z",
    );
  });

  it("throws on empty challenge", () => {
    expect(() =>
      buildInspectorFeedbackAdminUnlockPageUrl({
        apiBaseUrl: "http://localhost:3080",
        challenge: "   ",
      }),
    ).toThrow(/Challenge is required/);
  });
});
