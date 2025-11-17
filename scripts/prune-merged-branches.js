#!/usr/bin/env node

import { execFileSync } from 'child_process';

const targetBranch = process.argv[2] || process.env.TARGET_BRANCH || 'dev';

function runGit(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'inherit'], ...options }).trim();
}

const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

function isSafeBranchName(branch) {
  return Boolean(
    SAFE_BRANCH_PATTERN.test(branch) &&
    !branch.startsWith('-') &&
    !branch.startsWith('/') &&
    !branch.endsWith('/') &&
    !branch.endsWith('.lock') &&
    !branch.includes('..') &&
    !branch.includes('//') &&
    !branch.includes('@{')
  );
}

function assertSafeBranchName(branch) {
  if (!isSafeBranchName(branch)) {
    console.error(`Unsafe branch name "${branch}". Aborting to prevent command injection.`);
    process.exit(1);
  }
}

assertSafeBranchName(targetBranch);

function ensureBranchExists(branch) {
  try {
    runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  } catch {
    console.error(`Local branch "${branch}" does not exist. Create or fetch it first.`);
    process.exit(1);
  }
}

function fetchLatest() {
  try {
    execFileSync('git', ['fetch', '--all', '--prune'], { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to fetch remotes:', error.message);
    process.exit(1);
  }
}

function getCurrentBranch() {
  try {
    return runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch (error) {
    console.error('Unable to determine current branch:', error.message);
    process.exit(1);
  }
}

function getMergedBranches(branch) {
  try {
    const output = runGit(['branch', '--format=%(refname:short)', '--merged', branch]);
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.error(`Failed to list branches merged into "${branch}":`, error.message);
    process.exit(1);
  }
}

function deleteBranch(branch) {
  try {
    execFileSync('git', ['branch', '-d', branch], { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Failed to delete branch "${branch}":`, error.message);
    return false;
  }
}

ensureBranchExists(targetBranch);
fetchLatest();

const currentBranch = getCurrentBranch();
const protectedBranches = new Set([targetBranch, currentBranch, 'main', 'master']);

const mergedBranches = getMergedBranches(targetBranch).filter((branch) => {
  if (!isSafeBranchName(branch)) {
    console.warn(`Skipping unsafe branch name "${branch}"`);
    return false;
  }
  return !protectedBranches.has(branch);
});

if (mergedBranches.length === 0) {
  console.log(`No local branches fully merged into "${targetBranch}" need deletion.`);
  process.exit(0);
}

console.log(`Deleting ${mergedBranches.length} local branches merged into "${targetBranch}":`);

let deleted = 0;
for (const branch of mergedBranches) {
  if (deleteBranch(branch)) {
    deleted += 1;
  }
}

console.log(`Deleted ${deleted} branch(es).`);


