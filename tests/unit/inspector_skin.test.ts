import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  injectInspectorSkinConfig,
  resolveInspectorSkin,
} from "../../src/services/inspector_skin.js";

describe("resolveInspectorSkin", () => {
  it("returns none when no skin env vars are configured", () => {
    const resolved = resolveInspectorSkin({});
    expect(resolved.source).toBe("none");
    expect(resolved.skin).toBeNull();
  });

  it("loads a custom JSON config file", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "neotoma-inspector-skin-"));
    try {
      const file = path.join(dir, "skin.json");
      writeFileSync(
        file,
        JSON.stringify({
          name: "custom",
          label: "Custom",
          light: { primary: "49 96% 52%" },
        }),
      );

      const resolved = resolveInspectorSkin({ NEOTOMA_INSPECTOR_SKIN_CONFIG: file });
      expect(resolved.source).toBe("config");
      expect(resolved.skin?.name).toBe("custom");
      expect(resolved.skin?.light?.primary).toBe("49 96% 52%");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads a named built-in skin from the active Inspector static directory", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "neotoma-inspector-builtin-skin-"));
    try {
      const skinsDir = path.join(dir, "skins");
      mkdirSync(skinsDir, { recursive: true });
      writeFileSync(
        path.join(skinsDir, "lemonbrand.json"),
        JSON.stringify({ name: "lemonbrand", label: "Lemonbrand" }),
        { flag: "w" },
      );
    } catch {
      rmSync(dir, { recursive: true, force: true });
      throw new Error("failed to create test skin fixture");
    }

    try {
      const resolved = resolveInspectorSkin(
        { NEOTOMA_INSPECTOR_SKIN: "lemonbrand" },
        { staticDir: dir },
      );
      expect(resolved.source).toBe("builtin");
      expect(resolved.skin?.name).toBe("lemonbrand");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("injectInspectorSkinConfig", () => {
  it("injects the runtime skin before the closing head tag", () => {
    const html = "<html><head><title>Inspector</title></head><body></body></html>";
    const result = injectInspectorSkinConfig(html, {
      name: "lemonbrand",
      label: "Lemonbrand",
      light: { primary: "49 96% 52%" },
    });

    expect(result).toContain("window.__NEOTOMA_INSPECTOR_SKIN__");
    expect(result.indexOf("__NEOTOMA_INSPECTOR_SKIN__")).toBeLessThan(result.indexOf("</head>"));
  });

  it("escapes inline script-closing input", () => {
    const html = "<html><head></head><body></body></html>";
    const result = injectInspectorSkinConfig(html, {
      name: "custom",
      label: "</script><script>alert(1)</script>",
    });

    expect(result).not.toContain("</script><script>alert(1)</script>");
    expect(result).toContain("\\u003c/script>");
  });
});
