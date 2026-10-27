import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const workflow = YAML.parse(
  readFileSync(resolve(root, ".github/workflows/ci_test_lanes.yml"), "utf-8")
) as {
  jobs: Record<string, { "runs-on": string; steps: Array<{ name?: string; run?: string }> }>;
};

describe("closed site HTTP evaluation CI wiring", () => {
  for (const job of ["eval_scenarios", "eval_combined"]) {
    it(`${job} installs Chromium before building the exact-head site`, () => {
      expect(workflow.jobs[job]["runs-on"]).toBe("ubuntu-24.04");
      const steps = workflow.jobs[job].steps;
      const names = steps.map((step) => step.name);
      const browser = names.indexOf("Install Playwright browser (Chromium)");
      const build = names.indexOf("Build exact-head public site for closed HTTP eval");
      expect(browser).toBeGreaterThan(-1);
      expect(build).toBeGreaterThan(browser);
      expect(steps[browser].run).toContain("playwright install --with-deps chromium");
      expect(steps[build].run).toContain("npm run build:ui");
      expect(steps[build].run).toContain("npm run build:site:pages");
      expect(steps[build].run).toContain("npm run validate:site-export");
    });
  }

  it("the scenario lane explicitly fails if the required site scenario is absent", () => {
    const steps = workflow.jobs.eval_scenarios.steps;
    const run = steps.find((step) => step.name === "Run eval-harness scenarios (replay)")?.run;
    expect(run).toContain("npm run eval:scenarios -- --scenario site_publication_http_contract");
  });
});
