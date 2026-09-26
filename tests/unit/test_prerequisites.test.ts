/**
 * Covers the named-skip contract from issue #2090.
 *
 * The acceptance criterion is not "these suites stop failing" — it is that a
 * missing hard prerequisite produces a skip whose REASON is visible in the run
 * output and names both the prerequisite and its remediation. A silent skip is
 * out of contract, and is exactly what these assertions exist to prevent
 * someone from quietly introducing later.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILT_CURSOR_HOOK_PACKAGE,
  BUILT_INSPECTOR_ASSETS,
  INSTALLED_INSPECTOR_DEPS,
  REPO_ROOT,
  hasPrerequisite,
  skipReason,
  type Prerequisite,
} from "../helpers/test_prerequisites.js";

const ALL: readonly Prerequisite[] = [
  BUILT_INSPECTOR_ASSETS,
  INSTALLED_INSPECTOR_DEPS,
  BUILT_CURSOR_HOOK_PACKAGE,
];

describe("test prerequisites — skip-reason contract (#2090)", () => {
  it("every reason names the prerequisite and a remediation command", () => {
    for (const prereq of ALL) {
      const reason = skipReason(prereq);
      expect(reason).toContain("missing prerequisite: ");
      expect(reason).toContain(prereq.name);
      expect(reason).toContain(prereq.remediation);
      // An em-dash separator keeps the two halves greppable apart.
      expect(reason).toMatch(/^missing prerequisite: .+ — .+$/);
    }
  });

  it("no reason is vague — each remediation is a runnable command", () => {
    for (const prereq of ALL) {
      expect(prereq.remediation).toMatch(/npm /);
      expect(prereq.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("names are distinct so triage can grep one cluster at a time", () => {
    expect(new Set(ALL.map((p) => p.name)).size).toBe(ALL.length);
  });
});

describe("test prerequisites — probe behavior", () => {
  it("reports absent against an empty tree", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-prereq-"));
    try {
      for (const prereq of ALL) {
        expect(hasPrerequisite(prereq, empty)).toBe(false);
      }
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("reports present once the probe path exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-prereq-"));
    try {
      const target = path.join(root, BUILT_CURSOR_HOOK_PACKAGE.probePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "");
      expect(hasPrerequisite(BUILT_CURSOR_HOOK_PACKAGE, root)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("REPO_ROOT resolves to the checkout containing package.json", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "package.json"))).toBe(true);
  });
});

describe("dist/ fast-fail guard (#2090 AC 3)", () => {
  it("global setup refuses on a missing dist/ and names the fix command", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "vitest.global_setup.ts"), "utf-8");
    // The exact operator-facing string, asserted here so a reword cannot land
    // without someone deciding to reword it.
    expect(source).toContain("[neotoma] dist/ is missing. Run `npm test`");
    expect(source).toContain("npm run build:server");
    // Must probe the real server entrypoint, and must run before any suite.
    expect(source).toContain('path.join(projectRoot, "dist", "index.js")');
    expect(source).toContain("requireBuiltServer(projectRoot);");
  });

  it("the guard does not conflate the server dist with the inspector dist", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "vitest.global_setup.ts"), "utf-8");
    const guard = source.slice(
      source.indexOf("function requireBuiltServer"),
      source.indexOf("function announceMissingPrerequisites")
    );
    // A present dist/index.js with an absent dist/inspector/ must NOT trip the
    // hard guard — the inspector is a named skip, not a fatal prerequisite.
    expect(guard).not.toContain("inspector");
  });
});
