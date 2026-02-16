import { spawn } from "node:child_process";
import { WebSocketServer, WebSocket } from "ws";

const MCP_CMD = process.env.MCP_CMD || "node";
const MCP_ARGS = (process.env.MCP_ARGS ? JSON.parse(process.env.MCP_ARGS) : ["dist/index.js"]) as string[];
const PORT = parseInt(process.env.WS_PORT || "8280", 10);

interface BridgeMessage {
  type: "client_request" | "server_request" | "client_response" | "server_response" | "event" | "oauth_init";
  id?: string;
  encryptedPayload?: string;
  connectionId?: string; // OAuth connection ID
}

const wss = new WebSocketServer({ port: PORT, path: "/mcp" });

wss.on("connection", (ws: WebSocket) => {
  let connectionId: string | undefined;
  let child: ReturnType<typeof spawn> | null = null;
  let forwardingSetup = false;
  const pendingRequests = new Map<string, string>(); // Map MCP request ID to bridge message ID

  // Setup MCP → Client forwarding (called after child is spawned)
  function setupMCPForwarding() {
    if (!child || forwardingSetup || !child.stdout || !child.stderr) return;
    forwardingSetup = true;
    
    // MCP → Client (encrypted envelopes)
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const mcpResponse = JSON.parse(line);
          
          // Check if this is an encrypted response from MCP
          if (mcpResponse.result?.encryptedPayload) {
            const bridgeResponse: BridgeMessage = {
              type: "server_response",
              id: mcpResponse.id,
              encryptedPayload: mcpResponse.result.encryptedPayload,
            };
            
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(bridgeResponse));
            }
          } else if (mcpResponse.error) {
            // Forward error (could be encrypted or plain)
            const bridgeResponse: BridgeMessage = {
              type: "server_response",
              id: mcpResponse.id,
              encryptedPayload: "", // Error case
            };
            
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(bridgeResponse));
            }
          } else {
            // Plain MCP response (for non-encrypted operations during migration)
            // In full E2EE mode, all responses should be encrypted
            // For now, wrap in bridge format for compatibility
            const bridgeResponse: BridgeMessage = {
              type: "server_response",
              id: mcpResponse.id,
              encryptedPayload: Buffer.from(JSON.stringify(mcpResponse))
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=/g, ""),
            };
            
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(bridgeResponse));
            }
          }
        } catch (error) {
          console.error("Error parsing MCP response:", error);
        }
      }
    });
    
    child.stderr.on("data", (chunk: Buffer) => {
      // Forward stderr to console (MCP server logs)
      process.stderr.write(chunk);
    });
  }

  // Client → MCP (encrypted envelopes)
  ws.on("message", (data: Buffer) => {
    try {
      const message: BridgeMessage = JSON.parse(data.toString());
      
      // Handle OAuth initialization (must be first message)
      if (message.type === "oauth_init") {
        if (message.connectionId) {
          connectionId = message.connectionId;
          
          // Spawn MCP server with OAuth connection ID
          const env = { ...process.env, NEOTOMA_CONNECTION_ID: connectionId };
          child = spawn(MCP_CMD, MCP_ARGS, { 
            stdio: ["pipe", "pipe", "inherit"],
            env 
          });
          
          // Set up MCP → Client forwarding
          setupMCPForwarding();
          
          // Send confirmation
          ws.send(JSON.stringify({
            type: "server_response",
            id: message.id,
            encryptedPayload: Buffer.from(JSON.stringify({ 
              success: true, 
              connectionId 
            })).toString("base64url"),
          }));
        } else {
          ws.send(JSON.stringify({
            type: "server_response",
            id: message.id,
            encryptedPayload: Buffer.from(JSON.stringify({ 
              error: "connectionId required for OAuth initialization" 
            })).toString("base64url"),
          }));
        }
        return;
      }
      
      // Ensure MCP server is spawned before processing requests
      if (!child) {
        // If no OAuth init, try to use connection ID from environment or spawn without auth
        const envConnectionId = process.env.NEOTOMA_CONNECTION_ID;
        const env = envConnectionId 
          ? { ...process.env, NEOTOMA_CONNECTION_ID: envConnectionId }
          : process.env;
        
        child = spawn(MCP_CMD, MCP_ARGS, { 
          stdio: ["pipe", "pipe", "inherit"],
          env 
        });
        
        setupMCPForwarding();
      }
      
      if (message.type === "client_request" && message.encryptedPayload) {
        // Forward encrypted payload to MCP server
        // MCP server will decrypt, process, and return encrypted response
        const mcpMessage = {
          jsonrpc: "2.0",
          id: message.id,
          method: "encrypted_request",
          params: {
            encryptedPayload: message.encryptedPayload,
          },
        };
        
        if (child && child.stdin) {
          child.stdin.write(JSON.stringify(mcpMessage) + "\n");
          if (message.id) {
            pendingRequests.set(message.id, message.id);
          }
        }
      } else if (message.type === "client_response") {
        // Response from client (shouldn't happen in this direction)
        console.warn("Unexpected client_response received");
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
      // Send error response
      if (data.toString().includes('"id"')) {
        try {
          const parsed = JSON.parse(data.toString());
          const errorResponse: BridgeMessage = {
            type: "server_response",
            id: parsed.id,
            encryptedPayload: "", // Empty on error
          };
          ws.send(JSON.stringify(errorResponse));
        } catch {
          // Ignore parse errors
        }
      }
    }
  });

  ws.on("close", () => {
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch (error) {
        // ignore cleanup error
      }
    }
    pendingRequests.clear();
  });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  ws.on("pong", () => {
    // Connection is alive
  });
});

// eslint-disable-next-line no-console
console.log(`MCP WebSocket bridge on ws://localhost:${PORT}/mcp`);

