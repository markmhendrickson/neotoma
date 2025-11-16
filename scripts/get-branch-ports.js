#!/usr/bin/env node
/**
 * Generate deterministic ports based on git branch name
 * Ensures different branches use different ports to avoid conflicts
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';

// Base ports
const BASE_HTTP_PORT = 8080;
const BASE_VITE_PORT = 5173;
const BASE_WS_PORT = 8081;

// Port ranges (avoid conflicts with common services)
const HTTP_PORT_RANGE = 100; // 8080-8179
const VITE_PORT_RANGE = 100; // 5173-5272
const WS_PORT_RANGE = 100;   // 8081-8180

function getGitBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    return branch || 'main';
  } catch (error) {
    // Fallback if not in git repo or git not available
    return 'main';
  }
}

function hashBranchToPort(branch, base, range) {
  const hash = createHash('sha256').update(branch).digest();
  const offset = hash.readUInt16BE(0) % range;
  return base + offset;
}

const branch = getGitBranch();
const httpPort = hashBranchToPort(branch, BASE_HTTP_PORT, HTTP_PORT_RANGE);
const vitePort = hashBranchToPort(branch, BASE_VITE_PORT, VITE_PORT_RANGE);
const wsPort = hashBranchToPort(branch, BASE_WS_PORT, WS_PORT_RANGE);

// Export as environment variables
console.log(`HTTP_PORT=${httpPort}`);
console.log(`VITE_PORT=${vitePort}`);
console.log(`WS_PORT=${wsPort}`);
console.log(`# Branch: ${branch}`, { stdio: 'inherit' });

// Set environment variables for current process
process.env.HTTP_PORT = String(httpPort);
process.env.VITE_PORT = String(vitePort);
process.env.WS_PORT = String(wsPort);
process.env.PORT = String(vitePort); // Vite uses PORT env var

