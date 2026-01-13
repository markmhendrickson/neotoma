import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { supabase } from "./db.js";
import { config } from "./config.js";
import {
  listCanonicalRecordTypes,
  normalizeRecordType,
} from "./config/record_types.js";
import { generateEmbedding, getRecordText } from "./embeddings.js";
import fs from "fs";
import path from "path";
import { normalizeRow } from "./normalize.js";
import { createRecordFromUploadedFile } from "./services/file_analysis.js";
import { generateRecordSummary } from "./services/summary.js";
import { generateRecordComparisonInsight } from "./services/record_comparison.js";
import {
  ensurePublicKeyRegistered,
  getPublicKey,
  isBearerTokenValid,
} from "./services/public_key_registry.js";
import { verifyRequest, parseAuthHeader } from "./crypto/auth.js";
import { encryptResponseMiddleware } from "./middleware/encrypt_response.js";
import { initServerKeys } from "./services/encryption_service.js";
import { isCsvLike, parseCsvRows } from "./utils/csv.js";
import {
  emitRecordCreated,
  emitRecordUpdated,
  emitRecordDeleted,
} from "./events/event_emitter.js";
import { getEventsByRecordId } from "./events/event_log.js";
import { getRecordAtTimestamp } from "./events/replay.js";
import {
  rankSearchResults,
  sortRecordsDeterministically,
} from "./services/search.js";
import { createObservationsFromRecord } from "./services/observation_ingestion.js";
import {
  serializeChatMessagesForOpenAI,
  type ChatMessage,
} from "./utils/chat.js";
// import { setupDocumentationRoutes } from "./routes/documentation.js";

export const app = express();
// Configure CSP to allow CDN scripts for the uploader and API connects
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
        ],
        connectSrc: ["'self'", "http:", "https:"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        objectSrc: ["'none'"],
        frameSrc: ["'self'"],
      },
    },
  })
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Favicon (no-auth) to avoid 401 noise when not present on disk
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// Basic redaction helpers for safer debug logs
const SENSITIVE_FIELDS = new Set([
  "token",
  "access_token",
  "accessToken",
  "public_token",
  "publicToken",
  "bearer_token",
  "bearerToken",
  "password",
  "secret",
  "api_key",
  "apiKey",
  "client_secret",
  "clientSecret",
  "authorization",
  "Authorization",
]);

const CANONICAL_RECORD_TYPES = listCanonicalRecordTypes();
const CANONICAL_RECORD_TYPE_IDS = CANONICAL_RECORD_TYPES.map((def) => def.id);

function redactHeaders(
  headers: Record<string, unknown>
): Record<string, unknown> {
  const clone = { ...headers } as Record<string, unknown>;
  if (clone.authorization) clone.authorization = "[REDACTED]";
  if (clone.Authorization) clone.Authorization = "[REDACTED]";
  return clone;
}

function redactSensitiveFields(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveFields);
  }

  const redacted = { ...(obj as Record<string, unknown>) };
  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      redacted[key] = "[REDACTED]";
    } else if (typeof redacted[key] === "object" && redacted[key] !== null) {
      redacted[key] = redactSensitiveFields(redacted[key]);
    }
  }
  return redacted;
}

function logDebug(
  event: string,
  req: express.Request,
  extra?: Record<string, unknown>
): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.debug(`[DEBUG] ${event}`, safe);
}

function logWarn(
  event: string,
  req: express.Request,
  extra?: Record<string, unknown>
): void {
  const safe = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.warn(`[WARN] ${event}`, safe);
}

function logError(
  event: string,
  req: express.Request,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const payload = {
    method: req.method,
    path: req.path,
    query: redactSensitiveFields(req.query),
    headers: redactHeaders(req.headers as Record<string, unknown>),
    body: redactSensitiveFields(req.body),
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : redactSensitiveFields(error),
    ...(extra ? (redactSensitiveFields(extra) as Record<string, unknown>) : {}),
  };
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${event}`, payload);
}



// Public health endpoint (no auth)
app.get("/health", (_req, res) => {
  return res.json({ ok: true });
});

// Public key-based authentication middleware
app.use(async (req, res, next) => {
  // Bypass auth for public endpoints
  if (
    req.method === "OPTIONS" ||
    (req.method === "GET" &&
      (req.path === "/openapi.yaml" ||
        req.path === "/health"))
  ) {
    return next();
  }

  const headerAuth = req.headers.authorization || "";

  if (!headerAuth.startsWith("Bearer ")) {
    logWarn("AuthMissingBearer", req);
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  const bearerToken = headerAuth.slice("Bearer ".length).trim();

  // Bearer token is now base64url-encoded Ed25519 public key
  // Auto-register if not exists (first-time user)
  const registered = ensurePublicKeyRegistered(bearerToken);
  if (!registered) {
    logWarn("AuthInvalidTokenFormat", req, {
      bearerTokenLength: bearerToken.length,
    });
    return res.status(403).json({
      error:
        "Invalid bearer token format (must be base64url-encoded Ed25519 public key)",
    });
  }

  if (!isBearerTokenValid(bearerToken)) {
    logWarn("AuthInvalidToken", req);
    return res.status(403).json({ error: "Invalid bearer token (public key)" });
  }

  // Optional: Verify signature if provided
  const { signature } = parseAuthHeader(headerAuth);
  if (signature && req.body) {
    const bodyString =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const isValid = verifyRequest(bodyString, signature, bearerToken);
    if (!isValid) {
      logWarn("AuthInvalidSignature", req);
      return res.status(403).json({ error: "Invalid request signature" });
    }
  }

  // Attach public key to request for encryption service
  (req as any).publicKey = getPublicKey(bearerToken);
  (req as any).bearerToken = bearerToken;

  return next();
});

// Response encryption middleware (applies to all authenticated routes)
app.use(encryptResponseMiddleware);

// Schemas
const StoreSchema = z.object({
  type: z.string(),
  properties: z.record(z.unknown()).default({}),
  file_urls: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

const UpdateSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  file_urls: z.array(z.string()).optional(),
  embedding: z.array(z.number()).optional(),
});

const RetrieveSchema = z.object({
  type: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  limit: z.number().int().positive().max(500).optional(),
  search: z.array(z.string()).optional(),
  search_mode: z
    .enum(["semantic", "keyword", "both"])
    .optional()
    .default("both"),
  similarity_threshold: z.number().min(0).max(1).optional().default(0.3),
  query_embedding: z.array(z.number()).optional(),
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  include_total_count: z.boolean().optional(),
});

const StoreRecordsSchema = z.object({
  records: z.array(StoreSchema).min(1).max(100),
});

const DeleteRecordsSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});


// Endpoints
app.get("/types", async (req, res) => {
  const { data, error } = await supabase
    .from("records")
    .select("type")
    .limit(1000);
  if (error) {
    logError("SupabaseError:types", req, error);
    return res.status(500).json({ error: error.message });
  }
  const set = new Set<string>();
  (data || []).forEach((r: any) => {
    if (r.type) set.add(r.type);
  });
  const custom = Array.from(set)
    .filter((type) => !CANONICAL_RECORD_TYPE_IDS.includes(type))
    .sort();
  return res.json({
    types: [...CANONICAL_RECORD_TYPE_IDS, ...custom],
    canonical: CANONICAL_RECORD_TYPES,
    custom,
  });
});



// ============================================================================
// v0.2.15 Entity-Based HTTP API Endpoints
// ============================================================================

// POST /api/entities/query - Query entities with filters
app.post("/api/entities/query", async (req, res) => {
  const schema = z.object({
    entity_type: z.string().optional(),
    search: z.string().optional(),
    limit: z.number().optional().default(100),
    offset: z.number().optional().default(0),
    user_id: z.string().uuid().optional(), // Optional for authenticated requests
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:entities_query", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { entity_type, search, limit, offset, user_id } = parsed.data;

    // Build query
    let query = supabase
      .from("entities")
      .select("*", { count: "exact" });

    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    if (user_id) {
      query = query.eq("user_id", user_id);
    }

    // Exclude merged entities
    query = query.is("merged_to_entity_id", null);

    // Apply search if provided
    if (search) {
      query = query.ilike("canonical_name", `%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      entities: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    logError("APIError:entities_query", req, error);
    const message =
      error instanceof Error ? error.message : "Failed to query entities";
    return res.status(500).json({ error: message });
  }
});

// POST /api/observations/create - Create observation for entity
app.post("/api/observations/create", async (req, res) => {
  const schema = z.object({
    entity_type: z.string(),
    entity_identifier: z.string(),
    fields: z.record(z.unknown()),
    source_priority: z.number().optional().default(100),
    user_id: z.string().uuid(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:observations_create", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { entity_type, entity_identifier, fields, source_priority, user_id } = parsed.data;

    // Use the ingestStructuredInternal helper from the MCP server
    // For HTTP, we'll implement directly here
    const { createObservationsFromRecord } = await import("./services/observation_ingestion.js");
    const { generateEntityId, normalizeEntityValue } = await import("./services/entity_resolution.js");

    // Generate entity ID
    const normalizedValue = normalizeEntityValue(entity_type, entity_identifier);
    const entity_id = generateEntityId(entity_type, normalizedValue);

    // Ensure entity exists
    const { data: existingEntity } = await supabase
      .from("entities")
      .select("id")
      .eq("id", entity_id)
      .eq("user_id", user_id)
      .single();

    if (!existingEntity) {
      // Create entity
      await supabase.from("entities").insert({
        id: entity_id,
        entity_type,
        canonical_name: normalizedValue,
        user_id,
      });
    }

    // Create observation
    const observation = {
      id: randomUUID(),
      entity_id,
      entity_type,
      schema_version: "1.0",
      source_material_id: null, // No source for direct API creation
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 1.0,
      source_priority,
      fields,
      user_id,
      created_at: new Date().toISOString(),
    };

    const { data: obsData, error: obsError } = await supabase
      .from("observations")
      .insert(observation)
      .select()
      .single();

    if (obsError) throw obsError;

    // Get updated snapshot
    const { data: snapshot } = await supabase
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", entity_id)
      .eq("user_id", user_id)
      .single();

    return res.json({
      observation_id: obsData.id,
      entity_id,
      snapshot: snapshot?.snapshot || {},
    });
  } catch (error) {
    logError("APIError:observations_create", req, error);
    const message =
      error instanceof Error ? error.message : "Failed to create observation";
    return res.status(500).json({ error: message });
  }
});

// POST /api/observations/query - Query observations
app.post("/api/observations/query", async (req, res) => {
  const schema = z.object({
    entity_id: z.string().optional(),
    entity_type: z.string().optional(),
    limit: z.number().optional().default(100),
    offset: z.number().optional().default(0),
    user_id: z.string().uuid().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:observations_query", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { entity_id, entity_type, limit, offset, user_id } = parsed.data;

    let query = supabase
      .from("observations")
      .select("*", { count: "exact" });

    if (entity_id) {
      query = query.eq("entity_id", entity_id);
    }

    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    if (user_id) {
      query = query.eq("user_id", user_id);
    }

    query = query
      .order("observed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      observations: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    logError("APIError:observations_query", req, error);
    const message =
      error instanceof Error ? error.message : "Failed to query observations";
    return res.status(500).json({ error: message });
  }
});

// POST /api/entities/merge - Merge duplicate entities
app.post("/api/entities/merge", async (req, res) => {
  const schema = z.object({
    from_entity_id: z.string(),
    to_entity_id: z.string(),
    merge_reason: z.string().optional(),
    user_id: z.string().uuid(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:entities_merge", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { from_entity_id, to_entity_id, merge_reason, user_id } = parsed.data;

    // Validate both entities exist and belong to user
    const { data: fromEntity } = await supabase
      .from("entities")
      .select("id, merged_to_entity_id")
      .eq("id", from_entity_id)
      .eq("user_id", user_id)
      .single();

    const { data: toEntity } = await supabase
      .from("entities")
      .select("id, merged_to_entity_id")
      .eq("id", to_entity_id)
      .eq("user_id", user_id)
      .single();

    if (!fromEntity || !toEntity) {
      return res.status(404).json({ error: "Entity not found" });
    }

    if (fromEntity.merged_to_entity_id) {
      return res.status(400).json({ error: "Source entity already merged" });
    }

    if (toEntity.merged_to_entity_id) {
      return res.status(400).json({ error: "Target entity already merged" });
    }

    // Rewrite observations
    const { data: rewriteData, error: rewriteError } = await supabase
      .from("observations")
      .update({ entity_id: to_entity_id })
      .eq("entity_id", from_entity_id)
      .eq("user_id", user_id)
      .select("id");

    if (rewriteError) throw rewriteError;

    const observations_moved = rewriteData?.length || 0;

    // Mark source entity as merged
    const { error: mergeError } = await supabase
      .from("entities")
      .update({
        merged_to_entity_id: to_entity_id,
        merged_at: new Date().toISOString(),
      })
      .eq("id", from_entity_id)
      .eq("user_id", user_id);

    if (mergeError) throw mergeError;

    // Record merge in entity_merges table
    await supabase.from("entity_merges").insert({
      user_id,
      from_entity_id,
      to_entity_id,
      reason: merge_reason,
      merged_by: "http_api",
      observations_rewritten: observations_moved,
    });

    // Delete snapshot for merged entity
    await supabase
      .from("entity_snapshots")
      .delete()
      .eq("entity_id", from_entity_id)
      .eq("user_id", user_id);

    // TODO: Trigger snapshot recomputation for to_entity

    return res.json({
      observations_moved,
      merged_at: new Date().toISOString(),
    });
  } catch (error) {
    logError("APIError:entities_merge", req, error);
    const message =
      error instanceof Error ? error.message : "Failed to merge entities";
    return res.status(500).json({ error: message });
  }
});

// ============================================================================
// Legacy Record-Based HTTP API Endpoints (Deprecated in v0.2.15)
// ============================================================================
// REMOVED: Legacy endpoints violate Truth Layer architecture by directly mutating state
// State updates must flow through: Domain Events → Reducers → State Updates
// Use [storing](#storing) via MCP actions (store, correct, merge_entities) instead

// Historical API endpoints for event-sourcing (FU-050)

app.post("/retrieve_records", async (req, res) => {
  const parsed = RetrieveSchema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:retrieve_records", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const {
    type,
    properties,
    limit,
    search,
    search_mode,
    similarity_threshold,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = parsed.data;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const includeTotalCount = include_total_count === true;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };
  const finalLimit = limit ?? 100;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  let totalCount: number | null = null;

  if (hasIdFilter) {
    try {
      const idMatches = await fetchRecordsByIds(ids, normalizedType);
      appendResults(idMatches);
    } catch (error) {
      logError("SupabaseError:retrieve_records:ids", req, error);
      return res
        .status(500)
        .json({ error: (error as any)?.message || "Database error" });
    }
  }

  // Semantic search (vector similarity)
  if (search && (search_mode === "semantic" || search_mode === "both")) {
    // Generate query_embedding from search terms if not provided
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
      if (!query_embedding) {
        logWarn("EmbeddingGeneration:retrieve_records", req, {
          message: "Failed to generate query embedding",
        });
        // Fall back to keyword search only
        if (search_mode === "semantic") {
          // Switch to keyword mode if semantic was required
          const keywordQuery = supabase.from("records").select("*");
          if (normalizedType) keywordQuery.eq("type", normalizedType);
          const { data: keywordCandidates } = await keywordQuery.limit(
            finalLimit * 2
          );
          const searchTextLower = search.join(" ").toLowerCase();
          const keywordMatches = (keywordCandidates || [])
            .filter((rec: any) => {
              const typeMatch = rec.type
                ?.toLowerCase()
                .includes(searchTextLower);
              const propsText = JSON.stringify(
                rec.properties || {}
              ).toLowerCase();
              return typeMatch || propsText.includes(searchTextLower);
            })
            .slice(0, finalLimit);
          logDebug("Success:retrieve_records", req, {
            count: keywordMatches.length,
            search_mode: "keyword (fallback)",
          });
          return res.json(keywordMatches);
        }
      }
    }

    if (!query_embedding) {
      if (search_mode === "semantic") {
        logWarn("ValidationError:retrieve_records:no_embedding", req, {
          message:
            "query_embedding required for semantic search or OPENAI_API_KEY must be configured",
        });
        return res.status(400).json({
          error:
            "query_embedding required for semantic search, or configure OPENAI_API_KEY for automatic generation",
        });
      }
      // If both mode, just skip semantic and do keyword only
    } else if (query_embedding.length !== 1536) {
      logWarn("ValidationError:retrieve_records:embedding_dim", req, {
        received: query_embedding.length,
      });
      return res.status(400).json({
        error:
          "query_embedding must be 1536-dimensional (OpenAI text-embedding-3-small)",
      });
    }

    if (query_embedding) {
      // Fetch records with embeddings for similarity calculation
      // Note: For better performance at scale, create a PostgreSQL function using pgvector operators
      let embeddingQuery = supabase
        .from("records")
        .select("*")
        .not("embedding", "is", null);

      if (normalizedType) {
        embeddingQuery = embeddingQuery.eq("type", normalizedType);
      }

      // Fetch more candidates than limit to filter by similarity
      const { data: candidates, error: fetchError } =
        await embeddingQuery.limit(finalLimit * 10);

      if (fetchError) {
        logError(
          "SupabaseError:retrieve_records:semantic:fetch",
          req,
          fetchError
        );
      } else if (candidates) {
        // Debug: Check embedding format of first candidate
        const sampleEmbedding = candidates[0]?.embedding;
        const embeddingInfo = sampleEmbedding
          ? {
              type: typeof sampleEmbedding,
              isArray: Array.isArray(sampleEmbedding),
              length: Array.isArray(sampleEmbedding)
                ? sampleEmbedding.length
                : "N/A",
              preview:
                typeof sampleEmbedding === "string"
                  ? sampleEmbedding.substring(0, 50)
                  : Array.isArray(sampleEmbedding)
                  ? `[${sampleEmbedding.slice(0, 3).join(", ")}, ...]`
                  : JSON.stringify(sampleEmbedding).substring(0, 50),
            }
          : null;

        logDebug("SemanticSearch:retrieve_records", req, {
          candidates_count: candidates.length,
          similarity_threshold,
          type_filter: normalizedType || "all",
          sample_embedding: embeddingInfo,
        });

        // Calculate cosine similarity for each record
        const queryNorm = Math.sqrt(
          query_embedding.reduce((sum, val) => sum + val * val, 0)
        );

        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;

            // Handle Supabase vector format - it might be stored as string or array
            if (!recEmbedding) {
              return null;
            }

            // Convert string to array if needed (Supabase might return JSON string)
            if (typeof recEmbedding === "string") {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch (e) {
                logWarn("SemanticSearch:embedding_parse_error", req, {
                  rec_id: rec.id?.substring(0, 8),
                  error: e,
                });
                return null;
              }
            }

            // Ensure it's an array with correct dimensions
            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              logWarn("SemanticSearch:embedding_format_error", req, {
                rec_id: rec.id?.substring(0, 8),
                embedding_type: typeof recEmbedding,
                embedding_length: Array.isArray(recEmbedding)
                  ? recEmbedding.length
                  : "not-array",
              });
              return null;
            }

            const dotProduct = query_embedding.reduce(
              (sum, val, i) => sum + val * recEmbedding[i],
              0
            );
            const recNorm = Math.sqrt(
              recEmbedding.reduce(
                (sum: number, val: number) => sum + val * val,
                0
              )
            );
            const similarity = dotProduct / (queryNorm * recNorm);

            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);

        // Log top 5 similarity scores for debugging
        const topScores = scoredCandidates.slice(0, 5).map((rec: any) => ({
          id: rec.id?.substring(0, 8),
          type: rec.type,
          similarity: rec.similarity?.toFixed(4),
        }));

        logDebug("SemanticSearch:similarity_scores", req, {
          top_5_scores: topScores,
          threshold: similarity_threshold,
          candidates_scored: scoredCandidates.length,
        });

        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);

        logDebug("SemanticSearch:results", req, {
          matches_count: semanticMatches.length,
          top_similarity: scoredCandidates[0]?.similarity?.toFixed(4) || "N/A",
          threshold: similarity_threshold,
        });

        appendResults(semanticMatches);
      }
    }
  }

  // Keyword search (ILIKE pattern matching)
  if (search && (search_mode === "keyword" || search_mode === "both")) {
    let keywordQuery = supabase.from("records").select("*");

    if (normalizedType) {
      keywordQuery = keywordQuery.eq("type", normalizedType);
    }

    // Fetch candidates and filter by keyword match
    const { data: keywordCandidates, error: keywordError } =
      await keywordQuery.limit(finalLimit * 2);

    if (keywordError) {
      logError("SupabaseError:retrieve_records:keyword", req, keywordError);
    } else if (keywordCandidates) {
      const searchText = search.join(" ").toLowerCase();
      const keywordMatches = keywordCandidates
        .filter((rec: any) => {
          const typeMatch = rec.type?.toLowerCase().includes(searchText);
          const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
          const propsMatch = propsText.includes(searchText);
          return typeMatch || propsMatch;
        })
        .slice(0, finalLimit);

      appendResults(keywordMatches);
    }
  }

  // No search mode: use existing logic
  if (!search && !hasIdFilter) {
    let query = supabase.from("records").select("*");
    if (normalizedType) query = query.eq("type", normalizedType);
    // Use deterministic ordering: created_at DESC, then id ASC for tiebreaker
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(finalLimit);

    const { data, error } = await query;
    if (error) {
      logError("SupabaseError:retrieve_records", req, error, {
        code: (error as any).code,
      });
      return res.status(500).json({ error: error.message });
    }
    appendResults(data || []);
  }

  let results = Array.from(resultMap.values());
  // Filter by exact property matches (if specified)
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic ranking (FU-105)
  if (search && search.length > 0) {
    const searchText = search.join(" ");
    results = rankSearchResults(results, searchText);
  } else if (hasIdFilter && !properties && ids) {
    // When only IDs are provided (no search, no properties), preserve order from ids array
    const orderMap = new Map(ids.map((id, index) => [id, index]));
    const idResults: any[] = [];
    const otherResults: any[] = [];
    for (const rec of results) {
      if (orderMap.has(rec.id)) {
        idResults.push(rec);
      } else {
        otherResults.push(rec);
      }
    }
    idResults.sort((a, b) => {
      const aIndex = orderMap.get(a.id) ?? Infinity;
      const bIndex = orderMap.get(b.id) ?? Infinity;
      return aIndex - bIndex;
    });
    results = [...idResults, ...otherResults];
  } else {
    // No search query - sort deterministically
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response to reduce size (ChatGPT Actions has response size limits)
  const resultsWithoutEmbeddings = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  if (includeTotalCount) {
    if (!search && !hasIdFilter && !properties) {
      try {
        const countOptions: {
          count: "exact";
          head: true;
          eq?: [string, string];
        } = {
          count: "exact",
          head: true,
        };
        let countQuery = supabase.from("records").select("id", countOptions);
        if (normalizedType) {
          countQuery = countQuery.eq("type", normalizedType);
        }
        const { count, error: countError } = await countQuery;
        if (countError) {
          logError("SupabaseError:retrieve_records:count", req, countError);
        } else if (typeof count === "number") {
          totalCount = count;
        }
      } catch (countError) {
        logError("SupabaseError:retrieve_records:count", req, countError);
      }
    } else if (hasIdFilter && ids) {
      totalCount = ids.length;
    }
  }

  const payload = includeTotalCount
    ? {
        records: resultsWithoutEmbeddings,
        total_count: totalCount ?? resultsWithoutEmbeddings.length,
      }
    : resultsWithoutEmbeddings;

  logDebug("Success:retrieve_records", req, {
    count: resultsWithoutEmbeddings.length,
    total_count: includeTotalCount
      ? totalCount ?? resultsWithoutEmbeddings.length
      : undefined,
    search_mode,
    has_search: !!search,
  });
  return res.json(payload);
});


// Historical API endpoints for event-sourcing (FU-050)
app.get("/api/records/:id/history", async (req, res) => {
  const { id } = req.params;

  try {
    const events = await getEventsByRecordId(id);

    // Format events for response (exclude internal fields if needed)
    const formattedEvents = events.map((event) => ({
      id: event.id,
      event_type: event.event_type,
      payload: event.payload,
      timestamp: event.timestamp,
      record_id: event.record_id,
      reducer_version: event.reducer_version,
      created_at: event.created_at,
    }));

    return res.json({ events: formattedEvents });
  } catch (error) {
    logError("HistoricalAPIError:history", req, error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to retrieve event history";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/records/:id", async (req, res) => {
  const { id } = req.params;
  const { at } = req.query;

  // If "at" query parameter is provided, use historical replay
  if (at && typeof at === "string") {
    try {
      const record = await getRecordAtTimestamp(id, at);

      if (!record) {
        return res
          .status(404)
          .json({ error: "Record not found at specified timestamp" });
      }

      return res.json(record);
    } catch (error) {
      logError("HistoricalAPIError:at_timestamp", req, error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to retrieve record at timestamp";

      if (message.includes("Invalid timestamp")) {
        return res.status(400).json({ error: message });
      }

      return res.status(500).json({ error: message });
    }
  }

  // Otherwise, return current state from records table
  const { data, error } = await supabase
    .from("records")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    logError("SupabaseError:get_record", req, error);
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: "Record not found" });
  }

  return res.json(data);
});

// MCP Actions for Observation Architecture (FU-061)

// Get entity snapshot with provenance
app.post("/get_entity_snapshot", async (req, res) => {
  const schema = z.object({ entity_id: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_entity_snapshot", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id } = parsed.data;

  const { data, error } = await supabase
    .from("entity_snapshots")
    .select("*")
    .eq("entity_id", entity_id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "Entity not found" });
    }
    logError("SupabaseError:get_entity_snapshot", req, error);
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:get_entity_snapshot", req, { entity_id });
  return res.json(data);
});

// List observations for entity
app.post("/list_observations", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:list_observations", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id, limit = 100, offset = 0 } = parsed.data;

  const query = supabase
    .from("observations")
    .select("*")
    .eq("entity_id", entity_id)
    .order("observed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    logError("SupabaseError:list_observations", req, error);
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:list_observations", req, {
    entity_id,
    count: data?.length || 0,
  });
  return res.json({ observations: data || [] });
});

// Get field provenance (trace field to source documents)
app.post("/get_field_provenance", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    field: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:get_field_provenance", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id, field } = parsed.data;

  // Get snapshot to find observation ID for this field
  const { data: snapshot } = await supabase
    .from("entity_snapshots")
    .select("provenance")
    .eq("entity_id", entity_id)
    .single();

  if (!snapshot || !snapshot.provenance) {
    return res.status(404).json({ error: "Entity or field not found" });
  }

  const provenance = snapshot.provenance as Record<string, string>;
  const observationId = provenance[field];

  if (!observationId) {
    return res.status(404).json({ error: "Field not found in provenance" });
  }

  // Get observation(s) - may be comma-separated for merge_array
  const observationIds = observationId.split(",");

  const { data: observations, error: obsError } = await supabase
    .from("observations")
    .select("*, source_record_id")
    .in("id", observationIds);

  if (obsError) {
    logError("SupabaseError:get_field_provenance", req, obsError);
    return res.status(500).json({ error: obsError.message });
  }

  // Get source records
  const recordIds =
    observations?.map((obs) => obs.source_record_id).filter(Boolean) || [];

  const { data: records, error: recordError } = await supabase
    .from("records")
    .select("id, type, properties, file_urls, created_at")
    .in("id", recordIds);

  if (recordError) {
    logError("SupabaseError:get_field_provenance:records", req, recordError);
  }

  logDebug("Success:get_field_provenance", req, { entity_id, field });
  return res.json({
    field,
    entity_id,
    observation_ids: observationIds,
    observations: observations || [],
    source_records: records || [],
  });
});

// Create relationship
app.post("/create_relationship", async (req, res) => {
  const schema = z.object({
    relationship_type: z.enum([
      "PART_OF",
      "CORRECTS",
      "REFERS_TO",
      "SETTLES",
      "DUPLICATE_OF",
      "DEPENDS_ON",
      "SUPERSEDES",
    ]),
    source_entity_id: z.string(),
    target_entity_id: z.string(),
    source_record_id: z.string().uuid().optional(),
    metadata: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:create_relationship", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const {
    relationship_type,
    source_entity_id,
    target_entity_id,
    source_record_id,
    metadata,
  } = parsed.data;

  const userId = "00000000-0000-0000-0000-000000000000"; // v0.1.0 single-user

  const { relationshipsService } = await import("./services/relationships.js");

  try {
    const relationship = await relationshipsService.createRelationship({
      relationship_type,
      source_entity_id,
      target_entity_id,
      source_record_id: source_record_id || null,
      metadata: metadata || {},
      user_id: userId,
    });

    logDebug("Success:create_relationship", req, { relationship_key: relationship.relationship_key });
    return res.json(relationship);
  } catch (error) {
    logError("RelationshipCreationError:create_relationship", req, error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to create relationship",
    });
  }
});

// List relationships
app.post("/list_relationships", async (req, res) => {
  const schema = z.object({
    entity_id: z.string(),
    direction: z.enum(["outgoing", "incoming", "both"]).optional(),
    relationship_type: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:list_relationships", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { entity_id, direction = "both", relationship_type } = parsed.data;

  const { relationshipsService } = await import("./services/relationships.js");

  try {
    let relationships;
    if (relationship_type) {
      relationships = await relationshipsService.getRelationshipsByType(
        relationship_type as any
      );
      // Filter by entity_id
      relationships = relationships.filter(
        (rel) =>
          rel.source_entity_id === entity_id ||
          rel.target_entity_id === entity_id
      );
    } else {
      relationships = await relationshipsService.getRelationshipsForEntity(
        entity_id,
        direction
      );
    }

    logDebug("Success:list_relationships", req, {
      entity_id,
      count: relationships.length,
    });
    return res.json({ relationships });
  } catch (error) {
    logError("RelationshipQueryError:list_relationships", req, error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to query relationships",
    });
  }
});


type NormalizedCsvRowResult = ReturnType<typeof normalizeRow>;

interface PreparedCsvRow {
  normalized: NormalizedCsvRowResult;
  rowIndex: number;
}

async function persistCsvRowRecords(
  rows: PreparedCsvRow[],
  parentRecordId: string,
  filePath: string
): Promise<Array<{ id: string; row_index: number }>> {
  if (!rows.length) {
    return [];
  }

  const preparedEntries = rows.map(({ normalized, rowIndex }) => {
    const canonicalType = normalizeRecordType(normalized.type).type;
    const rowId = randomUUID();
    const baseProperties = (normalized.properties ?? {}) as Record<
      string,
      unknown
    >;
    const properties = {
      ...baseProperties,
      csv_origin: {
        parent_record_id: parentRecordId,
        row_index: rowIndex,
        file_url: filePath,
      },
    };
    return {
      payload: {
        id: rowId,
        type: canonicalType,
        properties,
        file_urls: [filePath],
      },
      rowIndex,
    };
  });

  const created: Array<{ id: string; row_index: number }> = [];
  for (let i = 0; i < preparedEntries.length; i += 25) {
    const chunk = preparedEntries.slice(i, i + 25);
    const insertPayload = chunk.map((entry) => entry.payload);
    const { error } = await supabase.from("records").insert(insertPayload);
    if (error) {
      throw error;
    }
    chunk.forEach((entry) => {
      created.push({
        id: entry.payload.id as string,
        row_index: entry.rowIndex,
      });
    });
  }

  return created;
}

// File endpoints
const upload = multer({ dest: "/tmp" });
app.post("/upload_file", upload.single("file"), async (req, res) => {
  const schema = z.object({
    record_id: z.string().uuid().optional(),
    bucket: z.string().optional(),
    properties: z.union([z.string(), z.record(z.unknown())]).optional(),
    csv_row_records: z.coerce.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:upload_file", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { record_id, bucket, properties } = parsed.data;
  const csvRowsPreference = parsed.data.csv_row_records ?? true;

  let overrideProperties: Record<string, unknown> | undefined;
  if (typeof properties === "string") {
    if (properties.trim().length === 0) {
      logWarn("ValidationError:upload_file:properties_empty", req);
      return res
        .status(400)
        .json({ error: "properties must be valid JSON object when provided" });
    }
    try {
      const parsedProperties = JSON.parse(properties);
      if (
        !parsedProperties ||
        typeof parsedProperties !== "object" ||
        Array.isArray(parsedProperties)
      ) {
        logWarn("ValidationError:upload_file:properties_shape", req, {
          properties: parsedProperties,
        });
        return res
          .status(400)
          .json({ error: "properties must be a JSON object" });
      }
      overrideProperties = parsedProperties as Record<string, unknown>;
    } catch (error) {
      logWarn("ValidationError:upload_file:properties_parse", req, {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(400).json({ error: "properties must be valid JSON" });
    }
  } else if (
    properties &&
    typeof properties === "object" &&
    !Array.isArray(properties)
  ) {
    overrideProperties = properties as Record<string, unknown>;
  }

  let existingFileUrls: string[] = [];

  const bucketName = bucket || "files";
  const tmpPath = req.file?.path;
  if (!tmpPath) {
    logWarn("ValidationError:upload_file:missing_file", req);
    return res.status(400).json({ error: "Missing file" });
  }

  const fileBuffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  const originalName = req.file?.originalname || "upload.bin";
  const mimeType = req.file?.mimetype || "application/octet-stream";
  const fileSize = req.file?.size ?? fileBuffer.length;

  const recordId = record_id ?? randomUUID();

  const isCsvFileUpload = isCsvLike(originalName, mimeType);
  const shouldGenerateCsvRows = isCsvFileUpload && csvRowsPreference;
  let preparedCsvRows: PreparedCsvRow[] = [];
  let csvRowsMeta: { truncated: boolean } | null = null;
  const csvRowWarnings: string[] = [];

  if (shouldGenerateCsvRows) {
    try {
      const parsedCsv = parseCsvRows(fileBuffer);
      if (parsedCsv.rows.length === 0) {
        logWarn("UploadFile:csv_rows_empty", req, { file: originalName });
      } else {
        const { data: typeRows, error: typeFetchError } = await supabase
          .from("records")
          .select("type")
          .limit(1000);
        if (typeFetchError) {
          logError("SupabaseError:upload_file:csv_types", req, typeFetchError);
        } else {
          const existingTypes = Array.from(
            new Set(
              ((typeRows || []) as Array<{ type: string | null }>)
                .map((row) => row.type)
                .filter(Boolean)
            )
          ) as string[];
          csvRowsMeta = { truncated: parsedCsv.truncated };
          preparedCsvRows = parsedCsv.rows.map((row, index) => {
            const normalized = normalizeRow(row, existingTypes);
            if (csvRowWarnings.length < 10 && normalized.warnings.length > 0) {
              const remainingSlots = 10 - csvRowWarnings.length;
              normalized.warnings
                .slice(0, remainingSlots)
                .forEach((warning) => {
                  csvRowWarnings.push(`Row ${index + 1}: ${warning}`);
                });
            }
            return { normalized, rowIndex: index };
          });
        }
      }
    } catch (error) {
      logError("UploadFile:csv_parse_failed", req, error, {
        file: originalName,
      });
    }
  }

  if (csvRowWarnings.length) {
    logWarn("UploadFile:csv_row_warnings", req, { warnings: csvRowWarnings });
  }

  const safeBase =
    path
      .basename(originalName)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 100) || "file";
  const ext = path.extname(safeBase) || ".bin";
  const baseName = safeBase.endsWith(ext)
    ? safeBase.slice(0, safeBase.length - ext.length)
    : safeBase;
  const fileName = `${recordId}/${Date.now()}-${baseName.replace(
    /\.+/g,
    "-"
  )}${ext}`;

  if (record_id) {
    const { data: recordData, error: fetchError } = await supabase
      .from("records")
      .select("file_urls")
      .eq("id", record_id)
      .single();
    if (fetchError || !recordData) {
      logWarn("NotFound:upload_file", req, { record_id, fetchError });
      return res.status(404).json({ error: "Record not found" });
    }
    existingFileUrls = Array.isArray(recordData.file_urls)
      ? (recordData.file_urls as string[])
      : [];
  }

  // Allow tests to skip storage upload (bucket might not exist)
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  let uploadData: { path: string } | null = null;
  
  if (!isTestEnv) {
    const { data, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, { upsert: false });

    if (uploadError) {
      logError("SupabaseStorageError:upload_file", req, uploadError, {
        bucket: bucketName,
        fileName,
      });
      return res.status(500).json({ error: uploadError.message });
    }
    uploadData = data;
  } else {
    // In test environment, create a mock file path
    // fileName already includes recordId/, so just use it directly with test/ prefix
    uploadData = { path: `test/${fileName}` };
  }

  const filePath = uploadData.path;

  if (record_id) {
    const updatedFileUrls = [...existingFileUrls, filePath];

    const { data: updated, error: updateError } = await supabase
      .from("records")
      .update({ file_urls: updatedFileUrls })
      .eq("id", record_id)
      .select()
      .single();

    if (updateError) {
      logError("SupabaseError:upload_file:update_row", req, updateError);
      return res.status(500).json({ error: updateError.message });
    }

    logDebug("Success:upload_file", req, { record_id, filePath });
    return res.json(updated);
  }

  try {
    const created = await createRecordFromUploadedFile({
      recordId,
      buffer: fileBuffer,
      fileName: originalName,
      mimeType,
      fileSize,
      fileUrl: filePath,
      overrideProperties,
    });
    let responseRecord = created;

    if (shouldGenerateCsvRows && preparedCsvRows.length > 0) {
      try {
        const insertedRows = await persistCsvRowRecords(
          preparedCsvRows,
          created.id,
          filePath
        );
        if (insertedRows.length > 0) {
          const relationshipPayload = insertedRows.map((row) => ({
            source_id: created.id,
            target_id: row.id,
            relationship: "contains_row",
            metadata: { row_index: row.row_index },
          }));
          const { error: relationshipError } = await supabase
            .from("record_relationships")
            .insert(relationshipPayload);
          if (relationshipError) {
            logError(
              "SupabaseError:upload_file:relationships",
              req,
              relationshipError
            );
          }

          const mergedProperties = {
            ...(created.properties as Record<string, unknown>),
            csv_rows: {
              linked_records: insertedRows.length,
              truncated: csvRowsMeta?.truncated ?? false,
              relationship: "contains_row",
            },
          };

          const { data: updatedDataset, error: datasetUpdateError } =
            await supabase
              .from("records")
              .update({ properties: mergedProperties })
              .eq("id", created.id)
              .select()
              .single();

          if (datasetUpdateError) {
            logError(
              "SupabaseError:upload_file:update_csv_summary",
              req,
              datasetUpdateError
            );
            responseRecord = { ...created, properties: mergedProperties };
          } else if (updatedDataset) {
            responseRecord = updatedDataset as typeof created;
          }

          logDebug("Success:upload_file:csv_rows", req, {
            parent_record_id: created.id,
            row_count: insertedRows.length,
            truncated: csvRowsMeta?.truncated ?? false,
          });
        }
      } catch (csvRowError) {
        logError("SupabaseError:upload_file:csv_rows", req, csvRowError);
      }
    }

    // Emit RecordCreated event (event-sourcing foundation - FU-050)
    try {
      await emitRecordCreated(responseRecord as any);
    } catch (eventError) {
      // Log event emission error but don't fail the request
      logError("EventEmissionError:upload_file", req, eventError);
    }

    logDebug("Success:upload_file:create", req, {
      record_id: created.id,
      filePath,
    });
    return res.status(201).json(responseRecord);
  } catch (error) {
    logError("SupabaseError:upload_file:create_record", req, error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to create record from file",
    });
  }
});

app.post("/analyze_file", upload.single("file"), async (req, res) => {
  const tmpPath = req.file?.path;
  if (!tmpPath) {
    logWarn("ValidationError:analyze_file:missing_file", req);
    return res.status(400).json({ error: "Missing file" });
  }

  const fileBuffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  const originalName = req.file?.originalname || "upload.bin";
  const mimeType = req.file?.mimetype || "application/octet-stream";
  const fileSize = req.file?.size ?? fileBuffer.length;

  try {
    const { analyzeFileForRecord } = await import(
      "./services/file_analysis.js"
    );
    const analysis = await analyzeFileForRecord({
      buffer: fileBuffer,
      fileName: originalName,
      mimeType,
      fileSize,
    });

    logDebug("Success:analyze_file", req, {
      fileName: originalName,
      type: analysis.type,
    });
    return res.json(analysis);
  } catch (error) {
    logError("Error:analyze_file", req, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to analyze file",
    });
  }
});

app.post("/record_comparison", async (req, res) => {
  const metricsSchema = z
    .object({
      amount: z.number().optional(),
      currency: z.string().max(16).optional(),
      repetitions: z.number().optional(),
      load: z.number().optional(),
      duration_minutes: z.number().optional(),
      date: z.string().optional(),
      recipient: z.string().optional(),
      merchant: z.string().optional(),
      category: z.string().optional(),
      location: z.string().optional(),
      label: z.string().optional(),
    })
    .strict()
    .partial();

  const recordSchema = z.object({
    id: z.string(),
    type: z.string(),
    summary: z.string().nullable().optional(),
    properties: z.record(z.unknown()).optional(),
    metrics: metricsSchema.optional(),
  });

  const schema = z.object({
    new_record: recordSchema,
    similar_records: z.array(recordSchema).min(1).max(10),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:record_comparison", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!config.openaiApiKey) {
    logWarn("RecordComparison:openai_unconfigured", req);
    return res
      .status(503)
      .json({ error: "OpenAI API key is not configured on the server" });
  }

  try {
    const analysis = await generateRecordComparisonInsight(parsed.data);
    return res.json({ analysis });
  } catch (error) {
    logError("RecordComparison:failure", req, error);
    return res
      .status(500)
      .json({ error: "Failed to generate record comparison" });
  }
});

app.post("/generate_embedding", async (req, res) => {
  const schema = z.object({
    type: z.string(),
    properties: z.record(z.unknown()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    logWarn("ValidationError:generate_embedding", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!config.openaiApiKey) {
    logWarn("GenerateEmbedding:openai_unconfigured", req);
    return res
      .status(503)
      .json({ error: "OpenAI API key is not configured on the server" });
  }

  try {
    const { type, properties } = parsed.data;
    const normalizedType = normalizeRecordType(type).type;
    const recordText = getRecordText(normalizedType, properties);
    const embedding = await generateEmbedding(recordText);

    if (!embedding) {
      return res.status(500).json({ error: "Failed to generate embedding" });
    }

    logDebug("Success:generate_embedding", req, { type: normalizedType });
    return res.json({ embedding });
  } catch (error) {
    logError("GenerateEmbedding:failure", req, error);
    return res.status(500).json({ error: "Failed to generate embedding" });
  }
});

app.get("/get_file_url", async (req, res) => {
  const schema = z.object({
    file_path: z.string(),
    expires_in: z.coerce.number().optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    logWarn("ValidationError:get_file_url", req, {
      issues: parsed.error.issues,
    });
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { file_path, expires_in } = parsed.data;

  const parts = file_path.split("/");
  const bucket = parts[0];
  const path = parts.slice(1).join("/");

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expires_in || 3600);
  if (error) {
    logError("SupabaseStorageError:get_file_url", req, error, { bucket, path });
    return res.status(500).json({ error: error.message });
  }

  logDebug("Success:get_file_url", req, { path: file_path });
  return res.json({ url: data.signedUrl });
});

async function fetchRecordsByIds(ids: string[], type?: string): Promise<any[]> {
  if (!ids.length) {
    return [];
  }
  let query = supabase.from("records").select("*").in("id", ids);
  if (type) {
    query = query.eq("type", type);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  const orderMap = new Map(ids.map((id, index) => [id, index]));
  return (data ?? []).sort((a, b) => {
    const aIndex = orderMap.get(a.id) ?? 0;
    const bIndex = orderMap.get(b.id) ?? 0;
    return aIndex - bIndex;
  });
}

// Helper function to execute retrieve_records logic (reusable for chat endpoint)
async function executeRetrieveRecords(params: {
  type?: string;
  properties?: Record<string, unknown>;
  limit?: number;
  search?: string[];
  search_mode?: "semantic" | "keyword" | "both";
  similarity_threshold?: number;
  query_embedding?: number[];
  ids?: string[];
  include_total_count?: boolean;
}): Promise<{ records: any[]; totalCount?: number }> {
  const {
    type,
    properties,
    limit,
    search,
    search_mode = "both",
    similarity_threshold = 0.3,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = params;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };

  const finalLimit = limit ?? 100;
  const includeTotalCount = include_total_count === true;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  const hasSearch = Array.isArray(search) && search.length > 0;
  let totalCount: number | null = null;

  if (hasIdFilter) {
    const idMatches = await fetchRecordsByIds(ids, normalizedType);
    appendResults(idMatches);
    if (includeTotalCount) {
      totalCount = ids.length;
    }
  }

  // Semantic search (vector similarity)
  if (hasSearch && (search_mode === "semantic" || search_mode === "both")) {
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
    }

    if (query_embedding && query_embedding.length === 1536) {
      let embeddingQuery = supabase
        .from("records")
        .select("*")
        .not("embedding", "is", null);

      if (normalizedType) {
        embeddingQuery = embeddingQuery.eq("type", normalizedType);
      }

      const { data: candidates, error: fetchError } =
        await embeddingQuery.limit(finalLimit * 10);

      if (!fetchError && candidates) {
        const queryNorm = Math.sqrt(
          query_embedding.reduce((sum, val) => sum + val * val, 0)
        );

        const scoredCandidates = candidates
          .map((rec: any) => {
            let recEmbedding = rec.embedding;

            if (!recEmbedding) return null;

            if (typeof recEmbedding === "string") {
              try {
                recEmbedding = JSON.parse(recEmbedding);
              } catch {
                return null;
              }
            }

            if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
              return null;
            }

            const dotProduct = query_embedding.reduce(
              (sum, val, i) => sum + val * recEmbedding[i],
              0
            );
            const recNorm = Math.sqrt(
              recEmbedding.reduce(
                (sum: number, val: number) => sum + val * val,
                0
              )
            );
            const similarity = dotProduct / (queryNorm * recNorm);

            return { ...rec, similarity };
          })
          .filter((rec: any) => rec !== null)
          .sort((a: any, b: any) => b.similarity - a.similarity);

        const semanticMatches = scoredCandidates
          .filter((rec: any) => rec.similarity >= similarity_threshold)
          .slice(0, finalLimit);
        appendResults(semanticMatches);
      }
    }
  }

  // Keyword search
  if (hasSearch && (search_mode === "keyword" || search_mode === "both")) {
    let keywordQuery = supabase.from("records").select("*");

    if (normalizedType) {
      keywordQuery = keywordQuery.eq("type", normalizedType);
    }

    const { data: keywordCandidates, error: keywordError } =
      await keywordQuery.limit(finalLimit * 2);

    if (!keywordError && keywordCandidates) {
      const searchText = search.join(" ").toLowerCase();
      const keywordMatches = keywordCandidates
        .filter((rec: any) => {
          const typeMatch = rec.type?.toLowerCase().includes(searchText);
          const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
          const propsMatch = propsText.includes(searchText);
          return typeMatch || propsMatch;
        })
        .slice(0, finalLimit);
      appendResults(keywordMatches);
    }
  }

  // No search mode
  if (!hasSearch && !hasIdFilter) {
    let query = supabase.from("records").select("*");
    if (normalizedType) query = query.eq("type", normalizedType);
    // Use deterministic ordering: created_at DESC, then id ASC for tiebreaker
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(finalLimit);

    const { data, error } = await query;
    if (!error && data) {
      appendResults(data);
    }
  }

  // Filter by exact property matches
  let results = Array.from(resultMap.values());
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic sorting if no search was performed
  if (!hasSearch) {
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response
  const sanitized = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  if (includeTotalCount && totalCount === null && !hasSearch && !properties) {
    try {
      let countQuery = supabase
        .from("records")
        .select("id", { count: "exact", head: true });
      if (normalizedType) {
        countQuery = countQuery.eq("type", normalizedType);
      }
      const { count } = await countQuery;
      if (typeof count === "number") {
        totalCount = count;
      }
    } catch {
      totalCount = null;
    }
  }

  return {
    records: sanitized,
    totalCount: includeTotalCount ? totalCount ?? sanitized.length : undefined,
  };
}

// Local-only version of executeRetrieveRecords that works with in-memory records
async function executeRetrieveRecordsLocal(
  localRecords: any[],
  params: {
    type?: string;
    properties?: Record<string, unknown>;
    limit?: number;
    search?: string[];
    search_mode?: "semantic" | "keyword" | "both";
    similarity_threshold?: number;
    query_embedding?: number[];
    ids?: string[];
    include_total_count?: boolean;
  }
): Promise<{ records: any[]; totalCount?: number }> {
  const {
    type,
    properties,
    limit,
    search,
    search_mode = "both",
    similarity_threshold = 0.3,
    query_embedding: providedQueryEmbedding,
    ids,
    include_total_count,
  } = params;

  const resultMap = new Map<string, any>();
  const appendResults = (records: any[]) => {
    for (const record of records) {
      const id = record?.id;
      if (!id || resultMap.has(id)) continue;
      resultMap.set(id, record);
    }
  };

  const finalLimit = limit ?? 100;
  const includeTotalCount = include_total_count === true;
  const normalizedType = type ? normalizeRecordType(type).type : undefined;
  const hasIdFilter = Array.isArray(ids) && ids.length > 0;
  const hasSearch = Array.isArray(search) && search.length > 0;
  let totalCount: number | null = null;

  // Start with all local records
  let candidates = [...localRecords];

  // Filter by type if specified
  if (normalizedType) {
    candidates = candidates.filter((rec: any) => rec.type === normalizedType);
  }

  // Filter by IDs if specified
  if (hasIdFilter) {
    const idMatches = candidates.filter((rec: any) => ids.includes(rec.id));
    appendResults(idMatches);
    if (includeTotalCount) {
      totalCount = idMatches.length;
    }
  }

  // Semantic search (vector similarity)
  if (hasSearch && (search_mode === "semantic" || search_mode === "both")) {
    let query_embedding: number[] | undefined = providedQueryEmbedding;
    if (!query_embedding && config.openaiApiKey) {
      const searchText = search.join(" ");
      const generated = await generateEmbedding(searchText);
      query_embedding = generated || undefined;
    }

    if (
      query_embedding &&
      Array.isArray(query_embedding) &&
      query_embedding.length === 1536
    ) {
      const recordsWithEmbeddings = candidates.filter((rec: any) => {
        if (!rec.embedding) return false;
        let recEmbedding = rec.embedding;
        if (typeof recEmbedding === "string") {
          try {
            recEmbedding = JSON.parse(recEmbedding);
          } catch {
            return false;
          }
        }
        return Array.isArray(recEmbedding) && recEmbedding.length === 1536;
      });

      const queryNorm = Math.sqrt(
        query_embedding.reduce((sum, val) => sum + val * val, 0)
      );

      const scoredCandidates = recordsWithEmbeddings
        .map((rec: any) => {
          let recEmbedding = rec.embedding;
          if (typeof recEmbedding === "string") {
            try {
              recEmbedding = JSON.parse(recEmbedding);
            } catch {
              return null;
            }
          }

          if (!Array.isArray(recEmbedding) || recEmbedding.length !== 1536) {
            return null;
          }

          const dotProduct = query_embedding.reduce(
            (sum, val, i) => sum + val * recEmbedding[i],
            0
          );
          const recNorm = Math.sqrt(
            recEmbedding.reduce(
              (sum: number, val: number) => sum + val * val,
              0
            )
          );
          const similarity = dotProduct / (queryNorm * recNorm);

          return { ...rec, similarity };
        })
        .filter((rec: any) => rec !== null)
        .sort((a: any, b: any) => b.similarity - a.similarity);

      const semanticMatches = scoredCandidates
        .filter((rec: any) => rec.similarity >= similarity_threshold)
        .slice(0, finalLimit);
      appendResults(semanticMatches);
    }
  }

  // Keyword search
  if (hasSearch && (search_mode === "keyword" || search_mode === "both")) {
    const searchText = search.join(" ").toLowerCase();
    const keywordMatches = candidates
      .filter((rec: any) => {
        const typeMatch = rec.type?.toLowerCase().includes(searchText);
        const summaryMatch = rec.summary?.toLowerCase().includes(searchText);
        const propsText = JSON.stringify(rec.properties || {}).toLowerCase();
        const propsMatch = propsText.includes(searchText);
        return typeMatch || summaryMatch || propsMatch;
      })
      .slice(0, finalLimit);
    appendResults(keywordMatches);
  }

  // No search mode - just return records
  if (!hasSearch && !hasIdFilter) {
    const sorted = candidates
      .sort((a: any, b: any) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, finalLimit);
    appendResults(sorted);
  }

  // Filter by exact property matches
  let results = Array.from(resultMap.values());
  if (properties) {
    results = results.filter((rec: any) => {
      return Object.entries(properties).every(([key, value]) => {
        const recValue = (rec.properties as Record<string, unknown>)?.[key];
        return recValue === value;
      });
    });
  }

  // Apply deterministic sorting if no search was performed
  if (!hasSearch) {
    results = sortRecordsDeterministically(results);
  }

  results = results.slice(0, finalLimit);

  // Remove embeddings from response
  const sanitized = results.map((rec: any) => {
    const { embedding, ...rest } = rec;
    void embedding;
    return rest;
  });

  // Calculate total count if requested
  if (includeTotalCount && totalCount === null && !hasSearch && !properties) {
    totalCount = normalizedType
      ? candidates.filter((rec: any) => rec.type === normalizedType).length
      : candidates.length;
  }

  return {
    records: sanitized,
    totalCount: includeTotalCount ? totalCount ?? sanitized.length : undefined,
  };
}

function extractUUIDs(text: string): string[] {
  const uuidRegex =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const matches = text.match(uuidRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

// Chat endpoint removed - violates Application Layer constraint "MUST NOT contain conversational logic"
// Conversational interactions should be externalized to MCP-compatible agents per architecture

app.get("/openapi.yaml", (req, res) => {
  const openApiPath = path.join(process.cwd(), "openapi.yaml");
  const openApiContent = fs.readFileSync(openApiPath, "utf-8");
  res.setHeader("Content-Type", "application/yaml");
  res.send(openApiContent);
});

// Documentation routes (FU-301) - must be before SPA fallback
// setupDocumentationRoutes(app); // TODO: Re-enable after implementing routes/documentation.ts

// SPA fallback - serve index.html for non-API routes (must be after all API routes)

// Export function to start HTTP server (called explicitly, not on import)
export async function startHTTPServer() {
  // Initialize encryption service
  await initServerKeys();
  
  const httpPort = process.env.HTTP_PORT
    ? parseInt(process.env.HTTP_PORT, 10)
    : config.port || 3000;
  
  app.listen(httpPort, () => {
    // eslint-disable-next-line no-console
    console.log(`HTTP Actions listening on :${httpPort}`);
  });
}

// Only auto-start if not disabled AND if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART !== "1" && isMainModule) {
  startHTTPServer().catch((err) => {
    console.error("Failed to start HTTP server:", err);
    process.exit(1);
  });
}

/**
 * Check if a record matches keyword search terms
 */
export function recordMatchesKeywordSearch(
  record: import('./db.js').NeotomaRecord,
  searchTerms: string[]
): boolean {
  const recordText = JSON.stringify(record.properties || {}).toLowerCase();
  const recordType = record.type.toLowerCase();
  
  return searchTerms.some(term => {
    const termLower = term.toLowerCase();
    return recordText.includes(termLower) || recordType.includes(termLower);
  });
}
