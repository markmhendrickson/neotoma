/**
 * Schema Icons Utility
 * 
 * Provides utilities for loading and rendering schema icons in the frontend.
 * Handles both Lucide icons and custom SVG icons from schema metadata.
 */

import { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";
import React from "react";

export interface IconMetadata {
  icon_type: "lucide" | "svg";
  icon_name: string;
  icon_svg?: string;
  confidence?: number;
  generated_at?: string;
}

export interface SchemaMetadata {
  label?: string;
  description?: string;
  category?: string;
  icon?: IconMetadata;
}

/**
 * Get icon component for a schema
 * 
 * @param entityType - Entity type name
 * @param metadata - Schema metadata containing icon information
 * @returns Lucide icon component or custom SVG component
 */
export function getSchemaIcon(
  entityType: string,
  metadata?: SchemaMetadata
): LucideIcon | React.ComponentType<{ className?: string }> | null {
  if (!metadata?.icon) {
    return getDefaultIcon();
  }
  
  return getIconComponent(metadata.icon);
}

/**
 * Get icon component from icon metadata
 */
export function getIconComponent(
  iconMetadata: IconMetadata
): LucideIcon | React.ComponentType<{ className?: string }> | null {
  if (iconMetadata.icon_type === "lucide") {
    return getLucideIcon(iconMetadata.icon_name);
  }
  
  if (iconMetadata.icon_type === "svg" && iconMetadata.icon_svg) {
    return createSVGComponent(iconMetadata.icon_svg);
  }
  
  return getDefaultIcon();
}

/**
 * Get Lucide icon by name
 */
function getLucideIcon(iconName: string): LucideIcon | null {
  // Lucide icons are exported with their exact names
  const Icon = (LucideIcons as any)[iconName];
  
  if (!Icon) {
    console.warn(`[SCHEMA_ICONS] Lucide icon not found: ${iconName}`);
    return null;
  }
  
  return Icon as LucideIcon;
}

/**
 * Create React component from SVG string
 */
function createSVGComponent(
  svgString: string
): React.ComponentType<{ className?: string }> {
  return ({ className }: { className?: string }) => {
    return React.createElement("span", {
      className,
      dangerouslySetInnerHTML: { __html: svgString },
      style: { display: "inline-flex", alignItems: "center" },
    });
  };
}

/**
 * Get default icon (File icon as fallback)
 */
function getDefaultIcon(): LucideIcon {
  return LucideIcons.File;
}

/**
 * Fetch schema metadata from API
 * 
 * @param entityType - Entity type to fetch metadata for
 * @param bearerToken - Authentication token
 * @returns Schema metadata or null if not found
 */
function buildSchemasUrl(options?: { userId?: string; keyword?: string }): string {
  const apiBase = import.meta.env.VITE_API_BASE || "";
  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  const params = new URLSearchParams();

  if (options?.userId) {
    params.append("user_id", options.userId);
  }

  if (options?.keyword) {
    params.append("keyword", options.keyword);
  }

  const queryString = params.toString();
  return `${base}/schemas${queryString ? `?${queryString}` : ""}`;
}

export async function fetchSchemaMetadata(
  entityType: string,
  bearerToken: string,
  userId?: string
): Promise<SchemaMetadata | null> {
  try {
    const response = await fetch(
      buildSchemasUrl({ userId, keyword: entityType }),
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      console.warn(`[SCHEMA_ICONS] Failed to fetch schema metadata list`);
      return null;
    }

    const data = await response.json();
    const match = (data.schemas || []).find(
      (schema: { entity_type?: string }) => schema.entity_type === entityType
    );
    return match?.metadata || null;
  } catch (error) {
    console.error(`[SCHEMA_ICONS] Error fetching schema metadata:`, error);
    return null;
  }
}

/**
 * Batch fetch schema metadata for multiple entity types
 */
export async function fetchSchemaMetadataBatch(
  entityTypes: string[],
  bearerToken: string,
  userId?: string
): Promise<Map<string, SchemaMetadata>> {
  const metadataMap = new Map<string, SchemaMetadata>();

  try {
    const response = await fetch(buildSchemasUrl({ userId }), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      console.warn(`[SCHEMA_ICONS] Failed to fetch schema metadata list`);
      return metadataMap;
    }

    const data = await response.json();
    const metadataByType = new Map(
      (data.schemas || []).map((schema: { entity_type: string; metadata?: SchemaMetadata }) => [
        schema.entity_type,
        schema.metadata || {},
      ])
    );

    for (const entityType of entityTypes) {
      const metadata = metadataByType.get(entityType);
      if (metadata) {
        metadataMap.set(entityType, metadata);
      }
    }
  } catch (error) {
    console.error(`[SCHEMA_ICONS] Error fetching schema metadata list:`, error);
  }

  return metadataMap;
}

/**
 * Cache for schema metadata to avoid redundant API calls
 */
const metadataCache = new Map<string, SchemaMetadata>();

/**
 * Get schema metadata with caching
 */
export async function getCachedSchemaMetadata(
  entityType: string,
  bearerToken: string,
  userId?: string
): Promise<SchemaMetadata | null> {
  // Check cache first
  if (metadataCache.has(entityType)) {
    return metadataCache.get(entityType)!;
  }
  
  // Fetch and cache
  const metadata = await fetchSchemaMetadata(entityType, bearerToken, userId);
  if (metadata) {
    metadataCache.set(entityType, metadata);
  }
  
  return metadata;
}

/**
 * Clear schema metadata cache
 */
export function clearMetadataCache(): void {
  metadataCache.clear();
}
