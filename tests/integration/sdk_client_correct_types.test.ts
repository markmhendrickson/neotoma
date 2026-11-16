import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

describe("@neotoma/client correction consumer types", () => {
  it("type-checks the committed consumer example", () => {
    let output = "";
    try {
      output = execFileSync(
        process.execPath,
        [
          path.join(root, "node_modules/typescript/bin/tsc"),
          "-p",
          path.join(root, "packages/client/examples/tsconfig.json"),
        ],
        { cwd: root, encoding: "utf8", stdio: "pipe" }
      );
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string };
      output = `FAILED\n${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    expect(output).toBe("");
  }, 120_000);
});
