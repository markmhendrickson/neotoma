---
title: ICP-Prioritized Pain Points and Failure Modes
summary: "- ICP definition: [`docs/icp/primary_icp.md`](./primary_icp.md) - ICP profiles: [`docs/icp/profiles.md`](./profiles.md) - Developer release targeting: [`docs/icp/developer_release_targeting.md`](./developer_release_targeting.md) - Platfo..."
---

# ICP-Prioritized Pain Points and Failure Modes

## Source of Truth

- ICP definition: [`docs/icp/primary_icp.md`](./primary_icp.md)
- ICP profiles: [`docs/icp/profiles.md`](./profiles.md)
- Developer release targeting: [`docs/icp/developer_release_targeting.md`](./developer_release_targeting.md)
- Platform-level failure modes: `docs/developer/agent_memory_failure_modes.md`
- Schema-level failure interactions: `docs/developer/agent_memory_failure_interactions_by_schema.md`

## Mapping Method

The primary ICP is one archetype (personal agentic OS builder/operator) in three operational modes. Each mode maps to top pain points, highest-risk failure modes, and schema hot spots.

## Primary ICP: Operational Mode Mapping

| Operational mode | Top pain points | Priority failure modes to prevent first | Schema hot spots to test first |
|---|---|---|---|
| **Operating across AI tools** | No memory across sessions; context fragmentation; repetitive re-prompting; broken handoffs between tools | Lost commitments; tool-to-tool context loss; silent memory drift; weak correction loop | `conversation`, `message`, `agent_message`, `note`, `task` |
| **Building agent systems** | Drift across sessions; conflicting state across tool boundaries; no replay; no shared memory for agents | Duplicate entities; contradictory state; non-replayable decisions; entity resolution failures | `person`, `contact`, `company`, `relationship`, `event`, `task` |
| **Infrastructure engineering** | Can't reproduce agent runs; state mutations invisible; debugging is log archaeology; no provenance | Non-replayable decisions; contradictory state; silent memory drift; weak correction loop | `flow`, `event`, `agent_message`, `conversation`, `task`, `relationship` |

## Secondary Motion: B2B-by-Use-Case

These emerge downstream from personal adoption when the primary ICP brings Neotoma into team contexts.

| Context | Top pain points | Priority failure modes to prevent first | Schema hot spots to test first |
|---|---|---|---|
| Team agent workflows | Siloed information; context loss; AI tool fragmentation; onboarding friction | Tool-to-tool context loss; contradictory state; non-replayable decisions; opaque relationship logic | `project`, `task`, `goal`, `conversation`, `message`, `note`, `event` |
| Toolchain integrators | No stable truth API; API inconsistency; limited programmatic access | Contradictory state; non-replayable decisions; weak correction loop; unbounded schema drift | `task`, `event`, `relationship`, `conversation`, `agent_message` |

## Prioritization Rubric

- **P0:** Failure mode directly blocks primary ICP activation or trust
- **P1:** Failure mode degrades daily use but has a workaround
- **P2:** Failure mode matters mostly at team scale (B2B downstream)

## Immediate QA Focus by Priority

- P0:
  - stale conversation/message replay
  - duplicate entity resolution failures
  - missing or incorrect task/commitment state
- P1:
  - stale relationship edges after updates
  - correction flow does not supersede extracted data
  - cross-tool context not available after tool switch
- P2:
  - schema drift across updates
  - aggregate project/flow status drift in team workspaces

