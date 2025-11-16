import { useState, useEffect, useCallback } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/Header';
import { ChatPanel } from '@/components/ChatPanel';
import { RecordsTable } from '@/components/RecordsTable';
import { RecordDetailsPanel } from '@/components/RecordDetailsPanel';
import { useSettings } from '@/hooks/useSettings';
import { useKeys } from '@/hooks/useKeys';
import { useDatastore } from '@/hooks/useDatastore';
import { normalizeRecord, STATUS_ORDER } from '@/types/record';
import type { NeotomaRecord } from '@/types/record';
import { useToast } from '@/components/ui/use-toast';
import { localToNeotoma } from '@/utils/record_conversion';

function App() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const { x25519, ed25519, loading: keysLoading } = useKeys();
  const datastore = useDatastore(x25519, ed25519);
  const [allRecords, setAllRecords] = useState<NeotomaRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<NeotomaRecord[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<NeotomaRecord | null>(null);
  const [selectedType, setSelectedType] = useState('');

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
      toast({
        title: 'Error loading records',
        description: error instanceof Error ? error.message : 'Failed to load records',
        variant: 'destructive',
      });
      setAllRecords([]);
    }
  }, [datastore, keysLoading, toast]);

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
        const text = JSON.stringify(record.properties).toLowerCase();
        return text.includes(queryLower) || record.type.toLowerCase().includes(queryLower);
      });
      const neotomaRecords = filtered.map(localToNeotoma).map(normalizeRecord);
      setAllRecords(neotomaRecords);
    } catch (error) {
      toast({
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Search failed',
        variant: 'destructive',
      });
    }
  };

  const handleTypeFilter = (type: string) => {
    setSelectedType(type);
  };

  return (
    <div className="h-screen max-h-screen bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0 max-h-full overflow-hidden">
        <ChatPanel onFileUploaded={loadRecords} />
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
    </div>
  );
}

export default App;
