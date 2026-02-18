import { describe, it, expect, vi } from "vitest";

describe("Debug TTY", () => {
  it("should show isTTY value", () => {
    console.log("=== TTY DEBUG ===");
    console.log("isTTY:", process.stdout.isTTY);
    console.log("typeof isTTY:", typeof process.stdout.isTTY);
    console.log("Boolean(isTTY):", Boolean(process.stdout.isTTY));
    expect(true).toBe(true);
  });

  it("should show process.argv values", () => {
    console.log("=== ARGV DEBUG ===");
    console.log("process.argv:", process.argv);
    console.log("process.argv[0]:", process.argv[0]);
    console.log("process.argv[1]:", process.argv[1]);
    console.log("typeof process.argv[1]:", typeof process.argv[1]);
    expect(true).toBe(true);
  });

  it("should check if CLI module runs as main", async () => {
    console.log("=== BEFORE CLI IMPORT ===");
    console.log("process.argv[1]:", process.argv[1]);

    vi.resetModules();
    console.log("=== IMPORTING CLI ===");
    await import("../../src/cli/index.ts");

    console.log("=== AFTER CLI IMPORT ===");
    expect(true).toBe(true);
  });
});
