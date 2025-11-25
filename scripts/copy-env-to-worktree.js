#!/usr/bin/env node
/**
 * Copy .env file from main repository to current worktree as .env.development
 * This is useful for Cursor worktrees which don't automatically copy gitignored files
 */

import { existsSync, copyFileSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getMainRepoPath() {
  try {
    // Get the git common directory (works for both regular repos and worktrees)
    const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf-8' }).trim();
    const worktreeDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
    
    // If we're in a worktree, the common dir points to the main repo's .git
    if (worktreeDir !== commonDir) {
      // We're in a worktree - commonDir is something like /main/repo/.git/worktrees/worktree-name
      // Or for bare repos: /main/repo/.git
      const gitDir = commonDir.replace(/\/(worktrees|gitdir)/, '');
      return dirname(gitDir);
    }
    
    // Regular repo - commonDir is .git, so parent is the repo root
    return dirname(commonDir);
  } catch {
    return null;
  }
}

function isCursorWorktree(worktreePath) {
  return worktreePath && worktreePath.includes('.cursor/worktrees/');
}

function findEnvFile(repoPath) {
  // Priority: .env.dev, .env, .env.development
  const candidates = [
    join(repoPath, '.env.dev'),
    join(repoPath, '.env'),
    join(repoPath, '.env.development'),
  ];
  
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function main() {
  const currentDir = process.cwd();
  const mainRepoPath = getMainRepoPath();
  
  if (!mainRepoPath) {
    console.warn('[copy-env] Could not determine main repository path. Skipping env copy.');
    return;
  }
  
  // Check if we're in a worktree
  const isWorktree = mainRepoPath !== currentDir;
  
  if (!isWorktree) {
    // Not a worktree, nothing to do
    return;
  }
  
  // Check if this looks like a Cursor worktree
  if (!isCursorWorktree(currentDir)) {
    // Not a Cursor worktree, skip (or copy anyway - uncomment next line to copy for all worktrees)
    // return;
  }
  
  const envSource = findEnvFile(mainRepoPath);
  if (!envSource) {
    console.warn(`[copy-env] No .env file found in main repository (${mainRepoPath}). Skipping env copy.`);
    return;
  }
  
  const envDest = join(currentDir, '.env.development');
  
  // Only copy if destination doesn't exist or source is newer
  if (existsSync(envDest)) {
    try {
      const sourceTime = statSync(envSource).mtimeMs;
      const destTime = statSync(envDest).mtimeMs;
      if (destTime >= sourceTime) {
        // Destination is up to date
        return;
      }
    } catch {
      // If we can't compare, proceed with copy
    }
  }
  
  try {
    copyFileSync(envSource, envDest);
    console.log(`[copy-env] Copied ${envSource} to ${envDest}`);
  } catch (error) {
    console.warn(`[copy-env] Failed to copy env file: ${error.message}`);
  }
}

main();
