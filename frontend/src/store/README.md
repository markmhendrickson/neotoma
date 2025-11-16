# Browser Datastore

Local-first SQLite WASM datastore with OPFS persistence and encryption support.

## Testing

The datastore requires a browser environment (OPFS, WebCrypto) and will be tested at the integration level in Step 4 (WebWorker RPC) where it runs in a browser context.

Unit tests for individual functions can be added with mocked SQLite if needed, but integration tests in the WebWorker environment are preferred.

