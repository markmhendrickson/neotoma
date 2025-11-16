/**
 * Encrypted WebSocket bridge client
 * Encrypts outbound messages, passes through inbound encrypted messages
 */

import { encryptEnvelope, decryptEnvelope } from '../../../src/crypto/envelope.js';
import type { X25519KeyPair, Ed25519KeyPair, EncryptedEnvelope } from '../../../src/crypto/types.js';
import type { BridgeMessage, BridgeConfig, BridgeEvent } from './types.js';

export class EncryptedWebSocketBridge {
  private ws: WebSocket | null = null;
  private config: BridgeConfig;
  private x25519KeyPair: X25519KeyPair;
  private ed25519KeyPair: Ed25519KeyPair;
  private recipientPublicKey: Uint8Array | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private eventHandlers = new Map<BridgeEvent['type'], Set<(event: BridgeEvent) => void>>();
  private messageIdCounter = 0;

  constructor(
    config: BridgeConfig,
    x25519KeyPair: X25519KeyPair,
    ed25519KeyPair: Ed25519KeyPair
  ) {
    this.config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      ...config,
    };
    this.x25519KeyPair = x25519KeyPair;
    this.ed25519KeyPair = ed25519KeyPair;
  }

  /**
   * Set recipient's public key (for encryption)
   */
  setRecipientPublicKey(publicKey: Uint8Array): void {
    this.recipientPublicKey = publicKey;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.emit('open', {});
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          this.emit('error', { error: error as Error });
          reject(error);
        };

        this.ws.onclose = () => {
          this.emit('close', {});
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send encrypted request
   */
  async sendRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.recipientPublicKey) {
      throw new Error('Recipient public key not set');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const id = `req-${++this.messageIdCounter}`;
    const payload = JSON.stringify({ method, params });
    const payloadBytes = new TextEncoder().encode(payload);

    // Encrypt payload
    const envelope = await encryptEnvelope(
      payloadBytes,
      this.recipientPublicKey,
      this.ed25519KeyPair
    );

    // Serialize envelope to base64url
    const encryptedPayload = this.serializeEnvelope(envelope);

    const message: BridgeMessage = {
      type: 'client_request',
      id,
      encryptedPayload,
    };

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(id, { resolve, reject });

      this.ws!.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Send encrypted response
   */
  async sendResponse(requestId: string, result: unknown): Promise<void> {
    if (!this.recipientPublicKey) {
      throw new Error('Recipient public key not set');
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const payload = JSON.stringify(result);
    const payloadBytes = new TextEncoder().encode(payload);

    // Encrypt payload
    const envelope = await encryptEnvelope(
      payloadBytes,
      this.recipientPublicKey,
      this.ed25519KeyPair
    );

    const encryptedPayload = this.serializeEnvelope(envelope);

    const message: BridgeMessage = {
      type: 'client_response',
      id: requestId,
      encryptedPayload,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(data: string | Blob): Promise<void> {
    let message: BridgeMessage;

    if (typeof data === 'string') {
      message = JSON.parse(data);
    } else {
      const text = await data.text();
      message = JSON.parse(text);
    }

    // For now, pass through encrypted payloads without decryption
    // Decryption will happen in ChatGPT client environment
    if (message.type === 'server_response' && message.id) {
      const handler = this.messageHandlers.get(message.id);
      if (handler) {
        // Return encrypted payload - ChatGPT will decrypt
        handler.resolve({ encryptedPayload: message.encryptedPayload });
        this.messageHandlers.delete(message.id);
      }
    } else if (message.type === 'server_request') {
      // Handle server-initiated requests (e.g., sync notifications)
      this.emit('message', { data: message });
    } else if (message.type === 'event') {
      this.emit('message', { data: message });
    }
  }

  /**
   * Decrypt response (for testing or if needed in browser)
   */
  async decryptResponse(encryptedPayload: string): Promise<unknown> {
    const envelope = this.deserializeEnvelope(encryptedPayload);
    const decrypted = await decryptEnvelope(
      envelope,
      this.x25519KeyPair.privateKey,
      envelope.signerPublicKey
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  /**
   * Serialize encrypted envelope to base64url
   */
  private serializeEnvelope(envelope: EncryptedEnvelope): string {
    const parts = [
      envelope.ciphertext,
      envelope.encryptedKey,
      envelope.ephemeralPublicKey,
      envelope.nonce,
      envelope.signature,
      envelope.signerPublicKey,
    ];

    let totalLength = parts.length * 4;
    for (const part of parts) {
      totalLength += part.length;
    }

    const buffer = new Uint8Array(totalLength);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    for (const part of parts) {
      view.setUint32(offset, part.length, true);
      offset += 4;
      buffer.set(part, offset);
      offset += part.length;
    }

    return this.base64UrlEncode(buffer);
  }

  /**
   * Deserialize base64url to encrypted envelope
   */
  private deserializeEnvelope(encoded: string): EncryptedEnvelope {
    const buffer = this.base64UrlDecode(encoded);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    function readPart(): Uint8Array {
      const length = view.getUint32(offset, true);
      offset += 4;
      const part = buffer.slice(offset, offset + length);
      offset += length;
      return part;
    }

    return {
      ciphertext: readPart(),
      encryptedKey: readPart(),
      ephemeralPublicKey: readPart(),
      nonce: readPart(),
      signature: readPart(),
      signerPublicKey: readPart(),
    };
  }

  /**
   * Base64url encode
   */
  private base64UrlEncode(data: Uint8Array): string {
    return btoa(String.fromCharCode(...data))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64url decode
   */
  private base64UrlDecode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
  }

  /**
   * Attempt reconnection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      this.emit('error', { error: new Error('Max reconnection attempts reached') });
      return;
    }

    this.reconnectAttempts++;
    this.emit('reconnect', { data: { attempt: this.reconnectAttempts } });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnection will be attempted again
      });
    }, this.config.reconnectInterval);
  }

  /**
   * Event emitter
   */
  on(event: BridgeEvent['type'], handler: (event: BridgeEvent) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove event handler
   */
  off(event: BridgeEvent['type'], handler: (event: BridgeEvent) => void): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit event
   */
  private emit(type: BridgeEvent['type'], data: Partial<BridgeEvent>): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => handler({ type, ...data } as BridgeEvent));
    }
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

