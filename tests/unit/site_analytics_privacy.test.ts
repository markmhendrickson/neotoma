import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  safeAnalyticsPagePath,
  safeOutboundDestination,
  initUmami,
  sendCtaClick,
  sendDocsNavClick,
  sendOutboundClick,
  sendPageView,
} from "../../frontend/src/utils/analytics";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("site analytics privacy boundary", () => {
  // The real Umami send endpoint accepts { type: 'event', payload }, requires a
  // UUID website ID, and interprets a missing event name as a pageview.
  const collectorEnvelope = z
    .object({
      type: z.literal("event"),
      payload: z
        .object({
          website: z.string().uuid(),
          hostname: z.literal("neotoma.io"),
          url: z.string().regex(/^\/(?:[a-z0-9/-]*)$/),
          title: z.literal("Neotoma"),
          name: z.string().optional(),
          data: z.record(z.string(), z.string()).optional(),
        })
        .strict(),
    })
    .strict();
  it("reduces outbound URLs to a fixed destination class", () => {
    expect(safeOutboundDestination("https://github.com/org/repo?token=secret#fragment")).toBe(
      "github"
    );
    expect(safeOutboundDestination("mailto:person@example.com?subject=private")).toBe("email");
    expect(safeOutboundDestination("https://secret.example.com/private?id=123")).toBe("other");
  });

  it("allows known public routes and collapses unrecognized paths", () => {
    expect(safeAnalyticsPagePath("/install?token=secret")).toBe("/install");
    expect(safeAnalyticsPagePath("/person@example.com")).toBe("/other");
  });

  it("sends only an explicit Umami envelope and deduplicates same-path pageviews", () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID_DEV", "11111111-1111-4111-8111-111111111111");
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "11111111-1111-4111-8111-111111111111");
    vi.stubEnv("VITE_UMAMI_URL_DEV", "https://metrics.example");
    vi.stubEnv("VITE_UMAMI_URL", "https://metrics.example");
    const observed: Record<string, unknown>[] = [];
    vi.stubGlobal("window", {
      location: { pathname: "/install", search: "?token=secret", hash: "#private" },
      umami: {
        track: (payload: unknown) => {
          // Umami's named and callback APIs would inherit these unsafe browser defaults.
          const defaults = {
            url: "/install?token=secret#private",
            title: "person@example.com",
            referrer: "https://example.com/?token=secret",
          };
          if (typeof payload === "string") throw new Error("named API uses unsafe defaults");
          observed.push(
            typeof payload === "function" ? payload(defaults) : (payload as Record<string, unknown>)
          );
        },
      },
    });
    sendPageView("/install?token=secret#private");
    sendPageView("/install?token=other");
    sendCtaClick("hero_install");
    sendOutboundClick("https://github.com/org/repo?token=secret#private");
    sendDocsNavClick("/person@example.com?token=secret", "user supplied source");
    expect(observed).toHaveLength(4);
    expect(observed[0]).toEqual({
      website: "11111111-1111-4111-8111-111111111111",
      hostname: "neotoma.io",
      url: "/install",
      title: "Neotoma",
    });
    for (const payload of observed)
      expect(collectorEnvelope.safeParse({ type: "event", payload }).success).toBe(true);
    expect(observed[1]).toMatchObject({ name: "cta_click", data: { cta_name: "hero_install" } });
    expect(observed[2]).toMatchObject({
      name: "outbound_click",
      data: { destination: "github", page_path: "/install" },
    });
    expect(observed[3]).toMatchObject({
      name: "docs_nav_click",
      data: { destination: "/other", source: "other" },
    });
    expect(JSON.stringify(observed)).not.toMatch(/secret|person@|referrer|private/);
  });

  it("rejects malformed website IDs and origins before loading or tracking", () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "not-a-uuid");
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID_DEV", "not-a-uuid");
    vi.stubEnv("VITE_UMAMI_URL", "https://metrics.example");
    vi.stubEnv("VITE_UMAMI_URL_DEV", "https://metrics.example");
    const track = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/install" }, umami: { track } });
    sendPageView("/install");
    expect(track).not.toHaveBeenCalled();
    expect(
      collectorEnvelope.safeParse({
        type: "event",
        payload: {
          website: "not-a-uuid",
          hostname: "neotoma.io",
          url: "/install",
          title: "Neotoma",
        },
      }).success
    ).toBe(false);
  });

  it("loads a configured SPA tracker from the same validated subpath as static readers", () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "11111111-1111-4111-8111-111111111111");
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID_DEV", "11111111-1111-4111-8111-111111111111");
    vi.stubEnv("VITE_UMAMI_URL", "https://metrics.example/analytics/");
    vi.stubEnv("VITE_UMAMI_URL_DEV", "https://metrics.example/analytics/");
    const script = { src: "", defer: false, setAttribute: vi.fn(), onload: null };
    const appendChild = vi.fn();
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      querySelector: () => null,
      createElement: () => script,
      head: { appendChild },
    });
    initUmami();
    expect(script.src).toBe("https://metrics.example/analytics/script.js");
    expect(script.setAttribute).toHaveBeenCalledWith("data-auto-track", "false");
    expect(appendChild).toHaveBeenCalledWith(script);
  });
});
