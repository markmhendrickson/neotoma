# Testing instructions: init .env and env config status (branch `fix/init-env-and-error-message`)

Install the unreleased fix:

```bash
npm install -g github:markmhendrickson/neotoma#fix/init-env-and-error-message
```

Verify with the scenarios below.

---

## 1. Init creates .env when repo path is provided (outside repo)

**Goal:** Running `neotoma init` from outside the Neotoma repo still creates `.env` in the repo when you provide the repo path.

1. From a directory that is **not** the Neotoma repo (e.g. `cd ~` or `cd /tmp`), run:
   ```bash
   neotoma init
   ```
2. Choose auth mode (e.g. 1 for default user).
3. When prompted **"Path to Neotoma repo"** or **"Repo path"**, enter the absolute path to your Neotoma repo (e.g. `/Users/you/repos/neotoma`).
4. Complete init.

**Expected:**

- Message: **".env created after repo path was provided."** (if `.env` did not already exist).
- A `.env` file exists in the repo root (from `.env.example` if present, otherwise empty).

---

## 2. Initialization box always shows env config status

**Goal:** Running `neotoma` with no arguments (interactive session) always shows repo and .env status—success or not.

**2a. With repo configured and .env present**

1. `cd` into your Neotoma repo (or ensure config has `repo_root` / `NEOTOMA_REPO_ROOT`).
2. Ensure the repo has a `.env` file.
3. Run:
   ```bash
   neotoma
   ```

**Expected:** In the **Initialization** box you see something like:

```
Data directory  ✅  /path/to/repo/data
.env file       ✅  /path/to/repo/.env
```

**2b. With repo not configured**

1. From a directory that is **not** the Neotoma repo and with no `NEOTOMA_REPO_ROOT` and no saved repo in config (or use a fresh config), run:
   ```bash
   neotoma
   ```

**Expected:** In the **Initialization** box you see:

```
Repo path      ❌  Not configured (run neotoma init or set NEOTOMA_REPO_ROOT)
.env file      ❌  (set repo path first)
```

---

## 3. No-command run shows actionable guidance when repo or .env missing

**Goal:** When running `neotoma` with no command in a **non-interactive** context (e.g. script or pipe), stderr includes clear guidance if repo or .env is missing.

**3a. Repo not configured**

1. Ensure no repo is configured (run from non-repo dir, unset `NEOTOMA_REPO_ROOT`, no saved repo in config).
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
- "Neotoma repo is not configured in this shell."
- "Run 'neotoma init' to set repo path, or set NEOTOMA_REPO_ROOT to your Neotoma repo."

**3b. Repo configured but .env missing**

1. Configure repo (e.g. run from repo or set `NEOTOMA_REPO_ROOT`).
2. Temporarily rename or remove the repo’s `.env` (e.g. `mv .env .env.bak`).
3. Run in non-TTY:
   ```bash
   neotoma 2>&1 | cat
   ```

**Expected:** Stderr includes guidance that `.env` is missing and suggests `neotoma init` or creating the file.

4. Restore `.env` (e.g. `mv .env.bak .env`).

---

## Quick checklist

- [ ] Install: `npm install -g github:markmhendrickson/neotoma#fix/init-env-and-error-message`
- [ ] 1: Init from outside repo with path → `.env` created and message shown
- [ ] 2a: `neotoma` in repo with `.env` → Data directory ✅, .env file ✅
- [ ] 2b: `neotoma` with no repo → Repo path ❌, .env file ❌ in Initialization box
- [ ] 3a: `neotoma` no command, non-TTY, no repo → guidance about repo/init/NEOTOMA_REPO_ROOT
- [ ] 3b: `neotoma` no command, non-TTY, repo but no .env → guidance about .env

Report any mismatch or unclear behavior (e.g. in a PR comment or issue).
