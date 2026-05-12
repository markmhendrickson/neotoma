import { redactRecord } from "./redact_for_test_report.js";

export type ReportCaseRow = {
  suite: string;
  title: string;
  data: Record<string, unknown>;
};

const rows: ReportCaseRow[] = [];

/** Append a human-facing scenario row (redacted) for the Markdown reporter appendix. */
export function reportCase(row: ReportCaseRow): void {
  rows.push({
    suite: row.suite,
    title: row.title,
    data: redactRecord(row.data),
  });
}

export function resetTestReportBuffer(): void {
  rows.length = 0;
}

export function flushTestReportCasesMarkdown(): string {
  if (rows.length === 0) {
    return "";
  }
  const lines: string[] = ["## Scenario notes (opt-in)", "", "| Suite | Case | Data |", "| --- | --- | --- |"];
  for (const r of rows) {
    const dataCell = JSON.stringify(r.data).replace(/\|/g, "\\|");
    lines.push(`| ${r.suite} | ${r.title} | ${dataCell} |`);
  }
  lines.push("");
  return lines.join("\n");
}
