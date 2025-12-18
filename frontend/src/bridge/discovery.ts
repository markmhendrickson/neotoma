/**
 * MCP server discovery and fallback logic
 * Checks for local MCP first, falls back to hosted
 */

// Local MCP URL resolution:
// - If VITE_LOCAL_MCP_URL is set, use it directly
// - Else, derive from WS_PORT (default 8081) with /mcp path
const WS_PORT = import.meta.env.VITE_WS_PORT || "8081";
const LOCAL_MCP_URL =
  import.meta.env.VITE_LOCAL_MCP_URL ?? `ws://127.0.0.1:${WS_PORT}/mcp`;
const HOSTED_MCP_URL = 'wss://mcp.neotoma.io'; // Configurable

export interface MCPEndpoint {
  url: string;
  type: 'local' | 'hosted';
}

/**
 * Check if local MCP server is available
 */
const LOCAL_CACHE_KEY = 'neotoma.localMcpDisabledUntil';
const CACHE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function shouldSkipLocalProbe() {
  try {
    const disabledUntil = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!disabledUntil) return false;
    const expires = Number(disabledUntil);
    if (Number.isNaN(expires)) {
      localStorage.removeItem(LOCAL_CACHE_KEY);
      return false;
    }
    return Date.now() < expires;
  } catch {
    return false;
  }
}

function markLocalProbeFailure() {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, String(Date.now() + CACHE_WINDOW_MS));
  } catch {
    // ignore
  }
}

async function checkLocalMCP(): Promise<boolean> {
  if (shouldSkipLocalProbe()) {
    return false;
  }

  return new Promise((resolve) => {
    let resolved = false;
    let ws: WebSocket | null = null;

    const cleanup = (available: boolean) => {
      if (resolved) return;
      resolved = true;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      resolve(available);
    };

    // Hard timeout so we never hang or spam reloads
    const timeout = setTimeout(() => {
      markLocalProbeFailure();
      cleanup(false);
    }, 800);

    try {
      ws = new WebSocket(LOCAL_MCP_URL);
    ws.onopen = () => {
      clearTimeout(timeout);
        cleanup(true);
    };
    ws.onerror = () => {
        clearTimeout(timeout);
        markLocalProbeFailure();
        cleanup(false);
      };
    } catch (error) {
      clearTimeout(timeout);
      markLocalProbeFailure();
      cleanup(false);
    }
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

