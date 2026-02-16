#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const testFiles = [
  'tests/integration/mcp_entity_variations.test.ts',
  'tests/integration/mcp_graph_variations.test.ts',
  'tests/integration/mcp_query_variations.test.ts',
  'tests/integration/mcp_relationship_variations.test.ts',
  'tests/integration/mcp_resource_variations.test.ts',
  'tests/integration/mcp_schema_variations.test.ts',
  'tests/integration/mcp_source_variations.test.ts',
  'tests/integration/mcp_store_variations.test.ts',
  'tests/integration/mcp_observation_variations.test.ts',
  'tests/integration/mcp_correction_variations.test.ts'
];

function addRequiredObservationFields(content) {
  // Pattern to match observation inserts - handles both inline and multi-line formats
  const insertPattern = /\.from\("observations"\)\s*\.insert\((\{[\s\S]*?\})\)/g;

  return content.replace(insertPattern, (match, fieldsBlock) => {
    // Check if required fields already exist
    const hasSchemaVersion = fieldsBlock.includes('schema_version:');
    const hasObservedAt = fieldsBlock.includes('observed_at:');

    // If already has all required fields, skip
    if (hasSchemaVersion && hasObservedAt) {
      return match;
    }

    // Parse the fields block to find where to insert
    const lines = fieldsBlock.split('\n');
    const lastLineIndex = lines.length - 1;
    const lastLine = lines[lastLineIndex];
    const secondLastLine = lines.length > 1 ? lines[lastLineIndex - 1] : null;

    // Add missing required fields before the closing brace
    const fieldsToAdd = [];
    if (!hasSchemaVersion) {
      fieldsToAdd.push('    schema_version: "1.0"');
    }
    if (!hasObservedAt) {
      fieldsToAdd.push('    observed_at: new Date().toISOString()');
    }

    if (fieldsToAdd.length === 0) {
      return match;
    }

    // Check if second last line needs a comma (handle single-line case)
    const needsComma = secondLastLine && secondLastLine.trim() && !secondLastLine.trim().endsWith(',');

    if (needsComma) {
      lines[lastLineIndex - 1] = secondLastLine + ',';
    }

    // Insert the new fields before the closing brace
    const newFields = fieldsToAdd.join(',\n') + (lastLine.trim() === '}' ? '' : ',');
    lines.splice(lastLineIndex, 0, newFields);

    const updatedFieldsBlock = lines.join('\n');

    // Preserve original formatting style
    const isInline = !match.includes('\n');
    if (isInline) {
      return `.from("observations").insert(${updatedFieldsBlock})`;
    } else {
      return `.from("observations")\n    .insert(${updatedFieldsBlock})`;
    }
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
  const updatedContent = addRequiredObservationFields(content);

  if (content !== updatedContent) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`✓ Updated ${testFile}`);
  } else {
    console.log(`  No changes needed for ${testFile}`);
  }
}

console.log('\nDone!');
