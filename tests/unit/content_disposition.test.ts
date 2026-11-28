import { describe, expect, it } from "vitest";
import {
  buildContentDisposition,
  MAX_NAME_CODE_POINTS,
} from "../../src/utils/content_disposition.js";

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
    expect(buildContentDisposition("attachment", null, "source-2")).toContain(
      `filename="source-2"`
    );
  });

  it("encodes RFC 5987 reserved characters", () => {
    expect(buildContentDisposition("attachment", "it's (1)*.txt", "d")).toContain(
      `filename*=UTF-8''it%27s%20%281%29%2A.txt`
    );
  });

  it("replaces a lone high surrogate with U+FFFD instead of throwing", () => {
    const value = buildContentDisposition("attachment", "a\ud800b.txt", "d");
    expect(value).toContain(`filename="a_b.txt"`);
    expect(value).toContain(`filename*=UTF-8''a%EF%BF%BDb.txt`);
    expect(decodeURIComponent(value.split("UTF-8''")[1])).toBe("a�b.txt");
  });

  it("replaces a lone low surrogate with U+FFFD and keeps valid pairs", () => {
    const value = buildContentDisposition("attachment", "\udc00x\u{1F680}.txt", "d");
    expect(decodeURIComponent(value.split("UTF-8''")[1])).toBe("�x\u{1F680}.txt");
  });

  it("drops bidirectional controls and zero-width format characters", () => {
    const value = buildContentDisposition("attachment", "a‮b⁦c⁩​d﻿.txt", "d");
    expect(value).toBe(`attachment; filename="abcd.txt"; filename*=UTF-8''abcd.txt`);
  });

  it("caps a 10,000 character name at 255 code points and keeps the extension", () => {
    const value = buildContentDisposition("attachment", `${"a".repeat(10_000)}.pdf`, "d");
    const fallback = /filename="([^"]*)"/.exec(value)![1];
    const extended = decodeURIComponent(value.split("UTF-8''")[1]);
    expect(Array.from(extended)).toHaveLength(MAX_NAME_CODE_POINTS);
    expect(extended.endsWith(".pdf")).toBe(true);
    expect(fallback).toHaveLength(MAX_NAME_CODE_POINTS);
    expect(fallback.endsWith(".pdf")).toBe(true);
  });

  it("does not split a surrogate pair when capping", () => {
    const value = buildContentDisposition("attachment", "\u{1F680}".repeat(10_000), "d");
    const extended = decodeURIComponent(value.split("UTF-8''")[1]);
    expect(extended).toBe("\u{1F680}".repeat(MAX_NAME_CODE_POINTS));
  });

  it("replaces a percent sign in the ASCII fallback only", () => {
    expect(buildContentDisposition("attachment", "100%25 done.txt", "d")).toBe(
      `attachment; filename="100_25 done.txt"; filename*=UTF-8''100%2525%20done.txt`
    );
  });
});
