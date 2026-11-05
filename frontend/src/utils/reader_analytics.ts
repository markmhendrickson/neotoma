/** Optional static-reader Umami adapter. The article remains fully readable without JavaScript. */
import {
  canonicalUmamiBaseUrl,
  explicitUmamiPayload,
  safeOutboundDestination,
  validUmamiWebsiteId,
} from "./site_analytics_contract";

export function initReaderAnalytics(): void {
  const bootstrap = document.querySelector<HTMLScriptElement>(
    'script[src="/assets/reader-analytics.js"][data-neotoma-reader-analytics]'
  );
  const website = bootstrap?.dataset.websiteId;
  const base = bootstrap?.dataset.umamiUrl;
  const route = bootstrap?.dataset.pagePath;
  if (!validUmamiWebsiteId(website) || !base || !route) return;
  const canonicalBase = canonicalUmamiBaseUrl(base);
  if (!canonicalBase) return;
  if (!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/$/.test(route)) return;
  const pagePath = route.replace(/\/$/, "");
  const knownPaths = new Set([pagePath]);
  const send = (name?: "outbound_click", data?: Record<string, string>) => {
    const trackerApi = (
      window as Window & { umami?: { track(payload: Record<string, unknown>): void } }
    ).umami;
    trackerApi?.track(explicitUmamiPayload(website, pagePath, knownPaths, name, data));
  };
  const tracker = document.createElement("script");
  tracker.src = `${canonicalBase}/script.js`;
  tracker.async = true;
  tracker.dataset.websiteId = website;
  tracker.dataset.autoTrack = "false";
  tracker.onload = () => send();
  document.head.appendChild(tracker);

  const onOutbound = (event: MouseEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const raw = anchor.getAttribute("href");
    if (!raw) return;
    let destination: URL;
    try {
      destination = new URL(raw, location.href);
    } catch {
      return;
    }
    if (
      destination.protocol !== "mailto:" &&
      destination.protocol !== "tel:" &&
      destination.protocol !== "sms:" &&
      (destination.protocol !== "https:" || destination.host === location.host)
    )
      return;
    send("outbound_click", {
      destination: safeOutboundDestination(destination.href),
      page_path: pagePath,
    });
  };
  document.addEventListener("click", onOutbound, true);
  document.addEventListener("auxclick", onOutbound, true);
}

if (typeof document !== "undefined") initReaderAnalytics();
