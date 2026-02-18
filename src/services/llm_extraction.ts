/**
 * LLM-Based Extraction Service
 * 
 * Uses OpenAI to extract structured data from unstructured documents.
 * Implements idempotence pattern: validate → retry → canonicalize → fixed-point guarantee.
 * 
 * Per idempotence directive:
 * - LLM is stochastic (not deterministic)
 * - System enforces idempotence through validation, retry, and canonicalization
 *
 * System prompt is loaded from docs/prompts/llm_extraction_system_prompt.md (content after ---).
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { config } from "../config.js";
import type { SchemaDefinition } from "./schema_registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const openai = config.openaiApiKey
  ? new OpenAI({ apiKey: config.openaiApiKey })
  : null;

/** Max tokens for LLM extraction response. Large documents (e.g. CSV with many rows) need more; 2000 caused "Unterminated string in JSON" when output was truncated. */
const MAX_EXTRACTION_OUTPUT_TOKENS = 8192;

export interface LLMExtractionResult {
  entity_type: string;
  fields: Record<string, unknown>;
  confidence?: number;
  attempts?: number; // Number of attempts before success
}

/**
 * Extract structured data from document text using LLM
 * Supports multiple languages and complex document structures
 * 
 * Model selection:
 * - GPT-4o (default): 98.99% accuracy, faster, better for complex documents
 * - GPT-4o-mini: 91.84% accuracy, cheaper per token but slower overall
 * 
 * For document extraction, GPT-4o is recommended for accuracy.
 */
export async function extractWithLLM(
  text: string,
  fileName?: string,
  mimeType?: string,
  modelId: string = "gpt-4o" // Default to GPT-4o for better accuracy
): Promise<LLMExtractionResult> {
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = [
    fileName ? `Filename: ${fileName}` : undefined,
    mimeType ? `MIME Type: ${mimeType}` : undefined,
    "",
    "Document content:",
    text.slice(0, 8000), // Limit to 8000 chars
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: modelId,
      temperature: 0, // Reduce variance for idempotence (optional aid)
      top_p: 1, // Consider all tokens (with temperature=0, picks most likely)
      max_tokens: MAX_EXTRACTION_OUTPUT_TOKENS,
      seed: 1, // Reproducible outputs for same input (reinterpret determinism)
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("No content returned from OpenAI");
    }

    let parsed: { entity_type?: string; fields?: Record<string, unknown>; confidence?: number };
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      const msg = parseError instanceof Error ? parseError.message : String(parseError);
      if (/unterminated|position \d+/i.test(msg)) {
        throw new Error(
          `${msg}. LLM output may have been truncated; extraction of large documents (e.g. CSV with many rows) can exceed the output token limit.`
        );
      }
      throw parseError;
    }

    // Validate response structure
    if (!parsed.entity_type || typeof parsed.entity_type !== "string") {
      throw new Error("Invalid response: missing or invalid entity_type");
    }
    
    if (!parsed.fields || typeof parsed.fields !== "object") {
      throw new Error("Invalid response: missing or invalid fields");
    }

    // Ensure schema_version is included
    if (!parsed.fields.schema_version) {
      parsed.fields.schema_version = "1.0";
    }

    return {
      entity_type: parsed.entity_type,
      fields: parsed.fields,
      confidence: parsed.confidence || 0.8,
    };
  } catch (error) {
    console.error(
      "LLM extraction failed:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Extract structured data from a document image (e.g. first page of a scanned PDF) using vision.
 * Use when extractTextFromBuffer returns empty for PDFs. Same output shape as extractWithLLM.
 */
export async function extractWithLLMFromImage(
  imageDataUrl: string,
  fileName?: string,
  mimeType?: string,
  modelId: string = "gpt-4o"
): Promise<LLMExtractionResult> {
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }
  const systemPrompt = buildSystemPrompt();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: [
        fileName ? `Filename: ${fileName}` : undefined,
        mimeType ? `MIME Type: ${mimeType}` : undefined,
        "",
        "Extract structured data from this document image. Return ONLY valid JSON with entity_type and fields.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    { type: "image_url", image_url: { url: imageDataUrl } },
  ];
  const response = await openai.chat.completions.create({
    model: modelId,
    temperature: 0,
    max_tokens: MAX_EXTRACTION_OUTPUT_TOKENS,
    seed: 1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });
  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No content returned from OpenAI vision");
  }
  let parsed: { entity_type?: string; fields?: Record<string, unknown>; confidence?: number };
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    throw parseError instanceof Error ? parseError : new Error(String(parseError));
  }
  if (!parsed.entity_type || typeof parsed.entity_type !== "string") {
    throw new Error("Invalid response: missing or invalid entity_type");
  }
  if (!parsed.fields || typeof parsed.fields !== "object") {
    throw new Error("Invalid response: missing or invalid fields");
  }
  if (!parsed.fields.schema_version) {
    parsed.fields.schema_version = "1.0";
  }
  return {
    entity_type: parsed.entity_type,
    fields: parsed.fields,
    confidence: parsed.confidence ?? 0.8,
  };
}

/**
 * Check if LLM extraction is available (OpenAI configured)
 */
export function isLLMExtractionAvailable(): boolean {
  return openai !== null;
}

/**
 * Infer a canonical entity type from an extracted/localized type using the LLM.
 * Use when alias resolution found no match; avoids hardcoding translations.
 * Returns the canonical type from the list, or null if the model says none match.
 */
export async function inferCanonicalEntityType(
  extractedType: string,
  canonicalTypes: string[],
  modelId: string = "gpt-4o"
): Promise<string | null> {
  if (!openai || canonicalTypes.length === 0) return null;

  const list = canonicalTypes.join(", ");
  const prompt = `The document was classified as entity type "${extractedType}". Which of these canonical types does it match? The type may be in any language (e.g. German, Mandarin); match by meaning. Reply with exactly one word from this list: ${list}. If none match, reply with exactly: none`;

  const response = await openai.chat.completions.create({
    model: modelId,
    temperature: 0,
    max_tokens: 50,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices?.[0]?.message?.content?.trim()?.toLowerCase();
  if (!raw || raw === "none") return null;

  const match = canonicalTypes.find((c) => c.toLowerCase() === raw);
  return match ?? null;
}

/**
 * Extract with retry loop for idempotence
 * Validates against schema and retries on invalid outputs
 * 
 * Per idempotence directive:
 * - Validate → Reject → Retry pattern
 * - Accept only schema-valid outputs
 * - Provide error feedback on retry
 */
export async function extractWithLLMWithRetry(
  text: string,
  schema: SchemaDefinition,
  fileName?: string,
  mimeType?: string,
  modelId: string = "gpt-4o",
  maxRetries: number = 3
): Promise<LLMExtractionResult> {
  let lastError: string | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add error feedback to prompt on retry
      const systemPromptWithFeedback = lastError
        ? `${buildSystemPrompt()}\n\nPREVIOUS ATTEMPT FAILED:\n${lastError}\n\nPlease correct the issues and return valid JSON.`
        : buildSystemPrompt();
      
      const userPromptContent = [
        fileName ? `Filename: ${fileName}` : undefined,
        mimeType ? `MIME Type: ${mimeType}` : undefined,
        "",
        "Document content:",
        text.slice(0, 8000), // Limit to 8000 chars
      ]
        .filter(Boolean)
        .join("\n");
      
      const response = await openai!.chat.completions.create({
        model: modelId,
        temperature: 0, // Most deterministic
        top_p: 1, // Consider all tokens
        max_tokens: MAX_EXTRACTION_OUTPUT_TOKENS,
        seed: 1, // Reproducible outputs for same input
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPromptWithFeedback },
          { role: "user", content: userPromptContent },
        ],
      });
      
      const content = response.choices?.[0]?.message?.content?.trim();
      if (!content) {
        lastError = "No content returned from LLM";
        continue;
      }
      
      const parsed = JSON.parse(content);
      
      // Validate response structure
      if (!parsed.entity_type || typeof parsed.entity_type !== "string") {
        lastError = "Invalid response: missing or invalid entity_type";
        continue;
      }
      
      if (!parsed.fields || typeof parsed.fields !== "object") {
        lastError = "Invalid response: missing or invalid fields object";
        continue;
      }
      
      // Ensure schema_version is included
      if (!parsed.fields.schema_version) {
        parsed.fields.schema_version = "1.0";
      }
      
      // Validate against schema (check required fields)
      const validationErrors = validateFieldsAgainstSchema(parsed.fields, schema);
      if (validationErrors.length > 0) {
        lastError = `Schema validation failed:\n${validationErrors.join("\n")}`;
        continue;
      }
      
      // Success - return result with attempt count
      return {
        entity_type: parsed.entity_type,
        fields: parsed.fields,
        confidence: parsed.confidence || 0.8,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(
        `LLM extraction attempt ${attempt + 1} failed:`,
        lastError
      );
    }
  }
  
  // All retries exhausted
  throw new Error(
    `LLM extraction failed after ${maxRetries} attempts. Last error: ${lastError}`
  );
}

const PROMPT_FILENAME = "llm_extraction_system_prompt.md";

/** Path to the prompt doc: repo root is either cwd or two levels up from this file (dist/services or src/services). */
function getPromptPath(): string {
  const fromCwd = path.join(process.cwd(), "docs", "prompts", PROMPT_FILENAME);
  if (existsSync(fromCwd)) return fromCwd;
  const repoRoot = path.join(__dirname, "..", "..");
  return path.join(repoRoot, "docs", "prompts", PROMPT_FILENAME);
}

/**
 * Load system prompt from docs/prompts/llm_extraction_system_prompt.md.
 * Uses content after the first "---" as the prompt body. Throws if file missing or body empty.
 */
function loadSystemPrompt(): string {
  const promptPath = getPromptPath();
  if (!existsSync(promptPath)) {
    throw new Error(
      `LLM extraction prompt not found at ${promptPath}. Ensure docs/prompts/llm_extraction_system_prompt.md exists.`
    );
  }
  const raw = readFileSync(promptPath, "utf-8");
  const sep = "---";
  const idx = raw.indexOf(sep);
  const body = idx >= 0 ? raw.slice(idx + sep.length).trim() : raw.trim();
  if (!body) {
    throw new Error(
      `LLM extraction prompt file is empty or has no content after "---": ${promptPath}`
    );
  }
  return body;
}

/** Build system prompt: load from docs/prompts/llm_extraction_system_prompt.md. */
function buildSystemPrompt(): string {
  return loadSystemPrompt();
}

/**
 * Validate fields against schema (check required fields)
 * Returns array of validation errors
 */
function validateFieldsAgainstSchema(
  fields: Record<string, unknown>,
  schema: SchemaDefinition
): string[] {
  const errors: string[] = [];
  
  // Check required fields
  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    if (fieldDef.required && !(fieldName in fields)) {
      errors.push(`Required field missing: ${fieldName}`);
    }
  }
  
  // Check field types
  for (const [fieldName, value] of Object.entries(fields)) {
    const fieldDef = schema.fields[fieldName];
    if (!fieldDef) {
      // Unknown field - will be routed to raw_fragments later
      continue;
    }
    
    // Validate type
    const expectedType = fieldDef.type;
    const actualType = getValueType(value);
    
    if (actualType !== expectedType) {
      errors.push(`Field ${fieldName}: expected ${expectedType}, got ${actualType}`);
    }
  }
  
  return errors;
}

/**
 * Get type of value for validation
 */
function getValueType(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (value instanceof Date) {
    return "date";
  }
  if (typeof value === "string") {
    // Check if it's a date string
    if (!isNaN(Date.parse(value)) && value.match(/^\d{4}-\d{2}-\d{2}/)) {
      return "date";
    }
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "object") {
    return "object";
  }
  return "unknown";
}

/**
 * Multi-entity extraction result for CSV chunking
 */
export interface MultiEntityExtractionResult {
  entities: Array<{
    entity_type: string;
    fields: Record<string, unknown>;
    confidence?: number;
  }>;
  total_confidence: number;
}

/**
 * Extract from CSV with automatic chunking for large files
 * Processes CSV in chunks if it exceeds token limits, returns array of entities
 *
 * For large CSV files, this returns multiple entities (one per chunk's extracted data)
 * rather than attempting to merge all data into a single entity, which would exceed
 * the output token limit (8192 tokens).
 *
 * @param csvContent Full CSV content
 * @param fileName Original filename
 * @param mimeType MIME type (should be text/csv)
 * @param modelId Model to use for extraction
 * @returns Array of extraction results (one per chunk for large files, or single result for small files)
 */
export async function extractFromCSVWithChunking(
  csvContent: string,
  fileName?: string,
  mimeType?: string,
  modelId: string = "gpt-4o"
): Promise<LLMExtractionResult | MultiEntityExtractionResult> {
  const { needsChunking, chunkCSV, getRecommendedChunkSize } = await import("./csv_chunking.js");

  // Log to file for debugging
  const fs = await import("fs/promises");
  const path = await import("path");
  const fileSize = Buffer.byteLength(csvContent, "utf-8");
  const needsChunk = needsChunking(csvContent);
  const logPath = path.join(process.cwd(), "data/logs/csv-chunking.log");
  await fs.appendFile(logPath, `[CSV Check] File size: ${fileSize} bytes, Needs chunking: ${needsChunk}\n`).catch(() => {});

  // Check if chunking is needed
  if (!needsChunk) {
    // Small CSV - process normally and return single result
    return extractWithLLM(csvContent, fileName, mimeType, modelId);
  }

  // Large CSV - chunk and process in parallel
  const rowsPerChunk = getRecommendedChunkSize(fileSize);
  const chunks = chunkCSV(csvContent, rowsPerChunk);

  // Log to file for debugging (MCP stdout is used for JSON-RPC)
  const logMsg = `[CSV Chunking] File size: ${fileSize} bytes, Rows per chunk: ${rowsPerChunk}, Total chunks: ${chunks.length}\n`;
  await fs.appendFile(logPath, logMsg).catch(() => {});

  console.log(
    `CSV file too large (${fileSize} bytes), chunking into ${chunks.length} chunks of ~${rowsPerChunk} rows each`
  );

  // Process chunks in parallel
  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const chunkFileName = fileName
        ? `${fileName} (chunk ${chunk.metadata.chunkIndex + 1}/${chunk.metadata.totalChunks})`
        : undefined;

      return extractWithLLM(chunk.content, chunkFileName, mimeType, modelId);
    })
  );

  // Return array of entities (one per chunk) to avoid exceeding output token limit
  // The interpretation service will process each entity separately
  let totalConfidence = 0;
  const entities = chunkResults.map((chunkResult) => {
    totalConfidence += chunkResult.confidence || 0.8;
    return {
      entity_type: chunkResult.entity_type,
      fields: chunkResult.fields,
      confidence: chunkResult.confidence,
    };
  });

  return {
    entities,
    total_confidence: totalConfidence / chunkResults.length,
  };
}
