# Release v0.2.0 — Execution Schedule

**Release**: Chat Transcript Extraction Tool  
**Status**: `planning`  
**Last Updated**: 2024-12-19

---

## Execution Order

### Batch 1: Foundation (Sequential)

**FU-106: Chat Transcript to JSON CLI Tool**
- **Dependencies**: None
- **Estimated Time**: 4-6h (Agent) + 1-1.5h (Human review)
- **Status**: ⏳ Not Started

**Steps:**
1. Create FU-106 spec (Checkpoint 0)
2. Human review spec and JSON format requirements
3. Implement CLI script (`scripts/chat-to-json.ts`)
4. Implement format parsers (ChatGPT JSON, HTML, text)
5. Implement LLM-based interpretation (OpenAI/Anthropic APIs)
6. Implement interactive field mapping mode
7. Write tests (unit, integration, E2E)
8. Write documentation
9. Human review (Checkpoint 2)
10. Final approval

---

## Timeline Estimate

- **Total Estimated Time**: 5-7.5 hours
- **Human Time**: 1-1.5 hours (spec review, final review)
- **Agent Time**: 4-6 hours (implementation, tests, docs)

---

## Parallelization

No parallelization possible (single Feature Unit, no dependencies).

---

## Critical Path

FU-106 is the only Feature Unit in this release, so it is the critical path.

---

## Dependencies

None (FU-106 has no dependencies).

---

## Notes

- This is a standalone CLI tool, so it can be developed independently
- No blocking dependencies on other releases
- Can be developed in parallel with MVP work if needed

