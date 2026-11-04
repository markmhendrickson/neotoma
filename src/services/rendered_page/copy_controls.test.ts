import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  hasRenderedPageCopyBlocks,
  renderedPageContentSecurityPolicy,
  RENDERED_PAGE_COPY_SCRIPT,
  RENDERED_PAGE_COPY_SCRIPT_HASH,
} from "./copy_controls.js";
import { renderRenderedPageHtml } from "./html_template.js";

const prompt =
  'Read all of this.\n\n1. Café, niño.\n2. <literal> & "quotes".\n3. Keep every item.\n4. Return the complete response.\n\nDo not send messages.\n';
const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function fixture(
  options: { legacy?: boolean | "throw"; modern?: boolean; duplicate?: boolean; body?: string } = {}
) {
  const copied: string[] = [];
  const modern = vi.fn(async (text: string) => {
    if (!options.modern) throw new Error("Clipboard denied");
    copied.push(text);
  });
  const body =
    options.body ??
    `<pre id="duplicate" data-copyable data-copy-label="Copiar petición" data-copied-label="Copiado" data-copy-success="Petición copiada."><code>${escape(prompt)}</code></pre><div id="duplicate">Unrelated text</div>`;
  const html = renderRenderedPageHtml({ title: "Copy fixture", htmlBody: body });
  const dom = new JSDOM(html, {
    url: "https://fixture.invalid",
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window.navigator, "clipboard", { value: { writeText: modern } });
      Object.defineProperty(window.document, "execCommand", {
        value: vi.fn(() => {
          if (options.legacy === "throw") throw new Error("Legacy clipboard denied");
          if (!options.legacy) return false;
          const area = window.document.querySelector("textarea")!;
          if (
            window.document.activeElement !== area ||
            area.selectionStart !== 0 ||
            area.selectionEnd !== area.value.length
          )
            return false;
          copied.push(area.value);
          return true;
        }),
      });
    },
  });
  await new Promise<void>((resolve) =>
    dom.window.document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
  );
  if (options.duplicate) dom.window.eval(RENDERED_PAGE_COPY_SCRIPT);
  return {
    dom,
    copied,
    modern,
    button: dom.window.document.querySelector<HTMLButtonElement>(".neotoma-copy-button")!,
  };
}

describe("renderer-owned copy controls", () => {
  it("copies the entire prompt exactly, preserving accents, literal HTML and trailing newline", async () => {
    const f = await fixture({ legacy: true });
    f.button.click();
    expect(f.copied).toEqual([prompt]);
    expect(f.button.textContent).toBe("Copiado");
    expect(f.dom.window.document.querySelector("[role=status]")?.textContent).toBe(
      "Petición copiada."
    );
    expect(f.modern).not.toHaveBeenCalled();
    expect(f.dom.window.document.querySelector("textarea")).toBeNull();
    f.dom.window.close();
  });

  it("uses write-only clipboard when synchronous copying fails", async () => {
    const f = await fixture({ modern: true });
    f.button.click();
    await vi.waitFor(() => expect(f.button.textContent).toBe("Copiado"));
    expect(f.copied).toEqual([prompt]);
    expect(f.modern).toHaveBeenCalledWith(prompt);
    f.dom.window.close();
  });

  it("never claims success when both clipboard paths fail, and selects the full prompt", async () => {
    const f = await fixture({ legacy: "throw" });
    f.button.click();
    await vi.waitFor(() => expect(f.button.disabled).toBe(false));
    expect(f.copied).toEqual([]);
    expect(f.button.textContent).toBe("Copiar petición");
    expect(f.dom.window.document.querySelector("[role=status]")?.textContent).toContain(
      "Text selected"
    );
    expect(f.dom.window.getSelection()?.toString()).toBe(prompt);
    f.dom.window.close();
  });

  it("binds each block by reference, not clobberable IDs, and does not duplicate controls", async () => {
    const f = await fixture({
      legacy: true,
      duplicate: true,
      body: '<pre id="same" data-copyable>first<code> + nested</code></pre><pre id="same" data-copyable>second</pre><pre>not opted in</pre>',
    });
    const buttons =
      f.dom.window.document.querySelectorAll<HTMLButtonElement>(".neotoma-copy-button");
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    buttons[1].click();
    expect(f.copied).toEqual(["first + nested", "second"]);
    f.dom.window.close();
  });

  it("does not copy automatically when the page loads", async () => {
    const f = await fixture({ legacy: true });
    expect(f.copied).toEqual([]);
    expect(f.modern).not.toHaveBeenCalled();
    f.dom.window.close();
  });
});

describe("copy helper CSP boundary", () => {
  it("keeps unmarked pages script-free", () => {
    const body = "<pre>ordinary content</pre><script>alert(1)</script>";
    expect(hasRenderedPageCopyBlocks(body)).toBe(false);
    expect(renderedPageContentSecurityPolicy(body)).toContain("script-src 'none'");
    expect(renderedPageContentSecurityPolicy(body)).toContain("sandbox allow-same-origin");
    expect(renderRenderedPageHtml({ title: "Static", htmlBody: body })).not.toContain(
      RENDERED_PAGE_COPY_SCRIPT
    );
  });

  it("allows only the exact immutable helper hash in an opaque sandbox", () => {
    const body = "<pre data-copyable>copy me</pre>";
    const csp = renderedPageContentSecurityPolicy(body);
    expect(RENDERED_PAGE_COPY_SCRIPT_HASH).toBe(
      createHash("sha256").update(RENDERED_PAGE_COPY_SCRIPT).digest("base64")
    );
    expect(csp).toContain(`script-src 'sha256-${RENDERED_PAGE_COPY_SCRIPT_HASH}'`);
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toMatch(/unsafe-eval|strict-dynamic|unsafe-hashes|script-src 'self'/);
    const alteredHash = createHash("sha256")
      .update(RENDERED_PAGE_COPY_SCRIPT + "alert(1)")
      .digest("base64");
    expect(csp).not.toContain(alteredHash);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});
