# Action item 6 plan: strict error taxonomy

## Context summary
REST handlers return string errors. Error responses are not aligned to `docs/subsystems/errors.md`.

## Key problems solved
- Error responses are not machine checkable.
- Canonical error codes are not enforced.

## Key solutions implemented
- Use ErrorEnvelope for REST and MCP responses.
- Enforce canonical error codes in handlers.

## Plan
1. Introduce a shared error factory that emits ErrorEnvelope with canonical codes.
2. Replace string errors in `src/actions.ts` with ErrorEnvelope responses.
3. Align MCP error handling in `src/server.ts` with the same error factory.
4. Add tests that assert `error_code`, `message`, and `timestamp` fields.
