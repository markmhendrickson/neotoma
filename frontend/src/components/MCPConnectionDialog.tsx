/**
 * MCP Connection Dialog
 * 
 * Shows MCP connection instructions and sample queries for external AI agents
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";

interface MCPConnectionDialogProps {
  open: boolean;
  onClose: () => void;
}

export function MCPConnectionDialog({ open, onClose }: MCPConnectionDialogProps) {
  const { toast } = useToast();

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const sampleQueries = [
    "Show my recent transactions from last month",
    "Add a new task: Finish quarterly report",
    "List all my contacts at Acme Corp",
    "What invoices did I receive in December?",
    "Add transaction: $45.50 at Whole Foods for groceries",
    "Show timeline of events from last week",
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect AI Agent</DialogTitle>
          <DialogDescription>
            Connect your preferred AI assistant to query and add data via MCP
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* OAuth Notice */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm font-medium mb-1">OAuth Required</p>
            <p className="text-xs text-muted-foreground mb-3">
              MCP connections require OAuth authentication for secure access to your data.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/oauth">
                Set up OAuth Connection
                <ExternalLink className="ml-2 h-3 w-3" />
              </Link>
            </Button>
          </div>

          {/* Setup Instructions */}
          <Tabs defaultValue="cursor">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cursor">Cursor</TabsTrigger>
              <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
              <TabsTrigger value="claude">Claude</TabsTrigger>
            </TabsList>

            <TabsContent value="cursor" className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Cursor Setup</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Configure Neotoma MCP server in Cursor IDE
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/mcp/cursor">
                    View Full Setup Guide
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="chatgpt" className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">ChatGPT Setup</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Connect Neotoma to ChatGPT via MCP
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/mcp/chatgpt">
                    View Full Setup Guide
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="claude" className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Claude Setup</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Connect Neotoma to Claude Desktop via MCP
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/mcp/claude">
                    View Full Setup Guide
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Sample Queries */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Sample Queries</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Try these queries with your connected AI agent:
            </p>
            <div className="space-y-2">
              {sampleQueries.map((query, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                >
                  <code className="text-xs flex-1">{query}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(query, "Query")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Documentation Link */}
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              For complete documentation and advanced configuration:
            </p>
            <Button variant="outline" size="sm" asChild className="w-full">
              <a
                href="https://github.com/modelcontextprotocol/servers"
                target="_blank"
                rel="noopener noreferrer"
              >
                MCP Documentation
                <ExternalLink className="ml-2 h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
