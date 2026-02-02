/**
 * MCP Grok Setup Page
 * 
 * Dedicated page for Grok (xAI) MCP server setup
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMCPConfig } from "@/hooks/useMCPConfig";

export function MCPGrokPage() {
  const {
    serverInfo,
    generateClaudeConfig,
    handleCopyConfig,
  } = useMCPConfig();

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Grok Setup</h1>
        <p className="text-muted-foreground">
          Install Neotoma MCP server in Grok (xAI).
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Grok MCP Installation</CardTitle>
            <CardDescription>
              Install Neotoma MCP server in Grok
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Configuration JSON</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyConfig(generateClaudeConfig(), "Grok")}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Config
                </Button>
              </div>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {generateClaudeConfig()}
              </pre>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Setup Steps</h2>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside mt-2">
              <li>Access Grok One-Shot or Grok interface with MCP support</li>
              <li>Create an OAuth connection in the <a href="/oauth" className="underline">OAuth</a> page (get your connection ID)</li>
              <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build</code></li>
              <li>Navigate to MCP settings in Grok</li>
              <li>Add the configuration above to your MCP servers list</li>
              <li>Restart Grok or refresh the connection</li>
              <li>Test connection by asking Grok to use Neotoma tools</li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Available Integrations</h2>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside mt-2">
              <li>Grok One-Shot (MCP-compatible interface)</li>
              <li>Grok API integrations via MCP servers</li>
              <li>Third-party MCP clients that support Grok</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Documentation</h2>
            <div className="mt-2">
              <a
                href="https://www.grok-one-shot.org/docs/build-with-claude-code/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Grok One-Shot MCP Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
