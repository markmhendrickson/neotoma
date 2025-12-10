# Release v0.2.0 — Status

**Release**: Chat Transcript Extraction Tool  
**Release Type**: Not Marketed  
**Deployment**: Production (neotoma.io)  
**Status**: `planning`  
**Last Updated**: 2024-12-19

---

## Feature Unit Status

| Feature Unit                             | Status         | Notes                          |
| ---------------------------------------- | -------------- | ------------------------------ |
| FU-106: Chat Transcript to JSON CLI Tool | ⏳ Not Started | Pre-MVP release (not marketed) |

**Status Legend:**

- ✅ Complete
- 🔨 Partial / In Progress
- ⏳ Not Started
- ❌ Blocked

---

## Progress Summary

- **Total Feature Units**: 1
- **Completed**: 0
- **In Progress**: 0
- **Not Started**: 1
- **Blocked**: 0

---

## Next Steps

1. Create FU-106 spec (Checkpoint 0)
2. Implement CLI tool (scripts/chat-to-json.ts)
3. Implement format parsers (JSON, HTML, text)
4. Implement LLM-based interpretation
5. Implement interactive field mapping mode
6. Write tests (unit, integration, E2E)
7. Write documentation
8. Final review (Checkpoint 2)

---

## Blockers

None currently.

---

## Notes

- Pre-MVP release (not marketed)
- All releases deploy to production at neotoma.io
- Enables chat transcript ingestion workflow
- Preserves Truth Layer determinism constraints
