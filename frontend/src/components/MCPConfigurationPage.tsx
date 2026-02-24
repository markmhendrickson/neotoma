/**
 * MCP Configuration Page
 * 
 * Displays MCP server setup information on the homepage
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Copy, ExternalLink, Download, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MCPConfigurationPage() {
  const { toast } = useToast();
  const [serverInfo, setServerInfo] = useState<{ httpPort: number; mcpUrl: string } | null>(null);

  const [configCopied, setConfigCopied] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);



  const generateCursorConfig = () => {
    const config: any = {
      mcpServers: {
        neotoma: {
          command: "node",
          args: ["dist/index.js"],
          cwd: ".",
          env: {},
        },
      },
    };

    // Use active connection ID if available
    const connectionId = activeConnectionId;
    
    if (connectionId) {
      config.mcpServers.neotoma.env.NEOTOMA_CONNECTION_ID = connectionId;
    }

    return JSON.stringify(config, null, 2);
  };

  // Fetch server info to get actual backend port
  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || "";
        const isDev = import.meta.env.DEV || apiBase === window.location.origin || !apiBase;
        const apiUrl = isDev ? "/server-info" : `${apiBase}/server-info`;
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          setServerInfo({ httpPort: data.httpPort, mcpUrl: data.mcpUrl });
        }
      } catch (error) {
        // Fallback to default if server info unavailable
        console.warn("Failed to fetch server info, using defaults:", error);
        setServerInfo({ 
          httpPort: 8080, 
          mcpUrl: import.meta.env.VITE_API_BASE_URL 
            ? `${import.meta.env.VITE_API_BASE_URL}/mcp`
            : "http://localhost:8080/mcp"
        });
      }
    };
    fetchServerInfo();
  }, []);

  // Fetch active connections to auto-populate connection ID
  useEffect(() => {
    const fetchActiveConnection = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || "";
        const isDev = import.meta.env.DEV || apiBase === window.location.origin || !apiBase;
        const apiUrl = isDev 
          ? "/mcp/oauth/connections"
          : `${apiBase}/mcp/oauth/connections`;
        
        const response = await fetch(apiUrl, {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          const connections = data.connections || [];
          // Use the first active connection, or the most recently used one
          if (connections.length > 0) {
            const active = connections.find((c: any) => c.lastUsedAt) || connections[0];
            if (active) {
              setActiveConnectionId(active.connectionId);
            }
          }
        }
      } catch (error) {
        // Silently fail - user can still enter connection ID manually
        console.error("Failed to fetch active connections:", error);
      }
    };

    fetchActiveConnection();
  }, []);

  const generateClaudeConfig = () => {
    // Generate HTTP-based config (url instead of command/args)
    // Use detected server info if available, otherwise fallback to defaults
    const mcpUrl = serverInfo?.mcpUrl || 
      (import.meta.env.VITE_API_BASE_URL 
        ? `${import.meta.env.VITE_API_BASE_URL}/mcp`
        : "http://localhost:8080/mcp");
    
    return JSON.stringify(
      {
        mcpServers: {
          neotoma: {
            url: mcpUrl,
          },
        },
      },
      null,
      2
    );
  };

  const handleCopyConfig = async (config: string, platform: string) => {
    try {
      await navigator.clipboard.writeText(config);
      setConfigCopied(true);
      setTimeout(() => setConfigCopied(false), 2000);
      toast({
        title: "Configuration copied",
        description: `${platform} configuration copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Failed to copy configuration",
        variant: "destructive",
      });
    }
  };

  const handleDownloadConfig = (config: string) => {
    const blob = new Blob([config], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mcp.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Configuration downloaded",
      description: "mcp.json file downloaded. Place it in .cursor/ directory",
    });
  };

  const generateCursorInstallLink = (): string | null => {
    try {
      // Generate HTTP-based config with url
      // Use detected server info if available, otherwise fallback to defaults
      const mcpUrl = serverInfo?.mcpUrl || 
        (import.meta.env.VITE_API_BASE_URL 
          ? `${import.meta.env.VITE_API_BASE_URL}/mcp`
          : "http://localhost:8080/mcp");
      
      // Config should be just the server config object (url for HTTP transport)
      const serverConfig = {
        url: mcpUrl,
      };

      // Base64 encode the server config (not wrapped in mcpServers)
      const configJson = JSON.stringify(serverConfig);
      const base64Config = btoa(configJson);

      // Generate deeplink - name is the server name, config is the server config object
      return `cursor://anysphere.cursor-deeplink/mcp/install?name=neotoma&config=${encodeURIComponent(base64Config)}`;
    } catch (error) {
      console.error("Failed to generate install link:", error);
      return null;
    }
  };


  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">MCP Server Setup</h1>
        <p className="text-muted-foreground">
          Neotoma is a privacy-first, idempotent, cross-platform personal-data substrate designed for AI-native workflows.
        </p>
      </div>

      <Tabs defaultValue="cursor" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
          <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
          <TabsTrigger value="claude">Claude</TabsTrigger>
        </TabsList>

        {/* Cursor Tab */}
        <TabsContent value="cursor" className="space-y-4 mt-6">
          {/* Add to Cursor Widget */}
          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>Add to Cursor</span>
              </CardTitle>
              <CardDescription>
                Install Neotoma MCP server in Cursor with one click
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Official Cursor Install Button */}
              {generateCursorInstallLink() ? (
                <div className="flex flex-col items-center gap-3">
                  <a
                    href={generateCursorInstallLink() || "#"}
                    className="inline-block"
                    onClick={(e) => {
                      // Fallback: if deeplink doesn't work, copy config after a delay
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
                        <strong>Note:</strong> After installation, create an OAuth connection in the <a href="/oauth" className="underline">OAuth</a> page, then update your <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> with the connection ID, or use the "Copy Configuration" button below.
                      </span>
                    )}
                  </p>
                  {/* Debug: Show the deeplink for troubleshooting */}
                  {import.meta.env.DEV && (
                    <details className="w-full mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Debug: View deeplink</summary>
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
                  <li>Create <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> in your project root</li>
                  <li>Paste the configuration and update paths if needed</li>
                  <li>Restart Cursor to activate the MCP server</li>
                </ol>
              </div>
              {!activeConnectionId && (
                <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-xs text-yellow-900 dark:text-yellow-100">
                    <strong>Tip:</strong> For secure, long-lived connections, create an OAuth connection first in the <a href="/oauth" className="underline">OAuth</a> page, then return here to generate the config with your connection ID.
                  </p>
                </div>
              )}
              {activeConnectionId && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-xs text-green-900 dark:text-green-100">
                    <strong>✓ OAuth Ready:</strong> Configuration will use OAuth connection ID: <code className="bg-green-100 dark:bg-green-900 px-1 py-0.5 rounded">{activeConnectionId}</code>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cursor Configuration</CardTitle>
              <CardDescription>
                Create or edit <code className="text-xs bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> in your project
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

          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Setup Steps</h2>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside mt-2">
                <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build:server</code></li>
                <li>Create/edit <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> with the configuration above</li>
                <li>Restart Cursor to detect the new MCP server</li>
                <li>Test connection by asking Cursor to use Neotoma actions</li>
              </ol>
            </div>

            <div>
              <h2 className="text-xl font-semibold">Troubleshooting</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Common errors when using Add to Cursor</p>
              <div>
              <details className="group">
                <summary className="text-sm font-medium cursor-pointer list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="transition group-open:rotate-90">▸</span>
                  &quot;neotoma2 must have command or url&quot;
                </summary>
                <div className="mt-2 pl-4 text-sm text-muted-foreground space-y-2">
                  <p>
                    Cursor reports this when an MCP server entry in <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> has no <code className="bg-muted px-1 py-0.5 rounded">command</code> (stdio) or <code className="bg-muted px-1 py-0.5 rounded">url</code> (SSE). Often this is a duplicate or leftover <strong>neotoma2</strong> entry.
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> in your project.</li>
                    <li>Remove any <strong>neotoma2</strong> or duplicate <strong>neotoma</strong> entry.</li>
                    <li>Use <strong>Add to Cursor</strong> again, or <strong>Copy Configuration</strong> and replace the <strong>neotoma</strong> block. Ensure it includes <code className="bg-muted px-1 py-0.5 rounded">command</code> and <code className="bg-muted px-1 py-0.5 rounded">args</code>.</li>
                    <li>Restart Cursor.</li>
                  </ol>
                </div>
              </details>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold">Documentation</h2>
              <div className="mt-2">
                <a
                  href="https://github.com/yourusername/neotoma/blob/main/docs/developer/mcp_cursor_setup.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  View complete setup guide
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ChatGPT Tab */}
        <TabsContent value="chatgpt" className="space-y-4 mt-6">
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
                    <li>Create an OAuth connection in the &quot;OAuth Connection&quot; tab above</li>
                    <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build:server</code></li>
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

          <Card>
            <CardHeader>
              <CardTitle>Limitations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>ChatGPT doesn&apos;t have native one-click MCP installation like Cursor</li>
                <li>Full MCP support requires Developer Mode (beta, may not be available to all users)</li>
                <li>Custom GPTs require HTTP gateway setup (more complex than native MCP)</li>
                <li>MCP tools are dynamically discovered, while Custom GPTs need static OpenAPI specs</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              <a
                href="https://platform.openai.com/docs/guides/tools-connectors-mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                OpenAI MCP Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Claude Tab */}
        <TabsContent value="claude" className="space-y-4 mt-6">
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
                <li>Create an OAuth connection in the &quot;OAuth Connection&quot; tab (get your connection ID)</li>
                <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build:server</code></li>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
