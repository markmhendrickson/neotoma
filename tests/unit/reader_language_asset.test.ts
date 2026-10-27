import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const script = readFileSync(join(__dirname, "../../public/assets/reader-language.js"), "utf8");
const html = `<nav class="plan-language-choice"><a href="/install/" data-locale-choice="en">English</a><a href="/es/install/" data-locale-choice="es">Español</a></nav><h2 id="stable">Stable heading</h2>`;

describe("static reader language choice", () => {
  it("keeps ordinary counterpart anchors usable without JavaScript", () => {
    const dom = new JSDOM(html, { url: "https://neotoma.io/es/install/" });
    expect(dom.window.document.querySelector('a[data-locale-choice="en"]')?.getAttribute("href")).toBe("/install/");
    expect(dom.window.document.querySelector('a[data-locale-choice="es"]')?.getAttribute("href")).toBe("/es/install/");
  });

  it("preserves a safe query and existing stable fragment despite storage denial", () => {
    const dom = new JSDOM(html, { url: "https://neotoma.io/es/install/?source=guide#stable", runScripts: "outside-only" });
    Object.defineProperty(dom.window, "localStorage", { get: () => { throw new dom.window.DOMException("denied", "SecurityError"); } });
    const link = dom.window.document.querySelector<HTMLAnchorElement>('a[data-locale-choice="en"]')!;
    link.addEventListener("click", (event) => event.preventDefault());
    dom.window.eval(script);
    expect(() => link.click()).not.toThrow();
    expect(link.href).toBe("https://neotoma.io/install/?source=guide#stable");
  });

  it("does not carry a fragment that has no matching target", () => {
    const dom = new JSDOM(html, { url: "https://neotoma.io/es/install/?source=guide#missing", runScripts: "outside-only" });
    const link = dom.window.document.querySelector<HTMLAnchorElement>('a[data-locale-choice="en"]')!;
    link.addEventListener("click", (event) => event.preventDefault());
    dom.window.eval(script);
    link.click();
    expect(link.href).toBe("https://neotoma.io/install/?source=guide");
  });
});
