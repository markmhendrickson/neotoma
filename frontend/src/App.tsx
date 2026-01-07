import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type DragEvent,
} from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { ChatPanel } from "@/components/ChatPanel";
import { RecordsTable } from "@/components/RecordsTable";
import { RecordDetailsPanel } from "@/components/RecordDetailsPanel";
import { StyleGuide } from "@/components/StyleGuide";
import { useKeys } from "@/hooks/useKeys";
import { useDatastore } from "@/hooks/useDatastore";
import {
  normalizeRecord,
  STATUS_ORDER,
  type NeotomaRecord,
} from "@/types/record";
import { useToast } from "@/components/ui/use-toast";
import { localToNeotoma } from "@/utils/record_conversion";
import { FloatingSettingsButton } from "@/components/FloatingSettingsButton";
import { DatastoreContext } from "@/contexts/DatastoreContext";
import { seedLocalRecords, resetSeedMarker } from "@/utils/seedLocalRecords";
import {
  configureLocalFileEncryption,
  deleteLocalFile,
  isLocalFilePath,
} from "@/utils/local_files";
import { recordMatchesQuery } from "@/utils/record_search";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

function App() {
  const { toast } = useToast();
  const { x25519, ed25519, loading: keysLoading } = useKeys();

  // Track current pathname for routing
  const [pathname, setPathname] = useState(window.location.pathname);
  const isDesignSystem = pathname === "/design-system";

  // Handle pathname changes (browser navigation, programmatic changes)
  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Keyboard shortcut to navigate to design system preview (Ctrl/Cmd + Shift + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
        e.preventDefault();
        const newPath = isDesignSystem ? "/" : "/design-system";
        window.history.pushState({}, "", newPath);
        setPathname(newPath);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesignSystem]);
  useEffect(() => {
    if (!x25519 || !ed25519) {
      return;
    }
    configureLocalFileEncryption(x25519, ed25519).catch((error) => {
      console.error("[Local Files] Failed to configure encryption", error);
    });
  }, [x25519, ed25519]);

  const datastore = useDatastore(x25519, ed25519);
  const {
    initialized: datastoreInitialized,
    queryRecords: datastoreQueryRecords,
    countRecords: datastoreCountRecords,
    getRecord: datastoreGetRecord,
  } = datastore;
  const [allRecords, setAllRecords] = useState<NeotomaRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<NeotomaRecord[]>([]);
  const [filteredDisplayCount, setFilteredDisplayCount] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<NeotomaRecord | null>(
    null
  );
  const [selectedType, setSelectedType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const RECORDS_PER_PAGE = 50;
  const allRecordsRef = useRef<NeotomaRecord[]>([]);
  const totalRecordsRef = useRef(0);
  const fullLoadInProgressRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const chatPanelFileUploadRef = useRef<
    ((files: FileList | null) => Promise<void>) | null
  >(null);
  const chatPanelErrorRef = useRef<((error: string) => void) | null>(null);
  const autoSeedEnabled = import.meta.env.VITE_AUTO_SEED_RECORDS !== "false";

  // Expose error trigger function for testing
  useEffect(() => {
    (window as any).triggerError = (message: string, count: number = 1) => {
      if (!chatPanelErrorRef.current) {
        console.warn("[triggerError] Error handler not available yet");
        return;
      }
      for (let i = 0; i < count; i++) {
        // Use setTimeout to space out multiple triggers slightly
        setTimeout(() => {
          if (chatPanelErrorRef.current) {
            chatPanelErrorRef.current(message);
          }
        }, i * 10); // 10ms delay between triggers
      }
      console.log(
        `[triggerError] Triggered error "${message}" ${count} time(s)`
      );
    };
    return () => {
      delete (window as any).triggerError;
    };
  }, []);

  const loadRecords = useCallback(
    async (reset: boolean = true) => {
      if (!datastoreInitialized || keysLoading) {
        return;
      }

      if (reset) {
        setRecordsLoading(true);
        setAllRecords([]);
        allRecordsRef.current = [];
        setHasMore(true);
      }

      try {
        const currentOffset = reset ? 0 : allRecordsRef.current.length;
        const [localRecords, totalCount] = await Promise.all([
          datastoreQueryRecords({
            limit: RECORDS_PER_PAGE,
            offset: currentOffset,
          }),
          reset
            ? datastoreCountRecords()
            : Promise.resolve(totalRecordsRef.current),
        ]);
        const neotomaRecords = localRecords
          .map(localToNeotoma)
          .map(normalizeRecord);

        const newRecords = reset
          ? neotomaRecords
          : [...allRecordsRef.current, ...neotomaRecords];
        allRecordsRef.current = newRecords;
        setAllRecords(newRecords);
        setHasMore(newRecords.length < totalCount);

        // Extract unique types from all loaded records
        const uniqueTypes = Array.from(
          new Set(newRecords.map((r) => r.type))
        ).sort();
        setTypes(uniqueTypes);

        if (reset) {
          totalRecordsRef.current = totalCount;
          setTotalRecords(totalCount);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to load records";
        console.error("[Records Loading Error]", errorMessage, error);
        if (reset) {
          setAllRecords([]);
          allRecordsRef.current = [];
          // Show error in chat
          if (chatPanelErrorRef.current) {
            chatPanelErrorRef.current(errorMessage);
          }
        }
      } finally {
        setRecordsLoading(false);
        setLoadingMore(false);
      }
    },
    [
      datastoreInitialized,
      keysLoading,
      datastoreQueryRecords,
      datastoreCountRecords,
    ]
  );

  // Add a function to append a single record without reloading
  const appendRecord = useCallback(
    async (recordId: string) => {
      if (!datastoreInitialized) return;

      try {
        const localRecord = await datastoreGetRecord(recordId);
        if (localRecord) {
          const neotomaRecord = normalizeRecord(localToNeotoma(localRecord));
          setAllRecords((prev) => {
            // Check if record already exists
            if (prev.some((r) => r.id === recordId)) {
              return prev;
            }
            const updated = [neotomaRecord, ...prev];
            allRecordsRef.current = updated;

            // Update types
            const uniqueTypes = Array.from(
              new Set(updated.map((r) => r.type))
            ).sort();
            setTypes(uniqueTypes);

            return updated;
          });
          setTotalRecords((prev) => {
            const next = prev + 1;
            totalRecordsRef.current = next;
            return next;
          });
        }
      } catch (error) {
        console.error("[Append Record Error]", error);
        // Fallback to full reload if append fails
        await loadRecords(true);
      }
    },
    [datastoreInitialized, datastoreGetRecord, loadRecords]
  );

  const loadTypes = useCallback(async () => {
    // Types are now loaded from local records
    if (allRecords.length > 0) {
      const uniqueTypes = Array.from(
        new Set(allRecords.map((r) => r.type))
      ).sort();
      setTypes(uniqueTypes);
    }
  }, [allRecords]);

  useEffect(() => {
    if (datastoreInitialized && !keysLoading) {
      loadRecords(true);
    }
  }, [datastoreInitialized, keysLoading, loadRecords]);

  useEffect(() => {
    if (!autoSeedEnabled || !datastoreInitialized || keysLoading) {
      return;
    }

    let cancelled = false;

    async function populateSamples() {
      try {
        const seeded = await seedLocalRecords(datastore);
        if (seeded && !cancelled) {
          await loadRecords(true);
          toast({
            title: "Sample records added",
            description:
              "Clear the sample marker or reset storage to remove them.",
          });
        }
      } catch (error) {
        console.error("[Sample Records] Failed to seed data:", error);
      }
    }

    populateSamples();

    return () => {
      cancelled = true;
    };
  }, [
    autoSeedEnabled,
    datastore,
    datastoreInitialized,
    keysLoading,
    loadRecords,
    toast,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !datastoreInitialized) {
      return;
    }

    const devWindow = window as typeof window & {
      seedNeotomaSamples?: (options?: { force?: boolean }) => Promise<void>;
      resetNeotomaSampleMarker?: () => void;
    };

    devWindow.seedNeotomaSamples = async (options?: { force?: boolean }) => {
      await seedLocalRecords(datastore, { force: options?.force ?? true });
      await loadRecords(true);
    };
    devWindow.resetNeotomaSampleMarker = () => resetSeedMarker();

    return () => {
      delete devWindow.seedNeotomaSamples;
      delete devWindow.resetNeotomaSampleMarker;
    };
  }, [datastore, loadRecords, datastoreInitialized]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  const matchesQuery = useCallback((record: NeotomaRecord, query: string) => {
    return recordMatchesQuery(record, query);
  }, []);

  useEffect(() => {
    let recordsToFilter = [...allRecords];

    if (searchQuery.trim()) {
      recordsToFilter = recordsToFilter.filter((record) =>
        matchesQuery(record, searchQuery)
      );
    }

    if (selectedType) {
      recordsToFilter = recordsToFilter.filter((r) => r.type === selectedType);
    }

    recordsToFilter.sort((a, b) => {
      const statusDiff =
        (STATUS_ORDER[a._status || "Ready"] ?? STATUS_ORDER.Ready) -
        (STATUS_ORDER[b._status || "Ready"] ?? STATUS_ORDER.Ready);
      if (statusDiff !== 0) return statusDiff;
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    setFilteredRecords(recordsToFilter);
  }, [allRecords, selectedType, searchQuery, matchesQuery]);

  const filteredCount = filteredRecords.length;
  useEffect(() => {
    const trimmedSearch = searchQuery.trim();
    const requiresFilter = trimmedSearch.length > 0 || Boolean(selectedType);
    if (!datastoreInitialized || keysLoading) {
      return;
    }
    if (!requiresFilter) {
      setFilteredDisplayCount(totalRecordsRef.current);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const queryOptions = selectedType ? { type: selectedType } : undefined;
        const localRecords = await datastoreQueryRecords(queryOptions);
        if (cancelled) return;
        const normalizedRecords = localRecords
          .map(localToNeotoma)
          .map(normalizeRecord);
        const nextCount = trimmedSearch.length
          ? normalizedRecords.filter((record) =>
              matchesQuery(record, trimmedSearch)
            ).length
          : normalizedRecords.length;
        setFilteredDisplayCount(nextCount);
      } catch (error) {
        console.error("[App] Failed to compute filtered count", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    searchQuery,
    selectedType,
    datastoreInitialized,
    keysLoading,
    datastoreQueryRecords,
    matchesQuery,
  ]);

  const displayCount = useMemo(() => {
    if (!searchQuery.trim() && !selectedType) {
      return totalRecords;
    }
    return filteredDisplayCount || filteredCount;
  }, [
    searchQuery,
    selectedType,
    totalRecords,
    filteredDisplayCount,
    filteredCount,
  ]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleTypeFilter = (type: string) => {
    setSelectedType(type);
  };

  useEffect(() => {
    const shouldLoadAllForSearch = searchQuery.trim().length > 0 && hasMore;
    if (!shouldLoadAllForSearch || loadingMore || recordsLoading) {
      return;
    }
    loadRecords(false);
  }, [searchQuery, hasMore, loadingMore, recordsLoading, loadRecords]);

  // Reset pagination state when search/filter is cleared
  const prevSearchQuery = useRef(searchQuery);
  const prevSelectedType = useRef(selectedType);
  useEffect(() => {
    const trimmedSearch = searchQuery.trim();
    const prevTrimmedSearch = prevSearchQuery.current.trim();
    const requireFullDataset =
      trimmedSearch.length > 0 || Boolean(selectedType);
    const prevRequireFullDataset =
      prevTrimmedSearch.length > 0 || Boolean(prevSelectedType.current);

    // Detect transition from filter/search to no filter/search
    const wasFilterActive = prevRequireFullDataset && !requireFullDataset;

    if (
      wasFilterActive &&
      allRecords.length > 0 &&
      totalRecordsRef.current > 0
    ) {
      // Check if we previously loaded all records
      const hadLoadedAll = allRecords.length === totalRecordsRef.current;

      if (hadLoadedAll && totalRecordsRef.current > RECORDS_PER_PAGE) {
        // Reset to paginated loading
        loadRecords(true);
      }
    }

    prevSearchQuery.current = searchQuery;
    prevSelectedType.current = selectedType;
  }, [searchQuery, selectedType, allRecords.length, loadRecords]);

  useEffect(() => {
    const trimmedSearch = searchQuery.trim();
    const requireFullDataset =
      trimmedSearch.length > 0 || Boolean(selectedType);
    if (
      !requireFullDataset ||
      !hasMore ||
      fullLoadInProgressRef.current ||
      !datastoreInitialized ||
      keysLoading
    ) {
      return;
    }

    let cancelled = false;
    fullLoadInProgressRef.current = true;
    setLoadingMore(true);

    (async () => {
      try {
        const localRecords = await datastoreQueryRecords();
        if (cancelled) {
          return;
        }
        const neotomaRecords = localRecords
          .map(localToNeotoma)
          .map(normalizeRecord);
        allRecordsRef.current = neotomaRecords;
        setAllRecords(neotomaRecords);
        setHasMore(false);
        totalRecordsRef.current = neotomaRecords.length;
        setTotalRecords(neotomaRecords.length);
      } catch (error) {
        console.error(
          "[App] Failed to fully load records for search/filter",
          error
        );
      } finally {
        if (!cancelled) {
          setLoadingMore(false);
          fullLoadInProgressRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      fullLoadInProgressRef.current = false;
    };
  }, [
    searchQuery,
    selectedType,
    hasMore,
    datastoreInitialized,
    keysLoading,
    datastoreQueryRecords,
  ]);

  const handleDeleteRecords = useCallback(
    async (recordsToDelete: NeotomaRecord[]) => {
      if (!datastore.initialized) {
        toast({
          title: "Datastore not ready",
          description:
            "Wait for local datastore initialization before deleting records.",
          variant: "destructive",
        });
        throw new Error("Datastore not initialized");
      }

      if (recordsToDelete.length === 0) {
        return;
      }

      try {
        const localFileRemovals = recordsToDelete.flatMap((record) =>
          (record.file_urls || [])
            .filter(isLocalFilePath)
            .map((filePath) =>
              deleteLocalFile(filePath).catch((error) =>
                console.warn("[Records] Failed to remove local file", {
                  filePath,
                  error,
                })
              )
            )
        );
        await Promise.all(
          recordsToDelete.map((record) => datastore.deleteRecord(record.id))
        );
        await Promise.all(localFileRemovals);
        if (
          selectedRecord &&
          recordsToDelete.some((record) => record.id === selectedRecord.id)
        ) {
          setSelectedRecord(null);
        }
        await loadRecords(true);
        const description =
          recordsToDelete.length === 1
            ? `Removed ${recordsToDelete[0].summary ?? recordsToDelete[0].id}.`
            : `Removed ${recordsToDelete.length} records.`;
        toast({
          title:
            recordsToDelete.length === 1 ? "Record deleted" : "Records deleted",
          description,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        toast({
          title: "Failed to delete records",
          description: message,
          variant: "destructive",
        });
        throw error;
      }
    },
    [datastore, loadRecords, selectedRecord, toast]
  );

  const handleDeleteRecord = useCallback(
    (record: NeotomaRecord) => handleDeleteRecords([record]),
    [handleDeleteRecords]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show overlay when files are being dragged, not UI elements
    const hasFiles = e.dataTransfer.types.includes("Files");
    if (hasFiles) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (chatPanelFileUploadRef.current) {
      chatPanelFileUploadRef.current(e.dataTransfer.files);
    }
  }, []);

  // Show design system preview if on /design-system path
  if (isDesignSystem) {
    return (
      <DatastoreContext.Provider value={datastore}>
        <StyleGuide
          onClose={() => {
            window.history.pushState({}, "", "/");
            setPathname("/");
          }}
        />
      </DatastoreContext.Provider>
    );
  }

  return (
    <DatastoreContext.Provider value={datastore}>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar currentPath={pathname} />
        <SidebarInset className="flex flex-col h-screen max-h-screen overflow-hidden">
          <div
            className="flex flex-1 min-h-0 max-h-full overflow-hidden relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <ChatPanel
              datastore={datastore}
              onFileUploaded={appendRecord}
              onFileUploadRef={chatPanelFileUploadRef}
              onErrorRef={chatPanelErrorRef}
              activeSearchQuery={searchQuery}
              activeTypeFilter={selectedType}
              allRecords={allRecords}
            />
            <main className="flex-1 min-h-0 max-h-full overflow-hidden">
              <RecordsTable
                records={filteredRecords}
                totalCount={totalRecords}
                displayCount={displayCount}
                types={types}
                onRecordClick={setSelectedRecord}
                onDeleteRecord={handleDeleteRecord}
                onDeleteRecords={handleDeleteRecords}
                onSearch={handleSearch}
                onTypeFilter={handleTypeFilter}
                isLoading={recordsLoading}
                loadingMore={loadingMore}
                hasMore={hasMore}
                onLoadMore={() => loadRecords(false)}
                onFileUploadRef={chatPanelFileUploadRef}
              />
            </main>
          </div>
          <RecordDetailsPanel
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
          />
          <Toaster />
          <SonnerToaster
            duration={4000}
            position="bottom-right"
            visibleToasts={10}
            toastOptions={{
              classNames: {
                toast: "bg-background border border-border shadow-lg",
                title: "text-foreground font-medium",
                description: "text-muted-foreground",
              },
            }}
          />
          <FloatingSettingsButton />
          {/* Full-page drag overlay */}
          {isDragging && (
            <div className="fixed inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary flex items-center justify-center pointer-events-none">
              <div className="bg-background/95 backdrop-blur-sm rounded-lg px-8 py-6 border-2 border-primary shadow-lg">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-primary mb-2">
                    Drop files to upload
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Release to add files to your records
                  </div>
                </div>
              </div>
            </div>
          )}
        </SidebarInset>
      </SidebarProvider>
    </DatastoreContext.Provider>
  );
}

export default App;
