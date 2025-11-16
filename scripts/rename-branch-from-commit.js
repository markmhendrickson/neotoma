#!/usr/bin/env node
/**
 * Generate a sanitized branch name from a commit message
 * Used to rename chat-* branches to descriptive names before committing
 */

/**
 * Sanitize a string for use as a git branch name
 * - Convert to lowercase
 * - Replace spaces and special chars with hyphens
 * - Remove consecutive hyphens
 * - Truncate to reasonable length
 * - Remove leading/trailing hyphens
 */
function sanitizeBranchName(name, maxLength = 60) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove invalid chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .slice(0, maxLength)
    .replace(/-+$/, ''); // Remove trailing hyphen after truncation
}

/**
 * Detect commit type prefix from commit message
 * Returns prefix like 'feat/', 'fix/', 'refactor/', etc.
 */
function detectCommitPrefix(message) {
  const firstLine = message.split('\n')[0].toLowerCase().trim();
  
  if (firstLine.startsWith('feat') || firstLine.includes('add') || firstLine.includes('implement')) {
    return 'feat/';
  }
  if (firstLine.startsWith('fix') || firstLine.includes('bug') || firstLine.includes('error')) {
    return 'fix/';
  }
  if (firstLine.startsWith('refactor') || firstLine.includes('refactor')) {
    return 'refactor/';
  }
  if (firstLine.startsWith('docs') || firstLine.includes('documentation')) {
    return 'docs/';
  }
  if (firstLine.startsWith('test') || firstLine.includes('test')) {
    return 'test/';
  }
  if (firstLine.startsWith('chore') || firstLine.includes('chore')) {
    return 'chore/';
  }
  if (firstLine.startsWith('perf') || firstLine.includes('performance')) {
    return 'perf/';
  }
  if (firstLine.startsWith('style') || firstLine.includes('formatting')) {
    return 'style/';
  }
  
  return '';
}

/**
 * Generate branch name from commit message
 * @param {string} commitMessage - The commit message
 * @returns {string} Sanitized branch name with prefix
 */
function generateBranchNameFromCommit(commitMessage) {
  if (!commitMessage || typeof commitMessage !== 'string') {
    return '';
  }
  
  const firstLine = commitMessage.split('\n')[0].trim();
  if (!firstLine) {
    return '';
  }
  
  const prefix = detectCommitPrefix(commitMessage);
  
  // Remove prefix from message if it's already there to avoid duplication
  const messageWithoutPrefix = firstLine.replace(/^(feat|fix|refactor|docs|test|chore|perf|style)[:\/]\s*/i, '').trim();
  const finalSanitized = sanitizeBranchName(messageWithoutPrefix || firstLine);
  
  if (!finalSanitized) {
    return '';
  }
  
  return prefix + finalSanitized;
}

// CLI usage - read from command line argument
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.includes('rename-branch-from-commit.js');

if (isMainModule) {
  const commitMessage = process.argv.slice(2).join(' ') || '';
  if (!commitMessage) {
    console.error('Usage: node rename-branch-from-commit.js <commit-message>');
    process.exit(1);
  }
  
  const branchName = generateBranchNameFromCommit(commitMessage);
  if (branchName) {
    console.log(branchName);
  } else {
    console.error('Failed to generate branch name from commit message');
    process.exit(1);
  }
}

// Export for use as module
export { generateBranchNameFromCommit };

