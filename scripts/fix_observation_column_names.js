#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const testFiles = [
  'tests/integration/mcp_correction_variations.test.ts',
  'tests/integration/mcp_resource_variations.test.ts',
  'tests/integration/mcp_relationship_variations.test.ts',
];

function fixObservationColumnNames(content) {
  // Replace observed_properties with fields in observation inserts and queries
  let updated = content;

  // Fix in insert statements
  updated = updated.replace(/observed_properties:/g, 'fields:');

  // Fix in property access
  updated = updated.replace(/observation!\.observed_properties/g, 'observation!.fields');
  updated = updated.replace(/observations!\[0\]\.observed_properties/g, 'observations![0].fields');
  updated = updated.replace(/correction!\.observed_properties/g, 'correction!.fields');
  updated = updated.replace(/observations!\[\d+\]\.observed_properties/g, (match) => {
    return match.replace('observed_properties', 'fields');
  });

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
  const updatedContent = fixObservationColumnNames(content);

  if (content !== updatedContent) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`✓ Updated ${testFile}`);
  } else {
    console.log(`  No changes needed for ${testFile}`);
  }
}

console.log('\nDone!');
