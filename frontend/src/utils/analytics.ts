/**
 * Google Analytics 4 (gtag.js). Loads only when VITE_GA_MEASUREMENT_ID is set.
 * Page views are sent automatically on navigation (SPA history changes).
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
    send_page_view: false, // we send page_view on each SPA route change
  });
}

/** Send a page_view for SPA navigation. No-op if GA is not loaded. */
export function sendPageView(path: string): void {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (!measurementId || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: document.title,
  });
}
