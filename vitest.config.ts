import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const frontendSrc = path.resolve(__dirname, "./frontend/src");
const inspectorSrc = path.resolve(__dirname, "./inspector/src");

/** When set to "1", run remote-dependent tests. Default: local-only (SQLite). */
const runRemoteTests = process.env.RUN_REMOTE_TESTS === "1";

/** When set to "1", run React/frontend tests (jsdom). Default: excluded to avoid ESM/worker issues in default run. */
const runFrontendTests = process.env.RUN_FRONTEND_TESTS === "1";

/** When set to "1", write Markdown run reports under `.vitest/reports/` via `vitest.markdown_reporter.ts`. */
const writeTestRunReport = process.env.WRITE_TEST_RUN_REPORT === "1";

/** When set to "1", run performance benchmarks under tests/performance/. Default: excluded — they seed large datasets and are slow, so they stay out of the default `npm test` lane. Run via `npm run test:bench`. */
const runBench = process.env.RUN_BENCH === "1";

/**
 * `inspector/` is a standalone package, not an npm workspace member, so a root
 * `npm ci` does not install its dependencies. Its unit tests import modules
 * that reach `@xyflow/react`, `@tanstack/react-query` and `lucide-react`, which
 * then fail at MODULE LOAD — before any `describe` body runs, so an in-file
 * `skipIf` cannot help. Excluding them is therefore the only way to skip rather
 * than fail on a fresh clone (issue #2090).
 *
 * The skip is NOT silent: `vitest.global_setup.ts` prints the named reason and
 * the `npm ci --prefix inspector` remediation on every run that lacks the deps.
 * Install them and these suites run again with no flag to remember.
 */
const hasInspectorDeps = fs.existsSync(path.resolve(__dirname, "./inspector/node_modules"));

export default defineConfig({
  plugins: [
    {
      name: "prefer-ts-source-for-js-specifiers",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer || !source.endsWith(".js") || !source.startsWith(".")) {
          return null;
        }
        const sourcePath = path.resolve(path.dirname(importer), source);
        const tsPath = sourcePath.replace(/\.js$/, ".ts");
        if (fs.existsSync(tsPath)) {
          return tsPath;
        }
        return null;
      },
    },
    { ...mdx({ providerImportSource: "@mdx-js/react" }), enforce: "pre" },
    react(),
  ],
  server: {
    fs: {
      allow: ["."],
    },
  },
  resolve: {
    alias: [
      // `@/...` is an alias in BOTH frontend/ and inspector/, each pointing at
      // its OWN src/. A single static replacement can only serve one tree: with
      // `@` hardwired to frontend/src, every inspector test whose module graph
      // reached an `@/...` specifier failed to resolve
      // (`Cannot find package '@/hooks/use_infra'`). Resolve by the IMPORTER's
      // location so each tree gets its own `@`, and keep frontend/src as the
      // default for every other importer.
      {
        find: /^@\//,
        replacement: "@/",
        customResolver(source, importer) {
          const target =
            importer && path.resolve(importer).startsWith(inspectorSrc + path.sep)
              ? inspectorSrc
              : frontendSrc;
          const base = path.join(target, source.slice(2));
          for (const candidate of [
            base,
            `${base}.ts`,
            `${base}.tsx`,
            path.join(base, "index.ts"),
            path.join(base, "index.tsx"),
          ]) {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
          }
          return base;
        },
      },
      { find: "@shared", replacement: path.resolve(__dirname, "./src/shared") },
      {
        find: "@neotoma/client",
        replacement: path.resolve(__dirname, "./packages/client/src/index.ts"),
      },
      {
        find: "@neotoma/agent",
        replacement: path.resolve(__dirname, "./packages/agent/src/index.ts"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    // Run test FILES sequentially (one worker), not in parallel across processes.
    // The suite shares a single on-disk SQLite DB (config.sqlitePath) and a single
    // global HTTP server; parallel workers racing ensureSchema's DDL transaction
    // hit SQLITE_BUSY_SNAPSHOT (a write-write snapshot conflict busy_timeout can't
    // retry), producing nondeterministic "database is locked" failures. Serializing
    // file execution removes the race. Within-file order is already deterministic.
    fileParallelism: false,
    include: [
      "src/**/*.test.ts",
      "src/**/*.spec.ts",
      "tests/**/*.test.ts",
      "tests/**/*.spec.ts",
      "frontend/src/**/*.test.ts",
      "frontend/src/**/*.spec.ts",
      "frontend/src/**/*.test.tsx",
      "frontend/src/**/*.spec.tsx",
      "inspector/src/**/*.test.ts",
      "inspector/src/**/*.spec.ts",
    ],
    environmentMatchGlobs: [
      ["frontend/src/**/*.test.tsx", "jsdom"],
      ["frontend/src/**/*.test.ts", "jsdom"],
    ],
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest.global_setup.ts"],
    reporters: writeTestRunReport ? ["default", "./vitest.markdown_reporter.ts"] : ["default"],
    env: {
      NODE_ENV: "test",
    },
    exclude: [
      ...configDefaults.exclude,
      "playwright/tests/**/*",
      // Backup folders (do not run tests from data.backup.* or data_backups/)
      "data.backup.*/**",
      "data_backups/**",
      // Imported app tests (data/imports): run only with RUN_REMOTE_TESTS=1
      ...(!runRemoteTests ? ["data/imports/**"] : []),
      // Performance benchmarks: slow, seed large datasets. Run only with RUN_BENCH=1.
      ...(!runBench ? ["tests/performance/**"] : []),
      // Integration/service tests that fail on local SQLite (run with RUN_REMOTE_TESTS=1)
      ...(!runRemoteTests
        ? [
            "tests/integration/cross_instance_issues.test.ts",
            "tests/integration/entity_queries.test.ts",
            "tests/integration/field_converters.test.ts",
            "tests/integration/gdpr_deletion.test.ts",
            "tests/integration/llm_extraction.test.ts",
            "tests/integration/mcp_actions_matrix.test.ts",
            "tests/integration/mcp_auto_enhancement.test.ts",
            "tests/integration/mcp_auto_schema_creation.test.ts",
            "tests/integration/mcp_entity_creation.test.ts",
            "tests/integration/mcp_resources.test.ts",
            "tests/integration/mcp_schema_actions.test.ts",
            "tests/integration/mcp_store_parquet.test.ts",
            "tests/integration/mcp_store_unstructured.test.ts",
            "tests/integration/observation_ingestion.test.ts",
            "tests/integration/relationship_snapshots.test.ts",
            "tests/integration/schema_recommendation_integration.test.ts",
            "tests/services/auto_enhancement_converter_detection.test.ts",
            "tests/services/auto_enhancement_processor.test.ts",
          ]
        : []),
      // Tests for modules not yet implemented or with load errors
      "tests/services/payload_identity.test.ts",
      "tests/services/payload_schema.test.ts",
      "tests/services/schema_recommendation.test.ts",
      "tests/integration/payload_compiler.test.ts",
      "tests/integration/payload/payload_submission.test.ts",
      // React/frontend tests: run only with RUN_FRONTEND_TESTS=1 (jsdom, optional)
      ...(!runFrontendTests ? ["frontend/src/**/*.test.ts", "frontend/src/**/*.test.tsx"] : []),
      // Inspector unit tests when inspector/node_modules is absent — see
      // `hasInspectorDeps` above. Reason is announced in global setup.
      ...(!hasInspectorDeps ? ["inspector/src/**/*.test.ts", "inspector/src/**/*.spec.ts"] : []),
      // Known-bad: jsdom worker ESM/require error (html-encoding-sniffer)
      "frontend/src/components/SchemaDetail.test.tsx",
    ],
    testTimeout: 60000, // Increased timeout for integration tests
    hookTimeout: 30000,
    // parquet-wasm ships a node/ entry that uses `module.exports` (CJS) despite
    // the package declaring `"type": "module"`.  Tell Vite's SSR runtime to
    // leave it alone rather than try to re-process it.
    server: {
      deps: {
        external: [/parquet-wasm/],
      },
    },
    // Sequential execution for integration tests (avoid DB conflicts)
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        ...configDefaults.exclude,
        "dist/**",
        "frontend/.vite/**",
        "scripts/**",
        "playwright/**",
        "**/*.config.*",
        "**/*.setup.*",
        "tests/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      // Critical path files require 100% coverage
      include: [
        "src/services/entity_resolution.ts",
        "src/services/event_generation.ts",
        "src/services/graph_builder.ts",
        "src/services/file_analysis.ts",
        "src/services/search.ts",
        "src/services/observation_ingestion.ts",
        "src/reducers/**/*.ts",
      ],
    },
  },
});
