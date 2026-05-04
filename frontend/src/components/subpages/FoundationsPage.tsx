import { Link } from "react-router-dom";
import { Fingerprint, Globe2, ShieldCheck } from "lucide-react";
import { DetailPage } from "../DetailPage";
import { useLocale } from "@/i18n/LocaleContext";

export function FoundationsPage() {
  const { pack } = useLocale();
  const foundations = pack.foundations;

  return (
    <DetailPage title={foundations.title}>
      <p className="text-[15px] leading-7 mb-4">
        Neotoma is built on three architectural commitments: your data stays on your machine, the
        same input always produces the same output, and your memory works across every AI tool you
        connect. These are not feature flags; they are structural properties of the system.
      </p>

      <nav className="rounded-lg border toc-panel p-4 mb-8">
        <p className="text-[14px] font-medium mb-2">{foundations.onThisPage}</p>
        <ul className="list-none pl-0 space-y-1 text-[14px]">
          <li>
            <a href="#privacy-first" className="text-foreground underline hover:text-foreground">
              {foundations.privacyFirst}
            </a>
          </li>
          <li>
            <a href="#deterministic" className="text-foreground underline hover:text-foreground">
              {foundations.deterministic}
            </a>
          </li>
          <li>
            <a href="#cross-platform" className="text-foreground underline hover:text-foreground">
              {foundations.crossPlatform}
            </a>
          </li>
        </ul>
      </nav>

      {/* Privacy-first */}
      <section id="privacy-first" className="scroll-mt-20 mb-12">
        <h2 className="flex items-start gap-2 text-[22px] font-medium tracking-[-0.01em] mb-4">
          <ShieldCheck className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span>{foundations.privacyFirst}</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Your data stays on your machine. Neotoma runs locally: no cloud sync, no remote telemetry,
          no training on your data. The server is a process on your hardware, the database is a file
          on your disk, and the MCP interface exposes only what you choose to connect.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Storage is user-controlled at every level. You decide what goes in; nothing is stored
          implicitly. Observations are append-only and encrypted at rest when configured. Every entity
          traces to a source and timestamp, so you can audit exactly what the system knows and where
          it came from.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Full export and deletion are first-class operations. You can export your entire memory graph
          at any time, and deletion removes data. It does not mark it inactive or hide it behind a
          flag. There is no retention period and no "soft delete" that preserves data server-side.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          This model means agents can build rich, structured memory without requiring trust in a
          third-party service. The privacy guarantee is architectural, not policy-based: by default,
          data stays on your machine. When hosted deployment is needed, the operator controls the
          infrastructure and data location.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          See{" "}
          <Link to="/memory-models#deterministic-memory" className="text-foreground underline hover:text-foreground">
            deterministic memory
          </Link>{" "}
          for the state evolution model and{" "}
          <Link to="/architecture" className="text-foreground underline hover:text-foreground">
            architecture
          </Link>{" "}
          for the full system design.
        </p>
      </section>

      {/* Deterministic */}
      <section id="deterministic" className="scroll-mt-20 mb-12">
        <h2 className="flex items-start gap-2 text-[22px] font-medium tracking-[-0.01em] mb-4">
          <Fingerprint className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span>{foundations.deterministic}</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Same input always produces the same output. Entity IDs are hash-based, observations are
          append-only, and every state change is recorded with full provenance. There is no silent
          mutation and no implicit overwrite.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          State evolves through a versioned pipeline: sources become observations, observations
          resolve to entities, entities produce versioned snapshots, and snapshots form the memory
          graph. Every stage is deterministic and inspectable. You can diff any two versions of an
          entity or reconstruct its full history from the observation log.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Schema-first extraction enforces structure at the boundary. Extraction rules derive from
          schema types, not heuristics. For unstructured files, AI interpretation extracts fields
          present in the source with full audit trail and idempotence guarantees; it does not
          synthesize or infer data beyond what the source contains. Corrections add new observations
          rather than editing existing ones.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          This matters because agents that read stale or conflicting state make wrong decisions.
          With a single agent, write corruption degrades quality gradually. With{" "}
          <Link to="/multi-agent-state" className="text-foreground underline hover:text-foreground">
            multiple agents sharing state
          </Link>
          , one bad observation propagates at machine speed{"\u2014"}triggering downstream actions
          before any human can intervene. When state evolution is deterministic, every downstream
          action inherits a known, auditable basis. Debugging becomes reconstruction, not guesswork.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          See{" "}
          <Link to="/memory-guarantees" className="text-foreground underline hover:text-foreground">
            memory guarantees
          </Link>{" "}
          for the full invariant set and{" "}
          <Link to="/architecture" className="text-foreground underline hover:text-foreground">
            architecture
          </Link>{" "}
          for how determinism is enforced across the pipeline.
        </p>
      </section>

      {/* Cross-platform */}
      <section id="cross-platform" className="scroll-mt-20 mb-12">
        <h2 className="flex items-start gap-2 text-[22px] font-medium tracking-[-0.01em] mb-4">
          <Globe2 className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span>{foundations.crossPlatform}</span>
        </h2>
        <p className="text-[15px] leading-7 mb-4">
          Neotoma provides one memory system across AI tools. Claude, ChatGPT, Cursor, Codex,
          OpenCode, Claude Code, OpenClaw, and IronClaw all access the same state graph through Model
          Context Protocol (MCP). Facts stored by one agent are immediately available to every
          other connected agent: no sync step, no export/import, no duplicate data.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          MCP is the integration layer. Each AI tool connects to Neotoma's MCP server and uses the
          same store, retrieve, and relationship operations. The CLI and REST API expose the same
          OpenAPI-backed contract, so humans and apps have identical access. There is one source of
          truth regardless of the interface.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          Neotoma works alongside native memory features (ChatGPT's memory, Claude's project
          knowledge, Cursor's context). It does not replace them or require disabling them. When you
          stop using Neotoma, there is nothing to uninstall from the AI tool itself; you simply
          disconnect the MCP server.
        </p>
        <p className="text-[15px] leading-7 mb-4">
          No platform lock-in. Your memory graph is a local SQLite database. You own the file, you
          control what connects to it, and you can export or migrate at any time. Switching AI tools
          does not mean starting over. The same structured memory is available to the next tool you
          connect.
        </p>
        <p className="text-[15px] leading-7">
          See{" "}
          <Link to="/mcp" className="text-foreground underline hover:text-foreground">
            MCP reference
          </Link>{" "}
          for the full action catalog,{" "}
          <Link to="/cli" className="text-foreground underline hover:text-foreground">
            CLI reference
          </Link>{" "}
          for terminal commands, and{" "}
          <Link to="/api" className="text-foreground underline hover:text-foreground">
            API reference
          </Link>{" "}
          for REST endpoints. For per-tool setup guides, see{" "}
          <Link to="/neotoma-with-cursor" className="text-foreground underline hover:text-foreground">
            Cursor
          </Link>,{" "}
          <Link to="/neotoma-with-claude" className="text-foreground underline hover:text-foreground">
            Claude
          </Link>,{" "}
          <Link to="/neotoma-with-claude-code" className="text-foreground underline hover:text-foreground">
            Claude Code
          </Link>,{" "}
          <Link to="/neotoma-with-chatgpt" className="text-foreground underline hover:text-foreground">
            ChatGPT
          </Link>,{" "}
          <Link to="/neotoma-with-codex" className="text-foreground underline hover:text-foreground">
            Codex
          </Link>, and{" "}
          <Link to="/neotoma-with-opencode" className="text-foreground underline hover:text-foreground">
            OpenCode
          </Link>.
        </p>
      </section>
    </DetailPage>
  );
}
