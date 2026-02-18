/**
 * Cross-Layer Test Helpers
 *
 * Utilities for tests that validate the CLI → REST → MCP → Database flow.
 * These helpers execute CLI commands via subprocess and return parsed results
 * for subsequent database state verification.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

export const CLI_PATH = "node dist/cli/index.js";

// =============================================================================
// CLI Execution Helpers
// =============================================================================

/**
 * Execute a CLI command and return parsed JSON output
 */
export async function execCliJson(args: string): Promise<Record<string, unknown>> {
  const { stdout } = await execAsync(`${CLI_PATH} ${args} --json`);
  return JSON.parse(stdout);
}

/**
 * Execute a CLI command and return raw stdout (for non-JSON commands)
 */
export async function execCliRaw(args: string): Promise<string> {
  const { stdout } = await execAsync(`${CLI_PATH} ${args}`);
  return stdout.trim();
}

/**
 * Execute a CLI command and expect it to fail
 */
export async function execCliFail(args: string): Promise<{ code: number; stderr: string }> {
  try {
    await execAsync(`${CLI_PATH} ${args}`);
    throw new Error("Expected CLI command to fail but it succeeded");
  } catch (err: unknown) {
    const error = err as { code: number; stderr: string; message: string };
    if (error.message === "Expected CLI command to fail but it succeeded") throw error;
    return { code: error.code || 1, stderr: error.stderr || "" };
  }
}

// =============================================================================
// Temp File Helpers
// =============================================================================

export class TempFileManager {
  private dir: string = "";
  private files: string[] = [];

  async setup(): Promise<void> {
    this.dir = join(tmpdir(), `neotoma-cross-layer-${Date.now()}`);
    await mkdir(this.dir, { recursive: true });
  }

  async createJson(name: string, content: unknown): Promise<string> {
    const filePath = join(this.dir, name);
    await writeFile(filePath, JSON.stringify(content));
    this.files.push(filePath);
    return filePath;
  }

  async createText(name: string, content: string): Promise<string> {
    const filePath = join(this.dir, name);
    await writeFile(filePath, content);
    this.files.push(filePath);
    return filePath;
  }

  async cleanup(): Promise<void> {
    if (this.dir) {
      await rm(this.dir, { recursive: true, force: true });
    }
  }
}

// =============================================================================
// Result Parsers
// =============================================================================

/**
 * Extract entity IDs from a CLI list result
 */
export function extractEntityIds(result: Record<string, unknown>): string[] {
  const entities = result.entities as Array<{ id: string }> | undefined;
  return entities?.map((e) => e.id) ?? [];
}

/**
 * Extract source ID from a store result
 */
export function extractSourceId(result: Record<string, unknown>): string {
  const id = result.source_id as string | undefined;
  if (!id) throw new Error(`No source_id in result: ${JSON.stringify(result)}`);
  return id;
}

/**
 * Extract entity IDs created during a store operation
 */
export function extractCreatedEntityIds(result: Record<string, unknown>): string[] {
  const entities = result.entities_created as Array<{ id: string }> | undefined;
  return entities?.map((e) => e.id) ?? [];
}
