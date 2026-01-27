/**
 * Dashboard Component (FU-305)
 * 
 * Overview stats for main objects (sources, entities, observations, events)
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, Users, Eye, Calendar, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardStats {
  sources_count: number;
  entities_by_type: Record<string, number>;
  total_entities: number;
  total_events: number;
  total_observations: number;
  total_interpretations: number;
  last_updated: string;
}

interface DashboardProps {
  onNavigateToSources?: () => void;
  onNavigateToEntities?: () => void;
  onNavigateToTimeline?: () => void;
}

export function Dashboard({ 
  onNavigateToSources, 
  onNavigateToEntities, 
  onNavigateToTimeline 
}: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { user, sessionToken } = useAuth();
  
  // Prefer bearer token from keys, fallback to Supabase session token, then settings
  const bearerToken = keysBearerToken || sessionToken || settings.bearerToken;

  useEffect(() => {
    async function fetchStats() {
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
        const url = userId 
          ? `/api/stats?user_id=${userId}`
          : `/api/stats`;

        const response = await fetch(url, {
          headers,
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error("Unauthorized - check your Bearer Token");
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    }

    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }
    
    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [bearerToken, settings.apiBase, user?.id, keysLoading, sessionToken]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
        <div className="max-w-6xl mx-auto space-y-6">
        {/* Main Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Sources */}
          <Card className="cursor-pointer hover:bg-muted/50" onClick={onNavigateToSources}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sources</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sources_count}</div>
              <p className="text-xs text-muted-foreground">
                Files and documents
              </p>
            </CardContent>
          </Card>

          {/* Entities */}
          <Card className="cursor-pointer hover:bg-muted/50" onClick={onNavigateToEntities}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Entities</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_entities}</div>
              <p className="text-xs text-muted-foreground">
                Resolved entities
              </p>
            </CardContent>
          </Card>

          {/* Timeline Events */}
          <Card className="cursor-pointer hover:bg-muted/50" onClick={onNavigateToTimeline}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Timeline Events</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_events}</div>
              <p className="text-xs text-muted-foreground">
                Chronological events
              </p>
            </CardContent>
          </Card>

          {/* Observations */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Observations</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_observations}</div>
              <p className="text-xs text-muted-foreground">
                Extracted facts
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Entities by Type */}
        <Card>
          <CardHeader>
            <CardTitle>Entities by Type</CardTitle>
            <CardDescription>
              Breakdown of resolved entities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.entities_by_type).length === 0 ? (
              <p className="text-sm text-muted-foreground">No entities yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.entities_by_type)
                  .sort((a, b) => b[1] - a[1]) // Sort by count descending
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{type}</Badge>
                      </div>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interpretations */}
        <Card>
          <CardHeader>
            <CardTitle>AI Interpretations</CardTitle>
            <CardDescription>
              Unstructured file processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Layers className="h-8 w-8 text-muted-foreground" />
              <div>
                <div className="text-2xl font-bold">{stats.total_interpretations}</div>
                <p className="text-xs text-muted-foreground">
                  Total interpretations
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Navigate to main views
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {onNavigateToSources && (
                <Button variant="outline" onClick={onNavigateToSources}>
                  Browse Sources
                </Button>
              )}
              {onNavigateToEntities && (
                <Button variant="outline" onClick={onNavigateToEntities}>
                  Explore Entities
                </Button>
              )}
              {onNavigateToTimeline && (
                <Button variant="outline" onClick={onNavigateToTimeline}>
                  View Timeline
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Last Updated */}
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <div>Last updated: {new Date(stats.last_updated).toLocaleString()}</div>
          {user?.id && (
            <div>User ID: {user.id}</div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
