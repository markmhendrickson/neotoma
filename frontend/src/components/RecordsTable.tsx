import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { NeotomaRecord } from '@/types/record';
import { STATUS_ORDER } from '@/types/record';
import { ArrowUpDown, ArrowUp, ArrowDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useSettings } from '@/hooks/useSettings';
import { formatRelativeTime } from '@/utils/time';
import { humanizePropertyKey } from '@/utils/property_keys';

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

function renderPropertyValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'string') {
    return <span className="text-sm truncate block" title={value}>{value}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-sm">{value.toLocaleString()}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-sm">{value ? 'Yes' : 'No'}</span>;
  }
  if (Array.isArray(value)) {
    return <span className="text-sm truncate block" title={JSON.stringify(value)}>{value.length} item(s)</span>;
  }
  if (typeof value === 'object') {
    return <span className="text-sm truncate block" title={JSON.stringify(value)}>{Object.keys(value).length} key(s)</span>;
  }
  return <span className="text-sm">{String(value)}</span>;
}

interface RecordsTableProps {
  records: NeotomaRecord[];
  types: string[];
  onRecordClick: (record: NeotomaRecord) => void;
  onSearch: (query: string) => void;
  onTypeFilter: (type: string) => void;
}

const EMPTY_TABLE_MESSAGE = [
  'Welcome to Neotoma—your personal operating system for ingesting files, structuring their contents, and recalling the things you have captured.',
  'Ask me questions like "Summarize my latest uploads" or "Show workout logs from last week."',
  'To add new information, drag files into the chat, drop them on the page, or paste them from your clipboard and I will import and categorize them for you.',
];

const COLUMN_VISIBILITY_STORAGE_KEY = 'recordsTableColumnVisibility';
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.freeze({
  _status: false,
  id: false,
  updated_at: false,
  file_urls: false,
});

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

export function RecordsTable({
  records,
  types,
  onRecordClick,
  onSearch,
  onTypeFilter,
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
  const [storageInfoOpen, setStorageInfoOpen] = useState(false);
  const { settings } = useSettings();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const prevColumnVisibility = useRef(columnVisibility);

  // Derive all unique property keys from records
  const propertyKeys = useMemo(() => {
    const keys = new Set<string>();
    records.forEach((record) => {
      if (record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)) {
        Object.keys(record.properties).forEach((key) => {
          if (key && typeof key === 'string') {
            keys.add(key);
          }
        });
      }
    });
    return Array.from(keys).sort((a, b) =>
      humanizePropertyKey(a).localeCompare(humanizePropertyKey(b), undefined, { sensitivity: 'base' })
    );
  }, [records]);

  // Prune stale property column IDs from visibility state
  useEffect(() => {
    const validPropertyColumnIds = new Set(propertyKeys.map((key) => `prop:${key}`));
    setColumnVisibility((prev) => {
      const cleaned: VisibilityState = { ...prev };
      let changed = false;
      // Remove visibility entries for property columns that no longer exist
      Object.keys(cleaned).forEach((columnId) => {
        if (columnId.startsWith('prop:') && !validPropertyColumnIds.has(columnId)) {
          delete cleaned[columnId];
          changed = true;
        }
      });
      return changed ? cleaned : prev;
    });
  }, [propertyKeys]);

  // Hide newly discovered property columns by default
  useEffect(() => {
    setColumnVisibility((prev) => {
      let changed = false;
      const next: VisibilityState = { ...prev };
      propertyKeys.forEach((key) => {
        const columnId = `prop:${key}`;
        if (!(columnId in next)) {
          next[columnId] = false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [propertyKeys]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch (error) {
      console.warn('[RecordsTable] Failed to persist column visibility', error);
    }
  }, [columnVisibility]);

  useEffect(() => {
    propertyKeys.forEach((key) => {
      const columnId = `prop:${key}`;
      const wasVisible = prevColumnVisibility.current[columnId];
      const isVisible = columnVisibility[columnId];
      if (!wasVisible && isVisible && tableScrollRef.current) {
        const container = tableScrollRef.current;
        const targetLeft = container.scrollWidth;
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({
            left: targetLeft,
            behavior: 'smooth',
          });
        } else {
          container.scrollLeft = targetLeft;
        }
      }
    });
    prevColumnVisibility.current = columnVisibility;
  }, [columnVisibility, propertyKeys]);

  const columnLabels: Record<string, string> = useMemo(
    () => {
      const base: Record<string, string> = {
        type: 'Type',
        summary: 'Summary',
        created_at: 'Created',
        updated_at: 'Updated',
        file_urls: 'Files',
        _status: 'Status',
        id: 'ID',
      };
      // Add labels for property columns
      propertyKeys.forEach((key) => {
        const propColumnId = `prop:${key}`;
        base[propColumnId] = humanizePropertyKey(key);
      });
      return base;
    },
    [propertyKeys]
  );

  // Create property column definitions
  const propertyColumns = useMemo<ColumnDef<NeotomaRecord>[]>(
    () =>
      propertyKeys.map((key) => ({
        id: `prop:${key}`,
        accessorFn: (row) => {
          const props = row.properties;
          if (!props || typeof props !== 'object' || Array.isArray(props)) {
            return undefined;
          }
          return (props as Record<string, unknown>)[key];
        },
        header: humanizePropertyKey(key),
        cell: ({ row }) => {
          const props = row.original.properties;
          if (!props || typeof props !== 'object' || Array.isArray(props)) {
            return '—';
          }
          const value = (props as Record<string, unknown>)[key];
          return renderPropertyValue(value);
        },
      })),
    [propertyKeys]
  );

  const columns = useMemo<ColumnDef<NeotomaRecord>[]>(
    () => [
      {
        accessorKey: 'type',
        header: 'Type',
      },
      {
        accessorKey: 'summary',
        header: 'Summary',
        cell: ({ row }) => {
          const value = row.original.summary;
          return value ? <span className="text-sm">{value}</span> : '—';
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
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      ...propertyColumns,
    ],
    [propertyColumns]
  );

  const table = useReactTable({
    data: records,
    columns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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

  const showWelcomeEmptyState = records.length === 0 && !searchQuery.trim() && !selectedType;

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
            <DropdownMenuContent align="start" className="w-48 max-h-[60vh] overflow-auto">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table.getAllLeafColumns().map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
                >
                  {columnLabels[column.id] || column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="text-sm text-muted-foreground flex flex-wrap gap-2 items-center">
          <span>
            {records.length} record{records.length !== 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground/80 flex items-center gap-1" aria-live="polite">
            • {quotaMessage}
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
        <div className="h-full overflow-auto" ref={tableScrollRef}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onClick={() => onRecordClick(row.original)}
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
