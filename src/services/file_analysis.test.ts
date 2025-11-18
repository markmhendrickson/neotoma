import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { buildFilePreview } from './file_analysis.js';

async function createPdfBuffer(text: string): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.text(text);
    doc.end();
  });
}

describe('buildFilePreview', () => {
  it('extracts structured text from pdf files', async () => {
    const buffer = await createPdfBuffer('Transaction Date 2025-11-30');

    const preview = await buildFilePreview(buffer, {
      fileName: 'ticket.pdf',
      mimeType: 'application/pdf',
    });

    expect(preview).toContain('Transaction Date 2025-11-30');
  });

  it('falls back to utf-8 extraction for non-pdf files', async () => {
    const buffer = Buffer.from('Simple memo content', 'utf8');

    const preview = await buildFilePreview(buffer, {
      fileName: 'memo.txt',
      mimeType: 'text/plain',
    });

    expect(preview).toBe('Simple memo content');
  });
});


