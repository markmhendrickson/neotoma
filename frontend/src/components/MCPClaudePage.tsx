/**
 * MCP Claude Setup Page
 * 
 * Dedicated page for Claude Desktop MCP server setup
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMCPConfig } from "@/hooks/useMCPConfig";

export function MCPClaudePage() {
  const {
    serverInfo,
    generateClaudeConfig,
    handleCopyConfig,
  } = useMCPConfig();

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Claude Desktop Setup</h1>
        <p className="text-muted-foreground">
          Install Neotoma MCP server in Claude Desktop.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Claude Desktop Installation</CardTitle>
            <CardDescription>
              Install Neotoma MCP server in Claude Desktop
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
                  onClick={() => handleCopyConfig(generateClaudeConfig(), "Claude")}
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

        <Card>
          <CardHeader>
            <CardTitle>Setup Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Create an OAuth connection in the <a href="/oauth" className="underline">OAuth</a> page (get your connection ID)</li>
              <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build</code></li>
              <li>Open Claude Desktop settings</li>
              <li>Locate your Claude Desktop config file:
                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                  <li><strong>macOS:</strong> <code className="bg-muted px-1 py-0.5 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
                  <li><strong>Windows:</strong> <code className="bg-muted px-1 py-0.5 rounded">%APPDATA%\Claude\claude_desktop_config.json</code></li>
                  <li><strong>Linux:</strong> <code className="bg-muted px-1 py-0.5 rounded">~/.config/Claude/claude_desktop_config.json</code></li>
                </ul>
              </li>
              <li>Add the configuration above to <code className="bg-muted px-1 py-0.5 rounded">claude_desktop_config.json</code></li>
              <li>Restart Claude Desktop</li>
              <li>Test connection by asking Claude to use Neotoma tools</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration File Example</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              Your <code className="bg-muted px-1 py-0.5 rounded">claude_desktop_config.json</code> should look like:
            </p>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`{
  "mcpServers": {
    "neotoma": {
      "url": "${serverInfo?.mcpUrl || "http://localhost:8080/mcp"}"
    }
  }
}`}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href="https://github.com/yourusername/neotoma/blob/main/docs/developer/mcp_claude_code_setup.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View complete setup guide
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
