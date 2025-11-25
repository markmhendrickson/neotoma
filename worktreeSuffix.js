import fs from 'node:fs';
import path from 'node:path';

function resolveGitDir(repoRoot) {
  const gitEntry = path.join(repoRoot, '.git');
  if (!fs.existsSync(gitEntry)) {
    return null;
  }

  const stats = fs.statSync(gitEntry);
  if (stats.isFile()) {
    const contents = fs.readFileSync(gitEntry, 'utf8');
    const match = contents.match(/gitdir:\s*(.+)/i);
    if (!match) {
      return null;
    }
    const target = match[1].trim();
    return path.isAbsolute(target) ? target : path.resolve(path.dirname(gitEntry), target);
  }

  if (stats.isDirectory()) {
    return gitEntry;
  }

  return null;
}

export function detectWorktreeName(repoRoot = process.cwd()) {
  try {
    const gitDir = resolveGitDir(repoRoot);
    if (!gitDir) {
      return null;
    }
    const normalized = path.normalize(gitDir);
    const segments = normalized.split(path.sep);
    const worktreeIndex = segments.lastIndexOf('worktrees');
    if (worktreeIndex === -1 || worktreeIndex + 1 >= segments.length) {
      return null;
    }
    const name = segments[worktreeIndex + 1];
    return name || null;
  } catch {
    return null;
  }
}

export function getWorktreeSuffix(repoRoot = process.cwd()) {
  const name = detectWorktreeName(repoRoot);
  return name ? ` (${name})` : '';
}

export function applyWorktreeSuffix(baseTitle, repoRoot = process.cwd()) {
  const suffix = getWorktreeSuffix(repoRoot);
  return suffix ? `${baseTitle}${suffix}` : baseTitle;
}

