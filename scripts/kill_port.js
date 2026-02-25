#!/usr/bin/env node
/**
 * Utility to find and kill processes using specific ports
 * Usage: node scripts/kill-port.js <port1> [port2] [port3] ...
 */

import { execSync } from 'child_process';
import { platform } from 'os';

function findProcessOnPort(port) {
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error(`Invalid port number: ${port}`);
  }

  try {
    if (platform() === 'win32') {
      // Windows: Use netstat to find process using port
      const result = execSync(
        `netstat -ano | findstr :${portNum}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      const lines = result.trim().split('\n').filter(Boolean);
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          pids.add(pid);
        }
      }
      return Array.from(pids).map(Number);
    } else {
      // Unix-like (macOS, Linux): Use lsof to find process using port
      const result = execSync(
        `lsof -ti :${portNum}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      const pids = result.trim().split('\n').filter(Boolean);
      return pids.map(Number);
    }
  } catch (error) {
    // lsof/netstat returns non-zero exit code when no process found
    if (error.status === 1 || error.code === 1) {
      return [];
    }
    throw error;
  }
}

function killProcess(pid) {
  if (!pid || Number.isNaN(pid)) {
    return false;
  }

  try {
    // Check if process exists
    if (platform() === 'win32') {
      execSync(`tasklist /FI "PID eq ${pid}"`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 0);
    }
  } catch (error) {
    // Process doesn't exist
    return false;
  }

  try {
    if (platform() === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } else {
      // Try SIGTERM first
      process.kill(pid, 'SIGTERM');
      // Wait a bit, then try SIGKILL if needed
      setTimeout(() => {
        try {
          process.kill(pid, 0); // Check if still alive
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process already dead
        }
      }, 1000);
    }
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false; // Process already dead
    }
    throw error;
  }
}

async function killPorts(ports) {
  const allPids = new Set();
  
  for (const port of ports) {
    try {
      const pids = findProcessOnPort(port);
      pids.forEach(pid => allPids.add(pid));
    } catch (error) {
      // If lsof/netstat is not available, continue without killing
      console.warn(`[kill-port] Could not check port ${port}: ${error.message}`);
    }
  }

  if (allPids.size === 0) {
    return { killed: 0, ports };
  }

  console.log(`[kill-port] Found processes on ports ${ports.join(', ')}: ${Array.from(allPids).join(', ')}`);
  
  let killed = 0;
  for (const pid of allPids) {
    // Skip killing our own process or parent process
    if (pid === process.pid || pid === process.ppid) {
      continue;
    }
    
    try {
      if (killProcess(pid)) {
        killed++;
        console.log(`[kill-port] Killed process ${pid}`);
      }
    } catch (error) {
      console.warn(`[kill-port] Failed to kill process ${pid}: ${error.message}`);
    }
  }

  // On Unix, wait a moment for SIGTERM to take effect
  if (platform() !== 'win32' && killed > 0) {
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  return { killed, ports, pids: Array.from(allPids) };
}

async function main() {
  const [, , ...ports] = process.argv;
  
  if (ports.length === 0) {
    console.error('Usage: node scripts/kill-port.js <port1> [port2] [port3] ...');
    process.exit(1);
  }

  try {
    const result = await killPorts(ports);
    if (!result || typeof result !== 'object') {
      console.warn('[kill-port] Warning: Unexpected result from killPorts');
      process.exit(0);
      return;
    }
    const killed = result.killed ?? 0;
    const pidsLength = result.pids?.length ?? 0;
    if (killed === 0 && pidsLength === 0) {
      // Only log if we actually checked and found nothing
      // (silent if tools aren't available)
    } else if (killed === 0) {
      console.log(`[kill-port] No processes found on ports ${ports.join(', ')}`);
    } else {
      console.log(`[kill-port] Killed ${killed} process(es) on ports ${ports.join(', ')}`);
    }
    // Exit with 0 even if no processes were killed (ports are free)
    process.exit(0);
  } catch (error) {
    // Don't fail the script if port killing fails - just warn
    console.warn(`[kill-port] Warning: ${error.message}`);
    if (error.stack) {
      console.warn(`[kill-port] Stack: ${error.stack}`);
    }
    process.exit(0);
  }
}

main();
