import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function FileBasedMemoryPage() {
  return (
    <DetailPage title="File-based memory">
      <p className="text-[15px] leading-7 mb-4">
        File-based memory stores state in Markdown, JSON, or similar artifacts. It is portable and easy to edit
        directly, but integrity guarantees are manual.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        Typical implementations append notes or overwrite JSON blobs. Without a deterministic reducer and
        observation lineage, teams rely on ad-hoc conventions for conflict handling.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "contact": "Ana Rivera",
  "city": "Barcelona"
}

# Later overwrite
{
  "contact": "Ana Rivera",
  "city": "San Francisco"
}`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        This model can work for lightweight workflows but usually fails deterministic guarantees at scale. See{" "}
        <Link to="/platform-memory" className="text-foreground underline hover:text-foreground">
          platform memory
        </Link>
        ,{" "}
        <Link to="/deterministic-memory" className="text-foreground underline hover:text-foreground">
          deterministic memory
        </Link>
        ,{" "}
        <Link to="/schema-constraints" className="text-foreground underline hover:text-foreground">
          schema constraints
        </Link>
        , and{" "}
        <Link to="/memory-vendors" className="text-foreground underline hover:text-foreground">
          memory model comparison
        </Link>
        .
      </p>
    </DetailPage>
  );
}
