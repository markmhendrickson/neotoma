/**
 * Entity List Component (FU-601)
 * 
 * Browse entities with filtering and search
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUpDown } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/components/ui/sidebar";
import { getEntityDisplayName } from "@/utils/entityDisplay";
import { formatEntityType } from "@/utils/entityTypeFormatter";
import { useRealtimeEntities } from "@/hooks/useRealtimeEntities";
import { ColumnDef, SortingState, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { getApiClient } from "@/lib/api_client";

export interface Entity {
  entity_id?: string;
  id?: string; // Fallback for API responses that use 'id'
  entity_type: string;
  canonical_name: string;
  schema_version?: string;
  snapshot?: Record<string, unknown>;
  raw_fragments?: Record<string, unknown>;
  observation_count?: number;
  last_observation_at?: string;
  provenance?: Record<string, unknown>;
  computed_at?: string;
  merged_to_entity_id?: string | null;
  merged_at?: string | null;
}

interface EntityListProps {
  onEntityClick: (entity: Entity) => void;
  searchQuery?: string;
}

interface SchemaField {
  field_name: string;
  type: string;
  required: boolean;
}

interface SchemaInfo {
  entity_type: string;
  field_names: string[];
  field_summary: Record<string, { type: string; required: boolean }>;
}

export function EntityList({ onEntityClick, searchQuery: externalSearchQuery }: EntityListProps) {
  const params = useParams<{ type?: string }>();
  const [fetchedEntities, setFetchedEntities] = useState<Entity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [schemas, setSchemas] = useState<Map<string, SchemaInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showAllProperties, setShowAllProperties] = useState(false);
  const limit = 50;
  
  // Use external search query from header or empty string
  const searchQuery = externalSearchQuery || "";
  
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  const { open, state } = useSidebar();
  
  // Prefer bearer token from keys, fallback to session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;
  
  // Calculate left offset for pagination based on sidebar state
  const getLeftOffset = () => {
    if (!open) return "0";
    if (state === "collapsed") {
      return "calc(var(--sidebar-width-icon, 3rem) + 1rem)";
    }
    return "var(--sidebar-width, 16rem)";
  };
  
  // Get selected type from URL path segment
  const selectedType = params.type || "";

  // Fetch entities from API
  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }
    
    async function fetchEntities() {
      setLoading(true);
      try {
        const api = getApiClient(bearerToken);
        const userId = user?.id;
        const { data, error: apiError } = await api.POST("/entities/query", {
          body: {
            entity_type: selectedType || undefined,
            search: searchQuery || undefined,
            limit,
            offset,
            user_id: userId,
          },
        });

        if (apiError) {
          throw new Error(
            typeof apiError === "object" && apiError && "error" in apiError
              ? String(apiError.error)
              : "Failed to fetch entities"
          );
        }

        if (!data) {
          throw new Error("Empty response from entities query");
        }
        const entities = data.entities || [];
        setFetchedEntities(entities);
        setTotalCount(data.total || 0);

        // Fetch schemas once, then map to entity types
        const uniqueTypes = Array.from(new Set(entities.map((e: Entity) => e.entity_type)));
        const schemaMap = new Map<string, SchemaInfo>();

        try {
          const { data: schemaData } = await api.GET("/schemas", {
            params: {
              query: userId ? { user_id: userId } : {},
            },
          });
          const schemasList = schemaData?.schemas || [];
          const schemasByType = new Map(
            schemasList.map((schema: SchemaInfo) => [schema.entity_type, schema])
          );

          for (const entityType of uniqueTypes) {
            const schemaInfo = schemasByType.get(entityType);
            if (schemaInfo) {
              schemaMap.set(entityType, schemaInfo);
            }
          }
        } catch (error) {
          console.error("Failed to fetch schema list:", error);
        }

        setSchemas(schemaMap);
      } catch (error) {
        console.error("Failed to fetch entities:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to fetch entities";
        setError(errorMessage);
        setFetchedEntities([]);
      } finally {
        setLoading(false);
      }
    }

    fetchEntities();
  }, [searchQuery, selectedType, offset, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription
  const entities = useRealtimeEntities(fetchedEntities, {
    entityType: selectedType,
    onInsert: (entity) => {
      console.log("New entity added:", entity);
    },
  });

  const allFieldNames = useMemo(() => {
    const allFields = new Set<string>();
    entities.forEach((entity) => {
      const schema = schemas.get(entity.entity_type);
      if (schema) {
        schema.field_names.forEach((field) => allFields.add(field));
      } else {
        Object.keys(entity.snapshot || {}).forEach((key) => allFields.add(key));
      }
    });
    return Array.from(allFields).sort();
  }, [entities, schemas]);

  const visibleFieldNames = useMemo(() => {
    return showAllProperties ? allFieldNames : allFieldNames.slice(0, 5);
  }, [allFieldNames, showAllProperties]);

  const hasMoreProperties = allFieldNames.length > 5;

  const pageTitle = useMemo(() => {
    if (!selectedType) return "Entities";
    return `${formatEntityType(selectedType)} entities`;
  }, [selectedType]);

  const formatValueForSort = useCallback((value: unknown) => {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }, []);

  const renderSortableHeader = useCallback((label: string, column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" }) => {
    return (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-8 px-2"
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    );
  }, []);

  const columns = useMemo<ColumnDef<Entity>[]>(() => {
    const fieldColumns = visibleFieldNames.map((fieldName) => {
      const label = fieldName
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      return {
        id: fieldName,
        header: ({ column }) => renderSortableHeader(label, column),
        accessorFn: (entity) => formatValueForSort(entity.snapshot?.[fieldName]),
        cell: ({ row }) => {
          const value = row.original.snapshot?.[fieldName];
          if (value === null || value === undefined) {
            return <span className="text-muted-foreground">—</span>;
          }
          if (typeof value === "object") {
            return <code className="text-xs">{JSON.stringify(value)}</code>;
          }
          return String(value);
        },
      } satisfies ColumnDef<Entity>;
    });

    return [
      {
        id: "canonical_name",
        header: ({ column }) => renderSortableHeader("Canonical name", column),
        accessorFn: (entity) => getEntityDisplayName(entity),
        cell: ({ row }) => <span className="font-medium">{getEntityDisplayName(row.original)}</span>,
      },
      ...fieldColumns,
      {
        id: "entity_id",
        header: ({ column }) => renderSortableHeader("Entity ID", column),
        accessorFn: (entity) => entity.entity_id || entity.id || "",
        cell: ({ row }) => {
          const entityId = row.original.entity_id || row.original.id;
          return (
            <code className="text-xs">
              {entityId && typeof entityId === "string" ? `${entityId.substring(0, 16)}...` : "—"}
            </code>
          );
        },
      },
      {
        id: "created",
        header: ({ column }) => renderSortableHeader("Created", column),
        accessorFn: (entity) => entity.last_observation_at || entity.computed_at || "",
        cell: ({ row }) => {
          const value = row.original.last_observation_at || row.original.computed_at;
          return value ? new Date(value).toLocaleDateString() : "—";
        },
      },
    ];
  }, [formatValueForSort, renderSortableHeader, visibleFieldNames]);

  const table = useReactTable({
    data: entities,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
          <div className="text-sm text-muted-foreground">
            {totalCount} entit{totalCount === 1 ? "y" : "ies"}
          </div>
        </div>
        {hasMoreProperties && (
          <Button
            variant="ghost"
            size="sm"
            className="text-sm text-muted-foreground"
            onClick={() => setShowAllProperties((prev) => !prev)}
          >
            {showAllProperties ? "Show fewer properties" : "Show all properties"}
          </Button>
        )}
      </div>

      <div className="flex-1 rounded-md border overflow-y-auto">
        {error && (
          <div className="p-4 bg-destructive/10 border-b border-destructive/20">
            <p className="text-sm text-destructive font-medium">Error</p>
            <p className="text-sm text-destructive/80 mt-1">{error}</p>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : entities.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p>No entities found</p>
              {(searchQuery || selectedType) && (
                <p className="text-sm mt-2">Try adjusting your filters</p>
              )}
            </div>
          </div>
        ) : (
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
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => onEntityClick(row.original)}
                    className="cursor-pointer hover:bg-muted/50"
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
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No entities found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Fixed Pagination at Bottom */}
      <div 
        className="fixed bottom-0 z-20 bg-background border-t px-4 py-3 flex justify-between items-center shadow-lg transition-[left] duration-200 ease-linear"
        style={{
          left: getLeftOffset(),
          right: "0",
        }}
      >
        <div className="text-sm text-muted-foreground">
          {totalCount} entit{totalCount === 1 ? "y" : "ies"}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + limit, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= totalCount}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
