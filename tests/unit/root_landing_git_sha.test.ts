import { describe, expect, it } from "vitest";

import { readGitSha } from "../../src/services/root_landing/index.js";

describe("readGitSha", () => {
  it("prefers the real commit SHA over the Fly machine-version ULID", () => {
    const sha = "a".repeat(40);
    expect(
      readGitSha({
        NEOTOMA_GIT_SHA: sha,
        FLY_MACHINE_VERSION: "01KVDRZC0T05GPA3256NMHP48D",
      } as NodeJS.ProcessEnv),
    ).toBe(sha);
  });

  it("falls back through GIT_SHA and SOURCE_COMMIT before FLY_MACHINE_VERSION", () => {
    expect(
      readGitSha({ GIT_SHA: "deadbeef" } as NodeJS.ProcessEnv),
    ).toBe("deadbeef");
    expect(
      readGitSha({ SOURCE_COMMIT: "cafe" } as NodeJS.ProcessEnv),
    ).toBe("cafe");
  });

  it("falls back to the Fly machine-version ULID only when no real SHA is set", () => {
    const ulid = "01KVDRZC0T05GPA3256NMHP48D";
    expect(
      readGitSha({ FLY_MACHINE_VERSION: ulid } as NodeJS.ProcessEnv),
    ).toBe(ulid);
  });

  it("returns null when nothing is set", () => {
    expect(readGitSha({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
