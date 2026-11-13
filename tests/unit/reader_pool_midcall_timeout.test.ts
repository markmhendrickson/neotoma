import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("reader pool timeout never terminates a worker mid native call", () => {
  it("survives a statement timeout during a long read and keeps serving reads", () => {
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", path.resolve("tests/helpers/reader_pool_midcall_timeout_child.ts")],
      { encoding: "utf8", timeout: 170_000 }
    );
    // Old behaviour: terminate() inside the addon -> SIGABRT / exit 134.
    expect({ status: child.status, signal: child.signal }).toEqual({ status: 0, signal: null });
    const line = child.stdout.trim().split("\n").pop() ?? "";
    const result = JSON.parse(line);
    expect(result.timeouts).toBeGreaterThan(0);
    expect(result.after).toEqual({ ok: 1 });
  }, 180_000);
});
