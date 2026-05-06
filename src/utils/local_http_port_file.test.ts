import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  localHttpPortFilePath,
  writeLocalHttpPortFile,
  LOCAL_HTTP_PORT_FILE_SEGMENTS,
} from "./local_http_port_file.js";

describe("local_http_port_file", () => {
  it("writes port under .dev-serve/local_http_port", () => {
    const root = join(tmpdir(), `neotoma-port-file-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      writeLocalHttpPortFile(root, 3181);
      const p = localHttpPortFilePath(root);
      expect(p).toBe(join(root, ...LOCAL_HTTP_PORT_FILE_SEGMENTS));
      expect(readFileSync(p, "utf-8").trim()).toBe("3181");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores invalid ports", () => {
    const root = join(tmpdir(), `neotoma-port-file-bad-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      writeLocalHttpPortFile(root, NaN);
      writeLocalHttpPortFile(root, 0);
      writeLocalHttpPortFile(root, 70000);
      const p = localHttpPortFilePath(root);
      expect(() => readFileSync(p, "utf-8")).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("overwrites prior content", () => {
    const root = join(tmpdir(), `neotoma-port-file-over-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      writeLocalHttpPortFile(root, 3080);
      writeLocalHttpPortFile(root, 3180);
      expect(readFileSync(localHttpPortFilePath(root), "utf-8").trim()).toBe("3180");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
