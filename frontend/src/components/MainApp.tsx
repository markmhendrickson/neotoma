import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { NotFound } from "@/components/NotFound";
import { SitePage } from "@/components/SitePage";
import { TerminologyPage } from "@/components/subpages/TerminologyPage";
import { AgentInstructionsPage } from "@/components/subpages/AgentInstructionsPage";
import { ApiReferencePage } from "@/components/subpages/ApiReferencePage";
import { McpReferencePage } from "@/components/subpages/McpReferencePage";
import { CliReferencePage } from "@/components/subpages/CliReferencePage";
import { DockerPage } from "@/components/subpages/DockerPage";
import { ArchitecturePage } from "@/components/subpages/ArchitecturePage";
import { AiInfrastructureEngineersPage } from "@/components/subpages/AiInfrastructureEngineersPage";
import { AiNativeOperatorsPage } from "@/components/subpages/AiNativeOperatorsPage";
import { KnowledgeWorkersPage } from "@/components/subpages/KnowledgeWorkersPage";
import { AgenticSystemsBuildersPage } from "@/components/subpages/AgenticSystemsBuildersPage";
import { DocsIndexPage } from "@/components/subpages/DocsIndexPage";
import { NeotomaWithCursorPage } from "@/components/subpages/NeotomaWithCursorPage";
import { NeotomaWithClaudePage } from "@/components/subpages/NeotomaWithClaudePage";
import { NeotomaWithClaudeCodePage } from "@/components/subpages/NeotomaWithClaudeCodePage";
import { NeotomaWithChatGPTPage } from "@/components/subpages/NeotomaWithChatGPTPage";
import { NeotomaWithCodexPage } from "@/components/subpages/NeotomaWithCodexPage";
import { NeotomaWithOpenClawPage } from "@/components/subpages/NeotomaWithOpenClawPage";
import { DeterministicStateEvolutionPage } from "@/components/subpages/DeterministicStateEvolutionPage";
import { VersionedHistoryPage } from "@/components/subpages/VersionedHistoryPage";
import { ReplayableTimelinePage } from "@/components/subpages/ReplayableTimelinePage";
import { AuditableChangeLogPage } from "@/components/subpages/AuditableChangeLogPage";
import { SchemaConstraintsPage } from "@/components/subpages/SchemaConstraintsPage";
import { SilentMutationRiskPage } from "@/components/subpages/SilentMutationRiskPage";
import { ConflictingFactsRiskPage } from "@/components/subpages/ConflictingFactsRiskPage";
import { ReproducibleStateReconstructionPage } from "@/components/subpages/ReproducibleStateReconstructionPage";
import { HumanInspectabilityPage } from "@/components/subpages/HumanInspectabilityPage";
import { PlatformMemoryPage } from "@/components/subpages/PlatformMemoryPage";
import { RetrievalMemoryPage } from "@/components/subpages/RetrievalMemoryPage";
import { FileBasedMemoryPage } from "@/components/subpages/FileBasedMemoryPage";
import { DeterministicMemoryPage } from "@/components/subpages/DeterministicMemoryPage";
import { MemoryVendorsPage } from "@/components/subpages/MemoryVendorsPage";
import { PrivacyFirstPage } from "@/components/subpages/PrivacyFirstPage";
import { CrossPlatformPage } from "@/components/subpages/CrossPlatformPage";
import { DataModelPage } from "@/components/subpages/DataModelPage";
import { SchemaManagementPage } from "@/components/subpages/SchemaManagementPage";
import { TroubleshootingPage } from "@/components/subpages/TroubleshootingPage";
import { ChangelogPage } from "@/components/subpages/ChangelogPage";
import { FoundersTeamsPage } from "@/components/subpages/FoundersTeamsPage";
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
  { path: "/docker", element: <DockerPage /> },
  { path: "/architecture", element: <ArchitecturePage /> },
  { path: "/data-model", element: <DataModelPage /> },
  { path: "/schema-management", element: <SchemaManagementPage /> },
  { path: "/troubleshooting", element: <TroubleshootingPage /> },
  { path: "/changelog", element: <ChangelogPage /> },
  { path: "/ai-infrastructure-engineers", element: <AiInfrastructureEngineersPage /> },
  { path: "/ai-native-operators", element: <AiNativeOperatorsPage /> },
  { path: "/knowledge-workers", element: <KnowledgeWorkersPage /> },
  { path: "/agentic-systems-builders", element: <AgenticSystemsBuildersPage /> },
  { path: "/founders-teams", element: <FoundersTeamsPage /> },
  { path: "/docs", element: <DocsIndexPage /> },
  { path: "/neotoma-with-cursor", element: <NeotomaWithCursorPage /> },
  { path: "/neotoma-with-claude", element: <NeotomaWithClaudePage /> },
  { path: "/neotoma-with-claude-code", element: <NeotomaWithClaudeCodePage /> },
  { path: "/neotoma-with-chatgpt", element: <NeotomaWithChatGPTPage /> },
  { path: "/neotoma-with-codex", element: <NeotomaWithCodexPage /> },
  { path: "/neotoma-with-openclaw", element: <NeotomaWithOpenClawPage /> },
  { path: "/deterministic-state-evolution", element: <DeterministicStateEvolutionPage /> },
  { path: "/versioned-history", element: <VersionedHistoryPage /> },
  { path: "/replayable-timeline", element: <ReplayableTimelinePage /> },
  { path: "/auditable-change-log", element: <AuditableChangeLogPage /> },
  { path: "/schema-constraints", element: <SchemaConstraintsPage /> },
  { path: "/silent-mutation-risk", element: <SilentMutationRiskPage /> },
  { path: "/conflicting-facts-risk", element: <ConflictingFactsRiskPage /> },
  { path: "/reproducible-state-reconstruction", element: <ReproducibleStateReconstructionPage /> },
  { path: "/human-inspectability", element: <HumanInspectabilityPage /> },
  { path: "/platform-memory", element: <PlatformMemoryPage /> },
  { path: "/retrieval-memory", element: <RetrievalMemoryPage /> },
  { path: "/file-based-memory", element: <FileBasedMemoryPage /> },
  { path: "/deterministic-memory", element: <DeterministicMemoryPage /> },
  { path: "/memory-vendors", element: <MemoryVendorsPage /> },
  { path: "/privacy-first", element: <PrivacyFirstPage /> },
  { path: "/cross-platform", element: <CrossPlatformPage /> },
];

const APP_ROUTE_PATHS = new Set(APP_ROUTES.map((route) => route.path));

function getLocalizedRoutePath(path: string): string {
  return path === "/" ? "/:locale" : `/:locale${path}`;
}

function LocaleSiteRedirect() {
  const { locale = DEFAULT_LOCALE } = useParams<{ locale: string }>();
  const resolvedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  return <Navigate to={localizePath("/", resolvedLocale)} replace />;
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
      <Routes>
        <Route path="/site" element={<Navigate to="/" replace />} />
        <Route path="/:locale/site" element={<LocaleSiteRedirect />} />
        {APP_ROUTES.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        {APP_ROUTES.map((route) => (
          <Route key={`localized:${route.path}`} path={getLocalizedRoutePath(route.path)} element={route.element} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
