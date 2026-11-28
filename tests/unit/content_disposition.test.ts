import { describe, expect, it } from "vitest";
import { buildContentDisposition } from "../../src/utils/content_disposition.js";

describe("buildContentDisposition", () => {
  it("keeps plain ASCII names readable in both forms", () => {
    expect(buildContentDisposition("inline", "report.pdf", "source-x")).toBe(
      `inline; filename="report.pdf"; filename*=UTF-8''report.pdf`
    );
  });

  it("gives an ASCII fallback and a UTF-8 encoded name for non-Latin-1 text", () => {
    const value = buildContentDisposition("attachment", "a – café \u{1F680}.txt", "x");
    expect(value).toMatch(/^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''/);
    expect(value).toContain(`filename="a _ cafe __.txt"`);
    expect(decodeURIComponent(value.split("UTF-8''")[1])).toBe("a – café \u{1F680}.txt");
  });

  it("drops control characters and replaces quotes in the fallback", () => {
    const value = buildContentDisposition("attachment", 'x"y\\z\r\n\u0000.bin', "d");
    expect(value).toContain(`filename="x_y_z.bin"`);
    expect(value).toContain(`filename*=UTF-8''x%22y%5Cz.bin`);
    // Every character is legal in a Node header value.
    expect(/^[\t\x20-\x7e]*$/.test(value)).toBe(true);
  });

  it("uses the default name when the stored name is empty after cleaning", () => {
    expect(buildContentDisposition("attachment", "\n\t", "source-1")).toBe(
      `attachment; filename="source-1"; filename*=UTF-8''source-1`
    );
    expect(buildContentDisposition("attachment", null, "source-2")).toContain(`filename="source-2"`);
  });

  it("encodes RFC 5987 reserved characters", () => {
    expect(buildContentDisposition("attachment", "it's (1)*.txt", "d")).toContain(
      `filename*=UTF-8''it%27s%20%281%29%2A.txt`
    );
  });
});
