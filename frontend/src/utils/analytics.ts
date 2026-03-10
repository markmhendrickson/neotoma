/**
 * Google Analytics 4 (gtag.js). Loads only when VITE_GA_MEASUREMENT_ID is set.
 * Page views are sent automatically on navigation (SPA history changes).
 *
 * Typed event helpers enforce a consistent event schema across the site.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function initGoogleAnalytics(): void {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (!measurementId || typeof window === "undefined") return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.gtag("config", measurementId, {
    send_page_view: false,
  });
}

function isAnalyticsReady(): boolean {
  return !!(import.meta.env.VITE_GA_MEASUREMENT_ID && window.gtag);
}

/** Send a page_view for SPA navigation. No-op if GA is not loaded. */
export function sendPageView(path: string): void {
  if (!isAnalyticsReady()) return;
  window.gtag!("event", "page_view", {
    page_path: path,
    page_title: document.title,
  });
}

// ---------------------------------------------------------------------------
// Typed event helpers
// ---------------------------------------------------------------------------

export type CtaName =
  | "install"
  | "view_guarantees"
  | "view_architecture"
  | "view_docs"
  | "quick_start"
  | "view_repo";

/** Track a CTA button/link click with the CTA name and current page. */
export function sendCtaClick(ctaName: CtaName, pagePath?: string): void {
  if (!isAnalyticsReady()) return;
  window.gtag!("event", "cta_click", {
    cta_name: ctaName,
    page_path: pagePath ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
  });
}

/** Track an outbound link click (GitHub, npm, blog, etc.). */
export function sendOutboundClick(url: string, linkText?: string): void {
  if (!isAnalyticsReady()) return;
  window.gtag!("event", "outbound_click", {
    link_url: url,
    link_text: linkText ?? "",
    page_path: typeof window !== "undefined" ? window.location.pathname : "/",
  });
}

/** Track documentation navigation clicks (header nav dropdown, docs index). */
export function sendDocsNavClick(destination: string, source?: string): void {
  if (!isAnalyticsReady()) return;
  window.gtag!("event", "docs_nav_click", {
    destination,
    source: source ?? "header_nav",
    page_path: typeof window !== "undefined" ? window.location.pathname : "/",
  });
}
