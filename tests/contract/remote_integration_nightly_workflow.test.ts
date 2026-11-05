import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const WORKFLOW = ".github/workflows/remote_integration_nightly.yml";

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface RemoteIntegrationWorkflow {
  jobs?: {
    remote_integration?: {
      steps?: WorkflowStep[];
    };
  };
}

function workflowSteps(): WorkflowStep[] {
  const source = fs.readFileSync(path.join(repoRoot, WORKFLOW), "utf8");
  const workflow = load(source) as RemoteIntegrationWorkflow;
  const steps = workflow.jobs?.remote_integration?.steps;
  if (!steps) throw new Error(`remote_integration steps missing from ${WORKFLOW}`);
  return steps;
}

describe("remote_integration_nightly_workflow", () => {
  it("builds the server after install and before the remote critical suite", () => {
    const commands = workflowSteps().map((step) => step.run?.trim());
    const installIndex = commands.indexOf("npm ci");
    const buildIndex = commands.indexOf("npm run build:server");
    const suiteIndex = commands.indexOf("npm run test:remote:critical");

    expect(
      installIndex,
      "the workflow must install dependencies with npm ci"
    ).toBeGreaterThanOrEqual(0);
    expect(buildIndex, "the workflow must use the existing build:server path").toBeGreaterThan(
      installIndex
    );
    expect(suiteIndex, "the workflow must run the remote critical suite").toBeGreaterThan(
      buildIndex
    );
  });

  it("does not substitute an inline or alternate distribution build", () => {
    const buildCommands = workflowSteps()
      .map((step) => step.run?.trim())
      .filter(
        (command): command is string =>
          command !== undefined &&
          /(?:^|\s)(?:tsc|npm\s+run\s+(?:build|compile))(?::|\s|$)/.test(command)
      );

    expect(buildCommands).toEqual(["npm run build:server"]);
  });
});
