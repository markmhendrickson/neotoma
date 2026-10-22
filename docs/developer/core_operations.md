# In-process core operations

`neotoma/core` and `neotoma/core/operations` expose the same typed
`createOperations({ userId, server? })` facade. Calls reuse the existing guarded
tool dispatcher, including schema validation, ownership, correction and
idempotency behavior. `executeTool` reaches that dispatcher too.

Importing this facade and constructing an unused client do not load the legacy
server, resolve ambient configuration, initialize optional providers, or open a
database. Without an injected server, the first operation loads and constructs
one legacy server; simultaneous first calls share its initialization. An
explicitly supplied server is used directly.

```ts
import { createOperations } from "neotoma/core";

// Supply the graph owner established by your trusted local host context.
const operations = createOperations({ userId: localOwnerId });

const result = await operations.retrieveEntities({
  entity_type: "task",
  limit: 10,
});
```

The first operation still initializes the legacy configuration and shared
database path. Configure that path before calling an operation. Import/factory
isolation does not make actual calls independent of environment files, home
configuration, configured network providers, or shared connection state. This
facade does not yet offer the explicit injected-database runtime.

The caller-provided `userId` follows the existing trusted local execution
contract; it is not remote authentication or an access grant. An injected server
also retains its own established guard behavior.

`dispose()` does not initialize an unused client. Its legacy implementation has
no owned-database shutdown contract: it must not be relied on to close a shared
database or prove that all process handles are gone. Supported explicit database
setup, ownership-aware disposal, reopen, backup and restore belong to the
separate embedded-runtime implementation.

The other package entrypoints retain their existing behavior. In particular,
the root `neotoma` export is the stdio server entrypoint, not an inert library
import. Use the core subpath for in-process operations.
