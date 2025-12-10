/**
 * File EventRepository implementation (FU-051)
 * 
 * File-based event repository using append-only files.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { StateEvent } from '../../events/event_schema.js';
import { validateEvent } from '../../events/event_validator.js';
import type { EventRepository } from '../interfaces.js';

export class FileEventRepository implements EventRepository {
  private eventsDir: string;

  constructor(eventsDir: string = './data/events') {
    this.eventsDir = eventsDir;
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.eventsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's okay
    }
  }

  private getEventFilePath(recordId?: string | null): string {
    if (recordId) {
      return path.join(this.eventsDir, `record_${recordId}.jsonl`);
    }
    return path.join(this.eventsDir, 'all_events.jsonl');
  }

  async appendEvent(event: Omit<StateEvent, 'created_at'>): Promise<StateEvent> {
    // Validate event before storage
    const validation = validateEvent(event);
    if (!validation.valid) {
      throw new Error(`Event validation failed: ${validation.errors.join(', ')}`);
    }

    await this.ensureDirectoryExists();

    const eventWithTimestamp: StateEvent = {
      ...event,
      created_at: new Date().toISOString(),
    };

    // Append to record-specific file
    const filePath = this.getEventFilePath(event.record_id);
    const line = JSON.stringify(eventWithTimestamp) + '\n';

    try {
      await fs.appendFile(filePath, line, 'utf-8');
      // Ensure durability with fsync
      const fd = await fs.open(filePath, 'r+');
      await fd.sync();
      await fd.close();
    } catch (error) {
      throw new Error(`Failed to append event to file: ${error instanceof Error ? error.message : String(error)}`);
    }

    return eventWithTimestamp;
  }

  async getEventsByRecordId(recordId: string): Promise<StateEvent[]> {
    const filePath = this.getEventFilePath(recordId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter((line) => line.trim());
      
      return lines
        .map((line) => {
          try {
            return JSON.parse(line) as StateEvent;
          } catch {
            return null;
          }
        })
        .filter((event): event is StateEvent => event !== null)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, return empty array
        return [];
      }
      throw new Error(`Failed to read events for record ${recordId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getEventsByTimestampRange(
    startTimestamp: string,
    endTimestamp: string
  ): Promise<StateEvent[]> {
    // For file-based implementation, we need to read all events and filter
    // This is not efficient for large datasets, but sufficient for v0.1.0
    await this.ensureDirectoryExists();

    const events: StateEvent[] = [];

    try {
      const files = await fs.readdir(this.eventsDir);
      
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const filePath = path.join(this.eventsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const event = JSON.parse(line) as StateEvent;
            if (event.timestamp >= startTimestamp && event.timestamp <= endTimestamp) {
              events.push(event);
            }
          } catch {
            // Skip invalid lines
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Failed to read events by timestamp range: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async getAllEvents(limit?: number): Promise<StateEvent[]> {
    await this.ensureDirectoryExists();

    const events: StateEvent[] = [];

    try {
      const files = await fs.readdir(this.eventsDir);
      
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const filePath = path.join(this.eventsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            events.push(JSON.parse(line) as StateEvent);
          } catch {
            // Skip invalid lines
          }

          if (limit && events.length >= limit) {
            break;
          }
        }

        if (limit && events.length >= limit) {
          break;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Failed to read all events: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const sorted = events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    return limit ? sorted.slice(0, limit) : sorted;
  }
}
