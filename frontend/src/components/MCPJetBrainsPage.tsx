/**
 * MCP JetBrains Setup Page
 * 
 * Dedicated page for JetBrains IDEs (IntelliJ IDEA, WebStorm, etc.) MCP server setup
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMCPConfig } from "@/hooks/useMCPConfig";
import { SiJetbrains } from "react-icons/si";

export function MCPJetBrainsPage() {
  const {
    serverInfo,
    generateClaudeConfig,
    handleCopyConfig,
  } = useMCPConfig();

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">JetBrains Setup</h1>
        <p className="text-muted-foreground">
          Install Neotoma MCP server in JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.).
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>JetBrains MCP Installation</CardTitle>
            <CardDescription>
              Install Neotoma MCP server in JetBrains IDEs
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
                  onClick={() => handleCopyConfig(generateClaudeConfig(), "JetBrains")}
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
              <li>Open your JetBrains IDE (IntelliJ IDEA, WebStorm, PyCharm, etc.)</li>
              <li>Create an OAuth connection in the <a href="/oauth" className="underline">OAuth</a> page (get your connection ID)</li>
              <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build</code></li>
              <li>Install the MCP plugin (if available) or configure via Settings</li>
              <li>Navigate to Settings → Tools → MCP Servers</li>
              <li>Add the configuration above to your MCP servers list</li>
              <li>Restart your IDE</li>
              <li>Test connection by asking the AI assistant to use Neotoma tools</li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Supported JetBrains IDEs</h2>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside mt-2">
              <li>IntelliJ IDEA</li>
              <li>WebStorm</li>
              <li>PyCharm</li>
              <li>PhpStorm</li>
              <li>RubyMine</li>
              <li>GoLand</li>
              <li>Rider</li>
              <li>CLion</li>
              <li>Other JetBrains IDEs with MCP support</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Documentation</h2>
            <div className="mt-2">
              <a
                href="https://www.jetbrains.com/help"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                JetBrains Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
