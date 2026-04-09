import { describe, expect, it } from "vitest";

import { getSqliteRecoveryHint } from "../../src/cli/index.ts";

describe("getSqliteRecoveryHint", () => {
  it("returns a dev recovery hint for malformed database errors", () => {
    const hint = getSqliteRecoveryHint(
      new Error("Failed to query entities: database disk image is malformed"),
      "dev"
    );

    expect(hint).toContain("neotoma storage recover-db");
    expect(hint).toContain("neotoma storage recover-db --recover");
  });

  it("returns a prod recovery hint for btree corruption errors", () => {
    const hint = getSqliteRecoveryHint(
      new Error("Tree 14 page 28191: btreeInitPage() returns error code 11"),
      "prod"
    );

    expect(hint).toContain("neotoma prod storage recover-db");
    expect(hint).toContain("neotoma prod storage recover-db --recover");
  });

  it("does not return a hint for non-corruption errors", () => {
    const hint = getSqliteRecoveryHint(new Error("Request timed out"), "dev");
    expect(hint).toBeNull();
  });
});
