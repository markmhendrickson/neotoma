# debug
Fully reproduce and fix the most recently discussed bug using the native browser workflow. Stay in the browser/DevTools loop until the issue is confirmed resolved.

## Workflow
1. **Identify target bug**
   - Re-read the latest chat context to understand the failing scenario.
   - Summarize the expected vs actual behavior before touching anything.

2. **Confirm dev stack (auto-started)**
   - This command already launched `npm run dev:serve` in the background (logs: `/tmp/neotoma-dev-serve.log`). Tail the log to confirm `[dev-serve] HTTP Actions server reported ready` and capture the Vite port, e.g. `tail -f /tmp/neotoma-dev-serve.log`.
   - Reuse this instance for the entire debugging session. If you need to restart, stop it with `pkill -f scripts/dev-serve.js` and re-run `/debug`.

3. **Reproduce in the native browser**
   - Use the browser automation tools (`browser_navigate`, `browser_click`, etc.) to open `http://localhost:<vite-port>` reported in the log (e.g., `http://localhost:5197/`).
   - Drive the UI exactly like a user until the bug surfaces. Capture screenshots and console logs (`browser_console_messages`) as evidence.
   - Keep DevTools open; note any console/network errors or warnings.

4. **Diagnose**
   - Map the observed failure back to the codebase (components, hooks, backend endpoints). Inspect source files with `read_file`/`grep` as needed.
   - Form a hypothesis for the root cause. Validate quickly (e.g., by checking state in the React DevTools console, running small scripts in the browser console, or instrumenting the code with temporary logs).

5. **Fix**
   - Modify the relevant files to address the root cause.
   - Re-run unit/integration tests that cover the behavior.
   - Rebuild/restart only if necessary (Vite usually hot-reloads).

6. **Verify in browser**
   - Return to the native browser, reload, and re-run the exact reproduction steps.
   - Confirm the bug is gone and no regressions or new console errors appear.

7. **Iterate until fixed**
   - If the issue persists, loop back through reproduction → diagnosis → fix.
   - Only stop when the scenario works end-to-end in the browser and supporting tests pass.

8. **Document**
   - Summarize the root cause, fix, and verification steps in the final chat response (and commit message if applicable).

