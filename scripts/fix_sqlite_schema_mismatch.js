#!/usr/bin/env node

/**
 * Fix SQLite schema mismatch in Phase 1 MCP integration tests
 *
 * SQLite schema (from .vitest/neotoma.db):
 * - file_size (not byte_size)
 * - original_filename (not file_name)
 * - No source_type column
 * - No storage_status column
 * - No source_agent_id or source_metadata
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

function fixFile(filePath) {
  console.log(`Fixing ${filePath}...`);

  let content = fs.readFileSync(filePath, 'utf8');

  // Remove source_type from all inserts (SQLite doesn't have this column)
  content = content.replace(/source_type:\s*"[^"]+",?\s*/g, '');

  // Change byte_size to file_size
  content = content.replace(/byte_size:/g, 'file_size:');

  // Change file_name to original_filename
  content = content.replace(/file_name:/g, 'original_filename:');

  // Remove storage_status from inserts
  content = content.replace(/storage_status:\s*"[^"]+",?\s*/g, '');

  // Remove source_agent_id from inserts
  content = content.replace(/source_agent_id:\s*"[^"]+",?\s*/g, '');

  // Remove source_metadata from inserts
  content = content.replace(/source_metadata:\s*\{[^}]*\},?\s*/g, '');

  // Clean up trailing commas before closing braces
  content = content.replace(/,(\s*)\}/g, '$1}');

  fs.writeFileSync(filePath, content);
  console.log(`✅ Fixed ${filePath}`);
}

console.log('Fixing SQLite schema mismatch in Phase 1 MCP integration tests...\n');

const repoRoot = path.join(__dirname, '..');

for (const file of testFiles) {
  const fullPath = path.join(repoRoot, file);
  if (fs.existsSync(fullPath)) {
    fixFile(fullPath);
  } else {
    console.log(`⚠️  File not found: ${file}`);
  }
}

console.log('\n✅ All files fixed!');
console.log('Run tests: npm run test:integration');
