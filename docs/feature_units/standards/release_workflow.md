# Release Workflow

_(Orchestrating Multiple Feature Units into Cohesive Releases)_

---

## Purpose

Defines the **Release workflow** — the highest-level unit of work in Neotoma development. A Release is a collection of Feature Units that ship together with integrated testing, acceptance criteria, and deployment orchestration.

This workflow enables autonomous, checkpoint-driven execution of multi-FU releases (like MVP, v1.1, v2.0) with automatic dependency resolution, parallelization planning, and cross-FU integration testing.

---

## Hierarchy

```
Release (e.g., MVP, v1.1)
  ├── Feature Units (e.g., FU-100, FU-101, FU-102...)
  │     ├── Spec + Manifest
  │     ├── Prototype (if UI)
  │     ├── Implementation
  │     └── Tests (unit, integration, E2E)
  ├── Cross-FU Integration Tests
  ├── Release-Level Acceptance Criteria
  └── Deployment Plan
```

**MVP is the first Release; subsequent releases follow the same pattern.**

---

## Overview

The Release workflow has **4 interactive checkpoints** where human input is required:

1. **Checkpoint 0: Release Planning** — Define scope, FUs, priorities, dependencies, acceptance criteria, discovery plan
2. **Checkpoint 0.5: Pre-Release Discovery** — Validate assumptions before building (value, usability, business viability)
3. **Checkpoint 1: Mid-Release Review** — After critical-path FUs complete, validate cross-FU integration
4. **Checkpoint 2: Pre-Release Sign-Off** — All FUs complete, integration tests pass, ready to deploy

All other steps are autonomous, including:

- FU dependency analysis
- Execution schedule generation (sequential + parallel batches)
- FU creation and execution in dependency order
- Cross-FU integration testing
- Continuous discovery during development (weekly interviews, prototype testing)
- Status tracking and reporting

**Discovery Integration:**

- **Pre-Release Discovery (Step 0.5)**: Validate assumptions before building (following Cagan's discovery principles)
- **Continuous Discovery (Step 1)**: Weekly user interviews and prototype testing during development
- **Post-Release Validation (Step 6)**: Validate outcomes after deployment (see Release Validation Process)

---

## Release Types

Releases are categorized as either **marketed** or **not_marketed**:

- **Not Marketed Release**: Silent deployment to production without marketing activities. No pre-launch or post-launch marketing campaigns, announcements, or user acquisition activities.
- **Marketed Release**: Public-facing releases (MVP, major versions, feature launches) with marketing activities. Requires marketing strategy with user acquisition and reengagement tactics.

**Important:** All releases deploy to production at neotoma.io. The distinction is whether marketing activities accompany the release, not where it deploys.

Marketing activities (pre-launch and post-launch) are **skipped for not_marketed releases**.

---

## Prerequisites

Before creating a Release, verify:

- [ ] Release ID follows format: `vX.Y.Z` (e.g., `v1.0.0` for MVP, `v1.1.0` for next minor release)
- [ ] Release type is defined (marketed or not_marketed)
- [ ] Release scope is defined (what's in, what's out)
- [ ] All included FUs are identified with IDs
- [ ] Release-level acceptance criteria are clear
- [ ] Deployment target: Production (neotoma.io) - all releases deploy to production
- [ ] Marketing strategy defined (if marketed release)

---

## Release Detection

**When a user mentions any of the following patterns, the agent MUST automatically trigger the release creation workflow:**

- "new release"
- "not marketed release"
- "marketed release"
- "create release"
- "release vX.Y.Z"
- "split out [features] into a [type] release"
- "prior release"
- "pre-MVP release"
- "MCP-focused release"
- "v0.X.Y release"

**Agent Actions:**

1. **Immediately check** if user wants to create a release plan:

   - If context suggests a release (mentions "release", version numbers, "split out", "prior", etc.)
   - Ask: "I see you're requesting a new release. Should I create a release plan in `docs/releases/in_progress/{release_id}/` following the release workflow? (yes/no)"

2. **If yes**, immediately:

   - Load `docs/feature_units/standards/release_workflow.md` (this document)
   - Load `.cursor/commands/create_release.md`
   - Follow Step 0 (Checkpoint 0) of the release workflow
   - Create release structure in `docs/releases/in_progress/{release_id}/` with:
     - `release_plan.md` (overview and coordination)
     - `manifest.yaml` (FU metadata, dependencies, schedule - YAML required for automation)
     - `execution_schedule.md`
     - `integration_tests.md`
     - `discovery_plan.md` (if discovery enabled - overview)
     - `discovery_plan.yaml` (if discovery enabled - metadata/summary for automation)
     - `participant_recruitment_log.md` (if discovery enabled)
     - `marketing_plan.md` (if marketed release - overview)
     - `marketing_plan.yaml` (if marketed release - metadata/summary for automation)
     - `status.md`

3. **Do NOT** create standalone specification documents in `docs/specs/` for releases. Releases MUST follow the release workflow and be created in `docs/releases/`.

**Exception:** If user explicitly says "just a spec document" or "specification only", then create a spec document instead.

---

## Workflow Steps

### Step 0: Checkpoint 0 — Release Planning

**Trigger:** User requests creation of Release with `release_id` (e.g., `v1.0.0`)

**Agent Actions:**

1. **Alignment Check (Spec vs Mental Model):**

   Before doing any planning work, the agent MUST:

   - Load and summarize the **canonical specs** relevant to this Release (e.g., `NEOTOMA_MANIFEST.md`, `MVP_OVERVIEW.md`, `GENERAL_REQUIREMENTS.md`, `MVP_FEATURE_UNITS.md` for MVP).
   - Present a concise, structured summary to the user covering:
     - What this Release will and will NOT change (in plain language).
     - Which subsystems and schema types are in scope.
     - The critical constraints that MUST NOT be violated (determinism, schema-first, no LLM extraction in Truth Layer, etc.).
   - Ask the user explicitly:
     - "Does this match your current mental model of this Release? (yes/no)"
     - "What feels off, missing, or over-scoped compared to what you actually want?"
   - Incorporate any corrections immediately and restate the updated understanding.

   **MUST NOT** proceed to plan creation until the user has confirmed that the summary matches their intent (or has explicitly accepted any divergence as temporary).

2. **Check if Release plan exists:**

   - Look for `docs/releases/vX.Y.Z/release_plan.md`
   - Look for `docs/releases/vX.Y.Z/manifest.yaml`

3. **If Release plan exists:**

   - Load existing plan and manifest
   - Validate completeness using checklist
   - If complete → proceed to Step 1
   - If incomplete → prompt user to complete missing sections

4. **If Release plan does NOT exist:**

   - **STOP and prompt user interactively** for required information:

   **Required Questions:**

   - Release name and version (e.g., "MVP", "v1.0.0")
   - Release type (marketed or not_marketed)
   - Release goal (1-2 sentence summary)
   - Target ship date (date or "when ready")
   - Priority (P0 critical / P1 high / P2 normal)
   - Included Feature Units (list of `feature_id`s)
   - Excluded scope (what's explicitly NOT in this release)
   - Release-level acceptance criteria (product + technical + business)
   - Cross-FU integration test requirements
   - Deployment target: Production (neotoma.io) - all releases deploy to production
   - Deployment strategy (staging first for validation, then production)
   - Rollback plan (how to revert if issues found)
   - Post-release monitoring plan (metrics, alerts)
   - Discovery plan (hypotheses to test, discovery activities — see Discovery Process)
   - Marketing strategy (if marketed release: user acquisition and reengagement tactics)

   **Agent Actions After User Input:**

   - Generate complete Release plan following template
   - Create manifest YAML with all FU dependencies
   - Validate all required sections present
   - Save to `docs/releases/vX.Y.Z/release_plan.md` and `manifest.yaml`

5. **Dependency Analysis (CRITICAL):**

   - Extract all FU IDs from manifest
   - For each FU, load its manifest and extract `dependencies.requires`
   - Build dependency graph (FU → [dependencies])
   - Detect cycles (if found, **REJECT** with error)
   - Validate all dependencies are satisfied:
     - If any required FU is ⏳ Not Started and not in this Release → **REJECT**
     - If any required FU is 🔨 Partial → **WARN** but allow with user confirmation
   - Generate **topological sort** of FUs (respects dependencies)

6. **Execution Schedule Generation:**

   - Group FUs into **batches**:
     - Batch 0: FUs with no dependencies
     - Batch 1: FUs that depend only on Batch 0
     - Batch 2: FUs that depend only on Batch 0 or 1
     - ... and so on
   - Within each batch, FUs can execute **in parallel**
   - Output execution schedule to `docs/releases/vX.Y.Z/execution_schedule.md`

7. **Create Release file structure:**

   ```
   docs/releases/vX.Y.Z/
     ├── release_plan.md           # Release goals, scope, acceptance criteria (overview)
     ├── manifest.yaml              # FU list, dependencies, schedule, WIP limits (YAML required)
     ├── execution_schedule.md      # Generated execution plan with batches
     ├── integration_tests.md       # Cross-FU integration test specs (machine-checkable)
     ├── acceptance_criteria.md     # Release-level acceptance criteria
     ├── pre_mortem.md             # Failure mode analysis
     ├── deployment_strategy.md    # Deployment and rollback procedures
     ├── monitoring_plan.md        # Post-release monitoring and observability
     ├── discovery_plan.md         # Discovery overview (if discovery enabled)
     ├── discovery_plan.yaml       # Discovery metadata/summary (if discovery enabled)
     ├── participant_recruitment_log.md # Participant outreach and tracking (if discovery enabled)
     ├── marketing_plan.md         # Marketing overview (if marketed release)
     ├── marketing_plan.yaml       # Marketing metadata/summary (if marketed release)
     └── status.md                 # Live status tracking + decision log
   ```

   **Document Decomposition Principles:**

   - **Overview documents** (`*_plan.md`): Provide high-level coordination and references to detailed documents
   - **Detailed documents** (`*_*_plan.md`): Topic-specific detailed plans (e.g., `value_discovery_plan.md`, `pre_launch_marketing_plan.md`)
   - **YAML files** (`*.yaml`): Machine-readable metadata and summaries for workflow automation (hypotheses, success criteria, timelines)
   - **Use Markdown** for all human-readable detailed documentation
   - **Use YAML** only when required for workflow automation or when structured data format is essential
   - **Decompose by topic** to eliminate redundancy and improve maintainability

8. **Pre-Mortem Analysis (Failure Mode Identification):**

   Before finalizing the plan, the agent MUST:

   - Identify the **top 3-5 most likely failure modes** for this Release (e.g., "RLS migration breaks existing tenants", "graph integrity regressions", "MVP date slips by 2 weeks", "critical FU takes 2x longer than estimated").
   - For each failure mode, specify:
     - **Early warning signals** (metrics, test failures, timeline slips)
     - **Mitigating FUs or actions** (which FUs reduce this risk, what can be done proactively)
     - **Rollback plan** (how to detect and revert if this failure occurs)
   - Present this pre-mortem to the user and ask:
     - "Do these failure modes match your concerns? (yes/no)"
     - "What other failure modes should we plan for?"
   - Incorporate user feedback and update the Release plan with a "Pre-Mortem" section.

9. **WIP and Parallelization Limits:**

   - Encode limits in `manifest.yaml`:
     - `max_parallel_fus: <number>` (default: 3, adjust based on team size)
     - `max_high_risk_in_parallel: <number>` (default: 1, only one high-risk FU at a time)
   - Agent MUST enforce these limits during execution:
     - If a batch would exceed `max_parallel_fus`, split into sub-batches
     - If multiple high-risk FUs are ready, queue them sequentially
   - Present limits to user for approval: "Proposed limits: max_parallel_fus=3, max_high_risk_in_parallel=1. Approve? (yes/modify)"

10. **Machine-Checkable Exit Criteria:**

    - For each Release acceptance criterion, the agent MUST:
      - Define a **concrete test suite or script** that validates it
      - Specify a **single metric or query** that proves it (e.g., "0 orphans" → `SELECT COUNT(*) FROM events WHERE record_id NOT IN (SELECT id FROM records)` must return 0)
      - Add these to `integration_tests.md` with explicit pass/fail conditions
    - Present to user: "Each acceptance criterion now has a machine-checkable test. Review? (yes/modify)"

11. **Present execution schedule to user for approval:**

    - Display batches and parallel execution opportunities
    - Show estimated timeline based on FU complexity estimates
    - Show WIP limits and pre-mortem failure modes
    - **STOP and prompt user:** "Approve execution schedule? (yes/no/modify)"

12. **Discovery Planning:**

    - Define discovery plan based on Release scope and risk:
      - Identify assumptions and hypotheses (value, usability, business viability, feasibility)
      - Define discovery activities (ICP interviews, prototype testing, pricing validation)
      - Apply Mom Test methodology (https://www.momtestbook.com) for interview questions:
        - Focus on past behavior and concrete examples, not hypotheticals
        - Look for commitment signals (time, money, reputation risk)
        - Separate problem discovery from solution validation
        - Avoid leading questions and biased feedback
      - Set discovery success criteria
      - Create discovery plan document
    - Present discovery plan to user: "Review discovery plan? (yes/modify/skip)"
    - If "skip": Warn user about risk of building unvalidated assumptions
    - Create discovery plan documents:
      - `docs/releases/vX.Y.Z/discovery_plan.md` (overview and coordination)
      - `docs/releases/vX.Y.Z/discovery_plan.yaml` (metadata and summaries for automation)
      - Topic-specific detailed plans in markdown (e.g., `value_discovery_plan.md`, `usability_discovery_plan.md`)
      - See document decomposition principles in Step 7

13. **Marketing Planning (Marketed Releases Only):**

    - **If Release type is marketed:**
      - **STOP and prompt user interactively** for marketing strategy:
        - Marketing strategy (pre-launch, post-launch, hybrid, none)
        - User acquisition tactics (pre-launch: waitlist, early access; post-launch: launch announcement, paid ads, content, partnerships)
        - Reengagement tactics (pre-launch: feature teasers; post-launch: announcements, winback campaigns, usage nudges)
        - Target user segments for acquisition and reengagement
        - Marketing metrics and success criteria
      - Create marketing plan documents:
        - `docs/releases/vX.Y.Z/marketing_plan.md` (overview and coordination)
        - `docs/releases/vX.Y.Z/marketing_plan.yaml` (metadata and summaries for automation)
        - Topic-specific detailed plans in markdown (e.g., `pre_launch_marketing_plan.md`, `post_launch_marketing_plan.md`)
        - See document decomposition principles in Step 7
      - Present marketing plan to user: "Review marketing plan? (yes/modify)"
    - **If Release type is not_marketed:**
      - Skip marketing planning (no marketing activities for not_marketed releases)
      - Mark marketing as `disabled` in manifest

14. **If approved:**
    - Initialize `status.md` with a "Decision Log" section (empty initially)
    - Mark Release status as `discovery` (if discovery planned) or `in_progress` (if skipped)
    - Proceed to Step 0.5 (if discovery planned) or Step 1 (if skipped)

---

### Step 0.5: Checkpoint 0.5 — Pre-Release Discovery

**Trigger:** Release plan approved with discovery plan, before Step 1

**Timeline:** 1-3 weeks (depending on Release scope and risk)

**Purpose:** Validate assumptions before building (following Cagan's discovery principles)

**Agent Actions:**

1. **Load Discovery Process:**

   - Load `docs/feature_units/standards/discovery_process.md`
   - Review discovery plan from `discovery_plan.md` (overview) and `discovery_plan.yaml` (metadata/summary)
   - Understand hypotheses and success criteria
   - Apply Mom Test methodology (https://www.momtestbook.com) for interviews:
     - Use past behavior questions, not hypotheticals
     - Look for commitment signals (time, money, reputation risk)
     - Separate problem discovery from solution validation

2. **Participant Recruitment (Week 0, before interviews start):**

   **Purpose:** Identify and contact interview participants from target ICP segments

   **Process:**

   a. **Identify Recruitment Channels:**

   - Review ICP profiles and priority tiers (`docs/specs/ICP_PRIORITY_TIERS.md`, `docs/specs/ICP_PROFILES.md`)
   - Map discovery plan participant requirements to acquisition channels:
     - **AI-Native Individual Operators**: Twitter/X, Indie Hackers, Hacker News, AI tool communities (r/ChatGPT, r/ClaudeAI, Discord), GitHub, existing network
     - **High-Context Knowledge Workers**: LinkedIn, productivity communities, professional forums, existing network
     - **Existing Users**: If available, prioritize users who already use Neotoma or similar tools

   b. **Create Recruitment Outreach:**

   - **Twitter/X Outreach Template:**

     ```
     Subject: [No subject for DM]

     Hi [Name],

     I'm building a tool that helps AI-native operators give Claude/ChatGPT access to their personal data. I'd love to learn about how you currently work with AI tools and personal data.

     Would you be open to a 30-45 min chat? I'm not selling anything — just trying to understand the problem better.

     Thanks!
     [Your name]
     ```

   - **LinkedIn Outreach Template:**

     ```
     Subject: Quick chat about AI workflows?

     Hi [Name],

     I saw you're [role/context]. I'm researching how professionals use AI tools (Claude/ChatGPT) with their personal data — contracts, receipts, research docs, etc.

     Would you have 30 minutes for a quick conversation? No sales pitch, just learning about your workflow and pain points.

     Happy to schedule at your convenience.

     Thanks,
     [Your name]
     ```

   - **Indie Hackers / Community Post Template:**

     ```
     Subject: Research: How do you give AI tools access to your personal data?

     I'm building a tool for AI-native workflows and need to understand how people currently handle personal data with AI tools.

     Looking for 5-8 people to chat for 30-45 min about:
     - How you currently use Claude/ChatGPT with personal data
     - Pain points with current workflows
     - What would make this better

     If interested, reply here or DM me. No sales pitch, just research.

     Thanks!
     ```

   - **Email Template (if email available):**

     ```
     Subject: Quick research chat about AI workflows?

     Hi [Name],

     I'm researching how [ICP segment] use AI tools (Claude/ChatGPT) with their personal data. Would you be open to a 30-45 minute conversation?

     What we'll discuss:
     - How you currently use AI with your personal data (contracts, receipts, research, etc.)
     - Pain points and workarounds
     - What would improve your workflow

     No sales pitch — just trying to understand the problem better.

     Would [date/time option 1] or [date/time option 2] work?

     Thanks,
     [Your name]
     ```

   c. **Schedule and Track Recruitment:**

   - **Target Response Rate**: 20-30% (send 3-4x more invites than needed)
   - **Outreach Volume**:
     - Value Discovery: 40-50 outreach messages for 13 participants (8 + 5)
     - Usability Discovery: Invite subset from value discovery (8-10 invites for 8 participants)
     - Business Viability: Invite subset from value discovery (12-15 invites for 8 participants)
   - **Use Scheduling Tool**: Calendly, Cal.com, or similar for easy scheduling
   - **Track in Spreadsheet**:
     - Name, segment, contact method, outreach date, response, scheduled date, interview status, notes
   - **Follow-up Strategy**:
     - If no response after 3 days: Send 1 follow-up message
     - If no response after 7 days: Mark as "no response", move to backup candidate

   d. **Participant Screening (Optional):**

   - **Screening Questions** (if using form):
     - "How often do you use Claude or ChatGPT?" (daily/weekly/monthly)
     - "Have you tried giving AI tools access to your personal data? How?" (copy-paste, upload, other)
     - "What type of work do you do?" (to confirm ICP segment)
   - **Select participants** who match ICP profile and show commitment signals (regular AI usage, actual workarounds)

   e. **Confirm and Remind:**

   - Send calendar invite with:
     - Interview duration (30-45 min)
     - Video call link (Zoom, Google Meet, etc.)
     - Brief reminder of what we'll discuss
   - Send reminder 24 hours before interview
   - Send reminder 1 hour before interview with link

   f. **Handle No-Shows and Cancellations:**

   - **No-show rate**: Expect 20-30% no-shows (schedule 20-30% more than needed)
   - **Backup list**: Maintain list of backup candidates from same recruitment pool
   - **Follow-up**: If someone no-shows, send friendly follow-up offering to reschedule (1 attempt only)

   g. **Document Recruitment Progress:**

   - Track in `docs/releases/vX.Y.Z/participant_recruitment_log.md`:
     - Outreach sent: X messages
     - Responses received: Y responses
     - Scheduled interviews: Z interviews
     - Completed interviews: W interviews
     - No-shows: N no-shows
     - Backup candidates needed: M backups

3. **Value Discovery (Week 1-2):**

   - Conduct ICP interviews on value assumptions using Mom Test questions
   - Focus on past behavior and concrete examples
   - Look for commitment signals (time spent, money spent, workarounds built)
   - Only test value propositions AFTER problem validated
   - Synthesize findings into value discovery report
   - Compare against success criteria

4. **Usability Discovery (Week 1-2, parallel with Value Discovery):**

   - Build clickable prototype of core workflows (if not already built)
   - User test with 5-8 ICP users
   - Validate discoverability, understandability, workflow completion
   - Synthesize findings into usability discovery report
   - Compare against success criteria

5. **Business Viability Discovery (Week 2):**

   - Test pricing assumptions using Mom Test methodology:
     - Ask about past purchasing behavior, not hypothetical willingness to pay
     - Look for commitment signals (budget allocation, switching costs)
     - Only conduct pricing interviews AFTER problem and solution validated
   - Validate business model assumptions
   - Synthesize findings into business viability report
   - Compare against success criteria

6. **Feasibility Validation (Week 1-2, parallel):**

   - Technical proof of concept (if high-risk technical assumptions)
   - Validate architectural constraints
   - Synthesize findings into feasibility validation report

7. **Discovery Synthesis (Week 2-3):**

   - Analyze all discovery findings
   - Compare against success criteria
   - Generate combined discovery report
   - Present findings to user

8. **Go/No-Go Decision:**

   - **STOP and prompt user:**
     - "Pre-release discovery complete. Findings: [summary]"
     - "Value Discovery: [pass/fail]"
     - "Usability Discovery: [pass/fail]"
     - "Business Viability Discovery: [pass/fail]"
     - "Overall Discovery Status: ✅ VALIDATED / ⚠️ PARTIAL / ❌ FAILED"
     - "Decision: [Go (proceed to build) / Pivot (adjust scope) / No-Go (cancel or defer)]"

9. **If Go (Proceed to Build):**

   - Update Release plan based on discovery learnings (adjust scope, refine FUs)
   - Mark Release status as `in_progress`
   - Proceed to Step 1 (Execute FU Batches)

10. **If Pivot (Adjust Scope):**

    - Update Release plan based on discovery findings
    - Re-run discovery on adjusted scope (if needed)
    - Return to discovery synthesis (Step 6)

11. **If No-Go (Cancel or Defer):**
    - Document decision in `status.md`
    - Mark Release status as `deferred` or `cancelled`
    - Halt Release execution

**Note:** For detailed discovery process, interview templates (including Mom Test methodology), and report formats, see `docs/feature_units/standards/discovery_process.md`.

---

### Step 1: Execute FU Batches

**Trigger:** Discovery complete and validated (if discovery was conducted), or execution schedule approved (if discovery skipped)

**Execution Strategy:**

The release workflow supports two execution strategies:

1. **Sequential Execution** (default): Single agent executes FUs sequentially within batches
2. **Multi-Agent Execution** (recommended for parallelizable batches): Orchestrator agent spawns worker agents via Cursor Background Agents API

**To use multi-agent execution**, set `execution_strategy.type: "multi_agent"` in `manifest.yaml`. See `docs/feature_units/standards/multi_agent_orchestration.md` for complete specification.

**Agent Actions:**

1. **Continuous Discovery Setup (if discovery was conducted):**

   - Schedule weekly user interviews during development
   - Plan prototype testing after each major UI FU
   - Set up feedback collection mechanism

2. **Determine Execution Strategy:**

   - Check `manifest.yaml` for `execution_strategy.type`
   - If `"multi_agent"`: Follow `multi_agent_orchestration.md` workflow
   - If `"sequential"` or not specified: Follow sequential workflow below

3. **For each batch in execution schedule (in order):**

**Sequential Execution Workflow:**

a. **Start all FUs in batch (in parallel if multiple):**

- For each FU in batch:
  - Check if FU spec exists; if not, run `Create New Feature Unit` workflow (Checkpoint 0)
  - If UI FU and prototype doesn't exist, run `Create Prototype` workflow
  - If UI FU and prototype not approved, run Checkpoint 1 (Prototype Review)
  - Run `Run Feature Workflow` to implement FU
  - Run `Final Review` (Checkpoint 2) for FU approval
- If multiple FUs in batch, suggest running in parallel (separate agent sessions or worktrees)

b. **Wait for all FUs in batch to complete**

c. **Run cross-FU integration tests for this batch:**

- Execute integration test suite from `integration_tests.md`
- If tests fail:
  - **STOP** and report failures to user
  - User decides: fix and retry, skip FU, or abort Release
- If tests pass, proceed to next batch

d. **Continuous Discovery (during batch execution):**

- If batch includes UI FUs: Conduct prototype testing with 2-3 users
- Weekly user interviews: Gather feedback on completed features (2-3 users per week)
- Rapid iteration: Make quick adjustments based on user feedback
- Document findings in `continuous_discovery_log.md`

e. **Update Release status:**

- Mark batch as `completed` in `status.md`
- **Check and update checkpoints** (see `.cursor/rules/checkpoint_management.md`):
  - Check `manifest.yaml` for `checkpoint_{id}_after_batch` triggers
  - If current batch ID matches a checkpoint trigger → mark checkpoint as `completed` in `status.md`
  - Add completion notes: batch ID, completed FUs, validation summary
- Update overall Release progress percentage
- If any decisions were made during batch execution (scope changes, FU deferrals, etc.), append to Decision Log in `status.md` with timestamp
- Document continuous discovery findings

**Multi-Agent Execution Workflow:**

See `docs/feature_units/standards/multi_agent_orchestration.md` for complete workflow. Key steps:

a. **Check execution limits** (`max_parallel_fus`, `max_high_risk_in_parallel`)
b. **Spawn worker agents** for all FUs in batch (via Cloud Agents API)
c. **Monitor worker agents** (poll status file, handle failures)
d. **Wait for all FUs in batch to complete** (all workers report completion)
e. **Run cross-FU integration tests** (orchestrator executes)
f. **Update Release status** (mark batch complete, update progress)
g. **Cleanup worker agents** (terminate completed agents)

4. **After all batches complete:**
   - Mark all FUs as `completed`
   - **ALWAYS define test commands for all integration tests** (REQUIRED)
     - For each test in `integration_tests.md`, add `test:` field pointing to test file path
     - Test files should be created in `tests/integration/release/{RELEASE_ID}/` directory
     - Test commands must be defined before release can be marked `ready_for_deployment`
   - **ALWAYS run full integration test suite** (REQUIRED - orchestrator does this automatically)
     - Orchestrator calls `runFullIntegrationTestSuite(releaseId)` after all batches complete
     - Tests may show as `not_run` if test commands aren't defined yet (blocks `ready_for_deployment`)
     - Failed tests block release from `ready_for_deployment` status
   - **Ensure Checkpoint 2 (Pre-Release Sign-Off) is marked as `completed`** in `status.md`:
     - If still `pending`, update to `completed`
     - Add completion notes: total batches completed, release status, P0 FU completion
   - **Generate release report with Section 9 (Testing Guidance)** containing all manual test cases from `integration_tests.md` (see `.cursor/rules/post_build_testing.md`)
   - **Present test cases to user:** "Release build complete. See release_report.md Section 9 (Testing Guidance) for manual test cases to validate functionality."
   - Synthesize continuous discovery findings
   - Update Release plan based on continuous discovery learnings
   - Proceed to Step 2

---

### Step 2: Checkpoint 1 — Mid-Release Review (Optional)

**Trigger:** Critical-path FUs complete (e.g., 50% of batches done)

**Agent Actions:**

1. **Check if mid-release checkpoint is configured:**

   - Look for `checkpoint_1_after_batch` in manifest
   - If not configured, skip this checkpoint

2. **If configured:**

   - **STOP and prompt user:**
     - "Mid-release checkpoint reached. X/Y FUs complete."
     - "Integration tests: [pass/fail summary]"
     - "Continue to remaining FUs? (yes/no/pause)"
   - If "no" or "pause": halt execution, allow user to review and resume later
   - If "yes": continue to remaining batches

---

### Step 3: Cross-Release Integration Testing

**Trigger:** All FU batches complete

**Agent Actions:**

1. **Run full cross-FU integration test suite (AUTOMATIC - REQUIRED):**

   - **The release orchestrator ALWAYS automatically runs all integration tests** from `integration_tests.md` after all batches complete
   - This is a **REQUIRED** step in the release build process - cannot be skipped
   - Execute all tests listed in `integration_tests.md` (IT-001 through IT-XXX)
   - Update `status.md` integration test status table with results (passed/failed/not_run)
   - Run end-to-end user flows that span multiple FUs
   - Verify no regressions in existing functionality
   - Tests showing `not_run` (no commands defined) are acceptable for initial releases but should be implemented

2. **If orchestrator is not used (manual execution):**

   - Manually run all tests from `integration_tests.md`
   - Update `status.md` integration test status table with results
   - Follow test execution instructions in `integration_tests.md`

3. **Run Release-level acceptance criteria checks:**

   - Product acceptance: Core workflows functional, empty/error states handled
   - Technical acceptance: Performance benchmarks, test coverage, graph integrity
   - Business acceptance: Metrics instrumented, analytics ready

4. **Generate integration test report:**

   - Save to `docs/releases/vX.Y.Z/integration_test_report.md`
   - Include pass/fail summary, performance metrics, issues found

5. **If tests fail:**

   - **STOP** and report failures to user
   - User decides: fix issues and re-test, or abort Release
   - Release status remains `in_progress` until tests pass

6. **If all tests pass:**
   - Update release status to `ready_for_deployment` (if not already)
   - Proceed to Step 4

---

### Step 4: Checkpoint 2 — Pre-Release Sign-Off

**Trigger:** All FUs complete, integration tests pass

**Agent Actions:**

1. **Present Release summary:**

   - FUs completed: X/Y
   - Integration tests: [pass/fail summary]
   - Acceptance criteria: [checklist with status]
   - Release plan link
   - Integration test report link
   - **Manual test cases:** "See release_report.md Section 9 (Testing Guidance) for all manual test cases to validate functionality before deployment"

2. **Generate release report with Section 9 (Testing Guidance):**

   - Extract all test cases from `integration_tests.md`
   - Format as user-facing manual test instructions
   - Include step-by-step actions and expected results
   - Mark all manual test cases as **REQUIRED BEFORE DEPLOYMENT**
   - See `.cursor/rules/post_build_testing.md` for requirements

3. **REQUIRE Manual Test Execution (BLOCKER):**

   - **STOP and prompt user:**
     - "Release vX.Y.Z ready for deployment."
     - "All FUs complete: [list]"
     - "Integration tests passed: [summary]"
     - "Acceptance criteria met: [checklist]"
     - **"MANUAL TEST EXECUTION REQUIRED: All manual test cases in release_report.md Section 9 (Testing Guidance) MUST be executed and validated before deployment."**
     - "Have you executed all manual test cases? (yes/no)"
     - "If yes, provide test results summary: [pass/fail for each test case]"
     - "If no, execute all test cases now and document results before proceeding."

4. **Validate Manual Test Results:**

   - **If user says "no" or test results incomplete:**

     - **BLOCK deployment** - do not proceed to Step 5
     - Provide clear instructions: "Execute all manual test cases from release_report.md Section 9 (Testing Guidance) and document results before deployment approval."
     - Wait for user to complete manual test execution
     - Return to Step 3 validation

   - **If user says "yes" and provides test results:**
     - Verify all test cases have documented results (Pass/Fail)
     - **If any test case failed:**
       - **BLOCK deployment** - do not proceed to Step 5
       - Prompt: "Test case [ID] failed. Fix issues and re-execute test cases before deployment approval."
       - Wait for user to fix issues and re-execute tests
       - Return to Step 3 validation
     - **If all test cases passed:**
       - Document test results in `status.md` or `manual_test_results.md`
       - Proceed to Step 5 (deployment approval)

5. **Final Deployment Approval:**

   - **STOP and prompt user:**
     - "All manual test cases executed and passed."
     - "Test results documented: [summary]"
     - "Approve for deployment? (yes/no)"
     - "Any final changes needed? (list or 'none')"

6. **If user requests changes:**

   - Make changes
   - Re-run affected tests (both automated and manual)
   - Repeat Checkpoint 2 until approved

7. **If approved:**
   - Mark Release status as `ready_for_deployment`
   - Document manual test execution completion in `status.md`

- **If marketed release:** Proceed to Step 4.5 (Pre-Release Marketing)
- **If not_marketed release:** Proceed to Step 5 (Deployment)

---

### Step 4.5: Pre-Release Marketing Execution (Marketed Releases Only)

**Trigger:** Release approved for deployment, Release type is marketed, pre-launch marketing enabled

**Timeline:** 2-4 weeks before deployment (depending on strategy)

**Agent Actions:**

1. **Load Marketing Plan:**

   - Load `docs/releases/vX.Y.Z/marketing_plan.yaml` (metadata/summary) and `marketing_plan.md` (overview)
   - Review user acquisition and reengagement tactics
   - Understand target segments and success criteria

2. **Execute Pre-Launch User Acquisition:**

   - Launch waitlist building campaigns (if enabled)
     - Create waitlist landing page
     - Promote via Twitter, email, community, content
     - Track signups by source/channel
   - Open early access beta signups (if enabled)
     - Invite discovery participants + top waitlist users
     - Onboard beta testers
     - Collect feedback and create advocates
   - Publish content teasers (if enabled)
     - Blog posts, demo videos, Twitter threads
     - Track views, shares, conversions to waitlist
   - Track acquisition metrics:
     - Waitlist signups (by channel)
     - Early access participants
     - Content engagement (views, shares, conversions)
     - Cost per waitlist signup

3. **Execute Pre-Launch Reengagement:**

   - Send feature teaser emails to existing users (if enabled)
     - Target: dormant users, low-activity users
     - Content: Upcoming features, benefits
     - Track: email open rate, click-through rate
   - Show in-app notifications (if enabled)
     - Notify existing users about upcoming release
     - Track: notification views, clicks
   - Track reengagement metrics:
     - Email open rate
     - Click-through rate
     - Pre-launch return rate (users who return before launch)

4. **Generate Pre-Launch Marketing Report:**

   - Save to `docs/releases/vX.Y.Z/pre_launch_marketing_report.md`
   - Include:
     - Acquisition baseline metrics (waitlist signups, beta participants, content engagement)
     - Reengagement baseline metrics (email opens, clicks, return rate)
     - Channel performance breakdown
     - Cost analysis
     - Quality indicators (waitlist quality, beta activation rate)

5. **Present to User:**

   - "Pre-launch marketing complete. Baseline metrics: [summary]"
   - "Waitlist: X signups, Beta: Y participants, Reengagement: Z% return rate"
   - "Ready to proceed with deployment? (yes/no)"

6. **If approved:**
   - Proceed to Step 5 (Deployment)

**Note:** This step is skipped for not_marketed releases.

---

### Step 5: Deployment

**Trigger:** Release approved for deployment (manual tests executed and passed)

**Agent Actions:**

1. **Verify Manual Test Execution (PRE-DEPLOYMENT CHECK):**

   - **REQUIRED:** Check that all manual test cases from `release_report.md` Section 9 (Testing Guidance) have been executed and documented
   - **REQUIRED:** Verify all manual test cases passed (no failures)
   - **If manual tests not executed or any failed:**
     - **BLOCK deployment** - return to Step 4 (Checkpoint 2)
     - Error: "Cannot deploy: Manual test cases must be executed and all must pass before deployment."

2. **Execute deployment plan:**

   - **All releases deploy to production at neotoma.io**
   - Follow deployment strategy from Release plan (staging first for validation, then production)
   - Run deployment scripts or guide user through manual steps
   - Verify deployment success (health checks, smoke tests)

3. **Update Release status:**

   - Mark Release as `deployed`
   - Record deployment timestamp

4. **Setup post-release monitoring:**

   - Verify metrics and alerts are active
   - Start monitoring key metrics from Release acceptance criteria

5. **If marketed release:**
   - Proceed to Step 6 (Post-Release Marketing & Validation)
   - **If not_marketed release:**
     - Move Release files from `in_progress/` to `completed/`:
       ```bash
       mv docs/releases/in_progress/vX.Y.Z docs/releases/completed/vX.Y.Z
       ```
     - Update Release status to `completed`

---

### Step 6: Post-Release Marketing, Acquisition & Reengagement (Marketed Releases Only)

**Trigger:** Release deployed to production, Release type is marketed

**Timeline:** Week 1-4 post-deployment

**Agent Actions:**

1. **Load Marketing Plan:**

   - Load `docs/releases/vX.Y.Z/marketing_plan.yaml` (metadata/summary) and `marketing_plan.md` (overview)
   - Review post-launch tactics and success criteria

2. **Execute Post-Launch User Acquisition:**

   a. **Launch Announcement (Day 0):**

   - Product Hunt launch (if applicable)
   - Social media announcement (Twitter, LinkedIn)
   - Email to waitlist (convert waitlist to signups)
   - Blog post announcement
   - Hacker News submission (if applicable)
   - Track: Day 1 signups, press mentions, social shares

   b. **Paid Acquisition (Week 1-4, if enabled):**

   - Launch paid campaigns (Twitter ads, Google ads, LinkedIn ads)
   - Target ICP segments from marketing plan
   - Track: Cost per signup, signup to activation rate, cost per activated user

   c. **Content Marketing (Week 1-4, if enabled):**

   - Publish tutorials, case studies, comparisons
   - SEO optimization
   - Track: Organic signups, content to signup conversion rate

   d. **Partnership Outreach (Week 1-4, if enabled):**

   - Submit to AI tool directories
   - Outreach to productivity communities
   - Indie hacker communities
   - Track: Referral signups, backlinks acquired

3. **Execute Post-Launch Reengagement:**

   a. **Feature Announcement (Day 0):**

   - Send announcement email to all existing users
   - Show in-app notification
   - Publish changelog
   - Track: Email open rate, feature trial rate, reactivation rate

   b. **Dormant User Winback (Week 1-2, if enabled):**

   - Identify inactive users (30-day, 90-day segments)
   - Send personalized winback emails
   - Content: New features, usage tips, success stories
   - Track: Winback email open rate, return rate, reactivation rate

   c. **Usage Nudges (Week 1-4, if enabled):**

   - Trigger: No upload 7 days, no search 14 days, no AI query 30 days
   - Format: In-app prompts + email
   - Track: Nudge response rate, nudge to action rate

   d. **Success Story Sharing (Week 2-4, if enabled):**

   - Share user case studies, usage tips, workflow examples
   - Channels: Email, blog, community
   - Track: Story engagement rate, feature adoption from story

4. **Track Post-Launch Metrics:**

   **Acquisition Metrics:**

   - Day 1 signups (total, by channel: waitlist, organic, paid, referral)
   - Week 1 signups (total, by channel)
   - Waitlist conversion rate (waitlist signups → Day 1 signups)
   - Cost per signup (by channel)
   - Signup to activation rate (by channel)
   - Organic vs paid signup breakdown

   **Reengagement Metrics:**

   - Announcement email open rate
   - Feature trial rate (existing users who try new features)
   - Dormant user reactivation rate (30-day, 90-day segments)
   - Winback email response rate
   - Usage nudge response rate
   - Reengaged user retention rate

5. **Marketing Efficacy Analysis:**

   **Acquisition Comparison:**

   - Waitlist conversion: (Day 1 signups from waitlist) / Waitlist signups
   - Cost efficiency: Pre-launch CPA vs Post-launch CPA
   - Quality comparison: Waitlist activation rate vs Paid activation rate
   - Channel performance: Organic vs Paid vs Referral
   - Time to value: Waitlist signup → first use vs Paid signup → first use

   **Reengagement Comparison:**

   - Pre-launch teaser effectiveness: Teasers sent → Pre-launch returns
   - Post-launch announcement effectiveness: Announcements sent → Feature trials
   - Winback efficiency: Winback cost vs New acquisition cost
   - Retention impact: Reengaged user retention vs New user retention
   - Feature adoption: Feature trial rate from reengagement vs from new users

6. **Generate Marketing Efficacy Report:**

   - Save to `docs/releases/vX.Y.Z/marketing_efficacy_report.md`
   - Include:
     - Pre-launch metrics summary (acquisition + reengagement)
     - Post-launch metrics summary (acquisition + reengagement)
     - Channel performance breakdown
     - Cost analysis (pre vs post, acquisition vs reengagement)
     - Quality indicators (activation rates, retention rates)
     - Comparison analysis
     - Recommendations for next release

7. **Post-Release Validation:**

   - Validate outcomes against acceptance criteria
   - Conduct user interviews (new + reengaged users)
   - Analyze user feedback
   - Generate validation report

8. **Present to User:**

   - "Post-launch marketing complete. Week 1 metrics: [summary]"
   - "Acquisition: X signups (Y% from waitlist, Z% organic)"
   - "Reengagement: A% feature trial rate, B% reactivation rate"
   - "Efficacy analysis: [key findings]"
   - "Recommendations: [for next release]"

9. **COMPLETE:**
   - Move Release files from `in_progress/` to `completed/`:
     ```bash
     mv docs/releases/in_progress/vX.Y.Z docs/releases/completed/vX.Y.Z
     ```
   - Update Release status to `completed`

**Note:** This step is skipped for not_marketed releases.

---

## File Locations

### In Progress Releases

```
docs/releases/in_progress/vX.Y.Z/
  ├── release_plan.md           # Release goals, scope (overview and coordination)
  ├── manifest.yaml              # FU list, dependencies, schedule, release type (YAML required)
  ├── execution_schedule.md      # Generated execution plan with batches
  ├── integration_tests.md       # Cross-FU integration test specs
  ├── acceptance_criteria.md     # Release-level acceptance criteria
  ├── pre_mortem.md             # Failure mode analysis
  ├── deployment_strategy.md    # Deployment and rollback procedures
  ├── monitoring_plan.md        # Post-release monitoring and observability
  ├── discovery_plan.md         # Discovery overview (if discovery enabled)
  ├── discovery_plan.yaml       # Discovery metadata/summary (if discovery enabled)
  ├── participant_recruitment_log.md # Participant outreach and tracking
  ├── discovery_report.md       # Combined discovery findings
  ├── continuous_discovery_log.md # Continuous discovery during development
     ├── marketing_plan.md         # Marketing overview (marketed releases only)
     ├── marketing_plan.yaml       # Marketing metadata/summary (marketed releases only)
     ├── pre_launch_marketing_report.md # Pre-launch metrics (marketed releases only)
  └── status.md                 # Live status tracking
```

**Document Decomposition Standards:**

All release planning documents MUST follow these principles:

1. **Decompose by Topic**: Large planning documents should be decomposed into topic-specific documents:

   - Overview/coordination documents (`*_plan.md`) provide high-level summaries and references
   - Detailed topic documents (`*_*_plan.md`) contain comprehensive details for specific topics
   - Example: `discovery_plan.md` (overview) → `value_discovery_plan.md`, `usability_discovery_plan.md`, etc.

2. **Use Markdown for Human-Readable Content**: All detailed documentation should be in Markdown format for better readability, version control, and collaboration.

3. **Use YAML Only When Required**: YAML files should be used ONLY when:

   - Required for workflow automation (e.g., `manifest.yaml` for FU dependency resolution)
   - Structured metadata/summaries needed for programmatic access (e.g., `discovery_plan.yaml`, `marketing_plan.yaml`)
   - Machine-readable format is essential (e.g., success criteria, timelines, participant counts)

4. **Eliminate Redundancy**:

   - YAML files contain metadata, summaries, hypotheses, success criteria, and references to detailed markdown plans
   - Markdown files contain comprehensive detailed content (interview questions, test scenarios, tactics, etc.)
   - Each piece of information should exist in only one place, with cross-references where needed

5. **Cross-Reference Documents**: All documents should include:

   - "Related Documents" section with links to related planning documents
   - "Purpose" section explaining the document's role
   - Clear indication of overview vs detailed documents

6. **File Naming Conventions**:
   - Overview documents: `{topic}_plan.md` (e.g., `discovery_plan.md`, `marketing_plan.md`)
   - Detailed topic documents: `{topic}_{subtopic}_plan.md` (e.g., `value_discovery_plan.md`, `pre_launch_marketing_plan.md`)
   - YAML summaries: `{topic}_plan.yaml` (e.g., `discovery_plan.yaml`, `marketing_plan.yaml`)
   - Logs/tracking: `{topic}_log.md` (e.g., `continuous_discovery_log.md`, `participant_recruitment_log.md`)

### Completed Releases

```
docs/releases/completed/vX.Y.Z/
  ├── release_plan.md
  ├── manifest.yaml
  ├── execution_schedule.md
  ├── integration_tests.md
  ├── integration_test_report.md
  ├── discovery_plan.yaml
  ├── discovery_report.md
  ├── continuous_discovery_log.md
     ├── marketing_plan.yaml        # Marketing strategy (marketed releases only)
     ├── pre_launch_marketing_report.md # Pre-launch metrics (marketed releases only)
     ├── post_launch_acquisition_report.md # Post-launch acquisition metrics (marketed releases only)
     ├── post_launch_reengagement_report.md # Post-launch reengagement metrics (marketed releases only)
     ├── marketing_efficacy_report.md # Pre vs post comparison (marketed releases only)
  └── status.md
```

<｜ tool▁calls▁begin ｜><｜ tool▁call▁begin ｜>
read_file

---

## Release Manifest Format

```yaml
release:
  id: "v1.0.0"
  name: "MVP"
  type: "marketed" # marketed | not_marketed
  status: "in_progress" # in_progress | ready_for_deployment | deployed | completed
  target_date: "2025-03-01"
  priority: "P0"

# WIP and parallelization limits
execution_limits:
  max_parallel_fus: 3 # Maximum FUs executing simultaneously
  max_high_risk_in_parallel: 1 # Maximum high-risk FUs executing simultaneously

feature_units:
  - id: "FU-100"
    priority: "P0"
    dependencies: ["FU-000"]
  - id: "FU-101"
    priority: "P0"
    dependencies: ["FU-100"]
  - id: "FU-102"
    priority: "P0"
    dependencies: ["FU-100"]
  - id: "FU-103"
    priority: "P0"
    dependencies: ["FU-101", "FU-102"]

execution_schedule:
  batches:
    - batch_id: 0
      feature_units: ["FU-100"]
      dependencies: []
    - batch_id: 1
      feature_units: ["FU-101", "FU-102"] # Can run in parallel
      dependencies: ["FU-100"]
    - batch_id: 2
      feature_units: ["FU-103"]
      dependencies: ["FU-101", "FU-102"]

checkpoints:
  checkpoint_1_after_batch: 1 # Optional mid-release review

acceptance_criteria:
  product:
    - criterion: "Core workflows functional (upload → extraction → timeline → AI query)"
      test: "playwright/tests/e2e/core_workflows.spec.ts"
      metric: null
    - criterion: "Empty states handled"
      test: "playwright/tests/e2e/empty_states.spec.ts"
      metric: null
    - criterion: "Error states handled with retry"
      test: "playwright/tests/e2e/error_states.spec.ts"
      metric: null
  technical:
    - criterion: "All P0 FUs deployed"
      test: null
      metric: "SELECT COUNT(*) FROM feature_units WHERE priority='P0' AND status='completed'"
    - criterion: "100% critical path test coverage"
      test: "npm run test:coverage -- --critical-path"
      metric: "coverage.critical_path >= 100"
    - criterion: "Graph integrity verified (0 orphans, 0 cycles)"
      test: "tests/integration/graph_integrity.test.ts"
      metric: "SELECT COUNT(*) FROM events WHERE record_id NOT IN (SELECT id FROM records) = 0"
  business:
    - criterion: "10 DAU (MVP launch)"
      test: null
      metric: "SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE date = CURRENT_DATE >= 10"
    - criterion: "100 total records ingested (first week)"
      test: null
      metric: "SELECT COUNT(*) FROM records WHERE created_at >= NOW() - INTERVAL '7 days' >= 100"

pre_mortem:
  failure_modes:
    - mode: "RLS migration breaks existing tenants"
      early_warning: "Test failures in multi-user isolation tests, migration dry-run errors"
      mitigation: "FU-701 includes comprehensive migration testing, staged rollout"
      rollback: "Revert migration, restore DB snapshot, disable RLS temporarily"
    - mode: "Graph integrity regressions"
      early_warning: "Integration tests fail, orphan node count > 0"
      mitigation: "FU-103 includes property-based tests, batch-level integration tests"
      rollback: "Disable graph builder, revert to single-record inserts"
    - mode: "MVP date slips by 2 weeks"
      early_warning: "FU completion rate < 80% after 50% of batches, critical FUs delayed"
      mitigation: "Mid-release checkpoint (Checkpoint 1), descope P1 FUs if needed"
      rollback: "Move non-critical FUs to v1.1.0, focus on P0 only"

deployment:
  strategy: "staging_first" # staging_first | canary | full_rollout
  rollback_plan: "Revert to previous release tag, restore DB snapshot if needed"

discovery:
  enabled: true # true | false (recommend true for early releases)
  value_discovery:
    hypothesis: "AI-Native Operators will find value in unified document search via MCP"
    method: "ICP interviews"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
    timeline: "Week 1-2"
    success_criteria:
      - "≥70% validate problem exists"
      - "≥60% express interest in solution"
  usability_discovery:
    hypothesis: "Users can complete upload → extraction → timeline workflow without guidance"
    method: "Prototype user testing"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
    timeline: "Week 2"
    success_criteria:
      - "≥80% complete workflow successfully"
  business_viability_discovery:
    hypothesis: "Tier 1 ICPs will pay €250-€1,250/month for Neotoma"
    method: "Willingness-to-pay interviews"
    participants:
      - segment: "AI-Native Individual Operators"
        count: 5
    timeline: "Week 2"
    success_criteria:
      - "≥50% express willingness to pay"

monitoring:
  key_metrics:
    - "Upload success rate (target: >95%)"
    - "P95 upload latency (target: <5s)"
    - "DAU (target: 10)"

marketing:
  enabled: true # true for marketed releases, false for not_marketed
  strategy: "hybrid" # pre_launch | post_launch | hybrid | none

  user_acquisition:
    pre_launch:
      waitlist_signups: 0
      early_access_participants: 0
      cost: 0
    post_launch:
      day_1_signups: 0
      week_1_signups: 0
      cost: 0
      channels:
        organic: 0
        paid: 0
        referral: 0

  reengagement:
    pre_launch:
      teaser_sent: 0
      teaser_open_rate: 0.0
      pre_launch_return_rate: 0.0
    post_launch:
      announcement_sent: 0
      announcement_open_rate: 0.0
      feature_trial_rate: 0.0
      dormant_reactivation_rate: 0.0
      winback_sent: 0
      winback_response_rate: 0.0
```

<｜ tool▁calls▁begin ｜><｜ tool▁call▁begin ｜>
read_file

---

## Marketing Plan Format (Marketed Releases Only)

```yaml
marketing:
  strategy: "hybrid" # pre_launch | post_launch | hybrid | none

  user_acquisition:
    pre_launch:
      enabled: true
      tactics:
        - type: "waitlist_building"
          timeline: "Week -4 to Week 0"
          channels: ["twitter", "email", "community", "content"]
          target_segments:
            ["AI-Native Operators", "High-Context Knowledge Workers"]
          goals: ["waitlist_signups", "awareness"]
          metrics:
            - "waitlist_signups (target: X)"
            - "cost_per_waitlist_signup (target: $Y)"
            - "social_engagement_rate (target: Z%)"

        - type: "early_access_beta"
          timeline: "Week -2 to Week 0"
          participants: "discovery_interview_participants + waitlist_top_50"
          goals: ["beta_feedback", "advocate_creation", "pre_launch_activation"]
          metrics:
            - "beta_participants (target: X)"
            - "beta_activation_rate (target: Y%)"
            - "advocate_conversion_rate (target: Z%)"

        - type: "content_teaser"
          timeline: "Week -2 to Week 0"
          formats: ["blog_post", "demo_video", "twitter_thread"]
          goals: ["awareness", "waitlist_conversion"]
          metrics:
            - "content_views (target: X)"
            - "content_to_waitlist_rate (target: Y%)"

    post_launch:
      enabled: true
      tactics:
        - type: "launch_announcement"
          timeline: "Day 0"
          channels: ["product_hunt", "twitter", "email", "blog", "hacker_news"]
          goals: ["new_signups", "press_coverage", "viral_growth"]
          metrics:
            - "day_1_signups (target: X)"
            - "press_mentions (target: Y)"
            - "social_shares (target: Z)"

        - type: "paid_acquisition"
          timeline: "Week 1-4"
          channels: ["twitter_ads", "google_ads", "linkedin_ads"]
          target_segments: ["AI-Native Operators", "Knowledge Workers"]
          goals: ["signups", "activated_users"]
          metrics:
            - "cost_per_signup (target: $X)"
            - "signup_to_activation_rate (target: Y%)"
            - "cost_per_activated_user (target: $Z)"

        - type: "content_marketing"
          timeline: "Week 1-4"
          formats: ["tutorials", "case_studies", "comparisons"]
          goals: ["organic_signups", "seo_traffic"]
          metrics:
            - "organic_signups (target: X)"
            - "content_to_signup_rate (target: Y%)"

        - type: "partnership_outreach"
          timeline: "Week 1-4"
          targets:
            ["ai_tool_directories", "productivity_communities", "indie_hacker"]
          goals: ["referral_signups", "backlinks"]
          metrics:
            - "referral_signups (target: X)"
            - "backlinks_acquired (target: Y)"

  reengagement:
    pre_launch:
      enabled: true
      tactics:
        - type: "feature_teaser_to_existing"
          timeline: "Week -2 to Week 0"
          target_segments: ["dormant_users", "low_activity_users"]
          channels: ["email", "in_app_notification"]
          goals: ["reengagement", "feature_awareness"]
          metrics:
            - "email_open_rate (target: X%)"
            - "click_through_rate (target: Y%)"
            - "pre_launch_return_rate (target: Z%)"

    post_launch:
      enabled: true
      tactics:
        - type: "feature_announcement"
          timeline: "Day 0"
          target_segments: ["all_existing_users"]
          channels: ["email", "in_app_notification", "changelog"]
          goals: ["feature_adoption", "reactivation"]
          metrics:
            - "announcement_open_rate (target: X%)"
            - "feature_trial_rate (target: Y%)"
            - "reactivation_rate (target: Z%)"

        - type: "dormant_user_winback"
          timeline: "Week 1-2"
          target_segments: ["inactive_30_days", "inactive_90_days"]
          channels: ["email", "personalized_message"]
          messaging: ["new_features", "usage_tips", "success_stories"]
          goals: ["reactivation", "retention"]
          metrics:
            - "winback_email_open_rate (target: X%)"
            - "winback_return_rate (target: Y%)"
            - "winback_activation_rate (target: Z%)"

        - type: "usage_nudges"
          timeline: "Week 1-4"
          triggers:
            ["no_upload_7_days", "no_search_14_days", "no_ai_query_30_days"]
          channels: ["in_app_prompt", "email"]
          goals: ["habit_formation", "feature_discovery"]
          metrics:
            - "nudge_response_rate (target: X%)"
            - "nudge_to_action_rate (target: Y%)"

        - type: "success_story_sharing"
          timeline: "Week 2-4"
          format: ["user_case_studies", "usage_tips", "workflow_examples"]
          channels: ["email", "blog", "community"]
          goals: ["inspiration", "advanced_feature_adoption"]
          metrics:
            - "story_engagement_rate (target: X%)"
            - "feature_adoption_from_story (target: Y%)"

  user_segments:
    acquisition_targets:
      - segment: "AI-Native Individual Operators"
        priority: "P0"
        channels: ["twitter", "indie_hacker", "product_hunt"]
      - segment: "High-Context Knowledge Workers"
        priority: "P1"
        channels: ["linkedin", "content_marketing", "communities"]

    reengagement_targets:
      - segment: "dormant_30_days"
        definition: "No activity in last 30 days"
        priority: "P0"
        tactics: ["winback_email", "feature_announcement"]
      - segment: "dormant_90_days"
        definition: "No activity in last 90 days"
        priority: "P1"
        tactics: ["winback_email", "success_stories"]
      - segment: "low_activity"
        definition: "<2 uploads in last 30 days"
        priority: "P1"
        tactics: ["usage_nudges", "tutorials"]
      - segment: "active_but_unaware"
        definition: "Active but haven't tried new features"
        priority: "P0"
        tactics: ["feature_announcement", "in_app_prompts"]

  efficacy_comparison:
    acquisition_metrics:
      pre_launch:
        - "waitlist_signups"
        - "waitlist_to_signup_conversion_rate"
        - "cost_per_waitlist_signup"
        - "awareness_score"
      post_launch:
        - "day_1_signups"
        - "week_1_signups"
        - "cost_per_signup"
        - "signup_to_activation_rate"
        - "organic_vs_paid_signups"

    reengagement_metrics:
      pre_launch:
        - "teaser_email_open_rate"
        - "pre_launch_return_rate"
      post_launch:
        - "announcement_open_rate"
        - "feature_trial_rate"
        - "dormant_user_reactivation_rate"
        - "winback_success_rate"
        - "usage_nudge_response_rate"

    comparison_framework:
      acquisition:
        - "waitlist_conversion: waitlist_signups → day_1_signups"
        - "cost_efficiency: pre_launch_cpa vs post_launch_cpa"
        - "quality_comparison: waitlist_activation_rate vs paid_activation_rate"
        - "time_to_value: waitlist_signup_to_first_use vs paid_signup_to_first_use"
      reengagement:
        - "pre_launch_teaser_effectiveness: teaser_open_rate → pre_launch_return_rate"
        - "post_launch_announcement_effectiveness: announcement_open_rate → feature_trial_rate"
        - "winback_efficiency: winback_cost vs new_acquisition_cost"
        - "retention_impact: reengaged_user_retention vs new_user_retention"
```

---

## User Acquisition & Reengagement Tactical Templates

### User Acquisition Tactics

#### Waitlist Building

- **Timeline:** Week -4 to Week 0
- **Channels:** Twitter, Email, Community, Content
- **Messaging:** "Coming soon: [Release feature]. Join waitlist for early access."
- **CTA:** "Join Waitlist" → Landing page with email capture
- **Metrics:** Signups, Cost per signup, Conversion rate

#### Early Access Beta

- **Timeline:** Week -2 to Week 0
- **Participants:** Discovery interview participants + Top 50 waitlist
- **Process:** Invite → Onboard → Collect feedback → Advocate creation
- **Metrics:** Participants, Activation rate, Advocate conversion

#### Launch Announcement

- **Timeline:** Day 0
- **Channels:** Product Hunt, Twitter, Email, Blog, Hacker News
- **Messaging:** "[Release] is live! [Key features]. Try it now."
- **CTA:** "Get Started" → Signup flow
- **Metrics:** Signups, Press mentions, Social shares

#### Paid Acquisition

- **Timeline:** Week 1-4
- **Channels:** Twitter Ads, Google Ads, LinkedIn Ads
- **Target:** ICP segments from marketing plan
- **Metrics:** Cost per signup, Signup to activation rate, Cost per activated user

### Reengagement Tactics

#### Feature Announcement Email

- **Timeline:** Day 0
- **Target:** All existing users
- **Subject:** "New in [Release]: [Feature Name]"
- **Content:** Feature benefits, How to use, Link to try
- **Metrics:** Open rate, Click rate, Feature trial rate

#### Dormant User Winback

- **Timeline:** Week 1-2
- **Target:** Inactive 30+ days
- **Subject:** "We've been busy. Here's what's new."
- **Content:** New features summary, Usage tips, Success stories
- **CTA:** "See What's New" → App with feature highlights
- **Metrics:** Open rate, Return rate, Reactivation rate

#### Usage Nudges

- **Timeline:** Week 1-4
- **Triggers:** No upload 7 days, No search 14 days, No AI query 30 days
- **Format:** In-app prompt + Email
- **Messaging:** "Haven't uploaded in a while? [Benefit of uploading]"
- **Metrics:** Response rate, Action completion rate

---

## Dependency Graph Algorithm

```typescript
interface FUNode {
  id: string;
  dependencies: string[];
  status: "not_started" | "in_progress" | "completed";
}

function generateExecutionSchedule(fus: FUNode[]): Batch[] {
  const batches: Batch[] = [];
  const remaining = new Set(fus.map((fu) => fu.id));
  const completed = new Set<string>();

  while (remaining.size > 0) {
    // Find FUs whose dependencies are all completed
    const readyFUs = Array.from(remaining).filter((fuId) => {
      const fu = fus.find((f) => f.id === fuId);
      return fu.dependencies.every((dep) => completed.has(dep));
    });

    if (readyFUs.length === 0 && remaining.size > 0) {
      throw new Error("Circular dependency detected or missing dependencies");
    }

    // Create batch with all ready FUs (can execute in parallel)
    batches.push({
      batch_id: batches.length,
      feature_units: readyFUs,
      dependencies: [...completed],
    });

    // Mark as completed and remove from remaining
    readyFUs.forEach((fuId) => {
      completed.add(fuId);
      remaining.delete(fuId);
    });
  }

  return batches;
}
```

---

## Agent Instructions

### When to Load This Document

Load when:

- User requests creation of a new Release
- Planning multi-FU work
- Understanding Release orchestration
- Setting up Release-level integration tests

### Required Co-Loaded Documents

- `docs/feature_units/standards/creating_feature_units.md` — FU creation workflow
- `docs/feature_units/standards/execution_instructions.md` — FU execution flow
- `docs/feature_units/standards/multi_agent_orchestration.md` — Multi-agent execution (if `execution_strategy.type: "multi_agent"` in manifest)
- `docs/feature_units/standards/discovery_process.md` — Discovery process (for Step 0.5)
- `docs/specs/MVP_FEATURE_UNITS.md` — For MVP Release (first release)

### Constraints Agents Must Enforce

1. **NEVER start Release without complete Release plan**
2. **ALWAYS validate FU dependencies before generating schedule**
3. **REJECT Release if circular dependencies detected**
4. **RECOMMEND discovery for all releases** (especially early releases like MVP)
5. **ALWAYS get user approval at Checkpoints 0, 0.5 (if discovery conducted), 1 (if configured), 2**
6. **ALWAYS run cross-FU integration tests after each batch**
7. **NEVER deploy without passing integration tests**
8. **REQUIRE manual test execution before deployment** - All manual test cases from `release_report.md` Section 9 (Testing Guidance) MUST be executed and all must pass before deployment approval
9. **BLOCK deployment if manual tests not executed** - Do not proceed to Step 5 (Deployment) until all manual test cases are executed and documented
10. **BLOCK deployment if any manual test fails** - Fix issues and re-execute tests before deployment approval
11. **ALWAYS define Release type (marketed/not_marketed) during planning**
12. **SKIP marketing activities for not_marketed releases** (Step 4.5 and Step 6 marketing sections)
13. **REQUIRE marketing plan for marketed releases** before proceeding to deployment
14. **ALL releases deploy to production at neotoma.io** - distinction is marketing, not deployment location

### Forbidden Patterns

- Starting FUs out of dependency order
- Skipping cross-FU integration tests
- Proceeding past checkpoints without user approval
- Deploying with failing acceptance criteria
- **Deploying without executing manual test cases** - All manual test cases from `release_report.md` Section 9 (Testing Guidance) must be executed before deployment
- **Deploying with failed manual test cases** - All manual test cases must pass before deployment approval
- **Skipping manual test validation** - Manual test execution and results documentation is required at Checkpoint 2

---

## Quick Reference

### Command Sequence

1. **Create Release:** Use `Create New Release` command with `release_id` (e.g., `v1.0.0`)
2. **Interactive Release planning:** Answer questions at Checkpoint 0 (includes release type, discovery planning, marketing planning for marketed releases)
3. **Pre-release discovery (recommended):** Validate assumptions before building at Checkpoint 0.5
4. **Review execution schedule:** Approve batch plan and parallelization
5. **Autonomous FU execution:** Agent runs FUs in batch order with parallelization (includes continuous discovery)
6. **Mid-release review (optional):** Checkpoint 1 after critical-path FUs
7. **Pre-release sign-off:** Approve deployment at Checkpoint 2
8. **Pre-release marketing (marketed only):** Execute pre-launch acquisition and reengagement at Step 4.5
9. **Deployment:** Follow deployment plan, deploy to production (neotoma.io), setup monitoring
10. **Post-release marketing (marketed only):** Execute post-launch acquisition and reengagement at Step 6

### Status Flow

**Marketed Release:**

```
Planning → Discovery → In Progress → Ready for Deployment → Pre-Launch Marketing → Deployed → Post-Launch Marketing → Completed
```

**Not Marketed Release:**

```
Planning → Discovery → In Progress → Ready for Deployment → Deployed → Completed
```

- **Planning:** Release plan being defined (includes marketing plan for marketed releases)
- **Discovery:** Pre-release discovery validating assumptions (if conducted)
- **In Progress:** FUs being executed in batches (with continuous discovery)
- **Ready for Deployment:** All FUs complete, integration tests pass, user approved
- **Pre-Launch Marketing (marketed only):** Execute pre-launch acquisition and reengagement
- **Deployed:** Release deployed to production at neotoma.io (all releases)
- **Post-Launch Marketing (marketed only):** Execute post-launch acquisition and reengagement
- **Completed:** Release shipped and monitored

**Note:** All releases deploy to production at neotoma.io. The distinction between marketed and not_marketed is whether marketing activities accompany the release.

---

## Integration with Existing Workflows

**MVP as First Release:**

The MVP is treated as Release `v1.0.0`. The existing `docs/specs/MVP_EXECUTION_PLAN.md` and `docs/specs/MVP_FEATURE_UNITS.md` serve as the Release plan and FU inventory for `v1.0.0`.

**Future Releases:**

Subsequent releases (v1.1.0, v2.0.0) follow this same Release workflow pattern, each with their own:

- Release plan
- FU inventory
- Execution schedule
- Integration tests
- Acceptance criteria

**Relationship to Feature Units:**

- Release workflow orchestrates **multiple** Feature Units
- Feature Unit workflow (`creating_feature_units.md`) handles **individual** FUs
- Release workflow calls Feature Unit workflow for each FU in the schedule

---

## Example: MVP Release Execution (Marketed Release)

```
Release: v1.0.0 (MVP) - Marketed Release
FUs: FU-100, FU-101, FU-102, FU-103, FU-300, FU-700, FU-701

Checkpoint 0: Release Planning
→ User defines scope, FUs, acceptance criteria, discovery plan
→ User defines Release type: marketed
→ User defines marketing strategy: hybrid (pre-launch + post-launch)
→ User defines user acquisition tactics (waitlist, early access, launch announcement)
→ User defines reengagement tactics (feature teasers, winback campaigns)
→ Agent generates dependency graph
→ Agent generates execution schedule:
    Batch 0: FU-100
    Batch 1: FU-101, FU-102 (parallel)
    Batch 2: FU-103
    Batch 3: FU-300, FU-700 (parallel)
    Batch 4: FU-701
→ User approves schedule

Checkpoint 0.5: Pre-Release Discovery (optional but recommended)
→ Value discovery: ICP interviews (Week 1-2)
→ Usability discovery: Prototype user testing (Week 1-2)
→ Business viability discovery: Pricing validation (Week 2)
→ Discovery synthesis: Analyze findings, make go/no-go decision
→ Update Release plan based on learnings

Step 1: Execute Batches (with continuous discovery)
→ Batch 0: FU-100 (File Analysis) executes
→ Cross-FU integration tests pass
→ Batch 1: FU-101 (Entity Resolution) and FU-102 (Event Generation) execute in parallel
→ Cross-FU integration tests pass
→ Batch 2: FU-103 (Graph Builder) executes
→ Cross-FU integration tests pass
→ [Optional] Checkpoint 1: Mid-Release Review
→ Batch 3: FU-300 (Design System) and FU-700 (Auth) execute in parallel
→ Cross-FU integration tests pass
→ Batch 4: FU-701 (RLS) executes
→ Cross-FU integration tests pass

Step 3: Cross-Release Integration Testing
→ Full integration test suite runs
→ All tests pass

Checkpoint 2: Pre-Release Sign-Off
→ User reviews completion status
→ **REQUIRED: User executes all manual test cases from release_report.md Section 9 (Testing Guidance)**
→ **REQUIRED: User documents test results (all must pass)**
→ User approves deployment (only after manual tests executed and passed)

Step 4.5: Pre-Release Marketing (Marketed Release)
→ Launch waitlist building campaigns (Week -4 to Week 0)
→ Open early access beta signups (Week -2)
→ Publish content teasers (Week -2 to Week 0)
→ Send feature teaser emails to existing users
→ Track pre-launch metrics: waitlist signups, beta participants, email opens
→ Generate pre-launch marketing report

Step 5: Deployment
→ Deploy to staging
→ Smoke tests pass
→ Deploy to production
→ Setup monitoring

Step 6: Post-Release Marketing & Validation (Marketed Release)
→ Launch announcement (Product Hunt, social, email, blog) - Day 0
→ Convert waitlist to signups - Day 0
→ Send feature announcement to all existing users - Day 0
→ Launch paid acquisition campaigns - Week 1-4
→ Execute dormant user winback campaigns - Week 1-2
→ Deploy usage nudges - Week 1-4
→ Track post-launch metrics: signups, activation rates, reactivation rates
→ Generate marketing efficacy report (pre vs post comparison)
→ Post-release validation: user interviews, feedback analysis
→ Mark Release as completed
```

## Example: Not Marketed Release Execution

```
Release: v0.1.0 (Internal MCP Release) - Not Marketed Release
FUs: FU-200, FU-201

Checkpoint 0: Release Planning
→ User defines scope, FUs, acceptance criteria
→ User defines Release type: not_marketed
→ Marketing planning skipped (not_marketed release)
→ Agent generates dependency graph
→ Agent generates execution schedule:
    Batch 0: FU-200, FU-201 (parallel)
→ User approves schedule

Step 1: Execute Batches
→ Batch 0: FU-200, FU-201 execute in parallel
→ Cross-FU integration tests pass

Step 3: Cross-Release Integration Testing
→ Full integration test suite runs
→ All tests pass

Checkpoint 2: Pre-Release Sign-Off
→ User reviews completion status
→ **REQUIRED: User executes all manual test cases from release_report.md Section 9 (Testing Guidance)**
→ **REQUIRED: User documents test results (all must pass)**
→ User approves deployment (only after manual tests executed and passed)

Step 5: Deployment
→ Verify manual test execution completed and all passed (pre-deployment check)
→ Deploy to staging
→ Smoke tests pass
→ Deploy to production at neotoma.io
→ Setup monitoring
→ Mark Release as completed

(Step 4.5 and Step 6 marketing steps skipped for not_marketed release)
```

---

## Troubleshooting

### "Circular dependency detected" error

**Solution:**

- Review FU dependency graph
- Identify cycle: FU-A → FU-B → FU-C → FU-A
- Break cycle by removing one dependency or refactoring FUs

### Integration tests failing after batch

**Solution:**

- Review integration test failure report
- Identify which FUs caused regression
- Fix FU implementation and re-run batch
- Option: Skip failing FU and continue (if non-critical)

### Release taking longer than estimated

**Solution:**

- Review execution schedule and batch progress
- Identify bottlenecks (FUs taking longer than expected)
- Consider: Adding more parallel capacity, descoping P2 FUs, adjusting timeline
