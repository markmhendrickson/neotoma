---
title: "Neotoma MVP Prototype — Quick Start"
summary: "Interactive demonstration of Neotoma MVP with static data fixtures. ## One-Command Start ```bash npm run dev:prototype ``` Or: ```bash ./scripts/run-prototype.sh ``` Opens on `http://localhost:5174` **Note**: Uses dedicated `vite.prototy..."
---

# Neotoma MVP Prototype — Quick Start
Interactive demonstration of Neotoma MVP with static data fixtures.
## One-Command Start
```bash
npm run dev:prototype
```
Or:
```bash
./scripts/run-prototype.sh
```
Opens on `http://localhost:5174`
**Note**: Uses dedicated `vite.prototype.config.ts` configuration
## What You'll See
### 🎯 Complete MVP Demo (All Feature Units)
**7 Interactive Views:**
1. **Dashboard** — Stats, recent records, quick actions (FU-305)
2. **Records** — List, search, filter, detail panel (FU-301, FU-302)
3. **Timeline** — 26 events, chronological grouping (FU-303)
4. **Entities** — 17 entities with explorer & detail (FU-601)
5. **Upload** — Bulk upload simulation with progress (FU-304)
6. **Chat** — AI queries with mock MCP responses (FU-307)
7. **Settings** — Preferences, integrations, billing (FU-306)
### Data Fixtures
- 15 sample documents across 10 types
- 26 timeline events (2010-2024)
- 17 canonical entities
- 15+ mock AI query patterns
## Navigation
Use the tabs at the top to switch between:
- **Records** — Browse and search documents
- **Timeline** — Chronological event history
- **Entities** — Extracted entities and relationships
## Demo Data
All data is static fixtures located in `frontend/src/fixtures/`:
- `records.ts` — 15 sample records
- `events.ts` — 26 timeline events
- `entities.ts` — 17 entities
## Interaction
- **Search**: Type in the search box to filter records
- **Filter**: Select record type from dropdown
- **Click Record**: Opens detail panel
- **Click Event**: Navigates to source record
- **Switch Views**: Use navigation tabs
## Note
This is a **demonstration prototype**:
- No backend required
- No authentication
- No file uploads
- No data persistence
- Record mutations disabled (shows toast messages)
## Full Documentation
See [PROTOTYPE_README.md](./PROTOTYPE_README.md) for complete details.
## Next Steps
This prototype is a historical MVP demonstration. Current implementation guidance lives in `README.md`, `docs/architecture/`, and `docs/subsystems/`. Historical MVP planning artifacts are archived in `docs/releases/archived/mvp_planning/`.
