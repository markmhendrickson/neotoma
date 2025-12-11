/**
 * Relationships Service for Relationship Types (FU-059)
 *
 * Manages first-class typed relationships between entities.
 */

import { supabase } from "../db.js";

export type RelationshipType =
  | "PART_OF"
  | "CORRECTS"
  | "REFERS_TO"
  | "SETTLES"
  | "DUPLICATE_OF"
  | "DEPENDS_ON"
  | "SUPERSEDES";

export interface Relationship {
  id: string;
  relationship_type: RelationshipType;
  source_entity_id: string;
  target_entity_id: string;
  source_record_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user_id: string;
}

export class RelationshipsService {
  private validTypes: Set<RelationshipType> = new Set([
    "PART_OF",
    "CORRECTS",
    "REFERS_TO",
    "SETTLES",
    "DUPLICATE_OF",
    "DEPENDS_ON",
    "SUPERSEDES",
  ]);

  /**
   * Create relationship
   */
  async createRelationship(params: {
    relationship_type: RelationshipType;
    source_entity_id: string;
    target_entity_id: string;
    source_record_id?: string | null;
    metadata?: Record<string, unknown>;
    user_id: string;
  }): Promise<Relationship> {
    if (!this.validTypes.has(params.relationship_type)) {
      throw new Error(`Invalid relationship type: ${params.relationship_type}`);
    }

    const { data, error } = await supabase
      .from("relationships")
      .insert({
        relationship_type: params.relationship_type,
        source_entity_id: params.source_entity_id,
        target_entity_id: params.target_entity_id,
        source_record_id: params.source_record_id || null,
        metadata: params.metadata || {},
        user_id: params.user_id,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create relationship: ${error.message}`);
    }

    return data as Relationship;
  }

  /**
   * Get relationships for entity
   */
  async getRelationshipsForEntity(
    entityId: string,
    direction: "outgoing" | "incoming" | "both" = "both"
  ): Promise<Relationship[]> {
    let query;

    if (direction === "outgoing") {
      query = supabase
        .from("relationships")
        .select("*")
        .eq("source_entity_id", entityId);
    } else if (direction === "incoming") {
      query = supabase
        .from("relationships")
        .select("*")
        .eq("target_entity_id", entityId);
    } else {
      query = supabase
        .from("relationships")
        .select("*")
        .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      throw new Error(`Failed to get relationships: ${error.message}`);
    }

    return (data || []) as Relationship[];
  }

  /**
   * Get relationships by type
   */
  async getRelationshipsByType(
    type: RelationshipType
  ): Promise<Relationship[]> {
    const { data, error } = await supabase
      .from("relationships")
      .select("*")
      .eq("relationship_type", type)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get relationships by type: ${error.message}`);
    }

    return (data || []) as Relationship[];
  }
}

export const relationshipsService = new RelationshipsService();



