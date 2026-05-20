import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DesignPatternSourceNote,
  DesignPatternStack,
} from "@/components/design/design_pattern_source";
import { DesignTableScrollDemo } from "@/components/design/design_table_scroll_demo";
import {
  DesignRow,
  DesignSection,
  DesignSubsection,
} from "@/components/design/design_section";
import {
  CODE_BLOCK_CARD_INNER_CLASS,
  EVALUATE_PROMPT_CARD_SHELL_CLASS,
  EVALUATE_PROMPT_DOT_CLASS,
  EVALUATE_PROMPT_PILL_CLASS,
  HOME_EVALUATE_CTA_CLASS,
  INTEGRATION_SNIPPET_CARD_SHELL_CLASS,
  INTEGRATION_SNIPPET_DOT_CLASS,
  INTEGRATION_SNIPPET_INNER_CLASS,
  INTEGRATION_SNIPPET_PILL_CLASS,
} from "@/components/design/marketing_pattern_classes";

const SAMPLE_CLI = `neotoma store --json='[{"entity_type":"task","title":"Review design tokens"}]'`;

const CODE_BLOCK_FENCED_CLASS =
  "code-block-palette mb-0 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border p-4 font-mono text-ui";

export function DesignCodeReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection
        title="Code patterns"
        description="Fenced blocks, inline code, and copyable snippet cards — design tokens and shadcn Button."
      >
        <DesignSubsection title="Fenced block (code-block-palette)">
          <DesignPatternSourceNote
            paths={["inspector/src/index.css (.code-block-palette)", "frontend/src/index.css"]}
          />
          <pre className={CODE_BLOCK_FENCED_CLASS}>{SAMPLE_CLI}</pre>
        </DesignSubsection>

        <DesignSubsection title="Inline code in prose / lists">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.doc-inline-code)"]} />
          <p className="text-body leading-7 text-foreground">
            Global option <code className="doc-inline-code">--json</code> forces machine-readable output.
          </p>
          <ul className="list-none space-y-2 pl-0">
            <li className="text-body leading-7 text-muted-foreground">
              <code className="doc-inline-code">--offline</code> — force in-process local transport
            </li>
            <li className="text-body leading-7 text-muted-foreground">
              <code className="doc-inline-code">--api-only</code> — fail if API server is unavailable
            </li>
          </ul>
        </DesignSubsection>

        <DesignSubsection title="Copyable snippet card (primary chrome)">
          <DesignPatternSourceNote
            paths={[
              "inspector/src/components/design/marketing_pattern_classes.ts",
              "frontend/src/components/CopyableCodeBlock.tsx",
            ]}
          />
          <div className={EVALUATE_PROMPT_CARD_SHELL_CLASS}>
            <div className="mb-3 flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="space-y-2 px-1">
                <div className={EVALUATE_PROMPT_PILL_CLASS}>
                  <span className={EVALUATE_PROMPT_DOT_CLASS} aria-hidden />
                  Code snippet
                </div>
                <p className="text-fine leading-5 text-muted-foreground">Copy the exact snippet shown below.</p>
              </div>
              <Button type="button" size="sm" aria-label="Copy">
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <pre className={`${CODE_BLOCK_CARD_INNER_CLASS} overflow-x-auto whitespace-pre-wrap break-words`}>
              <code>{SAMPLE_CLI}</code>
            </pre>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Integration snippet card (muted chrome)">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.integration-pill-*)"]} />
          <div className={INTEGRATION_SNIPPET_CARD_SHELL_CLASS}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2 px-1">
                <div className={INTEGRATION_SNIPPET_PILL_CLASS}>
                  <span className={INTEGRATION_SNIPPET_DOT_CLASS} aria-hidden />
                  MCP config
                </div>
                <p className="text-fine leading-5 text-muted-foreground">Add this client config to connect Neotoma over stdio.</p>
              </div>
              <Button type="button" size="sm" variant="outline" aria-label="Copy">
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <pre className={`${INTEGRATION_SNIPPET_INNER_CLASS} overflow-x-auto whitespace-pre-wrap break-words`}>
              {`{ "mcpServers": { "neotoma": { "command": "neotoma", "args": ["mcp", "serve"] } } }`}
            </pre>
          </div>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}

export function DesignProseReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection title="Prose patterns" description="MDX body, links, blockquotes, and step rails.">
        <DesignSubsection title="MDX / markdown body (mdx-site-page-content)">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.mdx-site-page-content)"]} />
          <article className="mdx-site-page-content post-prose max-w-none">
            <h2>Section heading (h2)</h2>
            <p>
              Body copy uses <code className="doc-inline-code">text-body</code>. Fenced blocks use{" "}
              <code className="doc-inline-code">code-block-palette</code>.
            </p>
            <h3>Subsection (h3)</h3>
            <ul>
              <li>First list item with spacing</li>
              <li>
                Second item with an <a href="#prose-links">in-body link</a>
              </li>
            </ul>
            <pre>neotoma entities list --type task</pre>
          </article>
        </DesignSubsection>

        <DesignSubsection title="Post prose links">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.post-prose, .post-prose-cta)"]} />
          <div className="post-prose mdx-site-page-content max-w-prose space-y-2">
            <p className="text-body leading-7">
              Default links are underlined; hover removes underline. CTAs use{" "}
              <code className="doc-inline-code">data-post-prose-cta</code> with{" "}
              <code className="doc-inline-code">.post-prose-cta</code>.
            </p>
            <p className="text-body leading-7">
              <a href="#example">Underlined doc link</a> versus{" "}
              <a href="#cta" data-post-prose-cta className="post-prose-cta">
                Install CTA
              </a>
            </p>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Blockquotes">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.blockquote-callout, .blockquote-muted)"]} />
          <blockquote className="blockquote-callout">
            Primary rail — walkthrough and evaluation callouts.
          </blockquote>
          <blockquote className="blockquote-muted">
            Muted italic rail — instruction and evaluation pages.
          </blockquote>
        </DesignSubsection>

        <DesignSubsection title="Step indent rail">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.doc-step-rail)"]} />
          <div className="doc-step-rail mt-2">
            <p className="text-body leading-7 text-muted-foreground">Nested steps with left border grouping.</p>
            <p className="text-body leading-7 text-muted-foreground">Second step in the same rail.</p>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Step number + section kicker">
          <DesignPatternSourceNote
            paths={["inspector/src/index.css (.doc-step-number, .doc-section-kicker, .doc-arrow-accent)"]}
          />
          <p className="text-body leading-7 text-foreground">
            <span className="doc-step-number">1</span>
            <span className="doc-section-kicker">Operating</span> — walkthrough pillar labels use primary tokens.
          </p>
          <p className="text-body leading-7 text-muted-foreground">
            <span className="doc-arrow-accent mt-0.5" aria-hidden>
              &rarr;
            </span>{" "}
            List arrows use <code className="doc-inline-code">doc-arrow-accent</code>.
          </p>
        </DesignSubsection>

        <DesignSubsection title="Tip / callout panel">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.doc-tip-panel)"]} />
          <div className="doc-tip-panel max-w-xl">
            <p className="text-body font-medium text-foreground">You don&apos;t define schemas upfront.</p>
            <p className="text-body leading-7 text-muted-foreground">
              Store any entity with a descriptive type; Neotoma infers schema on first write.
            </p>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Article column width">
          <DesignPatternSourceNote paths={["frontend/src/components/subpages/MdxSitePage.tsx"]} />
          <p className="pattern-specimen-note">
            Detail docs often use <code>max-w-[52em] mx-auto px-4</code>; bare landings omit{" "}
            <code>mdx-site-page-content</code>.
          </p>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}

export function DesignTablesReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection title="Table patterns" description="GFM markdown tables, scroll wrapper, and plain doc tables.">
        <DesignSubsection title="GFM markdown table">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.markdown-table)"]} />
          <div className="mdx-site-page-content overflow-x-auto">
            <table className="markdown-table mb-4 w-full border-collapse text-body">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Modes</th>
                  <th>Install</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cursor</td>
                  <td>stdio, remote HTTP</td>
                  <td>
                    <code className="doc-inline-code">neotoma setup --tool cursor</code>
                  </td>
                </tr>
                <tr>
                  <td>Claude Code</td>
                  <td>stdio, remote HTTP</td>
                  <td>
                    <code className="doc-inline-code">neotoma setup --tool claude-code</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </DesignSubsection>

        <DesignSubsection title="Reference table + scroll hint">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.table-scroll-outer)"]} />
          <DesignTableScrollDemo />
        </DesignSubsection>

        <DesignSubsection title="Plain doc table">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.doc-plain-table)"]} />
          <table className="doc-plain-table">
            <thead>
              <tr>
                <th>Surface</th>
                <th>Route</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Entities</td>
                <td className="font-mono text-ui">/entities</td>
              </tr>
            </tbody>
          </table>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}

export function DesignNoticesReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection title="Notice patterns" description="Banners, TOC panels, and environment status chips.">
        <DesignSubsection title="Translation fallback banner">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.translation-banner)"]} />
          <p className="translation-banner">
            Translation for <span className="font-mono text-ui">es</span> is not available yet; showing English source (
            <span className="font-mono text-ui">translated_from_revision=12</span>).
          </p>
        </DesignSubsection>

        <DesignSubsection title="TOC panel">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.toc-panel)"]} />
          <nav className="toc-panel mb-2 rounded-lg border p-4">
            <p className="mb-2 text-ui font-medium text-foreground">On this page</p>
            <ul className="space-y-1 text-body leading-7 text-muted-foreground">
              <li>
                <a href="#toc-1" className="underline underline-offset-2">
                  Deterministic evolution
                </a>
              </li>
              <li>
                <a href="#toc-2" className="underline underline-offset-2">
                  Versioned history
                </a>
              </li>
            </ul>
          </nav>
        </DesignSubsection>

        <DesignSubsection title="Environment status chips">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.env-chip-*)"]} />
          <DesignRow>
            <span className="env-chip-sandbox">Sandbox</span>
            <span className="env-chip-preview">Preview</span>
            <span className="env-chip-destructive">Destructive demo</span>
          </DesignRow>
          <p className="pattern-specimen-note mt-2">
            Product pages may use <code>Badge</code> with the same border/background token mix.
          </p>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}

export function DesignChromeReferencePanel() {
  return (
    <DesignPatternStack>
      <DesignSection title="Section chrome" description="Landing CTAs and section backgrounds.">
        <DesignSubsection title="Evaluate CTA">
          <DesignPatternSourceNote paths={["marketing_pattern_classes.ts (HOME_EVALUATE_CTA_CLASS)"]} />
          <Button asChild size="lg">
            <a href="#evaluate" className={HOME_EVALUATE_CTA_CLASS}>
              Evaluate Neotoma for your workflow
            </a>
          </Button>
        </DesignSubsection>

        <DesignSubsection title="Hero / section gradients">
          <DesignPatternSourceNote paths={["inspector/src/index.css (.gradient-hero-success)"]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="gradient-hero-success h-24 rounded-lg border border-border" />
            <div className="gradient-section-success h-24 rounded-lg border border-border" />
          </div>
          <p className="pattern-specimen-note">Radial overlays using primary and secondary tokens.</p>
        </DesignSubsection>

        <DesignSubsection title="Doc text scale">
          <DesignPatternSourceNote paths={["inspector/tailwind.config.mjs"]} />
          <ul className="space-y-2 text-body text-muted-foreground">
            <li>
              <code className="font-mono text-ui">text-body</code> — doc paragraphs
            </li>
            <li>
              <code className="font-mono text-ui">text-body-lg</code> — h2 in markdown content
            </li>
            <li>
              <code className="font-mono text-ui">text-ui</code> — chrome and code in cards
            </li>
            <li>
              <code className="font-mono text-ui">text-fine</code> — subtitles under code pills
            </li>
            <li>
              <code className="font-mono text-ui">text-caption</code> — pill labels, scroll hints
            </li>
          </ul>
        </DesignSubsection>
      </DesignSection>
    </DesignPatternStack>
  );
}
