import { useState, useEffect, useCallback } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/Header';
import { ChatPanel } from '@/components/ChatPanel';
import { RecordsTable } from '@/components/RecordsTable';
import { RecordDetailsPanel } from '@/components/RecordDetailsPanel';
import { useSettings } from '@/hooks/useSettings';
import { fetchRecords, fetchTypes, searchRecords } from '@/lib/api';
import { normalizeRecord, STATUS_ORDER } from '@/types/record';
import type { NeotomaRecord } from '@/types/record';
import { useToast } from '@/components/ui/use-toast';

function App() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [allRecords, setAllRecords] = useState<NeotomaRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<NeotomaRecord[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<NeotomaRecord | null>(null);
  const [selectedType, setSelectedType] = useState('');

  const loadRecords = useCallback(async () => {
    if (!settings.bearerToken) {
      toast({
        title: 'Bearer Token required',
        description: 'Please set your Bearer Token in settings',
        variant: 'destructive',
      });
      return;
    }

    try {
      const data = await fetchRecords(settings.apiBase, settings.bearerToken);
      setAllRecords(data.map(normalizeRecord));
    } catch (error) {
      toast({
        title: 'Error fetching records',
        description: error instanceof Error ? error.message : 'Failed to fetch records',
        variant: 'destructive',
      });
      setAllRecords([]);
    }
  }, [settings, toast]);

  const loadTypes = useCallback(async () => {
    if (!settings.bearerToken) return;

    try {
      const data = await fetchTypes(settings.apiBase, settings.bearerToken);
      setTypes(data);
    } catch (error) {
      console.error('Error fetching types:', error);
    }
  }, [settings]);

  useEffect(() => {
    loadRecords();
    loadTypes();
  }, [loadRecords, loadTypes]);

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

    if (!settings.bearerToken) {
      toast({
        title: 'Bearer Token required',
        description: 'Please set your Bearer Token in settings',
        variant: 'destructive',
      });
      return;
    }

    try {
      const data = await searchRecords(settings.apiBase, settings.bearerToken, query);
      setAllRecords(data.map(normalizeRecord));
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

  const handleFileUploaded = useCallback(async () => {
    await Promise.all([loadRecords(), loadTypes()]);
  }, [loadRecords, loadTypes]);

  return (
    <div className="h-screen max-h-screen bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0 max-h-full overflow-hidden">
        <ChatPanel onFileUploaded={handleFileUploaded} />
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
