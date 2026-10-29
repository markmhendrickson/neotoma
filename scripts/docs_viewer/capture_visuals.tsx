/** Shared capture path for the static export and local docs reader. No new artwork. */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaperScene } from "../../frontend/src/components/onepager/PaperSceneDrawing";
import { TOPIC_VISUALS } from "../../frontend/src/site/topic_visuals";

export async function captureTopicVisuals(page: Page, outputDir: string): Promise<void> {
  const sharp = (await import("sharp")).default;
  const visualDir = path.join(outputDir, "brand", "october", "topic");
  fs.mkdirSync(visualDir, { recursive: true });
  for (const [id, visual] of Object.entries(TOPIC_VISUALS)) {
    const markup = renderToStaticMarkup(
      createElement(PaperScene, { scene: visual.scene, idNamespace: `capture-${id}` })
    );
    const found = await page.evaluate(async (markup) => {
      document.querySelector("#topic-capture")?.remove();
      const wrap = document.createElement("div");
      wrap.id = "topic-capture";
      wrap.style.cssText =
        "width:900px;height:600px;background:#faf8f3;overflow:hidden;position:fixed;left:0;top:0;z-index:99999";
      // This markup comes only from our own React SVG renderer, never source documents.
      const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
      const clone = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
      clone.style.cssText =
        "display:block;width:900px;height:600px;max-width:none;opacity:1;transform:none;animation:none";
      wrap.append(clone);
      document.body.append(wrap);
      await document.fonts.ready;
      await Promise.all(
        Array.from(clone.querySelectorAll("image")).map(async (image) => {
          const href = image.getAttribute("href") ?? image.getAttribute("xlink:href");
          if (!href) return;
          const asset = new Image();
          asset.src = href;
          await asset.decode();
        })
      );
      return true;
    }, markup);
    if (!found) throw new Error(`Missing homepage paper scene for topic visual ${id}`);
    const png = await page.locator("#topic-capture").screenshot({ animations: "disabled" });
    const webp = await sharp(png).webp({ quality: 76, effort: 5 }).toBuffer();
    if (webp.byteLength > 1_000_000)
      throw new Error(`Topic visual ${id} exceeds the reader image cap`);
    fs.writeFileSync(path.join(visualDir, `${id}.webp`), webp);
  }
  await page.locator("#topic-capture").evaluate((element) => element.remove());
}
