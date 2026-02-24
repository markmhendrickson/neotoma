import { AlertTriangle, Check, Copy } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  FUNCTIONALITY_MATRIX,
  GLOSSARY_ROWS,
  LEARN_MORE_POSTS,
  LEARN_MORE_REPO_CARD,
  SITE_CODE_SNIPPETS,
  SITE_METADATA,
  type LearnMoreCardItem,
} from "../site/site_data";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";

interface SitePageProps {
  staticMode?: boolean;
}

interface TableScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

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
    <Alert className="flex flex-row items-stretch gap-4 cursor-pointer h-full no-underline">
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
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          className="shrink-0 w-[148px] h-[148px] rounded object-cover"
        />
      )}
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

function ScrollableTable({
  children,
  staticMode = false,
}: {
  children: React.ReactNode;
  staticMode?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState<TableScrollState>({
    canScrollLeft: false,
    canScrollRight: false,
  });

  useEffect(() => {
    if (staticMode || !viewportRef.current) {
      return;
    }
    const element = viewportRef.current;

    const updateScrollState = () => {
      const canScrollLeft = element.scrollLeft > 0;
      const canScrollRight = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setScrollState({ canScrollLeft, canScrollRight });
    };

    updateScrollState();
    element.addEventListener("scroll", updateScrollState);
    window.addEventListener("resize", updateScrollState);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [staticMode]);

  return (
    <div className="relative mb-4">
      {!staticMode && scrollState.canScrollLeft ? (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-white to-transparent" />
      ) : null}
      {!staticMode && scrollState.canScrollRight ? (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white to-transparent" />
      ) : null}
      <div ref={viewportRef} className="max-w-full overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

export function SitePage({ staticMode = false }: SitePageProps) {
  return (
    <div className="min-h-screen bg-white text-neutral-800">
      <main className="min-w-0">
        <div className="max-w-[52em] mx-auto px-4 py-10 md:py-16">
          <article id="intro" className="post-prose [&_a]:underline [&_a]:hover:text-neutral-900">
            <h1 className="text-[24px] font-medium tracking-[-0.02em] mb-4 mt-0">
              A truth layer for persistent agent memory
            </h1>
            <p className="text-[17px] text-neutral-600 leading-7 mb-6 mt-0 max-w-[36em]">
              Give your agents memory you can inspect, replay, and trust
            </p>
            <p className="text-[15px] leading-7 mb-4">
              Agent memory is forgetful. What keeps breaking automation is trust, not intelligence:
              memory changes implicitly, context drifts, and you can&apos;t see what changed or
              replay it. When agents act, personal data becomes state. The missing primitive is a
              layer of explicit, inspectable, replayable state.
            </p>
            <p className="text-[15px] leading-7 mb-4">
              <a href="https://github.com/markmhendrickson/neotoma">Neotoma</a> is that layer.
              Contract-first and deterministic (same input, same output). Immutable, queryable state
              in one graph for documents you upload and data agents write. You control what goes in;
              nothing updates memory implicitly.
            </p>
            <p className="text-[15px] leading-7 mb-4">
              It works with Cursor, Claude, and Codex via Model Context Protocol (MCP), and via CLI
              when MCP isn&apos;t available. Other apps and agentic systems can call the REST API
              directly. <a href="#install">Install with npm</a> below, then configure MCP for your
              editor or use the CLI.
            </p>
            <Alert className="mt-10 mb-12 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Currently in developer release</AlertTitle>
              <AlertDescription className="text-[15px] leading-7">
                Neotoma is in active, early development. Runs locally with CLI, MCP and API tunnel
                support for remote access. Best for developers comfortable with early-stage tooling
                and feedback.
              </AlertDescription>
            </Alert>
            <figure className="my-10 rounded overflow-hidden">
              <div className="min-h-[200px] md:min-h-[280px] bg-neutral-100">
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
            <p className="text-[15px] leading-7 mb-2">
              <strong>
                What <code>neotoma init</code> does:
              </strong>
            </p>
            <ul className="list-disc pl-5 mb-4">
              <li className="text-[15px] leading-7 mt-2 first:mt-0">
                Creates Neotoma&apos;s local data directory structure (including sources, events,
                and logs).
              </li>
              <li className="text-[15px] leading-7 mt-2 first:mt-0">
                Initializes the local SQLite database used by the CLI and API.
              </li>
              <li className="text-[15px] leading-7 mt-2 first:mt-0">
                Writes CLI configuration so commands can run against the initialized environment.
              </li>
              <li className="text-[15px] leading-7 mt-2 first:mt-0">
                Creates or updates <code>.env</code> for local setup (repo resolved from cwd,
                config, or <code>NEOTOMA_REPO_ROOT</code>).
              </li>
            </ul>
            <p className="text-[15px] leading-7 mb-4">Run API server (separate from MCP or CLI):</p>
            <CodeBlock code={SITE_CODE_SNIPPETS.postInstallCommands} staticMode={staticMode} />

            <SectionDivider />
            <SectionHeading id="terminology">Core terminology</SectionHeading>
            <ScrollableTable staticMode={staticMode}>
              <table className="w-full border border-neutral-200 border-collapse text-[15px] leading-7">
                <thead>
                  <tr>
                    <th className="text-left p-3 border-r border-b border-neutral-200 bg-neutral-50 min-w-[14ch]">
                      Term
                    </th>
                    <th className="text-left p-3 border-b border-neutral-200 bg-neutral-50 min-w-[36ch]">
                      Definition
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {GLOSSARY_ROWS.map((row) => (
                    <tr key={row.term}>
                      <td className="align-top p-3 border-r border-b border-neutral-200 font-medium">
                        {row.term}
                      </td>
                      <td className="align-top p-3 border-b border-neutral-200">
                        {row.definition}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>

            <SectionDivider />
            <SectionHeading id="agent-instructions">Agent instructions</SectionHeading>
            <p className="text-[15px] leading-7 mb-4">
              Agents use Neotoma via MCP when it is installed and running, or via the CLI when MCP
              is not available. The same behaviors apply either way.
            </p>
            <p className="text-[15px] leading-7 mb-4">
              The instructions below are <strong>mandatory requirements</strong> for all agents
              using Neotoma: agents <strong>MUST</strong> follow every one unless an explicit
              exception is documented. For the full text, see{" "}
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
                <strong>Attachments and images:</strong> Attachments are stored in the same request
                and linked via EMBEDS. For screenshots or images, the agent extracts visible
                entities (people, events, tasks, etc.) and stores them before responding.
              </li>
              <li className="text-[15px] leading-7 mt-3 first:mt-0">
                <strong>Tasks:</strong> When the user expresses intent, obligation, or future action
                (&quot;I need to&quot;, &quot;remind me&quot;, deadlines), the agent creates a task
                with due date when present and relates it to person or entity.
              </li>
              <li className="text-[15px] leading-7 mt-3 first:mt-0">
                <strong>External data (store-first):</strong> Data from other tools (email,
                calendar, search) is stored in Neotoma before the agent responds; the agent does not
                reply until storage is complete.
              </li>
              <li className="text-[15px] leading-7 mt-3 first:mt-0">
                <strong>User identity:</strong> When the user provides or implies their identity
                (name, email, &quot;me&quot;), the agent stores them as contact or person in the
                same turn.
              </li>
              <li className="text-[15px] leading-7 mt-3 first:mt-0">
                <strong>Conventions:</strong> The agent does not mention storage or linking unless
                the user asked; when confirming something was stored, uses language like
                &quot;remember&quot; or &quot;stored in memory.&quot; It checks for existing records
                before storing to avoid duplicates.
              </li>
              <li className="text-[15px] leading-7 mt-3 first:mt-0">
                <strong>Report or fix bugs:</strong> When the agent sees a Neotoma error or you
                describe a bug, it will suggest filing an issue on GitHub or, when it has access to
                a clone or fork, contributing a fix via a fork and pull request.
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
            <ScrollableTable staticMode={staticMode}>
              <table className="w-full border border-neutral-200 border-collapse text-[15px] leading-7">
                <thead>
                  <tr>
                    <th className="text-left font-medium p-3 border-r border-b border-neutral-200 bg-neutral-50 min-w-[8ch]">
                      Method
                    </th>
                    <th className="text-left font-medium p-3 border-r border-b border-neutral-200 bg-neutral-50 min-w-[28ch]">
                      Endpoint
                    </th>
                    <th className="text-left font-medium p-3 border-b border-neutral-200 bg-neutral-50 min-w-[20ch]">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FUNCTIONALITY_MATRIX.flatMap((row) =>
                    row.openapi
                      .split(",")
                      .map((endpoint) => endpoint.trim())
                      .filter(Boolean)
                      .map((endpoint, i) => {
                        const spaceIdx = endpoint.indexOf(" ");
                        const method = spaceIdx >= 0 ? endpoint.slice(0, spaceIdx) : "";
                        const path = spaceIdx >= 0 ? endpoint.slice(spaceIdx + 1) : endpoint;
                        const description = row.endpointDescriptions?.[i] ?? row.functionality;
                        return (
                          <tr key={`${row.functionality}-${i}-${endpoint}`}>
                            <td className="align-top p-3 border-r border-b border-neutral-200">
                              <code className="text-[13px]">{method}</code>
                            </td>
                            <td className="align-top p-3 border-r border-b border-neutral-200">
                              <code className="text-[13px] break-words whitespace-normal">
                                {path}
                              </code>
                            </td>
                            <td className="align-top p-3 border-b border-neutral-200">
                              {description}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </ScrollableTable>

            <SectionDivider />
            <SectionHeading id="configure-mcp">Model Context Protocol (MCP) server</SectionHeading>
            <p className="text-[15px] leading-7 mb-4">
              MCP actions available once the server is running and configured in{" "}
              <code>.cursor/mcp.json</code> (or synced to <code>.mcp.json</code> /{" "}
              <code>.codex/config.toml</code>). Use stdio for local usage, HTTP for remote or tunnel
              access.
            </p>
            <ScrollableTable staticMode={staticMode}>
              <table className="w-full border border-neutral-200 border-collapse text-[15px] leading-7">
                <thead>
                  <tr>
                    <th className="text-left font-medium p-3 border-r border-b border-neutral-200 bg-neutral-50 min-w-[20ch]">
                      Functionality
                    </th>
                    <th className="text-left font-medium p-3 border-b border-neutral-200 bg-neutral-50 min-w-[28ch]">
                      MCP action(s)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FUNCTIONALITY_MATRIX.map((row) => (
                    <tr key={row.functionality}>
                      <td className="align-top p-3 border-r border-b border-neutral-200 font-medium">
                        {row.functionality}
                      </td>
                      <td className="align-top p-3 border-b border-neutral-200">
                        <code className="text-[13px] break-words whitespace-normal">{row.mcp}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>

            <SectionDivider />
            <SectionHeading id="cli">Command-line interface (CLI)</SectionHeading>
            <p className="text-[15px] leading-7 mb-4">
              Run these commands directly when MCP is not available. See <code>neotoma --help</code>{" "}
              and subcommand help for usage.
            </p>
            <ScrollableTable staticMode={staticMode}>
              <table className="w-full border border-neutral-200 border-collapse text-[15px] leading-7">
                <thead>
                  <tr>
                    <th className="text-left font-medium p-3 border-r border-b border-neutral-200 bg-neutral-50 min-w-[20ch]">
                      Functionality
                    </th>
                    <th className="text-left font-medium p-3 border-b border-neutral-200 bg-neutral-50 min-w-[28ch]">
                      CLI command(s)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FUNCTIONALITY_MATRIX.map((row) => (
                    <tr key={row.functionality}>
                      <td className="align-top p-3 border-r border-b border-neutral-200 font-medium">
                        {row.functionality}
                      </td>
                      <td className="align-top p-3 border-b border-neutral-200">
                        <code className="text-[13px] break-words whitespace-normal">{row.cli}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>

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
  );
}

export function SitePageStatic() {
  return <SitePage staticMode={true} />;
}
