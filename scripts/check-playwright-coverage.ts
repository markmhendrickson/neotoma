#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/**
 * File patterns that don't require Playwright test coverage
 */
const EXEMPT_PATTERNS = [
  /\.css$/,
  /\.scss$/,
  /\.md$/,
  /\.json$/,
  /package\.json$/,
  /package-lock\.json$/,
  /tsconfig\.json$/,
  /\.eslintrc/,
  /\.prettierrc/,
  /\.gitignore$/,
];

/**
 * Frontend file patterns that typically require test coverage
 */
const UI_PATTERNS = [
  /^frontend\/.*\.tsx?$/,
  /^src\/ui\/.*\.tsx?$/,
];

function getChangedFiles(): string[] {
  try {
    // Get staged files
    const staged = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();

    // Get unstaged but tracked changes
    const unstaged = execSync('git diff --name-only --diff-filter=ACM', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();

    const allFiles = [...new Set([...staged.split('\n'), ...unstaged.split('\n')])].filter(Boolean);
    
    return allFiles;
  } catch (error) {
    // If not in a git repo or no changes, return empty array
    return [];
  }
}

function isExemptFile(filePath: string): boolean {
  return EXEMPT_PATTERNS.some(pattern => pattern.test(filePath));
}

function isUIFile(filePath: string): boolean {
  return UI_PATTERNS.some(pattern => pattern.test(filePath));
}

function hasUIChanges(changedFiles: string[]): boolean {
  return changedFiles.some(file => {
    if (isExemptFile(file)) {
      return false;
    }
    return isUIFile(file);
  });
}

function runCoverageMapValidation(): boolean {
  console.log('🔍 Running coverage map validation...\n');
  
  try {
    execSync('npx tsx scripts/validate-coverage-map.ts', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    return true;
  } catch (error) {
    return false;
  }
}

function checkTestFiles(changedFiles: string[]): boolean {
  const testFiles = changedFiles.filter(file => file.includes('.spec.ts') || file.includes('.test.ts'));
  
  if (testFiles.length > 0) {
    console.log('✅ Found test file changes:');
    testFiles.forEach(file => console.log(`   - ${file}`));
    console.log('');
    return true;
  }
  
  return false;
}

function main() {
  console.log('🧪 Checking Playwright test coverage...\n');

  // First, validate the coverage map itself
  const isValidCoverageMap = runCoverageMapValidation();
  
  if (!isValidCoverageMap) {
    console.error('\n❌ Coverage map validation failed!');
    console.error('\nPlease fix the coverage map issues before committing.');
    process.exit(1);
  }

  // Check if there are any changed files
  const changedFiles = getChangedFiles();
  
  if (changedFiles.length === 0) {
    console.log('ℹ️  No changed files detected. Skipping coverage check.');
    process.exit(0);
  }

  console.log(`\n📝 Found ${changedFiles.length} changed file(s)\n`);

  // Check if any UI files were changed
  const hasUIFileChanges = hasUIChanges(changedFiles);
  
  if (!hasUIFileChanges) {
    console.log('✅ No UI files changed. Playwright coverage check not required.');
    process.exit(0);
  }

  console.log('🎨 UI files changed:');
  changedFiles
    .filter(file => isUIFile(file) && !isExemptFile(file))
    .forEach(file => console.log(`   - ${file}`));
  console.log('');

  // Check if test files were also changed
  const hasTestChanges = checkTestFiles(changedFiles);

  if (!hasTestChanges) {
    console.error('❌ UI files were changed but no test files were updated!\n');
    console.error('📋 Action required:');
    console.error('   1. Add or update tests in playwright/tests/ to cover your UI changes');
    console.error('   2. Update playwright/tests/coverage-map.json if adding new test files');
    console.error('   3. Run `npm run validate:coverage` to verify your changes\n');
    console.error('💡 If your changes are test-only or documentation:');
    console.error('   - CSS-only changes: automatically exempt');
    console.error('   - Add test coverage for component behavior changes\n');
    process.exit(1);
  }

  console.log('✅ Playwright coverage check passed!');
  process.exit(0);
}

main();

