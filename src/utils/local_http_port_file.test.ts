import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  localHttpPortFilePath,
  localHttpPortFilePathForProfile,
  writeLocalHttpPortFile,
  LOCAL_HTTP_PORT_FILE_SEGMENTS,
} from "./local_http_port_file.js";

describe("local_http_port_file", () => {
  it("writes dev port to profile file and legacy path", () => {
    const root = join(tmpdir(), `neotoma-port-file-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      writeLocalHttpPortFile(root, 3181, "development");
      expect(readFileSync(localHttpPortFilePathForProfile(root, "dev"), "utf-8").trim()).toBe(
        "3181"
      );
      expect(readFileSync(localHttpPortFilePath(root), "utf-8").trim()).toBe("3181");
      expect(() => readFileSync(localHttpPortFilePathForProfile(root, "prod"), "utf-8")).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes prod port only to prod profile file (not legacy)", () => {
    const root = join(tmpdir(), `neotoma-port-file-prod-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      writeLocalHttpPortFile(root, 3199, "production");
      expect(readFileSync(localHttpPortFilePathForProfile(root, "prod"), "utf-8").trim()).toBe(
        "3199"
      );
      expect(() => readFileSync(localHttpPortFilePath(root), "utf-8")).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exposes legacy path matching LOCAL_HTTP_PORT_FILE_SEGMENTS", () => {
    const root = join(tmpdir(), `neotoma-port-seg-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      writeLocalHttpPortFile(root, 3080, "development");
      const p = localHttpPortFilePath(root);
      expect(p).toBe(join(root, ...LOCAL_HTTP_PORT_FILE_SEGMENTS));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores invalid ports", () => {
    const root = join(tmpdir(), `neotoma-port-file-bad-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      writeLocalHttpPortFile(root, NaN, "development");
      writeLocalHttpPortFile(root, 0, "development");
      writeLocalHttpPortFile(root, 70000, "development");
      expect(() => readFileSync(localHttpPortFilePathForProfile(root, "dev"), "utf-8")).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("overwrites prior dev content", () => {
    const root = join(tmpdir(), `neotoma-port-file-over-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      writeLocalHttpPortFile(root, 3080, "development");
      writeLocalHttpPortFile(root, 3180, "development");
      expect(readFileSync(localHttpPortFilePathForProfile(root, "dev"), "utf-8").trim()).toBe(
        "3180"
      );
      expect(readFileSync(localHttpPortFilePath(root), "utf-8").trim()).toBe("3180");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
