# Worker Agent Instructions Template

_(Template for worker agent instructions when spawning via Cloud Agents API)_

---

## Instructions for {{FU_ID}} in Batch {{BATCH_ID}}

You are a worker agent executing Feature Unit **{{FU_ID}}** in Batch **{{BATCH_ID}}** for Release **{{RELEASE_ID}}**.

---

## Your Task

### 1. Load FU Specification

- **Primary**: `docs/feature_units/completed/{{FU_ID}}/FU-{{FU_ID}}_spec.md`
- **Fallback**: `docs/specs/MVP_FEATURE_UNITS.md` (search for `{{FU_ID}}`)

### 2. Execute Feature Unit Workflow

Follow the standard Feature Unit execution workflow:

1. **Check if FU spec exists**

   - If not, run `Create New Feature Unit` workflow (Checkpoint 0)
   - Load `.cursor/commands/create_feature_unit.md`

2. **If UI FU and no prototype exists**

   - Run `Create Prototype` workflow
   - Load `.cursor/commands/create_prototype.md`
   - Get prototype approval (Checkpoint 1)

3. **Run implementation workflow**

   - Load `.cursor/commands/run_feature_workflow.md`
   - Follow implementation steps from FU spec
   - Write code, tests, documentation

4. **Run tests**

   - Unit tests: `npm run test:unit -- --grep "{{FU_ID}}"`
   - Integration tests: `npm run test:integration -- --grep "{{FU_ID}}"`
   - E2E tests: `npm run test:e2e -- --grep "{{FU_ID}}"`

5. **Final review**
   - Load `.cursor/commands/final_review.md`
   - Run Checkpoint 2 (Final Review)

### 3. Update Status File

**Location**: `{{STATUS_FILE}}`

**Update Frequency**: Every 5-10 minutes during execution

**Status Update Format**:

```json
{
  "fu_id": "{{FU_ID}}",
  "status": "running" | "completed" | "failed",
  "progress": 0.0-1.0,
  "last_update": "ISO_TIMESTAMP",
  "message": "Optional status message",
  "tests": {
    "unit": {
      "passed": true | false,
      "coverage": 0-100,
      "command": "npm run test:unit -- --grep {{FU_ID}}"
    },
    "integration": {
      "passed": true | false,
      "command": "npm run test:integration -- --grep {{FU_ID}}"
    },
    "e2e": {
      "passed": true | false | null,
      "command": "npm run test:e2e -- --grep {{FU_ID}}"
    }
  }
}
```

**Completion Signal**:

When FU is complete, update status with test results:

```json
{
  "fu_id": "{{FU_ID}}",
  "status": "completed",
  "progress": 1.0,
  "completed_at": "ISO_TIMESTAMP",
  "tests": {
    "unit": {
      "passed": true,
      "coverage": 85,
      "command": "npm run test:unit -- --grep FU-100"
    },
    "integration": {
      "passed": true,
      "command": "npm run test:integration -- --grep FU-100"
    },
    "e2e": {
      "passed": true,
      "command": "npm run test:e2e -- --grep FU-100"
    }
  }
}
```

**Test Execution Requirements:**

1. **Unit Tests** (REQUIRED):

   - Run: `npm run test:unit -- --grep "{{FU_ID}}"`
   - Must pass before marking complete
   - Report coverage percentage if available

2. **Integration Tests** (REQUIRED):

   - Run: `npm run test:integration -- --grep "{{FU_ID}}"`
   - Must pass before marking complete

3. **E2E Tests** (REQUIRED for Medium/High risk FUs):
   - Run: `npm run test:e2e -- --grep "{{FU_ID}}"`
   - Check FU spec for risk level
   - Must pass if required

**Test Failure Handling:**

If any required test fails:

- Set `status: "failed"`
- Include error details in `error` field
- Do NOT mark FU as complete
- Report failure immediately

**Error Reporting**:

If FU fails, update status:

```json
{
  "fu_id": "{{FU_ID}}",
  "status": "failed",
  "error": "Error message",
  "failed_at": "ISO_TIMESTAMP"
}
```

---

## Constraints

### Repository-Wide Constraints

Follow all constraints from `docs/foundation/agent_instructions.md`:

1. **Never violate Truth Layer boundaries** (no strategy/execution logic)
2. **Never introduce nondeterminism** (no random IDs, no LLM extraction in MVP)
3. **Never generate features outside MVP scope** (no semantic search, no agents)
4. **Always follow schema-first principles** (type-driven, not inference-driven)
5. **Enforce immutability** (raw_text, schema_type, extracted_fields)
6. **Enforce safety and explicit control** (user approves all ingestion)
7. **Always output deterministic, validated artifacts** (code, specs, docs)

### Multi-Agent Constraints

1. **Do not modify FUs assigned to other agents**

   - Only work on `{{FU_ID}}`
   - Do not modify files related to other FUs in the batch

2. **Update status file atomically**

   - Use file locking if available
   - Read-modify-write pattern
   - Handle concurrent updates gracefully

3. **Report failures immediately**

   - Don't retry indefinitely
   - Set `status: "failed"` if FU cannot be completed
   - Include error details in status update

4. **Respect execution limits**
   - Do not spawn additional agents
   - Do not exceed resource limits
   - Report if FU requires more resources than allocated

---

## Status File Location

**File**: `{{STATUS_FILE}}`

**Structure**: See `docs/feature_units/standards/multi_agent_orchestration.md` for complete status file schema.

**Update Protocol**:

1. Read current status file
2. Find your FU entry in `batches[].feature_units[]`
3. Update your FU's status fields
4. Write status file atomically

**Example Update**:

```javascript
// Pseudo-code
const status = JSON.parse(await fs.readFile(STATUS_FILE));
const batch = status.batches.find(b => b.batch_id === {{BATCH_ID}});
const fu = batch.feature_units.find(f => f.fu_id === "{{FU_ID}}");

fu.status = "running";
fu.progress = 0.5;
fu.last_update = new Date().toISOString();
fu.tests.unit.passed = true;
fu.tests.unit.coverage = 85;

await fs.writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
```

---

## Error Handling

### If FU Spec Not Found

1. Check if FU exists in `docs/specs/MVP_FEATURE_UNITS.md`
2. If not found, create FU spec using `Create New Feature Unit` workflow
3. Update status: `{"status": "spec_created", "message": "Created FU spec"}`

### If Tests Fail

1. Fix implementation issues
2. Re-run tests
3. If tests still fail after 3 attempts, report failure:
   ```json
   {
     "status": "failed",
     "error": "Tests failed after 3 attempts",
     "test_output": "..."
   }
   ```

### If Dependencies Not Met

1. Check FU dependencies in spec
2. Verify dependency FUs are complete in status file
3. If dependencies incomplete, wait and check again in 5 minutes
4. If dependencies still incomplete after 30 minutes, report:
   ```json
   {
     "status": "blocked",
     "error": "Dependencies not met: FU-XXX, FU-YYY"
   }
   ```

---

## Completion Checklist

Before marking FU as completed:

- [ ] All code implemented per spec
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] All E2E tests passing (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Status file updated with `status: "completed"` and test results
- [ ] Final review completed (Checkpoint 2)

---

## Related Documentation

- `docs/feature_units/standards/multi_agent_orchestration.md` — Multi-agent coordination
- `docs/feature_units/standards/release_workflow.md` — Release workflow
- `docs/feature_units/standards/execution_instructions.md` — FU execution flow
- `.cursor/commands/run_feature_workflow.md` — Implementation workflow
