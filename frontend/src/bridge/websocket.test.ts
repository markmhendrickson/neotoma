import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedWebSocketBridge } from "./websocket";

vi.mock("../../../src/crypto/envelope.js", () => ({
  encryptEnvelope: vi.fn(async () => ({
    ciphertext: new Uint8Array([1, 2, 3]),
    encryptedKey: new Uint8Array([4, 5]),
    ephemeralPublicKey: new Uint8Array([6, 7]),
    nonce: new Uint8Array([8, 9]),
    signature: new Uint8Array([10, 11]),
    signerPublicKey: new Uint8Array([12, 13]),
  })),
  decryptEnvelope: vi.fn(async () => new TextEncoder().encode(JSON.stringify({ ok: true }))),
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe("EncryptedWebSocketBridge", () => {
  const x25519 = {
    publicKey: new Uint8Array([1, 2, 3]),
    privateKey: new Uint8Array([4, 5, 6]),
  } as any;
  const ed25519 = {
    publicKey: new Uint8Array([7, 8, 9]),
    privateKey: new Uint8Array([10, 11, 12]),
  } as any;

  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.useRealTimers();
  });

  it("sends a request and resolves the matching server response", async () => {
    const bridge = new EncryptedWebSocketBridge({ url: "ws://localhost:8280/mcp" }, x25519, ed25519);
    bridge.setRecipientPublicKey(new Uint8Array([99]));

    const connectPromise = bridge.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    await connectPromise;

    const responsePromise = bridge.sendRequest("list_resources", { limit: 1 });
    await Promise.resolve();
    const sentMessage = JSON.parse(socket.sent[0]);
    expect(sentMessage.type).toBe("client_request");
    expect(sentMessage.id).toBe("req-1");
    expect(typeof sentMessage.encryptedPayload).toBe("string");

    socket.receive({
      type: "server_response",
      id: sentMessage.id,
      encryptedPayload: "encrypted-response",
    });

    await expect(responsePromise).resolves.toEqual({ encryptedPayload: "encrypted-response" });
  });

  it("rejects timed-out requests", async () => {
    vi.useFakeTimers();
    const bridge = new EncryptedWebSocketBridge({ url: "ws://localhost:8280/mcp" }, x25519, ed25519);
    bridge.setRecipientPublicKey(new Uint8Array([99]));

    const connectPromise = bridge.connect();
    const socket = MockWebSocket.instances[0];
    socket.open();
    await connectPromise;

    const responsePromise = bridge.sendRequest("store", { entities: [] });
    const rejection = expect(responsePromise).rejects.toThrow("Request timeout");
    await vi.advanceTimersByTimeAsync(30000);
    await rejection;
  });

  it("can deserialize and decrypt a response envelope", async () => {
    const bridge = new EncryptedWebSocketBridge({ url: "ws://localhost:8280/mcp" }, x25519, ed25519);
    const encoded = (bridge as any).serializeEnvelope({
      ciphertext: new Uint8Array([1, 2, 3]),
      encryptedKey: new Uint8Array([4, 5]),
      ephemeralPublicKey: new Uint8Array([6, 7]),
      nonce: new Uint8Array([8, 9]),
      signature: new Uint8Array([10, 11]),
      signerPublicKey: new Uint8Array([12, 13]),
    });

    await expect(bridge.decryptResponse(encoded)).resolves.toEqual({ ok: true });
  });
});
