#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const testFiles = [
  'tests/integration/mcp_entity_variations.test.ts',
  'tests/integration/mcp_graph_variations.test.ts',
  'tests/integration/mcp_query_variations.test.ts',
  'tests/integration/mcp_relationship_variations.test.ts',
  'tests/integration/mcp_schema_variations.test.ts',
  'tests/integration/mcp_store_variations.test.ts',
  'tests/integration/mcp_resource_variations.test.ts'
];

function fixObservedProperties(content) {
  // In observation inserts, rename observed_properties to fields
  let updated = content.replace(/observed_properties:/g, 'fields:');

  // Also fix assertions that reference observed_properties
  updated = updated.replace(/\.observed_properties\./g, '.fields.');
  updated = updated.replace(/\["observed_properties"\]/g, '["fields"]');

  return updated;
}

// Process each test file
for (const testFile of testFiles) {
  const filePath = path.join(process.cwd(), testFile);

  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${testFile} (not found)`);
    continue;
  }

  console.log(`Processing ${testFile}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const updatedContent = fixObservedProperties(content);

  if (content !== updatedContent) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`✓ Updated ${testFile}`);
  } else {
    console.log(`  No changes needed for ${testFile}`);
  }
}

console.log('\nDone!');
