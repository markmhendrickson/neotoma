import { ICP_PROFILES } from "../../site/site_data";
import { IcpDetailPage } from "./IcpDetailPage";

const profile = ICP_PROFILES.find((p) => p.slug === "knowledge-workers")!;

export function KnowledgeWorkersPage() {
  return (
    <IcpDetailPage
      profile={profile}
      aiNeeds={[
        "Entity resolution that unifies people, companies, and locations across all documents",
        "Automatic timeline construction from date fields scattered across sources",
        "Cross-document reasoning — connect facts from contracts, emails, notes, and reports",
        "Confidence in search results: structured queries that don't miss relevant documents",
        "Audit trails for decisions and analysis that can be reconstructed months later",
      ]}
      deepPainPoints={[
        {
          heading: "Entity fragmentation across documents",
          body: (
            <p>
              The same company appears as "Acme Corp", "ACME", and "Acme Corporation" across
              contracts, invoices, and correspondence. Current tools treat these as separate strings.
              You manually track which references point to the same entity — or miss connections
              entirely.
            </p>
          ),
        },
        {
          heading: "Contradictory facts with no resolution",
          body: (
            <p>
              One document says the contract expires in March, another says April. Without
              versioned state and provenance, there's no way to determine which is current. AI
              tools surface whichever document they retrieved — not the ground truth.
            </p>
          ),
        },
        {
          heading: "Decisions that can't be reconstructed",
          body: (
            <p>
              Six months after a critical analysis, you need to understand what was known at the
              time and why a particular conclusion was reached. But the documents have been updated,
              the AI context is gone, and the reasoning chain is lost.
            </p>
          ),
        },
      ]}
      solutions={[
        {
          heading: "Canonical entity resolution with hash-based IDs",
          body: (
            <p>
              Neotoma assigns deterministic IDs to entities and merges observations across all
              sources. "Acme Corp" and "ACME" resolve to the same entity with a unified snapshot.
            </p>
          ),
        },
        {
          heading: "Automatic timeline construction",
          body: (
            <p>
              Date fields extracted from documents become timeline events. Query "What happened
              with Company X in Q1?" and get a chronological view across all sources.
            </p>
          ),
        },
        {
          heading: "Relationship graph across sources",
          body: (
            <p>
              Entities connect through typed relationships — contracts link to companies, people
              link to organizations, events link to locations. Traverse the graph to find
              connections that keyword search misses.
            </p>
          ),
        },
        {
          heading: "Point-in-time replay for decisions",
          body: (
            <p>
              Inspect any entity snapshot at any historical point. See what observations existed
              when a decision was made. Diff versions to understand what changed and when.
            </p>
          ),
        },
      ]}
      dataTypeDetails={[
        { type: "person", description: "People with canonical identity across all documents and references" },
        { type: "company", description: "Organizations resolved across name variations, with linked contracts and contacts" },
        { type: "contract", description: "Agreements with parties, terms, dates, and linked entities" },
        { type: "event", description: "Dated occurrences — meetings, deadlines, milestones, incidents" },
        { type: "relationship", description: "Typed connections between entities (e.g. PARTY_TO, WORKS_AT, OWNS)" },
        { type: "note", description: "Analysis notes, research observations, and synthesis artifacts" },
        { type: "contact", description: "Communication details linked to canonical person entities" },
        { type: "citation", description: "Source references with provenance linking back to original documents" },
      ]}
      closingStatement="Knowledge workers depend on accurate cross-document reasoning. Neotoma gives you entity resolution, automatic timelines, and point-in-time replay — so every fact traces back to its source and every analysis is reconstructable."
    />
  );
}
