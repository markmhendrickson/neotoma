/**
 * Search Results Page
 * 
 * Displays comprehensive search results across all entity types
 */

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, Eye, Layers, Users, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { getApiClient } from "@/lib/api_client";

interface SearchResult {
  id: string;
  type: "entity" | "source" | "observation" | "interpretation";
  title: string;
  subtitle?: string;
  href: string;
  metadata?: Record<string, any>;
}

export function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [searchInput, setSearchInput] = useState(query);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  // Sync search input with URL query param
  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    performSearch(query.trim());
  }, [query, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim() });
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  async function performSearch(searchQuery: string) {
    if (!bearerToken || keysLoading) {
      return;
    }

    setLoading(true);
    try {
      const api = getApiClient(bearerToken);

      const userId = user?.id;
      const allResults: SearchResult[] = [];

      // Search entities
      try {
        const { data: entitiesData } = await api.POST("/entities/query", {
          body: {
            search: searchQuery,
            limit: 100,
            user_id: userId,
          },
        });
        const entities = (entitiesData?.entities || []).map((e: any) => ({
          id: e.id,
          type: "entity" as const,
          title: e.canonical_name || e.entity_type,
          subtitle: e.entity_type,
          href: `/entity/${e.id}`,
          metadata: e,
        }));
        allResults.push(...entities);
      } catch (error) {
        console.error("Failed to search entities:", error);
      }

      // Search sources
      try {
        const { data: sourcesData } = await api.GET("/sources", {
          params: { query: userId ? { user_id: userId } : {} },
        });
        const sources = (sourcesData?.sources || [])
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
      } catch (error) {
        console.error("Failed to search sources:", error);
      }

      // Search observations
      try {
        const { data: observationsData } = await api.POST("/observations/query", {
          body: {
            limit: 100,
            user_id: userId,
          },
        });
        const observations = (observationsData?.observations || [])
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
      } catch (error) {
        console.error("Failed to search observations:", error);
      }

      // Search interpretations
      try {
        const { data: interpretationsData } = await api.GET("/interpretations", {
          params: { query: userId ? { user_id: userId } : {} },
        });
        const interpretations = (interpretationsData?.interpretations || [])
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

  const openInNewTab = (href: string) => {
    if (typeof window === "undefined") return;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const handleResultClick = (event: React.MouseEvent, href: string) => {
    if (event.metaKey || event.ctrlKey) {
      openInNewTab(href);
      return;
    }
    navigate(href);
  };

  const handleResultMouseDown = (event: React.MouseEvent, href: string) => {
    if (event.button === 1) {
      event.preventDefault();
      openInNewTab(href);
    }
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

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Search</h1>
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            type="text"
            placeholder="Search entities, sources, observations, and interpretations..."
            value={searchInput}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </form>
      </div>

      {!query.trim() || query.length < 2 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <p>Enter a search query to see results</p>
            <p className="text-sm mt-2">Search requires at least 2 characters</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium">
              Search results for "{query}"
            </h2>
            <div className="text-sm text-muted-foreground">
              {loading ? "Searching..." : `${results.length} result${results.length === 1 ? "" : "s"}`}
            </div>
          </div>

      <div className="flex-1 rounded-md border overflow-y-auto">
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
                  onClick={(event) => handleResultClick(event, result.href)}
                  onMouseDown={(event) => handleResultMouseDown(event, result.href)}
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
        </>
      )}
    </div>
  );
}
