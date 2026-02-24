/**
 * Shared hook for MCP configuration generation
 */

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";

interface ServerInfo {
  httpPort: number;
  mcpUrl: string;
}

export function useMCPConfig() {
  const { toast } = useToast();
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [configCopied, setConfigCopied] = useState(false);

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
        console.warn("Failed to fetch server info, using defaults:", error);
        setServerInfo({
          httpPort: 8080,
          mcpUrl: import.meta.env.VITE_API_BASE_URL
            ? `${import.meta.env.VITE_API_BASE_URL}/mcp`
            : "http://localhost:8080/mcp",
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
          if (connections.length > 0) {
            const active = connections.find((c: any) => c.lastUsedAt) || connections[0];
            if (active) {
              setActiveConnectionId(active.connectionId);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch active connections:", error);
      }
    };

    fetchActiveConnection();
  }, []);

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

    if (activeConnectionId) {
      config.mcpServers.neotoma.env.NEOTOMA_CONNECTION_ID = activeConnectionId;
    }

    return JSON.stringify(config, null, 2);
  };

  const generateClaudeConfig = () => {
    const mcpUrl =
      serverInfo?.mcpUrl ||
      (import.meta.env.VITE_API_BASE_URL
        ? `${import.meta.env.VITE_API_BASE_URL}/mcp`
        : "http://localhost:8080/mcp");

    const neotomaEntry: { url: string; headers?: Record<string, string> } = { url: mcpUrl };
    if (activeConnectionId) {
      neotomaEntry.headers = { "X-Connection-Id": activeConnectionId };
    }
    return JSON.stringify({ mcpServers: { neotoma: neotomaEntry } }, null, 2);
  };

  const generateCursorInstallLink = (): string | null => {
    try {
      const mcpUrl =
        serverInfo?.mcpUrl ||
        (import.meta.env.VITE_API_BASE_URL
          ? `${import.meta.env.VITE_API_BASE_URL}/mcp`
          : "http://localhost:8080/mcp");

      const serverConfig = {
        url: mcpUrl,
      };

      const configJson = JSON.stringify(serverConfig);
      const base64Config = btoa(configJson);

      return `cursor://anysphere.cursor-deeplink/mcp/install?name=neotoma&config=${encodeURIComponent(base64Config)}`;
    } catch (error) {
      console.error("Failed to generate install link:", error);
      return null;
    }
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

  return {
    serverInfo,
    activeConnectionId,
    configCopied,
    generateCursorConfig,
    generateClaudeConfig,
    generateCursorInstallLink,
    handleCopyConfig,
    handleDownloadConfig,
  };
}
