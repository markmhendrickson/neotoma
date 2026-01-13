#!/usr/bin/env node
// Setup symlink for foundation directory pointing to ../foundation

import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync, lstatSync, unlinkSync, symlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const FOUNDATION_LINK_PATH = join(REPO_ROOT, 'foundation');

// Target directory is one level up from repo root
const targetDir = resolve(REPO_ROOT, '..', 'foundation');

// Check if target directory exists
if (!existsSync(targetDir)) {
  console.error(`Error: Target directory does not exist: ${targetDir}`);
  console.error('');
  console.error('Please ensure the foundation directory exists at:');
  console.error(`  ${targetDir}`);
  process.exit(1);
}

// Remove existing symlink or check if it's a directory/file
if (existsSync(FOUNDATION_LINK_PATH)) {
  const stats = lstatSync(FOUNDATION_LINK_PATH);
  if (stats.isSymbolicLink()) {
    console.log(`Removing existing symlink: ${FOUNDATION_LINK_PATH}`);
    unlinkSync(FOUNDATION_LINK_PATH);
  } else {
    console.error(`Warning: ${FOUNDATION_LINK_PATH} already exists and is not a symlink`);
    console.error('Please remove it manually before creating the symlink');
    process.exit(1);
  }
}

// Create the symlink
try {
  symlinkSync(targetDir, FOUNDATION_LINK_PATH, 'dir');
  console.log(`✓ Created symlink: ${FOUNDATION_LINK_PATH} -> ${targetDir}`);
} catch (error) {
  console.error(`Error creating symlink: ${error.message}`);
  process.exit(1);
}
