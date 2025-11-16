/**
 * Types for encrypted WebSocket bridge
 */

export interface BridgeMessage {
  type: 'client_request' | 'server_request' | 'client_response' | 'server_response' | 'event';
  id?: string;
  encryptedPayload: string; // Base64url-encoded encrypted envelope
}

export interface BridgeConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export type BridgeEventType = 'open' | 'close' | 'error' | 'message' | 'reconnect';

export interface BridgeEvent {
  type: BridgeEventType;
  data?: unknown;
  error?: Error;
}

