import { describe, expect, it } from "vitest";

import { redactRecord, redactString } from "./redact_for_test_report.js";

describe("redact_for_test_report", () => {
  it("redacts bearer tokens and access_token query params", () => {
    expect(redactString("Authorization: Bearer secret-token-here")).toContain("<redacted>");
    expect(redactString("https://x.example/?access_token=abc123&y=1")).toContain("access_token=<redacted>");
  });

  it("redacts shallow string fields in records", () => {
    const out = redactRecord({
      url: "Bearer xyz",
      nested: { token: "access_token=secret" },
      n: 1,
    });
    expect(out.url).toContain("<redacted>");
    expect((out.nested as Record<string, string>).token).toContain("<redacted>");
    expect(out.n).toBe(1);
  });
});
