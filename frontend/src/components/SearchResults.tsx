/**
 * Search Results Page
 * 
 * Displays comprehensive search results across all entity types
 */

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, Eye, Layers, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";

interface SearchResult {
  id: string;
  type: "entity" | "source" | "observation" | "interpretation";
  title: string;
  subtitle?: string;
  href: string;
  metadata?: Record<string, any>;
}

export function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  const bearerToken = keysBearerToken || sessionToken || settings.bearerToken;

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    performSearch(query.trim());
  }, [query, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  async function performSearch(searchQuery: string) {
    if (!bearerToken || keysLoading) {
      return;
    }

    setLoading(true);
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`,
      };

      const userId = user?.id;
      const allResults: SearchResult[] = [];

      // Search entities
      try {
        const entitiesResponse = await fetch("/api/entities/query", {
          method: "POST",
          headers,
          body: JSON.stringify({
            search: searchQuery,
            limit: 100,
            user_id: userId,
          }),
        });

        if (entitiesResponse.ok) {
          const entitiesData = await entitiesResponse.json();
          const entities = (entitiesData.entities || []).map((e: any) => ({
            id: e.id,
            type: "entity" as const,
            title: e.canonical_name || e.entity_type,
            subtitle: e.entity_type,
            href: `/entities/${e.id}`,
            metadata: e,
          }));
          allResults.push(...entities);
        }
      } catch (error) {
        console.error("Failed to search entities:", error);
      }

      // Search sources
      try {
        const sourcesResponse = await fetch("/api/sources", {
          headers,
        });

        if (sourcesResponse.ok) {
          const sourcesData = await sourcesResponse.json();
          const sources = (sourcesData.sources || [])
            .filter((s: any) => 
              s.original_filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              s.id.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((s: any) => ({
              id: s.id,
              type: "source" as const,
              title: s.original_filename || s.id.substring(0, 16) + "...",
              subtitle: "Source",
              href: `/sources/${s.id}`,
              metadata: s,
            }));
          allResults.push(...sources);
        }
      } catch (error) {
        console.error("Failed to search sources:", error);
      }

      // Search observations
      try {
        const observationsResponse = await fetch("/api/observations/query", {
          method: "POST",
          headers,
          body: JSON.stringify({
            limit: 100,
            user_id: userId,
          }),
        });

        if (observationsResponse.ok) {
          const observationsData = await observationsResponse.json();
          const observations = (observationsData.observations || [])
            .filter((o: any) =>
              o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
              o.entity_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
              o.fragment_key?.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((o: any) => ({
              id: o.id,
              type: "observation" as const,
              title: o.fragment_key || o.id.substring(0, 16) + "...",
              subtitle: "Observation",
              href: `/observations?entity=${o.entity_id}`,
              metadata: o,
            }));
          allResults.push(...observations);
        }
      } catch (error) {
        console.error("Failed to search observations:", error);
      }

      // Search interpretations
      try {
        const interpretationsResponse = await fetch("/api/interpretations", {
          headers,
        });

        if (interpretationsResponse.ok) {
          const interpretationsData = await interpretationsResponse.json();
          const interpretations = (interpretationsData.interpretations || [])
            .filter((i: any) =>
              i.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
              i.source_id.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((i: any) => ({
              id: i.id,
              type: "interpretation" as const,
              title: i.id.substring(0, 16) + "...",
              subtitle: "Interpretation",
              href: `/sources/${i.source_id}`,
              metadata: i,
            }));
          allResults.push(...interpretations);
        }
      } catch (error) {
        console.error("Failed to search interpretations:", error);
      }

      setResults(allResults);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const handleResultClick = (href: string) => {
    navigate(href);
  };

  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "entity":
        return <Users className="h-4 w-4" />;
      case "source":
        return <FileText className="h-4 w-4" />;
      case "observation":
        return <Eye className="h-4 w-4" />;
      case "interpretation":
        return <Layers className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: SearchResult["type"]) => {
    switch (type) {
      case "entity":
        return "Entity";
      case "source":
        return "Source";
      case "observation":
        return "Observation";
      case "interpretation":
        return "Interpretation";
    }
  };

  if (!query.trim() || query.length < 2) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <p>Enter a search query to see results</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">
          Search results for "{query}"
        </h1>
        <div className="text-sm text-muted-foreground">
          {loading ? "Searching..." : `${results.length} result${results.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="flex-1 rounded-md border overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p>No results found</p>
              <p className="text-sm mt-2">Try a different search query</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result.href)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="text-muted-foreground">
                        {getIcon(result.type)}
                      </div>
                      <Badge variant="secondary">{getTypeLabel(result.type)}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {result.title}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {result.subtitle}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{result.id.substring(0, 16)}...</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
