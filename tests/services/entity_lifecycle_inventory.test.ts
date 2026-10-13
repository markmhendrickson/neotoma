/** Bounded static sink inventory; native effects are exercised separately. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ordinary = {
  "src/services/observation_insert.ts":
    "closed row builder for store/correct/group CAS/conditional",
  "src/services/observation_storage.ts": "factual attachment mutation",
  "src/services/interpretation.ts": "closed interpretation and canonical-hash retry rows",
  "src/services/schema_lag_repair.ts": "closed repair row and owned repair-run undo",
  "src/services/schema_registry.ts": "closed promoted-fragment row",
  "src/services/guest_access_token.ts": "closed ordinary token observation",
  "src/services/gdpr_deletion.ts": "reserved privacy field encryption/physical erasure",
  "src/services/deletion.ts": "pre-cutover entity branch and unchanged relationship branch",
  "src/services/entity_split.ts": "fact-only typed attachment move",
};
const raw = {
  "src/services/entity_lifecycle_storage.ts": "only private append/cutover authority SQL",
  "src/services/entity_merge.ts": "mutable attachment only, immutable target retained",
  "src/services/sandbox/sessions.ts":
    "reserved expired sandbox tenant erasure, never authority minting",
  "src/cli/index.ts": "preflight-refused authority import and explicit local context rebuild",
  "src/repositories/sqlite/local_db_adapter.ts":
    "dynamic payload preflight and owned context rebuild",
};
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((e) => {
      const name = path.join(directory, e.name);
      return e.isDirectory() ? files(name) : [name];
    })
    .filter((p) => p.endsWith(".ts") && !p.includes(".test.") && !p.includes("__tests__"));
}
function sinks(name: string, text: string): string[] {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["insert", "upsert", "update", "delete"].includes(node.expression.name.text) &&
      /\.from\(["']observations["']\)/.test(node.expression.expression.getText(source))
    )
      result.push("adapter");
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (/(?:INSERT(?: OR [A-Z]+)? INTO|UPDATE|DELETE FROM) observations\b/.test(text))
    result.push("sql");
  return result;
}
describe("classified lifecycle observation ingress", () => {
  it("classifies every directly named writer and privileged raw SQL in current source", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const seen = new Set<string>();
    for (const absolute of files(path.join(root, "src"))) {
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      const found = sinks(relative, readFileSync(absolute, "utf8"));
      if (found.length) {
        expect(Object.keys({ ...ordinary, ...raw }), relative).toContain(relative);
        seen.add(relative);
      }
    }
    expect([...seen]).toContain("src/services/observation_insert.ts");
    expect([...seen]).toContain("src/services/entity_lifecycle_storage.ts");
    expect(
      readFileSync(path.join(root, "src/repositories/sqlite/local_db_adapter.ts"), "utf8")
    ).toContain("assertOrdinaryLifecyclePayload");
    expect(readFileSync(path.join(root, "src/cli/index.ts"), "utf8")).toContain(
      "assertOrdinaryLifecycleImport"
    );
  });
  it("detects a new unclassified ordinary writer and raw authority sink", () => {
    expect(sinks("synthetic.ts", 'db.from("observations").insert(payload);')).toEqual(["adapter"]);
    expect(sinks("synthetic.ts", 'const sql = "INSERT INTO observations(id) VALUES (?)";')).toEqual(
      ["sql"]
    );
    expect(Object.keys({ ...ordinary, ...raw })).not.toContain(
      "src/services/synthetic_unclassified.ts"
    );
  });
});
