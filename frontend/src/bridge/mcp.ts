/**
 * MCP tool invocation wrapper
 * Provides typed interface for calling MCP tools via encrypted bridge
 */

import { EncryptedWebSocketBridge } from './websocket.js';
import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';
import type { BridgeConfig } from './types.js';

export interface MCPToolRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResponse {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: {
      uri: string;
      mimeType?: string;
    };
  }>;
  isError?: boolean;
}

export class MCPBridge {
  private bridge: EncryptedWebSocketBridge;

  constructor(
    config: BridgeConfig,
    x25519KeyPair: X25519KeyPair,
    ed25519KeyPair: Ed25519KeyPair,
    serverPublicKey: Uint8Array
  ) {
    this.bridge = new EncryptedWebSocketBridge(config, x25519KeyPair, ed25519KeyPair);
    this.bridge.setRecipientPublicKey(serverPublicKey);
  }

  /**
   * Connect to MCP server
   */
  async connect(): Promise<void> {
    await this.bridge.connect();
  }

  /**
   * Call MCP tool
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResponse> {
    const request: MCPToolRequest = {
      name: toolName,
      arguments: args,
    };

    const response = await this.bridge.sendRequest('tools/call', request);

    // Response will be encrypted - ChatGPT client will decrypt
    // For now, return the encrypted payload structure
    return response as MCPToolResponse;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const response = await this.bridge.sendRequest('tools/list', {});
    return response as Array<{ name: string; description: string }>;
  }

  /**
   * Close connection
   */
  close(): void {
    this.bridge.close();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.bridge.isConnected();
  }
}

