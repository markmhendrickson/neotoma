import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { ChatPanel } from '@/components/ChatPanel';
import { RecordsTable } from '@/components/RecordsTable';
import { RecordDetailsPanel } from '@/components/RecordDetailsPanel';
import { useKeys } from '@/hooks/useKeys';
import { useDatastore } from '@/hooks/useDatastore';
import { normalizeRecord, STATUS_ORDER, type NeotomaRecord } from '@/types/record';
import { useToast } from '@/components/ui/use-toast';
import { localToNeotoma } from '@/utils/record_conversion';
import { FloatingSettingsButton } from '@/components/FloatingSettingsButton';
import { seedLocalRecords, resetSeedMarker } from '@/utils/seedLocalRecords';
import { configureLocalFileEncryption, deleteLocalFile, isLocalFilePath } from '@/utils/local_files';

const tokenizeQuery = (query: string): string[] =>
  query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

const collectSearchableStrings = (value: unknown, acc: string[]) => {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    acc.push(String(value).toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchableStrings(item, acc));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      acc.push(key.toLowerCase());
      collectSearchableStrings(val, acc);
    });
  }
};

const buildRecordSearchStrings = (record: NeotomaRecord): string[] => {
  const parts: string[] = [];
  [record.type, record.summary ?? '', record.id, ...(record.file_urls ?? [])].forEach((value) => {
    if (typeof value === 'string' && value.trim()) {
      parts.push(value.toLowerCase());
    }
  });
  collectSearchableStrings(record.properties ?? {}, parts);
  return parts;
};

function App() {
  const { toast } = useToast();
  const { x25519, ed25519, loading: keysLoading } = useKeys();
  useEffect(() => {
    if (!x25519 || !ed25519) {
      return;
    }
    configureLocalFileEncryption(x25519, ed25519).catch((error) => {
      console.error('[Local Files] Failed to configure encryption', error);
    });
  }, [x25519, ed25519]);

  const datastore = useDatastore(x25519, ed25519);
  const [allRecords, setAllRecords] = useState<NeotomaRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<NeotomaRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<NeotomaRecord | null>(null);
  const [selectedType, setSelectedType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const chatPanelFileUploadRef = useRef<((files: FileList | null) => Promise<void>) | null>(null);
  const chatPanelErrorRef = useRef<((error: string) => void) | null>(null);
  const autoSeedEnabled = import.meta.env.VITE_AUTO_SEED_RECORDS === 'true';

  const loadRecords = useCallback(async () => {
    if (!datastore.initialized || keysLoading) {
      return;
    }

    setRecordsLoading(true);
    try {
      const [localRecords, totalCount] = await Promise.all([
        datastore.queryRecords(),
        datastore.countRecords(),
      ]);
      const neotomaRecords = localRecords.map(localToNeotoma).map(normalizeRecord);
      setAllRecords(neotomaRecords);
      setTotalRecords(totalCount);

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
    } finally {
      setRecordsLoading(false);
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

  const recordMatchesQuery = useCallback((record: NeotomaRecord, query: string) => {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return true;

    const searchableStrings = buildRecordSearchStrings(record);
    if (searchableStrings.length === 0) {
      return false;
    }

    return tokens.every((token) =>
      searchableStrings.some((field) => field.includes(token))
    );
  }, []);

  useEffect(() => {
    let recordsToFilter = [...allRecords];

    if (searchQuery.trim()) {
      recordsToFilter = recordsToFilter.filter((record) => recordMatchesQuery(record, searchQuery));
    }

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
  }, [allRecords, selectedType, searchQuery, recordMatchesQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleTypeFilter = (type: string) => {
    setSelectedType(type);
  };

  const handleDeleteRecords = useCallback(
    async (recordsToDelete: NeotomaRecord[]) => {
      if (!datastore.initialized) {
        toast({
          title: 'Datastore not ready',
          description: 'Wait for local datastore initialization before deleting records.',
          variant: 'destructive',
        });
        throw new Error('Datastore not initialized');
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
                console.warn('[Records] Failed to remove local file', { filePath, error })
              )
            )
        );
        await Promise.all(recordsToDelete.map((record) => datastore.deleteRecord(record.id)));
        await Promise.all(localFileRemovals);
        if (selectedRecord && recordsToDelete.some((record) => record.id === selectedRecord.id)) {
          setSelectedRecord(null);
        }
        await loadRecords();
        const description =
          recordsToDelete.length === 1
            ? `Removed ${recordsToDelete[0].summary ?? recordsToDelete[0].id}.`
            : `Removed ${recordsToDelete.length} records.`;
        toast({
          title: recordsToDelete.length === 1 ? 'Record deleted' : 'Records deleted',
          description,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast({
          title: 'Failed to delete records',
          description: message,
          variant: 'destructive',
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
    const hasFiles = e.dataTransfer.types.includes('Files');
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
          totalCount={totalRecords}
            types={types}
            onRecordClick={setSelectedRecord}
            onDeleteRecord={handleDeleteRecord}
            onDeleteRecords={handleDeleteRecords}
            onSearch={handleSearch}
            onTypeFilter={handleTypeFilter}
            isLoading={recordsLoading}
            onFileUploadRef={chatPanelFileUploadRef}
          />
        </main>
      </div>
      <RecordDetailsPanel record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      <Toaster />
      <SonnerToaster
        duration={4000}
        position="bottom-right"
        visibleToasts={10}
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
