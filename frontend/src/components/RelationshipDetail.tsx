/**
 * Relationship Detail Component
 * 
 * Display detailed relationship information
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Network } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";

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
  created_at?: string;
}

interface RelationshipDetailProps {
  relationshipId: string;
  onClose: () => void;
  onNavigateToEntity?: (entityId: string) => void;
}

export function RelationshipDetail({
  relationshipId,
  onClose,
  onNavigateToEntity,
}: RelationshipDetailProps) {
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [loading, setLoading] = useState(true);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken } = useAuth();

  // Prefer bearer token from keys, fallback to Supabase session token, then settings
  const bearerToken = keysBearerToken || sessionToken || settings.bearerToken;

  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    async function fetchRelationshipDetail() {
      setLoading(true);
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

        // Include bearer token if available
        if (bearerToken) {
          headers["Authorization"] = `Bearer ${bearerToken}`;
        }

        const response = await fetch(`/api/relationships/${relationshipId}`, { headers });

        if (!response.ok) {
          if (response.status === 404) {
            setRelationship(null);
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setRelationship(data);
      } catch (error) {
        console.error("Failed to fetch relationship:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRelationshipDetail();
  }, [relationshipId, bearerToken, keysLoading, sessionToken, settings.bearerToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!relationship) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Network className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Relationship not found: {relationshipId}</p>
        <Button variant="outline" onClick={onClose}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Relationships
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Relationship</h1>
            <p className="text-sm text-muted-foreground">Relationship details and metadata</p>
          </div>
        </div>
        <Badge variant="secondary">{relationship.relationship_type}</Badge>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Relationship Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Relationship Type</p>
              <p className="text-sm">{relationship.relationship_type}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Observation Count</p>
              <p className="text-sm">{relationship.observation_count}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Last Observation</p>
              <p className="text-sm">
                {new Date(relationship.last_observation_at).toLocaleString()}
              </p>
            </div>
            {relationship.created_at && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-sm">{new Date(relationship.created_at).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Source Entity</h2>
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Entity ID</p>
              {onNavigateToEntity ? (
                <button
                  onClick={() => onNavigateToEntity(relationship.source_entity_id)}
                  className="text-sm font-mono hover:underline"
                >
                  {relationship.source_entity_id}
                </button>
              ) : (
                <p className="text-sm font-mono">{relationship.source_entity_id}</p>
              )}
            </div>
            {relationship.source_canonical_name && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Canonical Name</p>
                <p className="text-sm">{relationship.source_canonical_name}</p>
              </div>
            )}
            {relationship.source_entity_type && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Entity Type</p>
                <Badge variant="outline">{relationship.source_entity_type}</Badge>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Target Entity</h2>
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Entity ID</p>
              {onNavigateToEntity ? (
                <button
                  onClick={() => onNavigateToEntity(relationship.target_entity_id)}
                  className="text-sm font-mono hover:underline"
                >
                  {relationship.target_entity_id}
                </button>
              ) : (
                <p className="text-sm font-mono">{relationship.target_entity_id}</p>
              )}
            </div>
            {relationship.target_canonical_name && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Canonical Name</p>
                <p className="text-sm">{relationship.target_canonical_name}</p>
              </div>
            )}
            {relationship.target_entity_type && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Entity Type</p>
                <Badge variant="outline">{relationship.target_entity_type}</Badge>
              </div>
            )}
          </div>
        </div>

        {relationship.metadata && Object.keys(relationship.metadata).length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Metadata</h2>
              <p className="text-sm text-muted-foreground">Additional relationship metadata</p>
            </div>
            <pre className="text-sm bg-muted p-4 rounded-md overflow-auto">
              {JSON.stringify(relationship.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
