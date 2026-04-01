import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function DatabaseMemoryPage() {
  return (
    <DetailPage title="Database memory">
      <p className="text-[15px] leading-7 mb-4">
        Database memory uses a relational database (SQLite, Postgres, MySQL) with standard CRUD
        operations to store agent state. It provides strong consistency, column-level type
        enforcement, and fast structured queries.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        The standard approach is to update rows in place. This gives you the current state but
        loses previous values unless you build audit tables, trigger-based history tracking, or an
        event log on top. Without that additional architecture, a database is a mutable snapshot
        store.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`-- Agent A writes a value
UPDATE contacts SET city = 'Barcelona' WHERE name = 'Ana Rivera';

-- Agent B overwrites it
UPDATE contacts SET city = 'San Francisco' WHERE name = 'Ana Rivera';

-- Previous value is gone. No conflict detection, no history.
SELECT city FROM contacts WHERE name = 'Ana Rivera';
-- -> 'San Francisco'`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        Databases are familiar and powerful, but standard CRUD usage actively works against memory
        guarantees. You can build versioning, audit trails, and conflict detection on top of a
        database, but at that point you are building the observation/reducer architecture that
        Neotoma already provides. See{" "}
        <Link to="/deterministic-memory" className="text-foreground underline hover:text-foreground">
          deterministic memory
        </Link>
        ,{" "}
        <Link to="/silent-mutation-risk" className="text-foreground underline hover:text-foreground">
          silent mutation risk
        </Link>
        , and{" "}
        <Link to="/neotoma-vs-database" className="text-foreground underline hover:text-foreground">
          Neotoma vs database memory
        </Link>
        .
      </p>
    </DetailPage>
  );
}
