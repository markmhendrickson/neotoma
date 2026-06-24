import { describe, it, expect } from "vitest";
import { checkRenderedPageConformance, type ConformancePolicy } from "./conformance.js";

const codes = (html: string, css: string, policy?: ConformancePolicy) =>
  checkRenderedPageConformance(html, css, policy).map((w) => w.code);

// A tenant (Ateles) theming policy expressed as DATA, not hardcoded in core.
const THEMING_POLICY: ConformancePolicy = {
  rules: [
    {
      code: "RENDERED_PAGE_NO_DARK_MODE",
      pattern: "prefers-color-scheme\\s*:\\s*dark",
      mode: "require_present",
      severity: "warn",
      message: "Add a @media (prefers-color-scheme: dark) block.",
    },
    {
      code: "RENDERED_PAGE_NO_COLOR_SCHEME",
      pattern: "color-scheme\\s*:\\s*light\\s+dark",
      mode: "require_present",
      severity: "warn",
      message: "Add html{color-scheme:light dark}.",
    },
    {
      code: "RENDERED_PAGE_NO_THEME_TOGGLE",
      pattern: "tw-(?:light|dark|system)",
      mode: "require_present",
      severity: "warn",
      message: "Add the pure-CSS Light/Dark/System toggle.",
    },
  ],
};

const CONFORMANT_CSS = `
  html{color-scheme:light dark}
  @media(prefers-color-scheme:dark){:root{--bg:#0f1115}}
`;
const TOGGLE_HTML = `<input type="radio" id="tw-system" checked><input id="tw-light"><input id="tw-dark">`;

describe("checkRenderedPageConformance — universal invariants (no policy)", () => {
  it("does NOT flag theming without a policy (theming is tenant taste, not core)", () => {
    expect(
      checkRenderedPageConformance("<div>hi</div>", "body{background:#000;color:#fff}")
    ).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(checkRenderedPageConformance(undefined, undefined)).toEqual([]);
    expect(checkRenderedPageConformance("", "")).toEqual([]);
  });

  it("flags a tokenless internal cross-link (universal)", () => {
    const html = `<a href="/entities/ent_xyz/html">no token</a>`;
    expect(codes(html, "")).toEqual(["RENDERED_PAGE_TOKENLESS_LINK"]);
  });

  it("accepts a tokenized internal link and ignores external links", () => {
    const html =
      `<a href="https://n.example/entities/ent_xyz/html?access_token=tok">ok</a>` +
      `<a href="https://example.com/page">ext</a>`;
    expect(codes(html, "")).not.toContain("RENDERED_PAGE_TOKENLESS_LINK");
  });

  it("detects an absolute tokenless rendered-page url", () => {
    const html = `<a href="https://n.example/entities/ent_x/html">bad</a>`;
    expect(codes(html, "")).toContain("RENDERED_PAGE_TOKENLESS_LINK");
  });
});

describe("checkRenderedPageConformance — tenant policy engine", () => {
  it("flags theming violations when a policy is supplied", () => {
    const out = codes("<div>hi</div>", "body{background:#000}", THEMING_POLICY);
    expect(out).toEqual(
      expect.arrayContaining([
        "RENDERED_PAGE_NO_DARK_MODE",
        "RENDERED_PAGE_NO_COLOR_SCHEME",
        "RENDERED_PAGE_NO_THEME_TOGGLE",
      ])
    );
  });

  it("passes a fully conformant page under the theming policy", () => {
    const html = `${TOGGLE_HTML}<a href="/entities/ent_a/html?access_token=t">x</a>`;
    expect(checkRenderedPageConformance(html, CONFORMANT_CSS, THEMING_POLICY)).toEqual([]);
  });

  it("supports require_absent rules", () => {
    const policy: ConformancePolicy = {
      rules: [
        {
          code: "NO_INLINE_COLOR",
          pattern: 'style="[^"]*color:',
          mode: "require_absent",
          message: "No hardcoded inline color styles.",
        },
      ],
    };
    expect(codes(`<p style="color:#f00">x</p>`, "", policy)).toContain("NO_INLINE_COLOR");
    expect(codes(`<p>x</p>`, "", policy)).not.toContain("NO_INLINE_COLOR");
  });

  it("skips a malformed regex rule (fail-open)", () => {
    const policy: ConformancePolicy = {
      rules: [{ code: "BAD", pattern: "([", mode: "require_present", message: "bad" }],
    };
    expect(() => checkRenderedPageConformance("<div>x</div>", "", policy)).not.toThrow();
    expect(codes("<div>x</div>", "", policy)).not.toContain("BAD");
  });

  it("carries severity through (default warn, explicit block honored)", () => {
    const policy: ConformancePolicy = {
      rules: [
        { code: "MUST", pattern: "zzz", mode: "require_present", severity: "block", message: "m" },
      ],
    };
    const w = checkRenderedPageConformance("<div>x</div>", "", policy).find(
      (x) => x.code === "MUST"
    );
    expect(w?.severity).toBe("block");
  });
});
