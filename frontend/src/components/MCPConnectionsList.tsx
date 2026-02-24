/**
 * MCP Connections List Component
 * 
 * Shows and manages user's MCP OAuth connections
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface MCPConnection {
  connectionId: string;
  clientName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function MCPConnectionsList() {
  const { sessionToken } = useAuth();
  const { toast } = useToast();
  const [connections, setConnections] = useState<MCPConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchConnections = async () => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Always use relative URL in development to leverage Vite proxy (which handles branch-based port assignment)
      // In production, VITE_API_BASE_URL will be set to the production API URL
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const isDev = typeof window !== 'undefined' && (import.meta.env.DEV || apiBase === window.location.origin || !apiBase);
      const apiUrl = isDev ? "/mcp/oauth/connections" : `${apiBase}/mcp/oauth/connections`;
      const response = await fetch(apiUrl, {
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch connections");
      }

      const data = await response.json();
      setConnections(data.connections || []);
    } catch (error: any) {
      console.error("Failed to fetch MCP connections:", error);
      toast({
        title: "Error",
        description: "Failed to fetch MCP connections",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const revokeConnection = async (connectionId: string) => {
    if (!sessionToken) return;

    try {
      setRevoking(connectionId);
      // Always use relative URL in development to leverage Vite proxy (which handles branch-based port assignment)
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const isDev = typeof window !== 'undefined' && (import.meta.env.DEV || apiBase === window.location.origin || !apiBase);
      const apiUrl = isDev 
        ? `/mcp/oauth/connections/${encodeURIComponent(connectionId)}`
        : `${apiBase}/mcp/oauth/connections/${encodeURIComponent(connectionId)}`;
      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to revoke connection");
      }

      toast({
        title: "Connection revoked",
        description: `Connection ${connectionId} has been revoked`,
      });

      // Refresh list
      await fetchConnections();
    } catch (error: any) {
      console.error("Failed to revoke connection:", error);
      toast({
        title: "Error",
        description: "Failed to revoke connection",
        variant: "destructive",
      });
    } finally {
      setRevoking(null);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, [sessionToken]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>MCP Connections</CardTitle>
          <CardDescription>Loading connections...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!sessionToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>MCP Connections</CardTitle>
          <CardDescription>Please sign in to view your connections</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>MCP Connections</CardTitle>
          <CardDescription>
            Manage your MCP OAuth connections
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchConnections}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No connections yet. Create one using the OAuth flow above.
          </p>
        ) : (
          <div className="space-y-3" data-connections-list>
            {connections.map((conn) => (
              <div
                key={conn.connectionId}
                data-connection-id={conn.connectionId}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {conn.connectionId}
                    </code>
                    {conn.clientName && (
                      <Badge variant="secondary" data-connection-status="active">{conn.clientName}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created: {new Date(conn.createdAt).toLocaleString()}
                    {conn.lastUsedAt && (
                      <> • Last used: {new Date(conn.lastUsedAt).toLocaleString()}</>
                    )}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => revokeConnection(conn.connectionId)}
                  disabled={revoking === conn.connectionId}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
