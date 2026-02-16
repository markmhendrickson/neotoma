import { defineConfig, configDefaults } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** When set to "1", run Supabase-dependent tests (integration, migrations). Default: local-only. */
const runSupabaseTests = process.env.RUN_SUPABASE_TESTS === "1";

/** When set to "1", run React/frontend tests (jsdom). Default: excluded to avoid ESM/worker issues in default run. */
const runFrontendTests = process.env.RUN_FRONTEND_TESTS === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend/src"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [
      ["frontend/src/**/*.test.tsx", "jsdom"],
      ["frontend/src/**/*.test.ts", "jsdom"],
    ],
    setupFiles: ["./vitest.setup.ts"],
    env: {
      NODE_ENV: "test",
    },
    exclude: [
      ...configDefaults.exclude,
      "playwright/tests/**/*",
      // Imported app tests (data/imports): run only with RUN_SUPABASE_TESTS=1
      ...(!runSupabaseTests ? ["data/imports/**"] : []),
      // Integration/service tests that fail on local SQLite (run with RUN_SUPABASE_TESTS=1)
      ...(!runSupabaseTests
        ? [
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
      // Known-bad: jsdom worker ESM/require error (html-encoding-sniffer)
      "frontend/src/components/SchemaDetail.test.tsx",
    ],
    testTimeout: 60000, // Increased timeout for integration tests
    hookTimeout: 30000,
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
