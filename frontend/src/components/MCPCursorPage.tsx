/**
 * MCP Cursor Setup Page
 *
 * Dedicated page for Cursor MCP server setup
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Copy, ExternalLink, Download, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMCPConfig } from "@/hooks/useMCPConfig";

export function MCPCursorPage() {
  const { toast } = useToast();
  const {
    activeConnectionId,
    configCopied,
    generateCursorConfig,
    generateClaudeConfig,
    generateCursorInstallLink,
    handleCopyConfig,
    handleDownloadConfig,
  } = useMCPConfig();

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Cursor Setup</h1>
        <p className="text-muted-foreground">
          Install Neotoma MCP server in Cursor with one click or manual setup.
        </p>
      </div>

      <div className="space-y-4">
        {/* Add to Cursor Widget */}
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Add to Cursor</span>
            </CardTitle>
            <CardDescription>Install Neotoma MCP server in Cursor with one click</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Official Cursor Install Button */}
            {generateCursorInstallLink() ? (
              <div className="flex flex-col items-center gap-3">
                <a
                  href={generateCursorInstallLink() || "#"}
                  className="inline-block"
                  onClick={(e) => {
                    setTimeout(() => {
                      const config = generateCursorConfig();
                      handleCopyConfig(config, "Cursor");
                    }, 1000);
                  }}
                >
                  {/* Light mode button */}
                  <img
                    src="https://cursor.com/deeplink/mcp-install-light.png"
                    alt="Add Neotoma MCP server to Cursor"
                    className="h-8 cursor-pointer hover:opacity-80 transition-opacity dark:hidden"
                    style={{ maxHeight: 32 }}
                  />
                  {/* Dark mode button */}
                  <img
                    src="https://cursor.com/deeplink/mcp-install-dark.png"
                    alt="Add Neotoma MCP server to Cursor"
                    className="h-8 cursor-pointer hover:opacity-80 transition-opacity hidden dark:block"
                    style={{ maxHeight: 32 }}
                  />
                </a>
                <p className="text-xs text-muted-foreground text-center">
                  Click the button above to install Neotoma MCP server in Cursor.
                  {!activeConnectionId && (
                    <span className="block mt-1 text-yellow-600 dark:text-yellow-400">
                      <strong>Note:</strong> After installation, create an OAuth connection in the{" "}
                      <a href="/oauth" className="underline">
                        OAuth
                      </a>{" "}
                      page, then update your{" "}
                      <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> with
                      the connection ID, or use the "Copy Configuration" button below.
                    </span>
                  )}
                </p>
                {/* Debug: Show the deeplink for troubleshooting */}
                {import.meta.env.DEV && (
                  <details className="w-full mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      Debug: View deeplink
                    </summary>
                    <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-x-auto">
                      {generateCursorInstallLink()}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-xs text-yellow-900 dark:text-yellow-100">
                  Unable to generate install link.
                </p>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Alternative: Manual Setup</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => {
                    const config = generateCursorConfig();
                    handleCopyConfig(config, "Cursor");
                  }}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  {configCopied ? (
                    <>
                      <Check className="h-5 w-5 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5 mr-2" />
                      Copy Configuration
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => {
                    const config = generateCursorConfig();
                    handleDownloadConfig(config);
                  }}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Download mcp.json
                </Button>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">Quick Setup:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Copy or download the configuration above</li>
                <li>
                  Create <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> in
                  your project root
                </li>
                <li>Paste the configuration and update paths if needed</li>
                <li>Restart Cursor to activate the MCP server</li>
              </ol>
            </div>
            {!activeConnectionId && (
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-xs text-yellow-900 dark:text-yellow-100">
                  <strong>Tip:</strong> For secure, long-lived connections, create an OAuth
                  connection first in the{" "}
                  <a href="/oauth" className="underline">
                    OAuth
                  </a>{" "}
                  page, then return here to generate the config with your connection ID.
                </p>
              </div>
            )}
            {activeConnectionId && (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-xs text-green-900 dark:text-green-100">
                  <strong>✓ OAuth Ready:</strong> Configuration will use OAuth connection ID:{" "}
                  <code className="bg-green-100 dark:bg-green-900 px-1 py-0.5 rounded">
                    {activeConnectionId}
                  </code>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cursor configuration (stdio)</CardTitle>
            <CardDescription>
              Use this if you run the MCP server locally with{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">command</code> +{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">args</code>. Create or edit{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> in your
              project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Configuration JSON</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyConfig(generateCursorConfig(), "Cursor")}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadConfig(generateCursorConfig())}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {generateCursorConfig()}
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cursor configuration (HTTP URL)</CardTitle>
            <CardDescription>
              Use this if your{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">mcp.json</code> has{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">url</code> (e.g. after Add to
              Cursor). Cursor usually does not show a Connect button for URL servers; the{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">X-Connection-Id</code> header
              authenticates you. Create an OAuth connection on the{" "}
              <a href="/oauth" className="underline">
                OAuth
              </a>{" "}
              page first, then copy this config.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Configuration JSON</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyConfig(generateClaudeConfig(), "Cursor (HTTP)")}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadConfig(generateClaudeConfig())}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {generateClaudeConfig()}
              </pre>
            </div>
            {!activeConnectionId && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Create an OAuth connection on the{" "}
                <a href="/oauth" className="underline">
                  OAuth
                </a>{" "}
                page; the config above will then include{" "}
                <code className="bg-muted px-1 py-0.5 rounded">X-Connection-Id</code> so tools
                appear without a Connect button.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                Build the MCP server:{" "}
                <code className="bg-muted px-1 py-0.5 rounded">npm run build</code>
              </li>
              <li>
                Create/edit <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code>{" "}
                with the configuration above
              </li>
              <li>Restart Cursor to detect the new MCP server</li>
              <li>Test connection by asking Cursor to use Neotoma actions</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Troubleshooting</CardTitle>
            <CardDescription>Common errors when using Add to Cursor</CardDescription>
          </CardHeader>
          <CardContent>
            <details className="group">
              <summary className="text-sm font-medium cursor-pointer list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                <span className="transition group-open:rotate-90">▸</span>
                No Connect button / &quot;No tools, prompts, or resources&quot;
              </summary>
              <div className="mt-2 pl-4 text-sm text-muted-foreground space-y-2">
                <p>
                  Cursor often does not show a Connect button for URL-based MCP servers. Use the{" "}
                  <strong>Cursor configuration (HTTP URL)</strong> block above: create an OAuth
                  connection on the{" "}
                  <a href="/oauth" className="underline">
                    OAuth
                  </a>{" "}
                  page, then copy that config (it will include{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">headers.X-Connection-Id</code>).
                  Replace your <code className="bg-muted px-1 py-0.5 rounded">neotoma</code> entry
                  in <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> with it
                  and restart Cursor.
                </p>
              </div>
            </details>
            <details className="group">
              <summary className="text-sm font-medium cursor-pointer list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                <span className="transition group-open:rotate-90">▸</span>
                &quot;neotoma2 must have command or url&quot;
              </summary>
              <div className="mt-2 pl-4 text-sm text-muted-foreground space-y-2">
                <p>
                  Cursor reports this when an MCP server entry in{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> has no{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">command</code> (stdio) or{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">url</code> (SSE). Often this is a
                  duplicate or leftover <strong>neotoma2</strong> entry.
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Open <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> in
                    your project.
                  </li>
                  <li>
                    Remove any <strong>neotoma2</strong> or duplicate <strong>neotoma</strong>{" "}
                    entry.
                  </li>
                  <li>
                    Use <strong>Add to Cursor</strong> again, or <strong>Copy Configuration</strong>{" "}
                    and replace the <strong>neotoma</strong> block. Ensure it includes{" "}
                    <code className="bg-muted px-1 py-0.5 rounded">command</code> and{" "}
                    <code className="bg-muted px-1 py-0.5 rounded">args</code>.
                  </li>
                  <li>Restart Cursor.</li>
                </ol>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href="https://github.com/yourusername/neotoma/blob/main/docs/developer/mcp_cursor_setup.md"
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
