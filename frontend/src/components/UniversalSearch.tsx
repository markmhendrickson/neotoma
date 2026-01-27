/**
 * Universal Search Component
 * 
 * Search dropdown that shows up to 3 results across routes, entities, sources, observations, and interpretations
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Loader2, Search, FileText, Eye, Layers, Users, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";

interface SearchResult {
  id: string;
  type: "entity" | "source" | "observation" | "interpretation" | "route";
  title: string;
  subtitle?: string;
  href: string;
}

interface UniversalSearchProps {
  className?: string;
  /** When true, input and dropdown use w-full for sidebar layout */
  fullWidth?: boolean;
}

export function UniversalSearch({ className, fullWidth }: UniversalSearchProps) {
  const widthClass = fullWidth ? "w-full" : "w-[300px]";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  const bearerToken = keysBearerToken || sessionToken || settings.bearerToken;

  // App routes configuration
  const appRoutes = [
    { path: "/", label: "Dashboard" },
    { path: "/sources", label: "Sources" },
    { path: "/entities", label: "Entities" },
    { path: "/interpretations", label: "Interpretations" },
    { path: "/observations", label: "Observations" },
    { path: "/schemas", label: "Schemas" },
    { path: "/relationships", label: "Relationships" },
    { path: "/timeline", label: "Timeline" },
    { path: "/search", label: "Search" },
    { path: "/mcp/cursor", label: "Cursor Setup" },
    { path: "/mcp/chatgpt", label: "ChatGPT Setup" },
    { path: "/mcp/claude", label: "Claude Setup" },
    { path: "/mcp/continue", label: "Continue Setup" },
    { path: "/mcp/copilot", label: "GitHub Copilot Setup" },
    { path: "/mcp/vscode", label: "VSCode Setup" },
    { path: "/mcp/gemini", label: "Gemini Setup" },
    { path: "/mcp/grok", label: "Grok Setup" },
    { path: "/oauth", label: "OAuth" },
    { path: "/design-system", label: "Design System" },
  ];

  // Debounced search
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!query.trim() || query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timeoutRef.current = setTimeout(() => {
      performSearch(query.trim());
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  async function performSearch(searchQuery: string) {
    const userId = user?.id;
    const allResults: SearchResult[] = [];
    const searchLower = searchQuery.toLowerCase();

    // Search routes first (client-side, no auth required)
    const routeResults = appRoutes
      .filter((route) => {
        const pathMatch = route.path.toLowerCase().includes(searchLower);
        const labelMatch = route.label.toLowerCase().includes(searchLower);
        return pathMatch || labelMatch;
      })
      .slice(0, 3)
      .map((route) => ({
        id: route.path,
        type: "route" as const,
        title: route.label,
        subtitle: route.path,
        href: route.path,
      }));
    allResults.push(...routeResults);

    // If we already have 3 route results, skip API searches
    if (allResults.length >= 3) {
      setResults(allResults.slice(0, 3));
      setLoading(false);
      return;
    }

    if (!bearerToken || keysLoading) {
      setResults(allResults.slice(0, 3));
      setLoading(false);
      return;
    }

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`,
      };

      // Search entities (if we have space)
      if (allResults.length < 3) {
        try {
          const entitiesResponse = await fetch("/api/entities/query", {
            method: "POST",
            headers,
            body: JSON.stringify({
              search: searchQuery,
              limit: 3 - allResults.length,
              user_id: userId,
            }),
          });

          if (entitiesResponse.ok) {
            const entitiesData = await entitiesResponse.json();
            const entities = (entitiesData.entities || []).slice(0, 3 - allResults.length).map((e: any) => ({
              id: e.id,
              type: "entity" as const,
              title: e.canonical_name || e.entity_type,
              subtitle: e.entity_type,
              href: `/entities/${e.id}`,
            }));
            allResults.push(...entities);
          }
        } catch (error) {
          console.error("Failed to search entities:", error);
        }
      }

      // Search sources (if we have space)
      if (allResults.length < 3) {
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
              .slice(0, 3 - allResults.length)
              .map((s: any) => ({
                id: s.id,
                type: "source" as const,
                title: s.original_filename || s.id.substring(0, 16) + "...",
                subtitle: "Source",
                href: `/sources/${s.id}`,
              }));
            allResults.push(...sources);
          }
        } catch (error) {
          console.error("Failed to search sources:", error);
        }
      }

      // Search observations (if we have space)
      if (allResults.length < 3) {
        try {
          const observationsResponse = await fetch("/api/observations/query", {
            method: "POST",
            headers,
            body: JSON.stringify({
              limit: 3 - allResults.length,
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
              .slice(0, 3 - allResults.length)
              .map((o: any) => ({
                id: o.id,
                type: "observation" as const,
                title: o.fragment_key || o.id.substring(0, 16) + "...",
                subtitle: "Observation",
                href: `/observations?entity=${o.entity_id}`,
              }));
            allResults.push(...observations);
          }
        } catch (error) {
          console.error("Failed to search observations:", error);
        }
      }

      // Search interpretations (if we have space)
      if (allResults.length < 3) {
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
              .slice(0, 3 - allResults.length)
              .map((i: any) => ({
                id: i.id,
                type: "interpretation" as const,
                title: i.id.substring(0, 16) + "...",
                subtitle: "Interpretation",
                href: `/sources/${i.source_id}`,
              }));
            allResults.push(...interpretations);
          }
        } catch (error) {
          console.error("Failed to search interpretations:", error);
        }
      }

      setResults(allResults.slice(0, 3));
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const handleResultClick = (href: string) => {
    setOpen(false);
    setQuery("");
    navigate(href);
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
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
      case "route":
        return <Navigation className="h-4 w-4" />;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div className={cn("relative", widthClass, className)}>
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        className={cn(widthClass, "pl-9 h-8 pt-0.5 pb-1 text-[13px]")}
      />
      {open && (query.length >= 2 || results.length > 0) && (
        <div
          ref={dropdownRef}
          className={cn("absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50", widthClass)}
        >
          {loading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : query.length < 2 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Type at least 2 characters to search
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No results found
            </div>
          ) : (
            <>
              <div className="max-h-[300px] overflow-y-auto">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleResultClick(result.href)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex-shrink-0 text-muted-foreground">
                      {getIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {result.title}
                      </div>
                      {result.subtitle && (
                        <div className="text-xs text-muted-foreground truncate">
                          {result.subtitle}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t">
                <button
                  onClick={handleViewAll}
                  className="w-full px-4 py-2 text-sm text-primary hover:bg-muted/50 transition-colors text-center"
                >
                  View all results
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
