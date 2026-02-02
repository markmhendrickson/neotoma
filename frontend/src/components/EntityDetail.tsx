/**
 * Entity Detail Component (FU-601)
 * 
 * Display entity snapshot with provenance, observations, and relationships
 */

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { getSchemaIcon, type SchemaMetadata } from "@/utils/schemaIcons";
import { getEntityDisplayName } from "@/utils/entityDisplay";
import { useRealtime } from "@/contexts/RealtimeContext";

interface EntitySnapshot {
  entity_id: string;
  entity_type: string;
  canonical_name: string;
  snapshot: Record<string, unknown>;
  raw_fragments?: Record<string, unknown>;
  observation_count: number;
  last_observation_at: string;
  provenance: Record<string, unknown>;
}

interface Observation {
  id: string;
  entity_id: string;
  source_id: string | null;
  interpretation_id: string | null;
  fields: Record<string, unknown>;
  source_priority: number;
  observed_at: string;
}

interface Relationship {
  id: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  metadata: Record<string, unknown>;
}

interface Source {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

interface Interpretation {
  id: string;
  source_id: string;
  status: string;
  started_at: string;
  completed_at?: string;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  event_timestamp: string;
  source_record_id?: string;
  entity_ids?: string[];
}

interface SchemaInfo {
  entity_type: string;
  schema_version: string;
  schema_definition: {
    fields: Record<string, {
      type: string;
      required?: boolean;
    }>;
  };
  metadata?: SchemaMetadata;
}

interface EntityDetailProps {
  entityId: string;
  onClose?: () => void;
  onNavigateToSource?: (sourceId: string) => void;
  onNavigateToEntity?: (entityId: string) => void;
}

export function EntityDetail({ 
  entityId, 
  onClose, 
  onNavigateToSource,
  onNavigateToEntity 
}: EntityDetailProps) {
  const [entity, setEntity] = useState<EntitySnapshot | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [relationships, setRelationships] = useState<{
    outgoing: Relationship[];
    incoming: Relationship[];
  }>({ outgoing: [], incoming: [] });
  const [sources, setSources] = useState<Source[]>([]);
  const [interpretations, setInterpretations] = useState<Interpretation[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllProperties, setShowAllProperties] = useState(false);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken, user } = useAuth();
  
  // Prefer bearer token from keys, fallback to Supabase session token, then settings
  const bearerToken = keysBearerToken || sessionToken || settings.bearerToken;

  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    async function fetchEntityDetail() {
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
        
        // Fetch entity with provenance
        const entityResponse = await fetch(`/api/entities/${entityId}`, { headers });
        if (!entityResponse.ok) {
          if (entityResponse.status === 404) {
            setEntity(null);
            return;
          }
          throw new Error(`HTTP ${entityResponse.status}: ${entityResponse.statusText}`);
        }
        const entityData = await entityResponse.json();
        setEntity(entityData);

        // Fetch observations
        const observationsResponse = await fetch(
          `/api/entities/${entityId}/observations`,
          { headers }
        );
        if (!observationsResponse.ok) {
          throw new Error(`HTTP ${observationsResponse.status}: ${observationsResponse.statusText}`);
        }
        const observationsData = await observationsResponse.json();
        setObservations(observationsData.observations || []);

        // Fetch relationships
        const relationshipsResponse = await fetch(
          `/api/entities/${entityId}/relationships`,
          { headers }
        );
        if (!relationshipsResponse.ok) {
          throw new Error(`HTTP ${relationshipsResponse.status}: ${relationshipsResponse.statusText}`);
        }
        const relationshipsData = await relationshipsResponse.json();
        setRelationships({
          outgoing: relationshipsData.outgoing || [],
          incoming: relationshipsData.incoming || [],
        });

        // Fetch related sources (from observations)
        const uniqueSourceIds = Array.from(
          new Set(
            observations
              .map((obs) => obs.source_id)
              .filter((id): id is string => id !== null)
          )
        );

        if (uniqueSourceIds.length > 0) {
          try {
            const sourcesPromises = uniqueSourceIds.map(async (sourceId) => {
              const sourceResponse = await fetch(`/api/sources/${sourceId}`, { headers });
              if (sourceResponse.ok) {
                return await sourceResponse.json();
              }
              return null;
            });
            const sourcesData = await Promise.all(sourcesPromises);
            setSources(sourcesData.filter((s): s is Source => s !== null));
          } catch (error) {
            console.error("Failed to fetch sources:", error);
          }
        }

        // Fetch related interpretations (from observations)
        const uniqueInterpretationIds = Array.from(
          new Set(
            observations
              .map((obs) => obs.interpretation_id)
              .filter((id): id is string => id !== null)
          )
        );

        // Fetch interpretations for sources that have observations for this entity
        if (uniqueSourceIds.length > 0) {
          try {
            // Get interpretations by source_id
            const interpretationPromises = uniqueSourceIds.map(async (sourceId) => {
              const interpretationResponse = await fetch(
                `/api/interpretations?source_id=${sourceId}`,
                { headers }
              );
              if (interpretationResponse.ok) {
                const data = await interpretationResponse.json();
                return data.interpretations || [];
              }
              return [];
            });
            const interpretationsArrays = await Promise.all(interpretationPromises);
            const allInterpretations = interpretationsArrays.flat();
            // Filter to only those that created observations for this entity
            const relevantInterpretations = allInterpretations.filter((interp: Interpretation) =>
              uniqueInterpretationIds.includes(interp.id)
            );
            setInterpretations(relevantInterpretations);
          } catch (error) {
            console.error("Failed to fetch interpretations:", error);
          }
        }

        // Fetch timeline events for this entity
        // Get source IDs from observations to find related events
        const observationSourceIds = Array.from(
          new Set(
            observations
              .map((obs) => obs.source_id)
              .filter((id): id is string => id !== null)
          )
        );

        if (observationSourceIds.length > 0) {
          try {
            // Fetch recent timeline events and filter for this entity
            const timelineResponse = await fetch(
              `/api/timeline?limit=200`,
              { headers }
            );
            if (timelineResponse.ok) {
              const timelineData = await timelineResponse.json();
              const allEvents = timelineData.events || [];
              // Filter events related to this entity
              const entityEvents = allEvents.filter((event: TimelineEvent) => {
                // Check if event has entity_ids array containing our entity
                if (event.entity_ids && Array.isArray(event.entity_ids) && event.entity_ids.includes(entityId)) {
                  return true;
                }
                // Check if event's source_record_id matches any source that has observations for this entity
                if (event.source_record_id && observationSourceIds.includes(event.source_record_id)) {
                  return true;
                }
                return false;
              });
              setTimelineEvents(entityEvents);
            }
          } catch (error) {
            console.error("Failed to fetch timeline events:", error);
          }
        }

        // Fetch schema for this entity type (skip if not registered)
        if (entityData.entity_type) {
          try {
            const schemaParams = new URLSearchParams();
            schemaParams.append("keyword", entityData.entity_type);
            if (user?.id) {
              schemaParams.append("user_id", user.id);
            }
            const schemaIndexResponse = await fetch(
              `/api/schemas?${schemaParams.toString()}`,
              { headers }
            );

            if (schemaIndexResponse.ok) {
              const schemaIndex = await schemaIndexResponse.json();
              const schemaExists = (schemaIndex.schemas || []).some(
                (schemaItem: { entity_type?: string }) =>
                  schemaItem.entity_type === entityData.entity_type
              );

              if (schemaExists) {
                const detailParams = new URLSearchParams();
                if (user?.id) {
                  detailParams.append("user_id", user.id);
                }
                const detailQuery = detailParams.toString();
                const schemaResponse = await fetch(
                  `/api/schemas/${encodeURIComponent(entityData.entity_type)}${
                    detailQuery ? `?${detailQuery}` : ""
                  }`,
                  { headers }
                );
                if (schemaResponse.ok) {
                  const schemaData = await schemaResponse.json();
                  setSchema(schemaData);
                }
              }
            }
          } catch (error) {
            console.error("Failed to fetch schema:", error);
          }
        }
      } catch (error) {
        console.error("Failed to fetch entity detail:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchEntityDetail();
  }, [entityId, bearerToken, keysLoading, sessionToken, settings.bearerToken]);

  // Add real-time subscription for entity updates
  const { subscribe } = useRealtime();

  useEffect(() => {
    if (!user || !entityId) return;

    const unsubscribe = subscribe({
      table: "entities",
      event: "UPDATE",
      filter: `entity_id=eq.${entityId}`,
      callback: (payload) => {
        const { new: updatedEntity } = payload;
        setEntity(updatedEntity as EntitySnapshot);
      },
    });

    return unsubscribe;
  }, [entityId, user, subscribe]);

  const entityName = useMemo(() => {
    if (!entity) return "Entity";
    return getEntityDisplayName(entity);
  }, [entity]);

  const snapshotEntries = useMemo(() => {
    if (!entity) return [];
    return Object.entries(entity.snapshot).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
  }, [entity]);

  const visibleSnapshotEntries = showAllProperties ? snapshotEntries : snapshotEntries.slice(0, 5);
  const hasMoreProperties = snapshotEntries.length > 5;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Entity not found</p>
      </div>
    );
  }

  const totalRelationships = relationships.outgoing.length + relationships.incoming.length;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Entity header (page title block) */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">{entity.entity_type}</Badge>
            {schema && (
              <Badge variant="outline" className="text-xs">
                Schema v{schema.schema_version}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-semibold">{entityName}</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            {entity.entity_id}
          </p>
          <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
            <div>
              <span className="text-muted-foreground">Observations:</span> {entity.observation_count}
            </div>
            <div>
              <span className="text-muted-foreground">Sources:</span> {sources.length}
            </div>
            <div>
              <span className="text-muted-foreground">Interpretations:</span> {interpretations.length}
            </div>
            <div>
              <span className="text-muted-foreground">Timeline events:</span> {timelineEvents.length}
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Last updated:</span>{" "}
              {new Date(entity.last_observation_at).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Current truth (entity snapshot) */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Current truth (entity snapshot)</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Computed from all observations via reducer
          </p>
          {snapshotEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshot fields</p>
          ) : (
            <div className="space-y-2">
              {visibleSnapshotEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{key}:</span>
                  <span className="font-mono text-xs truncate">
                    {JSON.stringify(value)}
                  </span>
                </div>
              ))}
              {hasMoreProperties && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 text-sm text-muted-foreground"
                  onClick={() => setShowAllProperties((prev) => !prev)}
                >
                  {showAllProperties ? "Show fewer properties" : "Show all properties"}
                </Button>
              )}
            </div>
          )}
        </section>

        {entity.raw_fragments && Object.keys(entity.raw_fragments).length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Raw fragments (unvalidated)</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Fields not yet in schema
            </p>
            <div className="space-y-2">
              {Object.entries(entity.raw_fragments).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{key}:</span>
                  <span className="font-mono text-xs truncate">
                    {JSON.stringify(value)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Schema definition */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Schema definition</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {schema ? `Entity type: ${schema.entity_type} (v${schema.schema_version})` : "Schema information"}
          </p>
          {schema ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 mb-4">
                {getSchemaIcon(schema.entity_type, schema.metadata) && (
                  <div className="shrink-0">
                    {(() => {
                      const Icon = getSchemaIcon(schema.entity_type, schema.metadata);
                      return Icon ? <Icon className="size-6" /> : null;
                    })()}
                  </div>
                )}
              </div>
              {Object.entries(schema.schema_definition.fields || {}).map(([fieldName, fieldDef]) => (
                <div key={fieldName} className="flex items-start gap-4 text-sm border-b pb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fieldName}</span>
                      {fieldDef.required && (
                        <Badge variant="outline" className="text-xs">Required</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Type: {fieldDef.type}
                    </div>
                  </div>
                </div>
              ))}
              {Object.keys(schema.schema_definition.fields || {}).length === 0 && (
                <p className="text-sm text-muted-foreground">No fields defined</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Schema not found
            </p>
          )}
        </section>

        {/* Sources */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Sources ({sources.length})</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Source files that contributed observations to this entity
          </p>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sources found
            </p>
          ) : (
            <div className="space-y-4">
              {sources.map((source) => (
                <div key={source.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-sm">{source.original_filename}</div>
                      <div className="text-xs font-mono text-muted-foreground mt-1">
                        {source.id}
                      </div>
                    </div>
                    {onNavigateToSource && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigateToSource(source.id)}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">MIME type:</span> {source.mime_type}
                    </div>
                    <div>
                      <span className="text-muted-foreground">File size:</span>{" "}
                      {(source.file_size / 1024).toFixed(2)} KB
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created:</span>{" "}
                      {new Date(source.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Interpretations */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Interpretations ({interpretations.length})</h2>
          <p className="text-sm text-muted-foreground mb-4">
            AI interpretations that extracted data for this entity
          </p>
          {interpretations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No interpretations found
            </p>
          ) : (
            <div className="space-y-4">
              {interpretations.map((interp) => (
                <div key={interp.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {interp.id}
                      </div>
                      <Badge variant={interp.status === "completed" ? "default" : "secondary"} className="mt-2">
                        {interp.status}
                      </Badge>
                    </div>
                    {onNavigateToSource && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigateToSource(interp.source_id)}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View source
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1 text-sm">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Timeline events */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Timeline events ({timelineEvents.length})</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Timeline events related to this entity
          </p>
          {timelineEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No timeline events found
            </p>
          ) : (
            <div className="space-y-4">
              {timelineEvents.map((event) => (
                <div key={event.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-sm">{event.event_type}</div>
                      <div className="text-xs font-mono text-muted-foreground mt-1">
                        {event.id}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {new Date(event.event_timestamp).toLocaleString()}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    {event.source_record_id && (
                      <div>
                        <span className="text-muted-foreground">Source:</span>{" "}
                        <code className="text-xs">{event.source_record_id.substring(0, 16)}...</code>
                      </div>
                    )}
                    {event.entity_ids && event.entity_ids.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Entities:</span> {event.entity_ids.length}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Observations */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Observations ({entity.observation_count})</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Individual observations that contribute to the entity snapshot
          </p>
          {observations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No observations
            </p>
          ) : (
            <div className="space-y-4">
              {observations.map((obs) => (
                <div key={obs.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="text-xs font-mono text-muted-foreground">
                      {obs.id}
                    </div>
                    <Badge variant={obs.source_priority === 1000 ? "destructive" : "secondary"}>
                      Priority: {obs.source_priority}
                    </Badge>
                  </div>
                  {/* Provenance */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Source:</span>
                      {obs.source_id ? (
                        <>
                          <code className="text-xs">{obs.source_id.substring(0, 16)}...</code>
                          {onNavigateToSource && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() => onNavigateToSource(obs.source_id!)}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </>
                      ) : (
                        <span>Direct API</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Interpretation:</span>{" "}
                      {obs.interpretation_id ? (
                        <code className="text-xs">{obs.interpretation_id.substring(0, 16)}...</code>
                      ) : (
                        <span>None</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Observed:</span>{" "}
                      {new Date(obs.observed_at).toLocaleString()}
                    </div>
                  </div>

                  <Separator />

                  {/* Fields */}
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
              ))}
            </div>
          )}
        </section>

        {/* Relationships */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Relationships ({totalRelationships})</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Entity relationships (outgoing and incoming)
          </p>
          {relationships.outgoing.length > 0 && (
            <div className="space-y-3 mb-4">
              <div className="text-sm font-medium text-muted-foreground">Outgoing relationships</div>
              <p className="text-xs text-muted-foreground mb-2">
                Relationships where this entity is the source
              </p>
              {relationships.outgoing.map((rel) => (
                <div key={rel.id} className="flex items-center gap-3 text-sm border rounded-lg p-3">
                  <Badge variant="outline">{rel.relationship_type}</Badge>
                  <span>→</span>
                  <code className="text-xs">{rel.target_entity_id.substring(0, 16)}...</code>
                  {onNavigateToEntity && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => onNavigateToEntity(rel.target_entity_id)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {relationships.incoming.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Incoming relationships</div>
              <p className="text-xs text-muted-foreground mb-2">
                Relationships where this entity is the target
              </p>
              {relationships.incoming.map((rel) => (
                <div key={rel.id} className="flex items-center gap-3 text-sm border rounded-lg p-3">
                  <code className="text-xs">{rel.source_entity_id.substring(0, 16)}...</code>
                  {onNavigateToEntity && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => onNavigateToEntity(rel.source_entity_id)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  <span>→</span>
                  <Badge variant="outline">{rel.relationship_type}</Badge>
                  <span>→ this entity</span>
                </div>
              ))}
            </div>
          )}

          {totalRelationships === 0 && (
            <p className="text-sm text-muted-foreground">
              No relationships
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
