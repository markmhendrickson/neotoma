/**
 * `repository` (engineering bundle) — a source-code repository. Production
 * rows of this type also carry CI-run and chat-turn fields written by
 * mis-typed stores; only the repository's own descriptive fields are kept.
 */

import { defineBundleSchema, str, text } from "../../schema_helpers.js";

export const repositorySchema = defineBundleSchema({
  entity_type: "repository",
  label: "Repository",
  description: "A source-code repository.",
  fields: {
    name: text("Repository name, e.g. 'neotoma'."),
    full_name: text("Owner-qualified slug, e.g. 'owner/repo'."),
    url: str("Canonical web or clone URL."),
    platform: str("Hosting platform, e.g. github, gitlab."),
    path: str("Local checkout path, when the repository is tracked locally."),
    language: str("Primary language."),
    status: str("e.g. active, archived."),
  },
  canonical_name_fields: [{ composite: ["full_name"] }, "url", "name"],
});

export default repositorySchema;
