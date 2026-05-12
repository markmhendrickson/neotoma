#!/usr/bin/env node
/**
 * Regenerates `docs/site/pages/en/privacy.mdx` and `terms.mdx` prose from
 * `docs/legal/site_privacy_notice.md` and `site_terms_of_use.md`.
 * Run from repo root after editing those legal sources.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LEGAL_IMPORT = `import { LEGAL_PAGE_LINK_CLASS } from "@/site/legal_page_link";

`;

const privacyHeader = `<p className="text-[13px] text-muted-foreground mb-6">Version 1.0 · effective 2026-04-24</p>

`;

function privacyBody(md) {
  const lines = md.split("\n");
  const body = lines.slice(6).join("\n");
  let t = body;
  t = t.replace(
    /\[neotoma\.io\/sandbox\/terms-of-use\]\(https:\/\/neotoma\.io\/sandbox\/terms-of-use\)/g,
    '<MdxI18nLink to="/sandbox/terms-of-use" className={LEGAL_PAGE_LINK_CLASS}>neotoma.io/sandbox/terms-of-use</MdxI18nLink>',
  );
  t = t.replace(
    /See \[neotoma\.io\/sandbox\/terms-of-use\]\(https:\/\/neotoma\.io\/sandbox\/terms-of-use\)/g,
    'See <MdxI18nLink to="/sandbox/terms-of-use" className={LEGAL_PAGE_LINK_CLASS}>neotoma.io/sandbox/terms-of-use</MdxI18nLink>',
  );
  return t;
}

function termsBody(md) {
  const lines = md.split("\n");
  const body = lines.slice(6).join("\n");
  let t = body;
  t = t.replace(
    /\[neotoma\.io\/sandbox\/terms-of-use\]\(https:\/\/neotoma\.io\/sandbox\/terms-of-use\)/g,
    '<MdxI18nLink to="/sandbox/terms-of-use" className={LEGAL_PAGE_LINK_CLASS}>neotoma.io/sandbox/terms-of-use</MdxI18nLink>',
  );
  t = t.replace(
    /\[sandbox terms\]\(https:\/\/neotoma\.io\/sandbox\/terms-of-use\)/g,
    '<MdxI18nLink to="/sandbox/terms-of-use" className={LEGAL_PAGE_LINK_CLASS}>sandbox terms</MdxI18nLink>',
  );
  t = t.replace(
    /See the \[Privacy Notice\]\(\/privacy\)/g,
    'See the <MdxI18nLink to="/privacy" className={LEGAL_PAGE_LINK_CLASS}>Privacy Notice</MdxI18nLink>',
  );
  return t;
}

const privacyMd = fs.readFileSync(path.join(root, "docs/legal/site_privacy_notice.md"), "utf8");
const termsMd = fs.readFileSync(path.join(root, "docs/legal/site_terms_of_use.md"), "utf8");

const privacyOut =
  LEGAL_IMPORT +
  privacyHeader +
  privacyBody(privacyMd) +
  `

<p className="text-[13px] text-muted-foreground mt-8">
  See also the <MdxI18nLink to="/terms" className={LEGAL_PAGE_LINK_CLASS}>Terms of Use</MdxI18nLink>{" "}
  and the <MdxI18nLink to="/sandbox/terms-of-use" className={LEGAL_PAGE_LINK_CLASS}>sandbox-specific terms</MdxI18nLink>.
</p>
`;

const termsOut =
  LEGAL_IMPORT +
  `<p className="text-[13px] text-muted-foreground mb-6">Version 1.0 · effective 2026-04-24</p>

` +
  termsBody(termsMd) +
  `

<p className="text-[13px] text-muted-foreground mt-8">
  See also the <MdxI18nLink to="/privacy" className={LEGAL_PAGE_LINK_CLASS}>Privacy Notice</MdxI18nLink>{" "}
  and the <MdxI18nLink to="/sandbox/terms-of-use" className={LEGAL_PAGE_LINK_CLASS}>sandbox-specific terms</MdxI18nLink>.
</p>
`;

fs.writeFileSync(path.join(root, "docs/site/pages/en/privacy.mdx"), privacyOut);
fs.writeFileSync(path.join(root, "docs/site/pages/en/terms.mdx"), termsOut);
console.log("Wrote docs/site/pages/en/privacy.mdx and terms.mdx from legal sources.");
