/**
 * Main Application View (FU-301, FU-302, FU-303, FU-305, FU-601)
 * 
 * Navigation between all MVP features using main objects with sidebar navigation,
 * breadcrumbs, and scroll position restoration.
 */

import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { SourceTable } from "@/components/SourceTable";
import { SourceDetail } from "@/components/SourceDetail";
import { EntityList } from "@/components/EntityList";
import { EntityDetail } from "@/components/EntityDetail";
import { TimelineView } from "@/components/TimelineView";
import { FileUploadView } from "@/components/FileUploadView";
import { InterpretationList } from "@/components/InterpretationList";
import { ObservationList } from "@/components/ObservationList";
import { SearchResults } from "@/components/SearchResults";
import { DashboardPage } from "@/components/DashboardPage";
import { AboutPage } from "@/components/AboutPage";
import { MCPCursorPage } from "@/components/MCPCursorPage";
import { MCPChatGPTPage } from "@/components/MCPChatGPTPage";
import { MCPClaudePage } from "@/components/MCPClaudePage";
import { MCPContinuePage } from "@/components/MCPContinuePage";
import { MCPGitHubCopilotPage } from "@/components/MCPGitHubCopilotPage";
import { MCPVSCodePage } from "@/components/MCPVSCodePage";
import { MCPGeminiPage } from "@/components/MCPGeminiPage";
import { MCPGrokPage } from "@/components/MCPGrokPage";
import { MCPManusPage } from "@/components/MCPManusPage";
import { MCPWindsurfPage } from "@/components/MCPWindsurfPage";
import { MCPJetBrainsPage } from "@/components/MCPJetBrainsPage";
import { MCPCodeiumPage } from "@/components/MCPCodeiumPage";
import { IntegrationsPage } from "@/components/IntegrationsPage";
import { OAuthPage } from "@/components/OAuthPage";
import { SchemaList } from "@/components/SchemaList";
import { SchemaDetail } from "@/components/SchemaDetail";
import { RelationshipList } from "@/components/RelationshipList";
import { RelationshipDetail } from "@/components/RelationshipDetail";
import { NotFound } from "@/components/NotFound";
import { OAuthConsentPage } from "@/components/OAuthConsentPage";
import { DesignSystemRouter } from "@/components/design-system/DesignSystemRouter";
import { Layout } from "@/components/Layout";
import { SignInPage } from "@/components/auth/SignInPage";
import { SignUpPage } from "@/components/auth/SignUpPage";
import { ResetPasswordPage } from "@/components/auth/ResetPasswordPage";
import { AuthCallback } from "@/components/auth/AuthCallback";
import { DocumentationApp } from "@/docs/DocumentationApp";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Route wrapper for source detail view
 * Extracts ID from route params and navigates to sources list if no ID provided
 */
function SourceDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    navigate("/sources");
    return null;
  }
  
  return (
    <SourceDetail
      sourceId={id}
      onClose={() => navigate("/sources")}
    />
  );
}

/**
 * Route wrapper for entity detail view
 * Extracts ID from route params and navigates to entities list if no ID provided
 */
function EntityDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    navigate("/");
    return null;
  }
  
  const handleNavigateToSource = (sourceId: string) => {
    navigate(`/sources/${sourceId}`);
  };

  const handleNavigateToEntity = (entityId: string) => {
    navigate(`/entity/${entityId}`);
  };
  
  return (
    <EntityDetail
      entityId={id}
      onClose={() => navigate("/")}
      onNavigateToSource={handleNavigateToSource}
      onNavigateToEntity={handleNavigateToEntity}
    />
  );
}

/**
 * Route wrapper for schema detail view
 * Extracts entity type from route params and navigates to schemas list if no type provided
 */
function SchemaDetailRoute() {
  const { entityType } = useParams<{ entityType: string }>();
  const navigate = useNavigate();
  
  if (!entityType) {
    navigate("/schemas");
    return null;
  }
  
  return (
    <SchemaDetail
      entityType={decodeURIComponent(entityType)}
      onClose={() => navigate("/schemas")}
    />
  );
}

/**
 * Route wrapper for relationship detail view
 * Extracts ID from route params and navigates to relationships list if no ID provided
 */
function RelationshipDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  if (!id) {
    navigate("/relationships");
    return null;
  }
  
  const handleNavigateToEntity = (entityId: string) => {
    navigate(`/entity/${entityId}`);
  };
  
  return (
    <RelationshipDetail
      relationshipId={id}
      onClose={() => navigate("/relationships")}
      onNavigateToEntity={handleNavigateToEntity}
    />
  );
}

/**
 * Main application component with sidebar navigation and breadcrumbs
 * 
 * Features:
 * - Sidebar navigation with Entities (home), Sources, Interpretations, Observations, Timeline
 * - Dynamic breadcrumbs with custom labels for detail routes
 * - Scroll position restoration when navigating
 * - User actions in header (email, MCP Setup, Sign Out)
 * - Upload functionality integrated into Sources page
 */
export function MainApp() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [universalSearchQuery, setUniversalSearchQuery] = useState("");

  // Keyboard shortcut to navigate to design system preview (Ctrl/Cmd + Shift + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
        e.preventDefault();
        const isDesignSystem = location.pathname.startsWith("/design-system");
        navigate(isDesignSystem ? "/" : "/design-system");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [location.pathname, navigate]);

  const handleNavigateToSource = (sourceId: string) => {
    navigate(`/sources/${sourceId}`);
  };

  const handleNavigateToEntity = (entityId: string) => {
    navigate(`/entity/${entityId}`);
  };

  const handleUploadComplete = (sourceIds: string[]) => {
    // After upload, close dialog and refresh sources view
    setUploadDialogOpen(false);
    // Optionally navigate to a specific source or refresh the list
    if (sourceIds.length > 0) {
      navigate(`/sources/${sourceIds[0]}`);
    } else {
      navigate("/sources");
    }
  };

  const handleOpenUpload = () => {
    setUploadDialogOpen(true);
  };

  const handleUniversalSearch = (query: string) => {
    setUniversalSearchQuery(query);
    // TODO: Implement universal search across entities, sources, observations, etc.
    // For now, just update the state to pass to child components
  };

  // Menu items for sidebar navigation (now handled in sidebar directly)
  interface MenuItem {
    path: string;
    label: string;
    icon: LucideIcon;
  }
  const menuItems: MenuItem[] = [];

  // Route name mapping for breadcrumbs
  const routeNames = {
    "": "Neotoma", // Root path
    "/": "Neotoma", // Alternative root path key
    about: "About",
    sources: "Sources",
    entities: "Entities",
    interpretations: "Interpretations",
    observations: "Observations",
    schemas: "Schemas",
    relationships: "Relationships",
    timeline: "Timeline",
    oauth: "OAuth",
    search: "Search",
    integrations: "Integrations",
    "design-system": "Design System",
    docs: "Documentation",
    signin: "Sign in",
    signup: "Create account",
    "reset-password": "Reset password",
    "mcp/cursor": "Cursor Setup",
    "mcp/chatgpt": "ChatGPT Setup",
    "mcp/claude": "Claude Setup",
  };

  // Custom breadcrumb labels for dynamic routes
  const getBreadcrumbLabel = (pathname: string, params: Record<string, string | undefined>): string | null => {
    // For entity detail pages, we'll fetch the entity type asynchronously
    // This function is called synchronously, so we return null and handle async loading in Layout
    if (pathname.startsWith("/entity/") && params.id) {
      // Return a placeholder - Layout will fetch the actual label
      return null;
    }
    
    return null;
  };

  // Sidebar footer actions (now handled in sidebar directly)
  const sidebarFooterActions = null;

  return (
    <Layout
      siteName="Neotoma"
      menuItems={menuItems}
      routeNames={routeNames}
      getBreadcrumbLabel={getBreadcrumbLabel}
      sidebarFooterActions={sidebarFooterActions}
      accountEmail={user?.email}
      onSearch={handleUniversalSearch}
      onSignOut={signOut}
    >
      <Routes>
        <Route
          path="/"
          element={<DashboardPage />}
        />
        <Route
          path="/about"
          element={<AboutPage />}
        />
        <Route
          path="/integrations"
          element={<IntegrationsPage />}
        />
        <Route
          path="/mcp/cursor"
          element={<MCPCursorPage />}
        />
        <Route
          path="/mcp/chatgpt"
          element={<MCPChatGPTPage />}
        />
        <Route
          path="/mcp/claude"
          element={<MCPClaudePage />}
        />
        <Route
          path="/mcp/continue"
          element={<MCPContinuePage />}
        />
        <Route
          path="/mcp/copilot"
          element={<MCPGitHubCopilotPage />}
        />
        <Route
          path="/mcp/vscode"
          element={<MCPVSCodePage />}
        />
        <Route
          path="/mcp/gemini"
          element={<MCPGeminiPage />}
        />
        <Route
          path="/mcp/grok"
          element={<MCPGrokPage />}
        />
        <Route
          path="/mcp/manus"
          element={<MCPManusPage />}
        />
        <Route
          path="/mcp/windsurf"
          element={<MCPWindsurfPage />}
        />
        <Route
          path="/mcp/jetbrains"
          element={<MCPJetBrainsPage />}
        />
        <Route
          path="/mcp/codeium"
          element={<MCPCodeiumPage />}
        />
        <Route
          path="/oauth"
          element={<OAuthPage />}
        />
        <Route
          path="/mcp-setup"
          element={<Navigate to="/oauth" replace />}
        />
        <Route
          path="/sources"
          element={
            <SourceTable
              onSourceClick={(source) => navigate(`/sources/${source.id}`)}
              onFileUpload={handleOpenUpload}
              searchQuery={universalSearchQuery}
            />
          }
        />
        <Route
          path="/sources/:id"
          element={<SourceDetailRoute />}
        />
        <Route
          path="/entities"
          element={<Navigate to="/" replace />}
        />
        <Route
          path="/entities/:type"
          element={
            <EntityList
              onEntityClick={(entity) => navigate(`/entity/${entity.entity_id || entity.id || ""}`)}
              searchQuery={universalSearchQuery}
            />
          }
        />
        <Route
          path="/entity/:id"
          element={<EntityDetailRoute />}
        />
        <Route
          path="/interpretations"
          element={
            <InterpretationList
              onInterpretationClick={(interpretation) => {
                // Navigate to source detail to see interpretation
                navigate(`/sources/${interpretation.source_id}`);
              }}
              onNavigateToSource={handleNavigateToSource}
              searchQuery={universalSearchQuery}
            />
          }
        />
        <Route
          path="/observations"
          element={
            <ObservationList
              onObservationClick={(observation) => {
                // Navigate to entity detail to see observation
                navigate(`/entity/${observation.entity_id}`);
              }}
              onNavigateToSource={handleNavigateToSource}
              onNavigateToEntity={handleNavigateToEntity}
              searchQuery={universalSearchQuery}
            />
          }
        />
        <Route
          path="/schemas"
          element={
            <SchemaList
              onSchemaClick={(schema) => navigate(`/schemas/${encodeURIComponent(schema.entity_type)}`)}
            />
          }
        />
        <Route
          path="/schemas/:entityType"
          element={<SchemaDetailRoute />}
        />
        <Route
          path="/relationships"
          element={
            <RelationshipList
              onRelationshipClick={(relationship) => navigate(`/relationships/${relationship.id}`)}
              onNavigateToEntity={handleNavigateToEntity}
            />
          }
        />
        <Route
          path="/relationships/:id"
          element={<RelationshipDetailRoute />}
        />
        <Route
          path="/timeline"
          element={
            <TimelineView
              onNavigateToSource={handleNavigateToSource}
              onNavigateToEntity={handleNavigateToEntity}
            />
          }
        />
        <Route
          path="/search"
          element={<SearchResults />}
        />
        <Route
          path="/signin"
          element={<SignInPage />}
        />
        <Route
          path="/signup"
          element={<SignUpPage />}
        />
        <Route
          path="/reset-password"
          element={<ResetPasswordPage />}
        />
        <Route
          path="/auth/callback"
          element={<AuthCallback />}
        />
        <Route
          path="/oauth/consent"
          element={<OAuthConsentPage />}
        />
        <Route
          path="/design-system/*"
          element={<DesignSystemRouter />}
        />
        <Route
          path="/docs/*"
          element={<DocumentationApp />}
        />
        <Route
          path="*"
          element={<NotFound />}
        />
      </Routes>
      
      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          <FileUploadView onUploadComplete={handleUploadComplete} hideTitle={true} />
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
