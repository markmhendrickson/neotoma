#!/usr/bin/env node
/**
 * Merge current branch into dev, push dev to origin, then switch back to current branch
 * Uses merge (not rebase) for safety with shared branches
 * Handles worktree scenarios where dev may be checked out in another worktree
 */

import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';

function getCurrentBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    return branch || 'main';
  } catch (error) {
    console.error('Error getting current branch:', error.message);
    process.exit(1);
  }
}

function hasUncommittedChanges() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    return status.length > 0;
  } catch (error) {
    console.error('Error checking git status:', error.message);
    return true; // Assume changes exist if we can't check
  }
}

function branchExists(branchName, remote = false) {
  try {
    if (remote) {
      execSync(`git ls-remote --heads origin ${branchName}`, { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } else {
      execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    }
  } catch (error) {
    return false;
  }
}

function ensureDevBranch() {
  const devExistsLocally = branchExists('dev', false);
  const devExistsRemote = branchExists('dev', true);

  if (devExistsLocally) {
    return true;
  }

  if (devExistsRemote) {
    console.log('Checking out dev branch from origin...');
    try {
      execSync('git checkout -b dev origin/dev', { stdio: 'inherit' });
      return true;
    } catch (error) {
      console.error('Error checking out dev branch:', error.message);
      return false;
    }
  }

  // Dev doesn't exist, try to create from main/master
  console.log('Dev branch not found. Creating from main/master...');
  const mainBranches = ['main', 'master'];
  for (const baseBranch of mainBranches) {
    if (branchExists(baseBranch, false) || branchExists(baseBranch, true)) {
      try {
        if (!branchExists(baseBranch, false)) {
          execSync(`git checkout -b ${baseBranch} origin/${baseBranch}`, { stdio: 'pipe' });
        }
        execSync(`git checkout -b dev ${baseBranch}`, { stdio: 'inherit' });
        console.log(`Created dev branch from ${baseBranch}`);
        return true;
      } catch (error) {
        console.warn(`Failed to create dev from ${baseBranch}:`, error.message);
      }
    }
  }

  console.error('Could not create dev branch. Please create it manually.');
  return false;
}

function pullLatestDev() {
  try {
    console.log('Pulling latest dev from origin...');
    execSync('git pull origin dev', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Error pulling latest dev:', error.message);
    return false;
  }
}

function mergeBranch(sourceBranch) {
  try {
    console.log(`Merging ${sourceBranch} into dev...`);
    execSync(`git merge --no-ff ${sourceBranch} -m "Merge ${sourceBranch} into dev"`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    // Check if it's a merge conflict
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      if (status.includes('UU') || status.includes('AA') || status.includes('DD')) {
        console.error('\nMerge conflict detected! Please resolve conflicts manually.');
        console.error('After resolving, run: git add . && git commit');
        return false;
      }
    } catch (e) {
      // Ignore
    }
    console.error(`Error merging ${sourceBranch}:`, error.message);
    return false;
  }
}

function pushDev() {
  try {
    console.log('Pushing dev to origin...');
    execSync('git push origin dev', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Error pushing dev to origin:', error.message);
    return false;
  }
}

function switchToBranch(branchName) {
  try {
    console.log(`Switching to ${branchName}...`);
    execSync(`git checkout ${branchName}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Error switching to ${branchName}:`, error.message);
    return false;
  }
}

function isInWorktree() {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
    return gitDir.includes('.git/worktrees');
  } catch {
    return false;
  }
}

function getMainRepoPath() {
  try {
    if (isInWorktree()) {
      const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf-8' }).trim();
      return commonDir.replace(/\/\.git$/, '');
    } else {
      return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    }
  } catch {
    return null;
  }
}

function getWorktreeForBranch(branchName) {
  try {
    const worktreeList = execSync('git worktree list', { encoding: 'utf-8' }).trim();
    const lines = worktreeList.split('\n');
    for (const line of lines) {
      // Format: /path/to/worktree  commit-hash [branch-name]
      const match = line.match(/^(.+?)\s+[a-f0-9]+\s+\[(.+)\]$/);
      if (match) {
        const [, path, branch] = match;
        if (branch === branchName) {
          return path.trim();
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function createTempWorktreeForBranch(branchName, mainRepoPath) {
  try {
    const tempDir = mkdtempSync(join(tmpdir(), 'neotoma-merge-'));
    console.log(`Creating temporary worktree for ${branchName} at ${tempDir}...`);
    execSync(`git worktree add "${tempDir}" ${branchName}`, { 
      stdio: 'inherit',
      cwd: mainRepoPath 
    });
    return tempDir;
  } catch (error) {
    console.error(`Error creating temporary worktree:`, error.message);
    return null;
  }
}

function removeWorktree(worktreePath) {
  try {
    console.log(`Removing temporary worktree at ${worktreePath}...`);
    execSync(`git worktree remove "${worktreePath}"`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.warn(`Warning: Failed to remove worktree at ${worktreePath}. You may need to remove it manually.`);
    return false;
  }
}

// Main execution
const currentBranch = getCurrentBranch();

if (currentBranch === 'dev') {
  console.error('Already on dev branch. Cannot merge dev into itself.');
  process.exit(1);
}

if (hasUncommittedChanges()) {
  console.error('Uncommitted changes detected. Please commit or stash changes before merging.');
  process.exit(1);
}

console.log(`Current branch: ${currentBranch}`);
console.log('Starting merge to dev...\n');

if (!ensureDevBranch()) {
  process.exit(1);
}

// Handle worktree scenario: if dev is checked out in another worktree, create temp worktree
let tempWorktreePath = null;
let originalCwd = process.cwd();
const inWorktree = isInWorktree();
const mainRepoPath = getMainRepoPath();
const devWorktreePath = getWorktreeForBranch('dev');

if (devWorktreePath && devWorktreePath !== originalCwd) {
  console.log(`Dev branch is checked out in another worktree at: ${devWorktreePath}`);
  console.log('Creating temporary worktree for merge operation...');
  
  if (!mainRepoPath) {
    console.error('Could not determine main repository path.');
    process.exit(1);
  }
  
  tempWorktreePath = createTempWorktreeForBranch('dev', mainRepoPath);
  if (!tempWorktreePath) {
    console.error('Failed to create temporary worktree. Cannot proceed with merge.');
    process.exit(1);
  }
  
  // Change to temp worktree directory for merge operations
  process.chdir(tempWorktreePath);
  console.log(`Switched to temporary worktree at ${tempWorktreePath}\n`);
} else {
  // Normal case: switch to dev in current worktree/repo
  if (!switchToBranch('dev')) {
    process.exit(1);
  }
}

if (!pullLatestDev()) {
  console.warn('Warning: Failed to pull latest dev. Continuing with merge...');
}

let mergeSuccess = false;
let pushSuccess = false;

try {
  if (!mergeBranch(currentBranch)) {
    console.error('\nMerge failed.');
    if (tempWorktreePath) {
      console.error(`You are in temporary worktree at: ${tempWorktreePath}`);
      console.error('To abort the merge: git merge --abort');
      console.error('To resolve conflicts: fix conflicts, then git add . && git commit');
      console.error('After resolving, the temporary worktree will be cleaned up.');
    } else {
      console.error('You are currently on dev branch.');
      console.error('To abort the merge: git merge --abort');
      console.error('To resolve conflicts: fix conflicts, then git add . && git commit');
    }
    process.exit(1);
  }
  mergeSuccess = true;

  if (!pushDev()) {
    console.error('\nPush failed. Dev branch has been merged but not pushed.');
    if (tempWorktreePath) {
      console.error(`You are in temporary worktree at: ${tempWorktreePath}`);
    } else {
      console.error('You are currently on dev branch.');
      console.error('After fixing push issues, switch back with: git checkout', currentBranch);
    }
    process.exit(1);
  }
  pushSuccess = true;
} finally {
  // Clean up temporary worktree if we created one
  if (tempWorktreePath) {
    process.chdir(originalCwd);
    if (!removeWorktree(tempWorktreePath)) {
      console.warn(`\nWarning: Temporary worktree still exists at ${tempWorktreePath}`);
      console.warn('You may need to remove it manually with: git worktree remove <path>');
    }
  } else if (mergeSuccess && pushSuccess) {
    // Switch back to original branch only if merge and push succeeded
    if (!switchToBranch(currentBranch)) {
      console.error(`\nWarning: Failed to switch back to ${currentBranch}. You are currently on dev branch.`);
      process.exit(1);
    }
  }
}

console.log(`\nSuccessfully merged ${currentBranch} into dev and pushed to origin.`);
if (!tempWorktreePath) {
  console.log(`Switched back to ${currentBranch}.`);
}

