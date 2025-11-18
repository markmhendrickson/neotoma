import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { randomUUID } from 'node:crypto';
import { supabase, type NeotomaRecord } from '../db.js';
import { config } from '../config.js';
import { generateEmbedding, getRecordText } from '../embeddings.js';
import { normalizeRecordType } from '../config/record_types.js';

const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

const MAX_PREVIEW_CHARS = 8000;
const PDF_SIGNATURE = Buffer.from('%PDF-');

export interface FileAnalysisResult {
  type: string;
  properties: Record<string, unknown>;
  summary?: string;
}

interface AnalyzeFileOptions {
  buffer: Buffer;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

interface CreateRecordFromFileOptions extends AnalyzeFileOptions {
  recordId?: string;
  fileUrl: string;
  overrideProperties?: Record<string, unknown>;
}

export function extractPreview(buffer: Buffer): string {
  if (buffer.length === 0) {
    return '';
  }
  const text = buffer.toString('utf8');
  if (!text.trim()) {
    return '';
  }
  return text.slice(0, MAX_PREVIEW_CHARS);
}

function looksLikePdf(buffer: Buffer, fileName?: string, mimeType?: string): boolean {
  if (mimeType?.toLowerCase().includes('pdf')) {
    return true;
  }
  if (fileName?.toLowerCase().endsWith('.pdf')) {
    return true;
  }
  if (buffer.length >= PDF_SIGNATURE.length && buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
    return true;
  }
  return false;
}

async function extractPdfPreview(buffer: Buffer): Promise<string | null> {
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    if (!text || !text.trim()) {
      return null;
    }
    return text.slice(0, MAX_PREVIEW_CHARS);
  } catch (error) {
    console.warn('PDF preview extraction failed; falling back to binary text', error);
    return null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

export async function buildFilePreview(buffer: Buffer, options: { fileName?: string; mimeType?: string } = {}): Promise<string> {
  if (looksLikePdf(buffer, options.fileName, options.mimeType)) {
    const pdfText = await extractPdfPreview(buffer);
    if (pdfText) {
      return pdfText;
    }
  }
  return extractPreview(buffer);
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline !== -1) {
      const withoutFence = trimmed.slice(firstNewline + 1);
      const fenceEnd = withoutFence.lastIndexOf('```');
      if (fenceEnd !== -1) {
        return withoutFence.slice(0, fenceEnd).trim();
      }
      return withoutFence.trim();
    }
  }
  return trimmed;
}

function fallbackTypeFromName(fileName?: string, mimeType?: string): string {
  if (!fileName && !mimeType) return 'file';
  const lowerName = (fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) return 'document';
  if (lowerMime.includes('csv') || lowerName.endsWith('.csv')) return 'dataset';
  if (lowerMime.includes('json') || lowerName.endsWith('.json')) return 'json';
  if (lowerMime.includes('image') || /\.(png|jpg|jpeg|gif|webp)$/.test(lowerName)) return 'image';
  if (lowerMime.includes('text') || lowerName.endsWith('.txt')) return 'note';
  return 'file';
}

function normalizeOverride(override: Record<string, unknown> | undefined): { type?: string; properties: Record<string, unknown> } {
  if (!override) {
    return { properties: {} };
  }
  const clone: Record<string, unknown> = { ...override };
  let explicitType: string | undefined;

  const typeKeys = ['type', 'record_type', 'category'];
  for (const key of typeKeys) {
    if (typeof clone[key] === 'string' && clone[key]) {
      explicitType = String(clone[key]);
      delete clone[key];
      break;
    }
  }

  let properties: Record<string, unknown> = {};
  if (clone.properties && typeof clone.properties === 'object' && clone.properties !== null && !Array.isArray(clone.properties)) {
    properties = { ...(clone.properties as Record<string, unknown>) };
    delete clone.properties;
  }

  properties = { ...properties, ...clone };
  return { type: explicitType, properties };
}

function mergeMetadata(properties: Record<string, unknown>, metadata: Record<string, unknown>): Record<string, unknown> {
  if (!properties.source_file || typeof properties.source_file !== 'object' || properties.source_file === null) {
    return { ...properties, source_file: metadata };
  }

  const existing = properties.source_file as Record<string, unknown>;
  return { ...properties, source_file: { ...metadata, ...existing } };
}

export async function analyzeFileForRecord(options: AnalyzeFileOptions): Promise<FileAnalysisResult> {
  const { buffer, fileName, mimeType, fileSize } = options;
  const preview = await buildFilePreview(buffer, { fileName, mimeType });

  if (!openai || !preview) {
    return {
      type: fallbackTypeFromName(fileName, mimeType),
      properties: {},
      summary: 'Automatic analysis unavailable; using basic metadata only.',
    };
  }

  const systemPrompt = [
    'You analyze uploaded files and extract structured metadata.',
    'Return ONLY valid JSON with shape {"type":"<string>","properties":{...}}.',
    '',
    'The "type" should be a concise noun (e.g. invoice, receipt, statement, contract, resume, report).',
    '',
    'The "properties" object MUST include:',
    '1. summary: A concise, noun-oriented sentence describing the document (e.g., "RSS feed...", "Electronic ticket...", "Outline of architecture..."). Start with a noun phrase, avoid "This document is..." or "The document appears to be...".',
    '2. All structured fields you can reliably extract from the file content, filename, or metadata, such as:',
    '   - Dates: creation_date, due_date, transaction_date, expiration_date, etc.',
    '   - Financial: amount, total, subtotal, tax, currency, account_number, routing_number',
    '   - Parties: payee, payer, recipient, sender, vendor, customer, company_name',
    '   - Identifiers: invoice_number, receipt_number, transaction_id, reference_number, order_number',
    '   - Status: status, payment_status, approval_status',
    '   - Categories: category, department, project, expense_type',
    '   - Any other relevant structured data fields',
    '',
    'Extract as many structured fields as possible. Use null for missing values.',
    'If the file content is not readable (e.g., binary PDF), infer what you can from filename and metadata.',
    'If uncertain about type, set it to "unknown" and explain in summary.',
  ].join('\n');

  const userPrompt = [
    fileName ? `File name: ${fileName}` : undefined,
    mimeType ? `MIME type: ${mimeType}` : undefined,
    typeof fileSize === 'number' ? `File size: ${fileSize} bytes` : undefined,
    '---',
    'File content preview (first 8,000 characters, may be empty for binary files):',
    preview || '(No readable text content)',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) {
      return {
        type: fallbackTypeFromName(fileName, mimeType),
        properties: {},
        summary: 'No analysis returned; falling back to metadata.',
      };
    }

    const cleaned = stripCodeFence(rawContent);
    const parsed = JSON.parse(cleaned) as Partial<FileAnalysisResult & { properties?: Record<string, unknown> }>;
    const resultType = typeof parsed.type === 'string' && parsed.type ? parsed.type : fallbackTypeFromName(fileName, mimeType);
    const resultProps = parsed.properties && typeof parsed.properties === 'object' && !Array.isArray(parsed.properties)
      ? (parsed.properties as Record<string, unknown>)
      : {};

    // Extract summary from properties if present, otherwise use fallback
    let summary: string | undefined;
    if (resultProps.summary && typeof resultProps.summary === 'string') {
      summary = resultProps.summary;
      // Remove summary from properties so it doesn't get stored there
      delete resultProps.summary;
    } else if (parsed.summary && typeof parsed.summary === 'string') {
      summary = parsed.summary;
    } else {
      summary = 'Summary unavailable from model.';
    }

    return {
      type: resultType,
      properties: resultProps,
      summary,
    };
  } catch (error) {
    console.error('File analysis failed, falling back to metadata:', error);
    return {
      type: fallbackTypeFromName(fileName, mimeType),
      properties: {
        error: error instanceof Error ? error.message : 'Unknown analysis error',
      },
      summary: 'Analysis failed; using metadata only.',
    };
  }
}

export async function createRecordFromUploadedFile(options: CreateRecordFromFileOptions): Promise<NeotomaRecord> {
  const { buffer, fileName, mimeType, fileSize, fileUrl, overrideProperties } = options;
  const metadata = {
    name: fileName ?? 'uploaded-file',
    size: fileSize ?? buffer.length,
    mime_type: mimeType ?? 'application/octet-stream',
    file_url: fileUrl,
  };

  const { type: overrideType, properties: normalizedOverride } = normalizeOverride(overrideProperties);

  let analyzedType = overrideType;
  let analyzedProperties = normalizedOverride;
  let summary: string | undefined;

  if (!overrideProperties) {
    const analysis = await analyzeFileForRecord({ buffer, fileName, mimeType, fileSize });
    analyzedType = analysis.type || analyzedType;
    analyzedProperties = analysis.properties || {};
    summary = analysis.summary;
  }

  if (!analyzedType || typeof analyzedType !== 'string') {
    analyzedType = fallbackTypeFromName(fileName, mimeType);
  }

  const finalProperties = mergeMetadata(analyzedProperties, metadata);

  const insertId = options.recordId ?? randomUUID();

  let embedding: number[] | null = null;
  const canonicalType = normalizeRecordType(analyzedType).type;

  if (config.openaiApiKey) {
    try {
      embedding = await generateEmbedding(getRecordText(canonicalType, finalProperties));
    } catch (error) {
      console.warn('Embedding generation failed for uploaded file record', error);
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

  if (finalSummary) {
    insertPayload.summary = finalSummary;
  }

  const { data, error } = await supabase
    .from('records')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('Failed to insert record:', {
      error: error.message,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
      payload: { ...insertPayload, embedding: insertPayload.embedding ? `[${(insertPayload.embedding as number[]).length} dimensions]` : null },
    });
    throw error;
  }

  return data as NeotomaRecord;
}
