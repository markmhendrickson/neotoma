/**
 * Schema List Component
 * 
 * Display all available schemas with search and filtering
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Database } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { getSchemaIcon, type SchemaMetadata } from "@/utils/schema_icons";
import { useRealtime } from "@/contexts/RealtimeContext";

interface Schema {
  entity_type: string;
  schema_version: string;
  field_names: string[];
  field_summary: Record<string, { type: string; required: boolean }>;
  similarity_score?: number;
  match_type?: "keyword" | "vector";
  metadata?: SchemaMetadata;
}

interface SchemaListProps {
  onSchemaClick: (schema: Schema) => void;
}

export function SchemaList({ onSchemaClick }: SchemaListProps) {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredSchemas, setFilteredSchemas] = useState<Schema[]>([]);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken, user } = useAuth();
  const { subscribe } = useRealtime();

  // Prefer bearer token from keys, fallback to session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  const sortSchemas = useCallback((items: Schema[]) => {
    return [...items].sort((left, right) => {
      const typeComparison = (left.entity_type || "").localeCompare(right.entity_type || "");
      if (typeComparison !== 0) {
        return typeComparison;
      }
      return (left.schema_version || "").localeCompare(right.schema_version || "");
    });
  }, []);

  // Helper function to fetch schemas
  const fetchSchemas = useCallback(async () => {
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
      if (user?.id) {
        params.append("user_id", user.id);
      }
      const url = `/schemas${params.toString() ? `?${params.toString()}` : ""}`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Unauthorized - check your Bearer Token");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const nextSchemas = sortSchemas(data.schemas || []);
      setSchemas(nextSchemas);
      setFilteredSchemas(nextSchemas);
    } catch (error) {
      console.error("Failed to fetch schemas:", error);
    } finally {
      setLoading(false);
    }
  }, [bearerToken, sortSchemas, user?.id]);

  // Initial fetch
  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    fetchSchemas();
  }, [fetchSchemas, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription to refetch when schema_registry changes
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribe({
      table: "schema_registry",
      event: "*",
      filter: `user_id=eq.${user.id}`,
      callback: () => {
        fetchSchemas();
      },
    });

    return unsubscribe;
  }, [user, subscribe, fetchSchemas]);

  // Filter schemas client-side as well for instant feedback
  useEffect(() => {
    if (!searchQuery) {
      setFilteredSchemas(schemas);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = schemas.filter(
      (schema) =>
        schema.entity_type?.toLowerCase().includes(query) ||
        (schema.field_names || []).some((field) => field?.toLowerCase().includes(query))
    );
    setFilteredSchemas(sortSchemas(filtered));
  }, [searchQuery, schemas, sortSchemas]);

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
          <h1 className="text-2xl font-bold">Schemas</h1>
          <p className="text-sm text-muted-foreground">
            View all available entity schemas and their field definitions
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search schemas by name or field..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filteredSchemas.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? "No schemas match your search" : "No schemas found"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSchemas.map((schema) => {
              const Icon = getSchemaIcon(schema.entity_type, schema.metadata);
              
              return (
                <Card
                  key={schema.entity_type}
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onSchemaClick(schema)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="size-5 shrink-0" />}
                        <CardTitle className="text-lg">{schema.entity_type}</CardTitle>
                      </div>
                      <Badge variant="secondary">v{schema.schema_version}</Badge>
                    </div>
                    <CardDescription>
                      {schema.field_names?.length || 0} field{(schema.field_names?.length || 0) !== 1 ? "s" : ""}
                    </CardDescription>
                  </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {(schema.field_names || []).slice(0, 5).map((field) => (
                      <Badge key={field} variant="outline" className="text-xs">
                        {field}
                      </Badge>
                    ))}
                    {(schema.field_names?.length || 0) > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{(schema.field_names?.length || 0) - 5} more
                      </Badge>
                    )}
                  </div>
                </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {filteredSchemas.length} of {schemas.length} schema{schemas.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
