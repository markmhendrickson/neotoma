/**
 * Regression tests for `neotoma api start --env prod` after the npm-script
 * taxonomy moved source-checkout HTTP stacks under `dev:server:*`.
 */

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("neotoma api start --env prod on source checkout", () => {
  it("uses dev:server:prod as the source-checkout prod spawn target", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    expect(compiled).toContain("dev:server:prod");
  });

  it("uses dev:server:prod:tunnel for the prod tunnel branch", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    expect(compiled).toContain("dev:server:prod:tunnel");
  });

  it("uses start:server:prod for installed-package prod starts", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    expect(compiled).toContain("start:server:prod");
  });

  it("does not contain the old dev:prod deprecation branch", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    expect(compiled).not.toMatch(
      /deprecation: `neotoma api start --env prod` on a source checkout currently runs/
    );
  });

  it("keeps legacy npm aliases while documenting canonical names", async () => {
    const pkgRaw = await readFile(
      resolve(__dirname, "../../package.json"),
      "utf-8"
    );
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["dev:server:prod"]).toBeDefined();
    expect(pkg.scripts?.["dev:prod"]).toBe("npm run dev:server:prod");
    expect(pkg.scripts?.["start:server:prod"]).toBeDefined();
    expect(pkg.scripts?.["start:api:prod"]).toBe("npm run start:server:prod");
  });
});
