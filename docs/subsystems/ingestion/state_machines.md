# Neotoma Ingestion State Machine
*(Canonical States, Transitions, and UI Mapping)*

---

## Purpose

Defines the state machine for ingestion processes, including all states, transitions, error handling, and UI representation.

---

## Ingestion State Machine

```mermaid
%%{init: {'theme':'neutral'}}%%
stateDiagram-v2
    [*] --> Pending
    Pending --> Processing: start_ingestion
    Processing --> Extracting: text_extracted
    Extracting --> Resolving: fields_extracted
    Resolving --> Indexing: entities_resolved
    Indexing --> Completed: indexed
    
    Processing --> Failed: error
    Extracting --> Failed: error
    Resolving --> Failed: error
    Indexing --> Failed: error
    
    Failed --> Pending: retry
    Failed --> [*]: permanent_failure
    Completed --> [*]
```

## States

| State | Description | Terminal | UI Display |
|-------|-------------|----------|------------|
| `Pending` | Queued for processing | No | "Queued..." |
| `Processing` | Text extraction in progress | No | "Processing..." |
| `Extracting` | Field extraction | No | "Extracting..." |
| `Resolving` | Entity resolution | No | "Resolving..." |
| `Indexing` | Search index update | No | "Indexing..." |
| `Completed` | Successfully ingested | Yes | "Complete" |
| `Failed` | Error occurred | Yes* | "Failed" + error message |

*Failed state can transition to Pending on retry

## Testing

```typescript
test('ingestion state transitions', async () => {
  const record = await createRecord({status: 'pending'});
  expect(record.status).toBe('pending');
  
  await startIngestion(record.id);
  expect(await getStatus(record.id)).toBe('processing');
  
  // ... complete pipeline ...
  expect(await getStatus(record.id)).toBe('completed');
});
```

---

## Agent Instructions

Load when implementing ingestion status tracking or UI status displays.

Required co-loaded: `docs/subsystems/ingestion/ingestion.md`, `docs/architecture/consistency.md`













