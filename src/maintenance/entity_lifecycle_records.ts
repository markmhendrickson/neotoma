/** Protected non-overwriting attempt/outcome records. No record asserts commit authority. */
import { openSync, writeSync, fsyncSync, closeSync, constants, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { refuse, protectedDirectory, outputPath } from "./entity_lifecycle_manifest.js";
export class ExecutorRecords {
  private readonly fd: number;
  readonly reference = randomUUID();
  private closed = false;
  constructor(
    private readonly output: string,
    directory: string,
    initial: unknown
  ) {
    protectedDirectory(directory);
    outputPath(output, directory);
    if (existsSync(output) || existsSync(output + ".attempt.jsonl"))
      refuse("recording_unavailable");
    let opened: number | undefined;
    try {
      opened = openSync(
        output + ".attempt.jsonl",
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_APPEND |
          constants.O_NOFOLLOW,
        0o600
      );
      this.fd = opened;
      this.append({
        version: "entity_lifecycle_attempt_v1",
        reference: this.reference,
        phase: "prepared",
        initial,
      });
      this.syncDirectory();
    } catch {
      if (opened !== undefined) {
        try {
          closeSync(opened);
        } catch {
          /* Preserve refusal. */
        }
      }
      refuse("recording_unavailable");
    }
  }
  append(value: unknown): void {
    if (this.closed) refuse("recording_unavailable");
    const bytes = Buffer.from(JSON.stringify(value) + "\n");
    let offset = 0;
    while (offset < bytes.length) {
      const n = writeSync(this.fd, bytes, offset, bytes.length - offset);
      if (n <= 0) refuse("recording_unavailable");
      offset += n;
    }
    fsyncSync(this.fd);
  }
  finish(outcome: unknown): void {
    this.append({ phase: "outcome", outcome });
    let fd: number | undefined;
    try {
      fd = openSync(
        this.output,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600
      );
      const bytes = Buffer.from(JSON.stringify(outcome, null, 2));
      let offset = 0;
      while (offset < bytes.length) {
        const n = writeSync(fd, bytes, offset, bytes.length - offset);
        if (n <= 0) refuse("recording_unavailable");
        offset += n;
      }
      fsyncSync(fd);
      this.syncDirectory();
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  close(): void {
    if (!this.closed) {
      closeSync(this.fd);
      this.closed = true;
    }
  }
  private syncDirectory(): void {
    const fd = openSync(dirname(this.output), constants.O_RDONLY);
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
