import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("preview build flags", () => {
  it("sets the preview flag for both the browser bundle and static export", () => {
    const workflow = readFileSync(
      join(__dirname, "../../.github/workflows/deploy-pages-dev-site.yml"),
      "utf8"
    );
    expect(workflow).toMatch(
      /name: Build UI[^]*?env:\s+SITE_PREVIEW: "1"\s+VITE_SITE_PREVIEW: "1"[^]*?run: npm run build:ui/
    );
    expect(workflow).toMatch(
      /name: Build site for preview\s+env:\s+SITE_PREVIEW: "1"\s+VITE_SITE_PREVIEW: "1"\s+VITE_UMAMI_URL: \$\{\{ secrets\.VITE_UMAMI_URL \}\}\s+VITE_UMAMI_WEBSITE_ID: \$\{\{ secrets\.VITE_UMAMI_WEBSITE_ID_DEV \}\}\s+run: npm run build:site:pages/
    );
  });

  it("passes the same existing Umami config into the production static export", () => {
    const workflow = readFileSync(
      join(__dirname, "../../.github/workflows/deploy-pages-site.yml"),
      "utf8"
    );
    expect(workflow).toMatch(
      /name: Build site\s+env:\s+VITE_UMAMI_URL: \$\{\{ secrets\.VITE_UMAMI_URL \}\}\s+VITE_UMAMI_WEBSITE_ID: \$\{\{ secrets\.VITE_UMAMI_WEBSITE_ID \}\}\s+run: npm run build:site:pages/
    );
  });
});
