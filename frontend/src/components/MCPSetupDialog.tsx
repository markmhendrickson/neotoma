/**
 * MCP Setup Dialog (FU-800)
 * 
 * Provides UI for users to configure MCP server connection with authentication
 */

import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Copy, ExternalLink } from "lucide-react";

interface MCPSetupDialogProps {
  trigger?: ReactNode;
}

export function MCPSetupDialog({ trigger }: MCPSetupDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Get node path (user can modify if needed)
  const [nodePath, setNodePath] = useState("node");
  const [projectPath, setProjectPath] = useState("/absolute/path/to/neotoma");

  const generateCursorConfig = () => {
    return JSON.stringify(
      {
        mcpServers: {
          neotoma: {
            command: nodePath,
            args: ["dist/index.js"],
            cwd: projectPath,
            env: {
              NEOTOMA_CONNECTION_ID: "YOUR_CONNECTION_ID_HERE",
            },
          },
        },
      },
      null,
      2
    );
  };

  const generateClaudeConfig = () => {
    return JSON.stringify(
      {
        mcpServers: {
          neotoma: {
            command: nodePath,
            args: [projectPath + "/dist/index.js"],
            env: {
              NEOTOMA_CONNECTION_ID: "YOUR_CONNECTION_ID_HERE",
            },
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            MCP Setup
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>MCP Server Setup</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your AI assistant (Cursor, Claude Code) to Neotoma using the Model Context Protocol (MCP).
        </p>

        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium mb-1">OAuth Required</p>
          <p className="text-xs text-muted-foreground">
            MCP connections require OAuth authentication. Visit the <a href="/mcp-setup" className="text-primary hover:underline">MCP Configuration page</a> to create an OAuth connection and get your connection ID.
          </p>
        </div>

        <Tabs defaultValue="cursor">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cursor">Cursor Setup</TabsTrigger>
            <TabsTrigger value="claude">Claude Code</TabsTrigger>
          </TabsList>

          {/* Cursor Setup Tab */}
          <TabsContent value="cursor" className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Cursor Configuration</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Create or edit <code className="text-xs bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> in your project
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cursor-node-path" className="text-sm">Node Path</Label>
              <Input
                id="cursor-node-path"
                value={nodePath}
                onChange={(e) => setNodePath(e.target.value)}
                placeholder="node"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Run <code className="bg-muted px-1 py-0.5 rounded">which node</code> to find your node path
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cursor-project-path" className="text-sm">Neotoma Project Path</Label>
              <Input
                id="cursor-project-path"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/absolute/path/to/neotoma"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Absolute path to your Neotoma repository
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Configuration JSON</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyConfig(generateCursorConfig(), "Cursor")}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Config
                </Button>
              </div>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {generateCursorConfig()}
              </pre>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Setup Steps</h3>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build:server</code></li>
                <li>Create/edit <code className="bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> with the configuration above</li>
                <li>Restart Cursor to detect the new MCP server</li>
                <li>Test connection by asking Cursor to use Neotoma actions</li>
              </ol>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Documentation</h3>
              <a
                href="https://github.com/yourusername/neotoma/blob/main/docs/developer/mcp_cursor_setup.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View complete setup guide
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </TabsContent>

          {/* Claude Code Tab */}
          <TabsContent value="claude" className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Claude Code Configuration</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Edit Claude Desktop configuration file
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="claude-node-path" className="text-sm">Node Path</Label>
              <Input
                id="claude-node-path"
                value={nodePath}
                onChange={(e) => setNodePath(e.target.value)}
                placeholder="node"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="claude-project-path" className="text-sm">Neotoma Project Path</Label>
              <Input
                id="claude-project-path"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/absolute/path/to/neotoma"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Configuration JSON</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyConfig(generateClaudeConfig(), "Claude Code")}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Config
                </Button>
              </div>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {generateClaudeConfig()}
              </pre>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Setup Steps</h3>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Build the MCP server: <code className="bg-muted px-1 py-0.5 rounded">npm run build:server</code></li>
                <li>Open Claude Desktop settings</li>
                <li>Add the configuration to <code className="bg-muted px-1 py-0.5 rounded">claude_desktop_config.json</code></li>
                <li>Restart Claude Desktop</li>
                <li>Test connection by asking Claude to use Neotoma tools</li>
              </ol>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Documentation</h3>
              <a
                href="https://github.com/yourusername/neotoma/blob/main/docs/developer/mcp_claude_code_setup.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View complete setup guide
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
