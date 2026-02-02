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
          A deterministic truth layer that transforms fragmented personal data into structured, queryable knowledge for AI agents.
        </p>
        <p className="text-muted-foreground">
          Neotoma builds persistent structured memory for AI agents through <strong>dual-path storing</strong>: upload documents (PDFs, images, receipts, contracts) that get automatically structured, or provide structured data during agent conversations that gets stored and integrated into your memory graph. As you interact with ChatGPT, Claude, or Cursor, agents can read your accumulated memory, write new structured data, correct mistakes, and trigger reinterpretation.
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
              <li>• Hash-based entity IDs ensure tamper-evident records</li>
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
              Automatic chronological ordering from date fields creates timeline sequences across all personal data.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dual-path storing
            </h3>
            <p className="text-sm text-muted-foreground">
              File uploads (PDFs, images, receipts) AND agent-created structured source during interactions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
