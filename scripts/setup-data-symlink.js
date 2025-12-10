#!/usr/bin/env node
// Setup symlink for data directory pointing to directory defined by environment variable

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync, lstatSync, mkdirSync, unlinkSync, symlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const DATA_LINK_PATH = join(REPO_ROOT, 'data');

// Load environment-specific .env files (same pattern as config.ts)
const env = process.env.NODE_ENV || 'development';

if (env === 'production') {
  dotenv.config({ path: '.env.production' });
  dotenv.config(); // Load .env as fallback
} else {
  // Development/test: load .env.development if it exists, otherwise .env
  dotenv.config({ path: '.env.development' });
  dotenv.config(); // Always load .env as fallback
}

// Check for environment variable (try multiple common names)
const DATA_DIR = process.env.DATA_DIR || process.env.NEOTOMA_DATA_DIR;

if (!DATA_DIR) {
  console.error('Error: DATA_DIR or NEOTOMA_DATA_DIR environment variable not set');
  console.error('');
  console.error('Add one of these to your .env file:');
  console.error('  DATA_DIR=/path/to/data/directory');
  console.error('  # or');
  console.error('  NEOTOMA_DATA_DIR=/path/to/data/directory');
  console.error('');
  console.error('Then run:');
  console.error('  npm run setup:data');
  process.exit(1);
}

// Resolve the path (handles tilde, relative paths, etc.)
let targetDir = DATA_DIR;
if (targetDir.startsWith('~')) {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    targetDir = targetDir.replace('~', homeDir);
  }
}
targetDir = resolve(targetDir);

// Check if target directory exists
if (!existsSync(targetDir)) {
  console.log(`Target directory does not exist: ${targetDir}`);
  console.log('Creating directory...');
  mkdirSync(targetDir, { recursive: true });
}

// Remove existing symlink or check if it's a directory/file
if (existsSync(DATA_LINK_PATH)) {
  const stats = lstatSync(DATA_LINK_PATH);
  if (stats.isSymbolicLink()) {
    console.log(`Removing existing symlink: ${DATA_LINK_PATH}`);
    unlinkSync(DATA_LINK_PATH);
  } else {
    console.error(`Warning: ${DATA_LINK_PATH} already exists and is not a symlink`);
    console.error('Please remove it manually before creating the symlink');
    process.exit(1);
  }
}

// Create the symlink
try {
  symlinkSync(targetDir, DATA_LINK_PATH, 'dir');
  console.log(`✓ Created symlink: ${DATA_LINK_PATH} -> ${targetDir}`);
} catch (error) {
  console.error(`Error creating symlink: ${error.message}`);
  process.exit(1);
}


