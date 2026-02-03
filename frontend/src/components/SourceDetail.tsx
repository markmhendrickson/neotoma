/**
 * Source Detail View (FU-302)
 * 
 * Displays source with four-layer truth model:
 * Source → Interpretations → Observations → Entities
 * 
 * Replaces deprecated RecordDetailsPanel (which uses records table)
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtime } from "@/contexts/RealtimeContext";

interface Source {
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

interface Interpretation {
  id: string;
  source_id: string;
  interpretation_config: {
    model?: string;
    temperature?: number;
    prompt_hash?: string;
  };
  status: string;
  started_at: string;
  completed_at?: string;
  observations_created: number;
}

interface Observation {
  id: string;
  entity_id: string;
  entity_type: string;
  source_id: string | null;
  interpretation_id: string | null;
  fields: Record<string, unknown>;
  source_priority: number;
  observed_at: string;
}

interface SourceDetailProps {
  sourceId: string;
  onClose?: () => void;
}

export function SourceDetail({ sourceId, onClose }: SourceDetailProps) {
  const [source, setSource] = useState<Source | null>(null);
  const [interpretations, setInterpretations] = useState<Interpretation[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken } = useAuth();
  
  // Prefer bearer token from keys, fallback to Supabase session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    async function fetchSourceDetail() {
      setLoading(true);
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };
        
        // Include bearer token if available
        if (bearerToken) {
          headers["Authorization"] = `Bearer ${bearerToken}`;
        }

        // Fetch source - use relative URL to go through Vite proxy
        const sourceResponse = await fetch(`/api/sources/${sourceId}`, { headers });
        if (!sourceResponse.ok) {
          if (sourceResponse.status === 404) {
            setSource(null);
            return;
          }
          throw new Error(`HTTP ${sourceResponse.status}: ${sourceResponse.statusText}`);
        }
        const sourceData = await sourceResponse.json();
        setSource(sourceData);

        // Fetch interpretations for this source
        const interpretationsResponse = await fetch(
          `/api/interpretations?source_id=${sourceId}`,
          { headers }
        );
        if (!interpretationsResponse.ok) {
          throw new Error(`HTTP ${interpretationsResponse.status}: ${interpretationsResponse.statusText}`);
        }
        const interpretationsData = await interpretationsResponse.json();
        setInterpretations(interpretationsData.interpretations || []);

        // Fetch observations for this source
        const observationsResponse = await fetch(
          `/api/observations?source_id=${sourceId}`,
          { headers }
        );
        if (!observationsResponse.ok) {
          throw new Error(`HTTP ${observationsResponse.status}: ${observationsResponse.statusText}`);
        }
        const observationsData = await observationsResponse.json();
        setObservations(observationsData.observations || []);
      } catch (error) {
        console.error("Failed to fetch source detail:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSourceDetail();
  }, [sourceId, bearerToken, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription for source updates
  const { subscribe } = useRealtime();
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !sourceId) return;

    const unsubscribe = subscribe({
      table: "sources",
      event: "UPDATE",
      filter: `id=eq.${sourceId}`,
      callback: (payload) => {
        const { new: updatedSource } = payload;
        setSource(updatedSource as Source);
      },
    });

    return unsubscribe;
  }, [sourceId, user, subscribe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Source not found</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Source Metadata */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Source</CardTitle>
                <CardDescription>
                  {source.original_filename || source.file_name || "Unnamed source"}
                </CardDescription>
              </div>
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">MIME Type:</span>{" "}
                <Badge variant="secondary">{source.mime_type}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Source Type:</span>{" "}
                <Badge variant="secondary">{source.source_type}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Size:</span>{" "}
                {source.file_size ? `${(source.file_size / 1024).toFixed(1)} KB` : "Unknown"}
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>{" "}
                {new Date(source.created_at).toLocaleString()}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Content Hash:</span>{" "}
                <code className="text-xs">{source.content_hash.substring(0, 16)}...</code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Four-Layer Truth Model Tabs */}
        <Tabs defaultValue="interpretations" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="interpretations">
              Interpretations ({interpretations.length})
            </TabsTrigger>
            <TabsTrigger value="observations">
              Observations ({observations.length})
            </TabsTrigger>
            <TabsTrigger value="content">Raw Content</TabsTrigger>
          </TabsList>

          {/* Interpretations Tab */}
          <TabsContent value="interpretations" className="space-y-4">
            {interpretations.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">
                    No interpretations yet
                  </p>
                </CardContent>
              </Card>
            ) : (
              interpretations.map((interp) => (
                <Card key={interp.id}>
                  <CardHeader>
                    <CardTitle className="text-base">Interpretation</CardTitle>
                    <CardDescription className="text-xs font-mono">
                      {interp.id}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Model:</span>{" "}
                      {interp.interpretation_config.model || "Unknown"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Temperature:</span>{" "}
                      {interp.interpretation_config.temperature ?? "N/A"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <Badge variant={interp.status === "completed" ? "default" : "secondary"}>
                        {interp.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Started:</span>{" "}
                      {new Date(interp.started_at).toLocaleString()}
                    </div>
                    {interp.completed_at && (
                      <div>
                        <span className="text-muted-foreground">Completed:</span>{" "}
                        {new Date(interp.completed_at).toLocaleString()}
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Observations Created:</span>{" "}
                      {interp.observations_created}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Observations Tab */}
          <TabsContent value="observations" className="space-y-4">
            {observations.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">
                    No observations yet
                  </p>
                </CardContent>
              </Card>
            ) : (
              observations.map((obs) => (
                <Card key={obs.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">
                          {obs.entity_type}
                        </CardTitle>
                        <CardDescription className="text-xs font-mono">
                          Entity: {obs.entity_id.substring(0, 16)}...
                        </CardDescription>
                      </div>
                      <Badge variant={obs.source_priority === 1000 ? "destructive" : "secondary"}>
                        Priority: {obs.source_priority}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Provenance */}
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>
                        <span className="font-medium">Source:</span>{" "}
                        {obs.source_id ? (
                          <code>{obs.source_id.substring(0, 16)}...</code>
                        ) : (
                          "Direct API"
                        )}
                      </div>
                      <div>
                        <span className="font-medium">Interpretation:</span>{" "}
                        {obs.interpretation_id ? (
                          <code>{obs.interpretation_id.substring(0, 16)}...</code>
                        ) : (
                          "None"
                        )}
                      </div>
                      <div>
                        <span className="font-medium">Observed:</span>{" "}
                        {new Date(obs.observed_at).toLocaleString()}
                      </div>
                    </div>

                    <Separator />

                    {/* Fields */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Extracted Fields</h4>
                      <div className="space-y-1 text-sm">
                        {Object.entries(obs.fields).map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-4">
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="font-mono text-xs truncate">
                              {JSON.stringify(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Raw Content Tab */}
          <TabsContent value="content">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw Content</CardTitle>
                <CardDescription>
                  Extracted text from source
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded-md overflow-auto max-h-96">
                  {source.raw_text || "No raw text available"}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
