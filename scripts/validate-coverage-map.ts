#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const coverageMapPath = path.join(repoRoot, 'playwright/tests/coverage-map.json');
const testsDir = path.join(repoRoot, 'playwright/tests');

interface CoverageEntry {
  description: string;
  components: string[];
  states: string[];
  specFile: string;
}

interface CoverageMap {
  [key: string]: CoverageEntry;
}

function readCoverageMap(): CoverageMap {
  if (!fs.existsSync(coverageMapPath)) {
    console.error(`❌ Coverage map not found at: ${coverageMapPath}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(coverageMapPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to parse coverage map JSON: ${error}`);
    process.exit(1);
  }
}

function getAllSpecFiles(): string[] {
  const files = fs.readdirSync(testsDir);
  return files.filter(file => file.endsWith('.spec.ts'));
}

function validateCoverageMapStructure(coverageMap: CoverageMap): boolean {
  let isValid = true;

  for (const [key, entry] of Object.entries(coverageMap)) {
    if (!entry.description || typeof entry.description !== 'string') {
      console.error(`❌ Entry "${key}" is missing or has invalid "description" field`);
      isValid = false;
    }

    if (!Array.isArray(entry.components) || entry.components.length === 0) {
      console.error(`❌ Entry "${key}" is missing or has invalid "components" field (must be non-empty array)`);
      isValid = false;
    }

    if (!Array.isArray(entry.states) || entry.states.length === 0) {
      console.error(`❌ Entry "${key}" is missing or has invalid "states" field (must be non-empty array)`);
      isValid = false;
    }

    if (!entry.specFile || typeof entry.specFile !== 'string') {
      console.error(`❌ Entry "${key}" is missing or has invalid "specFile" field`);
      isValid = false;
    }
  }

  return isValid;
}

function validateSpecFilesExist(coverageMap: CoverageMap): boolean {
  let isValid = true;

  for (const [key, entry] of Object.entries(coverageMap)) {
    const specFilePath = path.join(testsDir, entry.specFile);
    
    if (!fs.existsSync(specFilePath)) {
      console.error(`❌ Spec file not found for entry "${key}": ${entry.specFile}`);
      isValid = false;
    }
  }

  return isValid;
}

function validateAllSpecFilesCovered(coverageMap: CoverageMap): boolean {
  let isValid = true;
  const specFiles = getAllSpecFiles();
  const coveredSpecFiles = Object.values(coverageMap).map(entry => entry.specFile);

  for (const specFile of specFiles) {
    if (!coveredSpecFiles.includes(specFile)) {
      console.error(`❌ Spec file "${specFile}" is not referenced in coverage map`);
      isValid = false;
    }
  }

  return isValid;
}

function validateTestDescribeNames(coverageMap: CoverageMap): boolean {
  let isValid = true;

  for (const [key, entry] of Object.entries(coverageMap)) {
    const specFilePath = path.join(testsDir, entry.specFile);
    
    if (!fs.existsSync(specFilePath)) {
      // Already reported in validateSpecFilesExist
      continue;
    }

    try {
      const content = fs.readFileSync(specFilePath, 'utf-8');
      const expectedDescribeName = `${key} coverage`;
      
      // Check if the test.describe name matches the coverage map key
      const describeRegex = /test\.describe\s*\(\s*['"`]([^'"`]+)['"`]/;
      const match = content.match(describeRegex);
      
      if (match) {
        const actualDescribeName = match[1];
        if (actualDescribeName !== expectedDescribeName) {
          console.warn(`⚠️  Warning: test.describe name "${actualDescribeName}" in ${entry.specFile} doesn't match expected "${expectedDescribeName}"`);
          // This is a warning, not an error, so we don't set isValid to false
        }
      } else {
        console.warn(`⚠️  Warning: Could not find test.describe in ${entry.specFile}`);
      }
    } catch (error) {
      console.error(`❌ Failed to read spec file ${entry.specFile}: ${error}`);
      isValid = false;
    }
  }

  return isValid;
}

function main() {
  console.log('🔍 Validating Playwright coverage map...\n');

  const coverageMap = readCoverageMap();
  
  let allValid = true;

  // Validate JSON structure
  console.log('📋 Validating coverage map structure...');
  if (!validateCoverageMapStructure(coverageMap)) {
    allValid = false;
  } else {
    console.log('✅ Coverage map structure is valid\n');
  }

  // Validate spec files exist
  console.log('📁 Validating spec files exist...');
  if (!validateSpecFilesExist(coverageMap)) {
    allValid = false;
  } else {
    console.log('✅ All spec files exist\n');
  }

  // Validate all spec files are covered
  console.log('🔗 Validating all spec files are referenced...');
  if (!validateAllSpecFilesCovered(coverageMap)) {
    allValid = false;
  } else {
    console.log('✅ All spec files are referenced in coverage map\n');
  }

  // Validate test.describe names
  console.log('🏷️  Validating test.describe names...');
  if (!validateTestDescribeNames(coverageMap)) {
    allValid = false;
  } else {
    console.log('✅ Test describe names are consistent\n');
  }

  if (allValid) {
    console.log('✅ All coverage map validations passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Coverage map validation failed!');
    process.exit(1);
  }
}

main();

