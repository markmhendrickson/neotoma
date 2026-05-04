import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { IntegrationSection } from "../IntegrationSection";

function CodeSnippet({ children }: { children: string }) {
  return (
    <pre className="rounded-md border border-border bg-muted/30 px-4 py-3 text-[13px] leading-6 overflow-x-auto mb-4">
      <code>{children}</code>
    </pre>
  );
}

export function BackupGuidePage() {
  return (
    <DetailPage title="Backup and restore">
      <p className="text-[15px] leading-7 mb-4">
        Neotoma stores everything in a single SQLite database, a sources directory for raw file
        artifacts, and log files. All three live under the data directory
        (<code>~/.local/share/neotoma</code> by default). Backing up Neotoma means copying these
        files to a safe location; restoring means putting them back.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-6">
        The CLI provides <code>neotoma backup create</code> and{" "}
        <code>neotoma backup restore</code> to automate both directions with checksums and a
        manifest.
      </p>

      <IntegrationSection title="Create a backup" sectionKey="create" dividerBefore={false}>
        <CodeSnippet>{`neotoma backup create`}</CodeSnippet>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Creates a timestamped backup directory containing the SQLite database, the sources
          directory, and log files. A <code>manifest.json</code> is written with SHA-256 checksums
          for each file so you can verify integrity later.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Pass <code>--output &lt;dir&gt;</code> to specify a custom backup location. Without it,
          backups are written to <code>&lt;data-dir&gt;/backups/</code>.
        </p>
      </IntegrationSection>

      <IntegrationSection title="Restore from a backup" sectionKey="restore">
        <CodeSnippet>{`neotoma backup restore --from <backup-dir>`}</CodeSnippet>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Restores the database, sources, and logs from a backup directory into the active data
          directory. Stop the API server before restoring.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Pass <code>--target &lt;dir&gt;</code> to restore into a different data directory. The CLI
          verifies manifest checksums before overwriting.
        </p>
      </IntegrationSection>

      <IntegrationSection title="Storage layout" sectionKey="layout">
        <p className="text-[14px] leading-6 text-muted-foreground mb-3">
          Use <code>neotoma storage info</code> to see the current layout:
        </p>
        <CodeSnippet>{`neotoma storage info
# Data directory:   ~/.local/share/neotoma
# Database:         ~/.local/share/neotoma/neotoma.db
# Sources:          ~/.local/share/neotoma/sources/
# Logs:             ~/.local/share/neotoma/logs/`}</CodeSnippet>
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          Use <code>neotoma storage set-data-dir &lt;path&gt;</code> to relocate the data directory.
          The command optionally migrates the existing database to the new location.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Use <code>neotoma storage merge-db</code> to merge two SQLite databases (safe mode by
          default: the target database is not modified until checksums pass).
        </p>
      </IntegrationSection>

      <IntegrationSection title="Encryption" sectionKey="encryption">
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          If encryption is enabled, backed-up data stays encrypted. When restoring, you need the same
          encryption key file or mnemonic that was active when the backup was created. Without it the
          database will be unreadable.
        </p>
        <p className="text-[14px] leading-6 text-muted-foreground">
          Store your key file or mnemonic separately from the backup, ideally in a password
          manager or offline vault.
        </p>
      </IntegrationSection>

      <IntegrationSection title="Recovery" sectionKey="recovery">
        <p className="text-[14px] leading-6 text-muted-foreground mb-2">
          If the SQLite database becomes corrupted (e.g.{" "}
          <code>database disk image is malformed</code>), run:
        </p>
        <CodeSnippet>{`neotoma storage recover-db          # check integrity
neotoma storage recover-db --recover  # rebuild (stop API first)`}</CodeSnippet>
        <p className="text-[14px] leading-6 text-muted-foreground">
          The recovery command uses SQLite&rsquo;s <code>.recover</code> to rebuild the database from
          surviving pages. Never swap the recovered database in place while the API server is running.
        </p>
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground mt-8">
        See{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>{" "}
        for all backup and storage commands,{" "}
        <Link to="/troubleshooting" className="text-foreground underline underline-offset-2 hover:no-underline">
          troubleshooting
        </Link>{" "}
        for common failure modes, and{" "}
        <Link to="/what-to-store" className="text-foreground underline underline-offset-2 hover:no-underline">
          what to store
        </Link>{" "}
        for guidance on what to put in Neotoma in the first place.
      </p>
    </DetailPage>
  );
}
