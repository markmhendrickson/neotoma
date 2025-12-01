## dev-serve

Start the full-stack dev serve orchestration (`npm run dev:serve`) so the HTTP Actions server and Vite UI boot together with diagnostics.

### Preconditions
- `.env.development` (or `.env`) defines `DEV_SUPABASE_URL` and `DEV_SUPABASE_SERVICE_KEY` (or fallback values via `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`).
- Dependencies installed via `npm install`.
- No other dev servers occupying the branch-scoped ports that `with-branch-ports` assigns.

### Execution
1. Open the integrated terminal (already rooted at the repo when called from the command palette).
2. Launch the stack as a background job (always use background mode, even when running manually):
   ```
   npm run dev:serve &
   ```
   (In Cursor automations, use the background flag when invoking the command.)
3. Monitor output until you see both readiness lines, e.g. `[dev-serve] HTTP Actions server reported ready` and `[dev-serve] Vite dev server reported ready`. Leave the background job running.
4. **Immediately after readiness, list the accessible URLs for each service** using the resolved ports (for example, `HTTP Actions: http://localhost:8140`, `Vite UI: http://localhost:5233`, `WebSocket bridge: ws://localhost:8166`). If the stack fails before readiness, still report the intended ports gleaned from the `with-branch-ports` banner.
5. If you need to stop it later, bring the job to the foreground with `fg %<jobnum>` and send Ctrl+C, or run `pkill -f scripts/dev-serve.js`.

### Debugging
- Missing Supabase env → command exits immediately; populate `.env.development`.
- Port conflicts → previous dev stack still running; terminate it or set `HTTP_PORT`/`VITE_PORT` before rerunning.
- Dependency errors → run `npm install`.
- Vite config errors → inspect recent stderr lines emitted by the command; fix `vite.config.ts` or the referenced modules, then re-run the command.



