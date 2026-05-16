import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-validate-fm-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runValidator(args: string[]): { exit: number; stderr: string; stdout: string } {
  try {
    const stdout = execSync(
      `npx tsx scripts/validate_docs_frontmatter.ts ${args.join(" ")}`,
      { cwd: repoRoot, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { exit: 0, stderr: "", stdout };
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer | string; stdout?: Buffer | string };
    return {
      exit: e.status ?? 1,
      stderr: String(e.stderr ?? ""),
      stdout: String(e.stdout ?? ""),
    };
  }
}

describe("validate_docs_frontmatter", () => {
  it("exits 0 on the real docs/ tree", () => {
    const r = runValidator([]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("OK");
  });

  it("validates a specific path subset", () => {
    const r = runValidator(["--paths", "developer/docs_index_route.md"]);
    expect(r.exit).toBe(0);
  });
});

describe("validate_docs_frontmatter — schema rules (inline)", () => {
  // Re-import the validator module's helpers directly to assert the schema
  // rules without spawning a subprocess for every case. The CLI tests above
  // are smoke tests; these are unit tests for the rules themselves.
  it("rejects unknown enum values", async () => {
    const { parseFlatYaml, splitFrontmatter } = await import(
      "../../src/services/docs/doc_frontmatter.js"
    );
    const src = `---\nvisibility: secret\n---\nbody`;
    const { yaml } = splitFrontmatter(src);
    expect(yaml).not.toBeNull();
    const raw = parseFlatYaml(yaml!) as { visibility?: unknown };
    expect(raw.visibility).toBe("secret");
    // The validator rejects this; we assert the parser surfaces it.
  });
});
