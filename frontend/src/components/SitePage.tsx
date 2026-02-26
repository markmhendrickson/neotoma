import { AlertTriangle, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import {
  FUNCTIONALITY_MATRIX,
  MCP_ACTIONS_TABLE,
  CLI_COMMANDS_TABLE,
  GLOSSARY_ROWS,
  LEARN_MORE_POSTS,
  LEARN_MORE_REPO_CARD,
  SITE_CODE_SNIPPETS,
  SITE_METADATA,
  type LearnMoreCardItem,
} from "../site/site_data";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { TableScrollWrapper } from "./ui/table-scroll-wrapper";
import { SeoHead } from "./SeoHead";

interface SitePageProps {
  staticMode?: boolean;
}

const RESPONSIVE_TABLE_CLASS =
  "w-full caption-bottom border-0 text-[15px] leading-7 [&_th]:max-w-[50ch] [&_td]:max-w-[50ch] [&_th]:break-words [&_td]:break-words [&_thead]:sr-only [&_thead]:absolute [&_thead]:w-px [&_thead]:h-px [&_thead]:overflow-hidden [&_thead]:whitespace-nowrap [&_tbody]:block [&_tr]:block [&_tr]:mb-0 [&_tr]:rounded-none [&_tr]:border-b [&_tr]:border-border [&_tr]:bg-transparent [&_tr]:py-4 [&_td]:grid [&_td]:grid-cols-[8rem_minmax(0,1fr)] [&_td]:gap-3 [&_td]:items-start [&_td]:p-0 [&_td]:border-0 [&_td]:text-[14px] [&_td]:leading-5 [&_td]:py-4 [&_td.align-top]:py-2 [&_td::before]:content-[attr(data-label)] [&_td::before]:font-semibold [&_td::before]:text-foreground md:w-max md:border md:border-border md:border-collapse md:[&_thead]:not-sr-only md:[&_thead]:static md:[&_thead]:w-auto md:[&_thead]:h-auto md:[&_thead]:overflow-visible md:[&_thead]:whitespace-normal md:[&_thead_tr]:border-b md:[&_thead_tr]:border-border md:[&_tbody]:table-row-group md:[&_tbody_tr]:border-b md:[&_tbody_tr]:border-border md:[&_tbody_tr:last-child]:border-b-0 md:[&_tr]:table-row md:[&_tr]:h-10 md:[&_tr]:mb-0 md:[&_tr]:rounded-none md:[&_tr]:border-0 md:[&_tr]:bg-transparent md:[&_tr]:py-4 md:[&_tr]:transition-colors md:[&_tbody_tr:hover]:bg-muted/50 md:[&_td]:table-cell md:[&_td]:px-4 md:[&_td]:py-3 md:[&_td]:align-middle md:[&_td]:text-body md:[&_td:has([role=checkbox])]:pr-0 md:[&_td::before]:hidden md:[&_th]:h-12 md:[&_th]:px-4 md:[&_th]:text-left md:[&_th]:align-middle md:[&_th]:font-semibold md:[&_th]:text-foreground md:[&_th:has([role=checkbox])]:pr-0";
const MOBILE_TABLE_ROWS_STEP = 5;

function sanitizeCodeForCopy(rawCode: string): string {
  return rawCode
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) {
        return "";
      }
      const commentIndex = line.indexOf("#");
      if (commentIndex >= 0 && !line.trimStart().startsWith('"')) {
        return line.slice(0, commentIndex).trimEnd();
      }
      return line;
    })
    .filter((line) => line !== "")
    .join("\n");
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="group scroll-mt-6 text-[20px] font-medium tracking-[-0.02em] mt-14 mb-3">
      {children}
      <a
        href={`#${id}`}
        className="ml-2 inline-flex items-center text-neutral-500 no-underline border-none opacity-40 group-hover:opacity-70 hover:!opacity-100 hover:text-neutral-800 transition"
        aria-label="Link to section"
      >
        #
      </a>
    </h2>
  );
}

function SectionDivider() {
  return (
    <div className="flex items-center gap-3 my-12" aria-hidden="true">
      <span className="h-px flex-1 bg-neutral-200" />
      <span className="text-[8px] text-neutral-400 leading-none">◆</span>
      <span className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}

/** Learn more card: matches ateles Post.tsx prev/next post design (Alert + layout). Links are not underlined. */
function LearnMoreCard({ item }: { item: LearnMoreCardItem }) {
  const isExternal = item.href.startsWith("http");
  const content = (
    <Alert className="flex flex-col md:flex-row items-stretch gap-4 cursor-pointer h-full no-underline">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          className="w-full md:w-[148px] md:h-[148px] md:shrink-0 rounded object-cover"
        />
      )}
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <AlertTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {item.label}
        </AlertTitle>
        <AlertDescription className="py-px">
          <span className="font-medium text-foreground">{item.title}</span>
          {item.description && (
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          )}
          <span className="mt-2 inline-block text-sm font-medium text-foreground/80">
            {item.ctaLabel ?? "Read more →"}
          </span>
        </AlertDescription>
      </div>
    </Alert>
  );
  return isExternal ? (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg [&:hover]:opacity-95 transition-opacity no-underline"
    >
      {content}
    </a>
  ) : (
    <a
      href={item.href}
      className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg [&:hover]:opacity-95 transition-opacity no-underline"
    >
      {content}
    </a>
  );
}

function CodeBlock({ code, staticMode = false }: { code: string; staticMode?: boolean }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const normalizedCode = sanitizeCodeForCopy(code);
    await navigator.clipboard.writeText(normalizedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative mb-4">
      {!staticMode ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute top-2 right-2 gap-1.5"
          aria-label="Copy code"
          onClick={onCopy}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      ) : null}
      <pre className="rounded-lg border border-border bg-muted p-4 overflow-x-auto font-mono text-[14px] text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function SitePage({ staticMode = false }: SitePageProps) {
  const functionalityRows = FUNCTIONALITY_MATRIX.flatMap((row) =>
    row.openapi
      .split(",")
      .map((endpoint) => endpoint.trim())
      .filter(Boolean)
      .map((endpoint, i) => {
        const spaceIdx = endpoint.indexOf(" ");
        const method = spaceIdx >= 0 ? endpoint.slice(0, spaceIdx) : "";
        const path = spaceIdx >= 0 ? endpoint.slice(spaceIdx + 1) : endpoint;
        return {
          key: `${row.functionality}-${i}-${endpoint}`,
          method,
          path,
          description: row.endpointDescriptions?.[i] ?? row.functionality,
          parameters: row.endpointParameters?.[i] ?? "—",
        };
      })
  );
  const [isMobile, setIsMobile] = useState(false);
  const [visibleGlossaryRows, setVisibleGlossaryRows] = useState(MOBILE_TABLE_ROWS_STEP);
  const [visibleFunctionalityRows, setVisibleFunctionalityRows] = useState(MOBILE_TABLE_ROWS_STEP);
  const [visibleMcpRows, setVisibleMcpRows] = useState(MOBILE_TABLE_ROWS_STEP);
  const [visibleCliRows, setVisibleCliRows] = useState(MOBILE_TABLE_ROWS_STEP);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncMobileState = () => setIsMobile(window.innerWidth <= 767);
    syncMobileState();
    window.addEventListener("resize", syncMobileState);
    window.visualViewport?.addEventListener("resize", syncMobileState);
    return () => {
      window.removeEventListener("resize", syncMobileState);
      window.visualViewport?.removeEventListener("resize", syncMobileState);
    };
  }, []);

  const glossaryVisibleCount = visibleGlossaryRows;
  const functionalityVisibleCount = visibleFunctionalityRows;
  const mcpVisibleCount = visibleMcpRows;
  const cliVisibleCount = visibleCliRows;

  return (
    <>
      {!staticMode ? <SeoHead routePath="/" /> : null}
      <div className="min-h-screen bg-white text-neutral-800">
        <main className="min-w-0">
          <div className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
            <article id="intro" className="post-prose [&_a]:underline [&_a]:hover:text-neutral-900">
              <h1 className="text-[24px] font-medium tracking-[-0.02em] mb-4 mt-0">
                A truth layer for persistent agent memory
              </h1>
              <p className="text-[17px] text-neutral-600 leading-7 mb-6 mt-0 max-w-[36em]">
                Give your agents memory you can inspect, replay, and trust.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                Agent memory is forgetful. What keeps breaking automation is trust, not
                intelligence: memory changes implicitly, context drifts, and you can&apos;t see what
                changed or replay it. When agents act, personal data becomes state. The missing
                primitive is a layer of explicit, inspectable, replayable state.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                Neotoma is that layer. Open-source, privacy-protective, and user-controlled.
                Contract-first and deterministic (same input, same output). Immutable, queryable
                state in one graph for documents you upload and data agents write. You control what
                goes in; nothing updates memory implicitly.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                It works with Cursor, Claude, and Codex via Model Context Protocol (MCP), and via
                CLI when MCP isn&apos;t available. Other apps and agentic systems can call the REST
                API directly. <a href="#install">Install with npm</a> below, then configure MCP for
                your editor or use the CLI.
              </p>
              <Alert className="mt-10 mb-12 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Currently in developer release</AlertTitle>
                <AlertDescription className="text-[15px] leading-7">
                  Neotoma is in active, early development. Runs locally with CLI, MCP, and API with
                  tunnel support for remote access. Best for developers comfortable with early-stage
                  tooling and feedback. Not yet hardened for production; avoid storing highly
                  sensitive data.&nbsp;
                  <a
                    href="https://markmhendrickson.com/posts/neotoma-developer-release"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read release post
                  </a>
                </AlertDescription>
              </Alert>
              <figure className="my-10 rounded overflow-hidden">
                <div className="bg-neutral-100">
                  <img
                    src={SITE_METADATA.heroImageUrl}
                    alt="Neotoma: truth layer for persistent agent memory"
                    loading="eager"
                    className="block max-w-full h-auto"
                  />
                </div>
                <figcaption className="pt-3 text-[12px] text-neutral-600">
                  <em>Neotoma</em> is named after the genus of packrats, known for collecting and
                  preserving material. Here it denotes a truth layer for persistent agent memory.
                </figcaption>
              </figure>

              <SectionDivider />
              <SectionHeading id="install">Install with npm</SectionHeading>
              <CodeBlock code={SITE_CODE_SNIPPETS.installCommands} staticMode={staticMode} />
              <p className="text-[15px] leading-7 mb-4">
                Running <code>neotoma init</code> creates a local data folder where Neotoma stores
                your memory, logs, and ingested files, keeps development and production data
                separate, and writes a config file you can edit later if needed.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                Init will also connect Neotoma to your tools, saving CLI instructions and
                configuring MCP servers for Claude, Claude, Codex and/or Cursor so agents use MCP
                when available and fall back to the CLI.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                You don’t need to run the API server for normal MCP or CLI use. Run it only if you
                want app-based access.
              </p>
              <CodeBlock code={SITE_CODE_SNIPPETS.postInstallCommands} staticMode={staticMode} />

              <SectionDivider />
              <SectionHeading id="terminology">Core terminology</SectionHeading>
              <TableScrollWrapper className="my-6 rounded-lg" showHint={!staticMode}>
                <table className={RESPONSIVE_TABLE_CLASS}>
                  <thead>
                    <tr>
                      <th className="min-w-[14ch] md:min-w-[14ch]">Term</th>
                      <th className="min-w-[36ch] md:min-w-[36ch]">Definition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GLOSSARY_ROWS.slice(0, glossaryVisibleCount).map((row) => (
                      <tr key={row.term}>
                        {!isMobile ? (
                          <td data-label="Term" className="font-medium">
                            {row.term}
                          </td>
                        ) : null}
                        <td data-label={row.term} className="align-top">
                          {row.definition}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollWrapper>
              {glossaryVisibleCount < GLOSSARY_ROWS.length ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleGlossaryRows((prev) =>
                        Math.min(prev + MOBILE_TABLE_ROWS_STEP, GLOSSARY_ROWS.length)
                      )
                    }
                  >
                    Load more (
                    {Math.min(MOBILE_TABLE_ROWS_STEP, GLOSSARY_ROWS.length - glossaryVisibleCount)})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleGlossaryRows(GLOSSARY_ROWS.length)}
                  >
                    Load all ({GLOSSARY_ROWS.length - glossaryVisibleCount})
                  </Button>
                </div>
              ) : null}

              <SectionDivider />
              <SectionHeading id="agent-instructions">Agent instructions</SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                Agents use Neotoma via MCP when it is installed and running, or via the CLI when MCP
                is not available. The same behaviors apply either way.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                The instructions below are mandatory requirements for all agents using Neotoma. For
                the full text, see{" "}
                <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/mcp/instructions.md">
                  MCP instructions
                </a>{" "}
                and{" "}
                <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/cli_agent_instructions.md">
                  CLI agent instructions
                </a>
                .
              </p>
              <ul className="list-disc pl-5 mb-4">
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Store first:</strong> Every turn, the agent persists the conversation and
                  current user message (plus any implied entities) in one store call before
                  responding. Responding before storing is forbidden.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Retrieval before store:</strong> The agent runs bounded retrieval for
                  entities implied by the message and uses results when storing to link or reuse
                  existing records.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Entity extraction:</strong> Facts from the message become stored entities
                  with descriptive types and fields; the message is linked to each extracted entity
                  (REFERS_TO).
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Proactive retrieval:</strong> After persistence, the agent runs bounded
                  retrieval when the prompt may depend on stored memory (targeted queries first,
                  expand only when needed).
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Attachments and images:</strong> Attachments are stored in the same
                  request and linked via EMBEDS. For screenshots or images, the agent extracts
                  visible entities (people, events, tasks, etc.) and stores them before responding.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Tasks:</strong> When the user expresses intent, obligation, or future
                  action (&quot;I need to&quot;, &quot;remind me&quot;, deadlines), the agent
                  creates a task with due date when present and relates it to person or entity.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>External data (store-first):</strong> Data from other tools (email,
                  calendar, search) is stored in Neotoma before the agent responds; the agent does
                  not reply until storage is complete.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>User identity:</strong> When the user provides or implies their identity
                  (name, email, &quot;me&quot;), the agent stores them as contact or person in the
                  same turn.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Conventions:</strong> The agent does not mention storage or linking unless
                  the user asked; when confirming something was stored, uses language like
                  &quot;remember&quot; or &quot;stored in memory.&quot; It checks for existing
                  records before storing to avoid duplicates.
                </li>
                <li className="text-[15px] leading-7 mt-3 first:mt-0">
                  <strong>Report or fix bugs:</strong> When the agent sees a Neotoma error or you
                  describe a bug, it will suggest filing an issue on GitHub or, when it has access
                  to a clone or fork, contributing a fix via a fork and pull request.
                </li>
              </ul>

              <SectionDivider />
              <SectionHeading id="functionality">API and OpenAPI specification</SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                The Neotoma REST API is defined in the{" "}
                <a href="https://github.com/markmhendrickson/neotoma/blob/main/openapi.yaml">
                  OpenAPI spec
                </a>
                . The table below lists each endpoint and the capability it provides.
              </p>
              <div>
                <TableScrollWrapper className="my-6 rounded-lg" showHint={!staticMode}>
                  <table className={RESPONSIVE_TABLE_CLASS}>
                    <thead>
                      <tr>
                        <th className="min-w-[8ch]">Method</th>
                        <th className="min-w-[28ch]">Endpoint</th>
                        <th className="min-w-[20ch]">Description</th>
                        <th className="min-w-[18ch]">Parameters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {functionalityRows.slice(0, functionalityVisibleCount).map((row) => (
                        <tr key={row.key}>
                          <td data-label="Method" className="align-top">
                            <code className="text-[13px]">{row.method}</code>
                          </td>
                          <td data-label="Endpoint" className="align-top">
                            <code className="text-[13px] break-words whitespace-normal">
                              {row.path}
                            </code>
                          </td>
                          <td data-label="Description" className="align-top">
                            {row.description}
                          </td>
                          <td data-label="Parameters" className="align-top">
                            <code className="text-[13px] text-muted-foreground">
                              {row.parameters}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollWrapper>
                {functionalityVisibleCount < functionalityRows.length ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleFunctionalityRows((prev) =>
                          Math.min(prev + MOBILE_TABLE_ROWS_STEP, functionalityRows.length)
                        )
                      }
                    >
                      Load more (
                      {Math.min(
                        MOBILE_TABLE_ROWS_STEP,
                        functionalityRows.length - functionalityVisibleCount
                      )}
                      )
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleFunctionalityRows(functionalityRows.length)}
                    >
                      Load all ({functionalityRows.length - functionalityVisibleCount})
                    </Button>
                  </div>
                ) : null}
              </div>

              <SectionDivider />
              <SectionHeading id="configure-mcp">
                Model Context Protocol (MCP) server
              </SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                MCP actions are available once the server is running and the client is configured:
                Cursor (<code>.cursor/mcp.json</code>), Claude (<code>.mcp.json</code>), or Codex (
                <code>.codex/config.toml</code>). Use stdio for local usage, HTTP for remote or
                tunnel access.
              </p>
              <div>
                <TableScrollWrapper className="my-6 rounded-lg" showHint={!staticMode}>
                  <table className={RESPONSIVE_TABLE_CLASS}>
                    <thead>
                      <tr>
                        <th className="min-w-[28ch]">Action</th>
                        <th className="min-w-[20ch]">Description</th>
                        <th className="min-w-[18ch]">Parameters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MCP_ACTIONS_TABLE.slice(0, mcpVisibleCount).map((row, i) => (
                        <tr key={`${row.action}-${i}`}>
                          <td data-label="Action" className="align-top">
                            <code className="text-[13px] break-words whitespace-normal">
                              {row.action}
                            </code>
                          </td>
                          <td data-label="Description" className="align-top">
                            {row.description}
                          </td>
                          <td data-label="Parameters" className="align-top">
                            <code className="text-[13px] text-muted-foreground">
                              {row.parameters}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollWrapper>
                {mcpVisibleCount < MCP_ACTIONS_TABLE.length ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleMcpRows((prev) =>
                          Math.min(prev + MOBILE_TABLE_ROWS_STEP, MCP_ACTIONS_TABLE.length)
                        )
                      }
                    >
                      Load more (
                      {Math.min(MOBILE_TABLE_ROWS_STEP, MCP_ACTIONS_TABLE.length - mcpVisibleCount)}
                      )
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleMcpRows(MCP_ACTIONS_TABLE.length)}
                    >
                      Load all ({MCP_ACTIONS_TABLE.length - mcpVisibleCount})
                    </Button>
                  </div>
                ) : null}
              </div>

              <SectionDivider />
              <SectionHeading id="cli">Command-line interface (CLI)</SectionHeading>
              <p className="text-[15px] leading-7 mb-4">
                Use the CLI when MCP is not available. Run <code>neotoma</code> with no arguments
                for an interactive REPL (<code>neotoma&gt; </code> prompt).
              </p>
              <p className="text-[15px] leading-7 mb-4">
                Data commands (store, entities, relationships, etc.) are API-first with automatic
                local fallback if the API is unreachable. Use <code>--offline</code> to force local
                or <code>--api-only</code> to require the API.
              </p>
              <p className="text-[15px] leading-7 mb-4">
                Every command is available as <code>neotoma &lt;subcommand&gt;</code> or{" "}
                <code>neotoma request --operation &lt;id&gt;</code>. See <code>neotoma --help</code>{" "}
                and subcommand help for usage.
              </p>
              <div>
                <TableScrollWrapper className="my-6 rounded-lg" showHint={!staticMode}>
                  <table className={RESPONSIVE_TABLE_CLASS}>
                    <thead>
                      <tr>
                        <th className="min-w-[28ch]">Command</th>
                        <th className="min-w-[20ch]">Description</th>
                        <th className="min-w-[18ch]">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CLI_COMMANDS_TABLE.slice(0, cliVisibleCount).map((row, i) => (
                        <tr key={`${row.command}-${i}`}>
                          <td data-label="Command" className="align-top">
                            <code className="text-[13px] break-words whitespace-normal">
                              {row.command}
                            </code>
                          </td>
                          <td data-label="Description" className="align-top">
                            {row.description}
                          </td>
                          <td data-label="Flags" className="align-top">
                            <code className="text-[13px] text-muted-foreground">
                              {row.parameters}
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollWrapper>
                {cliVisibleCount < CLI_COMMANDS_TABLE.length ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleCliRows((prev) =>
                          Math.min(prev + MOBILE_TABLE_ROWS_STEP, CLI_COMMANDS_TABLE.length)
                        )
                      }
                    >
                      Load more (
                      {Math.min(
                        MOBILE_TABLE_ROWS_STEP,
                        CLI_COMMANDS_TABLE.length - cliVisibleCount
                      )}
                      )
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleCliRows(CLI_COMMANDS_TABLE.length)}
                    >
                      Load all ({CLI_COMMANDS_TABLE.length - cliVisibleCount})
                    </Button>
                  </div>
                ) : null}
              </div>

              <SectionDivider />
              <SectionHeading id="learn-more">Learn more</SectionHeading>
              <div className="flex flex-col gap-4 [&_a]:no-underline">
                <LearnMoreCard key={LEARN_MORE_REPO_CARD.href} item={LEARN_MORE_REPO_CARD} />
                {LEARN_MORE_POSTS.map((post) => (
                  <LearnMoreCard key={post.href} item={post} />
                ))}
              </div>
            </article>
          </div>
        </main>
      </div>
    </>
  );
}

export function SitePageStatic() {
  return <SitePage staticMode={true} />;
}
