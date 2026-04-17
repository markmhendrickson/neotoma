import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type CliModule = {
  runCli: (argv: string[]) => Promise<void>;
};

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  try {
    return await callback(tempDir);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
}

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

function captureLogs(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    output.push(args.map((arg) => String(arg)).join(" "));
  });
  return { output, restore: () => logSpy.mockRestore() };
}

describe("CLI onboarding commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows preference categories without treating options as a Command", async () => {
    await withTempHome(async () => {
      const { runCli } = await loadCli();
      const stdout = captureLogs();

      try {
        await runCli(["node", "cli", "preferences", "--show", "--no-log-file"]);
      } finally {
        stdout.restore();
      }

      const text = stdout.output.join("");
      expect(text).toContain("Data type preference categories");
      expect(text).toContain("project_files");
    });
  });

  it("runs discover with positional paths and option flags", async () => {
    await withTempHome(async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-discover-"));
      const notesDir = path.join(tempDir, "notes");
      await fs.mkdir(notesDir, { recursive: true });
      await fs.writeFile(path.join(notesDir, "meeting_notes.md"), "# Notes\nImportant discussion\n");

      const { runCli } = await loadCli();
      const stdout = captureLogs();

      try {
        await runCli([
          "node",
          "cli",
          "discover",
          notesDir,
          "--depth",
          "1",
          "--top",
          "5",
          "--output",
          "text",
          "--no-log-file",
        ]);
      } finally {
        stdout.restore();
      }

      const text = stdout.output.join("");
      expect(text).toContain("meeting_notes.md");
      expect(text).toContain("Scanned");
    });
  });

  it("parses a transcript preview with file path and option flags", async () => {
    await withTempHome(async () => {
      const transcriptDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-transcript-"));
      const transcriptPath = path.join(transcriptDir, "meeting_transcript.vtt");
      await fs.writeFile(
        transcriptPath,
        [
          "WEBVTT",
          "",
          "00:00:01.000 --> 00:00:04.000",
          "Alice: Hello there",
          "",
          "00:00:05.000 --> 00:00:07.000",
          "Bob: Hi Alice",
          "",
        ].join("\n"),
      );

      const { runCli } = await loadCli();
      const stdout = captureLogs();

      try {
        await runCli([
          "node",
          "cli",
          "ingest-transcript",
          transcriptPath,
          "--preview",
          "--source",
          "meeting",
          "--no-log-file",
        ]);
      } finally {
        stdout.restore();
      }

      const text = stdout.output.join("");
      expect(text).toContain("Parsed 1 conversation");
      expect(text).toContain("meeting_transcript.vtt");
      expect(text).toContain("Total messages: 2");
    });
  });
});
