import { useRef, useState } from "react";
import { SiteSnippet } from "../SiteSnippet";
import { usePageVisualMotion } from "./viewport_motion";
import { VisionGallery } from "./VisionGallery";
import { PaperScene } from "./PaperScene";
import { Link } from "react-router-dom";
import { neotomaDocUrl } from "@/site/neotoma_repo";
import { CodeBlock } from "@/components/InstallCodeBlock";
import { sendCtaClick } from "@/utils/analytics";
import { SolidLockup } from "./NeotomaLogos";
import { AnimatedLockup } from "./AnimatedLockup";
import { staticAssetPath } from "@/site/spa_path";

import {
  DEEPER_MATERIAL,
  CONNECTIONS,
  type Connection,
  CONNECTIONS_SETUP,
  PIPELINE,
  RECALL_VS_RECORD,
  FIGURE_LEGEND,
  installCommands,
} from "./onepager_copy";
import { InterfaceExplorer } from "./InterfaceExplorer";
import { ProductBenefitPills } from "./ProductBenefitPills";
import "./onepager.css";

function SheetHead({ id, mark, title }: { id: string; mark: string; title: string }) {
  return (
    <header className="plan-sheet-head">
      <p className="plan-label">{mark}</p>
      <h2 id={id}>{title}</h2>
    </header>
  );
}

export function NeotomaOnePager() {
  const [host, setHost] = useState<Connection>(CONNECTIONS_SETUP[0]);
  const pageRef = useRef<HTMLElement>(null);
  usePageVisualMotion(pageRef);
  const evaluationPrompt =
    "Read https://neotoma.io/. Ask about my current workflows and tools. Evaluate whether Neotoma would improve how my agents maintain changing facts, whether what I already use is sufficient, and which current limits matter for my use case.";
  const docHref = (repoPath: string) => {
    const href = neotomaDocUrl(repoPath);
    return href.startsWith("/") ? staticAssetPath(href) : href;
  };
  return (
    <div>
      <a className="plan-skip" href="#plan-content">
        Skip to content
      </a>
      <main className="plan" id="top" ref={pageRef}>
        <section className="plan-sheet plan-hero" aria-labelledby="s1">
          <div className="plan-masthead">
            <AnimatedLockup />
            <nav className="plan-nav" aria-label="Site">
              <a href="#how-it-works">How it works</a>
              <a href="#interfaces">Interfaces</a>
              <a href={docHref("docs/architecture/architecture.md")}>Architecture</a>
              <a href="#evaluate">Evaluate</a>
            </nav>
          </div>
          <div className="plan-hero-copy" id="plan-content">
            <div>
              <p className="plan-label">A record, not recall</p>
              <h1 id="s1">
                The <span className="plan-hero-phrase">system of record</span> for AI agents.
              </h1>
              <ProductBenefitPills />
            </div>
            <div className="plan-hero-aside">
              <p className="plan-lede">
                Give agents operational truth they can read, update, and maintain as they work.
              </p>
              <div className="plan-actions">
                <Link
                  to="/install"
                  className="plan-btn plan-btn-primary"
                  onClick={() => sendCtaClick("hero_install")}
                >
                  Install
                </Link>
              </div>
            </div>
          </div>
          <figure className="plan-scene plan-hero-scene">
            <PaperScene scene="hero" />
            <figcaption>
              Neotoma connects each current field in a record to the observations and sources behind
              it.
            </figcaption>
          </figure>
        </section>

        <section className="plan-sheet" aria-labelledby="s2" id="fit">
          <SheetHead
            id="s2"
            mark="01 · Compare"
            title="Recall and a system of record answer different questions"
          />
          <p className="plan-body">
            Memory and retrieval tools help an agent keep and find context. A system of record
            computes current values from accepted observations and keeps a path back to the evidence
            for each field.
          </p>
          <p className="plan-body plan-fit-note">
            Neotoma is for developers and operators whose agents handle changing facts across tools.
            You choose what enters the local instance and which tools use it.
          </p>
          <div className="plan-contrast">
            <article>
              <figure>
                <PaperScene scene="before" />
                <figcaption>
                  <p className="plan-label">Without a system of record</p>
                  <h3>What an agent happens to recall</h3>
                  <p>
                    Relevant facts remain scattered across separate pieces of context, with no
                    explicit current value selected here.
                  </p>
                </figcaption>
              </figure>
            </article>
            <article>
              <figure>
                <PaperScene scene="after" />
                <figcaption>
                  <p className="plan-label">With a system of record</p>
                  <h3>The current record</h3>
                  <p>
                    One record presents the selected field values while keeping their supporting
                    observations connected.
                  </p>
                </figcaption>
              </figure>
            </article>
          </div>
          <div className="plan-table-wrap">
            <table className="plan-table">
              <caption className="plan-sr">Recall compared with a system of record</caption>
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  <th scope="col">Recall</th>
                  <th scope="col">System of record (Neotoma)</th>
                </tr>
              </thead>
              <tbody>
                {RECALL_VS_RECORD.map((row) => (
                  <tr key={row.question}>
                    <th scope="row" data-label="Question">
                      {row.question}
                    </th>
                    <td data-label="Recall">{row.recall}</td>
                    <td data-label="System of record">{row.record}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link to="/compare" className="plan-compare-link">
            Compare recall, retrieval and a system of record in more detail{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </section>

        <section className="plan-sheet" aria-labelledby="s3" id="how-it-works">
          <SheetHead id="s3" mark="02 · Follow a record" title="How a fact becomes current" />
          <div className="plan-invoice-story" id="example">
            <p className="plan-label">Example</p>
            <p>
              Invoice INV-2041 arrives as a PDF due October 22nd. A later supplied email changes the
              due date to October 29th, 2026. A connected agent reading the invoice sees the
              selected October 29th value and can inspect which observation supplied it. The amount
              still comes from the PDF.
            </p>
          </div>
          <ol className="plan-section-cut">
            {PIPELINE.map((step, i) => (
              <li key={step.name}>
                <div className="plan-step-copy">
                  <span className="plan-label">
                    Step {String(i + 1).padStart(2, "0")} · {step.name}
                  </span>
                  <h3>{step.label}</h3>
                  <p>{step.text}</p>
                  <a href={docHref(step.doc)}>{step.link}</a>
                </div>
                <figure className="plan-step-art">
                  <PaperScene
                    scene={(["source", "observation", "entity", "reducer", "snapshot"] as const)[i]}
                  />
                </figure>
              </li>
            ))}
          </ol>
          <aside className="plan-example" aria-label="Synthetic invoice example">
            <p className="plan-label">One invoice, five parts</p>
            <div className="plan-example-content">
              <figure>
                <PaperScene scene="invoiceExample" />
              </figure>
              <ol className="plan-legend">
                {FIGURE_LEGEND.map((item, i) => (
                  <li key={item}>
                    <span className="plan-key" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
          <section
            id="interfaces"
            className="plan-interface-section"
            aria-labelledby="interface-title"
          >
            <span id="inspect" className="plan-anchor" aria-hidden="true" />
            <h3 id="interface-title">One invoice record. Four ways to work with it.</h3>
            <InterfaceExplorer />
          </section>
        </section>

        <section className="plan-sheet" aria-labelledby="s4" id="connect">
          <SheetHead id="s4" mark="03 · Connect" title="Start in your favorite AI tool" />
          <div className="plan-split">
            <figure className="plan-scene plan-local-scene">
              <PaperScene scene="localService" />
            </figure>
            <div>
              <p className="plan-body">
                Neotoma runs as a local service. Connected agents use the Model Context Protocol
                (MCP), REST API or CLI to read and write records in a configured instance.
              </p>
              <p className="plan-body">
                Point each tool at the same instance and data profile to work with the same records;
                separate entries can use separate databases. The bundled app lets you examine them.
              </p>
            </div>
          </div>
          <label className="plan-host-label" htmlFor="plan-host">
            Choose your tool
          </label>
          <select
            id="plan-host"
            className="plan-host-select"
            value={host.id}
            onChange={(event) =>
              setHost(
                CONNECTIONS.find((row) => row.id === event.target.value) ?? CONNECTIONS_SETUP[0]
              )
            }
          >
            {CONNECTIONS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.host}
              </option>
            ))}
          </select>
          {host.kind === "setup" ? (
            <CodeBlock
              code={installCommands(host.tool)}
              copyFeedbackId={`onepager-install-${host.id}`}
              installBlock="manual_commands"
              scrollLabel="Install commands for selected tool"
            />
          ) : (
            <p className="plan-manual-instruction">{host.instruction}</p>
          )}
          <p className="plan-small">
            Read the <a href={docHref(host.guide)}>{host.host} guide</a> for the supported
            connection path. The <Link to="/install">install guide</Link> covers the local service.
          </p>
        </section>

        <section className="plan-sheet" aria-labelledby="s5" id="vision">
          <SheetHead id="s5" mark="04 · Advanced" title="Advanced capabilities" />
          <VisionGallery />
          <div className="plan-actions">
            <Link
              to="/install"
              className="plan-btn plan-btn-primary"
              onClick={() => sendCtaClick("install")}
            >
              Install guide
            </Link>
            <a href={docHref("docs/")} className="plan-link">
              Documentation
            </a>
          </div>
        </section>

        <section className="plan-sheet plan-evaluate-sheet" aria-labelledby="s7" id="evaluate">
          <SheetHead id="s7" mark="05 · EVALUATE" title="Evaluate the fit" />
          <p className="plan-body">
            Ask your agent to consider Neotoma against your existing workflows and tools. It can
            identify where a system of record would help, and where what you already use is enough.
          </p>
          <SiteSnippet
            text={evaluationPrompt}
            title="Ask your agent to evaluate"
            prose
            className="plan-evaluate"
            copyFeedbackId="onepager-evaluate"
            successMessage="Prompt copied"
          />
        </section>
        <footer className="plan-site-footer" aria-label="References and site information">
          <div className="plan-footer-inner">
            <div className="plan-deeper">
              {DEEPER_MATERIAL.map((group) => (
                <div key={group.title}>
                  <h3>{group.title}</h3>
                  <ul>
                    {group.links.map((link) => (
                      <li key={link.label}>
                        {link.href ? (
                          <a
                            href={
                              link.href.startsWith("/") ? staticAssetPath(link.href) : link.href
                            }
                          >
                            {link.label}
                          </a>
                        ) : (
                          <span>{link.label}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="plan-footer">
              <SolidLockup />
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
