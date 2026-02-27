import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Command Detection Debug", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should trace command detection", async () => {
    // Mock process.stdout.isTTY to prevent session mode
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      writable: true,
      configurable: true,
    });

    // Capture ALL stdout
    const stdoutWrites: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    }) as any;

    try {
      vi.resetModules();
      const cli = await import("../../src/cli/index.ts");

      // Call runCli with a command
      const testArgv = ["node", "cli", "entities", "list", "--json"];
      console.log("=== CALLING runCli WITH ===");
      console.log(JSON.stringify(testArgv));
      await cli.runCli(testArgv).catch((err) => {
        console.log("=== ERROR IN runCli ===");
        console.log(String(err));
      });

      // Check what was written to stdout
      const allOutput = stdoutWrites.join("");

      // Log captured console output
      const consoleLogCalls = consoleLogSpy.mock.calls.map(c => c.join(" ")).join("\n");
      const consoleErrorCalls = consoleErrorSpy.mock.calls.map(c => c.join(" ")).join("\n");

      // Use process.stderr to bypass our mocks
      process.stderr.write("=== CONSOLE.LOG CALLS ===\n");
      process.stderr.write(consoleLogCalls + "\n");
      process.stderr.write("=== CONSOLE.ERROR CALLS ===\n");
      process.stderr.write(consoleErrorCalls + "\n");
      process.stderr.write("=== STDOUT OUTPUT ===\n");
      process.stderr.write(allOutput + "\n");
      process.stderr.write("=== END OUTPUT ===\n");

      // Check if session started
      expect(allOutput).not.toContain("Nest is warm");
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it("should not enter session for --version (TTY)", async () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });

    const stdoutWrites: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    }) as any;

    try {
      vi.resetModules();
      const cli = await import("../../src/cli/index.ts");

      await cli.runCli(["node", "cli", "--version", "--no-log-file"]);

      const out = stdoutWrites.join("");
      expect(out).toMatch(/\d+\.\d+\.\d+/);
      expect(out).not.toContain("Nest is warm");
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it("should not enter session for --help (TTY)", async () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });

    const stdoutWrites: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      stdoutWrites.push(String(chunk));
      return true;
    }) as any;

    try {
      vi.resetModules();
      const cli = await import("../../src/cli/index.ts");

      await cli.runCli(["node", "cli", "--help", "--no-log-file"]);

      const out = stdoutWrites.join("");
      expect(out).toContain("Usage:");
      expect(out).not.toContain("Nest is warm");
    } finally {
      process.stdout.write = origWrite;
    }
  });
});
