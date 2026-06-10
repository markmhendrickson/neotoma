/**
 * Unit tests for the server-side Inspector skin loader.
 *
 * Covers resolution precedence (`NEOTOMA_INSPECTOR_SKIN_CONFIG` over
 * `NEOTOMA_INSPECTOR_SKIN`), missing-file / malformed-JSON tolerance, name
 * validation, and `</script>` escaping in the injection payload.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildInspectorSkinScript,
  injectInspectorSkin,
  resolveInspectorSkin,
  type ResolvedInspectorSkin,
} from "../../src/services/inspector_skin.js";

function cleanEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.NEOTOMA_INSPECTOR_SKIN;
  delete env.NEOTOMA_INSPECTOR_SKIN_CONFIG;
  return { ...env, ...overrides } as NodeJS.ProcessEnv;
}

describe("resolveInspectorSkin", () => {
  let tmpDir: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(process.cwd(), "tmp", "inspector-skin-test-" + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("returns null when no env vars are set", () => {
    expect(resolveInspectorSkin(cleanEnv())).toBeNull();
  });

  it("loads from an explicit absolute config path", () => {
    const file = path.join(tmpDir!, "custom.json");
    writeFileSync(
      file,
      JSON.stringify({
        name: "custom",
        brand: { sidebar_title: "Custom" },
        light: { primary: "0 0% 0%" },
      })
    );

    const skin = resolveInspectorSkin(cleanEnv({ NEOTOMA_INSPECTOR_SKIN_CONFIG: file }));
    expect(skin?.name).toBe("custom");
    expect(skin?.brand?.sidebar_title).toBe("Custom");
    expect(skin?.light).toEqual({ primary: "0 0% 0%" });
    expect(skin?.source_path).toBe(file);
  });

  it("NEOTOMA_INSPECTOR_SKIN_CONFIG takes precedence over NEOTOMA_INSPECTOR_SKIN", () => {
    const file = path.join(tmpDir!, "override.json");
    writeFileSync(file, JSON.stringify({ name: "override" }));

    const skin = resolveInspectorSkin(
      cleanEnv({
        NEOTOMA_INSPECTOR_SKIN: "sample",
        NEOTOMA_INSPECTOR_SKIN_CONFIG: file,
      })
    );
    expect(skin?.name).toBe("override");
  });

  it("returns null when the configured path is missing", () => {
    const missing = path.join(tmpDir!, "does-not-exist.json");
    expect(resolveInspectorSkin(cleanEnv({ NEOTOMA_INSPECTOR_SKIN_CONFIG: missing }))).toBeNull();
  });

  it("returns null when the JSON is malformed", () => {
    const file = path.join(tmpDir!, "broken.json");
    writeFileSync(file, "{ not json");
    expect(resolveInspectorSkin(cleanEnv({ NEOTOMA_INSPECTOR_SKIN_CONFIG: file }))).toBeNull();
  });

  it("returns null when the JSON is missing a name field", () => {
    const file = path.join(tmpDir!, "noname.json");
    writeFileSync(file, JSON.stringify({ light: { primary: "0 0% 0%" } }));
    expect(resolveInspectorSkin(cleanEnv({ NEOTOMA_INSPECTOR_SKIN_CONFIG: file }))).toBeNull();
  });

  it("rejects malformed preset names without filesystem lookup", () => {
    expect(
      resolveInspectorSkin(cleanEnv({ NEOTOMA_INSPECTOR_SKIN: "../etc/passwd" }))
    ).toBeNull();
    expect(
      resolveInspectorSkin(cleanEnv({ NEOTOMA_INSPECTOR_SKIN: "name with spaces" }))
    ).toBeNull();
  });

  it("returns null when the preset name is unknown", () => {
    expect(
      resolveInspectorSkin(cleanEnv({ NEOTOMA_INSPECTOR_SKIN: "definitely-not-a-real-skin" }))
    ).toBeNull();
  });

  it("loads the bundled sample preset by name (source-checkout fallback)", () => {
    // This test exercises the inspector/public/skins source-checkout fallback
    // that resolveInspectorSkin walks when neither dist/inspector/skins nor
    // inspector/dist/skins exists yet. The sample preset ships in this
    // repo's tree so the lookup must always succeed.
    const skin = resolveInspectorSkin(cleanEnv({ NEOTOMA_INSPECTOR_SKIN: "sample" }));
    expect(skin?.name).toBe("sample");
    expect(skin?.brand?.sidebar_title).toBe("Sample Skin");
    expect(skin?.light?.primary).toBe("315 90% 50%");
  });
});

describe("buildInspectorSkinScript", () => {
  it("emits a script tag setting window.__NEOTOMA_INSPECTOR_SKIN__", () => {
    const skin: ResolvedInspectorSkin = {
      name: "demo",
      light: { primary: "0 0% 0%" },
      source_path: "/tmp/demo.json",
    };
    const script = buildInspectorSkinScript(skin);
    expect(script).toContain("<script>");
    expect(script).toContain("window.__NEOTOMA_INSPECTOR_SKIN__");
    expect(script).toContain('"name":"demo"');
    expect(script).not.toContain("source_path");
  });

  it("escapes '<' so a value containing </script> cannot break out", () => {
    const skin: ResolvedInspectorSkin = {
      name: "malicious",
      brand: { sidebar_title: "</script><img src=x onerror=1>" },
      source_path: "/tmp/m.json",
    };
    const script = buildInspectorSkinScript(skin);
    // The closing </script> sequence must not appear inside the script body —
    // the HTML parser would terminate the script tag there. Escaping the
    // opening '<' (to \u003c) is sufficient; the trailing '>' is harmless.
    const body = script.replace(/^<script>/, "").replace(/<\/script>$/, "");
    expect(body).not.toContain("</script>");
    expect(body).toContain("\\u003c/script>");
    expect(body).toContain("\\u003cimg src=x onerror=1>");
  });
});

describe("injectInspectorSkin", () => {
  const HTML = `<!DOCTYPE html><html><head><title>Inspector</title></head><body>OK</body></html>`;

  it("inserts the skin script before </head>", () => {
    const skin: ResolvedInspectorSkin = {
      name: "demo",
      light: { primary: "0 0% 0%" },
      source_path: "/tmp/demo.json",
    };
    const out = injectInspectorSkin(HTML, skin);
    expect(out).toContain("__NEOTOMA_INSPECTOR_SKIN__");
    expect(out.indexOf("__NEOTOMA_INSPECTOR_SKIN__")).toBeLessThan(out.indexOf("</head>"));
  });

  it("returns HTML unchanged when no skin is provided", () => {
    expect(injectInspectorSkin(HTML, null)).toBe(HTML);
  });

  it("returns HTML unchanged when </head> is missing", () => {
    const noHead = "<html><body>hi</body></html>";
    const skin: ResolvedInspectorSkin = {
      name: "demo",
      source_path: "/tmp/demo.json",
    };
    expect(injectInspectorSkin(noHead, skin)).toBe(noHead);
  });
});
