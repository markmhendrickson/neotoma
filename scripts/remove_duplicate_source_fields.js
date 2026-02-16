#!/usr/bin/env node

/**
 * Remove duplicate fields from source inserts caused by previous script run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = [
  'tests/integration/mcp_store_variations.test.ts',
  'tests/integration/mcp_resource_variations.test.ts',
  'tests/integration/mcp_correction_variations.test.ts',
  'tests/integration/mcp_graph_variations.test.ts',
  'tests/integration/mcp_query_variations.test.ts',
  'tests/integration/mcp_schema_variations.test.ts',
  'tests/integration/mcp_relationship_variations.test.ts',
  'tests/integration/mcp_entity_variations.test.ts'
];

function cleanFile(filePath) {
  console.log(`Cleaning ${filePath}...`);

  let content = fs.readFileSync(filePath, 'utf8');

  // Pattern 1: Remove duplicate fields added by script (with various whitespace patterns)
  // Match: storage_url, mime_type, file_size followed by comma, newline, then same fields again
  const duplicatePattern1 = /storage_url:\s*"[^"]+",?\s*\n\s*mime_type:\s*"[^"]+",?\s*\n\s*file_size:\s*\d+\s*\n\s*,\s*\n\s*storage_url:\s*"[^"]+",?\s*\n\s*mime_type:\s*"[^"]+",?\s*\n\s*file_size:\s*\d+/g;

  content = content.replace(duplicatePattern1, (match) => {
    // Keep only the first occurrence
    const lines = match.split('\n');
    return lines.slice(0, 3).join('\n');
  });

  // Pattern 2: Remove standalone duplicate blocks (comma followed by duplicate fields)
  const duplicatePattern2 = /\s*\n\s*,\s*\n\s*storage_url:\s*"file:\/\/\/test\/minimal\.txt",?\s*\n\s*mime_type:\s*"text\/plain",?\s*\n\s*file_size:\s*0/g;

  content = content.replace(duplicatePattern2, '');

  fs.writeFileSync(filePath, content);
  console.log(`✅ Cleaned ${filePath}`);
}

console.log('Removing duplicate source fields...\n');

const repoRoot = path.join(__dirname, '..');

for (const file of testFiles) {
  const fullPath = path.join(repoRoot, file);
  if (fs.existsSync(fullPath)) {
    cleanFile(fullPath);
  } else {
    console.log(`⚠️  File not found: ${file}`);
  }
}

console.log('\n✅ All duplicates removed!');
