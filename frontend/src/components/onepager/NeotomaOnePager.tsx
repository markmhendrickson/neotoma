import { useRef } from "react";
import { EvaluationCard } from "./EvaluationCard";
import { usePageVisualMotion } from "./viewport_motion";
import { VisionGallery } from "./VisionGallery";
import { PaperScene } from "./PaperScene";
import { Link } from "react-router-dom";
import { neotomaDocUrl } from "@/site/neotoma_repo";
import { sendCtaClick } from "@/utils/analytics";
import { AnimatedLockup } from "./AnimatedLockup";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { ToolInstall } from "./ToolInstall";
import { staticAssetPath } from "@/site/spa_path";
import {
  Clock,
} from "lucide-react";

import { PIPELINE, RECALL_VS_RECORD, FIGURE_LEGEND } from "./onepager_copy";
import { ComparisonRail, comparisonIcons } from "./ComparisonRail";
import { InterfaceExplorer } from "./InterfaceExplorer";
import { ProductBenefitPills } from "./ProductBenefitPills";
import "./onepager.css";
import { useLocale } from "@/i18n/LocaleContext";
import { SpanishOnePager } from "./SpanishOnePager";

function SheetHead({ id, mark, title }: { id: string; mark: string; title: string }) {
  return (
    <header className="plan-sheet-head">
      <p className="plan-label">{mark}</p>
      <h2 id={id}>{title}</h2>
    </header>
  );
}

export function NeotomaOnePager() {
  const { locale } = useLocale();
  const pageRef = useRef<HTMLElement>(null);
  usePageVisualMotion(pageRef);
  const docHref = (repoPath: string) => {
    const href = neotomaDocUrl(repoPath);
    return href.startsWith("/") ? staticAssetPath(href) : href;
  };
  if (locale === "es") return <SpanishOnePager pageRef={pageRef} />;
  return (
    <div>
      <a className="plan-skip" href="#plan-content">
        Skip to content
      </a>
      <main className="plan plan-home" id="top" ref={pageRef}>
        <section className="plan-sheet plan-hero plan-ground-paper" aria-labelledby="s1">
          <SiteHeader home brand={<AnimatedLockup />} />
          <div className="plan-hero-copy" id="plan-content" tabIndex={-1}>
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
                <span className="plan-install-time"><Clock size={14} aria-hidden="true" /> Takes a few minutes</span>
              </div>
            </div>
          </div>
          <figure className="plan-scene plan-hero-scene">
            <PaperScene scene="hero" />
            <figcaption>
              Records connect in a graph. Each current field traces to the observations and sources behind it.
            </figcaption>
          </figure>
        </section>

        <EvaluationCard id="evaluate-intro" headingId="evaluate-intro-title" compact />

        <section className="plan-sheet plan-ground-paper" aria-labelledby="s2" id="fit">
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
                  <h3>An agent recalls only what its context retained.</h3>
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
                  <h3>Agents retrieve current facts, historical changes, and their sources.</h3>
                  <p>
                    One record presents the selected field values while keeping their supporting
                    observations connected.
                  </p>
                </figcaption>
              </figure>
            </article>
          </div>
          <ComparisonRail />
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
                {RECALL_VS_RECORD.map((row, index) => {
                  const RecallIcon = comparisonIcons[index][0];
                  const RecordIcon = comparisonIcons[index][1];
                  return (
                    <tr key={row.question}>
                      <th scope="row" data-label="Question">
                        {row.question}
                      </th>
                      <td data-label="Recall">
                        <span className="plan-table-value">
                          <RecallIcon aria-hidden="true" size={22} strokeWidth={1.6} />
                          {row.recall}
                        </span>
                      </td>
                      <td data-label="System of record">
                        <span className="plan-table-value">
                          <RecordIcon aria-hidden="true" size={22} strokeWidth={1.6} />
                          {row.record}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Link to="/compare" className="plan-compare-link">
            Compare recall, retrieval and a system of record in more detail{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </section>

        <section className="plan-sheet plan-ground-band" aria-labelledby="s3" id="how-it-works">
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
            <h3 id="interface-title">Four ways to work with a record.</h3>
            <InterfaceExplorer />
          </section>
        </section>

        <section className="plan-sheet plan-ground-paper" aria-labelledby="s4" id="connect">
          <SheetHead id="s4" mark="03 · Connect" title="Start in your favorite AI tool" />
          <div className="plan-split">
            <figure className="plan-scene plan-local-scene">
              <PaperScene scene="localService" />
            </figure>
            <div>
              <p className="plan-body">
                Neotoma can run locally or behind an authenticated endpoint. Connected agents use
                MCP, REST API or CLI to read and write records in a configured instance.
              </p>
              <p className="plan-body">
                Point each tool at the same instance and data profile to work with the same records;
                separate entries can use separate databases. The bundled app lets you examine them.
              </p>
            </div>
          </div>
          <ToolInstall showPermissionsPreflight />
        </section>

        <section className="plan-sheet plan-ground-band" aria-labelledby="s5" id="vision">
          <SheetHead
            id="s5"
            mark="04 · Advanced"
            title="Build a shared foundation for agent work"
          />
          <VisionGallery />
        </section>

        <EvaluationCard id="evaluate" headingId="s7" mark="05 · EVALUATE" title="Evaluate the fit" body="Ask your agent to consider Neotoma against your existing workflows and tools. It can identify where a system of record would help, and where what you already use is enough." />
        <SiteFooter />
      </main>
    </div>
  );
}
