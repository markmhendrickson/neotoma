import { useEffect, useLayoutEffect, useRef } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { Layout } from "@/components/Layout";
import { NotFound } from "@/components/NotFound";
import { SitePage } from "@/components/SitePage";
import { SitePageAlt } from "@/components/SitePageAlt";
import { SitePageHome2 } from "@/components/SitePageHome2";
import { TerminologyPage } from "@/components/subpages/TerminologyPage";
import { AgentInstructionsPage } from "@/components/subpages/AgentInstructionsPage";
import { AgentInstructionsStoreRecipesPage } from "@/components/subpages/AgentInstructionsStoreRecipesPage";
import { AgentInstructionsRetrievalPage } from "@/components/subpages/AgentInstructionsRetrievalPage";
import { AgentInstructionsDisplayPage } from "@/components/subpages/AgentInstructionsDisplayPage";
import { AauthReferencePage } from "@/components/subpages/AauthReferencePage";
import { AauthSpecPage } from "@/components/subpages/AauthSpecPage";
import { AauthAttestationPage } from "@/components/subpages/AauthAttestationPage";
import { AauthCliKeysPage } from "@/components/subpages/AauthCliKeysPage";
import { AauthIntegrationPage } from "@/components/subpages/AauthIntegrationPage";
import { AauthCapabilitiesPage } from "@/components/subpages/AauthCapabilitiesPage";
import { ApiReferencePage } from "@/components/subpages/ApiReferencePage";
import { McpReferencePage } from "@/components/subpages/McpReferencePage";
import { CliReferencePage } from "@/components/subpages/CliReferencePage";
import { InspectorReferencePage } from "@/components/subpages/InspectorReferencePage";
import { InspectorDashboardPage } from "@/components/subpages/InspectorDashboardPage";
import { InspectorEntitiesPage } from "@/components/subpages/InspectorEntitiesPage";
import { InspectorObservationsAndSourcesPage } from "@/components/subpages/InspectorObservationsAndSourcesPage";
import { InspectorRelationshipsAndGraphPage } from "@/components/subpages/InspectorRelationshipsAndGraphPage";
import { InspectorSchemasPage } from "@/components/subpages/InspectorSchemasPage";
import { InspectorTimelinePage } from "@/components/subpages/InspectorTimelinePage";
import { InspectorConversationsPage } from "@/components/subpages/InspectorConversationsPage";
import { InspectorAgentsPage } from "@/components/subpages/InspectorAgentsPage";
import { InspectorSearchPage } from "@/components/subpages/InspectorSearchPage";
import { InspectorSettingsPage } from "@/components/subpages/InspectorSettingsPage";
import { InspectorSettingsConnectionPage } from "@/components/subpages/InspectorSettingsConnectionPage";
import { InspectorSettingsAttributionPolicyPage } from "@/components/subpages/InspectorSettingsAttributionPolicyPage";
import { InspectorSettingsRetentionPage } from "@/components/subpages/InspectorSettingsRetentionPage";
import { InspectorSettingsFeedbackPage } from "@/components/subpages/InspectorSettingsFeedbackPage";
import { InstallPage } from "@/components/subpages/InstallPage";
import { InstallManualPage } from "@/components/subpages/InstallManualPage";
import { InstallDockerPage } from "@/components/subpages/InstallDockerPage";
import { WhatToStorePage } from "@/components/subpages/WhatToStorePage";
import { BackupGuidePage } from "@/components/subpages/BackupGuidePage";
import { TunnelGuidePage } from "@/components/subpages/TunnelGuidePage";
import { SandboxLandingPage } from "@/components/subpages/SandboxLandingPage";
import { SandboxTermsOfUsePage } from "@/components/subpages/SandboxTermsOfUsePage";
import { HostedLandingPage } from "@/components/subpages/HostedLandingPage";
import { ConnectIndexPage } from "@/components/subpages/ConnectIndexPage";
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
import { NeotomaWithClaudeAgentSdkPage } from "@/components/subpages/NeotomaWithClaudeAgentSdkPage";
import { ChatGptConnectCustomGptPage } from "@/components/subpages/ChatGptConnectCustomGptPage";
import { ChatGptConnectRemoteMcpPage } from "@/components/subpages/ChatGptConnectRemoteMcpPage";
import { NeotomaWithChatGPTPage } from "@/components/subpages/NeotomaWithChatGPTPage";
import { NeotomaWithCodexPage } from "@/components/subpages/NeotomaWithCodexPage";
import { CodexConnectLocalStdioPage } from "@/components/subpages/CodexConnectLocalStdioPage";
import { CodexConnectRemoteHttpOauthPage } from "@/components/subpages/CodexConnectRemoteHttpOauthPage";
import { NeotomaWithOpenCodePage } from "@/components/subpages/NeotomaWithOpenCodePage";
import { NeotomaWithOpenClawPage } from "@/components/subpages/NeotomaWithOpenClawPage";
import { NeotomaWithIronClawPage } from "@/components/subpages/NeotomaWithIronClawPage";
import { OpenClawConnectLocalStdioPage } from "@/components/subpages/OpenClawConnectLocalStdioPage";
import { OpenClawConnectRemoteHttpPage } from "@/components/subpages/OpenClawConnectRemoteHttpPage";
import { MemoryGuaranteesPage } from "@/components/subpages/MemoryGuaranteesPage";
import { MemoryModelsPage } from "@/components/subpages/MemoryModelsPage";
import { DeterministicStateEvolutionPage } from "@/components/subpages/DeterministicStateEvolutionPage";
import { VersionedHistoryPage } from "@/components/subpages/VersionedHistoryPage";
import { ReplayableTimelinePage } from "@/components/subpages/ReplayableTimelinePage";
import { AuditableChangeLogPage } from "@/components/subpages/AuditableChangeLogPage";
import { SchemaConstraintsPage } from "@/components/subpages/SchemaConstraintsPage";
import { SilentMutationRiskPage } from "@/components/subpages/SilentMutationRiskPage";
import { ConflictingFactsRiskPage } from "@/components/subpages/ConflictingFactsRiskPage";
import { FalseClosureRiskPage } from "@/components/subpages/FalseClosureRiskPage";
import { ReproducibleStateReconstructionPage } from "@/components/subpages/ReproducibleStateReconstructionPage";
import { HumanInspectabilityPage } from "@/components/subpages/HumanInspectabilityPage";
import { ZeroSetupOnboardingPage } from "@/components/subpages/ZeroSetupOnboardingPage";
import { SemanticSimilaritySearchPage } from "@/components/subpages/SemanticSimilaritySearchPage";
import { DirectHumanEditabilityPage } from "@/components/subpages/DirectHumanEditabilityPage";
import { PlatformMemoryPage } from "@/components/subpages/PlatformMemoryPage";
import { RetrievalMemoryPage } from "@/components/subpages/RetrievalMemoryPage";
import { FileBasedMemoryPage } from "@/components/subpages/FileBasedMemoryPage";
import { DatabaseMemoryPage } from "@/components/subpages/DatabaseMemoryPage";
import { DeterministicMemoryPage } from "@/components/subpages/DeterministicMemoryPage";
import { MemoryVendorsPage } from "@/components/subpages/MemoryVendorsPage";
import { FoundationsPage } from "@/components/subpages/FoundationsPage";
import { SchemaManagementPage } from "@/components/subpages/SchemaManagementPage";
import { TroubleshootingPage } from "@/components/subpages/TroubleshootingPage";
import { ChangelogPage } from "@/components/subpages/ChangelogPage";
import { CrmLandingPage } from "@/components/subpages/CrmLandingPage";
import { ComplianceLandingPage } from "@/components/subpages/ComplianceLandingPage";
import { ContractsLandingPage } from "@/components/subpages/ContractsLandingPage";
import { DiligenceLandingPage } from "@/components/subpages/DiligenceLandingPage";
import { PortfolioLandingPage } from "@/components/subpages/PortfolioLandingPage";
import { CasesLandingPage } from "@/components/subpages/CasesLandingPage";
import { FinancialOpsLandingPage } from "@/components/subpages/FinancialOpsLandingPage";
import { ProcurementLandingPage } from "@/components/subpages/ProcurementLandingPage";
import { AgentAuthLandingPage } from "@/components/subpages/AgentAuthLandingPage";
import { HealthcareLandingPage } from "@/components/subpages/HealthcareLandingPage";
import { GovTechLandingPage } from "@/components/subpages/GovTechLandingPage";
import { CustomerOpsLandingPage } from "@/components/subpages/CustomerOpsLandingPage";
import { LogisticsLandingPage } from "@/components/subpages/LogisticsLandingPage";
import { PersonalDataLandingPage } from "@/components/subpages/PersonalDataLandingPage";
import { TradingLandingPage } from "@/components/subpages/TradingLandingPage";
import { UseCasesIndexPage } from "@/components/subpages/UseCasesIndexPage";
import { CryptoEngineeringLandingPage } from "@/components/subpages/CryptoEngineeringLandingPage";
import { BuildVsBuyPage } from "@/components/subpages/BuildVsBuyPage";
import { MultiAgentStatePage } from "@/components/subpages/MultiAgentStatePage";
import { EvaluatePage } from "@/components/subpages/EvaluatePage";
import { EvaluateAgentInstructionsPage } from "@/components/subpages/EvaluateAgentInstructionsPage";
import { MeetPage } from "@/components/subpages/MeetPage";
import { PrivacyPage } from "@/components/subpages/PrivacyPage";
import { TermsPage } from "@/components/subpages/TermsPage";

import { FaqPage } from "@/components/subpages/FaqPage";
import {
  NeotomaVsMem0Page,
  NeotomaVsZepPage,
  NeotomaVsRagPage,
  NeotomaVsPlatformMemoryPage,
  NeotomaVsFilePage,
  NeotomaVsDatabasePage,
} from "@/components/subpages/ComparisonPage";
import { RawSiteMarkdownPage } from "@/components/subpages/RawSiteMarkdownPage";
import { SiteMarkdownHubPage } from "@/components/subpages/SiteMarkdownHubPage";
import { SiteMarkdownMirrorPage } from "@/components/subpages/SiteMarkdownMirrorPage";
import { DeveloperWalkthroughPage } from "@/components/subpages/DeveloperWalkthroughPage";
import { EntityTypeGuideRouter } from "@/components/subpages/EntityTypeGuidePage";
import {
  PrimitiveRecordTypeRouter,
  PrimitivesIndexPage,
} from "@/components/subpages/PrimitiveRecordTypePage";
import {
  SchemaConceptRouter,
  SchemasIndexPage,
} from "@/components/subpages/SchemaConceptPage";
import { sendPageView } from "@/utils/analytics";
import { DEFAULT_LOCALE, isSupportedLocale, NON_DEFAULT_LOCALES } from "@/i18n/config";
import {
  getLocaleFromPath,
  localizePath,
  normalizeToDefaultRoute,
  resolvePreferredLocale,
  stripLocaleFromPath,
} from "@/i18n/routing";

type AppRoute = {
  path: string;
  element: JSX.Element;
};

const APP_ROUTES: readonly AppRoute[] = [
  { path: "/", element: <SitePage /> },
  { path: "/home-2", element: <SitePageHome2 /> },
  { path: "/home/x7k9m2vp", element: <SitePageAlt /> },
  { path: "/terminology", element: <TerminologyPage /> },
  { path: "/agent-instructions", element: <AgentInstructionsPage /> },
  { path: "/agent-instructions/store-recipes", element: <AgentInstructionsStoreRecipesPage /> },
  { path: "/agent-instructions/retrieval-provenance", element: <AgentInstructionsRetrievalPage /> },
  { path: "/agent-instructions/display-conventions", element: <AgentInstructionsDisplayPage /> },
  { path: "/api", element: <ApiReferencePage /> },
  { path: "/mcp", element: <McpReferencePage /> },
  { path: "/cli", element: <CliReferencePage /> },
  { path: "/aauth", element: <AauthReferencePage /> },
  { path: "/aauth/spec", element: <AauthSpecPage /> },
  { path: "/aauth/attestation", element: <AauthAttestationPage /> },
  { path: "/aauth/cli-keys", element: <AauthCliKeysPage /> },
  { path: "/aauth/integration", element: <AauthIntegrationPage /> },
  { path: "/aauth/capabilities", element: <AauthCapabilitiesPage /> },
  { path: "/inspector", element: <InspectorReferencePage /> },
  { path: "/inspector/dashboard", element: <InspectorDashboardPage /> },
  { path: "/inspector/entities", element: <InspectorEntitiesPage /> },
  {
    path: "/inspector/observations-and-sources",
    element: <InspectorObservationsAndSourcesPage />,
  },
  {
    path: "/inspector/relationships-and-graph",
    element: <InspectorRelationshipsAndGraphPage />,
  },
  { path: "/inspector/schemas", element: <InspectorSchemasPage /> },
  { path: "/inspector/timeline", element: <InspectorTimelinePage /> },
  { path: "/inspector/conversations", element: <InspectorConversationsPage /> },
  { path: "/inspector/agents", element: <InspectorAgentsPage /> },
  { path: "/inspector/search", element: <InspectorSearchPage /> },
  {
    path: "/inspector/search-and-settings",
    element: <Navigate to="/inspector/settings" replace />,
  },
  { path: "/inspector/feedback", element: <InspectorSettingsFeedbackPage /> },
  { path: "/inspector/settings", element: <InspectorSettingsPage /> },
  {
    path: "/inspector/settings/connection",
    element: <InspectorSettingsConnectionPage />,
  },
  {
    path: "/inspector/settings/attribution-policy",
    element: <InspectorSettingsAttributionPolicyPage />,
  },
  {
    path: "/inspector/settings/retention",
    element: <InspectorSettingsRetentionPage />,
  },
  {
    path: "/inspector/settings/feedback",
    element: <Navigate to="/inspector/feedback" replace />,
  },
  { path: "/install", element: <InstallPage /> },
  { path: "/install/manual", element: <InstallManualPage /> },
  { path: "/install/docker", element: <InstallDockerPage /> },
  { path: "/what-to-store", element: <WhatToStorePage /> },
  { path: "/backup", element: <BackupGuidePage /> },
  { path: "/tunnel", element: <TunnelGuidePage /> },
  { path: "/sandbox", element: <SandboxLandingPage /> },
  { path: "/sandbox/terms-of-use", element: <SandboxTermsOfUsePage /> },
  { path: "/hosted", element: <HostedLandingPage /> },
  { path: "/connect", element: <ConnectIndexPage /> },
  { path: "/walkthrough", element: <DeveloperWalkthroughPage /> },
  { path: "/developer-walkthrough", element: <Navigate to="/walkthrough" replace /> },
  { path: "/data-model", element: <Navigate to="/walkthrough" replace /> },
  { path: "/architecture", element: <ArchitecturePage /> },
  { path: "/schema-management", element: <SchemaManagementPage /> },
  { path: "/troubleshooting", element: <TroubleshootingPage /> },
  { path: "/changelog", element: <ChangelogPage /> },
  { path: "/operating", element: <AiNativeOperatorsPage /> },
  { path: "/building-pipelines", element: <AgenticSystemsBuildersPage /> },
  { path: "/debugging-infrastructure", element: <AiInfrastructureEngineersPage /> },
  { path: "/ai-native-operators", element: <Navigate to="/operating" replace /> },
  { path: "/agentic-systems-builders", element: <Navigate to="/building-pipelines" replace /> },
  { path: "/ai-infrastructure-engineers", element: <Navigate to="/debugging-infrastructure" replace /> },
  { path: "/docs", element: <DocsIndexPage /> },
  { path: "/neotoma-with-cursor", element: <NeotomaWithCursorPage /> },
  { path: "/neotoma-with-claude", element: <NeotomaWithClaudePage /> },
  { path: "/neotoma-with-claude-connect-desktop", element: <ClaudeConnectDesktopPage /> },
  { path: "/neotoma-with-claude-connect-remote-mcp", element: <ClaudeConnectRemoteMcpPage /> },
  { path: "/neotoma-with-claude-code", element: <NeotomaWithClaudeCodePage /> },
  { path: "/neotoma-with-claude-agent-sdk", element: <NeotomaWithClaudeAgentSdkPage /> },
  { path: "/neotoma-with-chatgpt", element: <NeotomaWithChatGPTPage /> },
  { path: "/neotoma-with-chatgpt-connect-remote-mcp", element: <ChatGptConnectRemoteMcpPage /> },
  { path: "/neotoma-with-chatgpt-connect-custom-gpt", element: <ChatGptConnectCustomGptPage /> },
  { path: "/neotoma-with-codex", element: <NeotomaWithCodexPage /> },
  { path: "/neotoma-with-codex-connect-local-stdio", element: <CodexConnectLocalStdioPage /> },
  { path: "/neotoma-with-codex-connect-remote-http-oauth", element: <CodexConnectRemoteHttpOauthPage /> },
  { path: "/neotoma-with-opencode", element: <NeotomaWithOpenCodePage /> },
  { path: "/neotoma-with-openclaw", element: <NeotomaWithOpenClawPage /> },
  { path: "/neotoma-with-ironclaw", element: <NeotomaWithIronClawPage /> },
  { path: "/neotoma-with-openclaw-connect-local-stdio", element: <OpenClawConnectLocalStdioPage /> },
  { path: "/neotoma-with-openclaw-connect-remote-http", element: <OpenClawConnectRemoteHttpPage /> },
  { path: "/memory-guarantees", element: <MemoryGuaranteesPage /> },
  { path: "/deterministic-state-evolution", element: <DeterministicStateEvolutionPage /> },
  { path: "/versioned-history", element: <VersionedHistoryPage /> },
  { path: "/replayable-timeline", element: <ReplayableTimelinePage /> },
  { path: "/auditable-change-log", element: <AuditableChangeLogPage /> },
  { path: "/schema-constraints", element: <SchemaConstraintsPage /> },
  { path: "/silent-mutation-risk", element: <SilentMutationRiskPage /> },
  { path: "/conflicting-facts-risk", element: <ConflictingFactsRiskPage /> },
  { path: "/false-closure-risk", element: <FalseClosureRiskPage /> },
  { path: "/reproducible-state-reconstruction", element: <ReproducibleStateReconstructionPage /> },
  { path: "/human-inspectability", element: <HumanInspectabilityPage /> },
  { path: "/zero-setup-onboarding", element: <ZeroSetupOnboardingPage /> },
  { path: "/semantic-similarity-search", element: <SemanticSimilaritySearchPage /> },
  { path: "/direct-human-editability", element: <DirectHumanEditabilityPage /> },
  { path: "/memory-models", element: <MemoryModelsPage /> },
  { path: "/platform-memory", element: <PlatformMemoryPage /> },
  { path: "/retrieval-memory", element: <RetrievalMemoryPage /> },
  { path: "/file-based-memory", element: <FileBasedMemoryPage /> },
  { path: "/database-memory", element: <DatabaseMemoryPage /> },
  { path: "/deterministic-memory", element: <DeterministicMemoryPage /> },
  { path: "/memory-vendors", element: <MemoryVendorsPage /> },
  { path: "/crm", element: <CrmLandingPage /> },
  { path: "/compliance", element: <ComplianceLandingPage /> },
  { path: "/contracts", element: <ContractsLandingPage /> },
  { path: "/diligence", element: <DiligenceLandingPage /> },
  { path: "/portfolio", element: <PortfolioLandingPage /> },
  { path: "/cases", element: <CasesLandingPage /> },
  { path: "/financial-ops", element: <FinancialOpsLandingPage /> },
  { path: "/procurement", element: <ProcurementLandingPage /> },
  { path: "/agent-auth", element: <AgentAuthLandingPage /> },
  { path: "/healthcare", element: <HealthcareLandingPage /> },
  { path: "/government", element: <GovTechLandingPage /> },
  { path: "/customer-ops", element: <CustomerOpsLandingPage /> },
  { path: "/logistics", element: <LogisticsLandingPage /> },
  { path: "/personal-data", element: <PersonalDataLandingPage /> },
  { path: "/trading", element: <TradingLandingPage /> },
  { path: "/crypto-engineering", element: <CryptoEngineeringLandingPage /> },
  { path: "/use-cases", element: <UseCasesIndexPage /> },
  { path: "/verticals", element: <Navigate to="/use-cases" replace /> },
  { path: "/build-vs-buy", element: <BuildVsBuyPage /> },
  { path: "/multi-agent-state", element: <MultiAgentStatePage /> },
  { path: "/evaluate", element: <EvaluatePage /> },
  { path: "/evaluate/agent-instructions", element: <EvaluateAgentInstructionsPage /> },

  { path: "/meet", element: <MeetPage /> },
  { path: "/privacy", element: <PrivacyPage /> },
  { path: "/terms", element: <TermsPage /> },
  { path: "/faq", element: <FaqPage /> },
  { path: "/neotoma-vs-platform-memory", element: <NeotomaVsPlatformMemoryPage /> },
  { path: "/neotoma-vs-mem0", element: <NeotomaVsMem0Page /> },
  { path: "/neotoma-vs-zep", element: <NeotomaVsZepPage /> },
  { path: "/neotoma-vs-rag", element: <NeotomaVsRagPage /> },
  { path: "/neotoma-vs-files", element: <NeotomaVsFilePage /> },
  { path: "/neotoma-vs-database", element: <NeotomaVsDatabasePage /> },
  { path: "/foundations", element: <FoundationsPage /> },
  { path: "/site-markdown", element: <SiteMarkdownHubPage /> },
  { path: "/raw", element: <RawSiteMarkdownPage /> },
  { path: "/privacy-first", element: <Navigate to="/foundations#privacy-first" replace /> },
  { path: "/cross-platform", element: <Navigate to="/foundations#cross-platform" replace /> },
  { path: "/types/:slug", element: <EntityTypeGuideRouter /> },
  { path: "/primitives", element: <PrimitivesIndexPage /> },
  { path: "/primitives/:slug", element: <PrimitiveRecordTypeRouter /> },
  { path: "/schemas", element: <SchemasIndexPage /> },
  { path: "/schemas/:slug", element: <SchemaConceptRouter /> },
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
  "/neotoma-with-opencode": <NeotomaWithOpenCodePage />,
  "/neotoma-with-openclaw": <NeotomaWithOpenClawPage />,
  "/neotoma-with-ironclaw": <NeotomaWithIronClawPage />,
};

function getRootElement(): JSX.Element {
  if (typeof window === "undefined") return <SitePage staticMode />;
  const segment = window.location.pathname.replace(/^\//, "").split("/")[0] ?? "";
  const basename = segment ? `/${segment}` : "";
  return BASENAME_TO_ROOT_PAGE[basename] ?? <SitePage />;
}

/**
 * Explicit `/${locale}/…` paths so segments like `markdown` are never captured as a locale.
 * (React Router ranks `/:locale/page` above `/markdown/*` when both match.)
 */
function getLocalizedRoutePaths(routePath: string): string[] {
  if (routePath === "/") {
    return NON_DEFAULT_LOCALES.map((locale) => `/${locale}`);
  }
  return NON_DEFAULT_LOCALES.map((locale) => `/${locale}${routePath}`);
}

function LocaleSiteRedirect() {
  const { pathname } = useLocation();
  const locale = getLocaleFromPath(pathname) ?? DEFAULT_LOCALE;
  const resolvedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  return <Navigate to={localizePath("/", resolvedLocale)} replace />;
}

function LocalizedRouteGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const locale = getLocaleFromPath(pathname);
  if (!locale || !isSupportedLocale(locale)) {
    return <NotFound />;
  }
  return <>{children}</>;
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

    const stripped = stripLocaleFromPath(location.pathname);
    if (stripped === "/markdown" || stripped.startsWith("/markdown/")) {
      const localized = localizePath(stripped, preferredLocale);
      const target = `${localized}${location.hash || ""}`;
      if (target !== `${location.pathname}${location.hash || ""}`) {
        navigate(target, { replace: true });
      }
      return;
    }

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
        <Route path="/docker" element={<Navigate to="/install/docker" replace />} />
        {NON_DEFAULT_LOCALES.map((locale) => (
          <Route
            key={`${locale}/site`}
            path={`/${locale}/site`}
            element={
              <LocalizedRouteGuard>
                <LocaleSiteRedirect />
              </LocalizedRouteGuard>
            }
          />
        ))}
        <Route path="/" element={getRootElement()} />
        {APP_ROUTES.filter((r) => r.path !== "/").map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="/markdown/*" element={<SiteMarkdownMirrorPage />} />
        {NON_DEFAULT_LOCALES.map((locale) => (
          <Route
            key={`${locale}/markdown/*`}
            path={`/${locale}/markdown/*`}
            element={
              <LocalizedRouteGuard>
                <SiteMarkdownMirrorPage />
              </LocalizedRouteGuard>
            }
          />
        ))}
        {APP_ROUTES.flatMap((route) =>
          getLocalizedRoutePaths(route.path).map((localizedPath) => (
            <Route
              key={`localized:${route.path}:${localizedPath}`}
              path={localizedPath}
              element={
                <LocalizedRouteGuard>
                  {route.path === "/" ? getRootElement() : route.element}
                </LocalizedRouteGuard>
              }
            />
          )),
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
