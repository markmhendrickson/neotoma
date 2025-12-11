import { defineConfig, configDefaults } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend/src"),
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
    exclude: [...configDefaults.exclude, "playwright/tests/**/*"],
    testTimeout: 60000, // Increased timeout for integration tests
    hookTimeout: 30000,
    // Run integration tests sequentially to avoid database conflicts
    // Use threads pool with single thread for sequential execution
    pool: "threads",
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1, // Force single thread for sequential execution
      },
    },
    // Sequential execution for integration tests
    sequence: {
      concurrent: false, // Disable concurrent test execution
      shuffle: false, // Maintain test order
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
