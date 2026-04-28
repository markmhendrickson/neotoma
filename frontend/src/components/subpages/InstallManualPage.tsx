import { Link } from "react-router-dom";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CodeBlock } from "../InstallCodeBlock";
import { DetailPage } from "../DetailPage";

export function InstallManualPage() {
  return (
    <DetailPage title="Manual install">
      <p className="text-[15px] leading-7 mb-4">
        <Link
          to="/install"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          ← Install
        </Link>
      </p>

      <p className="text-[15px] leading-7 mb-4">If you prefer to run the commands yourself:</p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.installCommands}
        copyFeedbackId="install-copy-manual-commands"
        installBlock="manual_commands"
      />

      <h3 className="text-[17px] font-medium tracking-[-0.01em] mt-6 mb-3">After installation</h3>
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">
        Once installation is complete, activation follows. If evaluation already identified the
        first data to store, carry that forward. Otherwise determine it now, then run{" "}
        <strong className="text-foreground">{SITE_CODE_SNIPPETS.activationSequence}</strong>. After
        first value is visible, configure the current tool for robust ongoing usage.
      </p>
      <div className="mb-4 rounded-lg border border-border/60 bg-muted/30 p-3">
        <p className="text-[13px] leading-5 text-muted-foreground mb-2">
          <strong className="text-foreground">
            Troubleshooting: <code className="bg-muted px-1 py-0.5 rounded">which neotoma</code>{" "}
            fails after install?
          </strong>{" "}
          Your shell manager (mise, nvm, fnm) is probably not active in the agent's non-interactive
          shell. Run <code className="bg-muted px-1 py-0.5 rounded">neotoma doctor --json</code> and
          read <code className="bg-muted px-1 py-0.5 rounded">.neotoma.path_fix_hint</code> for the
          exact activation line. Common fixes to add to{" "}
          <code className="bg-muted px-1 py-0.5 rounded">~/.zshenv</code> or{" "}
          <code className="bg-muted px-1 py-0.5 rounded">~/.zshrc</code>:
        </p>
        <pre className="overflow-x-auto rounded bg-muted/60 p-2 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words">
          <code>{`mise:  eval "$(mise activate zsh)"
nvm:   source "$NVM_DIR/nvm.sh"   # in ~/.zshenv for non-interactive shells
fnm:   eval "$(fnm env)"`}</code>
        </pre>
      </div>
      <ol className="list-decimal pl-5 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Preference selection</strong> - if evaluation already
          established the priority data types and onboarding mode, carry them forward. Otherwise
          choose which data types matter most (project files, chat transcripts, meeting notes,
          financial docs, code context, custom paths) and pick a mode: quick win, guided, or power
          user.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Discovery</strong> - continue from any candidate data
          already identified during evaluation. If that work has not happened yet, the agent scans
          shallowly based on your preferences, groups results into domains (not file counts), and
          checks for chat transcript exports and platform memory.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Propose and confirm</strong> - for each domain the
          agent explains why it was selected, what entities it likely contains, and what timeline
          value it could unlock. You confirm per-folder or per-file before anything is stored.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Ingest and reconstruct</strong> - confirmed files are
          ingested and the agent reconstructs the strongest timeline with provenance - every event
          traced to a specific source file.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Query and correct</strong> - the agent surfaces a
          follow-up query against the reconstructed timeline and offers next actions, then asks
          whether the timeline is accurate and supports corrections (wrong merge, wrong date, source
          exclusion).
        </li>
      </ol>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Try it now</h2>
      <p className="text-[15px] leading-7 mb-4">
        Once Neotoma is running, try these prompts in any connected tool to see it working:
      </p>
      <div className="space-y-3 mb-8">
        <div className="rounded-lg border border-border p-4">
          <p className="text-[14px] font-medium text-foreground mb-1">Store a contact</p>
          <p className="text-[13px] leading-6 text-muted-foreground mb-2">
            &ldquo;Remember that Sarah Chen&apos;s email is sarah@newstartup.io. She started there
            in March.&rdquo;
          </p>
          <p className="text-[12px] text-muted-foreground/70">
            Then in a different session or tool: &ldquo;What&apos;s Sarah Chen&apos;s email?&rdquo;
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[14px] font-medium text-foreground mb-1">Track a commitment</p>
          <p className="text-[13px] leading-6 text-muted-foreground mb-2">
            &ldquo;I told Nick I&apos;d send the architecture doc by Friday.&rdquo;
          </p>
          <p className="text-[12px] text-muted-foreground/70">
            Later: &ldquo;What did I commit to this week?&rdquo;
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[14px] font-medium text-foreground mb-1">Test a correction</p>
          <p className="text-[13px] leading-6 text-muted-foreground mb-2">
            &ldquo;Actually, Sarah&apos;s email changed to sarah@acme.co.&rdquo;
          </p>
          <p className="text-[12px] text-muted-foreground/70">
            Then: &ldquo;What&apos;s Sarah&apos;s email? Show me the history.&rdquo; Both old and
            new are preserved with timestamps.
          </p>
        </div>
      </div>

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">
        Start the API server
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The API server provides the HTTP interface that MCP and the CLI communicate through.
      </p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.postInstallCommands}
        copyFeedbackId="install-copy-post-install"
        installBlock="post_install_commands"
      />

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">Connect MCP</h2>
      <p className="text-[15px] leading-7 mb-4">
        Add Neotoma to your MCP client configuration (Cursor, Claude, or Codex):
      </p>
      <CodeBlock
        code={SITE_CODE_SNIPPETS.stdioConfigJson}
        copyFeedbackId="install-copy-stdio-mcp"
        installBlock="stdio_mcp"
      />
      <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
        <p className="text-[14px] leading-6 mb-0">
          <strong>After adding MCP config:</strong> restart your AI tool (Claude Code, Cursor,
          Claude Desktop, etc.) so it picks up the new server. MCP servers are loaded at startup.
        </p>
      </div>
    </DetailPage>
  );
}
