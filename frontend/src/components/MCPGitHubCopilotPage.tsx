/**
 * MCP GitHub Copilot Setup Page
 * 
 * Dedicated page for GitHub Copilot MCP server setup
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMCPConfig } from "@/hooks/useMCPConfig";

export function MCPGitHubCopilotPage() {
  const {
    serverInfo,
    generateClaudeConfig,
    handleCopyConfig,
  } = useMCPConfig();

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">GitHub Copilot Setup</h1>
        <p className="text-muted-foreground">
          Install Neotoma MCP server in GitHub Copilot (VS Code).
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>GitHub Copilot Installation</CardTitle>
            <CardDescription>
              Install Neotoma MCP server in GitHub Copilot
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
                  onClick={() => handleCopyConfig(generateClaudeConfig(), "GitHub Copilot")}
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
              <li>Install GitHub Copilot extension in VS Code</li>
              <li>Create an OAuth connection in the <a href="/oauth" className="underline">OAuth</a> page (get your connection ID)</li>
              <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build</code></li>
              <li>Open VS Code settings</li>
              <li>Navigate to Copilot → MCP Servers</li>
              <li>Add the configuration above to your MCP servers list</li>
              <li>Restart VS Code</li>
              <li>Test connection by asking Copilot Chat to use Neotoma tools</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>VS Code version 1.99 or later</li>
              <li>GitHub Copilot subscription (Free, Pro, Business, or Enterprise)</li>
              <li>MCP access enabled (may require organizational policy for Business/Enterprise)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href="https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-chat-with-mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              GitHub Copilot MCP Documentation
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
