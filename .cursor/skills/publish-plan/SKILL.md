---
name: publish-plan
description: Convert a plan file into a GitHub Discussion post for public input.
triggers:
  - publish plan
  - share plan
  - publish-plan
  - /publish-plan
---

# publish-plan

Convert a plan file (release plan, feature spec, or `.cursor/plans/` file) into a
GitHub Discussion post written for external readers. Strips internal references and
PII, rewrites for a public audience, and optionally posts via the GitHub CLI.

## When to Use

Use when you have a plan in progress and want external input before execution.
Pass the path to any plan document as the argument:

```
/publish-plan docs/releases/in_progress/v0.12.0/release_plan.md
/publish-plan .cursor/plans/some_plan.md
/publish-plan docs/feature_units/in_progress/FU-2026-01-001/FU-2026-01-001_spec.md
```

Optionally pass a specific question to ask readers as a second argument:

```
/publish-plan docs/releases/in_progress/v0.12.0/release_plan.md "Does this sync model work for your use case?"
```

---

## Step 1: Read and Parse the Plan

1. Read the plan file at the provided path.
2. Extract the following from the document:
   - **Goal / motivation**: Why does this exist? What problem does it solve?
   - **Approach / key decisions**: What choices were made or are still open?
   - **Scope boundaries**: What is explicitly excluded or deferred?
   - **Open questions**: What is uncertain or unresolved?

---

## Step 2: Strip Internal References

Remove or redact anything that should not be public:

- Full names and email addresses of individuals
- Internal Slack channels, ticket numbers, or system identifiers that leak org structure
- Pricing, cost, or revenue figures
- Internal hostnames, credentials, or environment-specific configuration values
- Agent execution notes (batch status, orchestrator output, FU dependency trees)
- Anything marked `<!-- internal -->` or `[INTERNAL]`

Do not strip:
- Feature IDs (FU-YYYY-MM-NNN) — these are useful public references
- Architecture decisions and technical rationale
- Version numbers and release IDs
- Links to public repo files or issues

---

## Step 3: Draft the Discussion Post

Rewrite the extracted content into the following structure. Write in plain prose
for an external developer audience. No jargon specific to the foundation framework.

```markdown
## What we're building

[2-3 sentences: the problem being solved and the general approach. No implementation detail.]

## Key decisions

[3-5 bullet points: choices made or still open. Frame as "We chose X because Y" or "We're deciding between X and Y".]

## What's out of scope (for now)

[2-4 bullet points: explicit exclusions that might surprise readers or that they might assume are included.]

## Where we want input

[The specific question. One sentence. Concrete. If the user provided a question, use it here. Otherwise, derive the most useful open question from the plan.]

---

*This is a pre-execution plan. We're sharing it before we build to get early input.
Comments and questions welcome.*
```

Apply the content style rules:
- Complete sentences throughout
- No em dashes, no "leverage", no "seamless", no marketing language
- Active voice
- 15-20 words per sentence maximum
- No filler transitions ("Furthermore", "Moreover", "In addition")

---

## Step 4: Preview and Confirm

Show the drafted post to the user and ask:

```
Here is the Discussion post draft:

---
[post content]
---

Options:
1. Post to GitHub Discussions now (requires gh CLI and Discussions enabled)
2. Copy to clipboard / show as output only
3. Edit — describe what to change
```

Wait for the user's choice before proceeding.

---

## Step 5: Post to GitHub Discussions (if requested)

If the user chooses to post, use the GitHub CLI GraphQL API:

```bash
# Get the repository ID and Discussions category ID
REPO_OWNER=$(gh repo view --json owner -q '.owner.login')
REPO_NAME=$(gh repo view --json name -q '.name')

# List available discussion categories
gh api graphql -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      discussionCategories(first: 10) {
        nodes { id name }
      }
    }
  }
' -f owner="$REPO_OWNER" -f name="$REPO_NAME"
```

Use category "RFC / Plans" if it exists. If it does not exist, use the closest
match ("Ideas", "General") and note to the user that a dedicated category would
be better. Do not create the category automatically.

Post the discussion:

```bash
REPO_ID=$(gh api graphql -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) { id }
  }
' -f owner="$REPO_OWNER" -f name="$REPO_NAME" -q '.data.repository.id')

CATEGORY_ID="<selected category id>"
TITLE="<derived from plan title or release version>"
BODY="<the drafted post content>"

gh api graphql -f query='
  mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
    createDiscussion(input: {
      repositoryId: $repoId,
      categoryId: $categoryId,
      title: $title,
      body: $body
    }) {
      discussion { url }
    }
  }
' -f repoId="$REPO_ID" -f categoryId="$CATEGORY_ID" \
  -f title="$TITLE" -f body="$BODY"
```

Report the Discussion URL on success.

---

## Step 6: Follow-up Reminder

After posting (or outputting the draft), remind the user:

```
Remember to reply in the thread once a decision is made. A single note —
"We went with X because Y" — closes the loop for anyone who finds the
thread later.
```

---

## Error Handling

**gh CLI not installed or not authenticated:**
Output the draft post only. Include a note: "Install and authenticate the GitHub
CLI (`gh auth login`) to post directly from this skill."

**Discussions not enabled on the repository:**
Output the draft post only. Include a note: "Enable Discussions in the
repository Settings to use the post step."

**Plan file not found:**
Exit with: "Plan file not found: {path}. Pass the path to an existing plan document."

---

## Configuration

No configuration required. The skill reads `foundation-config.yaml` for the
repository name and remote when deriving post metadata, but falls back to `gh repo view`.
