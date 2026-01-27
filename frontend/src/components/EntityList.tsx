/**
 * Entity List Component (FU-601)
 * 
 * Browse entities with filtering and search
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/components/ui/sidebar";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [schemas, setSchemas] = useState<Map<string, SchemaInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  
  // Use external search query from header or empty string
  const searchQuery = externalSearchQuery || "";
  
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  const { open, state } = useSidebar();
  
  // Prefer bearer token from keys, fallback to Supabase session token, then settings
  const bearerToken = keysBearerToken || sessionToken || settings.bearerToken;
  
  // Calculate left offset for pagination based on sidebar state
  const getLeftOffset = () => {
    if (!open) return "0";
    if (state === "collapsed") {
      return "calc(var(--sidebar-width-icon, 3rem) + 1rem)";
    }
    return "var(--sidebar-width, 16rem)";
  };
  
  // Get selected type from URL query params
  const selectedType = searchParams.get("type") || "";

  // Fetch entities from API
  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }
    
    async function fetchEntities() {
      setLoading(true);
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };
        
        // Include bearer token if available
        if (bearerToken) {
          headers["Authorization"] = `Bearer ${bearerToken}`;
        }

        // Use relative URL to go through Vite proxy (which routes to correct backend port)
        // The Vite proxy in vite.config.ts handles /api -> http://localhost:${HTTP_PORT}
        const userId = user?.id;
        const url = `/api/entities/query`;
        
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            entity_type: selectedType || undefined,
            search: searchQuery || undefined,
            limit,
            offset,
            user_id: userId,
          }),
        });
        
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error("Unauthorized - check your Bearer Token");
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const fetchedEntities = data.entities || [];
        setEntities(fetchedEntities);
        setTotalCount(data.total || 0);

        // Fetch schemas for all unique entity types
        const uniqueTypes = Array.from(new Set(fetchedEntities.map((e: Entity) => e.entity_type)));
        const schemaMap = new Map<string, SchemaInfo>();
        
        for (const entityType of uniqueTypes) {
          try {
            const schemaResponse = await fetch(`/api/schemas/${encodeURIComponent(entityType)}`, { headers });
            if (schemaResponse.ok) {
              const schemaData = await schemaResponse.json();
              const schemaDef = schemaData.schema_definition || {};
              const fields = schemaDef.fields || {};
              const fieldNames = Object.keys(fields);
              const fieldSummary: Record<string, { type: string; required: boolean }> = {};
              
              for (const [fieldName, fieldDef] of Object.entries(fields)) {
                const def = fieldDef as any;
                fieldSummary[fieldName] = {
                  type: def.type || "string",
                  required: def.required || false,
                };
              }
              
              schemaMap.set(entityType, {
                entity_type: entityType,
                field_names: fieldNames,
                field_summary: fieldSummary,
              });
            }
          } catch (error) {
            console.error(`Failed to fetch schema for ${entityType}:`, error);
          }
        }
        
        setSchemas(schemaMap);
      } catch (error) {
        console.error("Failed to fetch entities:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to fetch entities";
        setError(errorMessage);
        setEntities([]);
      } finally {
        setLoading(false);
      }
    }

    fetchEntities();
  }, [searchQuery, selectedType, offset, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {totalCount} entit{totalCount === 1 ? "y" : "ies"}
        </div>
      </div>

      <div className="flex-1 rounded-md border overflow-auto">
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
              <TableRow>
                <TableHead>Canonical name</TableHead>
                {entities.length > 0 && (() => {
                  // Get all unique field names across all entities
                  const allFields = new Set<string>();
                  entities.forEach((entity) => {
                    const schema = schemas.get(entity.entity_type);
                    if (schema) {
                      schema.field_names.forEach(field => allFields.add(field));
                    } else {
                      // If no schema, use snapshot keys
                      Object.keys(entity.snapshot || {}).forEach(key => allFields.add(key));
                    }
                  });
                  return Array.from(allFields).sort().map((fieldName) => (
                    <TableHead key={fieldName}>
                      {fieldName.split("_").map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(" ")}
                    </TableHead>
                  ));
                })()}
                <TableHead>Entity ID</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((entity) => {
                const entityId = entity.entity_id || entity.id || "unknown";
                const schema = schemas.get(entity.entity_type);
                const allFields = new Set<string>();
                if (schema) {
                  schema.field_names.forEach(field => allFields.add(field));
                } else {
                  Object.keys(entity.snapshot || {}).forEach(key => allFields.add(key));
                }
                const sortedFields = Array.from(allFields).sort();
                
                return (
                  <TableRow
                    key={entityId}
                    onClick={() => onEntityClick(entity)}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      {entity.canonical_name || "—"}
                    </TableCell>
                    {sortedFields.map((fieldName) => {
                      const value = entity.snapshot?.[fieldName];
                      return (
                        <TableCell key={fieldName}>
                          {value === null || value === undefined ? (
                            <span className="text-muted-foreground">—</span>
                          ) : typeof value === "object" ? (
                            <code className="text-xs">{JSON.stringify(value)}</code>
                          ) : (
                            String(value)
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <code className="text-xs">
                        {entityId && typeof entityId === "string" 
                          ? `${entityId.substring(0, 16)}...` 
                          : "—"}
                      </code>
                    </TableCell>
                    <TableCell>
                      {entity.last_observation_at || entity.computed_at 
                        ? new Date(entity.last_observation_at || entity.computed_at || "").toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
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
