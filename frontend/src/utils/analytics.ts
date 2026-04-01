/**
 * Site analytics: GA4 (gtag) and/or Umami. Each backend loads only when its env vars are set.
 * Page views fire on SPA navigations via MainApp. Typed event helpers mirror the same schema to both.
 *
 * Umami (no in-repo defaults): `import.meta.env.DEV` uses VITE_UMAMI_WEBSITE_ID_DEV and optional
 * VITE_UMAMI_URL_DEV; production bundles use VITE_UMAMI_WEBSITE_ID and VITE_UMAMI_URL. Dev falls
 * back to VITE_UMAMI_URL only when VITE_UMAMI_URL_DEV is unset (shared origin is still env-only).
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    umami?: {
      track(
        arg?:
          | string
          | Record<string, unknown>
          | ((props: Record<string, unknown>) => Record<string, unknown>),
        data?: Record<string, unknown>,
      ): void;
    };
  }
}

const UMAMI_SCRIPT_MARKER = "data-neotoma-umami";

const umamiPending: Array<() => void> = [];

function trimViteEnv(name: string): string | undefined {
  const raw = import.meta.env[name] as string | undefined;
  const t = raw?.trim();
  return t || undefined;
}

/** Website ID for the current bundle: dev server vs production build (CI/deploy always production). */
function umamiWebsiteIdForMode(): string | undefined {
  if (import.meta.env.DEV) {
    return trimViteEnv("VITE_UMAMI_WEBSITE_ID_DEV");
  }
  return trimViteEnv("VITE_UMAMI_WEBSITE_ID");
}

/** Script origin for the current mode; dev may override with VITE_UMAMI_URL_DEV. */
function umamiBaseUrlForMode(): string | undefined {
  if (import.meta.env.DEV) {
    return trimViteEnv("VITE_UMAMI_URL_DEV") ?? trimViteEnv("VITE_UMAMI_URL");
  }
  return trimViteEnv("VITE_UMAMI_URL");
}

function isUmamiConfigured(): boolean {
  return Boolean(umamiWebsiteIdForMode() && umamiBaseUrlForMode());
}

function runWhenUmamiReady(fn: () => void): void {
  if (typeof window === "undefined") return;
  if (window.umami?.track) {
    fn();
    return;
  }
  umamiPending.push(fn);
}

function flushUmamiQueue(): void {
  while (umamiPending.length > 0 && window.umami?.track) {
    const fn = umamiPending.shift();
    fn?.();
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

/** Loads Umami tracker from {origin}/script.js when mode-specific env URL and website ID are set. */
export function initUmami(): void {
  if (!isUmamiConfigured() || typeof window === "undefined") return;
  if (document.querySelector(`script[${UMAMI_SCRIPT_MARKER}]`)) return;

  const websiteId = umamiWebsiteIdForMode()!;
  const base = umamiBaseUrlForMode()!.replace(/\/$/, "");

  const script = document.createElement("script");
  script.defer = true;
  script.src = `${base}/script.js`;
  script.setAttribute("data-website-id", websiteId);
  script.setAttribute("data-auto-track", "false");
  script.setAttribute(UMAMI_SCRIPT_MARKER, "1");
  script.onload = () => flushUmamiQueue();
  document.head.appendChild(script);
}

/** Initialize every analytics backend enabled via env. */
export function initSiteAnalytics(): void {
  initGoogleAnalytics();
  initUmami();
}

function isGaReady(): boolean {
  return !!(import.meta.env.VITE_GA_MEASUREMENT_ID && window.gtag);
}

/** Send a page_view for SPA navigation. No-op when no backend is active. */
export function sendPageView(path: string): void {
  if (isGaReady()) {
    window.gtag!("event", "page_view", {
      page_path: path,
      page_title: document.title,
    });
  }

  if (isUmamiConfigured()) {
    const title = document.title;
    runWhenUmamiReady(() => {
      window.umami!.track((props: Record<string, unknown>) => ({
        ...props,
        url: path,
        title,
      }));
    });
    flushUmamiQueue();
  }
}

// ---------------------------------------------------------------------------
// Typed event helpers
// ---------------------------------------------------------------------------

export type CtaName =
  | "install"
  | "hero_evaluate"
  | "hero_evaluate_scroll_banner"
  | "hero_install"
  | "view_guarantees"
  | "view_architecture"
  | "view_docs"
  | "view_repo"
  | "crm_install_neotoma"
  | "crm_install_neotoma_bottom"
  | "compliance_install_neotoma"
  | "compliance_install_neotoma_bottom"
  | "contracts_install_neotoma"
  | "contracts_install_neotoma_bottom"
  | "diligence_install_neotoma"
  | "diligence_install_neotoma_bottom"
  | "portfolio_install_neotoma"
  | "portfolio_install_neotoma_bottom"
  | "cases_install_neotoma"
  | "cases_install_neotoma_bottom"
  | "financial_ops_install_neotoma"
  | "financial_ops_install_neotoma_bottom"
  | "procurement_install_neotoma"
  | "procurement_install_neotoma_bottom"
  | "agent_auth_install_neotoma"
  | "agent_auth_install_neotoma_bottom"
  | "healthcare_install_neotoma"
  | "healthcare_install_neotoma_bottom"
  | "govtech_install_neotoma"
  | "govtech_install_neotoma_bottom"
  | "customer_ops_install_neotoma"
  | "customer_ops_install_neotoma_bottom"
  | "logistics_install_neotoma"
  | "logistics_install_neotoma_bottom"
  | "evaluate_copy_prompt"
  | "evaluate_prompt_install"
  | "evaluate_share_results"
  | "section_evaluate";

/** Track a CTA button/link click with the CTA name and current page. */
export function sendCtaClick(ctaName: CtaName, pagePath?: string): void {
  const page_path = pagePath ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  if (isGaReady()) {
    window.gtag!("event", "cta_click", {
      cta_name: ctaName,
      page_path,
    });
  }
  if (isUmamiConfigured()) {
    runWhenUmamiReady(() => {
      window.umami!.track("cta_click", { cta_name: ctaName, page_path });
    });
    flushUmamiQueue();
  }
}

/** Track an outbound link click (GitHub, npm, blog, etc.). */
export function sendOutboundClick(url: string, linkText?: string): void {
  const page_path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (isGaReady()) {
    window.gtag!("event", "outbound_click", {
      link_url: url,
      link_text: linkText ?? "",
      page_path,
    });
  }
  if (isUmamiConfigured()) {
    runWhenUmamiReady(() => {
      window.umami!.track("outbound_click", {
        link_url: url,
        link_text: linkText ?? "",
        page_path,
      });
    });
    flushUmamiQueue();
  }
}

/** Track documentation navigation clicks (header nav dropdown, docs index). */
export function sendDocsNavClick(destination: string, source?: string): void {
  const page_path = typeof window !== "undefined" ? window.location.pathname : "/";
  const src = source ?? "header_nav";
  if (isGaReady()) {
    window.gtag!("event", "docs_nav_click", {
      destination,
      source: src,
      page_path,
    });
  }
  if (isUmamiConfigured()) {
    runWhenUmamiReady(() => {
      window.umami!.track("docs_nav_click", {
        destination,
        source: src,
        page_path,
      });
    });
    flushUmamiQueue();
  }
}
