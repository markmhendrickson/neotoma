import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getUserLevelConfigPaths } from "../../src/cli/mcp_config_scan.js";

describe("getUserLevelConfigPaths Claude Desktop label", () => {
  const originalAppdata = process.env.APPDATA;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalAppdata === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = originalAppdata;
  });

  it.each(["darwin", "linux", "win32"] as const)(
    "labels claude_desktop_config.json as Claude Desktop on %s",
    (platform) => {
      vi.spyOn(os, "platform").mockReturnValue(platform);
      vi.spyOn(os, "homedir").mockReturnValue("/home/test");
      if (platform === "win32") process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";

      const entries = getUserLevelConfigPaths().filter((e) =>
        e.path.endsWith("claude_desktop_config.json")
      );

      expect(entries.length).toBe(1);
      for (const entry of entries) {
        expect(entry.env).toBe("Claude Desktop");
      }
      expect(getUserLevelConfigPaths().some((e) => e.env === "Claude Code")).toBe(false);
    }
  );
});
