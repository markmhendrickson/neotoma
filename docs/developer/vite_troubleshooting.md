# Vite Troubleshooting Guide
## Common Issues and Solutions
### Outdated Optimize Dep Error
**Error:** `GET http://localhost:XXXX/@fs/... net::ERR_ABORTED 504 (Outdated Optimize Dep)`
**Cause:** Vite's dependency optimization cache is outdated, typically after:
- Adding new npm packages
- Updating dependencies
- Adding new component imports (especially Radix UI components)
**Solution 1: Restart Dev Server (Recommended)**
```bash
# Stop the dev server (Ctrl+C)
# Then restart
npm run dev:ui
```
Vite will automatically detect the outdated cache and re-optimize dependencies.
**Solution 2: Force Cache Clear**
```bash
# Stop the dev server first, then:
rm -rf node_modules/.vite
# Restart the dev server
npm run dev:ui
```
**Solution 3: Permission Issues (EACCES Error)**
If you see `EACCES: permission denied` errors, the cache files may be owned by root:
```bash
# Fix ownership (may require password)
sudo chown -R $(whoami):staff node_modules/.vite
# Then remove cache
rm -rf node_modules/.vite
# Restart dev server
npm run dev:ui
```
**Alternative:** If sudo is not available, you can work around this by:
1. Stopping all dev processes completely
2. Waiting a few seconds for file locks to release
3. Manually deleting the cache directory in Finder/File Manager
4. Restarting the dev server
**Solution 3: Force Re-optimization**
```bash
# Set environment variable to force re-optimization
VITE_FORCE_OPTIMIZE=true npm run dev:ui
```
### Port Already in Use
**Error:** `Port XXXX is already in use`
**Solution:**
```bash
# Find and kill the process using the port
lsof -ti:5173 | xargs kill -9
# Or use a different port
VITE_PORT=5174 npm run dev:ui
```
### HMR (Hot Module Replacement) Not Working
**Symptoms:** Changes to files don't reflect in browser automatically
**Solutions:**
1. Check browser console for WebSocket errors
2. Verify HMR port matches server port in `vite.config.ts`
3. Clear browser cache and hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
4. Restart dev server
### Module Not Found Errors
**Error:** `Cannot find module '@/components/...'`
**Solution:**
1. Verify the file exists at the correct path
2. Check `vite.config.ts` alias configuration
3. Restart dev server (path resolution is cached)
### Build Errors
**Error:** Build fails with dependency errors
**Solution:**
```bash
# Clear all caches and reinstall
rm -rf node_modules/.vite
rm -rf node_modules
npm install
npm run build:ui
```
## Best Practices
1. **Always restart dev server** after:
   - Installing new packages
   - Adding new Radix UI / shadcn components
   - Changing `vite.config.ts`
2. **Clear cache** if you see persistent errors:
   ```bash
   rm -rf node_modules/.vite
   ```
3. **Check browser console** for specific error messages - Vite provides helpful error details
4. **Use browser DevTools Network tab** to see which files are failing to load
## Environment Variables
- `VITE_PORT`: Override default dev server port (default: 5173)
- `VITE_FORCE_OPTIMIZE`: Force dependency re-optimization (set to `true`)
- `HTTP_PORT`: Backend API port (default: 8080)
- `WS_PORT`: WebSocket port (default: 8081)
## Agent Instructions
### When to Load This Document
Load `docs/developer/vite_troubleshooting.md` when:
- Frontend (Vite) dev server is failing or behaving unexpectedly
- HMR, ports, or optimize-deps issues block UI work
- You need to debug local UI environment problems
### Required Co-Loaded Documents
- `docs/developer/getting_started.md` (environment setup)
- `vite.config.ts` (Vite configuration)
### Constraints Agents Must Enforce
1. MUST NOT modify Vite configuration or scripts without cross-checking architecture and UI docs
2. MUST preserve existing dev workflows and branch-aware port behavior
3. MUST NOT add non-deterministic behavior to build/dev scripts
### Forbidden Patterns
- Editing troubleshooting guide to change product behavior (code lives in configs/scripts, not here)
- Suggesting global `sudo` fixes that break local environments
- Recommending cache clears that delete user data beyond dev caches
### Validation Checklist
- [ ] Troubleshooting steps keep existing dev workflows intact
- [ ] No changes conflict with `docs/developer/development_workflow.md`
- [ ] No instructions violate determinism or environment isolation
