/**
 * Source Table (FU-301)
 * 
 * Displays list of sources from sources table
 * Replaces deprecated record-based table views
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
import { Loader2, Plus } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSources } from "@/hooks/useRealtimeSources";

export interface Source {
  id: string;
  content_hash: string;
  mime_type: string;
  source_type: string;
  file_name?: string;
  file_size?: number;
  original_filename?: string;
  raw_text?: string;
  created_at: string;
  user_id: string;
}

interface SourceTableProps {
  onSourceClick: (source: Source) => void;
  onFileUpload?: () => void;
  searchQuery?: string;
}

export function SourceTable({ onSourceClick, onFileUpload, searchQuery: externalSearchQuery }: SourceTableProps) {
  const [fetchedSources, setFetchedSources] = useState<Source[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedMimeType, setSelectedMimeType] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  
  // Use external search query from header or empty string
  const searchQuery = externalSearchQuery || "";

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();

  // Prefer bearer token from keys, fallback to session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  // Fetch sources from API
  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    async function fetchSources() {
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
        
        if (searchQuery) {
          params.append("search", searchQuery);
        }
        
        if (selectedMimeType) {
          params.append("mime_type", selectedMimeType);
        }

        if (user?.id) {
          params.append("user_id", user.id);
        }

        // Use relative URL to go through Vite proxy (which routes to correct backend port)
        // The Vite proxy in vite.config.ts handles /api -> http://localhost:${HTTP_PORT}
        const response = await fetch(`/sources?${params}`, { headers });
        
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error("Unauthorized - check your Bearer Token");
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        setFetchedSources(data.sources || []);
        setTotalCount(data.total || 0);
      } catch (error) {
        console.error("Failed to fetch sources:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSources();
  }, [searchQuery, selectedMimeType, offset, bearerToken, user?.id, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription
  const sources = useRealtimeSources(fetchedSources, {
    onInsert: (source) => {
      console.log("New source added:", source);
    },
  });

  // Get unique mime types for filter
  const mimeTypes = Array.from(new Set(sources.map(s => s.mime_type))).sort();

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          {onFileUpload && (
            <Button size="icon" variant="outline" onClick={onFileUpload}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {selectedMimeType || "All types"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Filter by MIME type</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={selectedMimeType}
                onValueChange={(value) => {
                  setSelectedMimeType(value);
                  setOffset(0); // Reset pagination on filter
                }}
              >
                <DropdownMenuRadioItem value="">All types</DropdownMenuRadioItem>
                {mimeTypes.map((type) => (
                  <DropdownMenuRadioItem key={type} value={type}>
                    {type}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="text-sm text-muted-foreground">
          {totalCount} source{totalCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 rounded-md border overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : sources.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p>No sources found</p>
              {(searchQuery || selectedMimeType) && (
                <p className="text-sm mt-2">Try adjusting your filters</p>
              )}
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>MIME Type</TableHead>
                <TableHead>Source Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow
                  key={source.id}
                  onClick={() => onSourceClick(source)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    {source.original_filename || source.file_name || "Unnamed"}
                  </TableCell>
                  <TableCell>{source.mime_type}</TableCell>
                  <TableCell>{source.source_type}</TableCell>
                  <TableCell>
                    {source.file_size ? `${(source.file_size / 1024).toFixed(1)} KB` : "—"}
                  </TableCell>
                  <TableCell>
                    {new Date(source.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination controls */}
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
