import { describe, expect, it } from "vitest";
import {
  build_inspector_skin_css,
  sanitize_inspector_skin_config,
} from "./inspector_skin";

describe("sanitize_inspector_skin_config", () => {
  it("keeps safe token values and brand labels", () => {
    const skin = sanitize_inspector_skin_config({
      name: "lemonbrand",
      brand: {
        sidebar_title: "Lemonbrand",
        header_title: "Lemonbrand memory",
      },
      light: {
        primary: "49 96% 52%",
        "not-a-token": "0 0% 0%",
      },
    });

    expect(skin?.name).toBe("lemonbrand");
    expect(skin?.brand?.sidebar_title).toBe("Lemonbrand");
    expect(skin?.light?.primary).toBe("49 96% 52%");
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
    expect(sanitize_inspector_skin_config("lemonbrand")).toBeNull();
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
      name: "lemonbrand",
      light: { primary: "49 96% 52%" },
      dark: { primary: "49 96% 58%" },
    });

    expect(css).toContain(":root");
    expect(css).toContain("--primary: 49 96% 52%;");
    expect(css).toContain(".dark");
    expect(css).toContain("--primary: 49 96% 58%;");
  });

  it("emits nothing when no themes are present", () => {
    const css = build_inspector_skin_css({ name: "empty" });
    expect(css).toBe("");
  });
});
