import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

const uiMatchers: Array<RegExp> = [
  /^frontend\/src\//,
  /^frontend\/index\.html$/,
  /^frontend\/.*\.(css|ts|tsx)$/,
  /^vite\.config\.ts$/,
  /^vitest\.config\.ts$/,
];

const coverageMatchers: Array<RegExp> = [
  /^playwright\/tests\//,
  /^docs\/ui-playwright-coverage\.md$/,
  /^playwright\/tests\/coverage-map\.json$/,
  /^playwright\.config\.ts$/,
];

async function getChangedFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--name-only', '--cached'],
    { cwd: repoRoot },
  );
  return stdout
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

async function main() {
  const changedFiles = await getChangedFiles();
  if (changedFiles.length === 0) {
    console.log('No staged changes detected. Skipping coverage enforcement.');
    return;
  }

  const touchedUi = changedFiles.some((file) =>
    uiMatchers.some((regex) => regex.test(file)),
  );
  if (!touchedUi) {
    console.log('No UI-facing files staged. Skipping coverage enforcement.');
    return;
  }

  const touchedCoverage = changedFiles.some((file) =>
    coverageMatchers.some((regex) => regex.test(file)),
  );

  if (!touchedCoverage) {
    const message = [
      'Playwright coverage enforcement failed:',
      '- UI-facing files were staged without any accompanying Playwright specs or coverage artifacts.',
      '- Update `playwright/tests/**`, `playwright/tests/coverage-map.json`, or `docs/ui-playwright-coverage.md` to document the change.',
      '- If this change intentionally does not affect the UI, split the commit or add a minimal coverage note update.',
    ].join('\n');
    console.error(message);
    process.exit(1);
  }

  console.log('Playwright coverage check passed.');
}

main().catch((error) => {
  console.error('Failed to verify Playwright coverage:', error);
  process.exit(1);
});


