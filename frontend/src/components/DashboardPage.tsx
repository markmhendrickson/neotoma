/**
 * Dashboard/Home Page
 * 
 * Main landing page after login
 */

import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Zap, Globe, Database, FileText, Calendar, Code } from "lucide-react";

export function DashboardPage() {
  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Neotoma: Truth Layer for AI Memory</h1>
        <p className="text-lg text-muted-foreground mb-4">
          A deterministic truth layer that transforms fragmented personal data into structured, queryable knowledge for AI agents.
        </p>
        <p className="text-muted-foreground">
          Neotoma builds persistent structured memory for AI agents through <strong>dual-path storing</strong>: upload documents (PDFs, images, receipts, contracts) that get automatically structured, or provide structured data during agent conversations that gets stored and integrated into your memory graph. As you interact with ChatGPT, Claude, or Cursor, agents can read your accumulated memory, write new structured data, correct mistakes, and trigger reinterpretation.
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Three Architectural Foundations</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy-First Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• User-controlled memory with end-to-end encryption</li>
                <li>• Row-level security for multi-user support</li>
                <li>• Your data remains yours with full export and deletion control</li>
                <li>• Never used for training or provider access</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Deterministic Extraction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Schema-first field extraction with reproducible results</li>
                <li>• Same input always produces same output</li>
                <li>• Full provenance: every field traces to its source</li>
                <li>• Hash-based entity IDs ensure tamper-evident records</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Cross-Platform Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Works seamlessly with ChatGPT, Claude, and Cursor via MCP</li>
                <li>• One memory system across all your AI tools</li>
                <li>• No platform lock-in</li>
                <li>• Localhost agent compatible</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Capabilities</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Entity Resolution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Hash-based canonical IDs unify entities across all your data. "Acme Corp" in one invoice matches "Acme Corp" in agent-created data.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timeline Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Automatic chronological ordering from date fields creates timeline sequences across all personal data.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Dual-Path Storing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                File uploads (PDFs, images, receipts) AND agent-created structured source during interactions.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Get Started</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Cursor Setup
              </CardTitle>
              <CardDescription>
                Install Neotoma MCP in Cursor
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/mcp/cursor">Setup Cursor</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                View Entities
              </CardTitle>
              <CardDescription>
                Explore your structured memory
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/entities">View Entities</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Manage Sources
              </CardTitle>
              <CardDescription>
                Upload and manage your documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/sources">View Sources</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
