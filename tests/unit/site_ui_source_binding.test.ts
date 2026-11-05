import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertTrackedReaderLanguageAsset, currentUiSourceBinding, uncoveredUiModules } from "../../scripts/site_ui_source_binding";

const root = join(__dirname, "../..");

describe("site UI source binding", () => {
  it("covers compiled external source inputs and flags any new root outside the inventory", () => {
    expect(uncoveredUiModules(root, [
      join(root, "openapi_actions.yaml?raw"),
      join(root, "src/crypto/keys.js"),
      join(root, "src/crypto/export.js"),
      join(root, "src/crypto/envelope.js"),
      join(root, "frontend/public/brand/n2-nav-light.svg?raw"),
    ])).toEqual([]);
    expect(uncoveredUiModules(root, [join(root, "outside/new-input.yaml")])).toEqual([
      "outside/new-input.yaml",
    ]);
  });

  it("binds tracked frontend brand assets in a clean checkout before Vite creates public/brand", () => {
    const dir = mkdtempSync(join(tmpdir(), "site-ui-clean-checkout-"));
    try {
      const put = (relative: string, content = "fixture") => {
        const target = join(dir, relative);
        mkdirSync(join(target, ".."), { recursive: true });
        writeFileSync(target, content);
      };
      put("frontend/src/main.tsx");
      put("frontend/public/brand/logo.svg", "tracked brand bytes");
      put("src/crypto/keys.js");
      put("docs/site/pages/en/home.mdx");
      put("docs/legal/privacy.md");
      for (const file of ["frontend/index.html", "openapi_actions.yaml", "vite.config.ts", "package.json", "package-lock.json", "scripts/site_ui_source_binding.ts"])
        put(file);
      put("public/assets/reader-language.js", "tracked reader bytes");
      execFileSync("git", ["init", "-q", dir]);
      execFileSync("git", ["add", "."], { cwd: dir });
      execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"], { cwd: dir });
      expect(() => currentUiSourceBinding(dir)).not.toThrow();
      const before = currentUiSourceBinding(dir).source;
      put("frontend/public/brand/logo.svg", "changed tracked brand bytes");
      expect(currentUiSourceBinding(dir).source).not.toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires the trusted reader enhancement to match the committed source and exported copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "site-ui-binding-"));
    try {
      mkdirSync(join(dir, "assets"));
      const source = readFileSync(join(root, "public/assets/reader-language.js"));
      writeFileSync(join(dir, "assets/reader-language.js"), source);
      expect(() => assertTrackedReaderLanguageAsset(root, dir)).not.toThrow();
      writeFileSync(join(dir, "assets/reader-language.js"), Buffer.concat([source, Buffer.from("\n/* tampered */") ]));
      expect(() => assertTrackedReaderLanguageAsset(root, dir)).toThrow(/Exported reader language asset differs/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
