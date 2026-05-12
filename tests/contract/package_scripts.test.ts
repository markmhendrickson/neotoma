import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const inspectorPkg = JSON.parse(
  readFileSync(join(ROOT, "inspector", "package.json"), "utf-8"),
);

describe("package.json UI scripts", () => {
  it("pins the app build to vite.config.ts", () => {
    expect(pkg.scripts["build:ui"]).toContain("--config vite.config.ts");
    expect(pkg.scripts["build:ui"]).not.toContain("vite.config.js");
  });

  it("pins the app dev server to vite.config.ts", () => {
    expect(pkg.scripts["dev:ui"]).toContain("--config vite.config.ts");
    expect(pkg.scripts["dev:ui"]).not.toContain("vite.config.js");
  });

  it("pins Inspector Vite entrypoints to vite.config.ts", () => {
    for (const scriptName of ["dev:vite", "build:vite", "build:watch", "preview"]) {
      expect(inspectorPkg.scripts[scriptName]).toContain("--config vite.config.ts");
      expect(inspectorPkg.scripts[scriptName]).not.toContain("vite.config.js");
    }
  });
});
