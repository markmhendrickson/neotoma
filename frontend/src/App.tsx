import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { ChatPanel } from '@/components/ChatPanel';
import { RecordsTable } from '@/components/RecordsTable';
import { RecordDetailsPanel } from '@/components/RecordDetailsPanel';
import { useKeys } from '@/hooks/useKeys';
import { useDatastore } from '@/hooks/useDatastore';
import { normalizeRecord, STATUS_ORDER } from '@/types/record';
import type { NeotomaRecord } from '@/types/record';
import { useToast } from '@/components/ui/use-toast';
import { localToNeotoma } from '@/utils/record_conversion';
import { FloatingSettingsButton } from '@/components/FloatingSettingsButton';
import { seedLocalRecords, resetSeedMarker } from '@/utils/seedLocalRecords';

function App() {
  const { toast } = useToast();
  const { x25519, ed25519, loading: keysLoading } = useKeys();
  const datastore = useDatastore(x25519, ed25519);
  const [allRecords, setAllRecords] = useState<NeotomaRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<NeotomaRecord[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<NeotomaRecord | null>(null);
  const [selectedType, setSelectedType] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const chatPanelFileUploadRef = useRef<((files: FileList | null) => Promise<void>) | null>(null);
  const chatPanelErrorRef = useRef<((error: string) => void) | null>(null);
  const autoSeedEnabled = import.meta.env.VITE_AUTO_SEED_RECORDS === 'true';

  const loadRecords = useCallback(async () => {
    if (!datastore.initialized || keysLoading) {
      return;
    }

    try {
      const localRecords = await datastore.queryRecords();
      const neotomaRecords = localRecords.map(localToNeotoma).map(normalizeRecord);
      setAllRecords(neotomaRecords);

      // Extract unique types
      const uniqueTypes = Array.from(new Set(neotomaRecords.map(r => r.type))).sort();
      setTypes(uniqueTypes);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load records';
      console.error('[Records Loading Error]', errorMessage, error);
      setAllRecords([]);
      // Show error in chat
      if (chatPanelErrorRef.current) {
        chatPanelErrorRef.current(errorMessage);
      }
    }
  }, [datastore, keysLoading]);


  const loadTypes = useCallback(async () => {
    // Types are now loaded from local records
    if (allRecords.length > 0) {
      const uniqueTypes = Array.from(new Set(allRecords.map(r => r.type))).sort();
      setTypes(uniqueTypes);
    }
  }, [allRecords]);

  useEffect(() => {
    if (datastore.initialized && !keysLoading) {
      loadRecords();
    }
  }, [datastore.initialized, keysLoading, loadRecords]);

  useEffect(() => {
    if (!autoSeedEnabled || !datastore.initialized || keysLoading) {
      return;
    }

    let cancelled = false;

    async function populateSamples() {
      try {
        const seeded = await seedLocalRecords(datastore);
        if (seeded && !cancelled) {
          await loadRecords();
          toast({
            title: 'Sample records added',
            description: 'Clear the sample marker or reset storage to remove them.',
          });
        }
      } catch (error) {
        console.error('[Sample Records] Failed to seed data:', error);
      }
    }

    populateSamples();

    return () => {
      cancelled = true;
    };
  }, [autoSeedEnabled, datastore, keysLoading, loadRecords, toast]);

  useEffect(() => {
    if (!import.meta.env.DEV || !datastore.initialized) {
      return;
    }

    const devWindow = window as typeof window & {
      seedNeotomaSamples?: (options?: { force?: boolean }) => Promise<void>;
      resetNeotomaSampleMarker?: () => void;
    };

    devWindow.seedNeotomaSamples = async (options?: { force?: boolean }) => {
      await seedLocalRecords(datastore, { force: options?.force ?? true });
      await loadRecords();
    };
    devWindow.resetNeotomaSampleMarker = () => resetSeedMarker();

    return () => {
      delete devWindow.seedNeotomaSamples;
      delete devWindow.resetNeotomaSampleMarker;
    };
  }, [datastore, loadRecords]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    let recordsToFilter = allRecords;

    if (selectedType) {
      recordsToFilter = recordsToFilter.filter((r) => r.type === selectedType);
    }

    recordsToFilter.sort((a, b) => {
      const statusDiff =
        (STATUS_ORDER[a._status || 'Ready'] ?? STATUS_ORDER.Ready) -
        (STATUS_ORDER[b._status || 'Ready'] ?? STATUS_ORDER.Ready);
      if (statusDiff !== 0) return statusDiff;
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    setFilteredRecords(recordsToFilter);
  }, [allRecords, selectedType]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      loadRecords();
      return;
    }

    if (!datastore.initialized) {
      toast({
        title: 'Datastore not ready',
        description: 'Please wait for datastore to initialize',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Simple text search (can be enhanced with vector search)
      const localRecords = await datastore.queryRecords();
      const queryLower = query.toLowerCase();
      const filtered = localRecords.filter(record => {
        const searchableParts = [
          record.type,
          record.summary ?? '',
          record.id,
          JSON.stringify(record.properties ?? {}),
          ...(record.file_urls ?? []),
        ];
        return searchableParts.some((part) => part.toLowerCase().includes(queryLower));
      });
      const neotomaRecords = filtered.map(localToNeotoma).map(normalizeRecord);
      setAllRecords(neotomaRecords);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed';
      console.error('[Search Error]', errorMessage, error);
      // Show error in chat
      if (chatPanelErrorRef.current) {
        chatPanelErrorRef.current(errorMessage);
      }
    }
  };

  const handleTypeFilter = (type: string) => {
    setSelectedType(type);
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
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

  return (
    <div 
      className="h-screen max-h-screen bg-background flex flex-col overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-1 min-h-0 max-h-full overflow-hidden">
        <ChatPanel 
          datastore={datastore}
          onFileUploaded={loadRecords} 
          onFileUploadRef={chatPanelFileUploadRef}
          onErrorRef={chatPanelErrorRef}
        />
        <main className="flex-1 min-h-0 max-h-full overflow-hidden">
          <RecordsTable
            records={filteredRecords}
            types={types}
            onRecordClick={setSelectedRecord}
            onSearch={handleSearch}
            onTypeFilter={handleTypeFilter}
          />
        </main>
      </div>
      <RecordDetailsPanel record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      <Toaster />
      <SonnerToaster
        duration={4000}
        position="bottom-right"
        visibleToasts={Number.POSITIVE_INFINITY}
        toastOptions={{
          classNames: {
            toast: 'bg-background border border-border shadow-lg',
            title: 'text-foreground font-medium',
            description: 'text-muted-foreground',
          },
        }}
      />
      <FloatingSettingsButton />
      {/* Full-page drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary flex items-center justify-center pointer-events-none">
          <div className="bg-background/95 backdrop-blur-sm rounded-lg px-8 py-6 border-2 border-primary shadow-lg">
            <div className="text-center">
              <div className="text-2xl font-semibold text-primary mb-2">Drop files to upload</div>
              <div className="text-sm text-muted-foreground">Release to add files to your records</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
