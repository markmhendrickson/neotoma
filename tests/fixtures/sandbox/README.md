# Sandbox fixtures

Synthetic and public-domain sample data used to seed `sandbox.neotoma.io` via
`scripts/seed_sandbox.ts`. Every file here is safe to publish openly:

- No real personal data or internal references.
- Text/image assets are either synthesized or sourced from public-domain /
  CC0 material (Project Gutenberg excerpts, clearly-marked CC0 imagery).
- Conversation samples describe fictional characters interacting with a
  fictional AI; they are not derived from any real transcript.

See `manifest.json` for the canonical list of files, entity types, and the
four synthetic agent identities (`agent_sub` values) that rotate through
seeding to populate the `/agents` page with diversity.

**Do not add any real user data here.** For proprietary/internal fixtures,
use `tests/fixtures/json/*` or `tests/fixtures/feedback/*` — those are not
loaded by the sandbox seeder.
