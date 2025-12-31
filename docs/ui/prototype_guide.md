# Neotoma MVP Interactive Prototype — Guide
## Overview
This guide explains the interactive MVP prototype built with static data fixtures for demonstration purposes.
## Access Points
### 1. Quick Start
```bash
npm run dev:prototype
```
### 2. Shell Script
```bash
./scripts/prototypes/run-prototype.sh
```
### 3. Direct URL
```
http://localhost:5174
```
## Navigation Map
```
┌─────────────────────────────────────────────────────────────┐
│                    Neotoma MVP Prototype                     │
│                                                              │
│  [Records: 15] [Timeline: 26] [Entities: 17]    [About]    │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌─────▼─────┐        ┌─────▼──────┐
   │ Records │          │ Timeline  │        │  Entities  │
   │  View   │          │   View    │        │    View    │
   └─────────┘          └───────────┘        └────────────┘
        │                     │                     │
   ┌────▼────┐          ┌─────▼─────┐        ┌─────▼──────┐
   │ • List  │          │ • Events  │        │ • Stats    │
   │ • Search│          │ • Filter  │        │ • Counts   │
   │ • Filter│          │ • Groups  │        │ • Types    │
   │ • Detail│          │ • Navigate│        │            │
   └─────────┘          └───────────┘        └────────────┘
```
## Views Explained
### Records View
**Purpose**: Browse and search all ingested documents
**Features**:
- Table view with all records
- Search bar (full-text across fields)
- Type filter dropdown
- Click record → Opens detail panel
- Shows record metadata, properties, tags
**Sample Records**:
- Financial: Invoices, receipts, bank statements
- Identity: Passport, driver's license
- Travel: Flights, hotel bookings
- Medical: Lab results
- Legal: Leases, service agreements
- Insurance: Health insurance policy
- Tax: 1099 forms
- Education: Diplomas
- Utilities: Bills
- Vehicles: Registration
**Interactions**:
1. Type in search box → Filters records
2. Select type from dropdown → Filters by type
3. Click record row → Opens detail panel
4. Click X on detail panel → Closes panel
### Timeline View
**Purpose**: See chronological history of all events
**Features**:
- Events grouped by year and month
- Collapsible year sections
- Event type filtering
- Color-coded event badges
- Click event → Navigate to source record
- Date and time display
**Event Types**:
- InvoiceIssued, PaymentDue
- ContractSigned, ContractEffective, ContractExpiry
- DocumentIssued, TaxDocumentIssued
- TravelBooked, FlightDeparture, FlightArrival
- HotelCheckIn, HotelCheckOut
- MedicalAppointment
- PolicyEffective, PolicyRenewal
- EducationCompleted
- RegistrationRenewed
- Purchase, BankStatement
- UtilityBillDue
**Interactions**:
1. Click year header → Expand/collapse months
2. Select event type from dropdown → Filter events
3. Toggle "Newest First" / "Oldest First" → Change sort order
4. Click event card → Navigate to source record in Records view
### Entities View
**Purpose**: Show extracted entities and their types
**Features**:
- Entity statistics dashboard
- Counts by entity type
- Visual breakdown
- Button to navigate to records
**Entity Types**:
- **People** (2): John Smith, Dr. Sarah Johnson
- **Companies** (8): Acme Corp, TechSupply, banks, airlines, utilities
- **Locations** (6): Cities, airports, hotels, universities
- **Products** (1): Tesla vehicle
**Concept Demonstrated**:
Entity resolution extracts real-world things from records:
- Same person across multiple documents → Single entity
- Company mentioned in invoices, contracts → Single entity
- Location referenced in travel, address → Single entity
## Welcome Modal
**Triggered**:
- Automatically on first visit
- Click "About" button in header
- Stored in localStorage (shows once)
**Content**:
- Overview of prototype features
- Statistics (15 records, 26 events, 17 entities)
- "What to Try" suggestions
- Quick navigation buttons
**Interactions**:
1. "Explore Records" → Close modal, stay on Records view
2. "Start with Timeline" → Close modal, switch to Timeline view
3. Click X or outside → Close modal
## Data Flow
### Static Fixtures
```
fixtures/
├── records.ts    → FIXTURE_RECORDS (15 items)
├── entities.ts   → FIXTURE_ENTITIES (17 items)
└── events.ts     → FIXTURE_EVENTS (26 items)
        │
        ▼
  PrototypeApp.tsx  (loads fixtures)
        │
        ├──→ RecordsTable (displays records)
        ├──→ TimelineView (displays events)
        └──→ Entities View (displays entity stats)
```
### No Backend Required
- All data loaded from TypeScript files
- No API calls
- No database queries
- No authentication
- No file system access
## Design System
### Colors (Light Mode)
- **Primary**: `#0066CC` (Trust blue)
- **Background**: `#FFFFFF` (White)
- **Foreground**: `#111827` (Near black)
- **Border**: `#E5E7EB` (Gray)
- **Muted**: `#6B7280` (Gray)
### Colors (Dark Mode)
- **Primary**: `#3B82F6` (Bright blue)
- **Background**: `#0F172A` (Dark blue-gray)
- **Foreground**: `#F1F5F9` (Light gray)
- **Border**: `#334155` (Dark gray)
- **Muted**: `#94A3B8` (Mid gray)
### Typography
- **Headings**: Inter (system fallback: -apple-system)
- **Body**: Inter
- **Code**: Fira Code (monospace fallback)
### Spacing Scale
- xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px
### Components
- Built with Shadcn UI
- Radix UI primitives
- Tailwind CSS styling
- Consistent with design system spec
## Demo Scenarios
### Scenario 1: Financial Records Review
1. Start on Records view
2. Click type filter → Select "FinancialRecord"
3. See 3 financial records (invoice, receipt, bank statement)
4. Click invoice → View details in side panel
5. Switch to Timeline view
6. See InvoiceIssued event on Nov 15, 2024
7. Click event → Navigate back to invoice record
### Scenario 2: Travel Planning
1. Start on Records view
2. Search "travel" or "flight"
3. See flight booking and hotel reservation
4. Switch to Timeline view
5. Filter by event type → Select "FlightDeparture"
6. See SF to NYC flight on Dec 15
7. Expand December 2024 → See full trip itinerary
### Scenario 3: Entity Exploration
1. Switch to Entities view
2. See 17 entities across 4 types
3. Note 8 companies extracted
4. Click "View Records"
5. Browse records → See company names in properties
6. Understand entity linking concept
### Scenario 4: Timeline Navigation
1. Switch to Timeline view
2. Collapse 2024 → Expand 2023
3. See historical events (passport issued, contracts signed)
4. Toggle sort order → Oldest First
5. See chronological progression from 2010 (MBA graduation)
6. Click event → View source record
## Troubleshooting
### Prototype won't start
```bash
# Check if port 5174 is available
lsof -i :5174
# Kill process if needed
kill -9 <PID>
# Try again
npm run dev:prototype
```
### Welcome modal won't show
```javascript
// Reset localStorage in browser console
localStorage.removeItem('neotoma-prototype-welcome-seen');
// Refresh page
```
### Fixtures not loading
```bash
# Check files exist
ls -la frontend/src/fixtures/
# Should see:
# - index.ts
# - records.ts
# - entities.ts
# - events.ts
```
### Styling looks broken
```bash
# Rebuild Tailwind
cd frontend
npm run build:ui
# Or restart dev server
npm run dev:prototype
```
## Extending the Prototype
### Add New Records
Edit `frontend/src/fixtures/records.ts`:
```typescript
{
  id: 'rec-016',
  type: 'NewRecordType',
  summary: 'Description',
  properties: {
    field1: 'value1',
    field2: 'value2',
  },
  tags: ['tag1', 'tag2'],
  created_at: '2024-12-02T10:00:00Z',
  updated_at: '2024-12-02T10:00:00Z',
  user_id: 'user-demo',
  file_urls: ['/fixtures/file.pdf'],
  _status: 'Ready',
}
```
### Add New Events
Edit `frontend/src/fixtures/events.ts`:
```typescript
{
  id: 'evt-027',
  type: 'NewEventType',
  date: '2024-12-02',
  time: '10:00',
  title: 'Event Title',
  description: 'Event description',
  record_id: 'rec-016',
  record_type: 'NewRecordType',
  entity_ids: ['ent-person-001'],
  properties: {},
  created_at: '2024-12-02T10:00:00Z',
}
```
### Add New Entities
Edit `frontend/src/fixtures/entities.ts`:
```typescript
{
  id: 'ent-company-009',
  type: 'Company',
  name: 'New Company Inc',
  canonical_name: 'new company inc',
  properties: {
    industry: 'Technology',
  },
  related_records: ['rec-016'],
  created_at: '2024-12-02T10:00:00Z',
  updated_at: '2024-12-02T10:00:00Z',
}
```
### Customize Welcome Modal
Edit `frontend/src/PrototypeApp.tsx`:
Find the `<Dialog>` component and modify:
- Title
- Description
- Feature highlights
- Button labels
- Button actions
## Feedback and Issues
For prototype feedback:
1. UI/UX improvements
2. Missing features to demonstrate
3. Additional demo scenarios
4. Documentation clarity
**Version**: 1.0.0
**Status**: ✅ Complete
**Last Updated**: December 2, 2024
