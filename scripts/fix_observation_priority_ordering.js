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

function fixPriorityOrdering(content) {
  // Fix .order("priority") on observations table to use source_priority
  const pattern = /from\("observations"\)([\s\S]*?)\.order\("priority"\)/g;
  return content.replace(pattern, (match, middle) => {
    return `from("observations")${middle}.order("source_priority")`;
  });
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
  const updatedContent = fixPriorityOrdering(content);

  if (content !== updatedContent) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`✓ Updated ${testFile}`);
  } else {
    console.log(`  No changes needed for ${testFile}`);
  }
}

console.log('\nDone!');
