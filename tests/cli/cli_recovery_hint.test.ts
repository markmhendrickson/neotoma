import { describe, expect, it } from "vitest";

import { classifyBackupIntegrityCheck, getSqliteRecoveryHint } from "../../src/cli/index.ts";

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

  it("does not mistake a verification readback failure for database corruption", () => {
    const hint = getSqliteRecoveryHint(
      new Error("Backup verification could not obtain an integrity result (no result)."),
      "dev"
    );
    expect(hint).toBeNull();
  });

  it("classifies missing or malformed readback as an instrument failure", () => {
    expect(classifyBackupIntegrityCheck([])).toEqual({
      kind: "verify_instrument_failure",
      detail: "no result",
    });
    expect(classifyBackupIntegrityCheck([{}])).toEqual({
      kind: "verify_instrument_failure",
      detail: "malformed result",
    });
    expect(classifyBackupIntegrityCheck([{ integrity_check: null }])).toEqual({
      kind: "verify_instrument_failure",
      detail: "malformed result",
    });
  });

  it("classifies a real non-ok result as an integrity failure", () => {
    expect(classifyBackupIntegrityCheck([{ integrity_check: "ok" }])).toEqual({
      kind: "verified",
      detail: "ok",
    });
    expect(classifyBackupIntegrityCheck([{ integrity_check: "row 3 missing" }])).toEqual({
      kind: "integrity_failed",
      detail: "row 3 missing",
    });
  });
});
