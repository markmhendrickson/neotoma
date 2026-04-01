# File ranking heuristic

## Purpose

When an agent discovers local files during onboarding, it must rank them by likely value for state reconstruction. This document defines the composite scoring model, signal taxonomy, and candidate classification that agents use to select high-signal files and skip noise.

The goal is to maximize signal density per file ingested, not to maximize file count.

## Composite scoring model

```
value_score = entity_density
            + temporal_density
            + relationship_potential
            + recency
            + user_salience
            - sensitivity_risk
            - noise
```

Each factor is evaluated heuristically by the agent from file metadata, filename, folder path, and (when needed) small content excerpts. The agent does not need to compute a numeric score; the model describes the relative weighting of signals when deciding which files to propose.

## Signal taxonomy

### Positive signals (increase value score)

| Signal | What to look for | Weight |
| --- | --- | --- |
| **Repeated named entities** | Same person, company, or project name appears multiple times in content | High |
| **Dates and version markers** | Filenames or content containing dates, v2, amendment, revision, draft | High |
| **Decision-rich filenames** | meeting, notes, brief, proposal, contract, transcript, agreement, scope | High |
| **Recent modification** | Files modified in the last 90 days (strongest), last 6 months (moderate) | High |
| **Coherent folder names** | Folders named by client, project, or domain (Clients/Acme, Projects/Neotoma) | Medium |
| **Cross-format co-occurrence** | Same entity name appears in PDF, markdown, and txt within the same subtree | Medium |
| **Recurring filenames** | Versioned series (proposal_v1.md, proposal_v2.md) or dated series (2026-03-01.md) | Medium |
| **Structured exports** | JSON, CSV, or markdown exports from chat platforms, CRMs, or other tools | Medium |
| **Small file count in folder** | Folders with 5-50 files are more likely curated than folders with thousands | Low |

### Negative signals (decrease value score or exclude)

| Signal | What to look for | Action |
| --- | --- | --- |
| **Dependency directories** | node_modules, .git, __pycache__, vendor, .venv, bower_components | Exclude |
| **Build output** | build/, dist/, .cache, .next, .nuxt, target/, out/ | Exclude |
| **Media folders** | Folders of images, video, or audio files by extension (.jpg, .mp4, .wav) | Exclude |
| **Large binary files** | Files > 50MB, .zip, .tar, .dmg, .iso, .exe | Exclude |
| **System files** | .DS_Store, Thumbs.db, desktop.ini, .Spotlight-V100 | Exclude |
| **Generic archives** | Old backup directories, timestamped zip archives | Deprioritize |
| **Unstructured downloads** | ~/Downloads with no entity or temporal signals in filenames | Deprioritize |
| **Code source files** | .js, .ts, .py, .go, .rs without decision/entity content | Deprioritize |

### Sensitivity signals (flag for user review)

| Signal | Action |
| --- | --- |
| Files containing keywords: password, secret, credential, ssn, social security | Flag, do not auto-propose |
| Files in paths containing: .ssh, .gnupg, .aws, credentials | Exclude |
| Files with restricted extensions: .pem, .key, .pfx, .p12 | Exclude |
| Files in system directories: /etc, /var, /usr, ~/Library | Exclude |

## Strong candidates (ordered by typical value)

1. **Chat transcripts and conversation exports** -- ChatGPT exports (JSON), Claude conversation history, Slack/Discord channel exports, meeting transcripts. These encode decision flow, commitments, and entity references with timestamps.
2. **Project folders with recurring filenames** -- Versioned documents, dated files, multiple formats referencing the same domain. These contain state evolution.
3. **Contracts, proposals, and briefs** -- High entity density, version markers, decision points, commitment language.
4. **Meeting notes and transcripts** -- Date-stamped, entity-rich, decision-capturing. Especially valuable when cross-referenceable with other files.
5. **Notes folders with dated files** -- Obsidian vaults, markdown work logs, dated journal entries. Good temporal density.
6. **Documents with repeated entity references** -- Any file type where the same client, project, or person name recurs across sections.

## Weak candidates (skip or deprioritize)

- Random downloads with no entity or temporal markers
- Media folders (photos, videos, audio)
- Code dependency directories
- Cache and build output
- Generic archives and old system backups
- Single-use files with no relationship to other artifacts

## Folder structure as meaning

Agents should interpret folder hierarchy as implicit entity structure:

- `Clients/Acme/Contracts/` implies a client entity (Acme) containing contract entities
- `Projects/Neotoma/Meeting Notes/` implies a project entity with linked meeting events
- Recency and adjacency: files in the same subtree, modified around the same dates, likely belong to the same state cluster
- Repeated names across formats within a subtree are strong entity candidates (e.g., "Acme" in .pdf, .md, and .txt under `Clients/Acme/`)

Folder depth also matters: files 1-3 levels deep from a named domain folder are more likely curated than deeply nested files.

## How agents use this heuristic

During onboarding discovery (see `install.md` Stage 3):

1. **Shallow scan** -- read top-level folders, recent files, filenames, and metadata. Do not read full file contents unless a small excerpt is needed to confirm entity density.
2. **Apply scoring** -- evaluate each candidate against positive and negative signals. Group related files into domain clusters by folder structure and entity co-occurrence.
3. **Rank and propose** -- present the top candidates grouped by domain, with explanations of why each was selected and what state value it could unlock.
4. **Respect exclusions** -- never propose excluded file types. Flag sensitivity signals for user review.

The agent should communicate in terms of domains and timelines, not file counts:

- Good: "Detected 3 likely high-value domains: Acme project (4 files), Zurich insurance (3 files), Neotoma docs (6 files)"
- Bad: "Found 13 files to import"

## Related documents

- [What to store](what_to_store.md) -- canonical rubric for what data is worth storing
- [Install workflow](../../install.md) -- agent onboarding flow that uses this heuristic
- [Agent onboarding confirmation](../developer/agent_onboarding_confirmation.md) -- detailed stage-by-stage onboarding guide
