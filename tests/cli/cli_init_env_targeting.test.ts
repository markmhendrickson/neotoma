import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("CLI init env-target matrix", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("targets project env path when repo root is provided", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-env-project-"));
    const repoRoot = path.join(root, "repo");
    await mkdir(repoRoot, { recursive: true });

    vi.resetModules();
    const { getInitContextStatus } = await import("../../src/cli/index.ts");
    const status = await getInitContextStatus(repoRoot);
    expect(status?.envTarget).toBe("project");
    expect(status?.envFilePath).toBe(path.join(repoRoot, ".env"));
    expect(status?.dataDir).toBe(path.join(repoRoot, "data"));
  });

  it("targets user env path when repo root is not provided", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-env-user-"));
    const home = path.join(root, "home");
    await mkdir(home, { recursive: true });
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);

    vi.resetModules();
    const { getInitContextStatus } = await import("../../src/cli/index.ts");
    const status = await getInitContextStatus(null);
    expect(status?.envTarget).toBe("user");
    expect(status?.envFilePath).toBe(path.join(home, ".config", "neotoma", ".env"));
    expect(status?.dataDir).toBe(path.join(home, "neotoma", "data"));
  });

  it("resolves relative NEOTOMA_DATA_DIR against repo root from project env", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-env-relative-data-"));
    const repoRoot = path.join(root, "repo");
    await mkdir(repoRoot, { recursive: true });
    await writeFile(
      path.join(repoRoot, ".env"),
      "NEOTOMA_DATA_DIR=./custom-data\n"
    );

    vi.resetModules();
    const { getInitContextStatus } = await import("../../src/cli/index.ts");
    const status = await getInitContextStatus(repoRoot);
    expect(status?.envTarget).toBe("project");
    expect(status?.dataDir).toBe(path.join(repoRoot, "custom-data"));
  });

  it("uses default data dir when project env has no NEOTOMA_DATA_DIR", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "neotoma-init-env-default-data-"));
    const repoRoot = path.join(root, "repo");
    await mkdir(repoRoot, { recursive: true });
    await writeFile(path.join(repoRoot, ".env"), "OPENAI_API_KEY=test-key\n");

    vi.resetModules();
    const { getInitContextStatus } = await import("../../src/cli/index.ts");
    const status = await getInitContextStatus(repoRoot);
    expect(status?.dataDir).toBe(path.join(repoRoot, "data"));
  });
});
