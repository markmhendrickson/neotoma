# Neotoma MVP Feature List

This is the complete, authoritative MVP feature list for Neotoma, expressed as clean raw Markdown for direct use in engineering specs, Cursor tasks, or repo documentation.

---

# 1. File Ingestion Core

## 1.1 File Upload (UI)
- Drag-and-drop file upload
- Multi-file selection
- Supported formats:
  - PDF
  - HTML
  - Markdown (.md)
  - CSV
  - TXT
  - DOCX (optional)
  - JPG/PNG
  - WAV/MP3 (voice notes)

## 1.2 Basic Email Ingestion (Gmail Only)
- OAuth Gmail connection
- Selective ingestion of:
  - Emails with attachments
  - Receipts
  - Invoices
  - Travel confirmations
  - School docs
- No full inbox sync
- No write access

---

# 2. Schema Detection & Normalization

## 2.1 Automatic Document Type Classification
Detect and classify:
- Invoice
- Receipt
- Identity document
- Contract
- General PDF
- Travel itinerary
- Calendar event (ICS/PDF)
- Note/draft
- Research paper
- Photo-of-document
- Screenshot-of-information

## 2.2 Canonical Schema Assignment
Assign internal schema types:
- `FinancialRecord`
- `IdentityDocument`
- `Contract`
- `CalendarEvent`
- `ResearchPaper`
- `TravelDocument`
- `ImageContext`
- `AudioContext`
- `Note`
- `WebResource` (basic)
- `Entity`

## 2.3 Key Field Extraction (MVP Subset)
Extract essential metadata:
- Dates (issued, due, event dates, expiry)
- Amounts (totals, currency codes)
- Parties (sender, recipient, issuer)
- Document titles
- Identifiers (invoice number, reference number)
- Event metadata (SUMMARY/DTSTART)
- File metadata (filename, created_at)

---

# 3. Unified Record Browser

## 3.1 Record Index View
Columns:
- Type
- Title
- Date
- Source (Gmail, Upload, Drive)
- Schema Type

## 3.2 Record Detail View
- Document preview (PDF, image, audio)
- Extracted fields
- Raw text
- File metadata
- Schema metadata

## 3.3 Basic Search
- Keyword search
- Filters by:
  - Type
  - Date range
  - Source

---

# 4. Personal Memory Graph (Minimal Version)

## 4.1 Automatic Timeline Construction
Generate events from:
- Document dates
- Itineraries
- Identity expiry
- Financial document timestamps
- Uploaded notes with timestamps

## 4.2 Basic Entity Linking
Automatically detect:
- People
- Organizations
- Places (optional)
- Reference matches across files

## 4.3 Minimal Graph Structure
Store:
- Entity ↔ Document relationships
- Document ↔ Event relationships

Graph does not require dedicated UI in MVP.

---

# 5. AI Interaction Layer (Minimal)

## 5.1 File-Aware Chat Panel
Buttons on each record:
- “Summarize”
- “Explain this”
- “Extract key fields”
- “Find related documents”
- “Create a reminder” (if date detected)

## 5.2 Memory Recall
- Ask questions referencing ingested documents
- Agents can retrieve:
  - raw text
  - extracted fields
  - related entities

## 5.3 No Background Agents
All actions triggered manually.

---

# 6. Minimal Integration Hub

## 6.1 ChatGPT MCP Integration (Critical)
Provide MCP actions:
- `upload_file`
- `list_records`
- `fetch_record`
- `search`
- `create_entity`
- `link`
- `update_record`

## 6.2 Optional Second Integration (MVP-Optional)
Raycast minimal API:
- upload
- search
- fetch

No other integrations until v1.

---

# 7. Onboarding Flow

## 7.1 Quick Start Import
Steps:
1. Upload first 5 files
2. Connect Gmail (optional)
3. Show extracted results
4. Show timeline preview
5. Open file-aware chat

## 7.2 “What Neotoma Found” Summary
Auto-generated:
- X documents
- Y events
- Z entities
- earliest → latest timeline items

---

# 8. Safety and Privacy (Required Minimum)

## 8.1 Explicit Ingestion Controls
- User chooses which inbox labels to read
- User chooses which folders to watch

## 8.2 No Automatic Global Scans
- No scanning entire Drive/iCloud
- No scanning all emails

## 8.3 Clear Privacy Model
- Local processing for sensitive fields (or clear messaging)

---

# 9. Persistence Layer

## 9.1 Storage
- Supabase or equivalent DB
- Object storage for file blobs
- Indexed metadata

## 9.2 Record Structure
- raw file
- extracted text
- extracted fields
- detected schema
- entities linked
- timeline events

---

# 10. Not Included in MVP
(Explicit exclusions)

- Semantic search
- Full knowledge graph UI
- Autonomous agents
- Scheduling or long-running tasks
- Multi-user family accounts
- POCP (wealth/tax strategy)
- AI Wallet (on-chain execution)
- Live sync for Drive/iCloud
- Multi-provider email ingestion
- Messaging ingestion (WhatsApp, iMessage)
- Rich analytics dashboards
- Mobile app

---

# **Summary**
The Neotoma MVP delivers one thing exceptionally well:

**“A universal ingestion engine + durable memory layer that AI can use.”**

This surface is sufficient to activate:
- AI power users  
- cognitive workers  
- solopreneurs  
- life managers  
- knowledge workers  

and prepares the foundation for:
- POCP strategy layer  
- AI Wallet execution layer  

without overextending the MVP.

