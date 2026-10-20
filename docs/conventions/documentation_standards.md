---
version: "1.1.0"
last_updated: "2026-10-20"
status: "canonical"
summary: "The structure, syntax, and claim rules every Neotoma doc follows, so it reads correctly on GitHub and in the neotoma.io docs viewer."
---

# Neotoma documentation standards

The structure, syntax, and claim rules every Neotoma doc follows, so it reads correctly on GitHub and in the neotoma.io docs viewer.

Applies to every markdown file under `docs/` and to `README.md` and `install.md`, on main.

## Scope

This document covers:

- The header every doc starts with and the sections that follow it
- The markdown syntax allowed, and what to use instead of the rest
- Links, code fences, tables, and images
- Claim rules and the vocabulary for signals
- The closing Agent Instructions section and the GitHub edit link

It does not cover:

- Code conventions
- Feature unit templates
- Release planning workflows
- Site pages written in MDX (see [Public site pages](#public-site-pages-mdx))

## Purpose

One source file serves two readers: a person on GitHub or in the docs viewer, and an agent that loads the file as instructions. These rules keep both readings correct and keep every behavioural statement true of the release the page names.

## Invariants

1. Documentation aligns with `docs/NEOTOMA_MANIFEST.md` and the [canonical vocabulary](../vocabulary/canonical_terms.md).
2. Every behavioural statement is true of the code at the release the page names. A statement that cannot be verified is removed or marked as unverified.
3. Documentation contains no personal data or secrets.
4. Documentation uses direct, declarative language.

## Definitions

- **Summary sentence:** the first paragraph after the H1; one plain sentence that says what the page is.
- **Applicability line:** the line after the summary that names the release the page describes.
- **Agent Instructions:** the closing section that tells an agent when to load the page and what to enforce. GitHub shows it; the planned neotoma.io docs viewer drops it.
- **Docs viewer:** the planned neotoma.io pages rendered at build time from these markdown files. Rules on this page that mention the viewer describe how it is meant to treat a file.

## Terminology (preferred wording)

- Prefer **agent** over **bot** in prose when referring to automated actors (MCP clients, CI submitters, GitHub Apps, delegated machine identities). Reserve **bot** for literal config values, upstream API names, or GitHub product terms when accuracy requires it (for example `github_auth: "bot"` in `IssuesConfig`, or "GitHub bot user").
- Prefer **issue reporting** or **GitHub Issues** over the retired "feedback pipeline" language unless the document is about migration history.

## What docs say Neotoma is

Neotoma is the system of record for AI agents. It keeps observations with their sources and computes the current value of each field for connected agents to read. It is not an app, an agent, or a strategy or execution system. The lead contrast is "a record, not recall".

Describe these properties only as far as the code supports them:

- **Provenance:** each current field names the observation that set it, and observations from a store link to their source. A correction observation has no source.
- **Determinism:** the reducer produces the same snapshot from the same observations and merge policies. Entity ids derive from the entity type and its identifying fields and agree across instances. Source and observation ids depend on the user and on the interpretation run, so they can differ between instances and runs (through the CLI each install can have its own local user; each interpretation run gets a new id). Do not write that source or observation ids match across instances.
- **Corrections:** a correction adds an observation, and the earlier value stays listed. A later write can replace a corrected value.
- **History:** an as-of read exists for one entity at a time (`retrieve_entity_snapshot` with `at` or `at_ingested`); there is no as-of query across the whole record, and export carries current values only.
- **Network use:** the CLI checks the npm registry for a newer release about once a day (off with `--no-update-check` or `NO_UPDATE_NOTIFIER=1`). The stdio MCP server checks when a session starts and about every 6 hours after that (off with `NO_UPDATE_NOTIFIER=1`). The request carries only the package name, and the registry sees ordinary connection metadata. Never write "no telemetry" or "no network egress" without that caveat.

## Required document structure

### File header

Every documentation file begins with an H1, then one summary sentence, then an applicability line:

```markdown
# Neotoma CLI reference

How to run the `neotoma` command and what each command does.

Applies to v0.25.0 and main.
```

Rules for the header:

- One H1 per file.
- The summary sentence is the first paragraph, plain text, at most about 160 characters. It is not a bold tagline or an italic subtitle.
- When the file has YAML front matter, the front matter `summary` repeats the summary sentence. Front matter is optional; add it only where the docs index needs it.
- The applicability line names the release: "Applies to v0.25.0 and main." When main differs, say so on the line ("Applies to main; the latest release, v0.25.0, lacks the array item patch.") or mark the section that differs.
- `## Scope` may follow the applicability line. It never sits directly under the H1.

### Core sections

Include these sections when they apply, in this order:

1. Purpose
2. Scope
3. Invariants
4. Definitions
5. Data models or schemas
6. Flows or sequences
7. Examples
8. Testing requirements
9. Agent Instructions (always last)

## Markdown syntax

### Headings

- Use h1 to h3 only, and do not skip a level.
- Keep heading text unique within a page. The viewer's side navigation and the GitHub anchors are built from h2 and h3 text, so two headings with the same text produce colliding anchors.
- Do not number headings.

### Allowed syntax

CommonMark plus these GitHub Flavored Markdown features: tables, fenced code blocks, strikethrough, and autolinks. Inline code, bold, italic, lists, and blockquotes are fine.

### Not allowed

- GitHub alerts (`> [!NOTE]` and similar)
- `<details>` blocks and any other raw HTML, including a bare `<placeholder>` outside backticks (write `` `<placeholder>` `` instead)
- Footnotes, math, and emoji shortcodes
- Task lists (`- [ ]`); write a plain list
- Status emoji such as check marks and crosses; write the word ("Done", "Avoid", "Forbidden")
- Mermaid diagrams. The docs viewer will not pre-render them, and the in-app `/docs` renderer (`src/services/docs/markdown_render.ts`) has no Mermaid support. Use a numbered list of steps or a plain-text diagram in a `text` fence.

## Links

- Use relative links between repo files, and make sure each one resolves at the commit. A link to a file that does not exist, or to an anchor no heading produces, is a defect.
- Do not link to untracked or local-only paths such as `.cursor/plans/`.
- Do not link to retired neotoma.io routes. The live routes are `/` and `/install`; the held routes are `/evaluate`, `/markdown`, `/skills`, `/meet`, and the legal pages (`/privacy`, `/terms`, `/sandbox`). See `frontend/src/site/route_retirement.ts`.
- Do not present `neotoma.fly.dev` or any other single host as a production base URL. Write `https://<your-instance-host>`.
- Files under `docs/foundation/` are not rendered in the docs viewer; links to them open on GitHub. Link them with a relative link or a GitHub URL, and never edit them to match another doc.
- A link to a directory or a non-markdown file opens on GitHub.

## Code fences

- Every fence names a language, for example `bash`, `json`, `jsonc`, `http`, `yaml`, `ini`, `ts`, `toml`, `markdown`, or `text` for prompts, URLs, diagrams, and sample output.
- Shell fences contain commands only. Put sample output in a separate `text` fence.
- Verbatim CLI output in a `text` fence keeps the characters the CLI prints, including em dashes and symbols such as a warning sign. The dash and status-emoji rules on this page apply everywhere else.

## Tables

- At most four columns.
- Keep cells short, under about 80 characters. When a row needs more, use a list instead.

## Images

- Use a relative path to a file in the repo.
- Give every image alt text.
- Keep images at most 1200 px wide.

## Claim rules

- The category noun is "system of record". The retired category nouns are "memory layer", "state layer", "truth layer", and "deterministic state", and "your agents forget" is a retired framing. Do not use them to describe Neotoma.
- Do not claim that corrections always win, that the database enforces append-only storage, that any historical state of the whole record can be replayed or queried, that export includes history, that hosted Neotoma is for sale, that Neotoma is a unified platform, or that it settles authority between several operators.
- Do not claim more tool support than `neotoma setup --tool` provides. Its documented values are claude-code, cursor, codex, openclaw, and claude-desktop; Windsurf, Continue, VS Code, and IronClaw are configured by hand.
- The claim scan covers fenced text and diagrams as well as prose. Identifiers that contain a retired word are allowed: `kind: memory`, `MEMORY.md`, `memory-export`, and `remember-*` skill names. Third-party products' own memory features may be described by name.

## Mechanical check

`tests/unit/docs_hygiene.test.ts` enforces the syntax and link rules on this page, and the retired-noun rule, for the docs listed in that test. The rules themselves live in `scripts/docs_hygiene.ts` so other checks can reuse them. When you bring another doc up to these standards, add it to the test's list.

## Flows and sequences

Describe a flow as a numbered list of steps in a stable order, or as a plain-text diagram in a `text` fence with stable node names.

## Examples

Examples are complete and use realistic but synthetic data. Do not use real names, emails, or ids.

## Testing requirements

Each doc that describes behaviour lists the tests that check it, or names the source file where the behaviour lives.

## Agent Instructions section

The final section of a doc is `## Agent Instructions`, with these h3 subsections when they apply: When to Load This Document, Required Co-Loaded Documents, Constraints Agents Must Enforce, Forbidden Patterns, and Validation Checklist. The docs viewer drops the whole section; GitHub readers still see it. Nothing a human reader needs goes only in this section.

## View and edit on GitHub

Do not write an edit link into the page. The docs viewer adds a "View and edit on GitHub" link at the end of every rendered page, with the commit the page was built from.

## Signaling and event-emission terminology

When documenting Neotoma's state-change signaling (see `docs/foundation/philosophy.md` §5.9), use vocabulary that keeps the boundary between Neotoma and the systems that act on its signals. Neotoma emits structured reports of completed writes; it does not decide which changes matter or what to do about them.

### Required vocabulary

| Term | Meaning |
| --- | --- |
| signal | A structured report of a completed state change |
| emit | Neotoma produces an outbound signal after a write |
| deliver | Best-effort transport of a signal to a registered endpoint |
| subscribe | A consumer registers interest in receiving signals |
| subscription | The stored record of a consumer's registered interest |
| react | What a consumer does with a received signal |
| best-effort | Delivery is attempted but not guaranteed |
| fire-and-forget | The sender does not wait on an acknowledgement |

Neotoma does not react to its own signals; consumers do. A subscription is a first-class entity (see `docs/foundation/data_models.md`).

### Forbidden vocabulary for Neotoma's own behaviour

In foundation and architecture docs, do not use these verbs for what Neotoma does; they imply decision-making that belongs to the consuming layer:

- **decides** or **prioritizes**: implies Neotoma ranks or selects signals
- **triggers**: implies a causal chain that Neotoma starts
- **alerts** or **notifies**: implies a user-facing surface and a judgment of importance
- **pushes**: implies an opinionated delivery model

If a document needs one of these behaviours, attribute it to the consumer ("the daemon decides", "the agent prioritizes"). Positioning surfaces (`product_positioning.md`, blog content, the README) may use richer language, but foundation and architecture docs use the required vocabulary.

### Validation

This search over foundation, architecture, and the README should return no matches:

```bash
rg -n "Neotoma (decides|prioritizes|triggers|alerts|notifies|pushes)" \
   docs/foundation docs/architecture README.md
```

If one appears, reword it to attribute the behaviour to a consumer, or move the claim to a positioning surface.

## Public site pages (MDX)

Routes on the site that are sourced from `docs/site/pages/<locale>/**/*.mdx` (with `.meta.json`, the registry, and `ROUTE_METADATA`) follow a separate allowlist and React patterns. Do not treat arbitrary `docs/**/*.md` files as site sources. Wiring, SEO, validation commands, and agent rules are in [`docs/developer/site_mdx_documentation.md`](../developer/site_mdx_documentation.md).

## Agent Instructions

### When to Load This Document

Load this document when creating or editing documentation.

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md`
- `docs/conventions/writing_style_guide.md`
- `docs/vocabulary/canonical_terms.md`

### Constraints Agents Must Enforce

1. The header is an H1, a summary sentence, and an applicability line, in that order.
2. Headings stay within h1 to h3.
3. Every code fence names a language, and no Mermaid, alerts, raw HTML, task lists, or status emoji appear.
4. Every relative link and anchor resolves.
5. Every behavioural statement is verified against the code at the named release, or removed.
6. No personal data or secrets are included.

### Forbidden Patterns

- Em dashes or en dashes, except inside verbatim CLI output in a `text` fence
- Conversational transitions
- Soft questions
- Motivational language
- Retired category nouns and the omitted claims listed under [Claim rules](#claim-rules)

### Validation Checklist

- Header has the H1, summary sentence, and applicability line
- Headings are h1 to h3 and unique
- Fences are labelled; no disallowed syntax
- Links and anchors resolve
- Claims verified against the named release
- No personal data or secrets
- Writing style rules applied
