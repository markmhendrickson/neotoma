# Secure Credential Management for Cloud Agents

## Problem

Passing credentials in conversation text (even base64-encoded) is insecure because:
- Credentials appear in conversation history
- Base64 is easily reversible (not encryption)
- Security policies block this approach
- Credentials can be extracted from logs/conversations

## Secure Approaches

### Option 1: Skip Credential-Dependent Tests (Recommended for Cloud Agents)

**Approach:**
- Don't pass credentials to agents at all
- Agents mark integration/E2E tests as skipped when credentials unavailable
- Unit tests can still run (many don't require database)
- Status file records which tests were skipped and why

**Pros:**
- ✅ No credentials in conversation
- ✅ Clear audit trail (status file shows skipped tests)
- ✅ Agents can still complete their work

**Cons:**
- ❌ Integration/E2E tests don't run automatically
- ❌ Requires manual test execution later

### Option 2: Secure Token Service (More Complex)

**Approach:**
- Orchestrator creates short-lived access tokens
- Agents receive token (not credentials)
- Agents fetch credentials from secure endpoint using token
- Tokens expire quickly (e.g., 15 minutes)

**Pros:**
- ✅ Credentials never in conversation
- ✅ Tokens can be revoked/expired
- ✅ Better audit trail

**Cons:**
- ❌ Requires infrastructure (token service, secure endpoint)
- ❌ More complex implementation
- ❌ Agents need network access to token service

### Option 3: Cursor Cloud Environment Variables (If Available)

**Approach:**
- Set environment variables when spawning agents
- Agents access via `process.env`
- No credentials in conversation

**Pros:**
- ✅ Credentials never in conversation
- ✅ Platform-native approach
- ✅ Simple for agents

**Cons:**
- ❌ API doesn't currently support this (tested - rejected)
- ❌ Would need Cursor Cloud API enhancement

### Option 4: Agents Create Test Credentials

**Approach:**
- Agents use local SQLite for integration tests (no external credentials)
- Or use publicly available test credentials
- No production credentials needed

**Pros:**
- ✅ No credentials to manage
- ✅ Isolated test environment

**Cons:**
- ❌ May have setup complexity for some test scenarios
- ❌ May have rate limits
- ❌ More setup complexity

## Recommended Implementation

**For Cloud Agents:** Use Option 1 (Skip Tests)

Update orchestrator to:
1. NOT include credentials in agent instructions
2. Instruct agents to skip integration/E2E tests if credentials unavailable
3. Update status file with skipped test reasons
4. Manual test execution can happen later with proper credentials

**For Local Development:** Use secrets manager (current approach is fine)

**For CI/CD:** Use platform secrets manager (GitHub Secrets, etc.)

## Migration Plan

1. Update orchestrator to remove credential passing
2. Update agent instructions to skip tests gracefully
3. Update status file schema to record skipped tests
4. Document manual test execution process




