import { useRef, useState } from "react";
import { SiteSnippet } from "../SiteSnippet";
import { usePageVisualMotion } from "./viewport_motion";
import { VisionGallery } from "./VisionGallery";
import { PaperScene } from "./PaperScene";
import { Link } from "react-router-dom";
import { NEOTOMA_GITHUB_REPO, neotomaGithubBlobUrl } from "@/site/neotoma_repo";
import { CodeBlock } from "@/components/InstallCodeBlock";
import { sendCtaClick } from "@/utils/analytics";
import { SolidLockup } from "./NeotomaLogos";
import { AnimatedLockup } from "./AnimatedLockup";

import {
  DEEPER_MATERIAL,
  CONNECTIONS_OTHER,
  CONNECTIONS_SETUP,
  PIPELINE,
  RECALL_VS_RECORD,
  FIGURE_LEGEND,
  PLATE_CAPTION,
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
  const [host, setHost] = useState(CONNECTIONS_SETUP[0]);
  const pageRef = useRef<HTMLElement>(null);
  usePageVisualMotion(pageRef);
  const evaluationPrompt =
    "Read https://neotoma.io/. Ask about my workflow, then explain whether Neotoma fits, whether my existing tools are sufficient, and which current limits matter.";
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
              <a href="#connect">Connect</a>
              <a href="#vision">Vision</a>
            </nav>
          </div>
          <div className="plan-hero-copy" id="plan-content">
            <div>
              <p className="plan-label">A record, not recall.</p>
              <h1 id="s1">The system of record for AI agents.</h1>
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
            <figcaption>Sources, observations and a current record.</figcaption>
          </figure>
        </section>

        <section className="plan-sheet" aria-labelledby="s2" id="fit">
          <SheetHead
            id="s2"
            mark="01 · Compare"
            title="Recall and record answer different questions"
          />
          <p className="plan-body">
            Memory and retrieval tools help an agent keep and find context. A record takes on a
            different job. It computes the current value from accepted observations and keeps a path
            back to the evidence for each field. The two overlap, and a product can cover more than
            one.
          </p>
          <p className="plan-body plan-fit-note">
            Neotoma is for developers and operators whose agents handle changing facts across tools.
            You choose what enters the local record and which tools use it. If your existing tools
            already maintain a source-backed record, they may be sufficient.
          </p>
          <div className="plan-contrast">
            <article>
              <PaperScene scene="before" />
              <p className="plan-label">Without one</p>
              <h3>What an agent happens to recall</h3>
            </article>
            <article>
              <PaperScene scene="after" />
              <p className="plan-label">With one</p>
              <h3>The current record</h3>
            </article>
          </div>
          <div className="plan-table-wrap">
            <table className="plan-table">
              <caption className="plan-sr">Recall compared with a record</caption>
              <thead>
                <tr>
                  <th scope="col">Mark</th>
                  <th scope="col">Question</th>
                  <th scope="col">Recall</th>
                  <th scope="col">Record (Neotoma)</th>
                </tr>
              </thead>
              <tbody>
                {RECALL_VS_RECORD.map((row, i) => (
                  <tr key={row.question}>
                    <td data-label="Mark">R{i + 1}</td>
                    <th scope="row" data-label="Question">
                      {row.question}
                    </th>
                    <td data-label="Recall">{row.recall}</td>
                    <td data-label="Record (Neotoma)">{row.record}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="plan-sheet" aria-labelledby="s3" id="how-it-works">
          <SheetHead id="s3" mark="02 · Follow a record" title="How a fact becomes current" />
          <div className="plan-invoice-story" id="example">
            <p className="plan-label">Example</p>
            <p>
              Invoice INV-2041 arrives as a PDF due 22 October. A later supplied email changes the
              due date to 29 October. A connected agent reading the invoice sees the selected 29
              October value and can inspect which observation supplied it. The amount still comes
              from the PDF.
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
                  <a href={neotomaGithubBlobUrl(step.doc)}>
                    Read the {step.name.toLowerCase()} reference
                  </a>
                </div>
                <PaperScene
                  scene={(["source", "observation", "entity", "reducer", "snapshot"] as const)[i]}
                />
              </li>
            ))}
          </ol>
          <aside className="plan-example" aria-label="Synthetic invoice example">
            <p className="plan-label">One invoice, five parts</p>
            <div className="plan-example-content">
              <PaperScene scene="invoiceExample" />
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
            <p className="plan-note">{PLATE_CAPTION}</p>
          </aside>
          <section
            id="interfaces"
            className="plan-interface-section"
            aria-labelledby="interface-title"
          >
            <span id="inspect" className="plan-anchor" aria-hidden="true" />
            <h3 id="interface-title">One record. Four ways to work with it.</h3>
            <InterfaceExplorer />
          </section>
        </section>

        <section className="plan-sheet" aria-labelledby="s4" id="connect">
          <SheetHead id="s4" mark="03 · Connect" title="Start in your favorite AI tool" />
          <div className="plan-split">
            <figure className="plan-scene plan-local-scene">
              <PaperScene scene="localService" />
              <figcaption>One local archive holds the record for connected agents.</figcaption>
            </figure>
            <p className="plan-body">
              Neotoma runs as a local service. Connected agents use the Model Context Protocol
              (MCP), REST API or CLI to read and write a configured instance. Point each tool at the
              same instance and data profile or MCP entry to share a record; separate entries can
              use separate databases. The bundled Inspector lets you examine the record.
            </p>
          </div>
          <p className="plan-body">
            Configured tools can share one record when they use the same instance and data profile.
            Signed requests can establish a verified agent identity, while scoped grants determine
            what that agent may do. Other paths may carry a self-reported name or no writer
            identity. A signature alone does not grant access.
          </p>
          <label className="plan-host-label" htmlFor="plan-host">
            Choose your tool
          </label>
          <select
            id="plan-host"
            className="plan-host-select"
            value={host.tool}
            onChange={(event) =>
              setHost(
                CONNECTIONS_SETUP.find((row) => row.tool === event.target.value) ??
                  CONNECTIONS_SETUP[0]
              )
            }
          >
            {CONNECTIONS_SETUP.map((row) => (
              <option key={row.tool} value={row.tool}>
                {row.host}
              </option>
            ))}
          </select>
          <CodeBlock
            code={installCommands(host.tool)}
            copyFeedbackId={`onepager-install-${host.tool}`}
            installBlock="manual_commands"
            scrollLabel="Install commands for selected tool"
          />
          <p className="plan-small">
            These human-run commands omit <code>--yes</code>. Setup still makes some changes
            automatically, including initialization and certain configuration writes; omission is
            not a general approval gate. Review the <Link to="/install">full install guide</Link>{" "}
            and run <code>neotoma status --json</code> to check the result. Automated setup may use{" "}
            <code>--yes</code> after its operator has authorized the changes.
          </p>
          <p className="plan-body plan-small">
            Other documented integrations: {CONNECTIONS_OTHER}. See{" "}
            <a href={`${NEOTOMA_GITHUB_REPO}/blob/main/docs/integrations/matrix.md`}>
              integrations
            </a>{" "}
            for each guide.
          </p>
          <p className="plan-small">
            For separate instances, read the{" "}
            <a href={neotomaGithubBlobUrl("docs/subsystems/peer_sync.md")}>
              advanced peering guide
            </a>
            . Peering is distinct from sharing one configured graph and does not promise complete
            history, file or deletion replication.
          </p>
        </section>

        <section className="plan-sheet" aria-labelledby="s5" id="vision">
          <SheetHead id="s5" mark="04 · Direction" title="Where this is going" />
          <p className="plan-body">
            A record people and agents maintain together. The source, observation and snapshot
            foundation is here today. These ambitions extend it toward clearer authority over state.
          </p>
          <VisionGallery />
          <p className="plan-small plan-vision-boundary">
            Planned governance, with no promised timeline. Authority to act stays in the operational
            tools above the record. See{" "}
            <a href={`${NEOTOMA_GITHUB_REPO}#vision-and-execution-status`}>vision status</a>.
          </p>
          <details className="plan-current-boundaries">
            <summary>Current scope and limits</summary>
            <p className="plan-small">
              Current boundaries: configured shared access does not provide workspace membership
              lifecycle or domain ownership. Writer attribution is verified only for admitted signed
              requests; some paths are self-reported or absent; later ordinary writes can replace
              corrections; export contains current values without observation history. Peering does
              not guarantee complete history, files or deletions. One entity can be read as of a
              past time; the whole record cannot. Read the{" "}
              <a href={neotomaGithubBlobUrl("docs/known_limitations.md")}>known limitations</a>.
            </p>
          </details>
          <div className="plan-actions">
            <Link
              to="/install"
              className="plan-btn plan-btn-primary"
              onClick={() => sendCtaClick("install")}
            >
              Install guide
            </Link>
            <a href={`${NEOTOMA_GITHUB_REPO}/tree/main/docs`} className="plan-link">
              Documentation
            </a>
          </div>
        </section>

        <section className="plan-sheet" aria-labelledby="s7">
          <SheetHead id="s7" mark="05 · References" title="Explore the source" />
          <p className="plan-body">
            Evaluate the fit before installing. Your agent can compare Neotoma with your current
            tools and recommend staying with those tools when they already meet the need.
          </p>
          <SiteSnippet
            text={evaluationPrompt}
            title="Ask your agent to evaluate"
            prose
            className="plan-evaluate"
            copyFeedbackId="onepager-evaluate"
            successMessage="Prompt copied"
          />
          <div className="plan-deeper">
            {DEEPER_MATERIAL.map((group) => (
              <div key={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="plan-small">
            See the companion project:{" "}
            <a className="plan-companion-link" href="https://github.com/markmhendrickson/ateles">
              Ateles
            </a>{" "}
            coordinates work and action under explicit authority.
          </p>
          <footer className="plan-footer">
            <SolidLockup />
            <p className="plan-small">
              <a href={NEOTOMA_GITHUB_REPO}>GitHub</a> ·{" "}
              <a href={neotomaGithubBlobUrl("docs/architecture/architecture.md")}>Architecture</a>
            </p>
            <p className="plan-small plan-colophon">
              Neotoma · From Constara · MIT licensed ·{" "}
              <a href="https://markmhendrickson.com">Contributor</a> ·{" "}
              <a href="/privacy">Privacy</a> · <a href="/terms">Terms of use</a>
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}
