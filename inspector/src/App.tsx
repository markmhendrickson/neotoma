import { lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/app_layout";

const HomePage = lazy(() => import("@/pages/home"));
const FaqPage = lazy(() => import("@/pages/faq"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const DocsPage = lazy(() => import("@/pages/docs"));
const SearchPage = lazy(() => import("@/pages/search"));
const EntityTypesPage = lazy(() => import("@/pages/entity_types"));
const EntitiesPage = lazy(() => import("@/pages/entities"));

const EntitySegmentPage = lazy(() => import("@/pages/entity_segment_page"));
const EntityCorrectPage = lazy(() => import("@/pages/entity_correct"));
const EntityTimelinePage = lazy(() => import("@/pages/entity_timeline"));
const EntityHistoryPage = lazy(() => import("@/pages/entity_history"));
const EntityRelationshipsByTypePage = lazy(
  () => import("@/pages/entity_relationships_by_type"),
);
const ObservationsPage = lazy(() => import("@/pages/observations"));
const SourcesPage = lazy(() => import("@/pages/sources"));
const SourceDetailPage = lazy(() => import("@/pages/source_detail"));
const RelationshipsPage = lazy(() => import("@/pages/relationships"));
const RelationshipDetailPage = lazy(() => import("@/pages/relationship_detail"));
const GraphExplorerPage = lazy(() => import("@/pages/graph_explorer"));
const SchemasPage = lazy(() => import("@/pages/schemas"));
const SchemaDetailPage = lazy(() => import("@/pages/schema_detail"));
const TimelinePage = lazy(() => import("@/pages/timeline"));
const TimelineEventDetailPage = lazy(() => import("@/pages/timeline_event_detail"));
const RecentActivityPage = lazy(() => import("@/pages/recent_activity"));
const IssuesPage = lazy(() => import("@/pages/issues"));
const IssueDetailPage = lazy(() => import("@/pages/issue_detail"));
const RecentConversationsPage = lazy(() => import("@/pages/recent_conversations"));
const ConversationDetailPage = lazy(() => import("@/pages/conversation_detail"));
const TurnsPage = lazy(() => import("@/pages/turns"));
const TurnDetailPage = lazy(() => import("@/pages/turn_detail"));
const InterpretationsPage = lazy(() => import("@/pages/interpretations"));
const AgentsPage = lazy(() => import("@/pages/agents"));
const AgentDetailPage = lazy(() => import("@/pages/agent_detail"));
const AgentGrantsPage = lazy(() => import("@/pages/agent_grants"));
const AgentGrantDetailPage = lazy(() => import("@/pages/agent_grant_detail"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const SandboxPage = lazy(() => import("@/pages/sandbox"));
const ComplianceDashboardPage = lazy(() => import("@/pages/compliance"));
const AccessPoliciesPage = lazy(() => import("@/pages/access_policies"));
const SubscriptionsPage = lazy(() => import("@/pages/subscriptions"));
const PeersPage = lazy(() => import("@/pages/peers"));
const PeerDetailPage = lazy(() => import("@/pages/peer_detail"));
const DesignPage = lazy(() => import("@/pages/design"));
const NotFoundPage = lazy(() => import("@/pages/not_found"));

function InspectorRedirect() {
  const location = useLocation();
  const subPath = location.pathname.replace(/^\/inspector\/?/, "/");
  const target = subPath === "/" ? "/analytics" : subPath;
  return <Navigate to={target + location.search + location.hash} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/analytics" element={<DashboardPage />} />
        <Route path="/dashboard" element={<Navigate to="/analytics" replace />} />
        <Route path="/usage" element={<Navigate to="/analytics" replace />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/*" element={<DocsPage />} />
        <Route path="/search/:query" element={<SearchPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/entity-types" element={<EntityTypesPage />} />
        <Route path="/entities" element={<EntitiesPage />} />
        <Route path="/entities/:segment/correct" element={<EntityCorrectPage />} />
        <Route path="/entities/:segment/history" element={<EntityHistoryPage />} />
        <Route path="/entities/:segment/timeline" element={<EntityTimelinePage />} />
        <Route
          path="/entities/:segment/relationships/:relationshipType/:relatedEntityType"
          element={<EntityRelationshipsByTypePage />}
        />
        <Route path="/entities/:segment" element={<EntitySegmentPage />} />
        <Route path="/observations" element={<ObservationsPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/sources/:id" element={<SourceDetailPage />} />
        <Route path="/relationships" element={<RelationshipsPage />} />
        <Route path="/relationships/:key" element={<RelationshipDetailPage />} />
        <Route path="/graph" element={<GraphExplorerPage />} />
        <Route path="/schemas" element={<SchemasPage />} />
        <Route path="/schemas/:entityType" element={<SchemaDetailPage />} />
        <Route path="/activity" element={<RecentActivityPage />} />
        <Route path="/feedback" element={<Navigate to="/issues" replace />} />
        <Route path="/feedback/admin-unlock" element={<Navigate to="/issues" replace />} />
        <Route path="/issues" element={<IssuesPage />} />
        <Route path="/issues/:number" element={<IssueDetailPage />} />
        <Route path="/conversations/:conversationId" element={<ConversationDetailPage />} />
        <Route path="/conversations" element={<RecentConversationsPage />} />
        <Route path="/turns" element={<TurnsPage />} />
        <Route path="/turns/:turnKey" element={<TurnDetailPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/timeline/:id" element={<TimelineEventDetailPage />} />
        <Route path="/interpretations" element={<InterpretationsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/grants" element={<AgentGrantsPage />} />
        <Route path="/agents/grants/:id" element={<AgentGrantDetailPage />} />
        <Route path="/agents/:key" element={<AgentDetailPage />} />
        <Route path="/design" element={<DesignPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sandbox" element={<SandboxPage />} />
        <Route path="/access-policies" element={<AccessPoliciesPage />} />
        <Route path="/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/peers" element={<PeersPage />} />
        <Route path="/peers/:peerId" element={<PeerDetailPage />} />
        <Route path="/compliance" element={<ComplianceDashboardPage />} />
        <Route path="/inspector" element={<InspectorRedirect />} />
        <Route path="/inspector/*" element={<InspectorRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
