import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Regression tests for the Windows `spawn EINVAL` fix (#1676).
 *
 * On Windows, spawning a `.cmd` shim (npm.cmd, npx.cmd, claude.cmd, ...) without
 * `shell: true` throws EINVAL since the CVE-2024-27980 Node patch. These helpers
 * must request shell mode on win32 and only on win32.
 */

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

afterEach(() => {
  Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM, configurable: true });
  vi.resetModules();
});

describe("spawn_platform", () => {
  it("WIN_SHELL.shell is true on win32", async () => {
    setPlatform("win32");
    vi.resetModules();
    const { WIN_SHELL, IS_WINDOWS, shellOnWin } = await import("./spawn_platform.js");
    expect(IS_WINDOWS).toBe(true);
    expect(WIN_SHELL.shell).toBe(true);
    expect(shellOnWin()).toBe(true);
  });

  it("WIN_SHELL.shell is false on non-Windows platforms", async () => {
    setPlatform("linux");
    vi.resetModules();
    const { WIN_SHELL, IS_WINDOWS, shellOnWin } = await import("./spawn_platform.js");
    expect(IS_WINDOWS).toBe(false);
    expect(WIN_SHELL.shell).toBe(false);
    expect(shellOnWin()).toBe(false);

    setPlatform("darwin");
    vi.resetModules();
    const macImport = await import("./spawn_platform.js");
    expect(macImport.WIN_SHELL.shell).toBe(false);
    expect(macImport.shellOnWin()).toBe(false);
  });

  it("WIN_SHELL spreads a shell flag into a spawn options object", async () => {
    setPlatform("win32");
    vi.resetModules();
    const { WIN_SHELL } = await import("./spawn_platform.js");
    const opts = { cwd: "/x", stdio: "inherit" as const, ...WIN_SHELL };
    expect(opts).toMatchObject({ cwd: "/x", stdio: "inherit", shell: true });
  });
});
