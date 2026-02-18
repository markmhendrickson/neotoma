#!/usr/bin/env npx tsx
/**
 * Debug script: extract text from a PDF and print length + snippet.
 * Use to verify server-side extractTextFromBuffer would get usable text.
 *
 * Usage: npx tsx scripts/debug_pdf_extraction.ts <path-to-pdf>
 */

import fs from "node:fs";
import path from "node:path";

async function extractPdfText(buffer: Buffer): Promise<string> {
  const module = await import("pdf-parse");
  const PdfParse =
    (module as { PDFParse?: new (opts: { data: Buffer }) => { getText(): Promise<{ text?: string }> } }).PDFParse ??
    (module as { default?: new (opts: { data: Buffer }) => { getText(): Promise<{ text?: string }> } }).default;
  if (!PdfParse) {
    return "";
  }
  const parser = new PdfParse({ data: buffer });
  const { text } = await parser.getText();
  return text ?? "";
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/debug_pdf_extraction.ts <path-to-pdf>");
    process.exit(1);
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error("File not found:", resolved);
    process.exit(1);
  }
  const buffer = fs.readFileSync(resolved);
  const mime = filePath.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
  const name = path.basename(filePath);

  console.log("File:", name);
  console.log("Size:", buffer.length, "bytes");
  console.log("MIME:", mime);
  console.log("");

  if (!mime.includes("pdf")) {
    console.log("Not a PDF; skipping pdf-parse.");
    process.exit(0);
  }

  try {
    const text = await extractPdfText(buffer);
    console.log("Extracted text length:", text.length, "chars");
    console.log("");
    console.log("--- First 1500 chars ---");
    console.log(text.slice(0, 1500));
    if (text.length > 1500) {
      console.log("...");
    }
    console.log("--- End snippet ---");
    if (text.length === 0) {
      console.log("\n(Empty text: PDF may be image-only or unsupported; LLM would get nothing.)");
    }
  } catch (err) {
    console.error("Extraction error:", err);
    process.exit(1);
  }
}

main();
