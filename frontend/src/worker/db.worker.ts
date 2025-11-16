/**
 * WebWorker entry point for datastore operations
 * Runs SQLite WASM in isolated worker context
 */

import { handleRPCRequest, parseRPCMessage } from './rpc.js';
import type { RPCResponse } from './types.js';

// Worker message handler
self.addEventListener('message', async (event: MessageEvent) => {
  const message = parseRPCMessage(event.data);

  if (!message) {
    const errorResponse: RPCResponse = {
      id: 'unknown',
      error: {
        code: -32700,
        message: 'Parse error: Invalid message format',
      },
    };
    self.postMessage(errorResponse);
    return;
  }

  try {
    const response = await handleRPCRequest(message);
    self.postMessage(response);
  } catch (error) {
    const errorResponse: RPCResponse = {
      id: message.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
        data: error,
      },
    };
    self.postMessage(errorResponse);
  }
});

// Signal ready
self.postMessage({ type: 'ready' });

