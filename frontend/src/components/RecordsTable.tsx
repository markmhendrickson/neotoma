import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, Info, MoreHorizontal, Trash2, Plus, UploadCloud, ArrowUpRight, CloudOff, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useSettings } from '@/hooks/useSettings';
import { formatRelativeTime } from '@/utils/time';
import { EmptyPlaceholder } from '@/components/EmptyPlaceholder';
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
    return (
      <span className="text-sm truncate block" title={value}>
        {value}
      </span>
    );
  }
  if (typeof value === 'number') {
    return <span className="text-sm">{value.toLocaleString()}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-sm">{value ? 'Yes' : 'No'}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="text-sm truncate block" title={JSON.stringify(value)}>
        {value.length} item(s)
      </span>
    );
  }
  if (typeof value === 'object') {
    return (
      <span className="text-sm truncate block" title={JSON.stringify(value)}>
        {Object.keys(value).length} key(s)
      </span>
    );
  }
  return <span className="text-sm">{String(value)}</span>;
}

interface RecordsTableProps {
  records: NeotomaRecord[];
  totalCount: number;
  displayCount: number;
  types: string[];
  onRecordClick: (record: NeotomaRecord) => void;
  onDeleteRecord: (record: NeotomaRecord) => Promise<void> | void;
  onDeleteRecords: (records: NeotomaRecord[]) => Promise<void> | void;
  onSearch: (query: string) => void;
  onTypeFilter: (type: string) => void;
  isLoading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onFileUploadRef?: React.MutableRefObject<((files: FileList | null) => Promise<void>) | null>;
}

const EMPTY_LEARN_MORE_SECTIONS = [
  {
    title: 'What can I store?',
    description:
      'Anything with context—PDFs, CSVs, notes, workouts, purchases, screenshots, or synced records from partner apps. Neotoma normalizes every upload so the chat agent can search across it instantly.',
  },
  {
    title: 'How do uploads work?',
    description:
      'Drop a file anywhere or paste from the clipboard. I analyze the contents, extract summaries, structured metadata, and—if it is a CSV—create per-row records you can query later.',
  },
  {
    title: 'Why connect an app?',
    description:
      'Connecting an app pipes in live data (bank feeds, notebooks, calendars, task systems, and more). Each sync becomes a set of structured records that you can reference from chat or export anywhere.',
  },
];

const SKELETON_ROW_COUNT = 6;

const COLUMN_VISIBILITY_STORAGE_KEY = 'recordsTableColumnVisibility';
const COLUMN_ORDER_STORAGE_KEY = 'recordsTableColumnOrder';
const COLUMN_WIDTH_STORAGE_KEY = 'recordsTableColumnWidths';
const MIN_COLUMN_WIDTH = 20;
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

const getStoredColumnWidths = (): Record<string, number> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return Object.entries(parsed).reduce<Record<string, number>>((acc, [key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch (error) {
    console.warn('[RecordsTable] Failed to restore column widths', error);
    return {};
  }
};

export function RecordsTable({
  records,
  totalCount,
  displayCount,
  types,
  onRecordClick,
  onDeleteRecord,
  onDeleteRecords,
  onSearch,
  onTypeFilter,
  isLoading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onFileUploadRef,
}: RecordsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const ALL_TYPES_VALUE = '__all__';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rowsClickable, setRowsClickable] = useState(true);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  
  const triggerFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (onFileUploadRef?.current) {
      onFileUploadRef.current(event.target.files);
    }
    // Reset input so same file can be selected again
    if (event.target) {
      event.target.value = '';
    }
  }, [onFileUploadRef]);
  const selectableTypes = useMemo(
    () => types.filter((type) => type && type.trim().length > 0),
    [types]
  );
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updated_at', desc: true },
  ]);
  const [baseColumnVisibility, setBaseColumnVisibility] = useState<VisibilityState>(() => getStoredColumnVisibility());
  const [persistColumnVisibility, setPersistColumnVisibility] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const [loadMoreTriggerNode, setLoadMoreTriggerNode] = useState<HTMLDivElement | null>(null);
  const handleTableScrollRef = useCallback((node: HTMLDivElement | null) => {
    tableScrollRef.current = node;
    setScrollContainer(node);
  }, []);
  const handleLoadMoreTriggerRef = useCallback((node: HTMLDivElement | null) => {
    loadMoreTriggerRef.current = node;
    setLoadMoreTriggerNode(node);
  }, []);
  const prevColumnVisibility = useRef<VisibilityState>({});
  
  // Infinite scroll: detect when user scrolls near bottom
  useEffect(() => {
    if (
      !onLoadMore ||
      !hasMore ||
      loadingMore ||
      !loadMoreTriggerNode ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      {
        root: scrollContainer ?? null,
        rootMargin: '200px',
      }
    );

    observer.observe(loadMoreTriggerNode);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, loadingMore, scrollContainer, loadMoreTriggerNode]);
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

  // Compute columnVisibility synchronously to include all property columns as hidden
  // This prevents flickering when propertyKeys changes
  const columnVisibility = useMemo(() => {
    const validPropertyColumnIds = new Set(propertyKeys.map((key) => `prop:${key}`));
    const visibility: VisibilityState = { ...baseColumnVisibility };
    
    // Remove stale property columns
    Object.keys(visibility).forEach((columnId) => {
      if (columnId.startsWith('prop:') && !validPropertyColumnIds.has(columnId)) {
        delete visibility[columnId];
      }
    });
    
    // Add new property columns as hidden by default
    propertyKeys.forEach((key) => {
      const columnId = `prop:${key}`;
      if (!(columnId in visibility)) {
        visibility[columnId] = false;
      }
    });
    
    return visibility;
  }, [baseColumnVisibility, propertyKeys]);

  // Sync baseColumnVisibility when propertyKeys change (for persistence)
  useEffect(() => {
    const validPropertyColumnIds = new Set(propertyKeys.map((key) => `prop:${key}`));
    setBaseColumnVisibility((prev) => {
      const cleaned: VisibilityState = { ...prev };
      let changed = false;
      
      // Remove stale property columns
      Object.keys(cleaned).forEach((columnId) => {
        if (columnId.startsWith('prop:') && !validPropertyColumnIds.has(columnId)) {
          delete cleaned[columnId];
          changed = true;
        }
      });

      // Add new property columns as hidden by default
      propertyKeys.forEach((key) => {
        const columnId = `prop:${key}`;
        if (!(columnId in cleaned)) {
          cleaned[columnId] = false;
          changed = true;
        }
      });
      
      if (changed) {
        setPersistColumnVisibility(false);
        return cleaned;
      }
      return prev;
    });
  }, [propertyKeys]);

  useEffect(() => {
    propertyKeys.forEach((key) => {
      const columnId = `prop:${key}`;
      const wasVisible = prevColumnVisibility.current[columnId];
      const isVisible = columnVisibility[columnId];
      if (!wasVisible && isVisible && tableScrollRef.current) {
        const container = tableScrollRef.current;
        const targetLeft = container.scrollWidth;
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({ left: targetLeft, behavior: 'smooth' });
        } else {
          container.scrollLeft = targetLeft;
        }
      }
    });
    const wasPersisting = prevColumnVisibility.current !== columnVisibility;
    prevColumnVisibility.current = { ...columnVisibility };
    if (wasPersisting) {
      setPersistColumnVisibility(true);
    }
  }, [columnVisibility, propertyKeys]);

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const columnLabels: Record<string, string> = useMemo(() => {
    const base: Record<string, string> = {
      select: 'Select',
      type: 'Type',
      summary: 'Summary',
      created_at: 'Created',
      updated_at: 'Updated',
      file_urls: 'Files',
      _status: 'Status',
      id: 'ID',
      actions: 'Actions',
    };
    propertyKeys.forEach((key) => {
      base[`prop:${key}`] = humanizePropertyKey(key);
    });
    return base;
  }, [propertyKeys]);

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
            onChange={(event) => {
              event.stopPropagation();
              handleSelectAll(event.target.checked);
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => {
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                const wasDraggable = tableHead.getAttribute('draggable') !== 'false';
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  if (wasDraggable) {
                    tableHead.setAttribute('draggable', 'true');
                  }
                }, 200);
              }
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                const wasDraggable = tableHead.getAttribute('draggable') !== 'false';
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  if (wasDraggable) {
                    tableHead.setAttribute('draggable', 'true');
                  }
                }, 200);
              }
            }}
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
        enableResizing: false,
        size: 38,
        minSize: 38,
        maxSize: 38,
      },
      {
        accessorKey: 'type',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={(event) => {
              console.log('[SortButton] onClick', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                currentTarget: (event.currentTarget as HTMLElement)?.tagName,
                defaultPrevented: event.defaultPrevented,
              });
              event.stopPropagation();
              // onClick may not fire reliably due to drag interference, so we rely on onMouseUp
            }}
            onMouseUp={(event) => {
              console.log('[SortButton] onMouseUp', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                button: event.button,
              });
              event.stopPropagation();
              // Use mouseup as primary handler since onClick may not fire due to drag interference
              // Only trigger on left mouse button (button === 0) and if not already handled
              if (event.button === 0) {
                console.log('[SortButton] onMouseUp - triggering sort');
                column.toggleSorting(column.getIsSorted() === 'asc');
              }
            }}
            onMouseDown={(event) => {
              console.log('[SortButton] onMouseDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            onPointerDown={(event) => {
              console.log('[SortButton] onPointerDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead (pointer)');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead (pointer)');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            draggable={false}
          >
            Type
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
          // Case-insensitive alphabetical sorting (ascending)
          // TanStack Table automatically reverses for descending (reverse alphabetical)
          const a = (rowA.getValue<string>(columnId) || '').toLowerCase();
          const b = (rowB.getValue<string>(columnId) || '').toLowerCase();
          return a.localeCompare(b);
        },
        cell: ({ row }) => {
          const value = row.original.type;
          return value ? <span className="truncate block" title={value}>{value}</span> : '—';
        },
      },
      {
        accessorKey: 'summary',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={(event) => {
              console.log('[SortButton] onClick', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                currentTarget: (event.currentTarget as HTMLElement)?.tagName,
                defaultPrevented: event.defaultPrevented,
              });
              event.stopPropagation();
              // onClick may not fire reliably due to drag interference, so we rely on onMouseUp
            }}
            onMouseUp={(event) => {
              console.log('[SortButton] onMouseUp', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                button: event.button,
              });
              event.stopPropagation();
              // Use mouseup as primary handler since onClick may not fire due to drag interference
              // Only trigger on left mouse button (button === 0) and if not already handled
              if (event.button === 0) {
                console.log('[SortButton] onMouseUp - triggering sort');
                column.toggleSorting(column.getIsSorted() === 'asc');
              }
            }}
            onMouseDown={(event) => {
              console.log('[SortButton] onMouseDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            onPointerDown={(event) => {
              console.log('[SortButton] onPointerDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead (pointer)');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead (pointer)');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            draggable={false}
          >
            Summary
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
          // Case-insensitive alphabetical sorting (ascending)
          // TanStack Table automatically reverses for descending (reverse alphabetical)
          const a = (rowA.getValue<string>(columnId) || '').toLowerCase();
          const b = (rowB.getValue<string>(columnId) || '').toLowerCase();
          return a.localeCompare(b);
        },
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
            onClick={(event) => {
              console.log('[SortButton] onClick', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                currentTarget: (event.currentTarget as HTMLElement)?.tagName,
                defaultPrevented: event.defaultPrevented,
              });
              event.stopPropagation();
              // onClick may not fire reliably due to drag interference, so we rely on onMouseUp
            }}
            onMouseUp={(event) => {
              console.log('[SortButton] onMouseUp', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                button: event.button,
              });
              event.stopPropagation();
              // Use mouseup as primary handler since onClick may not fire due to drag interference
              // Only trigger on left mouse button (button === 0) and if not already handled
              if (event.button === 0) {
                console.log('[SortButton] onMouseUp - triggering sort');
                column.toggleSorting(column.getIsSorted() === 'asc');
              }
            }}
            onMouseDown={(event) => {
              console.log('[SortButton] onMouseDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            onPointerDown={(event) => {
              console.log('[SortButton] onPointerDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead (pointer)');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead (pointer)');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            draggable={false}
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
            onClick={(event) => {
              console.log('[SortButton] onClick', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                currentTarget: (event.currentTarget as HTMLElement)?.tagName,
                defaultPrevented: event.defaultPrevented,
              });
              event.stopPropagation();
              // onClick may not fire reliably due to drag interference, so we rely on onMouseUp
            }}
            onMouseUp={(event) => {
              console.log('[SortButton] onMouseUp', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                button: event.button,
              });
              event.stopPropagation();
              // Use mouseup as primary handler since onClick may not fire due to drag interference
              // Only trigger on left mouse button (button === 0) and if not already handled
              if (event.button === 0) {
                console.log('[SortButton] onMouseUp - triggering sort');
                column.toggleSorting(column.getIsSorted() === 'asc');
              }
            }}
            onMouseDown={(event) => {
              console.log('[SortButton] onMouseDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            onPointerDown={(event) => {
              console.log('[SortButton] onPointerDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead (pointer)');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead (pointer)');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            draggable={false}
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
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={(event) => {
              console.log('[SortButton] onClick', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                currentTarget: (event.currentTarget as HTMLElement)?.tagName,
                defaultPrevented: event.defaultPrevented,
              });
              event.stopPropagation();
              // onClick may not fire reliably due to drag interference, so we rely on onMouseUp
            }}
            onMouseUp={(event) => {
              console.log('[SortButton] onMouseUp', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                button: event.button,
              });
              event.stopPropagation();
              // Use mouseup as primary handler since onClick may not fire due to drag interference
              // Only trigger on left mouse button (button === 0) and if not already handled
              if (event.button === 0) {
                console.log('[SortButton] onMouseUp - triggering sort');
                column.toggleSorting(column.getIsSorted() === 'asc');
              }
            }}
            onMouseDown={(event) => {
              console.log('[SortButton] onMouseDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            onPointerDown={(event) => {
              console.log('[SortButton] onPointerDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead (pointer)');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead (pointer)');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            draggable={false}
          >
            Files
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
          const a = rowA.getValue<string[]>(columnId) || [];
          const b = rowB.getValue<string[]>(columnId) || [];
          return a.length - b.length;
        },
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
            onClick={(event) => {
              console.log('[SortButton] onClick', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                currentTarget: (event.currentTarget as HTMLElement)?.tagName,
                defaultPrevented: event.defaultPrevented,
              });
              event.stopPropagation();
              // onClick may not fire reliably due to drag interference, so we rely on onMouseUp
            }}
            onMouseUp={(event) => {
              console.log('[SortButton] onMouseUp', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                button: event.button,
              });
              event.stopPropagation();
              // Use mouseup as primary handler since onClick may not fire due to drag interference
              // Only trigger on left mouse button (button === 0) and if not already handled
              if (event.button === 0) {
                console.log('[SortButton] onMouseUp - triggering sort');
                column.toggleSorting(column.getIsSorted() === 'asc');
              }
            }}
            onMouseDown={(event) => {
              console.log('[SortButton] onMouseDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            onPointerDown={(event) => {
              console.log('[SortButton] onPointerDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead (pointer)');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead (pointer)');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            draggable={false}
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
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={(event) => {
              console.log('[SortButton] onClick', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                currentTarget: (event.currentTarget as HTMLElement)?.tagName,
                defaultPrevented: event.defaultPrevented,
              });
              event.stopPropagation();
              // onClick may not fire reliably due to drag interference, so we rely on onMouseUp
            }}
            onMouseUp={(event) => {
              console.log('[SortButton] onMouseUp', { 
                columnId: column.id, 
                target: (event.target as HTMLElement)?.tagName,
                button: event.button,
              });
              event.stopPropagation();
              // Use mouseup as primary handler since onClick may not fire due to drag interference
              // Only trigger on left mouse button (button === 0) and if not already handled
              if (event.button === 0) {
                console.log('[SortButton] onMouseUp - triggering sort');
                column.toggleSorting(column.getIsSorted() === 'asc');
              }
            }}
            onMouseDown={(event) => {
              console.log('[SortButton] onMouseDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            onPointerDown={(event) => {
              console.log('[SortButton] onPointerDown', { columnId: column.id, target: event.target });
              event.stopPropagation();
              // Prevent drag from starting on the parent TableHead
              const tableHead = (event.target as HTMLElement).closest('th');
              if (tableHead) {
                console.log('[SortButton] Disabling drag on TableHead (pointer)');
                tableHead.setAttribute('draggable', 'false');
                setTimeout(() => {
                  console.log('[SortButton] Re-enabling drag on TableHead (pointer)');
                  tableHead.setAttribute('draggable', 'true');
                }, 200);
              }
            }}
            draggable={false}
          >
            ID
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
          // Case-insensitive alphabetical sorting (ascending)
          // TanStack Table automatically reverses for descending (reverse alphabetical)
          const a = (rowA.getValue<string>(columnId) || '').toLowerCase();
          const b = (rowB.getValue<string>(columnId) || '').toLowerCase();
          return a.localeCompare(b);
        },
        cell: ({ row }) => <span className="font-mono text-xs truncate block" title={row.original.id}>{row.original.id}</span>,
      },
      ...propertyColumns,
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        enableResizing: false,
        cell: ({ row }) => (
          <RowActions
            record={row.original}
            onViewDetails={onRecordClick}
            onDeleteRecord={onDeleteRecord}
          />
        ),
        size: 60,
        minSize: 60,
        maxSize: 60,
      },
    ],
    [
      handleSelectAll,
      isAllSelected,
      isPartiallySelected,
      onDeleteRecord,
      onRecordClick,
      propertyColumns,
      records.length,
      selectedRowIds,
      toggleRecordSelection,
    ]
  );

  const columnIds = useMemo(
    () => columns.map((column) => getColumnIdentifier(column)).filter((id): id is string => Boolean(id)),
    [columns]
  );
  const [columnOrder, setColumnOrderState] = useState<string[]>(() =>
    ensureSelectColumnFirst(getStoredColumnOrder(columnIds))
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => getStoredColumnWidths());
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
  const [emptyLearnMoreOpen, setEmptyLearnMoreOpen] = useState(false);
  const { settings } = useSettings();
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [resizingState, setResizingState] = useState<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    if (!persistColumnVisibility) {
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(baseColumnVisibility));
    } catch (error) {
      console.warn('[RecordsTable] Failed to persist column visibility', error);
    }
  }, [baseColumnVisibility, persistColumnVisibility]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch (error) {
      console.warn('[RecordsTable] Failed to persist column widths', error);
    }
  }, [columnWidths]);

  const table = useReactTable({
    data: records,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setBaseColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = useCallback(
    (event: React.MouseEvent<HTMLTableRowElement>, record: NeotomaRecord) => {
      if (!rowsClickable) {
        console.log('[RecordsTable] Row clicks disabled - use window.toggleRowClicks() to enable');
        return;
      }

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
    [onRecordClick, rowsClickable]
  );

  // Expose toggle function to window for console debugging
  useEffect(() => {
    (window as any).toggleRowClicks = () => {
      setRowsClickable((prev) => {
        const newValue = !prev;
        console.log(`[RecordsTable] Row clicks ${newValue ? 'enabled' : 'disabled'}`);
        return newValue;
      });
    };
    (window as any).getRowClicksEnabled = () => {
      console.log(`[RecordsTable] Row clicks are ${rowsClickable ? 'enabled' : 'disabled'}`);
      return rowsClickable;
    };
    return () => {
      delete (window as any).toggleRowClicks;
      delete (window as any).getRowClicksEnabled;
    };
  }, [rowsClickable]);

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
    totalCount
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
    setEmptyLearnMoreOpen(false);
  }, []);

  const quotaMessage = useMemo(() => {
    if (!quotaSupported) return 'Local storage quota unsupported in this browser';
    if (quotaLoading) return 'Checking local storage…';
    if (usage === null || quota === null || quota === 0) return 'Storage quota unavailable';

    const percent = usagePercent ?? (usage / quota) * 100;
    const percentText = percent >= 0 && percent < 1 ? '<1%' : `${percent.toFixed(0)}%`;

    return `${formatBytes(usage)} of ${formatBytes(quota)} (${percentText})`;
  }, [formatBytes, quotaSupported, quotaLoading, usage, quota, usagePercent]);

  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => !isLoading || records.length > 0);
  useEffect(() => {
    if (!isLoading || records.length > 0) {
      setHasLoadedOnce(true);
    }
  }, [isLoading, records.length]);

  const isInitialLoading = !hasLoadedOnce && isLoading && records.length === 0;
  const showWelcomeEmptyState = !isInitialLoading && records.length === 0 && !searchQuery.trim() && !selectedType;
  const showEmptyPlaceholder = !isInitialLoading && table.getRowModel().rows.length === 0;
  const visibleColumns = table.getVisibleLeafColumns();
  // Always use visible columns for skeleton to respect column visibility settings
  const skeletonColumns = visibleColumns;
  const formatRecordCount = useCallback(
    (count: number) => `${count} record${count === 1 ? '' : 's'}`,
    []
  );
  const recordCountLabel = isInitialLoading
    ? 'Loading records…'
    : displayCount === totalCount
    ? formatRecordCount(displayCount)
    : `${displayCount} of ${formatRecordCount(totalCount)}`;
  const quotaLabel = isInitialLoading ? 'Calculating usage…' : quotaMessage;

  const handleDragStart = useCallback(
    (event: React.DragEvent, columnId: string) => {
      // Prevent drag if the event originated from a sort button or interactive element
      const target = event.target as HTMLElement;
      const isButton = target.closest('button');
      const isDraggableFalse = target.closest('[draggable="false"]');
      
      console.log('[DragStart]', {
        columnId,
        target: target.tagName,
        targetClass: target.className,
        isButton: !!isButton,
        isDraggableFalse: !!isDraggableFalse,
        buttonElement: isButton?.tagName,
        buttonText: isButton?.textContent?.trim(),
      });
      
      if (isButton || isDraggableFalse) {
        console.log('[DragStart] Prevented - button or draggable=false detected');
        event.preventDefault();
        return;
      }
      
      console.log('[DragStart] Allowing drag');
      setDraggingColumnId(columnId);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', columnId);
    },
    []
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, targetColumnId: string) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      
      const draggedId = draggingColumnId || event.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === targetColumnId) {
        setDragOverColumnId(null);
        return;
      }
      
      // Update column order in real-time during drag
      if (dragOverColumnId !== targetColumnId) {
        setDragOverColumnId(targetColumnId);
        setColumnOrder((current) => {
          const nextOrder = current.filter((id) => id !== draggedId);
          const targetIndex = nextOrder.indexOf(targetColumnId);
          if (targetIndex === -1) {
            return mergeColumnOrder([...current], columnIds);
          }
          nextOrder.splice(targetIndex, 0, draggedId);
          return nextOrder;
        });
      }
    },
    [columnIds, draggingColumnId, dragOverColumnId]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent, targetColumnId: string) => {
      event.preventDefault();
      const draggedId = draggingColumnId || event.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === targetColumnId) {
        setDraggingColumnId(null);
        setDragOverColumnId(null);
        return;
      }
      // Column order is already updated during drag, just clean up state
      setDraggingColumnId(null);
      setDragOverColumnId(null);
    },
    [draggingColumnId]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingColumnId(null);
    setDragOverColumnId(null);
  }, []);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, columnId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const headerElement = event.currentTarget.closest('[data-column-id]') as HTMLElement | null;
      const measuredWidth = headerElement?.getBoundingClientRect().width ?? 0;
      const fallbackWidth = columnWidths[columnId] ?? 150;
      const startWidth = measuredWidth > 0 ? measuredWidth : fallbackWidth;
      setResizingState({
        columnId,
        startX: event.clientX,
        startWidth,
      });
    },
    [columnWidths]
  );

  useEffect(() => {
    if (!resizingState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - resizingState.startX;
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(resizingState.startWidth + delta));
      setColumnWidths((current) => {
        if (current[resizingState.columnId] === nextWidth) {
          return current;
        }
        return {
          ...current,
          [resizingState.columnId]: nextWidth,
        };
      });
    };

    const handleMouseUp = () => {
      setResizingState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingState]);

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
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9"
            onClick={triggerFileDialog}
            disabled={isInitialLoading}
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Upload files</span>
          </Button>
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
                  onCheckedChange={(checked) => {
                    column.toggleVisibility(checked === true);
                    setPersistColumnVisibility(true);
                  }}
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
                  {settings.cloudStorageEnabled ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <CloudOff className="h-4 w-4" />
                  )}
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
                      Enable Cloud Storage in Settings to push every record to the Supabase backend for durable storage.
                      {settings.cloudStorageEnabled
                        ? ' Cloud storage is currently enabled.'
                        : ' Cloud storage is currently disabled.'}
                    </p>
                    <p className="mt-2">
                      Open Settings → toggle &quot;Enable Cloud Storage&quot; to keep a remote copy synced with your bearer token.
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
      <div
        className="flex-1 min-h-0 max-h-full rounded-md border overflow-hidden"
        key={`${searchQuery}-${selectedType}`}
      >
        <div className="h-full overflow-auto" ref={handleTableScrollRef}>
          {showEmptyPlaceholder ? (
            <div className="flex h-full items-center justify-center px-6 py-10">
              {showWelcomeEmptyState ? (
                <EmptyPlaceholder className="max-w-xl space-y-4">
                  <EmptyPlaceholder.Icon>
                    <UploadCloud className="h-6 w-6" />
                  </EmptyPlaceholder.Icon>
                  <EmptyPlaceholder.Title>No records yet</EmptyPlaceholder.Title>
                  <EmptyPlaceholder.Description>
                    Get started by uploading a file or connecting an app.
                  </EmptyPlaceholder.Description>
                  <EmptyPlaceholder.Actions>
                    <div className="flex flex-wrap justify-center gap-3">
                      <Button type="button" onClick={triggerFileDialog} disabled={isInitialLoading} className="px-6">
                        Upload file
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openSettingsDialog}
                        className="px-6"
                      >
                        Connect app
                      </Button>
                    </div>
                    <Sheet open={emptyLearnMoreOpen} onOpenChange={setEmptyLearnMoreOpen}>
                      <SheetTrigger asChild>
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Learn more
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </SheetTrigger>
                      <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
                        <SheetHeader>
                          <SheetTitle>What happens when I add records?</SheetTitle>
                          <SheetDescription>
                            Neotoma structures every input so you can recall it instantly from chat.
                          </SheetDescription>
                        </SheetHeader>
                        <div className="mt-6 space-y-6 text-sm text-muted-foreground">
                          {EMPTY_LEARN_MORE_SECTIONS.map((section) => (
                            <div key={section.title}>
                              <h3 className="text-base font-semibold text-foreground">{section.title}</h3>
                              <p className="mt-2 leading-relaxed">{section.description}</p>
                            </div>
                          ))}
                        </div>
                      </SheetContent>
                    </Sheet>
                  </EmptyPlaceholder.Actions>
                </EmptyPlaceholder>
              ) : (
                <EmptyPlaceholder className="max-w-lg space-y-4">
                  <EmptyPlaceholder.Icon>
                    <UploadCloud className="h-6 w-6" />
                  </EmptyPlaceholder.Icon>
                  <EmptyPlaceholder.Title>No records match</EmptyPlaceholder.Title>
                  <EmptyPlaceholder.Description>
                    Adjust your search or filters, or reset them to see all records again.
                  </EmptyPlaceholder.Description>
                  <EmptyPlaceholder.Actions>
                    <Button type="button" onClick={triggerFileDialog} disabled={isInitialLoading} className="px-6">
                      Upload file
                    </Button>
                  </EmptyPlaceholder.Actions>
                </EmptyPlaceholder>
              )}
            </div>
          ) : (
            <Fragment>
              <Table className="table-fixed w-full">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.filter((header) => header.column.getIsVisible()).map((header) => {
                      const width = columnWidths[header.column.id];
                      const style = width ? { width: `${width}px` } : undefined;
                      const resizeLabel = columnLabels[header.column.id] || header.column.id;
                      return (
                        <TableHead
                          key={header.id}
                          draggable={!header.isPlaceholder}
                          onDragStart={(event) => {
                            if (header.isPlaceholder) return;
                            const target = event.target as HTMLElement;
                            const isButton = target.closest('button');
                            const isDraggableFalse = target.closest('[draggable="false"]');

                            console.log('[TableHead] onDragStart', {
                              columnId: header.column.id,
                              target: target.tagName,
                              targetClass: target.className,
                              isButton: !!isButton,
                              isDraggableFalse: !!isDraggableFalse,
                            });

                            // Prevent drag if clicking on a button
                            if (isButton || isDraggableFalse) {
                              console.log('[TableHead] Preventing drag - button detected');
                              event.preventDefault();
                              event.stopPropagation();
                              return;
                            }

                            handleDragStart(event, header.column.id);
                          }}
                          onMouseDown={(event) => {
                            const target = event.target as HTMLElement;
                            const isButton = target.closest('button');
                            console.log('[TableHead] onMouseDown', {
                              columnId: header.column.id,
                              target: target.tagName,
                              targetClass: target.className,
                              isButton: !!isButton,
                              buttonElement: isButton,
                            });

                            // If clicking on a button, disable dragging immediately
                            if (isButton) {
                              console.log('[TableHead] MouseDown on button - disabling drag');
                              const tableHead = event.currentTarget as HTMLElement;
                              tableHead.setAttribute('draggable', 'false');
                              // Re-enable after a delay to allow click to complete
                              setTimeout(() => {
                                if (!header.isPlaceholder) {
                                  tableHead.setAttribute('draggable', 'true');
                                }
                              }, 300);
                            }
                          }}
                          onDragOver={(event) => {
                            if (header.isPlaceholder) return;
                            handleDragOver(event, header.column.id);
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
                          className={cn(
                            'relative group overflow-hidden',
                            draggingColumnId && header.column.id === draggingColumnId && 'opacity-60'
                          )}
                          data-column-id={header.column.id}
                          style={style}
                        >
                          {header.isPlaceholder ? null : (
                            <>
                              <div className="flex items-center gap-2">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </div>
                              {header.column.columnDef.enableResizing !== false && (
                                <div
                                  role="separator"
                                  aria-orientation="vertical"
                                  aria-label={`Resize ${resizeLabel} column`}
                                  className={cn(
                                    'absolute top-0 right-0 h-full w-2 cursor-col-resize select-none flex items-center justify-center',
                                    resizingState?.columnId === header.column.id && 'bg-primary/10'
                                  )}
                                  onMouseDown={(event) => handleResizeStart(event, header.column.id)}
                                  draggable={false}
                                >
                                  <div
                                    className={cn(
                                      'h-8 w-[2px] rounded-full transition-colors',
                                      resizingState?.columnId === header.column.id
                                        ? 'bg-primary'
                                        : 'bg-border/40'
                                    )}
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isInitialLoading ? (
                  Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className="pointer-events-none">
                      {skeletonColumns.map((column) => {
                        const width = columnWidths[column.id];
                        const style = width ? { width: `${width}px` } : undefined;
                        return (
                          <TableCell key={`${column.id}-${index}`} style={style}>
                            <div className="h-4 w-full animate-pulse rounded bg-muted" />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() ? 'selected' : undefined}
                      onClick={rowsClickable ? (event) => handleRowClick(event, row.original) : undefined}
                      className={cn(
                        rowsClickable ? 'cursor-pointer' : 'cursor-default',
                        row.original._status === 'Uploading' && 'bg-amber-50',
                        row.original._status === 'Failed' && 'bg-red-50'
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const width = columnWidths[cell.column.id];
                        const style = width ? { width: `${width}px` } : undefined;
                        return (
                          <TableCell key={cell.id} style={style} className="overflow-hidden">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {hasMore && (
              <div ref={handleLoadMoreTriggerRef} className="h-4 w-full flex-shrink-0" />
            )}
            {loadingMore && (
              <div className="flex items-center justify-center py-4 flex-shrink-0">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading more records...</span>
              </div>
            )}
            </Fragment>
          )}
        </div>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
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
          onMouseUp={(event) => {
            event.stopPropagation();
            // Ensure click works even if drag interferes
            if (event.button === 0) {
              // The DropdownMenuTrigger will handle opening the menu
            }
          }}
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
