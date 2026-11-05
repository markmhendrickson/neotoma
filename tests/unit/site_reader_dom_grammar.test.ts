import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { unsafeMarkup } from "../../scripts/docs_viewer/validate_export";

describe("static reader passive DOM grammar", () => {
  it("denies browser-parsed SVG links and other foreign content", () => {
    const svg =
      '<style></style><svg width="300"><a xlink:href="javascript:window.__probe=1"><rect width="200" height="80"/></a></svg>';
    const parsed = JSDOM.fragment(svg);
    const link = parsed.querySelector("svg a")!;
    expect(link.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(link.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toMatch(/^javascript:/);
    for (const markup of [
      svg,
      "<style></style><math><mtext>foreign text</mtext></math>",
      "<style></style><svg><foreignObject><div>HTML in SVG</div></foreignObject></svg>",
    ]) {
      expect(unsafeMarkup(markup), markup).toContainEqual(expect.stringContaining("unsupported"));
    }
  });

  it("denies unexpected URL and active attributes on otherwise allowed elements", () => {
    for (const markup of [
      '<style></style><a xlink:href="javascript:alert(1)">text</a>',
      '<style></style><a formaction="javascript:alert(1)">text</a>',
      '<style></style><a ping="https://example.test/collect">text</a>',
      '<style></style><img src="/docs/_media/example.png" srcset="https://example.test/x 2x">',
      '<style></style><meta http-equiv="refresh" content="0;url=https://example.test">',
    ]) {
      expect(unsafeMarkup(markup), markup).toContainEqual(expect.stringContaining("unsupported"));
    }
  });

  it("keeps the current no-JavaScript article grammar and one trusted bootstrap", () => {
    const body =
      '<article><h1>Reference</h1><p><a href="/readme/">Read more</a></p><table><thead><tr><th>Key</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table><img src="/docs/_media/example.png" alt="Example"></article>';
    expect(unsafeMarkup(`<style></style>${body}`)).toEqual([]);
    const trusted =
      '<script defer src="/assets/reader-analytics.js" data-neotoma-reader-analytics="1" data-website-id="11111111-1111-4111-8111-111111111111" data-umami-url="https://metrics.example/analytics" data-page-path="/mcp/"></script>';
    expect(unsafeMarkup(`<html><head><style></style>${trusted}</head><body>${body}</body></html>`)).toEqual([]);
  });
});
