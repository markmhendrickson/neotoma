/**
 * Universal Search Component
 *
 * Search dropdown that shows up to 3 results across routes, entities, sources, observations, and interpretations.
 * Type / for a filterable command palette (name + description, autocomplete).
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Loader2, Search, FileText, Eye, Layers, Users, Navigation, Slash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { getApiClient } from "@/lib/api_client";

interface SearchResult {
  id: string;
  type: "entity" | "source" | "observation" | "interpretation" | "route";
  title: string;
  subtitle?: string;
  href: string;
}

export interface CommandItem {
  name: string;
  description: string;
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
  const commandDropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  // App routes configuration
  const appRoutes = [
    { path: "/", label: "Dashboard" },
    { path: "/sources", label: "Sources" },
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

  // Commands for "/" palette (name = slug for filtering, description for UI)
  const commands: CommandItem[] = [
    { name: "dashboard", description: "Go to dashboard", href: "/" },
    { name: "sources", description: "View and manage sources", href: "/sources" },
    { name: "interpretations", description: "Browse interpretations", href: "/interpretations" },
    { name: "observations", description: "Browse observations", href: "/observations" },
    { name: "schemas", description: "View entity schemas", href: "/schemas" },
    { name: "relationships", description: "View relationship graph", href: "/relationships" },
    { name: "timeline", description: "View timeline events", href: "/timeline" },
    { name: "search", description: "Full search page", href: "/search" },
    { name: "cursor", description: "Cursor MCP setup", href: "/mcp/cursor" },
    { name: "chatgpt", description: "ChatGPT MCP setup", href: "/mcp/chatgpt" },
    { name: "claude", description: "Claude MCP setup", href: "/mcp/claude" },
    { name: "continue", description: "Continue MCP setup", href: "/mcp/continue" },
    { name: "copilot", description: "GitHub Copilot MCP setup", href: "/mcp/copilot" },
    { name: "vscode", description: "VSCode MCP setup", href: "/mcp/vscode" },
    { name: "gemini", description: "Gemini MCP setup", href: "/mcp/gemini" },
    { name: "grok", description: "Grok MCP setup", href: "/mcp/grok" },
    { name: "oauth", description: "OAuth configuration", href: "/oauth" },
    { name: "design-system", description: "Design system and style guide", href: "/design-system" },
  ];

  const isCommandMode = query.startsWith("/");
  const commandFilter = (query.slice(1).trim() || "").toLowerCase();
  const filteredCommands = useMemo(() => {
    if (!commandFilter) return commands;
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(commandFilter) ||
        c.description.toLowerCase().includes(commandFilter)
    );
  }, [commandFilter]);

  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [commandFilter]);
  useEffect(() => {
    if (selectedCommandIndex >= filteredCommands.length && filteredCommands.length > 0) {
      setSelectedCommandIndex(filteredCommands.length - 1);
    }
  }, [filteredCommands.length, selectedCommandIndex]);

  // Debounced search (skip when in "/" command mode)
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (isCommandMode || !query.trim() || query.length < 2) {
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
  }, [query, isCommandMode, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

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
      const api = getApiClient(bearerToken);

      // Search entities (if we have space)
      if (allResults.length < 3) {
        try {
          const { data: entitiesData } = await api.POST("/api/entities/query", {
            body: {
              search: searchQuery,
              limit: 3 - allResults.length,
              user_id: userId,
            },
          });
          const entities = (entitiesData?.entities || [])
            .slice(0, 3 - allResults.length)
            .map((e: any) => ({
              id: e.id,
              type: "entity" as const,
              title: e.canonical_name || e.entity_type,
              subtitle: e.entity_type,
              href: `/entity/${e.id}`,
            }));
          allResults.push(...entities);
        } catch (error) {
          console.error("Failed to search entities:", error);
        }
      }

      // Search sources (if we have space)
      if (allResults.length < 3) {
        try {
          const { data: sourcesData } = await api.GET("/api/sources", {
            params: { query: userId ? { user_id: userId } : {} },
          });
          const sources = (sourcesData?.sources || [])
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
        } catch (error) {
          console.error("Failed to search sources:", error);
        }
      }

      // Search observations (if we have space)
      if (allResults.length < 3) {
        try {
          const { data: observationsData } = await api.POST("/api/observations/query", {
            body: {
              limit: 3 - allResults.length,
              user_id: userId,
            },
          });
          const observations = (observationsData?.observations || [])
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
        } catch (error) {
          console.error("Failed to search observations:", error);
        }
      }

      // Search interpretations (if we have space)
      if (allResults.length < 3) {
        try {
          const { data: interpretationsData } = await api.GET("/api/interpretations", {
            params: { query: userId ? { user_id: userId } : {} },
          });
          const interpretations = (interpretationsData?.interpretations || [])
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

  const openInNewTab = (href: string) => {
    if (typeof window === "undefined") return;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const handleResultClick = (event: React.MouseEvent, href: string) => {
    if (event.metaKey || event.ctrlKey) {
      openInNewTab(href);
      return;
    }
    setOpen(false);
    setQuery("");
    navigate(href);
  };

  const handleResultMouseDown = (event: React.MouseEvent, href: string) => {
    if (event.button === 1) {
      event.preventDefault();
      openInNewTab(href);
    }
  };

  const handleViewAll = (event?: React.MouseEvent) => {
    const href = `/search?q=${encodeURIComponent(query)}`;
    if (event && (event.metaKey || event.ctrlKey)) {
      openInNewTab(href);
      return;
    }
    setOpen(false);
    navigate(href);
  };

  const handleViewAllMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault();
      openInNewTab(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const handleCommandSelect = (cmd: CommandItem, event?: React.MouseEvent) => {
    if (event?.metaKey || event?.ctrlKey) {
      window.open(cmd.href, "_blank", "noopener,noreferrer");
    } else {
      setOpen(false);
      setQuery("");
      navigate(cmd.href);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (!isCommandMode || !open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedCommandIndex((i) => (i + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedCommandIndex((i) =>
        i <= 0 ? Math.max(0, filteredCommands.length - 1) : i - 1
      );
    } else if (e.key === "Enter" && filteredCommands.length > 0) {
      e.preventDefault();
      const cmd = filteredCommands[selectedCommandIndex];
      if (cmd) {
        setOpen(false);
        setQuery("");
        navigate(cmd.href);
      }
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
      case "route":
        return <Navigation className="h-4 w-4" />;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inInput = inputRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      const inCommandDropdown = commandDropdownRef.current?.contains(target);
      if (!inInput && !inDropdown && !inCommandDropdown) {
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
        placeholder="Search or / for commands"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={cn(widthClass, "pl-9 h-8 pt-0.5 pb-1 text-[13px]")}
      />
      {open && query === "" && (
        <div className="absolute left-0 top-full mt-1 text-xs text-muted-foreground flex items-center gap-1.5 px-1">
          <Slash className="h-3.5 w-3.5" />
          <span>/ for commands</span>
        </div>
      )}
      {open && isCommandMode && (
        <div
          ref={commandDropdownRef}
          className={cn(
            "absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[320px] overflow-hidden flex flex-col",
            widthClass
          )}
        >
          <div className="px-3 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
            Type to filter commands
          </div>
          <div className="overflow-y-auto max-h-[280px]">
            {filteredCommands.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No commands match
              </div>
            ) : (
              filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.href}
                  type="button"
                  onClick={(event) => handleCommandSelect(cmd, event)}
                  className={cn(
                    "w-full flex flex-col gap-0.5 px-4 py-2.5 text-left transition-colors",
                    idx === selectedCommandIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted/50"
                  )}
                >
                  <span className="text-sm font-medium">{cmd.name}</span>
                  <span className="text-xs text-muted-foreground">{cmd.description}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {open && !isCommandMode && (query.length >= 2 || results.length > 0) && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50",
            widthClass
          )}
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
                    onClick={(event) => handleResultClick(event, result.href)}
                    onMouseDown={(event) => handleResultMouseDown(event, result.href)}
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
                  onMouseDown={handleViewAllMouseDown}
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
