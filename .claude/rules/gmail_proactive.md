---
description: Agents MUST use the Gmail MCP proactively to check email whenever task context makes it relevant, without waiting to be asked.
globs:
alwaysApply: true
---

<!-- Source: foundation/agent_instructions/cursor_rules/gmail_proactive.mdc -->


# Gmail Proactive Check Rule

## Purpose

Ensures agents check Gmail proactively when task context implies email may contain relevant information, rather than waiting for an explicit instruction to check.

## Trigger Patterns

Agents MUST check Gmail proactively when:

- Waiting on an external action that sends email confirmation (account signups, invitations, verifications, notifications)
- A workflow step is blocked pending an email (e.g. invitation acceptance, token delivery, approval)
- The user asks about status of something that would be communicated via email
- Setting up third-party integrations that send credentials or confirmation links by email
- Any context where "did the email arrive?" is a natural next question

## Agent Actions

1. Use `mcp__aa7dd3ca-ee1b-423d-8787-cf03044822ee__search_threads` with a targeted query (recipient, sender, subject keywords, time window)
2. If relevant emails are found, surface the key details and next action
3. If no relevant emails are found, report that and suggest next steps

## Constraints

- MUST check Gmail proactively when task context implies email is a dependency — do not wait for the user to say "check my email"
- MUST use targeted queries (narrow by sender, recipient, subject, or time) rather than fetching all mail
- MUST store any emails retrieved in Neotoma per the external-tool store-first rule
- MUST NOT check Gmail in unrelated contexts where email is not a plausible dependency
