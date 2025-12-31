# Release v0.2.2 — Integration Tests
**Release ID**: v0.2.2  
**Release Name**: list_capabilities MCP Action  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)
## Test Execution
Tests are executed automatically by the release orchestrator after batch completion. Test commands are defined in the `test:` field for each test.
## Integration Test Catalog
### IT-001: Capability Discovery → Payload Submission Flow
**Goal:** Verify that capability discovery enables successful payload submission with complete metadata.
**Batches Covered:** 0
**FUs Involved:** FU-304, FU-201 (submit_payload)
**Test Steps:**
1. Call `list_capabilities` via MCP with no filters
2. Verify response structure matches specification:
   - Contains `capabilities` array
   - Contains `total` count
3. Verify all 5 capabilities returned:
   - `neotoma:store_invoice:v1`
   - `neotoma:store_transaction:v1`
   - `neotoma:store_receipt:v1`
   - `neotoma:store_contract:v1`
   - `neotoma:store_note:v1`
4. For each capability, verify complete metadata:
   - `id`, `intent`, `version` present
   - `primary_entity_type`, `schema_version` present
   - `canonicalization_fields` array populated
   - `entity_extraction` array populated with extraction rules
   - `example_payload` object present and non-empty
5. Select invoice capability from response
6. Use returned `capability_id` to submit payload via `submit_payload`
7. Use `example_payload` structure as guide for payload body
8. Verify payload submission succeeds
9. Verify entities extracted according to capability's `entity_extraction` rules
**Expected Results:**
- `list_capabilities` returns all 5 capabilities
- Each capability has complete metadata
- Example payloads are valid and non-empty
- `submit_payload` succeeds using discovered capability_id
- Entities extracted match capability extraction rules
**Machine-Checkable:**
```bash
test: "tests/integration/list_capabilities_to_submission.test.ts"
```
**Status:** ⏳ not_run
### IT-002: Filtered Discovery → Payload Submission Flow
**Goal:** Verify that capability filtering works correctly and enables targeted payload submission.
**Batches Covered:** 0
**FUs Involved:** FU-304, FU-201 (submit_payload)
**Test Steps:**
1. Call `list_capabilities` with filter `{ intent: "store_invoice" }`
2. Verify only invoice capabilities returned (should be 1 capability)
3. Verify returned capability has `intent: "store_invoice"`
4. Verify `total` count equals 1
5. Call `list_capabilities` with filter `{ version: "v1" }`
6. Verify all v1 capabilities returned (should be all 5)
7. Verify all returned capabilities have `version: "v1"`
8. Call `list_capabilities` with filter `{ intent: "store_invoice", version: "v1" }`
9. Verify only `neotoma:store_invoice:v1` returned
10. Use discovered capability to submit invoice payload via `submit_payload`
11. Verify submission succeeds
**Expected Results:**
- Filtering by intent returns only matching capabilities
- Filtering by version returns only matching capabilities
- Combined filters work correctly (AND logic)
- Filtered capabilities can be used for payload submission
- `total` count matches filtered results
**Machine-Checkable:**
```bash
test: "tests/integration/list_capabilities_filtering.test.ts"
```
**Status:** ⏳ not_run
### IT-003: Tool Description Guidance Flow
**Goal:** Verify that enhanced tool descriptions guide integrations to use capability discovery.
**Batches Covered:** 0
**FUs Involved:** FU-304, FU-201 (submit_payload)
**Test Steps:**
1. Query MCP `ListTools` to get all tool definitions
2. Locate `list_capabilities` tool definition
3. Verify `list_capabilities` description:
   - Explains purpose (dynamic capability discovery)
   - Mentions schemas, field requirements, entity extraction rules
   - Explains usage for discovering data types
4. Locate `submit_payload` tool definition
5. Verify `submit_payload` description:
   - References `list_capabilities` for discovery
   - Mentions common capability IDs
   - Guides users to use discovery before submission
6. Verify `capability_id` field description in `submit_payload`:
   - References `list_capabilities` for available IDs
   - Explains versioned capability format
7. Verify `body` field description in `submit_payload`:
   - References `list_capabilities` for schema requirements
   - Explains structure should match capability expectations
**Expected Results:**
- `list_capabilities` tool description is clear and informative
- `submit_payload` description references `list_capabilities`
- Field descriptions guide users to discovery
- Tool descriptions follow MCP protocol format
**Machine-Checkable:**
```bash
test: "tests/integration/mcp_tool_descriptions.test.ts"
```
**Status:** ⏳ not_run
### IT-004: Example Payload Validation Flow
**Goal:** Verify that example payloads provided by `list_capabilities` are valid and can be used for submissions.
**Batches Covered:** 0
**FUs Involved:** FU-304, FU-201 (submit_payload)
**Test Steps:**
1. Call `list_capabilities` with no filters
2. For each of the 5 capabilities:
   - Extract `example_payload` from response
   - Verify `example_payload` is non-empty
   - Verify `example_payload` contains expected fields based on `canonicalization_fields`
   - Verify `example_payload` structure matches capability type:
     - Invoice: has `invoice_number`, `amount`, `vendor_name`, `customer_name`, `date`
     - Transaction: has `transaction_id`, `amount`, `merchant_name`, `counterparty`, `date`
     - Receipt: has `receipt_number`, `amount`, `vendor_name`, `date`
     - Contract: has `contract_number`, `parties`, `start_date`, `end_date`
     - Note: has `title`, `content`, `tasks`
3. For each capability:
   - Use `example_payload` as payload `body` in `submit_payload`
   - Add required provenance metadata
   - Submit payload via `submit_payload`
   - Verify submission succeeds
   - Verify entities extracted correctly
**Expected Results:**
- All 5 capabilities have valid example payloads
- Example payloads contain expected fields
- Example payloads can be used successfully in `submit_payload`
- Submissions succeed with example payloads
- Entities extracted correctly from example payloads
**Machine-Checkable:**
```bash
test: "tests/integration/example_payload_validation.test.ts"
```
**Status:** ⏳ not_run
### IT-005: MCP Protocol Compliance
**Goal:** Verify that `list_capabilities` action follows MCP protocol specification.
**Batches Covered:** 0
**FUs Involved:** FU-304
**Test Steps:**
1. Verify `list_capabilities` tool definition in `ListTools` response:
   - Has required `name` field
   - Has required `description` field
   - Has required `inputSchema` field
   - `inputSchema` follows JSON Schema format
2. Call `list_capabilities` with valid request
3. Verify response structure follows MCP protocol:
   - Returns object with `content` array
   - `content` array contains objects with `type` and `text` fields
   - `text` contains valid JSON string
4. Parse JSON from response
5. Verify parsed JSON matches response schema from specification
6. Call `list_capabilities` with invalid request (invalid filter)
7. Verify error response follows MCP error format:
   - Contains error code (`VALIDATION_ERROR`)
   - Contains error message
   - Uses proper MCP error structure
**Expected Results:**
- Tool definition follows MCP protocol
- Response structure follows MCP protocol
- Parsed JSON matches specification
- Error responses follow MCP error format
- No protocol violations detected
**Machine-Checkable:**
```bash
test: "tests/integration/mcp_protocol_compliance.test.ts"
```
**Status:** ⏳ not_run
### IT-006: Backward Compatibility Validation
**Goal:** Verify that adding `list_capabilities` doesn't break existing MCP integrations.
**Batches Covered:** 0
**FUs Involved:** FU-304, FU-201 (submit_payload), FU-202 (retrieve_records)
**Test Steps:**
1. Run existing v0.1.0 integration test suite
2. Verify all existing MCP actions still functional:
   - `submit_payload` works without using `list_capabilities`
   - `retrieve_records` works as before
   - `update_record` works as before
   - `delete_record` works as before
   - `upload_file` works as before
   - `get_file_url` works as before
3. Verify existing tool descriptions still accessible
4. Verify no breaking changes to request/response schemas
5. Verify existing capability IDs still accepted by `submit_payload`:
   - `neotoma:store_invoice:v1`
   - `neotoma:store_transaction:v1`
   - `neotoma:store_receipt:v1`
   - `neotoma:store_contract:v1`
   - `neotoma:store_note:v1`
6. Verify hardcoded capability IDs still work (no regression)
**Expected Results:**
- All existing integration tests pass
- No breaking changes to existing actions
- Existing capability IDs still accepted
- Existing tool descriptions still accessible
- Backward compatibility maintained
**Machine-Checkable:**
```bash
test: "tests/integration/backward_compatibility.test.ts"
```
**Status:** ⏳ not_run
### IT-007: Performance and Response Time
**Goal:** Verify that `list_capabilities` meets response time targets.
**Batches Covered:** 0
**FUs Involved:** FU-304
**Test Steps:**
1. Call `list_capabilities` 100 times with no filters
2. Measure response time for each call
3. Calculate p50, p95, p99 response times
4. Verify p95 response time < 100ms (target from acceptance criteria)
5. Call `list_capabilities` 100 times with filters (intent and version)
6. Measure response time for filtered calls
7. Verify p95 response time < 100ms for filtered calls
8. Verify no performance degradation compared to target
9. Verify response times consistent across calls
**Expected Results:**
- p95 response time < 100ms (unfiltered)
- p95 response time < 100ms (filtered)
- Response times consistent across calls
- No performance degradation
- Capability registry access is efficient (static data)
**Machine-Checkable:**
```bash
test: "tests/integration/list_capabilities_performance.test.ts"
```
**Status:** ⏳ not_run
## Test Summary
**Total Integration Tests:** 7
**Test Coverage:**
- ✅ Capability discovery workflow
- ✅ Filtering logic (intent, version)
- ✅ Tool description guidance
- ✅ Example payload validation
- ✅ MCP protocol compliance
- ✅ Backward compatibility
- ✅ Performance and response time
**Test Files:**
1. `tests/integration/list_capabilities_to_submission.test.ts`
2. `tests/integration/list_capabilities_filtering.test.ts`
3. `tests/integration/mcp_tool_descriptions.test.ts`
4. `tests/integration/example_payload_validation.test.ts`
5. `tests/integration/mcp_protocol_compliance.test.ts`
6. `tests/integration/backward_compatibility.test.ts`
7. `tests/integration/list_capabilities_performance.test.ts`
**Pre-Deployment Checklist:**
- [ ] All 7 integration tests passing
- [ ] Response times within target (< 100ms p95)
- [ ] Backward compatibility validated
- [ ] MCP protocol compliance verified
- [ ] Example payloads validated
- [ ] Tool descriptions reviewed
- [ ] No breaking changes detected
