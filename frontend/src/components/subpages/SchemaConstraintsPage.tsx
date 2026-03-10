import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function SchemaConstraintsPage() {
  return (
    <DetailPage title="Schema constraints">
      <p className="text-[15px] leading-7 mb-4">
        Entities conform to defined types and validation rules. Invalid writes fail at store time so malformed
        data does not silently enter the memory graph.
      </p>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Before vs after</h2>
      <p className="text-[15px] leading-7 mb-4">
        Before: one tool stores <code>age: "thirty"</code> while another expects a number. After: schema
        validation rejects the invalid write and returns a deterministic error.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`# Invalid payload example
neotoma store --json='[{"entity_type":"person","name":"Ana Rivera","age":"thirty"}]'

# Valid payload
neotoma store --json='[{"entity_type":"person","name":"Ana Rivera","age":30}]'`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        This protects{" "}
        <Link to="/deterministic-state-evolution" className="text-foreground underline hover:text-foreground">
          deterministic state evolution
        </Link>{" "}
        and reduces{" "}
        <Link to="/silent-mutation-risk" className="text-foreground underline hover:text-foreground">
          silent mutation risk
        </Link>
        . See{" "}
        <Link to="/conflicting-facts-risk" className="text-foreground underline hover:text-foreground">
          conflicting facts risk
        </Link>{" "}
        for conflict handling.
      </p>
    </DetailPage>
  );
}
