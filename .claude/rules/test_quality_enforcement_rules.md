<!-- Source: docs/testing/test_quality_enforcement_rules.mdc -->

# Test Quality Enforcement Rules

**Reference**: `foundation/conventions/testing_conventions.md` — Generic testing principles

## Purpose

Enforces Neotoma-specific test quality patterns derived from foundation principles and lessons learned from actual bugs.

## Scope

This document provides enforceable patterns for Neotoma integration tests with examples from actual bugs that were missed. It complements `integration_test_quality_rules.mdc` with mandatory behaviors agents must follow.

## Trigger Patterns

When writing or reviewing integration tests, agents MUST apply these rules.

## Mandatory Test Patterns

**See `foundation/conventions/testing_conventions.md` for generic patterns.**

This section shows Neotoma-specific enforcement with examples from actual bugs.

### 1. Database Query Tests MUST NOT Mock Supabase

**Foundation principle**: Don't mock database in integration tests.

**Neotoma enforcement**: Never mock `supabase.from()` or Supabase query builders.

**Example from actual Neotoma bugs that were missed:**

```typescript
// ❌ This mocked test would NOT have caught the user_id bug
vi.spyOn(supabase, "from").mockReturnValue({
  select: vi.fn().mockResolvedValue({ data: fragments }),
});

// ✅ This real test WOULD have caught the user_id bug
await supabase.from("raw_fragments").insert({
  fragment_type: "task",
  user_id: "00000000-0000-0000-0000-000000000000", // Would fail FK constraint
});

const { data, error } = await supabase
  .from("raw_fragments")
  .select("*")
  .eq("fragment_type", "task")
  .eq("user_id", null); // Would return 0 rows (bug!)

expect(data?.length).toBeGreaterThan(0); // Test would FAIL, revealing bug
```

### 2. Async Workflow Tests MUST Verify Success

**Foundation principle**: Use strong assertions that verify correct outcomes.

**Neotoma enforcement**: Verify auto-enhancement succeeded, not just completed.

**Example from actual Neotoma bugs that were missed:**

```typescript
// ❌ Weak assertion - passes even if all items skipped due to bugs
const result = await processAutoEnhancementQueue();
expect(result.processed + result.skipped).toBeGreaterThan(0);

// ✅ Strong assertion - requires actual success
const result = await processAutoEnhancementQueue();
expect(result.succeeded).toBeGreaterThan(0);
expect(result.failed).toBe(0);

// Even better: Verify database state
const { data: recommendations } = await supabase
  .from("schema_recommendations")
  .select("*")
  .eq("entity_type", testEntityType);
expect(recommendations?.length).toBeGreaterThan(0);
expect(recommendations![0].status).toBe("auto_applied");
```

### 3. User ID Tests MUST Cover All Cases

**Foundation principle**: Test null, default values, and edge cases.

**Neotoma enforcement**: Test Neotoma's default UUID and null handling.

**Neotoma-specific edge cases:**

1. `user_id: null` (global/system data)
2. `user_id: "00000000-0000-0000-0000-000000000000"` (Neotoma's default user)
3. `user_id: "<real-uuid>"` (actual user)
4. Queries with `.or()` that match both null and default UUID

**Example from actual Neotoma bugs that were missed:**

```typescript
describe("user_id handling", () => {
  it("should store and query fragments with null user_id", async () => {
    await supabase.from("raw_fragments").insert({
      fragment_type: "task",
      fragment_key: "test_field",
      user_id: null,
      ...
    });

    // Verify query with .is("user_id", null) works
    const { data, error } = await supabase
      .from("raw_fragments")
      .select("*")
      .eq("fragment_type", "task")
      .is("user_id", null);

    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("should store and query fragments with default UUID", async () => {
    const defaultUserId = "00000000-0000-0000-0000-000000000000";

    // This would have caught the foreign key bug
    const { error: insertError } = await supabase
      .from("raw_fragments")
      .insert({
        fragment_type: "task",
        fragment_key: "test_field",
        user_id: defaultUserId,
        ...
      });

    expect(insertError).toBeNull(); // Would fail with FK violation

    // Verify query with .eq() works
    const { data, error } = await supabase
      .from("raw_fragments")
      .select("*")
      .eq("fragment_type", "task")
      .eq("user_id", defaultUserId);

    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("should query fragments with both null and default UUID", async () => {
    // This would have caught the query construction bug
    const defaultUserId = "00000000-0000-0000-0000-000000000000";

    const { data, error } = await supabase
      .from("raw_fragments")
      .select("*")
      .eq("fragment_type", "task")
      .or(`user_id.is.null,user_id.eq.${defaultUserId}`);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });
});
```

### 4. Foreign Key Tests MUST Be Explicit

**Foundation principle**: Test foreign key constraint behavior.

**Neotoma enforcement**: Test FK to `auth.users` with null and default UUID.

**Example from actual Neotoma bugs that were missed:**

```typescript
describe("auto_enhancement_queue foreign keys", () => {
  it("should allow null user_id", async () => {
    const { data, error } = await supabase
      .from("auto_enhancement_queue")
      .insert({
        entity_type: "task",
        fragment_key: "test_field",
        user_id: null,
        status: "pending",
      })
      .select();

    expect(error).toBeNull();
    expect(data![0].user_id).toBeNull();
  });

  it("should reject non-existent user_id", async () => {
    const { error } = await supabase.from("auto_enhancement_queue").insert({
      entity_type: "task",
      fragment_key: "test_field",
      user_id: "non-existent-uuid",
      status: "pending",
    });

    expect(error).toBeDefined();
    expect(error!.code).toBe("23503"); // FK violation
    expect(error!.message).toContain("violates foreign key constraint");
  });
});
```

### 5. Silent Error Tests MUST Verify Both Paths

**MUST:** When functions catch errors and handle them internally (logging without throwing), test BOTH success and failure explicitly.

**Example from recent bugs:**

```typescript
describe("queueAutoEnhancementCheck error handling", () => {
  it("should successfully queue item with valid data", async () => {
    await service.queueAutoEnhancementCheck({
      entity_type: "task",
      fragment_key: "test_field",
      user_id: null,
    });

    // Verify it was actually queued (not just silent success)
    const { data } = await supabase
      .from("auto_enhancement_queue")
      .select("*")
      .eq("entity_type", "task")
      .eq("fragment_key", "test_field");

    expect(data?.length).toBe(1);
    expect(data![0].status).toBe("pending");
  });

  it("should log error but not throw when queue creation fails", async () => {
    const logSpy = vi.spyOn(logger, "error");

    // Trigger foreign key violation
    await service.queueAutoEnhancementCheck({
      entity_type: "task",
      fragment_key: "test_field",
      user_id: "non-existent-uuid",
    });

    // Verify error was logged
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[AUTO_ENHANCE]"),
      expect.stringContaining("foreign key")
    );

    // Verify item was NOT queued
    const { data } = await supabase
      .from("auto_enhancement_queue")
      .select("*")
      .eq("fragment_key", "test_field");

    expect(data?.length).toBe(0);
  });
});
```

### 6. Database State Verification MUST Be Explicit

**MUST:** After operations that modify database state, explicitly query and verify the state.

**MUST NOT:** Assume operations succeeded based on return values alone.

**Example from recent bugs:**

```typescript
// ❌ Assumes success without verification
it("should create queue items", async () => {
  const result = await service.queueItem(data);
  expect(result.success).toBe(true); // Return value only
});

// ✅ Verifies actual database state
it("should create queue items", async () => {
  const result = await service.queueItem(data);
  expect(result.success).toBe(true);

  // Verify database state
  const { data: queueItems, error } = await supabase
    .from("auto_enhancement_queue")
    .select("*")
    .eq("entity_type", data.entity_type);

  expect(error).toBeNull();
  expect(queueItems?.length).toBe(1);
  expect(queueItems![0].status).toBe("pending");
  expect(queueItems![0].user_id).toBe(data.user_id);
});
```

### 7. External API Contract Tests MUST Validate URL Parameters

**MUST:** When generating URLs for external APIs (OAuth, third-party services), validate that parameters match the API's actual requirements.

**MUST NOT:** Only check that URLs contain strings without validating parameter correctness.

**Example from actual Neotoma bug that was missed:**

```typescript
// ❌ This test passed but didn't catch the invalid provider parameter
it("creates valid OAuth authorization URL", () => {
  const url = createAuthUrl(state, codeChallenge, redirectUri);
  
  expect(url).toContain("/auth/v1/authorize");
  expect(url).toContain("code_challenge");
  // Missing: validation that provider parameter is valid or absent
});

// ✅ This test would have caught the bug
it("creates valid OAuth authorization URL", () => {
  const url = createAuthUrl(state, codeChallenge, redirectUri);
  const parsedUrl = new URL(url);
  
  expect(url).toContain("/auth/v1/authorize");
  expect(url).toContain("code_challenge");
  
  // Validate no invalid parameters
  const provider = parsedUrl.searchParams.get("provider");
  if (provider) {
    // If provider is present, it must be a valid Supabase provider
    const validProviders = ["github", "google", "discord", "azure", "apple"];
    expect(validProviders).toContain(provider);
  }
  // For Supabase OAuth 2.1 Server, provider should be absent
  expect(provider).not.toBe("oauth"); // Would catch the bug
});

// ✅ Even better: Test negative cases explicitly
it("does not include invalid provider parameter", () => {
  const url = createAuthUrl(state, codeChallenge, redirectUri);
  const parsedUrl = new URL(url);
  
  const provider = parsedUrl.searchParams.get("provider");
  // Supabase doesn't support generic "oauth" provider
  expect(provider).not.toBe("oauth");
  // For OAuth 2.1 Server, provider should be absent
  expect(provider).toBeNull();
});

// ✅ Best: Validate against actual API documentation
it("creates URL matching Supabase OAuth 2.1 Server requirements", () => {
  const url = createAuthUrl(state, codeChallenge, redirectUri);
  const parsedUrl = new URL(url);
  
  // Required parameters per Supabase OAuth 2.1 Server spec
  expect(parsedUrl.searchParams.get("response_type")).toBe("code");
  expect(parsedUrl.searchParams.get("code_challenge")).toBeDefined();
  expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
  expect(parsedUrl.searchParams.get("redirect_uri")).toBeDefined();
  expect(parsedUrl.searchParams.get("state")).toBeDefined();
  
  // Invalid parameters that would cause API errors
  expect(parsedUrl.searchParams.get("provider")).not.toBe("oauth");
  expect(parsedUrl.searchParams.get("provider")).not.toBe("generic");
});
```

**Enforcement for OAuth/External API URL generation:**

1. **Parse and validate URL parameters** - Don't just check string contains
2. **Test negative cases** - Verify invalid parameters are not present
3. **Reference API documentation** - Validate against actual API requirements
4. **Test parameter combinations** - Ensure required vs optional parameters are correct

### 8. Integration Tests MUST Test Complete Workflows

**MUST:** Test end-to-end workflows that verify all steps work together.

**MUST NOT:** Only test individual steps in isolation.

**Example from recent bugs:**

```typescript
it("should complete auto-enhancement workflow end-to-end", async () => {
  // 1. Seed schema
  await seedTestSchema(server, "task", {
    title: { type: "string", required: false },
  });

  // 2. Store data with unknown fields
  const storeResult = await server.store({
    user_id: testUserId,
    file_path: testFile,
    interpret: false,
  });

  const storeData = JSON.parse(storeResult.content[0].text);
  expect(storeData.unknown_fields_count).toBeGreaterThan(0);

  // 3. Verify raw_fragments created
  const { data: fragments, error: fragError } = await supabase
    .from("raw_fragments")
    .select("*")
    .eq("fragment_type", "task");

  expect(fragError).toBeNull();
  expect(fragments?.length).toBeGreaterThan(0);

  // 4. Verify queue items created
  const { data: queueItems, error: queueError } = await supabase
    .from("auto_enhancement_queue")
    .select("*")
    .eq("entity_type", "task");

  expect(queueError).toBeNull();
  expect(queueItems?.length).toBeGreaterThan(0);
  expect(queueItems![0].status).toBe("pending");

  // 5. Process queue
  const processResult = await processAutoEnhancementQueue();
  expect(processResult.succeeded).toBeGreaterThan(0);
  expect(processResult.failed).toBe(0);

  // 6. Verify schema updated
  const { data: schema, error: schemaError } = await supabase
    .from("schema_registry")
    .select("schema_definition")
    .eq("entity_type", "task")
    .eq("active", true)
    .single();

  expect(schemaError).toBeNull();
  const fields = Object.keys(schema!.schema_definition.fields);
  expect(fields.length).toBeGreaterThan(1); // More fields than seed

  // 7. Verify recommendations created
  const { data: recommendations, error: recError } = await supabase
    .from("schema_recommendations")
    .select("*")
    .eq("entity_type", "task");

  expect(recError).toBeNull();
  expect(recommendations?.length).toBeGreaterThan(0);
  expect(recommendations![0].status).toBe("auto_applied");
});
```

## Constraints

Agents MUST:

- Use real database operations in integration tests (not mocks)
- Use strong assertions that verify correct outcomes
- Test all user_id variants (null, default UUID, real UUID)
- Test foreign key constraints explicitly
- Verify database state after operations
- Test both success and failure paths for silent error handling
- Test complete workflows end-to-end
- Validate external API URL parameters against actual API requirements
- Test negative cases for URL parameters (invalid values, missing required params)

Agents MUST NOT:

- Mock database queries in integration tests
- Use weak assertions like `processed + skipped > 0`
- Only test happy paths without edge cases
- Assume operations succeeded without verifying database state
- Skip tests for foreign key constraints
- Skip tests for user_id null vs UUID handling
- Only check URL strings contain values without parsing and validating parameters
- Skip negative test cases for external API URL generation

## Validation Checklist

Before marking integration test complete:

- [ ] Test uses real database (no mocked Supabase queries)
- [ ] Assertions verify correct outcome (not just "no error")
- [ ] Edge cases tested (null user_id, default UUID, invalid values)
- [ ] Foreign key constraints tested (if table has FK)
- [ ] Database state verified after operations
- [ ] Both success and failure paths tested (for silent errors)
- [ ] Complete workflow tested (not just individual steps)
- [ ] External API URLs validated (parameters parsed and checked against API requirements)
- [ ] Negative test cases for URL parameters (invalid values tested)
- [ ] Test cleanup prevents data leaks
- [ ] Test is deterministic (repeatable)

## Related Documents

- [`docs/testing/integration_test_quality_rules.mdc`](./integration_test_quality_rules.mdc) — Detailed quality guidelines
- [`docs/testing/testing_standard.md`](./testing_standard.md) — Base testing standards
- [`docs/reports/AUTO_ENHANCEMENT_TEST_COVERAGE_GAPS.md`](../reports/AUTO_ENHANCEMENT_TEST_COVERAGE_GAPS.md) — Analysis of specific gaps
