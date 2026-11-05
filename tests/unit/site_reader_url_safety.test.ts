import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { unsafeMarkup } from "../../scripts/docs_viewer/validate_export";

describe("static reader URL attribute safety", () => {
  it("denies browser-active schemes after HTML attribute entity decoding", () => {
    for (const value of [
      "java&#x73;cript:alert(1)",
      "jav&#97;script:alert(1)",
      "javascript&colon;alert(1)",
      "java&Tab;script:alert(1)",
      "&#x09;java&#x73;cript:alert(1)",
      "&#106;avascript:alert(1)",
      "&#106avascript:alert(1)",
    ]) {
      const html = `<style></style><a href="${value}">test</a>`;
      const parsed = new JSDOM(html).window.document.querySelector("a")!;
      expect(parsed.href.toLowerCase(), value).toMatch(/^javascript:/);
      expect(unsafeMarkup(html), value).toContainEqual(
        expect.stringContaining("disallowed scheme")
      );
    }
    const image = '<style></style><img src="&#x64;ata:text/html,test">';
    expect(new JSDOM(image).window.document.querySelector("img")!.src).toMatch(/^data:/);
    expect(unsafeMarkup(image)).toContainEqual(expect.stringContaining("disallowed scheme"));
    const protocolRelative = '<style></style><a href="&sol;&sol;evil.example/x">test</a>';
    expect(
      new JSDOM(protocolRelative).window.document.querySelector("a")!.getAttribute("href")
    ).toBe("//evil.example/x");
    expect(unsafeMarkup(protocolRelative)).toContain("link or source with a protocol-relative URL");
  });

  it("keeps ordinary relative, HTTPS and mailto URLs safe after decoding", () => {
    for (const value of [
      "/readme/#start",
      "#section",
      "https&#58;//neotoma.io/readme/?a=1&amp;b=2",
      "mailto&#58;hello@example.test",
    ]) {
      expect(unsafeMarkup(`<style></style><a href="${value}">test</a>`), value).toEqual([]);
    }
    expect(unsafeMarkup('<style></style><img src="/brand/october/wordmark.svg">')).toEqual([]);
  });
});
