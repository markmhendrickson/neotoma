import { useEffect, useLayoutEffect, useRef } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
} from "react-router-dom";
import { Layout } from "@/components/Layout";
import { NotFound } from "@/components/NotFound";
import { SitePage } from "@/components/SitePage";
import { TerminologyPage } from "@/components/subpages/TerminologyPage";
import { AgentInstructionsPage } from "@/components/subpages/AgentInstructionsPage";
import { ApiReferencePage } from "@/components/subpages/ApiReferencePage";
import { McpReferencePage } from "@/components/subpages/McpReferencePage";
import { CliReferencePage } from "@/components/subpages/CliReferencePage";
import { InstallPage } from "@/components/subpages/InstallPage";
import { ArchitecturePage } from "@/components/subpages/ArchitecturePage";
import { AiInfrastructureEngineersPage } from "@/components/subpages/AiInfrastructureEngineersPage";
import { AiNativeOperatorsPage } from "@/components/subpages/AiNativeOperatorsPage";
import { AgenticSystemsBuildersPage } from "@/components/subpages/AgenticSystemsBuildersPage";
import { DocsIndexPage } from "@/components/subpages/DocsIndexPage";
import { NeotomaWithCursorPage } from "@/components/subpages/NeotomaWithCursorPage";
import { NeotomaWithClaudePage } from "@/components/subpages/NeotomaWithClaudePage";
import { ClaudeConnectDesktopPage } from "@/components/subpages/ClaudeConnectDesktopPage";
import { ClaudeConnectRemoteMcpPage } from "@/components/subpages/ClaudeConnectRemoteMcpPage";
import { NeotomaWithClaudeCodePage } from "@/components/subpages/NeotomaWithClaudeCodePage";
import { ChatGptConnectCustomGptPage } from "@/components/subpages/ChatGptConnectCustomGptPage";
import { ChatGptConnectRemoteMcpPage } from "@/components/subpages/ChatGptConnectRemoteMcpPage";
import { NeotomaWithChatGPTPage } from "@/components/subpages/NeotomaWithChatGPTPage";
import { NeotomaWithCodexPage } from "@/components/subpages/NeotomaWithCodexPage";
import { CodexConnectLocalStdioPage } from "@/components/subpages/CodexConnectLocalStdioPage";
import { CodexConnectRemoteHttpOauthPage } from "@/components/subpages/CodexConnectRemoteHttpOauthPage";
import { NeotomaWithOpenClawPage } from "@/components/subpages/NeotomaWithOpenClawPage";
import { OpenClawConnectLocalStdioPage } from "@/components/subpages/OpenClawConnectLocalStdioPage";
import { OpenClawConnectRemoteHttpPage } from "@/components/subpages/OpenClawConnectRemoteHttpPage";
import { MemoryGuaranteesPage } from "@/components/subpages/MemoryGuaranteesPage";
import { MemoryModelsPage } from "@/components/subpages/MemoryModelsPage";
import { FoundationsPage } from "@/components/subpages/FoundationsPage";
import { SchemaManagementPage } from "@/components/subpages/SchemaManagementPage";
import { TroubleshootingPage } from "@/components/subpages/TroubleshootingPage";
import { ChangelogPage } from "@/components/subpages/ChangelogPage";
import { CrmLandingPage } from "@/components/subpages/CrmLandingPage";
import { ComplianceLandingPage } from "@/components/subpages/ComplianceLandingPage";
import { DeveloperWalkthroughPage } from "@/components/subpages/DeveloperWalkthroughPage";
import { sendPageView } from "@/utils/analytics";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/config";
import {
  getLocaleFromPath,
  localizePath,
  normalizeToDefaultRoute,
  resolvePreferredLocale,
} from "@/i18n/routing";

type AppRoute = {
  path: string;
  element: JSX.Element;
};

const APP_ROUTES: readonly AppRoute[] = [
  { path: "/", element: <SitePage /> },
  { path: "/terminology", element: <TerminologyPage /> },
  { path: "/agent-instructions", element: <AgentInstructionsPage /> },
  { path: "/api", element: <ApiReferencePage /> },
  { path: "/mcp", element: <McpReferencePage /> },
  { path: "/cli", element: <CliReferencePage /> },
  { path: "/install", element: <InstallPage /> },
  { path: "/developer-walkthrough", element: <DeveloperWalkthroughPage /> },
  { path: "/architecture", element: <ArchitecturePage /> },
  { path: "/schema-management", element: <SchemaManagementPage /> },
  { path: "/troubleshooting", element: <TroubleshootingPage /> },
  { path: "/changelog", element: <ChangelogPage /> },
  { path: "/ai-infrastructure-engineers", element: <AiInfrastructureEngineersPage /> },
  { path: "/ai-native-operators", element: <AiNativeOperatorsPage /> },
  { path: "/agentic-systems-builders", element: <AgenticSystemsBuildersPage /> },
  { path: "/docs", element: <DocsIndexPage /> },
  { path: "/neotoma-with-cursor", element: <NeotomaWithCursorPage /> },
  { path: "/neotoma-with-claude", element: <NeotomaWithClaudePage /> },
  { path: "/neotoma-with-claude-connect-desktop", element: <ClaudeConnectDesktopPage /> },
  { path: "/neotoma-with-claude-connect-remote-mcp", element: <ClaudeConnectRemoteMcpPage /> },
  { path: "/neotoma-with-claude-code", element: <NeotomaWithClaudeCodePage /> },
  { path: "/neotoma-with-chatgpt", element: <NeotomaWithChatGPTPage /> },
  { path: "/neotoma-with-chatgpt-connect-remote-mcp", element: <ChatGptConnectRemoteMcpPage /> },
  { path: "/neotoma-with-chatgpt-connect-custom-gpt", element: <ChatGptConnectCustomGptPage /> },
  { path: "/neotoma-with-codex", element: <NeotomaWithCodexPage /> },
  { path: "/neotoma-with-codex-connect-local-stdio", element: <CodexConnectLocalStdioPage /> },
  { path: "/neotoma-with-codex-connect-remote-http-oauth", element: <CodexConnectRemoteHttpOauthPage /> },
  { path: "/neotoma-with-openclaw", element: <NeotomaWithOpenClawPage /> },
  { path: "/neotoma-with-openclaw-connect-local-stdio", element: <OpenClawConnectLocalStdioPage /> },
  { path: "/neotoma-with-openclaw-connect-remote-http", element: <OpenClawConnectRemoteHttpPage /> },
  { path: "/memory-guarantees", element: <MemoryGuaranteesPage /> },
  { path: "/deterministic-state-evolution", element: <Navigate to="/memory-guarantees#deterministic-state-evolution" replace /> },
  { path: "/versioned-history", element: <Navigate to="/memory-guarantees#versioned-history" replace /> },
  { path: "/replayable-timeline", element: <Navigate to="/memory-guarantees#replayable-timeline" replace /> },
  { path: "/auditable-change-log", element: <Navigate to="/memory-guarantees#auditable-change-log" replace /> },
  { path: "/schema-constraints", element: <Navigate to="/memory-guarantees#schema-constraints" replace /> },
  { path: "/silent-mutation-risk", element: <Navigate to="/memory-guarantees#silent-mutation-risk" replace /> },
  { path: "/conflicting-facts-risk", element: <Navigate to="/memory-guarantees#conflicting-facts-risk" replace /> },
  { path: "/reproducible-state-reconstruction", element: <Navigate to="/memory-guarantees#reproducible-state-reconstruction" replace /> },
  { path: "/human-inspectability", element: <Navigate to="/memory-guarantees#human-inspectability" replace /> },
  { path: "/zero-setup-onboarding", element: <Navigate to="/memory-guarantees#zero-setup-onboarding" replace /> },
  { path: "/semantic-similarity-search", element: <Navigate to="/memory-guarantees#semantic-similarity-search" replace /> },
  { path: "/direct-human-editability", element: <Navigate to="/memory-guarantees#direct-human-editability" replace /> },
  { path: "/memory-models", element: <MemoryModelsPage /> },
  { path: "/platform-memory", element: <Navigate to="/memory-models#platform-memory" replace /> },
  { path: "/retrieval-memory", element: <Navigate to="/memory-models#retrieval-memory" replace /> },
  { path: "/file-based-memory", element: <Navigate to="/memory-models#file-based-memory" replace /> },
  { path: "/deterministic-memory", element: <Navigate to="/memory-models#deterministic-memory" replace /> },
  { path: "/memory-vendors", element: <Navigate to="/memory-models#memory-model-comparison" replace /> },
  { path: "/crm", element: <CrmLandingPage /> },
  { path: "/compliance", element: <ComplianceLandingPage /> },
  { path: "/foundations", element: <FoundationsPage /> },
  { path: "/privacy-first", element: <Navigate to="/foundations#privacy-first" replace /> },
  { path: "/cross-platform", element: <Navigate to="/foundations#cross-platform" replace /> },
];

const APP_ROUTE_PATHS = new Set([
  ...APP_ROUTES.map((route) => route.path),
]);

/** When the app is served at a product path (e.g. /neotoma-with-claude-code), show that product page at "/". */
const BASENAME_TO_ROOT_PAGE: Record<string, JSX.Element> = {
  "/neotoma-with-cursor": <NeotomaWithCursorPage />,
  "/neotoma-with-claude": <NeotomaWithClaudePage />,
  "/neotoma-with-claude-code": <NeotomaWithClaudeCodePage />,
  "/neotoma-with-chatgpt": <NeotomaWithChatGPTPage />,
  "/neotoma-with-codex": <NeotomaWithCodexPage />,
  "/neotoma-with-openclaw": <NeotomaWithOpenClawPage />,
};

function getRootElement(): JSX.Element {
  if (typeof window === "undefined") return <SitePage staticMode />;
  const segment = window.location.pathname.replace(/^\//, "").split("/")[0] ?? "";
  const basename = segment ? `/${segment}` : "";
  return BASENAME_TO_ROOT_PAGE[basename] ?? <SitePage />;
}

function getLocalizedRoutePath(path: string): string {
  return path === "/" ? "/:locale" : `/:locale${path}`;
}

function LocaleSiteRedirect() {
  const { locale = DEFAULT_LOCALE } = useParams<{ locale: string }>();
  const resolvedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  return <Navigate to={localizePath("/", resolvedLocale)} replace />;
}

const SCROLL_POSITIONS_STORAGE_KEY = "site-scroll-positions-v1";

function RouteScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const hasLoadedPersistedPositionsRef = useRef(false);

  useEffect(() => {
    // Native restoration conflicts with app-level scroll handling.
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useEffect(() => {
    if (hasLoadedPersistedPositionsRef.current) return;
    hasLoadedPersistedPositionsRef.current = true;
    try {
      const stored = window.sessionStorage.getItem(SCROLL_POSITIONS_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return;
      scrollPositionsRef.current = parsed as Record<string, number>;
    } catch {
      // Ignore malformed state and continue with an empty map.
      scrollPositionsRef.current = {};
    }
  }, []);

  useEffect(() => {
    return () => {
      scrollPositionsRef.current[location.key] = window.scrollY;
      try {
        window.sessionStorage.setItem(
          SCROLL_POSITIONS_STORAGE_KEY,
          JSON.stringify(scrollPositionsRef.current)
        );
      } catch {
        // Ignore storage write failures (e.g. private mode quotas).
      }
    };
  }, [location.key]);

  useLayoutEffect(() => {
    if (location.hash) return;

    if (navigationType === "POP") {
      const top = scrollPositionsRef.current[location.key] ?? 0;
      window.scrollTo({ top, left: 0, behavior: "auto" });
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.hash, location.key, navigationType]);

  // When the URL has a hash, scroll to the target element after the route has rendered.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    if (!id) return;

    const scrollToHash = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    // Defer so the target page (e.g. Install) has mounted and the element exists.
    const t = window.setTimeout(scrollToHash, 100);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.hash]);

  return null;
}

/**
 * Site-only public app shell.
 */
export function MainApp() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    sendPageView(normalizeToDefaultRoute(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (getLocaleFromPath(location.pathname)) return;
    const preferredLocale = resolvePreferredLocale();
    if (preferredLocale === DEFAULT_LOCALE) return;

    const defaultRoutePath = normalizeToDefaultRoute(location.pathname);
    const targetBasePath = defaultRoutePath === "/site" ? "/" : defaultRoutePath;
    if (!APP_ROUTE_PATHS.has(targetBasePath)) return;

    const localizedPath = localizePath(targetBasePath, preferredLocale);
    const target = `${localizedPath}${location.hash || ""}`;
    if (target === `${location.pathname}${location.hash || ""}`) return;
    navigate(target, { replace: true });
  }, [location.hash, location.pathname, navigate]);

  return (
    <Layout siteName="Neotoma">
      <RouteScrollManager />
      <Routes>
        <Route path="/site" element={<Navigate to="/" replace />} />
        <Route path="/quick-start" element={<Navigate to="/install" replace />} />
        <Route path="/docker" element={<Navigate to="/install#docker" replace />} />
        <Route path="/:locale/site" element={<LocaleSiteRedirect />} />
        <Route path="/" element={getRootElement()} />
        {APP_ROUTES.filter((r) => r.path !== "/").map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        {APP_ROUTES.map((route) => (
          <Route
            key={`localized:${route.path}`}
            path={getLocalizedRoutePath(route.path)}
            element={route.path === "/" ? getRootElement() : route.element}
          />
        ))}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
