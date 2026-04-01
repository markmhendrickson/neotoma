/**
 * About Page
 * 
 * Detailed information about Neotoma's architecture and capabilities
 */

import { Shield, Zap, Globe, Database, FileText, Calendar } from "lucide-react";

export function AboutPage() {
  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">About Neotoma</h1>
        <p className="text-lg text-muted-foreground mb-4">
          A deterministic state layer that transforms fragmented data into structured, queryable knowledge for AI agents.
        </p>
        <p className="text-muted-foreground">
          Neotoma builds persistent structured memory for AI agents through{" "}
          <strong>structured ingestion</strong>: agents and apps call <code className="text-sm">store</code>{" "}
          with typed entity payloads (MCP, CLI, or REST), and Neotoma validates, deduplicates, and
          records observations with full provenance. As you interact with ChatGPT, Claude, or Cursor,
          agents can read your accumulated memory, write new structured data, and correct mistakes with
          append-only history.
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Three architectural foundations</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy-first architecture
            </h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• User-controlled memory with end-to-end encryption</li>
              <li>• Row-level security for multi-user support</li>
              <li>• Your data remains yours with full export and deletion control</li>
              <li>• Never used for training or provider access</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Deterministic extraction
            </h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• Schema-first field extraction with reproducible results</li>
              <li>• Same input always produces same output</li>
              <li>• Full provenance: every field traces to its source</li>
              <li>• Hash-based entity IDs ensure tamper-evident entities</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Cross-platform access
            </h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• Works seamlessly with ChatGPT, Claude, and Cursor via MCP</li>
              <li>• One memory system across all your AI tools</li>
              <li>• No platform lock-in</li>
              <li>• Localhost agent compatible</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key capabilities</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5" />
              Entity resolution
            </h3>
            <p className="text-sm text-muted-foreground">
              Hash-based canonical IDs unify entities across all your data. "Acme Corp" in one invoice matches "Acme Corp" in agent-created data.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Timeline generation
            </h3>
            <p className="text-sm text-muted-foreground">
              Automatic chronological ordering from date fields creates timeline sequences across all stored data.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Structured ingestion
            </h3>
            <p className="text-sm text-muted-foreground">
              Typed entities via store (MCP, CLI, REST): schema validation, deduplication, and provenance
              without a server-side file interpretation pipeline.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
