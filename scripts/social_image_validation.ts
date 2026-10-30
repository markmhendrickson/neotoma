/** Crawl-time social images must be real exported rasters, not just valid-looking URLs. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { scanHtml } from "./docs_viewer/validate_export";
import { jsonLdBlocks } from "./site_html";
import { SOCIAL_CARD } from "../frontend/src/site/social_card";

export function socialImageReferences(html: string): string[] {
  const refs: string[] = [];
  for (const tag of scanHtml(html).tags) {
    if (tag.name !== "meta" || tag.closing) continue;
    const attrs = Object.fromEntries(tag.attrs.map((attr) => [attr.name, attr.value]));
    if (["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes(attrs.property ?? attrs.name)) {
      refs.push(attrs.content ?? "");
    }
  }
  const imageValue = (value: unknown): void => {
    if (typeof value === "string") refs.push(value);
    else if (Array.isArray(value)) value.forEach(imageValue);
    else if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      imageValue(object.url ?? object.contentUrl ?? object["@id"]);
    }
  };
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
      if (key === "image") imageValue(child);
      else walk(child);
    }
  };
  for (const block of jsonLdBlocks(html)) walk(JSON.parse(block));
  return refs;
}

export async function socialImageProblems(html: string, siteDir: string): Promise<string[]> {
  const problems: string[] = [];
  let refs: string[];
  try { refs = socialImageReferences(html); }
  catch { return ["invalid social image JSON-LD"]; }
  for (const reference of new Set(refs)) {
    try {
      const url = new URL(reference);
      if (url.origin !== SOCIAL_CARD.origin || url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        throw new Error("expected an absolute HTTPS public-site image URL without credentials, query or fragment");
      }
      const file = path.resolve(siteDir, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(`${path.resolve(siteDir)}${path.sep}`)) throw new Error("image escapes export root");
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("image is missing from export");
      const bytes = fs.readFileSync(file);
      // Decode the complete raster as well as reading its header: truncated PNGs must not pass.
      const raster = sharp(bytes);
      const metadata = await raster.metadata();
      await raster.stats();
      if (metadata.format !== "png" || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        throw new Error("expected actual image/png bytes");
      }
      if (metadata.width !== SOCIAL_CARD.width || metadata.height !== SOCIAL_CARD.height) {
        throw new Error(`expected 1200×630 raster; got ${metadata.width}×${metadata.height}`);
      }
    } catch (error) {
      problems.push(`${reference || "(empty image URL)"}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return problems;
}

/** Bind committed rasters to their exact accepted art, local materials, fonts and composition source. */
export function socialCardSourceProblems(repoRoot: string): string[] {
  const problems: string[] = [];
  const digest = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  try {
    const receipt = JSON.parse(fs.readFileSync(path.join(repoRoot, "frontend/public/brand/october/social/source-receipt.json"), "utf8"));
    for (const [file, hash] of Object.entries(receipt.sourceInputs)) {
      if (digest(path.join(repoRoot, file)) !== hash) problems.push(`stale social-card source: ${file}`);
    }
    for (const locale of ["en", "es"] as const) {
      const card = receipt.cards.find((entry: { locale: string }) => entry.locale === locale);
      if (!card || card.path !== SOCIAL_CARD[locale].path || card.mime !== SOCIAL_CARD.mime || card.width !== SOCIAL_CARD.width || card.height !== SOCIAL_CARD.height) {
        problems.push(`missing or invalid ${locale} social-card receipt`);
      } else if (digest(path.join(repoRoot, "frontend/public", card.path)) !== card.sha256) {
        problems.push(`stale social-card raster: ${card.path}`);
      }
    }
  } catch (error) { problems.push(`social-card source receipt: ${error instanceof Error ? error.message : String(error)}`); }
  return problems;
}
