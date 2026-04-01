import { describe, expect, it } from "vitest";
import { stripMarkdownExportBanner } from "../../frontend/src/site/html_to_markdown";

describe("html_to_markdown", () => {
  it("stripMarkdownExportBanner removes leading HTML comment banner", () => {
    const md = `<!--\n  Full-page\n  Source: https://neotoma.io/x\n-->\n\n# Title\n`;
    expect(stripMarkdownExportBanner(md)).toBe("# Title\n");
  });
});
