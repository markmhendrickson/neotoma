#!/usr/bin/env node
/**
 * Create and switch to a new branch for chat sessions
 * Format: chat-YYYYMMDD-HHMMSS-{random}
 */

import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

function getCurrentBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    return branch || 'main';
  } catch (error) {
    console.error('Error getting current branch:', error.message);
    process.exit(1);
  }
}

function generateBranchName() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('T', '-').slice(0, 15);
  const random = randomBytes(4).toString('hex');
  return `chat-${timestamp}-${random}`;
}

function createBranch(branchName) {
  try {
    execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Error creating branch ${branchName}:`, error.message);
    return false;
  }
}

const currentBranch = getCurrentBranch();
const newBranchName = generateBranchName();

console.log(`Current branch: ${currentBranch}`);
console.log(`Creating new branch: ${newBranchName}`);

if (createBranch(newBranchName)) {
  console.log(`Switched to branch: ${newBranchName}`);
} else {
  process.exit(1);
}

