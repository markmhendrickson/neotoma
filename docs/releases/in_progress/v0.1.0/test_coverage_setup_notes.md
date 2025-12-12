# Test Coverage Setup Notes

## Required Dependencies

To run test coverage, install the vitest coverage package:

```bash
npm install --save-dev @vitest/coverage-v8
```

## Running Coverage

After installing dependencies:

```bash
# Run full test coverage
npm run test:coverage

# Run coverage for critical path services only
npm run test:coverage:critical
```

## Coverage Configuration

Coverage is configured in `vitest.config.ts` with the following settings:

- **Provider**: v8
- **Reporters**: text, json, html, lcov
- **Thresholds**: 80% for lines, functions, branches, statements
- **Critical Paths**: 100% coverage required for:
  - `src/services/entity_resolution.ts`
  - `src/services/event_generation.ts`
  - `src/services/graph_builder.ts`
  - `src/services/file_analysis.ts`
  - `src/services/search.ts`
  - `src/services/observation_ingestion.ts`
  - `src/reducers/**/*.ts`

## Coverage Reports

Coverage reports will be generated in:

- `coverage/index.html` - HTML report (browse in browser)
- `coverage/coverage-final.json` - JSON report
- `coverage/lcov.info` - LCOV format for CI/CD integration

## Next Steps

1. Install `@vitest/coverage-v8` package
2. Run `npm run test:coverage`
3. Review coverage reports
4. Document gaps in `test_coverage_gap_analysis.md`
5. Add tests to close gaps
6. Verify 100% critical path coverage before v0.1.0 deployment




