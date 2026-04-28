/**
 * Async child-process runner shared across hook adapters.
 *
 * spawnSync cannot be used here: the Tier-1 mock Neotoma server runs in
 * the same Node process as the test, so a synchronous spawn would block
 * the event loop and prevent the server from accepting the hook's HTTP
 * requests, leading to deadlock.
 */

import { spawn } from "node:child_process";

export interface ChildResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunChildOptions {
  input?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs?: number;
}

export function runChildProcess(
  command: string,
  args: string[],
  options: RunChildOptions = {}
): Promise<ChildResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      env: options.env,
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finish = (status: number | null) => {
      if (settled) return;
      settled = true;
      resolveResult({ status, stdout, stderr, timedOut });
    };

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      stderr += `\n[spawn error] ${err.message}`;
      finish(null);
    });
    child.on("close", (code) => {
      finish(code);
    });

    if (options.timeoutMs && options.timeoutMs > 0) {
      const t = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, options.timeoutMs);
      child.on("close", () => clearTimeout(t));
    }

    if (options.input != null) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}
