import { describe, expect, it } from "vitest";
import {
  build_inspector_skin_css,
  sanitize_inspector_skin_config,
} from "./inspector_skin";

describe("sanitize_inspector_skin_config", () => {
  it("keeps safe token values and brand labels", () => {
    const skin = sanitize_inspector_skin_config({
      name: "sample",
      brand: {
        sidebar_title: "Sample Skin",
        header_title: "Sample Skin (test)",
      },
      light: {
        primary: "315 90% 50%",
        "not-a-token": "0 0% 0%",
      },
    });

    expect(skin?.name).toBe("sample");
    expect(skin?.brand?.sidebar_title).toBe("Sample Skin");
    expect(skin?.light?.primary).toBe("315 90% 50%");
    expect(skin?.light).not.toHaveProperty("not-a-token");
  });

  it("drops unsafe CSS token values", () => {
    const skin = sanitize_inspector_skin_config({
      name: "custom",
      light: {
        primary: "49 96% 52%; color: red",
      },
    });

    expect(skin?.light).toBeUndefined();
  });

  it("returns null when name is missing", () => {
    expect(sanitize_inspector_skin_config({ light: { primary: "49 96% 52%" } })).toBeNull();
    expect(sanitize_inspector_skin_config(null)).toBeNull();
    expect(sanitize_inspector_skin_config(undefined)).toBeNull();
    expect(sanitize_inspector_skin_config("sample")).toBeNull();
  });

  it("clamps brand labels to a reasonable length", () => {
    const long = "x".repeat(500);
    const skin = sanitize_inspector_skin_config({
      name: "x",
      brand: { sidebar_title: long },
    });
    expect(skin?.brand?.sidebar_title?.length).toBeLessThanOrEqual(80);
  });
});

describe("build_inspector_skin_css", () => {
  it("emits CSS variables for light and dark tokens", () => {
    const css = build_inspector_skin_css({
      name: "sample",
      light: { primary: "315 90% 50%" },
      dark: { primary: "315 95% 62%" },
    });

    expect(css).toContain(":root");
    expect(css).toContain("--primary: 315 90% 50%;");
    expect(css).toContain(".dark");
    expect(css).toContain("--primary: 315 95% 62%;");
  });

  it("emits nothing when no themes are present", () => {
    const css = build_inspector_skin_css({ name: "empty" });
    expect(css).toBe("");
  });
});
