import { useMemo, useState } from 'react';
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
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columnLabels: Record<string, string> = useMemo(
    () => ({
      _status: 'Status',
      id: 'ID',
      type: 'Type',
      created_at: 'Created',
      updated_at: 'Updated',
      file_urls: 'Files',
    }),
    []
  );

  const columns = useMemo<ColumnDef<NeotomaRecord>[]>(
    () => [
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
      {
        accessorKey: 'type',
        header: 'Type',
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
        cell: ({ row }) =>
          row.original.created_at ? new Date(row.original.created_at).toLocaleString() : '—',
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
        cell: ({ row }) =>
          row.original.updated_at ? new Date(row.original.updated_at).toLocaleString() : '—',
      },
      {
        accessorKey: 'file_urls',
        header: 'Files',
        cell: ({ row }) => {
          const urls = row.original.file_urls || [];
          return urls.length > 0 ? `${urls.length} file(s)` : '—';
        },
      },
    ],
    []
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
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table.getAllLeafColumns().map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={() => column.toggleVisibility()}
                >
                  {columnLabels[column.id] || column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="text-sm text-muted-foreground">
          {records.length} record{records.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="flex-1 min-h-0 max-h-full overflow-hidden rounded-md border">
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
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
