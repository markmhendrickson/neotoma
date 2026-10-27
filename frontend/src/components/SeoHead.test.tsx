// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, waitFor } from "@testing-library/react";
import * as ReactHelmetAsync from "react-helmet-async";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeoHead } from "./SeoHead";
import { injectRouteMetaIntoHtml } from "../site/seo_metadata";
import App from "../App";

vi.mock("@/components/MainApp", () => ({ MainApp: () => <main>Page</main> }));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));

const { HelmetProvider } = ReactHelmetAsync;
const template = readFileSync("frontend/index.html", "utf8");
const fallbackHead = /<head>([\s\S]*?)<\/head>/.exec(template)?.[1];
if (!fallbackHead) throw new Error("frontend/index.html has no head");

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  vi.unstubAllEnvs();
});

describe("route metadata after hydration", () => {
  it("marks the static preview export noindex", () => {
    vi.stubEnv("SITE_PREVIEW", "1");
    const exported = new DOMParser().parseFromString(
      injectRouteMetaIntoHtml(template, "/compare"),
      "text/html"
    );
    expect(exported.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex,follow"
    );
  });

  it("keeps preview and production app shells free of review badges", () => {
    vi.stubEnv("VITE_SITE_PREVIEW", "1");
    const preview = render(<App />);
    expect(preview.queryByText("Pre-release review")).toBeNull();
    expect(preview.getByText("Page")).toBeTruthy();
    preview.unmount();
    vi.stubEnv("VITE_SITE_PREVIEW", "0");
    const production = render(<App />);
    expect(production.queryByText("Pre-release review")).toBeNull();
  });
  it("keeps preview pages noindex after the browser head renders", async () => {
    vi.stubEnv("VITE_SITE_PREVIEW", "1");
    window.history.replaceState({}, "", "/pr-950/compare");
    document.head.innerHTML = fallbackHead;
    render(
      <HelmetProvider>
        <SeoHead routePath="/compare" />
      </HelmetProvider>
    );
    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
        "noindex,follow"
      );
      expect(document.head.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe(
        "/pr-950/favicon.ico"
      );
    });
    window.history.replaceState({}, "", "/");
  });
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
