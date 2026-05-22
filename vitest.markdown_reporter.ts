import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Reporter, TestCase, TestModule, TestRunEndReason } from "vitest/node";

import { flushTestReportCasesMarkdown, resetTestReportBuffer } from "./tests/helpers/test_report_buffer.js";
import { redactEnvSummary, redactString } from "./tests/helpers/redact_for_test_report.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function formatTestError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return redactString((err as { message: string }).message).slice(0, 800);
  }
  return redactString(String(err)).slice(0, 800);
}

function collectTests(mod: TestModule): TestCase[] {
  return [...mod.children.allTests()];
}

function markdownEscapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export default class MarkdownRunReporter implements Reporter {
  onTestRunStart(): void {
    resetTestReportBuffer();
  }

  async onTestRunEnd(
    testModules: readonly TestModule[],
    unhandledErrors: readonly unknown[],
    reason: TestRunEndReason,
  ): Promise<void> {
    const outDir = path.join(__dirname, ".vitest", "reports");
    mkdirSync(outDir, { recursive: true });

    const started = new Date().toISOString();
    const lines: string[] = [
      "# Vitest run report",
      "",
      `- **Finished:** ${started}`,
      `- **End reason:** ${reason}`,
      `- **Node:** ${process.version}`,
      "",
      "## Environment (redacted)",
      "",
      redactEnvSummary(),
      "",
    ];

    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const mod of testModules) {
      const rel = redactString(mod.relativeModuleId);
      lines.push(`## ${markdownEscapeCell(rel)}`);
      const diag = mod.diagnostic();
      lines.push("");
      lines.push(
        `- **Module state:** ${mod.state()}`,
        `- **Module duration (ms):** ${diag.duration}`,
        `- **Collect / prepare (ms):** ${diag.collectDuration} / ${diag.prepareDuration}`,
        "",
      );

      const modErrors = mod.errors();
      if (modErrors.length > 0) {
        lines.push("### Collection / module errors");
        for (const e of modErrors) {
          lines.push(`- ${markdownEscapeCell(formatTestError(e))}`);
        }
        lines.push("");
      }

      lines.push("| Result | Duration (ms) | Test |");
      lines.push("| --- | ---: | --- |");

      for (const test of collectTests(mod)) {
        total += 1;
        const res = test.result();
        const state = res.state;
        if (state === "passed") passed += 1;
        else if (state === "failed") failed += 1;
        else if (state === "skipped") skipped += 1;
        const duration = test.diagnostic()?.duration ?? "";
        const name = markdownEscapeCell(test.fullName);
        lines.push(`| ${state} | ${duration} | ${name} |`);
        if (state === "failed" && "errors" in res && res.errors?.length) {
          const msg = formatTestError(res.errors[0]);
          lines.push(`| | | _${markdownEscapeCell(msg)}_ |`);
        }
      }
      lines.push("");
    }

    if (unhandledErrors.length > 0) {
      lines.push("## Unhandled errors");
      lines.push("");
      for (const e of unhandledErrors) {
        lines.push(`- ${markdownEscapeCell(formatTestError(e))}`);
      }
      lines.push("");
    }

    lines.push("## Summary");
    lines.push("");
    lines.push(`| Total | Passed | Failed | Skipped |`);
    lines.push(`| ---: | ---: | ---: | ---: |`);
    lines.push(`| ${total} | ${passed} | ${failed} | ${skipped} |`);
    lines.push("");

    const appendix = flushTestReportCasesMarkdown();
    if (appendix) {
      lines.push(appendix);
    }

    const body = lines.join("\n");
    const stamp = started.replace(/[:.]/g, "-");
    const dated = path.join(outDir, `run-${stamp}.md`);
    writeFileSync(dated, body, "utf8");
    writeFileSync(path.join(outDir, "latest-integration.md"), body, "utf8");
  }
}
