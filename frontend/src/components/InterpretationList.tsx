/**
 * Interpretation List Component
 * 
 * Browse AI interpretations with filtering and search
 */

import { useEffect, useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtime } from "@/contexts/RealtimeContext";

export interface Interpretation {
  id: string;
  source_id: string;
  user_id: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  interpretation_config?: Record<string, unknown> | null;
  error_message?: string | null;
}

interface InterpretationListProps {
  onInterpretationClick: (interpretation: Interpretation) => void;
  onNavigateToSource?: (sourceId: string) => void;
  searchQuery?: string;
}

export function InterpretationList({ 
  onInterpretationClick, 
  onNavigateToSource 
}: InterpretationListProps) {
  const [fetchedInterpretations, setFetchedInterpretations] = useState<Interpretation[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  const { subscribe } = useRealtime();
  
  // Prefer bearer token from keys, fallback to session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  // Helper function to fetch interpretations
  const fetchInterpretations = useCallback(async () => {
    setLoading(true);
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      
      // Include bearer token if available
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      }

      // Build query params
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      
      const userId = user?.id;
      if (userId) {
        params.append("user_id", userId);
      }
      
      // Use relative URL to go through Vite proxy
      const response = await fetch(`/interpretations?${params}`, { headers });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Unauthorized - check your Bearer Token");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      let filteredInterpretations = data.interpretations || [];
      
      // Client-side search filtering
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredInterpretations = filteredInterpretations.filter((i: Interpretation) =>
          (i.id?.toLowerCase().includes(query)) ||
          (i.source_id?.toLowerCase().includes(query)) ||
          (i.status?.toLowerCase().includes(query))
        );
      }
      
      setFetchedInterpretations(filteredInterpretations);
      setTotalCount(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch interpretations:", error);
    } finally {
      setLoading(false);
    }
  }, [offset, bearerToken, user?.id, searchQuery]);

  // Initial fetch
  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }
    
    fetchInterpretations();
  }, [fetchInterpretations, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription to refetch when interpretations change
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribe({
      table: "interpretations",
      event: "*",
      filter: `user_id=eq.${user.id}`,
      callback: () => {
        fetchInterpretations();
      },
    });

    return unsubscribe;
  }, [user, subscribe, fetchInterpretations]);

  // Derive interpretations from fetched data (for search filtering)
  const interpretations = fetchedInterpretations;

  const handleSourceClick = (e: React.MouseEvent, sourceId: string) => {
    e.stopPropagation();
    if (onNavigateToSource) {
      onNavigateToSource(sourceId);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex justify-end items-center">
        <div className="text-sm text-muted-foreground">
          {totalCount} interpretation{totalCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 rounded-md border overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : interpretations.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p>No interpretations found</p>
              {searchQuery && (
                <p className="text-sm mt-2">Try adjusting your search</p>
              )}
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Source ID</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Interpretation ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interpretations.map((interpretation) => (
                <TableRow
                  key={interpretation.id}
                  onClick={() => onInterpretationClick(interpretation)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Badge 
                      variant={
                        interpretation.status === "completed" ? "default" :
                        interpretation.status === "failed" ? "destructive" :
                        "secondary"
                      }
                    >
                      {interpretation.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {onNavigateToSource && interpretation.source_id ? (
                      <button
                        onClick={(e) => handleSourceClick(e, interpretation.source_id)}
                        className="text-primary hover:underline"
                      >
                        <code className="text-xs">{interpretation.source_id.substring(0, 16)}...</code>
                      </button>
                    ) : (
                      <code className="text-xs">{interpretation.source_id ? `${interpretation.source_id.substring(0, 16)}...` : "—"}</code>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(interpretation.started_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {interpretation.completed_at 
                      ? new Date(interpretation.completed_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{interpretation.id ? `${interpretation.id.substring(0, 16)}...` : "—"}</code>
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
