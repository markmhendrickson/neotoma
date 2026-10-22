import { useState } from "react";
import { Link } from "react-router-dom";
import { NEOTOMA_GITHUB_REPO, neotomaGithubBlobUrl } from "@/site/neotoma_repo";
import { CodeBlock } from "@/components/InstallCodeBlock";
import { useCopyFeedback } from "@/lib/copy_feedback";
import { copyTextToClipboard } from "@/lib/copy_to_clipboard";
import { sendCtaClick } from "@/utils/analytics";
import { SolidLockup } from "./NeotomaLogos";
import { AnimatedLockup } from "./AnimatedLockup";
import { OCTOBER_RENDERS, RECORD_RENDERS } from "./october_renders";
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
import { InspectorPreview } from "./InspectorPreview";
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
  const [promptCopied, markPromptCopied] = useCopyFeedback("onepager-evaluate", 0);
  const evaluationPrompt = `Evaluate whether Neotoma fits a workflow with changing facts across AI tools. Read ${NEOTOMA_GITHUB_REPO} and ${neotomaGithubBlobUrl("docs/known_limitations.md")}. Compare it with tools I already use. Tell me whether those tools are sufficient, what I would need to run locally, and which current limits matter. Do not install anything or write data during this evaluation.`;
  return (
    <div>
      <a className="plan-skip" href="#plan-content">
        Skip to content
      </a>
      <main className="plan" id="top">
        <section className="plan-sheet plan-hero" aria-labelledby="s1">
          <div className="plan-masthead">
            <AnimatedLockup />
            <nav className="plan-nav" aria-label="Site">
              <a href="#fit">Fit</a>
              <a href="#example">Example</a>
              <a href="#how-it-works">How it works</a>
              <a href="#inspect">Inspector</a>
              <a href="#connect">Connect</a>
              <a href="#vision">Vision</a>
              <a href={NEOTOMA_GITHUB_REPO}>GitHub</a>
              <a href={neotomaGithubBlobUrl("docs/architecture/architecture.md")}>Architecture</a>
            </nav>
          </div>
          <div className="plan-hero-copy" id="plan-content">
            <div>
              <p className="plan-label">A record, not recall.</p>
              <h1 id="s1">The system of record for AI agents.</h1>
              <ul className="plan-meta-pills" aria-label="Product details">
                <li>MIT</li>
                <li>Local-first</li>
                <li>MCP</li>
                <li>REST API</li>
                <li>CLI</li>
              </ul>
            </div>
            <div className="plan-hero-aside">
              <p className="plan-lede">
                Give agents operational truth they can read, update, and maintain as they work.
              </p>
              <p className="plan-small">
                A current field comes from recorded observations and a field rule, with its source
                trail close at hand.
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
            <img {...OCTOBER_RENDERS.hero} loading="eager" fetchPriority="high" />
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
            For developers and operators whose configured agents handle changing facts across tools.
            You run a local service, decide what to write, and connect the tools that should read
            it. If your existing tools already give you a maintained, source-backed record, they may
            be sufficient.
          </p>
          <div className="plan-contrast">
            <article>
              <img {...OCTOBER_RENDERS.before} loading="lazy" />
              <p className="plan-label">Without one</p>
              <h3>What an agent happens to recall</h3>
            </article>
            <article>
              <img {...OCTOBER_RENDERS.after} loading="lazy" />
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
            <p className="plan-note">
              Fictional data; no email is read or invoice stored by this page.
            </p>
          </div>
          <ol className="plan-section-cut">
            {PIPELINE.map((step, i) => (
              <li key={step.name}>
                <div className="plan-step-copy">
                  <span className="plan-label">Step {String(i + 1).padStart(2, "0")}</span>
                  <h3>
                    {step.label} <span className="plan-step-term">({step.name})</span>
                  </h3>
                  <p>{step.text}</p>
                  <a href={neotomaGithubBlobUrl(step.doc)}>
                    Read the {step.name.toLowerCase()} reference
                  </a>
                </div>
                <img {...RECORD_RENDERS[i]} loading="lazy" />
              </li>
            ))}
          </ol>
          <aside className="plan-example" aria-label="Synthetic invoice example">
            <p className="plan-label">One invoice, five parts</p>
            <div className="plan-example-content">
              {OCTOBER_RENDERS.invoiceExample && (
                <img {...OCTOBER_RENDERS.invoiceExample} loading="lazy" />
              )}
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
          <section id="inspect" className="plan-inspect-section" aria-labelledby="inspect-title">
            <h3 id="inspect-title">Inspect the record</h3>
            <p className="plan-small">
              A static, read-only illustration using the bundled Inspector&apos;s entity detail,
              snapshot and observation history vocabulary. The invoice and sources are synthetic.
            </p>
            <InspectorPreview />
          </section>
          <section className="plan-interface-section" aria-labelledby="interface-title">
            <h3 id="interface-title">One record, three interfaces</h3>
            <InterfaceExplorer />
          </section>
        </section>

        <section className="plan-sheet" aria-labelledby="s4" id="connect">
          <SheetHead id="s4" mark="03 · Connect" title="Start in your favorite AI tool" />
          <div
            className={`plan-split${OCTOBER_RENDERS.localService ? "" : " plan-split-text-only"}`}
          >
            {OCTOBER_RENDERS.localService && (
              <figure className="plan-scene plan-local-scene">
                <img {...OCTOBER_RENDERS.localService} loading="lazy" />
                <figcaption>Run the service locally and connect the tools you use.</figcaption>
              </figure>
            )}
            <p className="plan-body">
              Neotoma runs as a local service. Connected agents use the Model Context Protocol
              (MCP), REST API or CLI to read and write the same instance. The bundled Inspector lets
              you examine the record.
            </p>
          </div>
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
        </section>

        <section className="plan-sheet" aria-labelledby="s5" id="vision">
          <SheetHead id="s5" mark="04 · Direction" title="Where this is going" />
          <p className="plan-body">
            A record people and agents maintain together. Today, Neotoma stores observations,
            computes current fields and keeps the source and history behind them. That is the
            foundation for clearer authority over state.
          </p>
          <p className="plan-body">
            Planned work includes domain-scoped correction rights, explicit disputes and official
            positions, and clearer views of why a value holds. Those governance features are
            direction, not current capabilities or a timeline promise. Authority to act remains with
            the operational tools above the record.
          </p>
          <p className="plan-body plan-small">
            Current boundaries: one local operator; later ordinary writes can replace corrections;
            export contains current values without observation history; authorship is verified only
            for signed requests, and some paths record no writer. One entity can be read as of a
            past time; the whole record cannot. See{" "}
            <a href={neotomaGithubBlobUrl("docs/known_limitations.md")}>known limitations</a> and{" "}
            <a href={`${NEOTOMA_GITHUB_REPO}#vision-and-execution-status`}>vision status</a>.
          </p>
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
          <div className="plan-evaluate">
            <p className="plan-label">Ask your agent to evaluate</p>
            <p>{evaluationPrompt}</p>
            <button
              type="button"
              className="plan-btn"
              aria-live="polite"
              onClick={async () => {
                if (await copyTextToClipboard(evaluationPrompt)) markPromptCopied();
              }}
            >
              {promptCopied ? "Copied" : "Copy prompt"}
            </button>
          </div>
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
            Companion project: <a href="https://github.com/markmhendrickson/ateles">Ateles</a>{" "}
            coordinates work and action under explicit authority.
          </p>
          <footer className="plan-footer">
            <SolidLockup />
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
