import { describe, it, expect } from "vitest";
import { decodeOverEscapedBody } from "./body_newline_decode.js";

describe("decodeOverEscapedBody", () => {
  it("decodes literal \\n sequences into real newlines (the #1484 bug)", () => {
    const overEscaped =
      "## Summary\\n\\nWhen a schema is updated...\\n\\n## Reproduction\\n\\n1. Register...";
    const decoded = decodeOverEscapedBody(overEscaped);

    expect(decoded).not.toContain("\\n");
    expect(decoded).toContain("\n");
    expect(decoded).toBe(
      "## Summary\n\nWhen a schema is updated...\n\n## Reproduction\n\n1. Register..."
    );
    // The decoded body splits into the expected markdown lines.
    expect(decoded.split("\n")[0]).toBe("## Summary");
  });

  it("decodes \\t into real tabs", () => {
    expect(decodeOverEscapedBody("col1\\tcol2\\nrow")).toBe("col1\tcol2\nrow");
  });

  it("decodes \\r\\n CRLF sequences", () => {
    expect(decodeOverEscapedBody("line1\\r\\nline2")).toBe("line1\r\nline2");
  });

  it("decodes escaped quotes", () => {
    expect(decodeOverEscapedBody('say \\"hi\\"\\nthen leave')).toBe('say "hi"\nthen leave');
  });

  it("leaves a body that already has real newlines untouched", () => {
    const correct = "## Summary\n\nAlready correct.\n";
    expect(decodeOverEscapedBody(correct)).toBe(correct);
  });

  it("leaves a body with no escape sequences untouched", () => {
    expect(decodeOverEscapedBody("single line, no escapes")).toBe("single line, no escapes");
  });

  it("does not corrupt an intentional literal backslash-n (escaped backslash)", () => {
    // `\\n` in JSON-escaped form decodes to backslash + n, NOT backslash + newline.
    // i.e. the source intent was a literal two characters backslash + 'n'.
    const input = "use the sequence \\\\n to mean newline\\nbut this line breaks";
    const decoded = decodeOverEscapedBody(input);
    // The escaped backslash collapses to one backslash followed by a literal 'n'.
    expect(decoded).toContain("\\n to mean newline");
    // The genuine \n (single backslash) becomes a real newline.
    expect(decoded.split("\n")).toEqual([
      "use the sequence \\n to mean newline",
      "but this line breaks",
    ]);
  });

  it("preserves a Windows-style path fragment with no decodable escape", () => {
    // No real newline and no decodable escape sequence → returned unchanged.
    const input = "path is C:\\Users\\mark";
    expect(decodeOverEscapedBody(input)).toBe(input);
  });

  it("preserves an unknown escape verbatim while decoding known ones", () => {
    const input = "C:\\Users\\mark\\nthen next line";
    const decoded = decodeOverEscapedBody(input);
    // `\U` and `\m` are not JSON escapes → backslashes preserved.
    // `\n` decodes to a real newline.
    expect(decoded).toBe("C:\\Users\\mark\nthen next line");
  });

  it("returns empty and non-string inputs unchanged", () => {
    expect(decodeOverEscapedBody("")).toBe("");
    // @ts-expect-error exercising defensive guard for non-string inputs
    expect(decodeOverEscapedBody(undefined)).toBe(undefined);
  });

  it("round-trips a multi-line body through JSON double-encoding", () => {
    const original = "# Title\n\n- one\n- two\n\nDone.";
    // Simulate the wire over-encoding: JSON.stringify once for transport, then
    // the value is mistakenly delivered as the inner (still-escaped) string.
    const overEncoded = JSON.stringify(original).slice(1, -1); // strip surrounding quotes
    expect(overEncoded).toContain("\\n");
    expect(decodeOverEscapedBody(overEncoded)).toBe(original);
  });
});
