import OpenAI from 'openai';
import { config } from '../config.js';
import { supabase } from '../db.js';
import { extractPreview } from './file_analysis.js';

const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

const MAX_PREVIEW_CHARS = 2000;

interface FileContent {
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  preview: string;
}

/**
 * Download and extract preview from a file in Supabase storage
 */
async function downloadAndExtractFile(filePath: string, bucket: string = 'files'): Promise<FileContent | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) {
      console.warn(`Failed to download file ${filePath}:`, error?.message);
      return null;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const preview = extractPreview(buffer);
    
    // Extract filename and extension from path
    const pathParts = filePath.split('/');
    const fileName = pathParts[pathParts.length - 1] || filePath;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    
    // Infer mime type from extension
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    return {
      fileName,
      mimeType,
      fileSize: buffer.length,
      preview,
    };
  } catch (error) {
    console.warn(`Error processing file ${filePath}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Generate a summary for a record using AI analysis of record data and associated files
 */
export async function generateRecordSummary(
  type: string,
  properties: Record<string, unknown>,
  fileUrls: string[] = []
): Promise<string | null> {
  if (!openai) {
    return null;
  }

  try {
    // Download and analyze all associated files
    const fileContents: FileContent[] = [];
    if (fileUrls && fileUrls.length > 0) {
      const filePromises = fileUrls.map(url => downloadAndExtractFile(url, 'files'));
      const files = await Promise.all(filePromises);
      fileContents.push(...files.filter((f): f is FileContent => f !== null));
    }

    // Build the prompt
    const systemPrompt = [
      'You analyze records and their associated files to generate a concise, noun-oriented summary.',
      'Return ONLY a single sentence summary (no JSON, no code blocks, just plain text).',
      'Start with a noun phrase describing what the record is (e.g., "RSS feed...", "Electronic ticket...", "Outline of architecture...").',
      'Avoid phrases like "This document is..." or "The document appears to be...".',
      'Be concise and informative, focusing on what the record represents.',
      'Include key details: dates, amounts, parties, or identifiers if relevant.',
      'Keep it under 200 characters if possible.',
    ].join('\n');

    const recordInfo = [
      `Record type: ${type}`,
      `Properties: ${JSON.stringify(properties, null, 2)}`,
    ];

    const fileInfo: string[] = [];
    if (fileContents.length > 0) {
      fileInfo.push(`\nAssociated files (${fileContents.length}):`);
      fileContents.forEach((file, idx) => {
        fileInfo.push(`\nFile ${idx + 1}: ${file.fileName} (${file.mimeType || 'unknown type'}, ${file.fileSize || 0} bytes)`);
        if (file.preview) {
          fileInfo.push(`Content preview: ${file.preview.slice(0, MAX_PREVIEW_CHARS)}`);
        } else {
          fileInfo.push('(Binary file - no text content)');
        }
      });
    } else {
      fileInfo.push('\nNo associated files.');
    }

    const userPrompt = [
      ...recordInfo,
      ...fileInfo,
    ].join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const summary = response.choices?.[0]?.message?.content?.trim();
    if (!summary) {
      return null;
    }

    // Clean up any code fences or JSON wrapping
    return summary.replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '').trim();
  } catch (error) {
    console.warn('Summary generation failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}
