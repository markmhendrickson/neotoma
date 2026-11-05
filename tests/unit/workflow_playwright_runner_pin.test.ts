import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Guard for #2682: Playwright only supports specific Ubuntu images. A job that
// installs a Playwright browser must pin its runner image instead of using a
// floating label (`ubuntu-latest`), otherwise a runner-image rollover breaks CI
// and the GitHub Pages deploy with no change on our side.
const WORKFLOWS_DIR = path.resolve(__dirname, "../../.github/workflows");

function jobsOf(text: string): Array<{ name: string; body: string }> {
  const lines = text.split("\n");
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt < 0) return [];
  const starts: Array<{ name: string; at: number }> = [];
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const m = /^  ([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (m) starts.push({ name: m[1], at: i });
  }
  return starts.map((s, i) => ({
    name: s.name,
    body: lines.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : lines.length).join("\n"),
  }));
}

describe("workflows that install Playwright browsers", () => {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));

  it("finds the workflows", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("pin runs-on to a fixed image, not a floating label", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const f of files) {
      const text = readFileSync(path.join(WORKFLOWS_DIR, f), "utf8");
      for (const job of jobsOf(text)) {
        if (!/playwright\s+install/.test(job.body)) continue;
        checked++;
        const m = /^\s+runs-on:\s*(\S+)/m.exec(job.body);
        const label = m ? m[1] : "(missing)";
        if (!/^ubuntu-\d{2}\.\d{2}$/.test(label)) offenders.push(`${f}:${job.name} -> ${label}`);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
    expect(offenders).toEqual([]);
  });
});
