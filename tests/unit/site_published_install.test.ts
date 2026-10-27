import { describe, expect, it } from "vitest";
import {
  PUBLISHED_PACKAGE_VERSION,
  installCommands,
} from "../../frontend/src/components/onepager/onepager_copy";

describe("published package guidance", () => {
  it("pins the public install command to the verified npm release", () => {
    expect(PUBLISHED_PACKAGE_VERSION).toBe("0.25.0");
    expect(installCommands("claude-code")).toContain("npm install -g neotoma@0.25.0");
    expect(installCommands("claude-code")).toContain("neotoma init");
  });
});
