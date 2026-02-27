# Testing instructions: init .env and env config status (branch `fix/init-env-and-error-message`)

Install the unreleased fix:

```bash
npm install -g github:markmhendrickson/neotoma#fix/init-env-and-error-message
```

Verify with the scenarios below.

---

## 1. Init creates .env when Neotoma path is provided (outside source checkout)

**Goal:** Running `neotoma init` from outside a Neotoma source checkout still creates `.env` in the source checkout when you provide the Neotoma path.

1. From a directory that is **not** a Neotoma source checkout (e.g. `cd ~` or `cd /tmp`), run:
   ```bash
   neotoma init
   ```
2. Choose auth mode (e.g. 1 for default user).
3. When prompted for **"Path to Neotoma source checkout"** or **"Neotoma path"**, enter the absolute path to your Neotoma source checkout (e.g. `/Users/you/repos/neotoma`).
4. Complete init.

**Expected:**

- Message: **".env created after Neotoma path was provided."** (if `.env` did not already exist).
- A `.env` file exists in the source root (from `.env.example` if present, otherwise empty).

---

## 2. Initialization box always shows env config status

**Goal:** Running `neotoma` with no arguments (interactive session) always shows Neotoma path and `.env` status—success or not.

**2a. With Neotoma path configured and .env present**

1. `cd` into your Neotoma source checkout (or ensure config has `repo_root` / `NEOTOMA_REPO_ROOT`).
2. Ensure the source checkout has a `.env` file.
3. Run:
   ```bash
   neotoma
   ```

**Expected:** In the **Initialization** box you see something like:

```
Data directory  ✅  /path/to/neotoma/data
.env file       ✅  /path/to/neotoma/.env
```

**2b. With Neotoma path not configured**

1. From a directory that is **not** a Neotoma source checkout and with no `NEOTOMA_REPO_ROOT` and no saved path in config (or use a fresh config), run:
   ```bash
   neotoma
   ```

**Expected:** In the **Initialization** box you see:

```
Neotoma path  ❌  Not configured (run neotoma init or set NEOTOMA_REPO_ROOT)
.env file      ❌  (set Neotoma path first)
```

---

## 3. No-command run shows actionable guidance when path or .env missing

**Goal:** When running `neotoma` with no command in a **non-interactive** context (e.g. script or pipe), stderr includes clear guidance if the Neotoma path or `.env` is missing.

**3a. Neotoma path not configured**

1. Ensure no Neotoma path is configured (run from a non-source-checkout dir, unset `NEOTOMA_REPO_ROOT`, no saved path in config).
2. Run (non-TTY so you get the short message):
   ```bash
   neotoma 2>&1 | cat
   ```
   or
   ```bash
   (echo "" | neotoma) 2>&1
   ```

**Expected:** Exit code 1 and stderr includes:

- "No command given. Run neotoma &lt;command&gt; ..."
- "Neotoma path is not configured in this shell."
- "Run 'neotoma init' to set your Neotoma path, or set NEOTOMA_REPO_ROOT to a Neotoma source checkout."

**3b. Neotoma path configured but .env missing**

1. Configure a Neotoma path (e.g. run from a source checkout or set `NEOTOMA_REPO_ROOT`).
2. Temporarily rename or remove the source checkout `.env` (e.g. `mv .env .env.bak`).
3. Run in non-TTY:
   ```bash
   neotoma 2>&1 | cat
   ```

**Expected:** Stderr includes guidance that `.env` is missing and suggests `neotoma init` or creating the file.

4. Restore `.env` (e.g. `mv .env.bak .env`).

---

## Quick checklist

- [ ] Install: `npm install -g github:markmhendrickson/neotoma#fix/init-env-and-error-message`
- [ ] 1: Init from outside source checkout with path → `.env` created and message shown
- [ ] 2a: `neotoma` in source checkout with `.env` → Data directory ✅, .env file ✅
- [ ] 2b: `neotoma` with no path configured → Neotoma path ❌, .env file ❌ in Initialization box
- [ ] 3a: `neotoma` no command, non-TTY, no path configured → guidance about init/NEOTOMA_REPO_ROOT
- [ ] 3b: `neotoma` no command, non-TTY, path configured but no .env → guidance about .env

Report any mismatch or unclear behavior (e.g. in a PR comment or issue).
