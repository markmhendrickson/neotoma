/**
 * Schema Detail Component
 * 
 * Display detailed schema information including all fields and their definitions
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Database, CheckCircle2, XCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { getSchemaIcon, type SchemaMetadata } from "@/utils/schemaIcons";

interface SchemaDetail {
  id: string;
  entity_type: string;
  schema_version: string;
  schema_definition: {
    fields: Record<string, {
      type: string;
      required?: boolean;
      description?: string;
      reducer_strategy?: string;
    }>;
  };
  reducer_config: {
    merge_policies?: Record<string, string>;
  };
  active: boolean;
  created_at: string;
  metadata?: SchemaMetadata;
}

interface SchemaDetailProps {
  entityType: string;
  onClose: () => void;
}

export function SchemaDetail({ entityType, onClose }: SchemaDetailProps) {
  const [schema, setSchema] = useState<SchemaDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, loading: keysLoading } = useKeys();
  const { sessionToken, user } = useAuth();

  // Prefer bearer token from keys, fallback to session token, then settings
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  useEffect(() => {
    // Wait for keys to load before making request (if using keys)
    if (keysLoading && !sessionToken && !settings.bearerToken) {
      return;
    }

    async function fetchSchemaDetail() {
      setLoading(true);
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

        // Include bearer token if available
        if (bearerToken) {
          headers["Authorization"] = `Bearer ${bearerToken}`;
        }

        const params = new URLSearchParams();
        if (user?.id) {
          params.append("user_id", user.id);
        }
        const queryString = params.toString();
        const url = `/schemas/${encodeURIComponent(entityType)}${queryString ? `?${queryString}` : ""}`;
        const response = await fetch(url, { headers });

        if (!response.ok) {
          if (response.status === 404) {
            setSchema(null);
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setSchema(data);
      } catch (error) {
        console.error("Failed to fetch schema:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSchemaDetail();
  }, [entityType, bearerToken, keysLoading, sessionToken, settings.bearerToken, user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Database className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Schema not found: {entityType}</p>
        <Button variant="outline" onClick={onClose}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Schemas
        </Button>
      </div>
    );
  }

  const fields = schema.schema_definition?.fields || {};
  const fieldEntries = Object.entries(fields).filter(([key]) => key); // Filter out empty keys
  const Icon = getSchemaIcon(schema.entity_type, schema.metadata);

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            {Icon && <Icon className="size-8 shrink-0" />}
            <div>
              <h1 className="text-2xl font-bold">{schema.entity_type}</h1>
              <p className="text-sm text-muted-foreground">Schema definition and field specifications</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={schema.active ? "default" : "secondary"}>
            {schema.active ? "Active" : "Inactive"}
          </Badge>
          <Badge variant="outline">v{schema.schema_version}</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Schema Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Entity Type</p>
              <p className="text-sm">{schema.entity_type}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Schema Version</p>
              <p className="text-sm">{schema.schema_version}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="text-sm">{schema.active ? "Active" : "Inactive"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="text-sm">{new Date(schema.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Fields ({fieldEntries.length})</h2>
            <p className="text-sm text-muted-foreground">Field definitions and types</p>
          </div>
          <div className="space-y-4">
            {fieldEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fields defined</p>
            ) : (
              fieldEntries.map(([fieldName, fieldDef], index) => (
                <div key={fieldName}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{fieldName}</h4>
                        <Badge variant="outline">{fieldDef.type}</Badge>
                        {fieldDef.required ? (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Optional
                          </Badge>
                        )}
                      </div>
                      {fieldDef.description && (
                        <p className="text-sm text-muted-foreground mb-2">{fieldDef.description}</p>
                      )}
                    </div>
                  </div>
                  {index < fieldEntries.length - 1 && <Separator className="mt-4" />}
                </div>
              ))
            )}
          </div>
        </div>

        {schema.reducer_config?.merge_policies && Object.keys(schema.reducer_config.merge_policies).length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Merge Policies</h2>
              <p className="text-sm text-muted-foreground">Field-level merge strategies</p>
            </div>
            <div className="space-y-2">
              {Object.entries(schema.reducer_config.merge_policies).map(([field, policy]) => (
                <div key={field} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{field}</span>
                  <Badge variant="outline">
                    {typeof policy === "string" ? policy : policy?.strategy || String(policy)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
