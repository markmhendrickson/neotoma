# Neotoma MVP Interactive Prototype

## Quick Links

- **[Quick Start](./PROTOTYPE_QUICKSTART.md)** — One-page getting started guide
- **[Complete Guide](./PROTOTYPE_README.md)** — Full documentation
- **[Summary](./PROTOTYPE_SUMMARY.md)** — Executive summary
- **[Completion Status](./PROTOTYPE_COMPLETE.md)** — What was built
- **[Changelog](./PROTOTYPE_CHANGELOG.md)** — Version history
- **[Index](./PROTOTYPE_INDEX.md)** — Complete file inventory

## Overview

Interactive demonstration of the Neotoma MVP covering **all feature units** from:
- [`docs/specs/MVP_OVERVIEW.md`](../specs/MVP_OVERVIEW.md)
- [`docs/specs/MVP_FEATURE_UNITS.md`](../specs/MVP_FEATURE_UNITS.md)

## Running the Prototype

```bash
npm run dev:prototype
```

Opens on `http://localhost:5174`

## What's Included

### 7 Interactive Views
1. **Dashboard** — Stats and quick actions (FU-305)
2. **Records** — List, search, filter, detail (FU-301, FU-302)
3. **Timeline** — Chronological events (FU-303)
4. **Entities** — Explorer with detail view (FU-601)
5. **Upload** — Bulk upload simulation (FU-304)
6. **Chat** — AI/MCP queries with mock responses (FU-307)
7. **Settings** — Preferences and integrations (FU-306)

### Static Data
- 15 sample records (10 document types)
- 26 timeline events (2010-2024)
- 17 entities (people, companies, locations, products)
- 15+ mock AI query patterns

### All User States
- ✅ Loading (upload progress, AI thinking)
- ✅ Error (demo mode notifications)
- ✅ Empty (dashboard widgets, entity list)
- ✅ Success (upload complete, extraction done)

## Architecture

```
frontend/
├── prototype.html                  # Prototype entry point
├── src/
│   ├── prototype/
│   │   ├── main.tsx               # React entry for prototype
│   │   ├── PrototypeApp.tsx       # Main prototype app (7 views)
│   │   ├── components/            # Prototype-only components
│   │   │   ├── MockChatPanel.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── MockUploadUI.tsx
│   │   │   ├── SettingsView.tsx
│   │   │   ├── EntityExplorerView.tsx
│   │   │   └── TimelineView.tsx
│   │   └── fixtures/              # Static prototype data
│   │       ├── records.ts         # 15 records
│   │       ├── entities.ts        # 17 entities
│   │       ├── events.ts          # 26 events
│   │       └── mockAIResponses.ts # AI query patterns
│   └── App.tsx                    # Main application (non-prototype)
```

## Use Cases

1. **Stakeholder Demos** — Show product vision without infrastructure
2. **User Testing** — Get early UI/UX feedback
3. **Design Iteration** — Rapid prototyping
4. **Documentation** — Visual reference for specs
5. **Development Reference** — Frontend implementation guide

## Next Steps

### For Stakeholders
Review complete workflow coverage → Provide feedback

### For Users
Test all user flows → Report UX issues

### For Developers
Use as reference → Build production MVP per [`MVP_EXECUTION_PLAN.md`](../specs/MVP_EXECUTION_PLAN.md)

---

**Status**: ✅ Complete  
**Version**: 2.0.0 (Comprehensive MVP Demo)  
**Created**: December 2, 2024

