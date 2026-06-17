import { describe, expect, it } from "vitest";
import { formatBuildVersionLabel, formatBuildVersionTitle } from "./sidebar_external_links";

describe("sidebar external links build version formatting", () => {
  it("distinguishes a local app using production data", () => {
    expect(
      formatBuildVersionLabel("0.15.0", null, {
        isLocal: true,
        dataEnvironment: "prod",
      }),
    ).toBe("local · prod data · v0.15.0");
  });

  it("distinguishes a local app using development data", () => {
    expect(
      formatBuildVersionLabel("0.15.0", "abcdef123456", {
        isLocal: true,
        dataEnvironment: "dev",
      }),
    ).toBe("local · dev data · v0.15.0 · abcdef1");
  });

  it("keeps non-local production labels concise", () => {
    expect(
      formatBuildVersionLabel("0.15.0", null, {
        isLocal: false,
        dataEnvironment: "prod",
      }),
    ).toBe("v0.15.0");
  });

  it("describes both local runtime and data environment in the tooltip", () => {
    expect(
      formatBuildVersionTitle("0.15.0", null, {
        isLocal: true,
        dataEnvironment: "prod",
      }),
    ).toBe("Local app using prod data: local · prod data · v0.15.0");
  });
});
