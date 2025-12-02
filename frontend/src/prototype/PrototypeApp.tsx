import { useState, useEffect, useCallback, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecordsTable } from "@/components/RecordsTable";
import { RecordDetailsPanel } from "@/components/RecordDetailsPanel";
import { TimelineView } from "@/prototype/components/TimelineView";
import { Dashboard } from "@/prototype/components/Dashboard";
import { MockUploadUI } from "@/prototype/components/MockUploadUI";
import { MockChatPanel } from "@/prototype/components/MockChatPanel";
import { SettingsView } from "@/prototype/components/SettingsView";
import { EntityExplorerView } from "@/prototype/components/EntityExplorerView";
import { normalizeRecord, type NeotomaRecord } from "@/types/record";
import { useToast } from "@/components/ui/use-toast";
import { recordMatchesQuery } from "@/utils/record_search";
import {
  FIXTURE_RECORDS,
  getRecordTypes,
  getRecordById,
} from "@/prototype/fixtures/records";
import { FIXTURE_EVENTS } from "@/prototype/fixtures/events";
import { FIXTURE_ENTITIES } from "@/prototype/fixtures/entities";
import {
  Table2,
  Calendar,
  Users,
  Info,
  Sparkles,
  FileText,
  TrendingUp,
  LayoutDashboard,
  Upload,
  MessageSquare,
  Settings,
} from "lucide-react";

type View =
  | "dashboard"
  | "records"
  | "timeline"
  | "entities"
  | "upload"
  | "chat"
  | "settings";

/**
 * Comprehensive Interactive MVP Prototype
 *
 * Demonstrates ALL MVP features from docs/specs/MVP_OVERVIEW.md and MVP_FEATURE_UNITS.md:
 * - Dashboard (FU-305)
 * - Records List & Detail (FU-301, FU-302)
 * - Timeline View (FU-303)
 * - Entity Explorer (FU-601)
 * - Upload UI with bulk upload (FU-304)
 * - Chat/AI Panel (FU-307)
 * - Settings (FU-306)
 * - All states (loading, error, empty)
 */
function PrototypeApp() {
  const { toast } = useToast();

  // View state
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [showWelcome, setShowWelcome] = useState(false);

  // Data state
  const [allRecords] = useState<NeotomaRecord[]>(
    FIXTURE_RECORDS.map(normalizeRecord)
  );
  const [filteredRecords, setFilteredRecords] = useState<NeotomaRecord[]>([]);
  const [types] = useState<string[]>(getRecordTypes());

  // UI state
  const [selectedRecord, setSelectedRecord] = useState<NeotomaRecord | null>(
    null
  );
  const [selectedType, setSelectedType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showChat, setShowChat] = useState(true);

  // Filter records based on search and type
  useEffect(() => {
    let recordsToFilter = [...allRecords];

    if (searchQuery.trim()) {
      recordsToFilter = recordsToFilter.filter((record) =>
        recordMatchesQuery(record, searchQuery)
      );
    }

    if (selectedType) {
      recordsToFilter = recordsToFilter.filter((r) => r.type === selectedType);
    }

    // Sort by date
    recordsToFilter.sort((a, b) => {
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    setFilteredRecords(recordsToFilter);
  }, [allRecords, selectedType, searchQuery]);

  const displayCount = useMemo(() => {
    if (!searchQuery.trim() && !selectedType) {
      return allRecords.length;
    }
    return filteredRecords.length;
  }, [searchQuery, selectedType, allRecords.length, filteredRecords.length]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleTypeFilter = (type: string) => {
    setSelectedType(type);
  };

  const handleDeleteRecord = useCallback(
    (_record: NeotomaRecord) => {
      toast({
        title: "Demo Mode",
        description: "Record deletion is disabled in prototype mode",
        variant: "default",
      });
    },
    [toast]
  );

  const handleDeleteRecords = useCallback(
    (_records: NeotomaRecord[]) => {
      toast({
        title: "Demo Mode",
        description: "Record deletion is disabled in prototype mode",
        variant: "default",
      });
    },
    [toast]
  );

  const handleEventClick = useCallback(
    (event: any) => {
      const record = allRecords.find((r) => r.id === event.record_id);
      if (record) {
        setSelectedRecord(record);
        setCurrentView("records");
        toast({
          title: "Event Record",
          description: `Showing record: ${record.summary}`,
        });
      }
    },
    [allRecords, toast]
  );

  const handleRecordClickFromChat = useCallback((recordId: string) => {
    const record = getRecordById(recordId);
    if (record) {
      setSelectedRecord(normalizeRecord(record));
      setCurrentView("records");
    }
  }, []);

  const handleRecordClickFromEntity = useCallback((recordId: string) => {
    const record = getRecordById(recordId);
    if (record) {
      setSelectedRecord(normalizeRecord(record));
      setCurrentView("records");
    }
  }, []);

  const handleUploadComplete = useCallback(
    (fileCount: number) => {
      toast({
        title: "Upload Complete",
        description: `${fileCount} files processed. View them in Records.`,
      });
      setTimeout(() => setCurrentView("records"), 1500);
    },
    [toast]
  );

  const handleNavigate = useCallback((view: string) => {
    setCurrentView(view as View);
  }, []);

  // Auto-show welcome on first load
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem(
      "neotoma-prototype-welcome-seen"
    );
    if (!hasSeenWelcome) {
      setShowWelcome(true);
    }
  }, []);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem("neotoma-prototype-welcome-seen", "true");
  };

  return (
    <div className="h-screen max-h-screen bg-background flex flex-col overflow-hidden">
      {/* Welcome Modal */}
      <Dialog open={showWelcome} onOpenChange={setShowWelcome}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-6 w-6 text-primary" />
              Welcome to Neotoma MVP Prototype
            </DialogTitle>
            <DialogDescription className="text-base pt-4 space-y-4">
              <p>
                <strong>Complete interactive demonstration</strong> of the
                Neotoma MVP covering all feature units from the specification.
                Explore every workflow with static data fixtures—no backend
                required.
              </p>

              <div className="grid grid-cols-3 gap-4 py-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <span className="font-semibold">15 Records</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    10 document types with extracted fields
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-green-500" />
                    <span className="font-semibold">26 Events</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Timeline spanning 2010-2024
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-500" />
                    <span className="font-semibold">17 Entities</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Canonical people, companies, locations
                  </p>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  All MVP Feature Units Demonstrated:
                </h4>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>
                    <strong>Dashboard</strong> — Stats, recent records, quick
                    actions (FU-305)
                  </li>
                  <li>
                    <strong>Records</strong> — List, search, filter, detail
                    panel (FU-301, FU-302)
                  </li>
                  <li>
                    <strong>Timeline</strong> — Chronological events, grouping
                    (FU-303)
                  </li>
                  <li>
                    <strong>Entities</strong> — Explorer with detail view
                    (FU-601)
                  </li>
                  <li>
                    <strong>Upload</strong> — Bulk upload with progress tracking
                    (FU-304)
                  </li>
                  <li>
                    <strong>AI Chat</strong> — Mock MCP queries with responses
                    (FU-307)
                  </li>
                  <li>
                    <strong>Settings</strong> — Preferences, integrations,
                    billing (FU-306)
                  </li>
                </ul>
              </div>

              <div className="text-xs text-muted-foreground pt-2 border-t">
                <strong>Note:</strong> All interactions use static fixtures.
                Record mutations, file processing, and backend operations are
                simulated for demonstration.
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-between items-center pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                handleCloseWelcome();
                setCurrentView("timeline");
              }}
            >
              Start with Timeline
            </Button>
            <Button onClick={handleCloseWelcome}>Explore Dashboard</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-foreground">
                Neotoma MVP Prototype
              </h1>
              <p className="text-sm text-muted-foreground">
                Complete interactive demo • All feature units •{" "}
                {allRecords.length} records, {FIXTURE_EVENTS.length} events,{" "}
                {FIXTURE_ENTITIES.length} entities
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowWelcome(true)}
              >
                <Info className="h-4 w-4 mr-2" />
                About
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChat(!showChat)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {showChat ? "Hide" : "Show"} Chat
              </Button>
              <Badge variant="outline" className="text-primary border-primary">
                Demo Mode
              </Badge>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-t border-border">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
              {
                id: "records",
                icon: Table2,
                label: "Records",
                count: allRecords.length,
              },
              {
                id: "timeline",
                icon: Calendar,
                label: "Timeline",
                count: FIXTURE_EVENTS.length,
              },
              {
                id: "entities",
                icon: Users,
                label: "Entities",
                count: FIXTURE_ENTITIES.length,
              },
              { id: "upload", icon: Upload, label: "Upload" },
              { id: "settings", icon: Settings, label: "Settings" },
            ].map(({ id, icon: Icon, label, count }) => (
              <Button
                key={id}
                variant={currentView === id ? "default" : "ghost"}
                size="sm"
                onClick={() => setCurrentView(id as View)}
                className="rounded-b-none"
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
                {count !== undefined && (
                  <Badge variant="secondary" className="ml-2">
                    {count}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* Chat Panel (Collapsible) */}
        {showChat && (
          <div className="w-96 flex-shrink-0 border-r">
            <MockChatPanel onRecordClick={handleRecordClickFromChat} />
          </div>
        )}

        {/* Main View */}
        <div className="flex-1 min-h-0">
          {currentView === "dashboard" && (
            <Dashboard
              records={allRecords}
              totalEntities={FIXTURE_ENTITIES.length}
              totalEvents={FIXTURE_EVENTS.length}
              onNavigate={handleNavigate}
              onRecordClick={setSelectedRecord}
            />
          )}

          {currentView === "records" && (
            <div className="h-full flex">
              <main className="flex-1 min-h-0">
                <RecordsTable
                  records={filteredRecords}
                  totalCount={allRecords.length}
                  displayCount={displayCount}
                  types={types}
                  onRecordClick={setSelectedRecord}
                  onDeleteRecord={handleDeleteRecord}
                  onDeleteRecords={handleDeleteRecords}
                  onSearch={handleSearch}
                  onTypeFilter={handleTypeFilter}
                  isLoading={false}
                  loadingMore={false}
                  hasMore={false}
                  onLoadMore={() => {}}
                  onFileUploadRef={undefined}
                />
              </main>
              <RecordDetailsPanel
                record={selectedRecord}
                onClose={() => setSelectedRecord(null)}
              />
            </div>
          )}

          {currentView === "timeline" && (
            <TimelineView
              events={FIXTURE_EVENTS}
              onEventClick={handleEventClick}
            />
          )}

          {currentView === "entities" && (
            <EntityExplorerView
              entities={FIXTURE_ENTITIES}
              onRecordClick={handleRecordClickFromEntity}
            />
          )}

          {currentView === "upload" && (
            <MockUploadUI onComplete={handleUploadComplete} />
          )}

          {currentView === "settings" && <SettingsView />}
        </div>
      </div>

      {/* Info Footer */}
      <div className="border-t border-border bg-muted/30 px-6 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Info className="h-3 w-3" />
            <span>
              Complete MVP prototype • All feature units from
              docs/specs/MVP_FEATURE_UNITS.md • Static fixtures
            </span>
          </div>
          <span>
            Current view: <strong>{currentView}</strong>
          </span>
        </div>
      </div>

      <Toaster />
    </div>
  );
}

export default PrototypeApp;
