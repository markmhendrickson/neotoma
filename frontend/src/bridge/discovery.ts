/**
 * MCP server discovery and fallback logic
 * Checks for local MCP first, falls back to hosted
 */

// Get WS_PORT from environment or use default (8081)
const WS_PORT = import.meta.env.VITE_WS_PORT || '8081';
const LOCAL_MCP_URL = `ws://127.0.0.1:${WS_PORT}/mcp`;
const HOSTED_MCP_URL = 'wss://mcp.neotoma.io'; // Configurable

export interface MCPEndpoint {
  url: string;
  type: 'local' | 'hosted';
}

/**
 * Check if local MCP server is available
 */
async function checkLocalMCP(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(LOCAL_MCP_URL);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 1000);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
  });
}

/**
 * Discover available MCP endpoint
 */
export async function discoverMCPEndpoint(): Promise<MCPEndpoint> {
  // Try local MCP first
  const localAvailable = await checkLocalMCP();
  
  if (localAvailable) {
    return {
      url: LOCAL_MCP_URL,
      type: 'local',
    };
  }

  // Fallback to hosted
  return {
    url: HOSTED_MCP_URL,
    type: 'hosted',
  };
}

/**
 * Get MCP URL from environment or discovery
 */
export async function getMCPURL(): Promise<string> {
  // Check for explicit configuration
  const envUrl = import.meta.env.VITE_MCP_URL;
  if (envUrl) {
    return envUrl;
  }

  // Auto-discover
  const endpoint = await discoverMCPEndpoint();
  return endpoint.url;
}

