import { Link } from "react-router-dom";
import { SANDBOX_TERMS_DOC_PATH } from "@/site/sandbox_doc_paths";
import { Clock, ShieldAlert, Zap } from "lucide-react";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { InspectorPreviewIllustration } from "../illustrations/InspectorPreviewIllustration";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

const SANDBOX_HOST = "sandbox.neotoma.io";
const SANDBOX_ROOT_PATH = "/";
const SANDBOX_MCP_URL = `https://${SANDBOX_HOST}/mcp`;

const CURSOR_REMOTE_MCP = `{
  "mcpServers": {
    "neotoma-sandbox": {
      "url": "${SANDBOX_MCP_URL}"
    }
  }
}`;

const CLAUDE_CODE_REMOTE_MCP = `claude mcp add neotoma-sandbox --transport http --url ${SANDBOX_MCP_URL}`;

const AGENT_CONNECT_PROMPT = `Connect this Neotoma MCP server for me: ${SANDBOX_MCP_URL}

It is a public, shared sandbox. Anything I store is publicly visible and will be wiped on the next weekly reset (Sunday 00:00 UTC). Use it to help me kick the tires only - do not store anything private, and do not rely on persistence across the reset.

Add the server to my current tool's MCP config, then confirm it is reachable with a single retrieve call.`;

export function SandboxLandingPage() {
  return (
    <DetailPage title="Neotoma sandbox">
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 dark:text-sky-400">
          <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
          No install required
        </span>
        <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/25 bg-amber-500/5 px-2.5 py-1 text-[12px] font-medium text-amber-700 dark:text-amber-400">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Resets weekly
        </span>
        <span className="inline-flex items-center gap-1.5 rounded border border-rose-500/25 bg-rose-500/5 px-2.5 py-1 text-[12px] font-medium text-rose-700 dark:text-rose-400">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Public data
        </span>
      </div>

      <p className="text-[15px] leading-7 text-foreground mb-3">
        The sandbox is a public Neotoma instance on{" "}
        <a
          href={SANDBOX_ROOT_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className={extLink}
        >
          this host
        </a>{" "}
        that any agent can read and write without installing Neotoma locally. It exists so you can
        confirm Neotoma works with your harness in under a minute, see the Inspector UI with real
        data, and share reproducible examples.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        Want a private instance instead? <Link to="/install" className={extLink}>Install Neotoma locally</Link>{" "}
        - the sandbox is only appropriate for kicking the tires.
      </p>

      <IntegrationSection title="What you need to know" sectionKey="data-policy" dividerBefore={false}>
        <ul className="list-none pl-0 space-y-2 mb-2">
          <li className="text-[15px] leading-7 text-foreground flex items-start gap-2">
            <span className="text-rose-500 mt-0.5 shrink-0" aria-hidden>
              !
            </span>
            <span>
              <strong>Data is public.</strong> Every entity, observation, and uploaded file is
              visible to every other sandbox user. Do not store personal information, credentials,
              production data, or anything you would not post on a public gist.
            </span>
          </li>
          <li className="text-[15px] leading-7 text-foreground flex items-start gap-2">
            <span className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden>
              ↻
            </span>
            <span>
              <strong>Data resets weekly.</strong> The sandbox dataset is wiped every Sunday at
              00:00 UTC. Anything you create is guaranteed to disappear - treat it as scratch space,
              not storage.
            </span>
          </li>
          <li className="text-[15px] leading-7 text-foreground flex items-start gap-2">
            <span className="text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" aria-hidden>
              →
            </span>
            <span>
              <strong>Destructive admin endpoints are disabled.</strong> Merge, split, schema
              rewrites, and full-corpus snapshot recomputes are blocked so abusive callers cannot
              nuke the demo between resets. Soft deletes still work and are reversible.
            </span>
          </li>
          <li className="text-[15px] leading-7 text-foreground flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
              -
            </span>
            <span>
              <strong>Terms of use:</strong> agents should read the{" "}
              <Link to={SANDBOX_TERMS_DOC_PATH} className={extLink}>
                sandbox terms of use
              </Link>{" "}
              on this site (same text as the JSON from{" "}
              <code>GET https://sandbox.neotoma.io/sandbox/terms</code>) before writing.
            </span>
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection title="Connect your agent" sectionKey="connect">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          Agent-driven: paste this prompt into the agent you want to connect. It handles the MCP
          config edit and runs a sanity check.
        </p>
        <CopyableCodeBlock code={AGENT_CONNECT_PROMPT} className="mb-6" />

        <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-6 mb-2">Cursor</h3>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Add this to <code>.cursor/mcp.json</code> and restart Cursor:
        </p>
        <CopyableCodeBlock code={CURSOR_REMOTE_MCP} className="mb-6" />

        <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-6 mb-2">Claude Code</h3>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Register the remote server on the CLI:
        </p>
        <CopyableCodeBlock code={CLAUDE_CODE_REMOTE_MCP} className="mb-6" />

        <p className="text-[14px] leading-6 text-muted-foreground">
          Other harnesses: see <Link to="/connect" className={extLink}>Connect a remote Neotoma</Link>{" "}
          for per-tool snippets (Claude Desktop, ChatGPT, Codex, OpenClaw). The live sandbox also
          renders a harness picker directly at its root URL -{" "}
          <a
            href={SANDBOX_ROOT_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            /
          </a>
          {" "}- with copy-paste snippets prefilled to the correct host.
        </p>
      </IntegrationSection>

      <IntegrationSection title="Inspect what you and others stored" sectionKey="inspector">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          The Inspector UI is public on the sandbox host. Browse the shared dataset-your writes and
          everyone else&apos;s-without installing anything:
        </p>
        <InspectorPreviewIllustration
          variant="sandbox"
          sandboxHost={SANDBOX_HOST}
          className="mb-5 max-w-3xl"
        />
        <p className="text-[15px] leading-7">
          <a
            href={SANDBOX_ROOT_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className={extLink}
          >
            Open the sandbox root →
          </a>
        </p>
      </IntegrationSection>

      <IntegrationSection title="Report abuse or broken data" sectionKey="report">
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          Because the sandbox is public, bad actors can store things that should not be there.
          Reports forward to a moderation queue and, when confirmed, trigger an early reset of the
          affected entity or the full dataset.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground mb-2">
          <li>
            Submit via <code>POST /sandbox/report</code> with{" "}
            <code>reason</code> + <code>description</code> (agents can use the MCP tool flow).
          </li>
          <li>
            Or use the Inspector&apos;s report button on any entity.
          </li>
        </ul>
      </IntegrationSection>

      <IntegrationSection title="When to install locally instead" sectionKey="when-local">
        <p className="text-[15px] leading-7 text-muted-foreground mb-3">
          The sandbox is great for evaluation and shareable examples. For anything else, install
          locally:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground mb-3">
          <li>You want your memory to persist past Sunday.</li>
          <li>You have private data (clients, finances, personal correspondence, code context).</li>
          <li>You need destructive admin operations (merge, split, full recompute).</li>
          <li>You want deterministic latency and a private Inspector.</li>
        </ul>
        <p className="text-[14px] leading-6 text-muted-foreground">
          <Link to="/install" className={extLink}>Install guide →</Link>
          {" · "}
          <Link to="/hosted" className={extLink}>Hosted options overview →</Link>
        </p>
      </IntegrationSection>
    </DetailPage>
  );
}
