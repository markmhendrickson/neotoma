# Neotoma MVP Interactive Prototype
This is an interactive prototype of the Neotoma MVP built with static data fixtures. It demonstrates all core UI components and workflows without requiring backend infrastructure.
## Features Demonstrated
### ✅ Records View
- **15 sample records** across multiple types:
  - Financial Records (invoices, receipts, bank statements)
  - Identity Documents (passport, driver's license)
  - Travel Documents (flights, hotels)
  - Medical Records
  - Legal Documents (leases, service agreements)
  - Insurance Documents
  - Tax Documents
  - Education Documents
  - Utility Bills
  - Vehicle Documents
- **Full search and filtering**:
  - Text search across all record fields
  - Filter by record type
  - Sort by date
  - Record count badges
- **Record detail panel**:
  - Expandable side panel
  - Full property display
  - Tags and metadata
  - File references
### ✅ Timeline View
- **26 timeline events** extracted from record date fields
- **Chronological organization** by year and month
- **Event type filtering** with color-coded badges
- **Collapsible year sections**
- **Event details**:
  - Date and time display
  - Event type badges
  - Descriptions
  - Related record links
  - Click to navigate to source record
### ✅ Entities View
- **17 extracted entities**:
  - 2 People (John Smith, Dr. Sarah Johnson)
  - 8 Companies (Acme Corp, TechSupply, etc.)
  - 6 Locations (San Francisco, NYC, airports, hotels)
  - 1 Product (Tesla vehicle)
- **Entity statistics** by type
- Shows entity resolution and linking concept
## Running the Prototype
### Option 1: Prototype Mode (Recommended)
```bash
npm run dev:prototype
```
This runs the **comprehensive MVP prototype** on port 5174.
**NEW**: Complete implementation with all 7 views, AI chat, bulk upload, and full interactivity. See [prototype_complete.md](./prototype_complete.md) for details.
### Option 2: Development Server with Prototype Route
```bash
npm run dev
```
Then navigate to `http://localhost:5173/prototype` (if routing is configured).
### Option 3: Direct File Access
Open `frontend/prototype.html` in your development server.
## File Structure
```
frontend/
├── prototype.html              # Prototype entry point
├── src/
│   ├── PrototypeApp.tsx       # Main prototype application
│   ├── prototype-main.tsx     # Prototype React entry
│   ├── fixtures/              # Static data fixtures
│   │   ├── records.ts         # 15 sample records
│   │   ├── entities.ts        # 17 extracted entities
│   │   └── events.ts          # 26 timeline events
│   └── components/
│       ├── TimelineView.tsx   # Timeline component (new)
│       ├── RecordsTable.tsx   # Records list view
│       ├── RecordDetailsPanel.tsx  # Record detail side panel
│       └── ui/                # Shadcn UI components
```
## Data Fixtures
### Records (`fixtures/records.ts`)
- 15 records spanning 10 different record types
- Realistic data with proper field structures
- Demonstrates schema detection and field extraction
- Covers MVP-critical document types
### Entities (`fixtures/entities.ts`)
- 17 entities extracted from records
- Shows canonical naming and deduplication
- Links entities to source records
- Demonstrates entity resolution
### Events (`fixtures/events.ts`)
- 26 timeline events from 2010-2024
- Multiple event types (invoices, travel, contracts, etc.)
- Proper date/time handling
- Event-to-record and event-to-entity relationships
## What This Demonstrates
### MVP Core Features
1. **Ingestion**: Simulated via pre-loaded fixture records
2. **Extraction**: Schema types and field structures in place
3. **Entity Resolution**: Canonical entities linked to records
4. **Timeline Generation**: Events extracted from date fields
5. **Search**: Full-text search across record fields
6. **UI Components**: All major UI views functional
### User Workflows
1. **Browse Records**: View, search, filter records by type
2. **Explore Timeline**: See chronological event history
3. **View Entities**: Understand entity extraction and linking
4. **Record Details**: Inspect individual record properties
5. **Navigation**: Switch between different views seamlessly
## Design System
The prototype uses the Neotoma design system as specified in:
- `docs/ui/design_system.md`
- `frontend/src/components/StyleGuide.tsx`
Color palette, typography, spacing, and component styles follow MVP specifications.
## Limitations (By Design)
This is a **static prototype** for demonstration purposes:
- ❌ No file upload (static fixtures only)
- ❌ No record creation/editing/deletion (UI shows toast messages)
- ❌ No AI/MCP integration (would require backend)
- ❌ No authentication (single-user demo mode)
- ❌ No backend API calls (all data in-memory)
- ❌ No persistence (refresh resets state)
These limitations are intentional to create a fast, shareable prototype without infrastructure dependencies.
## Use Cases
### 1. Stakeholder Demos
Show product vision and UI/UX to investors, partners, or potential customers without backend setup.
### 2. User Testing
Get early feedback on UI components, navigation, and information architecture.
### 3. Design Iteration
Rapidly iterate on design system, layouts, and user flows.
### 4. Documentation
Visual reference for MVP features in documentation and specs.
### 5. Development Reference
Frontend developers can use this as a reference implementation while backend services are built.
## Next Steps: From Prototype to Production
To convert this prototype into the production MVP:
1. **Replace fixtures with API calls**:
   - `fixtures/records.ts` → API endpoint `/api/records`
   - `fixtures/entities.ts` → API endpoint `/api/entities`
   - `fixtures/events.ts` → API endpoint `/api/events`
2. **Add state management**:
   - Replace local state with proper data fetching
   - Add React Query or similar for server state
   - Implement optimistic updates
3. **Connect to backend services**:
   - File upload → Supabase Storage
   - Record CRUD → Supabase Database + RLS
   - MCP actions → Backend MCP server
4. **Add authentication**:
   - Supabase Auth integration
   - User session management
   - Row-level security enforcement
5. **Enable real-time features**:
   - File processing status updates
   - Record sync across clients
   - Collaboration features
See [`docs/specs/MVP_EXECUTION_PLAN.md`](docs/specs/MVP_EXECUTION_PLAN.md) for the full implementation roadmap.
## Feedback
This prototype demonstrates the MVP vision. Feedback welcome on:
- UI/UX and navigation
- Information architecture
- Feature priority
- Design system consistency
- User workflows
**Note**: This is a prototype using static data fixtures. It demonstrates UI and user workflows, not backend functionality.
