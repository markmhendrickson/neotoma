/**
 * File StateRepository implementation (FU-051)
 * 
 * File-based state repository using JSON files for state snapshots.
 */

import { promises as fs } from "fs";
import path from "path";
import { getRecordAtTimestamp, replayEvents } from "../../events/replay.js";
import type { StateRepository } from "../interfaces.js";
import type { NeotomaRecord } from "../../db.js";

export class FileStateRepository implements StateRepository {
  private statesDir: string;
  private eventRepository: { getEventsByRecordId(recordId: string): Promise<unknown[]> };

  constructor(
    statesDir: string = "./data/states",
    eventRepository: { getEventsByRecordId(recordId: string): Promise<unknown[]> }
  ) {
    this.statesDir = statesDir;
    this.eventRepository = eventRepository;
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.statesDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's okay
    }
  }

  private getStateFilePath(recordId: string): string {
    return path.join(this.statesDir, `${recordId}.json`);
  }

  async getState(recordId: string): Promise<NeotomaRecord | null> {
    const filePath = this.getStateFilePath(recordId);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as NeotomaRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, try to reconstruct from events
        const events = await this.eventRepository.getEventsByRecordId(recordId);
        if (events.length === 0) {
          return null;
        }
        // Use replay functionality if available
        return replayEvents(recordId);
      }
      throw new Error(`Failed to get state for record ${recordId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getStateAtTimestamp(recordId: string, timestamp: string): Promise<NeotomaRecord | null> {
    // Use event replay for historical state
    return getRecordAtTimestamp(recordId, timestamp);
  }

  async saveState(record: NeotomaRecord): Promise<void> {
    await this.ensureDirectoryExists();

    const filePath = this.getStateFilePath(record.id);
    const content = JSON.stringify(record, null, 2);

    try {
      // Atomic write: write to temp file first, then rename
      const tempPath = filePath + ".tmp";
      await fs.writeFile(tempPath, content, "utf-8");
      await fs.rename(tempPath, filePath);
      
      // Ensure durability with fsync
      const fd = await fs.open(filePath, "r+");
      await fd.sync();
      await fd.close();
    } catch (error) {
      throw new Error(`Failed to save state for record ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getStates(recordIds: string[]): Promise<Map<string, NeotomaRecord | null>> {
    const results = new Map<string, NeotomaRecord | null>();

    // Initialize all IDs as null
    for (const id of recordIds) {
      results.set(id, null);
    }

    // Load states for all record IDs
    await Promise.all(
      recordIds.map(async (id) => {
        try {
          const state = await this.getState(id);
          if (state) {
            results.set(id, state);
          }
        } catch {
          // Error loading state, keep as null
        }
      })
    );

    return results;
  }
}
