# ICP-Prioritized Pain Points and Failure Modes

## Source of Truth
- ICP priority order: `docs/icp/primary_icp.md`
- ICP pain points: `docs/icp/profiles.md`
- Platform-level failure modes: `docs/developer/agent_memory_failure_modes.md`
- Schema-level failure interactions: `docs/developer/agent_memory_failure_interactions_by_schema.md`

## Mapping Method
- Priority order follows ICP tiers (Tier 1 before Tier 2)
- Each ICP maps to:
  - top user pain points
  - highest-risk platform failure modes
  - schema hot spots for QA and incident review

## Tier 1 (MVP): Immediate Activation and Early Revenue

| ICP | Top pain points (from ICP profile) | Priority failure modes to prevent first | Schema hot spots to test first |
| --- | --- | --- | --- |
| AI-Native Individual Operators | No memory across sessions; fragmented document sources; repetitive context-setting | Lost commitments; tool-to-tool context loss; silent memory drift; weak correction loop | `conversation`, `message`, `agent_message`, `note`, `task` |
| High-Context Knowledge Workers | Information overload; no entity unification; timeline fragmentation; search limitations | Duplicate entities; contradictory state; non-replayable decisions; opaque relationship logic | `person`, `contact`, `company`, `relationship`, `event`, `contract`, `note` |
| AI-Native Founders and Small Teams (2-20) | Team knowledge fragmentation; onboarding friction; AI tool inconsistency; decision tracking gaps | Tool-to-tool context loss; contradictory state; non-replayable decisions; lost commitments | `project`, `task`, `goal`, `conversation`, `message`, `company`, `contract` |
| Builders of Agentic Systems (bridge ICP in profiles) | No shared memory for agents; no provenance; no deterministic layer | Non-replayable decisions; contradictory state; silent memory drift; weak correction loop | `flow`, `event`, `agent_message`, `conversation`, `task`, `relationship` |

## Tier 2: Early B2B Expansion

| ICP | Top pain points (from ICP profile) | Priority failure modes to prevent first | Schema hot spots to test first |
| --- | --- | --- | --- |
| Hybrid Product Teams | Siloed information; context loss; AI tool fragmentation; onboarding friction | Tool-to-tool context loss; contradictory state; non-replayable decisions; opaque relationship logic | `project`, `task`, `goal`, `conversation`, `message`, `note`, `event` |
| Cross-Functional Operational Teams | SOP and workflow fragmentation; knowledge loss; inconsistent execution; compliance tracking gaps | Lost commitments; non-replayable decisions; contradictory state; unbounded schema drift | `task`, `flow`, `event`, `contract`, `note`, `conversation` |
| Developer Integrators | No stable truth API; API inconsistency; limited programmatic access; integration complexity | Contradictory state; non-replayable decisions; weak correction loop; unbounded schema drift | `task`, `event`, `relationship`, `conversation`, `agent_message` |
| AI Tool Integrators (Cursor/Raycast/VSCode/Claude tools) | Tool-specific memory silos; context loss on tool switch; no unified memory | Tool-to-tool context loss; silent memory drift; contradictory state | `conversation`, `message`, `agent_message`, `note`, `task` |

## Prioritization Rubric (for backlog and QA ordering)
- P0: Failure mode directly blocks Tier 1 activation or trust
- P1: Failure mode degrades daily use but has a workaround
- P2: Failure mode matters mostly at team scale (Tier 2+)

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

