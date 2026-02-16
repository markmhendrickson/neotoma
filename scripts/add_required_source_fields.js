#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const testFiles = [
  'tests/integration/mcp_store_variations.test.ts',
];

function addRequiredSourceFields(content) {
  // Pattern to match source inserts
  const insertPattern = /\.from\("sources"\)\s*\.insert\(\s*(\{[\s\S]*?\})\s*\)/g;

  return content.replace(insertPattern, (match, fieldsBlock) => {
    // Check if required fields already exist
    const hasStorageUrl = fieldsBlock.includes('storage_url:');
    const hasMimeType = fieldsBlock.includes('mime_type:');
    const hasByteSize = fieldsBlock.includes('byte_size:');
    const hasSourceType = fieldsBlock.includes('source_type:');
    const hasFileSize = fieldsBlock.includes('file_size:');

    // If already has all required fields (or old schema with file_size), skip
    if ((hasStorageUrl && hasMimeType && hasByteSize && hasSourceType) || hasFileSize) {
      return match;
    }

    // Parse the fields block to find where to insert
    const lines = fieldsBlock.split('\n');
    const lastLineIndex = lines.length - 1;

    // Find the last field line (before closing brace)
    let insertIndex = lastLineIndex;
    for (let i = lastLineIndex - 1; i >= 0; i--) {
      if (lines[i].trim() && !lines[i].trim().startsWith('}')) {
        insertIndex = i + 1;
        break;
      }
    }

    // Add missing required fields
    const fieldsToAdd = [];
    if (!hasStorageUrl) {
      fieldsToAdd.push('          storage_url: "file:///test/minimal.txt"');
    }
    if (!hasMimeType) {
      fieldsToAdd.push('          mime_type: "text/plain"');
    }
    if (!hasByteSize) {
      fieldsToAdd.push('          byte_size: 0');
    }
    if (!hasSourceType) {
      fieldsToAdd.push('          source_type: "file"');
    }

    if (fieldsToAdd.length === 0) {
      return match;
    }

    // Check if we need to add a comma to the previous line
    const prevLine = lines[insertIndex - 1];
    if (prevLine && prevLine.trim() && !prevLine.trim().endsWith(',')) {
      lines[insertIndex - 1] = prevLine + ',';
    }

    // Insert the new fields
    const newFields = fieldsToAdd.join(',\n');
    lines.splice(insertIndex, 0, newFields + (insertIndex < lastLineIndex ? ',' : ''));

    const updatedFieldsBlock = lines.join('\n');
    return `.from("sources")\n        .insert(${updatedFieldsBlock})`;
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
  const updatedContent = addRequiredSourceFields(content);

  if (content !== updatedContent) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`✓ Updated ${testFile}`);
  } else {
    console.log(`  No changes needed for ${testFile}`);
  }
}

console.log('\nDone!');
