/**
 * MCP ChatGPT Setup Page
 * 
 * Dedicated page for ChatGPT MCP server setup
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMCPConfig } from "@/hooks/useMCPConfig";

export function MCPChatGPTPage() {
  const {
    generateClaudeConfig,
    handleCopyConfig,
  } = useMCPConfig();

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">ChatGPT Setup</h1>
        <p className="text-muted-foreground">
          Install Neotoma MCP server in ChatGPT using Developer Mode or Custom GPTs.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>ChatGPT Installation</CardTitle>
            <CardDescription>
              Install Neotoma MCP server in ChatGPT
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Current Status</p>
              <p className="text-xs text-muted-foreground mb-3">
                ChatGPT has limited MCP support. Full MCP client support is available in <strong>ChatGPT Developer Mode</strong> (beta feature).
              </p>
              <p className="text-xs text-muted-foreground">
                For Custom GPTs, you&apos;ll need an HTTP gateway to bridge MCP servers to REST endpoints.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Option 1: ChatGPT Developer Mode (Recommended)</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Enable ChatGPT Developer Mode (beta feature in your ChatGPT account)</li>
                  <li>Create an OAuth connection in the <a href="/oauth" className="underline">OAuth</a> page</li>
                  <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build</code></li>
                  <li>Configure MCP server in Developer Mode settings</li>
                  <li>Use the HTTP-based configuration below (with your MCP server URL)</li>
                </ol>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Option 2: Custom GPT with HTTP Gateway</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Custom GPTs require an HTTP gateway to convert MCP tools to REST endpoints:
                </p>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Set up an HTTP gateway that exposes each MCP tool as a REST endpoint</li>
                  <li>Generate an OpenAPI specification for the gateway endpoints</li>
                  <li>Add the gateway as a Custom GPT Action</li>
                  <li>Configure OAuth authentication for the gateway</li>
                </ol>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>Note:</strong> This requires additional infrastructure setup. Consider using Developer Mode for easier integration.
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">MCP Server Configuration (HTTP)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyConfig(generateClaudeConfig(), "ChatGPT")}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Config
                </Button>
              </div>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {generateClaudeConfig()}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Use this HTTP-based configuration in ChatGPT Developer Mode. The URL points to your Neotoma MCP server endpoint.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Limitations</h2>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside mt-2">
              <li>ChatGPT doesn&apos;t have native one-click MCP installation like Cursor</li>
              <li>Full MCP support requires Developer Mode (beta, may not be available to all users)</li>
              <li>Custom GPTs require HTTP gateway setup (more complex than native MCP)</li>
              <li>MCP tools are dynamically discovered, while Custom GPTs need static OpenAPI specs</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Documentation</h2>
            <div className="mt-2">
              <a
                href="https://platform.openai.com/docs/guides/tools-connectors-mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                OpenAI MCP Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
