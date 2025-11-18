import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { NeotomaRecord } from '@/types/record';
import { STATUS_ORDER } from '@/types/record';
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, Info, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useSettings } from '@/hooks/useSettings';
import { formatRelativeTime } from '@/utils/time';

function renderDateCell(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const absolute = date.toLocaleString();
  const relative = formatRelativeTime(date);

  return (
    <span className="text-sm cursor-default" title={absolute}>
      {relative}
    </span>
  );
}

interface RecordsTableProps {
  records: NeotomaRecord[];
  types: string[];
  onRecordClick: (record: NeotomaRecord) => void;
  onDeleteRecord: (record: NeotomaRecord) => Promise<void> | void;
  onDeleteRecords: (records: NeotomaRecord[]) => Promise<void> | void;
  onSearch: (query: string) => void;
  onTypeFilter: (type: string) => void;
  isLoading?: boolean;
}

const EMPTY_TABLE_MESSAGE = [
  'Welcome to Neotoma—your personal operating system for ingesting files, structuring their contents, and recalling the things you have captured.',
  'Ask me questions like "Summarize my latest uploads" or "Show workout logs from last week."',
  'To add new information, drag files into the chat, drop them on the page, or paste them from your clipboard and I will import and categorize them for you.',
];

const SKELETON_ROW_COUNT = 6;

const COLUMN_VISIBILITY_STORAGE_KEY = 'recordsTableColumnVisibility';
const COLUMN_ORDER_STORAGE_KEY = 'recordsTableColumnOrder';
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.freeze({
  _status: false,
  id: false,
  updated_at: false,
  file_urls: false,
});

const ROW_INTERACTIVE_ATTR = 'data-row-interactive';

const getStoredColumnVisibility = (): VisibilityState => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_COLUMN_VISIBILITY };
  }

  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_COLUMN_VISIBILITY };
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_COLUMN_VISIBILITY };
    }
    return { ...DEFAULT_COLUMN_VISIBILITY, ...parsed };
  } catch (error) {
    console.warn('[RecordsTable] Failed to restore column visibility', error);
    return { ...DEFAULT_COLUMN_VISIBILITY };
  }
};

const getStoredColumnOrder = (defaultOrder: string[]): string[] => {
  if (typeof window === 'undefined') {
    return [...defaultOrder];
  }

  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (!raw) {
      return [...defaultOrder];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...defaultOrder];
    }
    const normalized = parsed.filter((value): value is string => typeof value === 'string');
    const deduped = normalized.filter((value, index) => normalized.indexOf(value) === index);
    const valid = deduped.filter((value) => defaultOrder.includes(value));
    const missing = defaultOrder.filter((value) => !valid.includes(value));
    return [...valid, ...missing];
  } catch (error) {
    console.warn('[RecordsTable] Failed to restore column order', error);
    return [...defaultOrder];
  }
};

const mergeColumnOrder = (currentOrder: string[], defaultOrder: string[]) => {
  const filtered = currentOrder.filter((value) => defaultOrder.includes(value));
  const missing = defaultOrder.filter((value) => !filtered.includes(value));
  return [...filtered, ...missing];
};

const ensureSelectColumnFirst = (order: string[]): string[] => {
  if (!Array.isArray(order)) {
    return order;
  }
  const existingIndex = order.indexOf('select');
  if (existingIndex === 0) {
    return order;
  }
  if (existingIndex > 0) {
    const next = [...order];
    next.splice(existingIndex, 1);
    next.unshift('select');
    return next;
  }
  return ['select', ...order];
};

const getColumnIdentifier = (column: ColumnDef<NeotomaRecord>): string | null => {
  const accessor = (column as { accessorKey?: string }).accessorKey;
  if (typeof accessor === 'string') {
    return accessor;
  }
  if (typeof column.id === 'string') {
    return column.id;
  }
  return null;
};

export function RecordsTable({
  records,
  types,
  onRecordClick,
  onDeleteRecord,
  onDeleteRecords,
  onSearch,
  onTypeFilter,
  isLoading = false,
}: RecordsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const ALL_TYPES_VALUE = '__all__';
  const selectableTypes = useMemo(
    () => types.filter((type) => type && type.trim().length > 0),
    [types]
  );
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updated_at', desc: true },
  ]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => getStoredColumnVisibility());
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const columnLabels: Record<string, string> = useMemo(
    () => ({
      select: 'Select',
      type: 'Type',
      summary: 'Summary',
      created_at: 'Created',
      updated_at: 'Updated',
      file_urls: 'Files',
      _status: 'Status',
      id: 'ID',
      actions: 'Actions',
    }),
    []
  );

  const toggleRecordSelection = useCallback((recordId: string, checked: boolean) => {
    setSelectedRowIds((current) => {
      if (checked) {
        if (current.includes(recordId)) {
          return current;
        }
        return [...current, recordId];
      }
      return current.filter((id) => id !== recordId);
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedRowIds([]);
        return;
      }
      setSelectedRowIds(records.map((record) => record.id));
    },
    [records]
  );

  useEffect(() => {
    setSelectedRowIds((current) => current.filter((id) => records.some((record) => record.id === id)));
  }, [records]);

  const isAllSelected = records.length > 0 && selectedRowIds.length === records.length;
  const isPartiallySelected = selectedRowIds.length > 0 && !isAllSelected;

  const columns = useMemo<ColumnDef<NeotomaRecord>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            aria-label="Select all records"
            className="h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            checked={isAllSelected}
            ref={(input) => {
              if (!input) return;
              input.indeterminate = isPartiallySelected;
            }}
            onChange={(event) => handleSelectAll(event.target.checked)}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            {...{ [ROW_INTERACTIVE_ATTR]: 'true' }}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select record ${row.original.id}`}
            className="h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            checked={selectedRowIds.includes(row.original.id)}
            onChange={(event) => {
              event.stopPropagation();
              toggleRecordSelection(row.original.id, event.target.checked);
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            {...{ [ROW_INTERACTIVE_ATTR]: 'true' }}
          />
        ),
        enableSorting: false,
        size: 38,
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => {
          const value = row.original.type;
          return value ? <span className="truncate block" title={value}>{value}</span> : '—';
        },
      },
      {
        accessorKey: 'summary',
        header: 'Summary',
        cell: ({ row }) => {
          const value = row.original.summary;
          return value ? <span className="text-sm truncate block" title={value}>{value}</span> : '—';
        },
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Created
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        sortingFn: 'datetime',
        cell: ({ row }) => renderDateCell(row.original.created_at),
      },
      {
        accessorKey: 'updated_at',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Updated
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        sortingFn: 'datetime',
        cell: ({ row }) => renderDateCell(row.original.updated_at),
      },
      {
        accessorKey: 'file_urls',
        header: 'Files',
        cell: ({ row }) => {
          const urls = row.original.file_urls || [];
          return urls.length > 0 ? `${urls.length} file(s)` : '—';
        },
      },
      {
        accessorKey: '_status',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Status
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        sortingFn: (rowA, rowB, columnId) => {
          const a = rowA.getValue<string>(columnId) || 'Ready';
          const b = rowB.getValue<string>(columnId) || 'Ready';
          return (
            (STATUS_ORDER[a as keyof typeof STATUS_ORDER] ?? STATUS_ORDER.Ready) -
            (STATUS_ORDER[b as keyof typeof STATUS_ORDER] ?? STATUS_ORDER.Ready)
          );
        },
        cell: ({ row }) => {
          const value = row.original._status || 'Ready';
          if (value === 'Uploading') return 'Uploading…';
          if (value === 'Failed') return 'Failed';
          return 'Ready';
        },
      },
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <span className="font-mono text-xs truncate block" title={row.original.id}>{row.original.id}</span>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions
            record={row.original}
            onViewDetails={onRecordClick}
            onDeleteRecord={onDeleteRecord}
          />
        ),
        size: 60,
      },
    ],
    [handleSelectAll, isAllSelected, isPartiallySelected, onDeleteRecord, onRecordClick, records.length, selectedRowIds, toggleRecordSelection]
  );

  const columnIds = useMemo(
    () => columns.map((column) => getColumnIdentifier(column)).filter((id): id is string => Boolean(id)),
    [columns]
  );
  const [columnOrder, setColumnOrderState] = useState<string[]>(() =>
    ensureSelectColumnFirst(getStoredColumnOrder(columnIds))
  );
  const setColumnOrder = useCallback(
    (updater: React.SetStateAction<string[]>) => {
      setColumnOrderState((current) => {
        const next = typeof updater === 'function' ? (updater as (prev: string[]) => string[])(current) : updater;
        return ensureSelectColumnFirst(next);
      });
    },
    []
  );
  const [storageInfoOpen, setStorageInfoOpen] = useState(false);
  const { settings } = useSettings();
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch (error) {
      console.warn('[RecordsTable] Failed to persist column visibility', error);
    }
  }, [columnVisibility]);

  useEffect(() => {
    setColumnOrder((current) => mergeColumnOrder(current, columnIds));
  }, [columnIds, setColumnOrder]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch (error) {
      console.warn('[RecordsTable] Failed to persist column order', error);
    }
  }, [columnOrder]);

  const table = useReactTable({
    data: records,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = useCallback(
    (event: React.MouseEvent<HTMLTableRowElement>, record: NeotomaRecord) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (target.closest(`[${ROW_INTERACTIVE_ATTR}="true"]`)) {
        return;
      }

      const nativeEvent = event.nativeEvent;
      const path =
        (typeof nativeEvent.composedPath === 'function' ? nativeEvent.composedPath() : []) ||
        [];
      const isInteractivePath = path.some(
        (node) =>
          node instanceof HTMLElement && node.getAttribute?.(ROW_INTERACTIVE_ATTR) === 'true'
      );

      if (isInteractivePath) {
        return;
      }

      onRecordClick(record);
    },
    [onRecordClick]
  );

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    onSearch(query);
  };

  const handleTypeChange = (type: string) => {
    const normalized = type === ALL_TYPES_VALUE ? '' : type;
    setSelectedType(normalized);
    onTypeFilter(normalized);
  };

  const { usage, quota, usagePercent, loading: quotaLoading, supported: quotaSupported } = useStorageQuota(
    records.length
  );

  const formatBytes = useCallback((bytes: number) => {
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;

    if (bytes >= GB) {
      return `${(bytes / GB).toFixed(1)} GB`;
    }
    if (bytes >= MB) {
      return `${(bytes / MB).toFixed(1)} MB`;
    }
    if (bytes >= KB) {
      return `${(bytes / KB).toFixed(1)} KB`;
    }
    return `${bytes.toFixed(0)} B`;
  }, []);

  const openSettingsDialog = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('open-settings'));
    setStorageInfoOpen(false);
  }, []);

  const quotaMessage = useMemo(() => {
    if (!quotaSupported) return 'Local storage quota unsupported in this browser';
    if (quotaLoading) return 'Checking local storage…';
    if (usage === null || quota === null || quota === 0) return 'Storage quota unavailable';

    const percent = usagePercent ?? (usage / quota) * 100;
    const percentText = percent >= 0 && percent < 1 ? '<1%' : `${percent.toFixed(0)}%`;

    return `${formatBytes(usage)} of ${formatBytes(quota)} (${percentText})`;
  }, [formatBytes, quotaSupported, quotaLoading, usage, quota, usagePercent]);

  const isInitialLoading = isLoading && records.length === 0;
  const showWelcomeEmptyState = !isInitialLoading && records.length === 0 && !searchQuery.trim() && !selectedType;
  const visibleColumns = table.getVisibleLeafColumns();
  const skeletonColumns = visibleColumns.length > 0 ? visibleColumns : table.getAllLeafColumns();
  const recordCountLabel = isInitialLoading ? 'Loading records…' : `${records.length} record${records.length === 1 ? '' : 's'}`;
  const quotaLabel = isInitialLoading ? 'Calculating usage…' : quotaMessage;

  const handleDragStart = useCallback(
    (event: React.DragEvent, columnId: string) => {
      setDraggingColumnId(columnId);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', columnId);
    },
    []
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent, targetColumnId: string) => {
      event.preventDefault();
      const draggedId = draggingColumnId || event.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === targetColumnId) {
        setDraggingColumnId(null);
        return;
      }
      setColumnOrder((current) => {
        const nextOrder = current.filter((id) => id !== draggedId);
        const targetIndex = nextOrder.indexOf(targetColumnId);
        if (targetIndex === -1) {
          return mergeColumnOrder([...current], columnIds);
        }
        nextOrder.splice(targetIndex, 0, draggedId);
        return nextOrder;
      });
      setDraggingColumnId(null);
    },
    [columnIds, draggingColumnId]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingColumnId(null);
  }, []);

  const moveColumn = useCallback((columnId: string, direction: 'left' | 'right') => {
    setColumnOrder((current) => {
      const index = current.indexOf(columnId);
      if (index === -1) return current;
      const targetIndex =
        direction === 'left' ? Math.max(index - 1, 0) : Math.min(index + 1, current.length - 1);
      if (targetIndex === index) return current;
      const nextOrder = [...current];
      const [removed] = nextOrder.splice(index, 1);
      nextOrder.splice(targetIndex, 0, removed);
      return nextOrder;
    });
  }, []);

  const selectedRecords = useMemo(
    () => records.filter((record) => selectedRowIds.includes(record.id)),
    [records, selectedRowIds]
  );
  const selectedCount = selectedRecords.length;

  const handleDeleteSelected = useCallback(() => {
    if (selectedCount === 0) return;
    const maybePromise = onDeleteRecords(selectedRecords);
    if (isPromise(maybePromise)) {
      maybePromise
        .then(() => setSelectedRowIds([]))
        .catch(() => {});
      return;
    }
    setSelectedRowIds([]);
  }, [onDeleteRecords, selectedCount, selectedRecords]);

  return (
    <div className="flex flex-col h-full max-h-full gap-4 p-4 overflow-hidden">
      <div className="flex justify-between items-center flex-wrap gap-3 shrink-0 flex-shrink-0">
        <div className="flex gap-2 items-center">
          <Input
            type="text"
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-[300px]"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {selectedType ? `Type: ${selectedType}` : 'All Types'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={selectedType || ALL_TYPES_VALUE}
                onValueChange={handleTypeChange}
              >
                <DropdownMenuRadioItem value={ALL_TYPES_VALUE}>All Types</DropdownMenuRadioItem>
                {selectableTypes.map((type) => (
                  <DropdownMenuRadioItem key={type} value={type}>
                    {type}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {table.getAllLeafColumns().map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {columnLabels[column.id] || column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm text-muted-foreground">
          {selectedCount > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-foreground font-medium">{selectedCount} selected</span>
              <Button size="sm" variant="destructive" onClick={handleDeleteSelected}>
                Delete selected
              </Button>
            </div>
          )}
          <span className="flex flex-wrap gap-2 items-center justify-end text-muted-foreground/80" aria-live="polite">
            <span>{recordCountLabel}</span>
            <span>• {quotaLabel}</span>
            <Sheet open={storageInfoOpen} onOpenChange={setStorageInfoOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Local storage details"
                  className="inline-flex items-center justify-center rounded-full p-1 hover:bg-muted transition-colors"
                >
                  <Info className="h-4 w-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[380px] sm:max-w-[380px]">
                <SheetHeader>
                  <SheetTitle>Local Storage</SheetTitle>
                  <SheetDescription>
                    Records are stored locally in an encrypted SQLite database inside your browser&apos;s Origin Private
                    File System (OPFS).
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4 text-sm text-muted-foreground">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Retention</h3>
                    <p className="mt-2">
                      Browsers can evict OPFS data at any time—typically when disk space is low, site data is cleared, or
                      profiles are reset. Staying under the quota reduces risk but does not guarantee persistence.
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Encryption</h3>
                    <p className="mt-2">
                      Every record is encrypted locally with your X25519/Ed25519 key pair before it is written to OPFS. Keys
                      only live in this browser profile, so losing them (or clearing site data) makes the encrypted records
                      unrecoverable. Export your keys regularly if you rely on the local vault.
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Long-term storage</h3>
                    <p className="mt-2">
                      Enable API syncing in Settings to push every record to the Supabase backend for durable storage.
                      {settings.apiSyncEnabled
                        ? ' API syncing is currently enabled.'
                        : ' API syncing is currently disabled.'}
                    </p>
                    <p className="mt-2">
                      Open Settings → toggle &quot;Sync records to API&quot; to keep a remote copy synced with your bearer token.
                    </p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={openSettingsDialog}>
                      Open Settings
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 max-h-full rounded-md border overflow-hidden">
        <div className="h-full overflow-auto">
          <Table className="[table-layout:fixed] w-full">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      draggable={!header.isPlaceholder}
                      onDragStart={(event) => {
                        if (header.isPlaceholder) return;
                        handleDragStart(event, header.column.id);
                      }}
                      onDragOver={(event) => {
                        if (header.isPlaceholder) return;
                        handleDragOver(event);
                      }}
                      onDrop={(event) => {
                        if (header.isPlaceholder) return;
                        handleDrop(event, header.column.id);
                      }}
                      onDragEnd={handleDragEnd}
                      onKeyDown={(event) => {
                        if (header.isPlaceholder) return;
                        if (event.key === 'ArrowLeft') {
                          event.preventDefault();
                          moveColumn(header.column.id, 'left');
                        } else if (event.key === 'ArrowRight') {
                          event.preventDefault();
                          moveColumn(header.column.id, 'right');
                        }
                      }}
                      tabIndex={header.isPlaceholder ? undefined : 0}
                      className={cn(draggingColumnId && header.column.id === draggingColumnId && 'opacity-60')}
                      data-column-id={header.column.id}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-2">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`} className="pointer-events-none">
                    {skeletonColumns.map((column) => (
                      <TableCell key={`${column.id}-${index}`}>
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onClick={(event) => handleRowClick(event, row.original)}
                    className={cn(
                      'cursor-pointer',
                      row.original._status === 'Uploading' && 'bg-amber-50',
                      row.original._status === 'Failed' && 'bg-red-50'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={table.getAllLeafColumns().length}
                    className="h-24 text-center"
                  >
                    {showWelcomeEmptyState ? (
                      <div className="mx-auto max-w-xl text-left space-y-3 text-sm text-muted-foreground">
                        {EMPTY_TABLE_MESSAGE.map((paragraph, index) => (
                          <p key={paragraph} className={index === 0 ? 'text-base text-foreground font-semibold' : ''}>
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No records found.
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

interface RowActionsProps {
  record: NeotomaRecord;
  onViewDetails: (record: NeotomaRecord) => void;
  onDeleteRecord: (record: NeotomaRecord) => void;
}

function RowActions({ record, onViewDetails, onDeleteRecord }: RowActionsProps) {
  const handleDelete = () => {
    const maybePromise = onDeleteRecord(record);
    if (isPromise(maybePromise)) {
      maybePromise.catch(() => {});
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 p-0"
          {...{ [ROW_INTERACTIVE_ATTR]: 'true' }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`Open actions menu for record ${record.id}`}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onPointerDownOutside={(event) => event.preventDefault()}>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onViewDetails(record);
          }}
        >
          <Eye className="mr-2 h-4 w-4" />
          View details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleDelete();
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete record
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof (value as { then?: unknown }).then === 'function';
}
