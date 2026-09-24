/**
 * neotoma#2264 — `correct()` must reject an `@`-prefixed file reference rather
 * than storing it literally and destroying the field.
 *
 * The bug was not that rejection was missing in one place: it was that `value`
 * accepted anything, so the most path-shaped argument a caller could pass was
 * silently written as text over (in the observed case) a ~16 KB published
 * `rendered_page.html_body`. These tests pin the detector's boundary, because a
 * detector that is too broad breaks handles and npm scopes, and one that is too
 * narrow lets the destructive case back through.
 */
import { describe, expect, it } from "vitest";
import {
  CorrectionFileReferenceError,
  looksLikeFileReference,
  unescapeAtPrefix,
} from "../../src/services/correction.js";

describe("looksLikeFileReference — rejects path-shaped @ values", () => {
  it.each([
    ["@/tmp/body_new.html", "absolute path — the exact value from the issue"],
    ["@./relative.json", "explicit relative"],
    ["@../up/one.txt", "parent-relative"],
    ["@~/Documents/body.html", "home-relative"],
    ["@some/dir/file.json", "bare separator"],
    ["@C:\\Users\\me\\body.html", "Windows drive, backslashes"],
    ["@C:/Users/me/body.html", "Windows drive, forward slashes"],
  ])("rejects %s (%s)", (value) => {
    expect(looksLikeFileReference(value)).toBe(true);
  });
});

describe("looksLikeFileReference — leaves real @ data alone", () => {
  it.each([
    ["@markmhendrickson", "a handle: indistinguishable from a single-segment path"],
    ["@here", "a mention"],
    ["", "empty string"],
    ["@", "a bare @"],
    ["plain text", "no @ at all"],
    ["email@example.com", "@ not leading"],
    ["@media (min-width: 40em)", "CSS at-rule — has no separator before the space"],
  ])("accepts %s (%s)", (value) => {
    expect(looksLikeFileReference(value)).toBe(false);
  });

  it("accepts an npm scope, which is path-shaped but legitimate data", () => {
    // Documents a deliberate limitation: `@scope/pkg` IS separator-shaped, so
    // the detector does flag it. Asserting the real behaviour rather than a
    // wish, so the tradeoff is visible to whoever revisits this.
    expect(looksLikeFileReference("@scope/pkg")).toBe(true);
  });

  it("ignores non-strings", () => {
    for (const v of [null, undefined, 42, true, {}, [], { "@a": "/b" }]) {
      expect(looksLikeFileReference(v)).toBe(false);
    }
  });
});

describe("@@ escape hatch", () => {
  it("is not treated as a file reference", () => {
    expect(looksLikeFileReference("@@/tmp/real-at-path")).toBe(false);
  });

  it("collapses to a single literal @ so the value is still storable", () => {
    expect(unescapeAtPrefix("@@/tmp/real-at-path")).toBe("@/tmp/real-at-path");
  });

  it("leaves everything else untouched", () => {
    expect(unescapeAtPrefix("@markmh")).toBe("@markmh");
    expect(unescapeAtPrefix("plain")).toBe("plain");
    expect(unescapeAtPrefix(42)).toBe(42);
    expect(unescapeAtPrefix(null)).toBe(null);
  });
});

describe("CorrectionFileReferenceError", () => {
  it("carries the stable code both transports map on", () => {
    const e = new CorrectionFileReferenceError("html_body", "@/tmp/body.html");
    expect(e.code).toBe("ERR_FILE_REFERENCE_NOT_SUPPORTED");
  });

  it("names the field and states what WOULD have been written", () => {
    const e = new CorrectionFileReferenceError("html_body", "@/tmp/body.html");
    expect(e.message).toContain("html_body");
    expect(e.message).toContain("@/tmp/body.html");
    expect(e.message).toContain("stored literally");
  });

  it("carries a hint naming the way out — the tightening obligation", () => {
    const e = new CorrectionFileReferenceError("html_body", "@/tmp/body.html");
    expect(e.hint).toMatch(/contents as `value`/);
    expect(e.hint).toMatch(/\*_path|publish_rendered_page|store/);
    expect(e.hint).toContain("@@");
  });

  it("truncates the preview so a long host path cannot spill into logs", () => {
    const long = "@/" + "a".repeat(400);
    const e = new CorrectionFileReferenceError("f", long);
    expect(e.valuePreview.length).toBeLessThanOrEqual(121);
    expect(e.valuePreview.endsWith("…")).toBe(true);
  });
});
