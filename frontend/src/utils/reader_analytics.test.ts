// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { initReaderAnalytics } from "./reader_analytics";

describe("static reader Umami adapter", () => {
  it("emits one bounded pageview and one bounded outbound event", () => {
    document.head.innerHTML =
      '<script defer src="/assets/reader-analytics.js" data-neotoma-reader-analytics="1" data-website-id="11111111-1111-4111-8111-111111111111" data-umami-url="https://metrics.example/analytics" data-page-path="/mcp/"></script>';
    document.body.innerHTML =
      '<a href="https://github.com/org/repo?token=secret#private">person@example.com</a>';
    const track = vi.fn();
    window.umami = { track };
    initReaderAnalytics();
    const loader = document.querySelector<HTMLScriptElement>('script[data-auto-track="false"]');
    expect(loader?.src).toBe("https://metrics.example/analytics/script.js");
    loader?.dispatchEvent(new Event("load"));
    document
      .querySelector("a")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(track).toHaveBeenCalledTimes(2);
    expect(track.mock.calls[0][0]).toEqual({
      website: "11111111-1111-4111-8111-111111111111",
      hostname: "neotoma.io",
      url: "/mcp",
      title: "Neotoma",
    });
    expect(track.mock.calls[1][0]).toMatchObject({
      name: "outbound_click",
      data: { destination: "github", page_path: "/mcp" },
    });
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/secret|private|person@|referrer/);
  });
});
