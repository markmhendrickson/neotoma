import { Link } from "react-router-dom";
import { NEOTOMA_GITHUB_REPO } from "@/site/neotoma_repo";
import { sendCtaClick } from "@/utils/analytics";
import { PlanTitleBlock, SolidLockup } from "./NeotomaLogos";
import { ServicePlan } from "./onepager_figures";
import { RecordPlate } from "./onepager_plate";
import {
  CLI_TRANSCRIPT,
  DEEPER_MATERIAL,
  CONNECTIONS_OTHER,
  CONNECTIONS_SETUP,
  INSTALL_COMMANDS,
  LIMITS,
  PIPELINE,
  RECALL_VS_RECORD,
  FIGURE_LEGEND,
  PLATE_CAPTION,
} from "./onepager_copy";
import "./onepager.css";

const SHEETS = 7;

function TitleBlock({ n, title }: { n: number; title: string }) {
  return (
    <PlanTitleBlock
      sheet={`${String(n).padStart(2, "0")} / ${String(SHEETS).padStart(2, "0")}`}
      title={title}
    />
  );
}

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
        {/* Sheet 01 */}
        <section className="plan-sheet plan-hero" aria-labelledby="s1">
          <div className="plan-masthead">
            <SolidLockup />
            <a className="plan-link plan-masthead-link" href={NEOTOMA_GITHUB_REPO}>
              GitHub
            </a>
          </div>
          <p className="plan-label">Neotoma · the system of record for AI agents</p>
          <h1 id="s1">A record, not recall.</h1>
          <p className="plan-lede">
            Neotoma is the system of record for AI agents. Without one, an agent works from whatever
            it happens to recall: part of the last session, a note its tool saved, or nothing. With
            one, it reads what was stored, from which source, and what is current now, so the
            agents you connect can defer to one answer.
          </p>
          <p className="plan-meta">
            Open source (MIT) · local-first · MCP server, REST API and CLI
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

          <figure className="plan-figure">
            <RecordPlate />
            <figcaption>
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
            </figcaption>
          </figure>
          <TitleBlock n={1} title="TITLE · RECORD PLAN" />
        </section>

        {/* Sheet 02 */}
        <section className="plan-sheet" aria-labelledby="s2">
          <SheetHead
            id="s2"
            mark="Sheet 02 · Schedule"
            title="Recall and record answer different questions"
          />
          <p className="plan-body">
            Memory and retrieval tools help an agent keep and find context. A record takes on a
            different job. It computes the current value from accepted observations and keeps a path
            back to the evidence for each field. The two overlap, and a product can cover more than
            one.
          </p>
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
          <TitleBlock n={2} title="SCHEDULE · RECALL AND RECORD" />
        </section>

        {/* Sheet 03 */}
        <section className="plan-sheet" aria-labelledby="s3">
          <SheetHead id="s3" mark="Sheet 03 · Section A-A" title="How a fact becomes current" />
          <ol className="plan-section-cut">
            {PIPELINE.map((step, i) => (
              <li key={step.name}>
                <span className="plan-key" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{step.name}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="plan-body">
            A correction is one more observation. It does not edit the earlier one, so the original
            value is still listed and every current field names the observation that set it. The run
            below was run on the published npm package (0.25.0) and on main, with the invoice from
            sheet 01 plus one correction. Output is reformatted from the CLI&apos;s JSON to fit the
            page; observation ids are from one run and differ on every run.
          </p>
          <pre className="plan-pre" tabIndex={0} aria-label="CLI transcript">
            <code>{CLI_TRANSCRIPT}</code>
          </pre>
          <TitleBlock n={3} title="SECTION A-A · CURRENT FROM OBSERVATIONS" />
        </section>

        {/* Sheet 04 */}
        <section className="plan-sheet" aria-labelledby="s4">
          <SheetHead
            id="s4"
            mark="Sheet 04 · Schedule of connections"
            title="One local service, read by the tools you connect"
          />
          <div className="plan-split">
            <figure className="plan-figure plan-figure-small">
              <ServicePlan />
            </figure>
            <p className="plan-body">
              Neotoma runs as a local service. Agents reach it through an MCP server, a REST API or
              the CLI, and you inspect it in a bundled web app. Connected agents read and write the
              same record, so what one agent stored is what the next one reads.
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
          <TitleBlock n={4} title="SCHEDULE OF CONNECTIONS" />
        </section>

        {/* Sheet 05 */}
        <section className="plan-sheet" aria-labelledby="s5">
          <SheetHead id="s5" mark="Sheet 05 · Install" title="Install in a few minutes" />
          <pre className="plan-pre" tabIndex={0} aria-label="Install commands">
            <code>{INSTALL_COMMANDS}</code>
          </pre>
          <p className="plan-small plan-install-note">
            Using another host? Swap <code>claude-code</code> for the tool name in the setup column
            of the sheet 04 table. To print the MCP entry for another client, run{" "}
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
          <TitleBlock n={5} title="INSTALL" />
        </section>

        {/* Sheet 06 */}
        <section className="plan-sheet" aria-labelledby="s6">
          <SheetHead
            id="s6"
            mark="Sheet 06 · General notes"
            title="What this drawing does not show"
          />
          <ol className="plan-notes">
            {LIMITS.map((note) => (
              <li key={note.title}>
                <h3>{note.title}</h3>
                <p>{note.text}</p>
              </li>
            ))}
          </ol>
          <TitleBlock n={6} title="GENERAL NOTES · LIMITS" />
        </section>

        {/* Sheet 07 */}
        <section className="plan-sheet" aria-labelledby="s7">
          <SheetHead
            id="s7"
            mark="Sheet 07 · Deeper material"
            title="Everything else lives on GitHub"
          />
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
          <TitleBlock n={7} title="DEEPER MATERIAL · GITHUB" />
        </section>
      </main>
    </div>
  );
}
