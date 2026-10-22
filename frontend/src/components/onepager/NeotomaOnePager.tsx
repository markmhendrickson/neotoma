import { Link } from "react-router-dom";
import { NEOTOMA_GITHUB_REPO } from "@/site/neotoma_repo";
import { sendCtaClick } from "@/utils/analytics";
import { SolidLockup } from "./NeotomaLogos";
import { OCTOBER_RENDERS, RECORD_RENDERS } from "./october_renders";
import {
  CLI_TRANSCRIPT,
  DEEPER_MATERIAL,
  CONNECTIONS_OTHER,
  CONNECTIONS_SETUP,
  INSTALL_COMMANDS,
  EXPECTATIONS,
  NOT_BUILT_YET,
  SCOPE_SENTENCE,
  PIPELINE,
  RECALL_VS_RECORD,
  FIGURE_LEGEND,
  PLATE_CAPTION,
} from "./onepager_copy";
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
  return (
    <div>
      <main className="plan" id="top">
        <section className="plan-sheet plan-hero" aria-labelledby="s1">
          <div className="plan-masthead">
            <SolidLockup />
            <a className="plan-link plan-masthead-link" href={NEOTOMA_GITHUB_REPO}>
              GitHub
            </a>
          </div>
          <div className="plan-hero-copy">
            <div>
              <p className="plan-label">Neotoma · the system of record for AI agents</p>
              <h1 id="s1">A record, not recall.</h1>
              <p className="plan-meta">
                Open source (MIT) · local-first · MCP server, REST API and CLI
              </p>
            </div>
            <div className="plan-hero-aside">
              <p className="plan-lede">
                Neotoma is the system of record for AI agents. Without one, an agent works from
                whatever it happens to recall: part of the last session, a note its tool saved, or
                nothing. With one, it reads what was stored, from which source, and what is current
                now, so the agents you connect can defer to one answer.
              </p>
              <div className="plan-actions">
                <Link
                  to="/install"
                  className="plan-btn plan-btn-primary"
                  onClick={() => sendCtaClick("hero_install")}
                >
                  Install
                </Link>
                <a
                  href={NEOTOMA_GITHUB_REPO}
                  className="plan-btn"
                  onClick={() => sendCtaClick("view_repo")}
                >
                  View on GitHub
                </a>
                <a
                  href={`${NEOTOMA_GITHUB_REPO}/blob/main/docs/architecture/architecture.md`}
                  className="plan-link"
                >
                  Read the architecture
                </a>
              </div>
            </div>
          </div>
          <figure className="plan-scene plan-hero-scene">
            <img {...OCTOBER_RENDERS.hero} loading="eager" fetchPriority="high" />
            <figcaption>Sources, observations and a current record.</figcaption>
          </figure>
        </section>

        <section className="plan-sheet" aria-labelledby="s2">
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

        <section className="plan-sheet" aria-labelledby="s3">
          <SheetHead id="s3" mark="02 · Follow a record" title="How a fact becomes current" />
          <ol className="plan-section-cut">
            {PIPELINE.map((step, i) => (
              <li key={step.name}>
                <div className="plan-step-copy">
                  <span className="plan-label">Step {String(i + 1).padStart(2, "0")}</span>
                  <h3>{step.name}</h3>
                  <p>{step.text}</p>
                </div>
                <img {...RECORD_RENDERS[i]} loading="lazy" />
              </li>
            ))}
          </ol>
          <aside className="plan-example" aria-label="Synthetic invoice example">
            <p className="plan-label">Synthetic example · one invoice</p>
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
            <p className="plan-note">{PLATE_CAPTION}</p>
          </aside>
          <p className="plan-body">
            A correction is one more observation. It does not edit the earlier one, so the original
            value is still listed and every current field names the observation that set it. The
            transcript below illustrates the invoice from the example above plus one correction. The
            commands start with <code>neotoma dev</code> because a plain npm install points the CLI
            at the production profile, which needs a token. Output is reformatted from the
            CLI&apos;s JSON to fit the page. Store observation ids differ between installs; yours
            will not match these.
          </p>
          <pre className="plan-pre" tabIndex={0} aria-label="CLI transcript">
            <code>{CLI_TRANSCRIPT}</code>
          </pre>
        </section>

        <section className="plan-sheet" aria-labelledby="s4">
          <SheetHead
            id="s4"
            mark="03 · Connect"
            title="One local service, read by the tools you connect"
          />
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
              Neotoma runs as a local service. Agents reach it through an MCP server, a REST API or
              the CLI, and you inspect it in a bundled web app. Agents connected to the same MCP
              entry read and write the same record.
            </p>
          </div>
          <div className="plan-table-wrap">
            <table className="plan-table plan-table-hosts">
              <caption>Hosts with a one-command setup</caption>
              <thead>
                <tr>
                  <th scope="col">Mark</th>
                  <th scope="col">Host</th>
                  <th scope="col">Setup command</th>
                </tr>
              </thead>
              <tbody>
                {CONNECTIONS_SETUP.map((row, i) => (
                  <tr key={row.host}>
                    <td data-label="Mark">H{i + 1}</td>
                    <th scope="row" data-label="Host">
                      {row.host}
                    </th>
                    <td data-label="Setup command">
                      <code>{row.command}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="plan-body plan-small">
            Other documented integrations: {CONNECTIONS_OTHER}. See{" "}
            <a href={`${NEOTOMA_GITHUB_REPO}/blob/main/docs/integrations/matrix.md`}>
              integrations
            </a>{" "}
            for each guide.
          </p>
        </section>

        <section className="plan-sheet" aria-labelledby="s5">
          <SheetHead id="s5" mark="04 · Install" title="Install in a few minutes" />
          <pre className="plan-pre" tabIndex={0} aria-label="Install commands">
            <code>{INSTALL_COMMANDS}</code>
          </pre>
          <p className="plan-small plan-install-note">
            Using another host? Swap <code>claude-code</code> for the tool name in the setup column
            of the connection table above. To print the MCP entry for another client, run{" "}
            <code>neotoma mcp config</code> in a terminal; it asks which one.
          </p>
          <div className="plan-actions">
            <Link
              to="/install"
              className="plan-btn plan-btn-primary"
              onClick={() => sendCtaClick("install")}
            >
              Full install guide
            </Link>
            <a href={`${NEOTOMA_GITHUB_REPO}/tree/main/docs`} className="plan-link">
              Documentation
            </a>
          </div>
        </section>

        <section className="plan-sheet" aria-labelledby="s6">
          <SheetHead id="s6" mark="05 · Limits" title="What to expect, and what is not built yet" />
          <p className="plan-label">What to expect</p>
          <ol className="plan-notes">
            {EXPECTATIONS.map((note) => (
              <li key={note.title}>
                <h3>{note.title}</h3>
                <p>{note.text}</p>
              </li>
            ))}
          </ol>
          <p className="plan-label">Not built yet</p>
          <ol className="plan-notes">
            {NOT_BUILT_YET.map((note) => (
              <li key={note.title}>
                <h3>{note.title}</h3>
                <p>{note.text}</p>
              </li>
            ))}
          </ol>
          <p className="plan-body plan-small plan-scope">
            {SCOPE_SENTENCE} Known defects and edge cases are listed in{" "}
            <a href={`${NEOTOMA_GITHUB_REPO}/blob/main/docs/known_limitations.md`}>
              known limitations
            </a>
            .
          </p>
        </section>

        <section className="plan-sheet" aria-labelledby="s7">
          <SheetHead id="s7" mark="06 · Deeper material" title="Everything else lives on GitHub" />
          <p className="plan-body">
            This page is the whole site. Documentation, the architecture, integration guides and the
            changelog are kept in the repository, next to the code they describe.
          </p>
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
            Companion project: <a href="https://github.com/markmhendrickson/ateles">Ateles</a>, an
            operating system for humans and AI agents to jointly initiate, execute, approve, and
            reconcile work under explicit authority.
          </p>
          <footer className="plan-footer">
            <SolidLockup />
            <p className="plan-small plan-colophon">
              MIT licensed · Built by <a href="https://markmhendrickson.com">Mark Hendrickson</a> ·{" "}
              <a href="/privacy">Privacy</a> · <a href="/terms">Terms of use</a>
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}
