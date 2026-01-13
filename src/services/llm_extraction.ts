/**
 * LLM-Based Extraction Service
 * 
 * Uses OpenAI to extract structured data from unstructured documents.
 * Implements idempotence pattern: validate → retry → canonicalize → fixed-point guarantee.
 * 
 * Per idempotence directive:
 * - LLM is stochastic (not deterministic)
 * - System enforces idempotence through validation, retry, and canonicalization
 */

import OpenAI from "openai";
import { config } from "../config.js";
import type { SchemaDefinition } from "./schema_registry.js";

const openai = config.openaiApiKey
  ? new OpenAI({ apiKey: config.openaiApiKey })
  : null;

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

  const systemPrompt = [
    "You are a document analysis expert that extracts structured data from documents.",
    "Analyze the provided document and:",
    "1. Identify the document type (invoice, receipt, contract, note, etc.)",
    "2. Extract all relevant fields as structured data",
    "3. Support multiple languages (English, Spanish, French, German, etc.)",
    "",
    "Return a JSON object with:",
    "- entity_type: The document type (invoice, receipt, transaction, contract, note, etc.)",
    "- fields: Object containing all extracted fields",
    "",
    "Available entity types:",
    "- invoice: Invoices with vendor, customer, amounts, dates",
    "- receipt: Purchase receipts with merchant, amount, date",
    "- transaction: Bank transactions with merchant, amount, date",
    "- contract: Contracts with parties, dates, terms",
    "- note: General notes or documents",
    "- contact: Person/company contact information",
    "- task: Tasks with status, due date, priority",
    "- event: Calendar events with date, location, attendees",
    "- message: Emails or messages with sender, recipient, subject",
    "- property: Real estate or vehicle with address/identification, value",
    "",
    "For invoices, extract:",
    "- invoice_number: Invoice/factura/facture number",
    "- invoice_date: Invoice date",
    "- due_date: Payment due date (if present)",
    "- vendor_name: Seller/vendor name",
    "- customer_name: Buyer/customer name",
    "- amount_due or total_amount: Total amount",
    "- currency: Currency code (EUR, USD, GBP, etc.)",
    "- tax_amount: VAT/IVA/tax amount",
    "- tax_rate: Tax percentage",
    "- subtotal: Amount before tax",
    "- items: Line items (if present)",
    "",
    "For receipts, extract:",
    "- merchant_name: Store/merchant name",
    "- amount_total: Total amount",
    "- date_purchased: Purchase date",
    "- payment_method: Payment method",
    "- items: Purchased items",
    "",
    "For contracts, extract:",
    "- contract_number: Contract identifier",
    "- name: Contract title/name",
    "- parties: Contracting parties",
    "- effective_date: Start date",
    "- expiration_date: End date",
    "- type: Contract type",
    "",
    "For property (vehicles, real estate), extract:",
    "- name: Property/vehicle name",
    "- type: Property type (vehicle, real_estate, etc.)",
    "- address or identification: Address for real estate, VIN for vehicles",
    "- purchase_date: Purchase date",
    "- purchase_price: Purchase price",
    "- current_value: Current value",
    "- description: Additional details",
    "",
    "Return ONLY valid JSON. No markdown, no code blocks, no explanations.",
  ].join("\n");

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
      max_tokens: 2000,
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

    const parsed = JSON.parse(content);
    
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
 * Check if LLM extraction is available (OpenAI configured)
 */
export function isLLMExtractionAvailable(): boolean {
  return openai !== null;
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
        max_tokens: 2000,
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

/**
 * Build system prompt (extracted for reuse)
 */
function buildSystemPrompt(): string {
  return [
    "You are a document analysis expert that extracts structured data from documents.",
    "Analyze the provided document and:",
    "1. Identify the document type (invoice, receipt, contract, note, etc.)",
    "2. Extract all relevant fields as structured data",
    "3. Support multiple languages (English, Spanish, French, German, etc.)",
    "",
    "Return a JSON object with:",
    "- entity_type: The document type (invoice, receipt, transaction, contract, note, etc.)",
    "- fields: Object containing all extracted fields",
    "",
    "Available entity types:",
    "- invoice: Invoices with vendor, customer, amounts, dates",
    "- receipt: Purchase receipts with merchant, amount, date",
    "- transaction: Bank transactions with merchant, amount, date",
    "- contract: Contracts with parties, dates, terms",
    "- note: General notes or documents",
    "- contact: Person/company contact information",
    "- task: Tasks with status, due date, priority",
    "- event: Calendar events with date, location, attendees",
    "- message: Emails or messages with sender, recipient, subject",
    "- property: Real estate or vehicle with address/identification, value",
    "",
    "For invoices, extract:",
    "- invoice_number: Invoice/factura/facture number",
    "- invoice_date: Invoice date",
    "- due_date: Payment due date (if present)",
    "- vendor_name: Seller/vendor name",
    "- customer_name: Buyer/customer name",
    "- amount_due or total_amount: Total amount",
    "- currency: Currency code (EUR, USD, GBP, etc.)",
    "- tax_amount: VAT/IVA/tax amount",
    "- tax_rate: Tax percentage",
    "- subtotal: Amount before tax",
    "- items: Line items (if present)",
    "",
    "For receipts, extract:",
    "- merchant_name: Store/merchant name",
    "- amount_total: Total amount",
    "- date_purchased: Purchase date",
    "- payment_method: Payment method",
    "- items: Purchased items",
    "",
    "For contracts, extract:",
    "- contract_number: Contract identifier",
    "- name: Contract title/name",
    "- parties: Contracting parties",
    "- effective_date: Start date",
    "- expiration_date: End date",
    "- type: Contract type",
    "",
    "For property (vehicles, real estate), extract:",
    "- name: Property/vehicle name",
    "- type: Property type (vehicle, real_estate, etc.)",
    "- address or identification: Address for real estate, VIN for vehicles",
    "- purchase_date: Purchase date",
    "- purchase_price: Purchase price",
    "- current_value: Current value",
    "- description: Additional details",
    "",
    "Return ONLY valid JSON. No markdown, no code blocks, no explanations.",
  ].join("\n");
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
