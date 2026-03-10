import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { REPO_RELEASES_COUNT, REPO_VERSION } from "@/site/site_data";

export function ChangelogPage() {
  return (
    <DetailPage title="Changelog and release notes">
      <p className="text-[15px] leading-7 mb-4">
        Current developer release: <strong>{REPO_VERSION}</strong>. Published releases:{" "}
        <strong>{REPO_RELEASES_COUNT}</strong>.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Use this page as the index for release history, migration notes, and compatibility changes. For full
        commit-level context, reference GitHub releases and the in-repo release docs.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-3">Primary release sources</h2>
      <ul className="list-none pl-0 space-y-2 mb-8">
        <li className="text-[15px] leading-7">
          <a
            href="https://github.com/markmhendrickson/neotoma/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            GitHub releases
          </a>{" "}
          — canonical tagged release history
        </li>
        <li className="text-[15px] leading-7">
          <a
            href="https://github.com/markmhendrickson/neotoma/tree/main/docs/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            In-repo release docs
          </a>{" "}
          — implementation notes and status docs
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-3">Recommended upgrade checklist</h2>
      <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 mb-8">
        <li>Review release notes for schema or behavior changes.</li>
        <li>Test MCP/CLI flows in a staging environment.</li>
        <li>Validate deterministic outputs on representative workloads.</li>
        <li>Update integration configs if transport or command paths changed.</li>
      </ol>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Continue with{" "}
        <Link to="/troubleshooting" className="text-foreground underline underline-offset-2 hover:no-underline">
          troubleshooting
        </Link>
        ,{" "}
        <Link to="/schema-management" className="text-foreground underline underline-offset-2 hover:no-underline">
          schema management
        </Link>
        , and{" "}
        <Link to="/architecture" className="text-foreground underline underline-offset-2 hover:no-underline">
          architecture
        </Link>
        .
      </p>
    </DetailPage>
  );
}
