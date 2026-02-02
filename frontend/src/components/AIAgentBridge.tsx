/**
 * AI Agent Bridge Component
 * 
 * Provides "Talk to AI" integration that opens external agents with context
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Sparkles } from "lucide-react";
import { MCPConnectionDialog } from "./MCPConnectionDialog";

export function AIAgentBridge() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Talk to AI</CardTitle>
          </div>
          <CardDescription>
            Connect your preferred AI assistant to query and add data conversationally
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Neotoma integrates with external AI agents (Cursor, ChatGPT, Claude) via the Model
              Context Protocol (MCP). Connect your assistant to interact with your data using
              natural language.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setShowDialog(true)} className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Connect AI Agent
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open("/mcp/cursor", "_blank")}
              >
                View Cursor Setup
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open("/mcp/chatgpt", "_blank")}
              >
                View ChatGPT Setup
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open("/mcp/claude", "_blank")}
              >
                View Claude Setup
              </Button>
            </div>
            <div className="bg-background/50 rounded-lg p-3 border">
              <p className="text-xs font-medium mb-2">What you can do:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Query your data: "Show my recent transactions"</li>
                <li>• Add new data: "Add a task to finish the report"</li>
                <li>• Search entities: "Find all contacts at Acme Corp"</li>
                <li>• Explore timeline: "What happened last week?"</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <MCPConnectionDialog open={showDialog} onClose={() => setShowDialog(false)} />
    </>
  );
}
