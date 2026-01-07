#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { readFileSync, existsSync, watch } from 'fs';
import { mkdir } from 'fs/promises';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const PENDING_QUEUE_PATH = join(PROJECT_ROOT, '.cursor/error_reports/pending.json');

// Load configuration from foundation-config.yaml
function loadConfig() {
  const configPath = join(PROJECT_ROOT, 'foundation-config.yaml');
  if (!existsSync(configPath)) {
    return {
      enabled: true,
      automation: {
        type: 'cursor_cli',
        trigger_on_error: true,
        watch_mode: false,
        cursor_cli: {
          command: 'cursor',
          working_dir: '.',
          platform: process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux',
          clipboard_command: process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip',
          keyboard_shortcut: process.platform === 'darwin' ? 'cmd+l' : 'ctrl+l',
          delay_before_shortcut_ms: 2000,
        },
      },
    };
  }

  const config = yaml.load(readFileSync(configPath, 'utf8'));
  return config?.development?.error_debugging || {
    enabled: true,
    automation: {
      type: 'cursor_cli',
      cursor_cli: {
        command: 'cursor',
        working_dir: '.',
        platform: process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux',
        clipboard_command: process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip',
        keyboard_shortcut: process.platform === 'darwin' ? 'cmd+l' : 'ctrl+l',
        delay_before_shortcut_ms: 2000,
      },
    },
  };
}

async function loadPendingQueue() {
  try {
    const content = await readFile(PENDING_QUEUE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function sortErrorsByPriority(errors) {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return errors.sort((a, b) => {
    const priorityDiff = (priorityOrder[a.severity] || 99) - (priorityOrder[b.severity] || 99);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.reported_at || 0) - new Date(b.reported_at || 0);
  });
}

async function openCursorChat(error, config) {
  const filePath = error.file_path || error.report_path || 'unknown';
  const instructions = `Read .cursor/error_reports/pending.json
Select the error with ID: ${error.error_id}
Load error report from: ${filePath}
Run /debug workflow
Use /fix_feature_bug to fix the bug
Update error report resolution status
Archive resolved errors to .cursor/error_reports/resolved/
Remove from pending queue`;

  // Use headless cursor agent CLI (no keyboard automation needed)
  try {
    // Build cursor agent command with headless flags
    const cursorCmd = config.automation.cursor_cli?.command || 'cursor';
    const workspace = config.automation.cursor_cli?.working_dir || PROJECT_ROOT;
    const force = config.automation.cursor_cli?.force !== false; // Default to true
    const approveMcps = config.automation.cursor_cli?.approve_mcps !== false; // Default to true

    console.log(`[TRIGGER] Running headless cursor agent for error: ${error.error_id}`);
    
    // Use spawn for streaming output (real-time logs)
    const args = ['agent', '--print', '--workspace', workspace];
    if (force) {
      args.push('--force');
    }
    if (approveMcps) {
      args.push('--approve-mcps');
    }
    args.push(instructions);
    
    return new Promise((resolve, reject) => {
      const child = spawn(cursorCmd, args, {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      // Stream stdout in real-time
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        // Log each line as it arrives
        const lines = chunk.split('\n').filter(l => l.trim());
        lines.forEach(line => {
          console.log(`[AGENT] ${line}`);
        });
      });
      
      // Stream stderr in real-time
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        const lines = chunk.split('\n').filter(l => l.trim());
        lines.forEach(line => {
          console.error(`[AGENT-ERR] ${line}`);
        });
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          if (stdout.trim()) {
            console.log('[TRIGGER] Agent completed successfully');
          }
          resolve({ stdout, stderr, code });
        } else {
          const error = new Error(`Cursor agent exited with code ${code}`);
          error.stdout = stdout;
          error.stderr = stderr;
          error.code = code;
          reject(error);
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('[TRIGGER] Failed to run cursor agent:', error.message);
    if (error.message.includes('not found') || error.message.includes('command not found')) {
      console.error('[TRIGGER] Cursor CLI not found. Install with: curl https://cursor.com/install -fsS | bash');
      throw error;
    }
    if (error.stderr && error.stderr.includes('Authentication required')) {
      console.error('[TRIGGER] Cursor agent authentication required.');
      console.error('[TRIGGER] Run: cursor agent login');
      console.error('[TRIGGER] Or set CURSOR_API_KEY environment variable');
      // Don't throw - allow watcher to continue (user can authenticate later)
      return;
    }
    throw error;
  }
}

let isProcessing = false;

async function processNextError() {
  if (isProcessing) {
    return; // Skip if already processing
  }

  const config = loadConfig();

  if (!config.enabled) {
    return;
  }

  if (config.automation.type !== 'cursor_cli') {
    return;
  }

  try {
    isProcessing = true;
    const errors = await loadPendingQueue();
    if (errors.length === 0) {
      return;
    }

    const sortedErrors = sortErrorsByPriority(errors);
    const nextError = sortedErrors[0];

    console.log(`[TRIGGER] Processing error: ${nextError.error_id} (${nextError.severity})`);
    try {
      await openCursorChat(nextError, config);
      console.log('[TRIGGER] Cursor agent executed successfully.');
    } catch (openError) {
      console.error('[TRIGGER] Failed to run cursor agent:', openError.message);
      // Don't throw - allow watcher to continue monitoring
    }
  } catch (error) {
    console.error('[TRIGGER] Error:', error);
  } finally {
    isProcessing = false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch') || args.includes('-w');

  const config = loadConfig();

  if (!config.enabled) {
    console.log('[TRIGGER] Error debugging automation is disabled in foundation-config.yaml');
    process.exit(0);
  }

  if (config.automation.type !== 'cursor_cli') {
    console.log(`[TRIGGER] Automation type is "${config.automation.type}", not "cursor_cli"`);
    process.exit(0);
  }

  // Process immediately
  await processNextError();

  if (!watchMode) {
    process.exit(0);
  }

  // Watch mode: monitor pending.json for changes
  console.log('[TRIGGER] Watching for errors...');
  
  try {
    // Ensure pending.json exists (create empty array if not)
    const dir = dirname(PENDING_QUEUE_PATH);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    if (!existsSync(PENDING_QUEUE_PATH)) {
      await writeFile(PENDING_QUEUE_PATH, JSON.stringify([], null, 2), 'utf-8');
    }

    watch(PENDING_QUEUE_PATH, async (eventType) => {
      if (eventType === 'change') {
        console.log('[TRIGGER] pending.json changed, processing errors...');
        await processNextError();
      }
    });

    // Also process on startup
    await processNextError();
  } catch (error) {
    console.error('[TRIGGER] Watch error:', error);
    process.exit(1);
  }
}

main();


