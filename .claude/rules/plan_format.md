---
description: "When creating or updating a plan, include key problems solved, key solutions implemented, QA needs, and documentation update needs (where relevant)."
alwaysApply: false
---

<!-- Source: foundation/agent_instructions/cursor_rules/plan_format.mdc -->

# Plan Format Rules

## Scope

This document defines required content for all plans created or updated by agents. It does not define implementation details for any feature or subsystem.

## Purpose

Ensure every plan includes the key problems solved and key solutions implemented, and that new plans capture QA and documentation update needs when those areas are impacted.

## Trigger Patterns

When an agent creates or updates a plan, the plan MUST include key problems solved and key solutions implemented. For new plans, include QA and documentation update needs sections whenever the work introduces testing and/or documentation impact.

## Agent Actions

### Step 1: Include key problems solved

1. Add a section titled "Key problems solved".
2. List the main problems the plan addresses.

### Step 2: Include key solutions implemented

1. Add a section titled "Key solutions implemented".
2. List the main solutions the plan will implement.

### Step 3: Include QA needs (where relevant)

1. Add a section titled "QA needs" in new plans when the work changes behavior, user flows, APIs, storage, or integrations.
2. List the required validation work (unit, integration, end-to-end, manual checks, regressions, or release verification as applicable).

### Step 4: Include documentation update needs (where relevant)

1. Add a section titled "Documentation update needs" in new plans when docs should change due to behavior, API, tooling, workflow, or operator-facing updates.
2. List specific docs to add/update and note any downstream sync requirements.

## Constraints

- Agents MUST include the sections "Key problems solved" and "Key solutions implemented" in every plan.
- Agents MUST list at least one item in each of these sections.
- Agents MUST include a "QA needs" section in all new plans where QA impact is relevant.
- Agents MUST include a "Documentation update needs" section in all new plans where documentation impact is relevant.
- Agents MUST use direct, declarative language.
