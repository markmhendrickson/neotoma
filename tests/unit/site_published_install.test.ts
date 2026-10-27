import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CONNECTIONS } from "../../src/shared/harness_connections";
import {
  PUBLISHED_PACKAGE_VERSION,
  installCommands,
} from "../../frontend/src/components/onepager/onepager_copy";

describe("published package guidance", () => {
  it("keeps served reader and install guidance on the shipped release", () => {
    const root = join(__dirname, "../..");
    const paths = ["README.md", "docs/README.md"];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(relative);
        else if (entry.name.endsWith(".md")) paths.push(relative);
      }
    };
    walk("docs/topics");
    walk("docs/guides/connections");
    for (const path of paths) {
      const text = readFileSync(join(root, path), "utf8");
      expect(text, path).not.toMatch(/neotoma@0\.25\.0|unreleased v0\.26\.0|v0\.26\.0 candidate|v0\.26\.0 candidates are not yet released/i);
    }
    for (const connection of CONNECTIONS)
      expect(connection.evidence.releasePin).toBe("b6ae615964bdc4ac2eed4bbd7b0429c4107afc0d");
  });
  it("pins the public install command to the verified npm release", () => {
    expect(PUBLISHED_PACKAGE_VERSION).toBe("0.26.0");
    expect(installCommands("claude-code")).toContain("npm install -g neotoma@0.26.0");
    expect(installCommands("claude-code")).toContain("neotoma init");
  });
});
