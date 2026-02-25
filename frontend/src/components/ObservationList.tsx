/**
 * Observation List Component
 * 
 * Browse observations with filtering and search
 */

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeObservations } from "@/hooks/useRealtimeObservations";
import { getApiClient } from "@/lib/api_client";

export interface Observation {
  id: string;
  source_id: string;
  entity_id: string;
  entity_type: string;
  fragment_key: string;
  fragment_value: unknown;
  observed_at: string;
  user_id: string;
  priority: number;
}

interface ObservationListProps {
  onObservationClick: (observation: Observation) => void;
  onNavigateToSource?: (sourceId: string) => void;
  onNavigateToEntity?: (entityId: string) => void;
  searchQuery?: string;
}

export function ObservationList({ 
  onObservationClick, 
  onNavigateToSource,
  onNavigateToEntity,
  searchQuery: externalSearchQuery 
}: ObservationListProps) {
  const [fetchedObservations, setFetchedObservations] = useState<Observation[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntityType, setSelectedEntityType] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  
  // Use external search query from header or empty string
  const searchQuery = externalSearchQuery || "";
  
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  
  // Prefer bearer token from keys, fallback to session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  // Fetch observations from API
  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }
    
    async function fetchObservations() {
      setLoading(true);
      try {
        const api = getApiClient(bearerToken);
        const userId = user?.id;
        const { data, error } = await api.POST("/observations/query", {
          body: {
            entity_type: selectedEntityType || undefined,
            limit,
            offset,
            user_id: userId,
          },
        });
        if (error || !data) {
          throw new Error("Failed to fetch observations");
        }
        let filteredObservations = data.observations || [];
        
        // Client-side search filtering
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filteredObservations = filteredObservations.filter((o: Observation) =>
            o.id.toLowerCase().includes(query) ||
            o.entity_id.toLowerCase().includes(query) ||
            o.source_id.toLowerCase().includes(query) ||
            o.fragment_key.toLowerCase().includes(query) ||
            String(o.fragment_value).toLowerCase().includes(query)
          );
        }
        
        setFetchedObservations(filteredObservations);
        setTotalCount(data.total || 0);
        
        // Extract unique entity types
        const types = Array.from(
          new Set(filteredObservations.map((o: Observation) => o.entity_type))
        ).sort();
        setEntityTypes(types);
      } catch (error) {
        console.error("Failed to fetch observations:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchObservations();
  }, [searchQuery, selectedEntityType, offset, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription
  const observations = useRealtimeObservations(fetchedObservations, {
    onInsert: (observation) => {
      console.log("New observation added:", observation);
    },
  });

  const handleSourceClick = (e: React.MouseEvent, sourceId: string) => {
    e.stopPropagation();
    if (onNavigateToSource) {
      onNavigateToSource(sourceId);
    }
  };

  const handleEntityClick = (e: React.MouseEvent, entityId: string) => {
    e.stopPropagation();
    if (onNavigateToEntity) {
      onNavigateToEntity(entityId);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {selectedEntityType || "All entity types"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Filter by entity type</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={selectedEntityType}
                onValueChange={(value) => {
                  setSelectedEntityType(value);
                  setOffset(0);
                }}
              >
                <DropdownMenuRadioItem value="">All types</DropdownMenuRadioItem>
                {entityTypes.map((type) => (
                  <DropdownMenuRadioItem key={type} value={type}>
                    {type}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="text-sm text-muted-foreground">
          {totalCount} observation{totalCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 rounded-md border overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : observations.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p>No observations found</p>
              {(searchQuery || selectedEntityType) && (
                <p className="text-sm mt-2">Try adjusting your filters</p>
              )}
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity Type</TableHead>
                <TableHead>Fragment Key</TableHead>
                <TableHead>Fragment Value</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Source ID</TableHead>
                <TableHead>Observed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {observations.map((observation) => (
                <TableRow
                  key={observation.id}
                  onClick={() => onObservationClick(observation)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Badge variant="secondary">{observation.entity_type}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {observation.fragment_key}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {typeof observation.fragment_value === "string"
                      ? observation.fragment_value
                      : JSON.stringify(observation.fragment_value)}
                  </TableCell>
                  <TableCell>
                    {onNavigateToEntity && observation.entity_id ? (
                      <button
                        onClick={(e) => handleEntityClick(e, observation.entity_id)}
                        className="text-primary hover:underline"
                      >
                        <code className="text-xs">{observation.entity_id.substring(0, 16)}...</code>
                      </button>
                    ) : (
                      <code className="text-xs">{observation.entity_id ? `${observation.entity_id.substring(0, 16)}...` : "—"}</code>
                    )}
                  </TableCell>
                  <TableCell>
                    {onNavigateToSource && observation.source_id ? (
                      <button
                        onClick={(e) => handleSourceClick(e, observation.source_id)}
                        className="text-primary hover:underline"
                      >
                        <code className="text-xs">{observation.source_id.substring(0, 16)}...</code>
                      </button>
                    ) : (
                      <code className="text-xs">{observation.source_id ? `${observation.source_id.substring(0, 16)}...` : "—"}</code>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(observation.observed_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <Button
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Showing {offset + 1}-{Math.min(offset + limit, totalCount)} of {totalCount}
        </span>
        <Button
          onClick={() => setOffset(offset + limit)}
          disabled={offset + limit >= totalCount}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
