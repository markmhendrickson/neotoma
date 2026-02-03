/**
 * Relationship List Component
 * 
 * Display all relationships with filtering and search
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Network, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeRelationships } from "@/hooks/useRealtimeRelationships";

interface Relationship {
  id: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  source_entity_type?: string;
  target_entity_type?: string;
  source_canonical_name?: string;
  target_canonical_name?: string;
  metadata?: Record<string, unknown>;
  observation_count: number;
  last_observation_at: string;
}

interface RelationshipListProps {
  onRelationshipClick: (relationship: Relationship) => void;
  onNavigateToEntity?: (entityId: string) => void;
}

export function RelationshipList({ onRelationshipClick, onNavigateToEntity }: RelationshipListProps) {
  const [fetchedRelationships, setFetchedRelationships] = useState<Relationship[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [relationshipType, setRelationshipType] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();

  // Prefer bearer token from keys, fallback to Supabase session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    async function fetchRelationships() {
      setLoading(true);
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

        // Include bearer token if available
        if (bearerToken) {
          headers["Authorization"] = `Bearer ${bearerToken}`;
        }

        const params = new URLSearchParams();
        if (relationshipType) {
          params.append("relationship_type", relationshipType);
        }
        params.append("limit", limit.toString());
        params.append("offset", offset.toString());
        if (user?.id) {
          params.append("user_id", user.id);
        }

        const url = `/api/relationships?${params.toString()}`;

        const response = await fetch(url, { headers });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error("Unauthorized - check your Bearer Token");
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setFetchedRelationships(data.relationships || []);
        setTotalCount(data.total || 0);
      } catch (error) {
        console.error("Failed to fetch relationships:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRelationships();
  }, [relationshipType, offset, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription
  const relationships = useRealtimeRelationships(fetchedRelationships, {
    relationshipType: relationshipType,
    onInsert: (relationship) => {
      console.log("New relationship added:", relationship);
    },
  });

  // Extract unique relationship types, filtering out empty strings
  const relationshipTypes = Array.from(
    new Set(relationships.map((r) => r.relationship_type).filter((type) => type && type.trim() !== ""))
  ).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relationships</h1>
          <p className="text-sm text-muted-foreground">
            View all entity relationships and their connections
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={relationshipType || "all"} onValueChange={(value) => setRelationshipType(value === "all" ? "" : value)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All relationship types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All relationship types</SelectItem>
              {relationshipTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {relationships.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Network className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {relationshipType ? "No relationships of this type found" : "No relationships found"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {relationships.map((relationship) => (
              <Card
                key={relationship.id}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => onRelationshipClick(relationship)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        {onNavigateToEntity && relationship.source_entity_id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToEntity(relationship.source_entity_id);
                            }}
                            className="text-sm font-medium hover:underline"
                          >
                            {relationship.source_canonical_name || (relationship.source_entity_id ? relationship.source_entity_id.slice(0, 8) : "Unknown")}
                          </button>
                        ) : (
                          <span className="text-sm font-medium">
                            {relationship.source_canonical_name || (relationship.source_entity_id ? relationship.source_entity_id.slice(0, 8) : "Unknown")}
                          </span>
                        )}
                        {relationship.source_entity_type && (
                          <Badge variant="outline" className="text-xs">
                            {relationship.source_entity_type}
                          </Badge>
                        )}
                      </div>
                      {relationship.relationship_type && (
                        <Badge variant="secondary">{relationship.relationship_type}</Badge>
                      )}
                      <div className="flex items-center gap-2">
                        {onNavigateToEntity && relationship.target_entity_id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToEntity(relationship.target_entity_id);
                            }}
                            className="text-sm font-medium hover:underline"
                          >
                            {relationship.target_canonical_name || (relationship.target_entity_id ? relationship.target_entity_id.slice(0, 8) : "Unknown")}
                          </button>
                        ) : (
                          <span className="text-sm font-medium">
                            {relationship.target_canonical_name || (relationship.target_entity_id ? relationship.target_entity_id.slice(0, 8) : "Unknown")}
                          </span>
                        )}
                        {relationship.target_entity_type && (
                          <Badge variant="outline" className="text-xs">
                            {relationship.target_entity_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{relationship.observation_count} observation{relationship.observation_count !== 1 ? "s" : ""}</span>
                      <span>•</span>
                      <span>{new Date(relationship.last_observation_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {relationships.length} of {totalCount} relationship{totalCount !== 1 ? "s" : ""}
        </div>
        <div className="flex gap-2">
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
  );
}
