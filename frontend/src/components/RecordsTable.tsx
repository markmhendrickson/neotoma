import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { NeotomaRecord } from '@/types/record';
import { STATUS_ORDER } from '@/types/record';

declare global {
  interface Window {
    Tabulator: any;
  }
}

interface RecordsTableProps {
  records: NeotomaRecord[];
  types: string[];
  onRecordClick: (record: NeotomaRecord) => void;
  onSearch: (query: string) => void;
  onTypeFilter: (type: string) => void;
}

export function RecordsTable({
  records,
  types,
  onRecordClick,
  onSearch,
  onTypeFilter,
}: RecordsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const tableInstanceRef = useRef<any>(null);
  const tableBuiltRef = useRef<boolean>(false);
  const pendingRecordsRef = useRef<NeotomaRecord[]>(records);
  const hiddenColumnsRef = useRef<string[]>([]);
  const [isTableReady, setIsTableReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const ALL_TYPES_VALUE = '__all__';
  const selectableTypes = useMemo(
    () => types.filter((type) => type && type.trim().length > 0),
    [types]
  );
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  useEffect(() => {
    (window as any).__neotomaTypes = types;
  }, [types]);

  const columnDefinitions = useMemo(
    () => [
      {
        title: 'Status',
        field: '_status',
        width: 120,
        sorter: (a: string, b: string) =>
          (STATUS_ORDER[a as keyof typeof STATUS_ORDER] ?? STATUS_ORDER.Ready) -
          (STATUS_ORDER[b as keyof typeof STATUS_ORDER] ?? STATUS_ORDER.Ready),
        formatter: (cell: any) => {
          const value = cell.getValue() || 'Ready';
          if (value === 'Uploading') return 'Uploading…';
          if (value === 'Failed') return 'Failed';
          return 'Ready';
        },
      },
      { title: 'ID', field: 'id', width: 200, sorter: 'string' },
      { title: 'Type', field: 'type', width: 150, sorter: 'string' },
      {
        title: 'Created',
        field: 'created_at',
        width: 180,
        sorter: (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime(),
        formatter: (cell: any) => {
          const date = new Date(cell.getValue());
          return date.toLocaleString();
        },
      },
      {
        title: 'Updated',
        field: 'updated_at',
        width: 180,
        sorter: (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime(),
        formatter: (cell: any) => {
          const date = new Date(cell.getValue());
          return date.toLocaleString();
        },
      },
      {
        title: 'Files',
        field: 'file_urls',
        width: 100,
        formatter: (cell: any) => {
          const urls = cell.getValue() || [];
          return urls.length > 0 ? `${urls.length} file(s)` : '—';
        },
      },
    ],
    []
  );

  const columnOptions = useMemo(
    () =>
      columnDefinitions
        .filter((col) => typeof col.field === 'string')
        .map((col) => ({
          field: col.field as string,
          title: col.title as string,
        })),
    [columnDefinitions]
  );

  const applyColumnVisibility = (hiddenList: string[]) => {
    if (!tableInstanceRef.current) return;
    columnOptions.forEach(({ field }) => {
      const column = tableInstanceRef.current.getColumn(field);
      if (!column) return;
      if (hiddenList.includes(field)) {
        column.hide();
      } else {
        column.show();
      }
    });
  };

  useEffect(() => {
    if (!tableRef.current) return;

    // Wait for Tabulator to be available
    const initTable = () => {
      if (!window.Tabulator) {
        setTimeout(initTable, 100);
        return;
      }

      const TabulatorClass = window.Tabulator;
      if (!tableRef.current) return;

      const columns = columnDefinitions.map((column) => ({ ...column }));

      const table = new TabulatorClass(tableRef.current, {
        data: [], // Start with empty data, set it after table is built
        layout: 'fitColumns',
        height: tableRef.current.clientHeight,
        selectable: 1,
        movableColumns: true,
        virtualDom: true,
        virtualDomBuffer: 300,
        columns: columns,
        rowFormatter: (row: any) => {
          const data = row.getData();
          const el = row.getElement();
          el.classList.remove('row-uploading', 'row-error');
          if (data._status === 'Uploading') {
            el.classList.add('row-uploading');
          } else if (data._status === 'Failed') {
            el.classList.add('row-error');
          }
        },
      });

      table.on('rowClick', (_e: any, row: any) => {
        onRecordClick(row.getData());
      });

      // Wait for table to be built before allowing data updates
      table.on('tableBuilt', () => {
        tableBuiltRef.current = true;
        setIsTableReady(true);
        // Set pending records after table is built - use setTimeout to ensure table is fully ready
        setTimeout(() => {
          if (pendingRecordsRef.current.length > 0 && tableInstanceRef.current && tableBuiltRef.current) {
            try {
              tableInstanceRef.current.setData(pendingRecordsRef.current);
            } catch (error) {
              // Silently ignore - table might not be fully ready
            }
          }
          applyColumnVisibility(hiddenColumnsRef.current);
        }, 100);
      });

      tableInstanceRef.current = table;
    };

    initTable();

    return () => {
      if (tableInstanceRef.current) {
        tableInstanceRef.current.destroy();
        tableInstanceRef.current = null;
        tableBuiltRef.current = false;
        setIsTableReady(false);
      }
    };
  }, [onRecordClick]); // Remove records from deps - we'll update separately

  useEffect(() => {
    hiddenColumnsRef.current = hiddenColumns;
    if (!tableInstanceRef.current || !isTableReady) return;
    applyColumnVisibility(hiddenColumns);
  }, [hiddenColumns, isTableReady]);

  // Update table data when records change - only after table is built
  useEffect(() => {
    pendingRecordsRef.current = records;
    
    if (!tableInstanceRef.current || !isTableReady) {
      return;
    }

    // Use requestAnimationFrame to ensure table is ready
    requestAnimationFrame(() => {
      if (tableInstanceRef.current && isTableReady) {
        try {
          tableInstanceRef.current.setData(records);
        } catch (error) {
          // Silently ignore - table might not be fully ready
        }
      }
    });
  }, [records, isTableReady]);

  // Handle resize - only set up after table is built
  useEffect(() => {
    if (!tableRef.current || !tableInstanceRef.current || !isTableReady) {
      // Wait for table to be built before setting up resize observer
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (tableInstanceRef.current && tableRef.current && isTableReady) {
        try {
          tableInstanceRef.current.setHeight(tableRef.current.clientHeight);
        } catch (error) {
          // Silently ignore - table might not be fully ready
        }
      }
    });

    resizeObserver.observe(tableRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isTableReady]); // Re-run when table is built

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    onSearch(query);
  };

  const handleTypeChange = (type: string) => {
    const normalized = type === ALL_TYPES_VALUE ? '' : type;
    setSelectedType(normalized);
    onTypeFilter(normalized);
  };

  const handleColumnVisibilityChange = (field: string, visible: boolean) => {
    setHiddenColumns((prev) => {
      if (!visible) {
        return prev.includes(field) ? prev : [...prev, field];
      }
      return prev.filter((f) => f !== field);
    });
  };

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
          <Select value={selectedType || ALL_TYPES_VALUE} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES_VALUE}>All Types</SelectItem>
              {selectableTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {columnOptions.map(({ field, title }) => (
                <DropdownMenuCheckboxItem
                  key={field}
                  checked={!hiddenColumns.includes(field)}
                  onCheckedChange={(checked) =>
                    handleColumnVisibilityChange(field, Boolean(checked))
                  }
                >
                  {title}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="text-sm text-muted-foreground">
          {records.length} record{records.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div ref={tableRef} className="flex-1 min-h-0 max-h-full border rounded-lg overflow-auto" />
    </div>
  );
}
