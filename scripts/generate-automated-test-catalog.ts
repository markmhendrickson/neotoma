#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "docs", "testing", "automated_test_catalog.md");

type SuiteMeta = {
  title: string;
  directory: string;
  runner: string;
  command: string;
  requirements: string;
};

const orderedSuiteKeys = [
  "tests/unit",
  "tests/services",
  "src",
  "tests/integration",
  "tests/integration/release",
  "tests/cli",
  "tests/contract",
  "tests/security",
  "tests/subscriptions",
  "tests/agent",
  "tests/fixtures",
  "tests/helpers",
  "tests/shared",
  "frontend/src",
  "playwright/tests",
  "playwright/tests/inspector",
] as const;

const suiteMeta: Record<string, SuiteMeta> = {
  "tests/unit": {
    title: "Vitest unit tests",
    directory: "`tests/unit/`",
    runner: "`vitest`",
    command: "`npm test -- tests/unit`",
    requirements: "Basic `.env` if required by the module under test.",
  },
  "tests/services": {
    title: "Vitest service tests",
    directory: "`tests/services/`",
    runner: "`vitest`",
    command: "`npm test -- tests/services`",
    requirements: "Basic `.env` if required by the module under test.",
  },
  src: {
    title: "Source-adjacent tests",
    directory: "`src/**/__tests__/` and `src/**/*.test.ts(x)`",
    runner: "`vitest`",
    command: "`npm test -- src`",
    requirements: "Basic `.env` if required by the module under test.",
  },
  "tests/integration": {
    title: "Vitest integration tests",
    directory: "`tests/integration/`",
    runner: "`vitest`",
    command: "`npm run test:integration` or `npx vitest run tests/integration`",
    requirements: "Database configured; remote-dependent subsets additionally need `RUN_REMOTE_TESTS=1`.",
  },
  "tests/integration/release": {
    title: "Vitest release integration tests",
    directory: "`tests/integration/release/`",
    runner: "`vitest`",
    command: "`npx vitest run tests/integration/release`",
    requirements: "Same requirements as integration tests.",
  },
  "tests/cli": {
    title: "Vitest CLI tests",
    directory: "`tests/cli/`",
    runner: "`vitest`",
    command: "`npm test -- tests/cli`",
    requirements: "Basic `.env`; some tests provision temp config homes automatically.",
  },
  "tests/contract": {
    title: "Vitest contract tests",
    directory: "`tests/contract/`",
    runner: "`vitest`",
    command: "`npm test -- tests/contract`",
    requirements: "Generated contract artifacts present when the suite expects them.",
  },
  "tests/security": {
    title: "Vitest security tests",
    directory: "`tests/security/`",
    runner: "`vitest`",
    command: "`npx vitest run tests/security`",
    requirements: "Use alongside the dedicated security validation scripts when changing auth or route protection.",
  },
  "tests/subscriptions": {
    title: "Vitest subscription tests",
    directory: "`tests/subscriptions/`",
    runner: "`vitest`",
    command: "`npx vitest run tests/subscriptions`",
    requirements: "Basic `.env`; some tests start an in-process HTTP server.",
  },
  "tests/agent": {
    title: "Vitest agent tests",
    directory: "`tests/agent/`",
    runner: "`vitest`",
    command: "`npm run test:agent-mcp`",
    requirements: "Agent/provider-specific environment may be required for non-skipped cases.",
  },
  "tests/fixtures": {
    title: "Vitest fixture tests",
    directory: "`tests/fixtures/`",
    runner: "`vitest`",
    command: "`npx vitest run tests/fixtures`",
    requirements: "Fixture files present in the repo checkout.",
  },
  "tests/helpers": {
    title: "Vitest helper tests",
    directory: "`tests/helpers/`",
    runner: "`vitest`",
    command: "`npx vitest run tests/helpers`",
    requirements: "Helper-specific fixtures present in the repo checkout.",
  },
  "tests/shared": {
    title: "Vitest shared-environment tests",
    directory: "`tests/shared/`",
    runner: "`vitest`",
    command: "`npx vitest run tests/shared`",
    requirements: "Basic `.env`.",
  },
  "frontend/src": {
    title: "Frontend Vitest tests",
    directory: "`frontend/src/`",
    runner: "`vitest` with `jsdom`",
    command: "`npm run test:frontend`",
    requirements: "Run with `RUN_FRONTEND_TESTS=1` or the dedicated script.",
  },
  "playwright/tests": {
    title: "Playwright E2E tests",
    directory: "`playwright/tests/`",
    runner: "`playwright`",
    command: "`npm run test:e2e`",
    requirements: "Playwright browsers installed; mock or real API configured per suite.",
  },
  "playwright/tests/inspector": {
    title: "Playwright Inspector E2E tests",
    directory: "`playwright/tests/inspector/`",
    runner: "`playwright`",
    command: "`npm run test:e2e:inspector`",
    requirements: "Inspector bundle built before execution.",
  },
};

function walk(relativeDir: string): string[] {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const out: string[] = [];
  const stack = [absoluteDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      out.push(path.relative(repoRoot, absolute).split(path.sep).join("/"));
    }
  }
  return out;
}

function isAutomatedTestFile(relativePath: string): boolean {
  if (relativePath.startsWith("playwright/tests/")) return relativePath.endsWith(".spec.ts");
  if (relativePath.startsWith("frontend/src/")) return /\.(test|spec)\.tsx?$/.test(relativePath);
  if (relativePath.startsWith("tests/") || relativePath.startsWith("src/")) {
    return /\.(test|spec)\.tsx?$/.test(relativePath);
  }
  return false;
}

function getSuiteKey(relativePath: string): string {
  if (relativePath.startsWith("playwright/tests/inspector/")) return "playwright/tests/inspector";
  if (relativePath.startsWith("playwright/tests/")) return "playwright/tests";
  if (relativePath.startsWith("frontend/src/")) return "frontend/src";
  if (relativePath.startsWith("tests/integration/release/")) return "tests/integration/release";
  if (relativePath.startsWith("src/")) return "src";
  if (relativePath.startsWith("tests/")) {
    const parts = relativePath.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "tests";
  }
  return "other";
}

function titleFromKey(key: string): string {
  const parts = key.split("/");
  return parts
    .map((part) => part.replace(/[-_]/g, " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function scanTestFiles(): string[] {
  const roots = ["tests", "src", "frontend/src", "playwright/tests"];
  const files = roots.flatMap(walk).filter(isAutomatedTestFile);
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

function buildSuiteInventory(testFiles: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const file of testFiles) {
    const key = getSuiteKey(file);
    const current = grouped.get(key) ?? [];
    current.push(file);
    grouped.set(key, current);
  }
  for (const files of grouped.values()) files.sort((a, b) => a.localeCompare(b));
  return grouped;
}

function orderedKeys(grouped: Map<string, string[]>): string[] {
  const preferred = [...orderedSuiteKeys].filter((key) => grouped.has(key));
  const extras = [...grouped.keys()]
    .filter((key) => !preferred.includes(key as (typeof orderedSuiteKeys)[number]))
    .sort((a, b) => a.localeCompare(b));
  return [...preferred, ...extras];
}

function renderSuiteSection(key: string, files: string[]): string {
  const meta = suiteMeta[key] ?? {
    title: titleFromKey(key),
    directory: `\`${key}/\``,
    runner: "`vitest`",
    command: `\`npx vitest run ${key}\``,
    requirements: "Basic `.env` if required by the module under test.",
  };

  return [
    `### ${meta.title}`,
    `**Directory:** ${meta.directory}`,
    `**Runner:** ${meta.runner}`,
    `**Command:** ${meta.command}`,
    `**Requirements:** ${meta.requirements}`,
    `**Files (${files.length}):**`,
    ...files.map((file) => `- \`${file}\``),
    "",
  ].join("\n");
}

function generateCatalog(): string {
  const testFiles = scanTestFiles();
  const grouped = buildSuiteInventory(testFiles);
  const suiteKeys = orderedKeys(grouped);

  const repoVitestCount = testFiles.filter(
    (file) => file.startsWith("tests/") || file.startsWith("src/"),
  ).length;
  const frontendCount = testFiles.filter((file) => file.startsWith("frontend/src/")).length;
  const playwrightCount = testFiles.filter((file) => file.startsWith("playwright/tests/")).length;

  const suiteSummaryLines = suiteKeys.map((key) => {
    const title = suiteMeta[key]?.title ?? titleFromKey(key);
    return `| ${title} | ${grouped.get(key)?.length ?? 0} |`;
  });

  return [
    "# Automated test catalog",
    "## Scope",
    "This document summarizes repo-wide automated test coverage and inventories every automated test file in the repository. It does not define test-writing standards, fixture rules, or route coverage policy.",
    "",
    "## Purpose",
    "Provide one canonical markdown source for what automated tests exist, how the major suites are run, and which validation commands keep the catalog current.",
    "",
    "## Scope",
    "This document covers:",
    "- Repo-wide automated test inventory",
    "- High-level suite and runner breakdowns",
    "- Primary local and CI validation commands",
    "- Catalog maintenance workflow",
    "",
    "This document does not cover:",
    "- Test quality policy",
    "- Fixture design standards",
    "- Feature-specific testing strategy",
    "- Historical audit narratives",
    "",
    "## Invariants",
    "1. Every automated test file in the repo must appear in this catalog.",
    "2. This catalog is generated from the repository tree, not maintained by hand.",
    "3. When test files, suite directories, or validation lanes change, the catalog must be regenerated in the same change.",
    "4. Policy changes belong in `docs/testing/testing_standard.md`; inventory changes belong here.",
    "",
    "## Definitions",
    "- **Automated test file**: A repo test source matched by this catalog's scanner (`tests/**`, `src/**`, `frontend/src/**`, `playwright/tests/**`).",
    "- **Catalog generator**: `scripts/generate-automated-test-catalog.ts`, the only source allowed to rewrite this file.",
    "- **Catalog validator**: `npm run validate:test-catalog`, which fails when this file drifts from the repo tree.",
    "",
    "## Data models or schemas",
    "None.",
    "",
    "## Flows or sequences",
    "1. Change or add tests.",
    "2. Run `npm run generate:test-catalog`.",
    "3. Review the generated markdown diff.",
    "4. Run `npm run validate:test-catalog`.",
    "",
    "```mermaid",
    "flowchart TD",
    "    ChangeTests[ChangeTests] --> GenerateCatalog[GenerateCatalog]",
    "    GenerateCatalog --> ReviewDiff[ReviewDiff]",
    "    ReviewDiff --> ValidateCatalog[ValidateCatalog]",
    "```",
    "",
    "## Examples",
    "- Add `tests/integration/new_feature.test.ts` -> regenerate the catalog so the new file appears under the integration suite.",
    "- Rename `tests/cli/old_name.test.ts` -> regenerate the catalog so the old path disappears and the new path appears.",
    "- Add a new CI lane for tests -> update this document's command summary and run the validator.",
    "",
    "## Testing requirements",
    "- `npm run generate:test-catalog` must be run when automated test inventory changes.",
    "- `npm run validate:test-catalog` must pass before merge.",
    "- CI runs `npm run validate:test-catalog` in the baseline lane.",
    "",
    "## Maintenance",
    "- Canonical policy doc: `docs/testing/testing_standard.md`.",
    "- Historical audit doc: `docs/testing/test_coverage_audit_summary.md`.",
    "- Do not hand-edit suite inventory entries in this file. Update the generator or the repository tree, then regenerate.",
    "",
    "## Repo-wide summary",
    `- Total automated test files: **${testFiles.length}**`,
    `- Backend and repo Vitest files: **${repoVitestCount}**`,
    `- Frontend Vitest files: **${frontendCount}**`,
    `- Playwright spec files: **${playwrightCount}**`,
    "",
    "### Suite counts",
    "| Suite | Files |",
    "|---|---:|",
    ...suiteSummaryLines,
    "",
    "## Primary validation commands",
    "- `npm test`",
    "- `npm run test:frontend`",
    "- `npm run test:remote:critical`",
    "- `npm run test:agent-mcp`",
    "- `npm run validate:coverage`",
    "- `npm run validate:test-catalog`",
    "- `npm run validate:doc-deps`",
    "",
    "## CI lanes",
    "- Baseline CI runs `type-check`, `lint`, `lint:site-copy`, `npm test`, `validate:coverage`, `validate:test-catalog`, and `validate:doc-deps`.",
    "- Frontend CI runs `npm run test:frontend`.",
    "- Site/export CI runs route, locale, and export validation tasks.",
    "- Remote integration nightly runs `npm run test:remote:critical` when enabled.",
    "",
    "## Automated test suites",
    ...suiteKeys.flatMap((key) => [renderSuiteSection(key, grouped.get(key) ?? [])]),
    "## Agent instructions",
    "### When to load this document",
    "Load this document when adding, removing, moving, or renaming automated tests, or when changing test commands or CI lanes.",
    "",
    "### Required co-loaded documents",
    "- `docs/testing/testing_standard.md`",
    "- `docs/conventions/documentation_standards.md`",
    "",
    "### Constraints agents must enforce",
    "1. Regenerate this document when automated test inventory changes.",
    "2. Validate this document before completing test-related changes.",
    "3. Keep policy changes in `testing_standard.md`, not in the generated inventory sections here.",
    "",
    "### Validation checklist",
    "- [ ] Test inventory regenerated after test-file changes",
    "- [ ] `npm run validate:test-catalog` passed",
    "- [ ] Related policy docs updated if commands or CI lanes changed",
    "",
  ].join("\n");
}

function main(): void {
  const next = generateCatalog();
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  const checkOnly = process.argv.includes("--check");

  if (checkOnly) {
    if (current === next) {
      console.log("✅ Automated test catalog is up to date.");
      return;
    }
    console.error("❌ Automated test catalog is stale. Run `npm run generate:test-catalog`.");
    process.exit(1);
  }

  fs.writeFileSync(outputPath, next);
  console.log(`✅ Wrote automated test catalog to ${path.relative(repoRoot, outputPath)}`);
}

main();
