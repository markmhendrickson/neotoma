import { describe, it, expect, vi, afterEach } from "vitest";
import { extractUserCliArgs } from "../../src/cli/index.js";

describe("extractUserCliArgs", () => {
  it("strips node + script like process.argv", () => {
    expect(extractUserCliArgs(["node", "/x/neotoma.js", "storage", "info"])).toEqual([
      "storage",
      "info",
    ]);
  });

  it("preserves user-only argv (no false empty slice)", () => {
    expect(extractUserCliArgs(["storage", "info", "--json"])).toEqual(["storage", "info", "--json"]);
  });

  it("treats node.exe basename like node", () => {
    expect(extractUserCliArgs(["/path/to/node.exe", "/path/to/neotoma.js", "help"])).toEqual(["help"]);
  });
});

describe("runCli user-only argv (TTY)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("does not enter interactive session when argv is user-only", async () => {
    vi.resetModules();
    const cli = await import("../../src/cli/index.ts");
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });
    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as NodeJS.WriteStream).write = ((chunk: unknown, ...rest: unknown[]) => {
      chunks.push(String(chunk));
      return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stdout.write;

    try {
      await cli.runCli(["storage", "info", "--json", "--no-log-file"]);
    } finally {
      (process.stdout as NodeJS.WriteStream).write = origWrite;
    }

    const out = chunks.join("");
    expect(out).toContain('"data_dir"');
    expect(out).not.toMatch(/neotoma>\s*$/m);
    expect(out).not.toContain("Nest is warm");
  });
});
