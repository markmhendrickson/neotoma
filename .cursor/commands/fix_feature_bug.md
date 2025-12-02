# Fix Feature Bug

Fix a bug in the Neotoma repo.

1. Identify feature_id from error, path, or context.
2. Load:
   - docs/context/index.md
   - spec/features/<feature_id>.md
   - features/<feature_id>.yaml
   - docs/feature_units/standards/error_protocol.md
   - docs/subsystems/i18n.md
   - docs/subsystems/accessibility.md

3. Classify into Class 1, 2, or 3.
4. Apply correction rules:
   - Class 1: patch code only
   - Class 2: update spec/manifest first, then align code/tests
   - Class 3: update subsystem/architecture docs first, then rebuild

5. Always add a regression test.
6. Run lint → TEST_CHANGED → subsystems → TEST_ALL.

7. Output:
   - error_class
   - reason
   - corrected files
   - tests added/updated


