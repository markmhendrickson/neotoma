/**
 * MCP Codeium Setup Page
 * 
 * Dedicated page for Codeium MCP server setup
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMCPConfig } from "@/hooks/useMCPConfig";
import { SiCodeium } from "react-icons/si";

export function MCPCodeiumPage() {
  const {
    serverInfo,
    generateClaudeConfig,
    handleCopyConfig,
  } = useMCPConfig();

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Codeium Setup</h1>
        <p className="text-muted-foreground">
          Install Neotoma MCP server in Codeium.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Codeium MCP Installation</CardTitle>
            <CardDescription>
              Install Neotoma MCP server in Codeium
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
                  onClick={() => handleCopyConfig(generateClaudeConfig(), "Codeium")}
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
              <li>Open Codeium in your IDE or editor</li>
              <li>Create an OAuth connection in the <a href="/oauth" className="underline">OAuth</a> page (get your connection ID)</li>
              <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build</code></li>
              <li>Navigate to Codeium Settings → Integrations or MCP</li>
              <li>Add the configuration above to your MCP servers list</li>
              <li>Restart Codeium or refresh the connection</li>
              <li>Test connection by asking Codeium to use Neotoma tools</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Codeium Integration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Codeium is actively working with MCP to enhance AI coding capabilities. 
              MCP support may vary by IDE/editor integration. Check Codeium documentation for 
              the latest MCP support status in your specific editor.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href="https://codeium.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              Codeium Documentation
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
