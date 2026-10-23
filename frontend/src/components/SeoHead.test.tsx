// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, waitFor } from "@testing-library/react";
import * as ReactHelmetAsync from "react-helmet-async";
import { afterEach, describe, expect, it } from "vitest";
import { SeoHead } from "./SeoHead";
import { injectRouteMetaIntoHtml } from "../site/seo_metadata";

const { HelmetProvider } = ReactHelmetAsync;
const template = readFileSync("frontend/index.html", "utf8");
const fallbackHead = /<head>([\s\S]*?)<\/head>/.exec(template)?.[1];
if (!fallbackHead) throw new Error("frontend/index.html has no head");

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
});

describe("route metadata after hydration", () => {
  it("keeps the static comparison export specific to its route", () => {
    const exported = new DOMParser().parseFromString(
      injectRouteMetaIntoHtml(template, "/compare"),
      "text/html"
    );
    expect(exported.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://neotoma.io/compare"
    );
    expect(exported.querySelector('meta[name="description"]')?.getAttribute("content")).toContain(
      "Compare session memory"
    );
    expect(exported.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(
      "https://neotoma.io/compare"
    );
    expect(exported.querySelector('script[type="application/ld+json"]')?.textContent).toContain(
      '"https://neotoma.io/compare"'
    );
  });

  it("replaces fallback canonical and description with the current route", async () => {
    document.head.innerHTML = fallbackHead;
    render(
      <HelmetProvider>
        <SeoHead routePath="/compare" />
      </HelmetProvider>
    );

    await waitFor(() => {
      const canonicals = document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]');
      const descriptions = document.head.querySelectorAll<HTMLMetaElement>(
        'meta[name="description"]'
      );
      expect(canonicals).toHaveLength(1);
      expect(canonicals[0].href).toBe("https://neotoma.io/compare");
      expect(descriptions).toHaveLength(1);
      expect(descriptions[0].content).toContain("Compare session memory");
    });
  });
});
