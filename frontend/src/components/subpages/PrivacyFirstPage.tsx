import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function PrivacyFirstPage() {
  return (
    <DetailPage title="Privacy-first">
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
        third-party service. The privacy guarantee is architectural, not policy-based: there is no
        remote endpoint to breach because the data never leaves your machine.
      </p>
      <p className="text-[15px] leading-7">
        See{" "}
        <Link to="/deterministic-memory" className="text-foreground underline hover:text-foreground">
          deterministic memory
        </Link>{" "}
        for the state evolution model,{" "}
        <Link to="/architecture" className="text-foreground underline hover:text-foreground">
          architecture
        </Link>{" "}
        for the full system design, and{" "}
        <Link to="/cross-platform" className="text-foreground underline hover:text-foreground">
          cross-platform
        </Link>{" "}
        for how this works across AI tools.
      </p>
    </DetailPage>
  );
}
