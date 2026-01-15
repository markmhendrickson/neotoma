/**
 * MCP Action Test Helper
 * 
 * Provides a consistent way to call MCP actions in tests
 */

import { NeotomaServer } from "../../src/server.js";

/**
 * Call an MCP action through the server's request handler
 * This simulates how MCP clients call actions
 */
export async function callMCPAction(
  server: NeotomaServer,
  actionName: string,
  params: Record<string, any>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Use the server's handleRequest method (which routes to the switch statement)
  // The server uses setRequestHandler with CallToolRequestSchema
  const request = {
    params: {
      name: actionName,
      arguments: params,
    },
  };

  // Access the request handler through the server's internal structure
  // Note: This is a workaround for testing - in production, MCP protocol handles this
  return await (server as any).handleRequest?.(request) || 
         await (server as any).server?.request?.({
           method: "tools/call",
           params: {
             name: actionName,
             arguments: params,
           },
         });
}

/**
 * Alternative: Direct method access for actions that are exposed
 * Some actions like 'store' work as direct methods, others need handleRequest
 */
export async function callMCPActionDirect(
  server: NeotomaServer,
  actionName: string,
  params: Record<string, any>
): Promise<any> {
  // Try direct method first (works for 'store')
  if ((server as any)[actionName]) {
    return await (server as any)[actionName](params);
  }

  // Fall back to handleRequest pattern
  return await callMCPAction(server, actionName, params);
}
