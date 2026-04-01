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
  | "personal_data_install_neotoma"
  | "personal_data_install_neotoma_bottom"
  | "crm_case_study_install"
  | "compliance_case_study_install"
  | "contracts_case_study_install"
  | "diligence_case_study_install"
  | "financial_ops_case_study_install"
  | "customer_ops_case_study_install"
  | "portfolio_case_study_install"
  | "cases_case_study_install"
  | "procurement_case_study_install"
  | "agent_auth_case_study_install"
  | "healthcare_case_study_install"
  | "govtech_case_study_install"
  | "logistics_case_study_install"
  | "personal_data_case_study_install"
  | "header_evaluate"
  | "header_install"
  | "footer_install"
  | "docs_evaluate_getting_started"
  | "docs_install_getting_started"
  | "docs_install_reference"
  | "evaluate_copy_prompt"
  | "evaluate_prompt_install"
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

// ---------------------------------------------------------------------------
// Inline /evaluate and /install navigation (beyond primary CTAs and header/footer)
// ---------------------------------------------------------------------------

export type ProductNavTarget = "evaluate" | "install";

/** Stable `nav_source` values for `product_nav_click` (GA4 + Umami). */
export const PRODUCT_NAV_SOURCES = {
  installPageEvaluateCta: "install_page_evaluate_cta",
  installPageInlineEvaluate: "install_page_inline_evaluate",
  installPageDockerHash: "install_page_docker_hash",
  evaluatePageBodyInstall: "evaluate_page_body_install",
  neotomaWithClaudeSetupEvaluate: "neotoma_with_claude_setup_evaluate",
  neotomaWithClaudeTailEvaluate: "neotoma_with_claude_tail_evaluate",
  neotomaWithClaudeTailInstall: "neotoma_with_claude_tail_install",
  neotomaWithCursorTailEvaluate: "neotoma_with_cursor_tail_evaluate",
  neotomaWithCursorTailInstall: "neotoma_with_cursor_tail_install",
  neotomaWithClaudeCodeTailEvaluate: "neotoma_with_claude_code_tail_evaluate",
  neotomaWithClaudeCodeTailInstall: "neotoma_with_claude_code_tail_install",
  neotomaWithCodexTailEvaluate: "neotoma_with_codex_tail_evaluate",
  neotomaWithCodexTailInstall: "neotoma_with_codex_tail_install",
  neotomaWithChatgptTailEvaluate: "neotoma_with_chatgpt_tail_evaluate",
  neotomaWithChatgptTailInstall: "neotoma_with_chatgpt_tail_install",
  neotomaWithOpenclawTailEvaluate: "neotoma_with_openclaw_tail_evaluate",
  neotomaWithOpenclawTailInstall: "neotoma_with_openclaw_tail_install",
  claudeConnectRemoteMcpInstall: "claude_connect_remote_mcp_install",
  codexConnectRemoteOauthInstall: "codex_connect_remote_oauth_install",
  openclawConnectRemoteHttpInstall: "openclaw_connect_remote_http_install",
  chatgptConnectCustomGptInstall: "chatgpt_connect_custom_gpt_install",
  chatgptConnectRemoteMcpInstall: "chatgpt_connect_remote_mcp_install",
  claudeConnectDesktopFooterInstall: "claude_connect_desktop_footer_install",
  codexConnectLocalStdioFooterInstall: "codex_connect_local_stdio_footer_install",
  openclawConnectLocalStdioFooterInstall: "openclaw_connect_local_stdio_footer_install",
  comparisonPageInstall: "comparison_page_install",
  verticalsIndexInstall: "verticals_index_install",
  zeroSetupOnboardingInstall: "zero_setup_onboarding_install",
  faqInstallGuide: "faq_install_guide",
  memoryGuaranteesInstall: "memory_guarantees_install",
  entityTypeGuideInstall: "entity_type_guide_install",
  icpDetailInstall: "icp_detail_install",
  developerWalkthroughInstall: "developer_walkthrough_install",
  architectureDockerInstall: "architecture_docker_install",
} as const;

export type ProductNavSource = (typeof PRODUCT_NAV_SOURCES)[keyof typeof PRODUCT_NAV_SOURCES];

/** Secondary product path clicks (body copy, integration tails, connect footers). Event: `product_nav_click`. */
export function sendProductNavClick(
  target: ProductNavTarget,
  source: ProductNavSource,
  pagePath?: string,
): void {
  const page_path = pagePath ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  if (isGaReady()) {
    window.gtag!("event", "product_nav_click", {
      nav_target: target,
      nav_source: source,
      page_path,
    });
  }
  if (isUmamiConfigured()) {
    runWhenUmamiReady(() => {
      window.umami!.track("product_nav_click", {
        nav_target: target,
        nav_source: source,
        page_path,
      });
    });
    flushUmamiQueue();
  }
}

// ---------------------------------------------------------------------------
// Funnel events (Umami goals: same event name + filter on custom properties)
// ---------------------------------------------------------------------------

/**
 * Where the evaluate prompt was copied from — one Umami event `funnel_evaluate_prompt_copy`; segment by this.
 * Joint “any evaluate prompt copy”: count the event; for the two marketing paths use `home` vs `evaluate_page`.
 */
export type EvaluatePromptCopySurface = "home" | "evaluate_page" | "integration_doc";

/**
 * Evaluate prompt copy (home #evaluate section vs /evaluate page).
 * Joint conversion: count all `funnel_evaluate_prompt_copy`. Per-path: filter `copy_surface`.
 */
export function sendFunnelEvaluatePromptCopy(surface: EvaluatePromptCopySurface): void {
  const page_path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (isGaReady()) {
    window.gtag!("event", "funnel_evaluate_prompt_copy", {
      funnel: "evaluate_prompt",
      copy_surface: surface,
      page_path,
    });
  }
  if (isUmamiConfigured()) {
    runWhenUmamiReady(() => {
      window.umami!.track("funnel_evaluate_prompt_copy", {
        funnel: "evaluate_prompt",
        copy_surface: surface,
        page_path,
      });
    });
    flushUmamiQueue();
  }
}

/** Which install page code block was copied — filter `funnel_install_prompt_copy` in Umami by this. */
export type InstallPromptCopyBlock =
  | "agent_assisted"
  | "manual_commands"
  | "post_install_commands"
  | "stdio_mcp"
  | "docker_agent_prompt"
  | "docker_build"
  | "docker_run"
  | "docker_init"
  | "docker_mcp"
  | "docker_cli_example"
  | "doc_neotoma_with_cursor"
  | "doc_neotoma_with_claude_code"
  | "doc_claude_connect_desktop"
  | "doc_codex_connect_local_stdio"
  | "doc_openclaw_connect_local_stdio";

/**
 * Install page prompt/command copy. Funnel: pageview `/` → pageview `/install` → this event (filter `install_block: agent_assisted` for the main agent prompt).
 */
export function sendFunnelInstallPromptCopy(block: InstallPromptCopyBlock): void {
  const page_path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (isGaReady()) {
    window.gtag!("event", "funnel_install_prompt_copy", {
      funnel: "install_prompt",
      install_block: block,
      page_path,
    });
  }
  if (isUmamiConfigured()) {
    runWhenUmamiReady(() => {
      window.umami!.track("funnel_install_prompt_copy", {
        funnel: "install_prompt",
        install_block: block,
        page_path,
      });
    });
    flushUmamiQueue();
  }
}
