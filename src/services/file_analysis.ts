import { randomUUID } from "node:crypto";
import { supabase, type NeotomaRecord } from "../db.js";
import { config } from "../config.js";
import { generateEmbedding, getRecordText } from "../embeddings.js";
import { normalizeRecordType } from "../config/record_types.js";
import { sanitizeRecordProperties } from "../utils/property_sanitizer.js";
import {
  detectSchemaType,
  extractFields,
  generateSummary,
} from "./extraction/rules.js";
import {
  extractWithLLM,
  extractWithLLMWithRetry,
  isLLMExtractionAvailable,
} from "./llm_extraction.js";

const MAX_PREVIEW_CHARS = 8000;
const PDF_SIGNATURE = Buffer.from("%PDF-");

export interface FileAnalysisResult {
  type: string;
  properties: Record<string, unknown>;
  summary?: string;
  attempts?: number; // Number of LLM extraction attempts (if using retry)
}

interface AnalyzeFileOptions {
  buffer: Buffer;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  modelId?: string; // Optional: Override default model for LLM extraction
  useRetry?: boolean; // Optional: Enable retry loop with schema validation (default: true)
}

interface CreateRecordFromFileOptions extends AnalyzeFileOptions {
  recordId?: string;
  fileUrl: string;
  overrideProperties?: Record<string, unknown>;
}

export function extractPreview(buffer: Buffer): string {
  if (buffer.length === 0) {
    return "";
  }
  const text = buffer.toString("utf8");
  if (!text.trim()) {
    return "";
  }
  return text.slice(0, MAX_PREVIEW_CHARS);
}

function looksLikePdf(
  buffer: Buffer,
  fileName?: string,
  mimeType?: string,
): boolean {
  if (mimeType?.toLowerCase().includes("pdf")) {
    return true;
  }
  if (fileName?.toLowerCase().endsWith(".pdf")) {
    return true;
  }
  if (
    buffer.length >= PDF_SIGNATURE.length &&
    buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
  ) {
    return true;
  }
  return false;
}

type PdfParseConstructor = new (options: { data: Buffer }) => {
  getText(): Promise<{ text?: string }>;
  destroy(): Promise<void>;
};

let cachedPdfParseConstructor: PdfParseConstructor | null = null;
let pdfParseLoadFailed = false;

async function loadPdfParse(): Promise<PdfParseConstructor | null> {
  if (cachedPdfParseConstructor) {
    return cachedPdfParseConstructor;
  }
  if (pdfParseLoadFailed) {
    return null;
  }
  try {
    const module = await import("pdf-parse");
    const ctor =
      (module as { PDFParse?: PdfParseConstructor }).PDFParse ??
      (module as unknown as { default?: PdfParseConstructor }).default ??
      null;
    if (!ctor) {
      console.warn("pdf-parse module missing PDFParse export");
      pdfParseLoadFailed = true;
      return null;
    }
    cachedPdfParseConstructor = ctor;
    return cachedPdfParseConstructor;
  } catch (error) {
    console.warn("Failed to load pdf-parse; PDF previews disabled", error);
    pdfParseLoadFailed = true;
    return null;
  }
}

async function extractPdfPreview(buffer: Buffer): Promise<string | null> {
  const PdfParse = await loadPdfParse();
  if (!PdfParse) {
    return null;
  }

  const parser = new PdfParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    if (!text || !text.trim()) {
      return null;
    }
    return text.slice(0, MAX_PREVIEW_CHARS);
  } catch (error) {
    console.warn(
      "PDF preview extraction failed; falling back to binary text",
      error,
    );
    return null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

export async function buildFilePreview(
  buffer: Buffer,
  options: { fileName?: string; mimeType?: string } = {},
): Promise<string> {
  if (looksLikePdf(buffer, options.fileName, options.mimeType)) {
    const pdfText = await extractPdfPreview(buffer);
    if (pdfText) {
      return pdfText;
    }
  }
  return extractPreview(buffer);
}

function fallbackTypeFromName(fileName?: string, mimeType?: string): string {
  if (!fileName && !mimeType) return "file";
  const lowerName = (fileName || "").toLowerCase();
  const lowerMime = (mimeType || "").toLowerCase();

  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf"))
    return "document";
  if (lowerMime.includes("csv") || lowerName.endsWith(".csv")) return "dataset";
  if (lowerMime.includes("json") || lowerName.endsWith(".json")) return "json";
  if (
    lowerMime.includes("image") ||
    /\.(png|jpg|jpeg|gif|webp)$/.test(lowerName)
  )
    return "image";
  if (lowerMime.includes("text") || lowerName.endsWith(".txt")) return "note";
  return "file";
}

function normalizeOverride(override: Record<string, unknown> | undefined): {
  type?: string;
  properties: Record<string, unknown>;
} {
  if (!override) {
    return { properties: {} };
  }
  const clone: Record<string, unknown> = { ...override };
  let explicitType: string | undefined;

  const typeKeys = ["type", "record_type", "category"];
  for (const key of typeKeys) {
    if (typeof clone[key] === "string" && clone[key]) {
      explicitType = String(clone[key]);
      delete clone[key];
      break;
    }
  }

  let properties: Record<string, unknown> = {};
  if (
    clone.properties &&
    typeof clone.properties === "object" &&
    clone.properties !== null &&
    !Array.isArray(clone.properties)
  ) {
    properties = { ...(clone.properties as Record<string, unknown>) };
    delete clone.properties;
  }

  properties = { ...properties, ...clone };
  return { type: explicitType, properties };
}

function mergeMetadata(
  properties: Record<string, unknown>,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !properties.source_file ||
    typeof properties.source_file !== "object" ||
    properties.source_file === null
  ) {
    return { ...properties, source_file: metadata };
  }

  const existing = properties.source_file as Record<string, unknown>;
  return { ...properties, source_file: { ...metadata, ...existing } };
}

/**
 * Analyze file using LLM extraction (v0.2.0 design)
 * Falls back to rule-based extraction if OpenAI is not configured
 *
 * Per v0.2.0 release plan:
 * - AI interpretation is non-deterministic but versioned and auditable
 * - Supports multiple languages (Spanish, French, German, etc.)
 * - Config logged for provenance
 */
export async function analyzeFileForRecord(
  options: AnalyzeFileOptions,
): Promise<FileAnalysisResult> {
  const { buffer, fileName, mimeType } = options;
  const preview = await buildFilePreview(buffer, { fileName, mimeType });

  // If no preview text available, fallback to filename-based type detection
  if (!preview || !preview.trim()) {
    const fallbackType = fallbackTypeFromName(fileName, mimeType);
    return {
      type: fallbackType,
      properties: {
        schema_version: "1.0",
      },
      summary: generateSummary(fallbackType, {}, fileName),
    };
  }

  // Use LLM extraction if available (with idempotence pattern)
  if (isLLMExtractionAvailable()) {
    try {
      const modelIdToUse = options.modelId || "gpt-4o";
      const useRetryLoop = options.useRetry ?? true;
      
      let result;
      
      if (useRetryLoop) {
        // First, detect entity type to get schema
        const initialResult = await extractWithLLM(preview, fileName, mimeType, modelIdToUse);
        const normalized = normalizeRecordType(initialResult.entity_type);
        const schemaType = normalized.type;
        
        // Load schema for validation
        const { schemaRegistry } = await import("./schema_registry.js");
        const { getSchemaDefinition } = await import("./schema_definitions.js");
        
        let schema = await schemaRegistry.loadActiveSchema(schemaType);
        if (!schema) {
          const codeSchema = getSchemaDefinition(schemaType);
          if (codeSchema?.schema_definition) {
            schema = {
              id: "",
              entity_type: schemaType,
              schema_version: "1.0",
              schema_definition: codeSchema.schema_definition,
              reducer_config: codeSchema.reducer_config,
              active: true,
              created_at: new Date().toISOString(),
            };
          }
        }
        
        // Use retry loop with schema validation if schema available
        if (schema) {
          result = await extractWithLLMWithRetry(
            preview, 
            schema.schema_definition, 
            fileName, 
            mimeType, 
            modelIdToUse
          );
        } else {
          // No schema - use initial result
          result = initialResult;
        }
      } else {
        // No retry - use single extraction
        result = await extractWithLLM(preview, fileName, mimeType, modelIdToUse);
      }
      
      // Normalize entity type
      const normalized = normalizeRecordType(result.entity_type);
      const schemaType = normalized.type;
      
      // Generate summary from LLM result
      const summary = generateSummary(schemaType, result.fields, fileName);
      
      return {
        type: schemaType,
        properties: result.fields,
        summary,
        attempts: result.attempts,
      };
    } catch (error) {
      console.warn(
        "LLM extraction failed, falling back to rule-based:",
        error instanceof Error ? error.message : String(error)
      );
      // Fall through to rule-based extraction
    }
  }

  // Fallback: Rule-based extraction (for development without OpenAI key)
  // Detect schema type using multi-pattern matching
  const detectedType = detectSchemaType(preview, fileName);

  // Normalize to canonical type (ensures 'document' fallback for unrecognized types)
  const normalized = normalizeRecordType(detectedType);
  const schemaType = normalized.type;

  // Extract fields using rule-based patterns
  const extractedFields = extractFields(schemaType, preview);

  // Generate deterministic summary
  const summary = generateSummary(schemaType, extractedFields, fileName);

  return {
    type: schemaType,
    properties: extractedFields,
    summary,
  };
}

export async function createRecordFromUploadedFile(
  options: CreateRecordFromFileOptions,
): Promise<NeotomaRecord> {
  const { buffer, fileName, mimeType, fileSize, fileUrl, overrideProperties } =
    options;
  const metadata = {
    name: fileName ?? "uploaded-file",
    size: fileSize ?? buffer.length,
    mime_type: mimeType ?? "application/octet-stream",
    file_url: fileUrl,
  };

  const { type: overrideType, properties: normalizedOverride } =
    normalizeOverride(overrideProperties);

  let analyzedType = overrideType;
  let analyzedProperties = normalizedOverride;
  let summary: string | undefined;

  if (!overrideProperties) {
    const analysis = await analyzeFileForRecord({
      buffer,
      fileName,
      mimeType,
      fileSize,
    });
    analyzedType = analysis.type || analyzedType;
    analyzedProperties = analysis.properties || {};
    summary = analysis.summary;
  }

  if (!analyzedType || typeof analyzedType !== "string") {
    analyzedType = fallbackTypeFromName(fileName, mimeType);
  }

  const mergedProperties = mergeMetadata(analyzedProperties, metadata);
  const finalProperties = sanitizeRecordProperties(mergedProperties);

  const insertId = options.recordId ?? randomUUID();

  let embedding: number[] | null = null;
  const canonicalType = normalizeRecordType(analyzedType).type;

  if (config.openaiApiKey) {
    try {
      embedding = await generateEmbedding(
        getRecordText(canonicalType, finalProperties),
      );
    } catch (error) {
      console.warn(
        "Embedding generation failed for uploaded file record",
        error,
      );
    }
  }

  // Generate a proper summary using generateRecordSummary (includes file analysis)
  // This ensures we get a comprehensive summary even if analyzeFileForRecord didn't return a good one
  // Note: We use the file buffer we already have instead of re-downloading from storage
  // since the file was just uploaded and might not be immediately available via storage API
  const finalSummary = summary;
  // Skip generateRecordSummary for now during file upload since we already have the file content
  // and analyzeFileForRecord should have provided a summary. We can enhance this later if needed.

  const insertPayload: Record<string, unknown> = {
    id: insertId,
    type: canonicalType,
    properties: finalProperties,
    file_urls: [fileUrl],
  };

  if (embedding && embedding.length > 0) {
    insertPayload.embedding = embedding;
  }

  // Only include summary if it's a non-empty string (column may not exist in all schemas)
  if (finalSummary && typeof finalSummary === "string" && finalSummary.trim().length > 0) {
    // Check if summary column exists by trying to insert without it first, or skip it
    // For now, skip summary to avoid schema issues
    // insertPayload.summary = finalSummary;
  }

  const { data, error } = await supabase
    .from("records")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("Failed to insert record:", {
      error: error.message,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
      payload: {
        ...insertPayload,
        embedding: insertPayload.embedding
          ? `[${(insertPayload.embedding as number[]).length} dimensions]`
          : null,
      },
    });
    throw error;
  }

  return data as NeotomaRecord;
}
