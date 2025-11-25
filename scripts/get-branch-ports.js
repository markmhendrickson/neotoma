#!/usr/bin/env node
/**
 * Generate branch-specific ports for dev/test tooling.
 * Prefers any ports currently allocated via with-branch-ports,
 * falling back to deterministic hash-derived defaults.
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Base ports
const BASE_HTTP_PORT = 8080;
const BASE_VITE_PORT = 5173;
const BASE_WS_PORT = 8081;

// Port ranges (avoid conflicts with common services)
const HTTP_PORT_RANGE = 100; // 8080-8179
const VITE_PORT_RANGE = 100; // 5173-5272
const WS_PORT_RANGE = 100;   // 8081-8180

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGitBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    return branch || 'main';
  } catch {
    // Fallback if not in git repo or git not available
    return 'main';
  }
}

function hashBranchToPort(branch, base, range) {
  const hash = createHash('sha256').update(branch).digest();
  const offset = hash.readUInt16BE(0) % range;
  return base + offset;
}

function readAssignedPorts(branch) {
  const statePath = path.resolve(__dirname, '..', '.branch-ports', `${branch}.json`);
  try {
    const contents = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(contents);
    const { ports } = state ?? {};
    if (
      ports &&
      typeof ports.http === 'number' &&
      typeof ports.vite === 'number' &&
      typeof ports.ws === 'number'
    ) {
      return ports;
    }
  } catch {
    // Ignore parse / fs errors and fall back to deterministic values
  }
  return null;
}

const branch = getGitBranch();
const assigned = readAssignedPorts(branch);

const httpPort = assigned?.http ?? hashBranchToPort(branch, BASE_HTTP_PORT, HTTP_PORT_RANGE);
const vitePort = assigned?.vite ?? hashBranchToPort(branch, BASE_VITE_PORT, VITE_PORT_RANGE);
const wsPort = assigned?.ws ?? hashBranchToPort(branch, BASE_WS_PORT, WS_PORT_RANGE);

// Export as environment variables
console.log(`HTTP_PORT=${httpPort}`);
console.log(`VITE_PORT=${vitePort}`);
console.log(`WS_PORT=${wsPort}`);
console.log(`# Branch: ${branch}`, { stdio: 'inherit' });

// Set environment variables for current process (for nested invocations)
process.env.HTTP_PORT = String(httpPort);
process.env.VITE_PORT = String(vitePort);
process.env.WS_PORT = String(wsPort);
process.env.PORT = String(vitePort); // Vite consumes PORT when VITE_PORT absent

