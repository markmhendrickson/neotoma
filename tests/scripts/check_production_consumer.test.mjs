import assert from "node:assert/strict";
import { test } from "node:test";
import { assertNoFrontendBuildDependenciesInTree } from "../../scripts/check_production_consumer.js";

test("rejects a forbidden package nested under a runtime dependency", () => {
  const tree = {
    name: "synthetic-consumer",
    dependencies: {
      neotoma: {
        dependencies: {
          "runtime-package": {
            dependencies: {
              react: { version: "1.0.0" },
            },
          },
        },
      },
    },
  };

  assert.throws(
    () => assertNoFrontendBuildDependenciesInTree(tree),
    /synthetic-consumer > neotoma > runtime-package > react/
  );
});

test("rejects forbidden packages nested inside scoped dependencies", () => {
  const tree = {
    name: "synthetic-consumer",
    dependencies: {
      "@example/runtime": {
        dependencies: {
          "@radix-ui/react-dialog": { version: "1.0.0" },
        },
      },
    },
  };

  assert.throws(
    () => assertNoFrontendBuildDependenciesInTree(tree),
    /synthetic-consumer > @example\/runtime > @radix-ui\/react-dialog/
  );
});

test("accepts a production tree without frontend build packages", () => {
  const tree = {
    name: "synthetic-consumer",
    dependencies: {
      neotoma: { dependencies: { "runtime-package": { version: "1.0.0" } } },
    },
  };

  assert.doesNotThrow(() => assertNoFrontendBuildDependenciesInTree(tree));
});
