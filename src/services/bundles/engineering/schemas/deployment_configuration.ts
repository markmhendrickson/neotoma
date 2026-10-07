/**
 * `deployment_configuration` (engineering bundle) — how one project is
 * deployed to one environment. Holds secret NAMES only, never values.
 */

import { bool, defineBundleSchema, list, obj, str, text } from "../../schema_helpers.js";

export const deploymentConfigurationSchema = defineBundleSchema({
  entity_type: "deployment_configuration",
  label: "Deployment Configuration",
  description: "How one project is deployed to one environment.",
  fields: {
    system: str("Hosting system, e.g. a PaaS or cluster name."),
    project: str("Project or instance this configuration belongs to."),
    environment: str("e.g. production, staging, sandbox."),
    region: str("Primary region."),
    public_domain: str("Public hostname serving the deployment."),
    deploy_branch: str("Branch to deploy from."),
    deploy_command: text("Full deploy invocation to run from a clean checkout."),
    build_args: obj("Build args that must be passed explicitly, as {name: value}."),
    verify_url: str("URL to check after deploy to confirm it worked."),
    secret_names: list("Names of required secrets. NAMES ONLY, never values."),
    secret_source: str("Where secret values are materialized from (a pointer, not a value)."),
    always_on: bool("Whether the deployment must never scale to zero."),
    runbook_doc: str("Path of the generic deploy method this configuration instantiates."),
    gotchas: text("Known failure modes and non-obvious constraints."),
  },
  canonical_name_fields: [{ composite: ["system", "project", "environment"] }, "project"],
  agent_instructions:
    "A deployment_configuration records how to deploy one project to one environment. " +
    "Never store secret values: secret_names holds names only. Run deploy_command verbatim " +
    "and confirm with verify_url.",
});

export default deploymentConfigurationSchema;
