# WebWorker RPC Executor

Isolated datastore operations running in a WebWorker context.

## Structure

- `db.worker.ts` - Worker entry point, handles messages from main thread
- `rpc.ts` - RPC protocol handler, routes requests to datastore functions
- `client.ts` - Client-side wrapper providing typed API
- `types.ts` - RPC message type definitions

## Usage

```typescript
import { DatastoreWorkerClient } from '@/worker';
import { generateX25519KeyPair, generateEd25519KeyPair } from '@/crypto';

// Initialize keys
const x25519Key = await generateX25519KeyPair();
const ed25519Key = await generateEd25519KeyPair();

// Create client (worker URL will be handled by Vite)
const client = new DatastoreWorkerClient(
  new URL('./worker/db.worker.ts', import.meta.url)
);

// Initialize database
await client.init(x25519Key, ed25519Key);

// Use datastore
const record = await client.get('record-id');
await client.put({ id: 'new-id', type: 'note', ... });
const results = await client.query({ type: 'note' });
```

## Testing

Integration tests will be added when the full stack is connected. The worker runs in a browser context and requires OPFS/WebCrypto APIs.

