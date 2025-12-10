/**
 * Mock AI responses for prototype ChatPanel
 * Simulates MCP query responses based on keywords
 */

export interface MockAIResponse {
  query: string;
  response: string;
  recordRefs?: string[]; // Record IDs referenced in response
}

export const MOCK_AI_RESPONSES: Record<string, MockAIResponse> = {
  // Count queries
  'how many records': {
    query: 'how many records',
    response: 'You have **15 records** in your memory system across 10 different document types.',
    recordRefs: [],
  },
  'count': {
    query: 'count',
    response: 'Current totals:\n- **15 records**\n- **17 entities** (2 people, 8 companies, 6 locations, 1 product)\n- **26 timeline events**',
    recordRefs: [],
  },

  // Financial queries
  'invoice': {
    query: 'invoice',
    response: 'I found 1 invoice in your records:\n\n**Invoice #INV-2024-001** from Acme Corporation\n- Amount: $15,750.00 USD\n- Due date: December 15, 2024\n- Status: Pending\n- Description: Q4 2024 Consulting Services',
    recordRefs: ['rec-001'],
  },
  'financial': {
    query: 'financial',
    response: 'You have 3 financial records:\n1. Invoice from Acme Corp ($15,750)\n2. Receipt from TechSupply Inc ($3,249.99)\n3. Bank Statement for November 2024',
    recordRefs: ['rec-001', 'rec-002', 'rec-003'],
  },
  'acme': {
    query: 'acme',
    response: 'Acme Corporation appears in 3 records:\n1. **Invoice #INV-2024-001** - $15,750 for Q4 2024 consulting\n2. **Service Agreement** - Technical consulting contract for 2024\n3. **1099-NEC Tax Form** - $89,500 total compensation for 2023',
    recordRefs: ['rec-001', 'rec-010', 'rec-012'],
  },

  // Travel queries
  'travel': {
    query: 'travel',
    response: 'You have 2 upcoming travel records:\n1. **Flight SF to NYC** on Dec 15, 2024 (United UA1234)\n2. **Hotel at The Plaza** - Dec 15-18, 2024',
    recordRefs: ['rec-006', 'rec-007'],
  },
  'flight': {
    query: 'flight',
    response: 'Your upcoming flight:\n\n**United Airlines UA1234**\n- Departure: San Francisco (SFO) at 8:30 AM on Dec 15, 2024\n- Arrival: New York (JFK) at 5:15 PM\n- Seat: 12A (Economy Plus)\n- Booking reference: ABC123XYZ',
    recordRefs: ['rec-006'],
  },
  'december': {
    query: 'december',
    response: 'You have several items in December 2024:\n- Flight to NYC on Dec 15\n- Hotel stay Dec 15-18\n- Invoice payment due Dec 15 ($15,750)\n- Electricity bill due Dec 15 ($168.50)\n- Lease agreement expires Dec 31\n- Health insurance renewal Dec 31',
    recordRefs: ['rec-001', 'rec-006', 'rec-007', 'rec-009', 'rec-011', 'rec-014'],
  },

  // Identity queries
  'passport': {
    query: 'passport',
    response: 'Your U.S. Passport:\n- Number: P123456789\n- Issued: June 1, 2022\n- Expires: May 31, 2032\n- Valid for 8 more years',
    recordRefs: ['rec-004'],
  },
  'identity': {
    query: 'identity',
    response: 'You have 2 identity documents:\n1. **U.S. Passport** (expires 2032)\n2. **California Driver License** (expires March 2028)',
    recordRefs: ['rec-004', 'rec-005'],
  },

  // Entity queries
  'companies': {
    query: 'companies',
    response: 'You have interactions with 8 companies:\n- Acme Corporation (3 records)\n- TechSupply Inc (1 record)\n- First National Bank (1 record)\n- United Airlines (1 record)\n- Property Management LLC (1 record)\n- Blue Cross Blue Shield (1 record)\n- Pacific Gas & Electric (1 record)\n- City Medical Center (1 record)',
    recordRefs: [],
  },
  'people': {
    query: 'people',
    response: 'Records reference 2 people:\n1. **John Michael Smith** (you) - 12 records\n2. **Dr. Sarah Johnson** - Medical provider in 1 record',
    recordRefs: [],
  },

  // Medical queries
  'health': {
    query: 'health',
    response: 'Health-related records:\n1. **Lab Results** from City Medical Center (Oct 20, 2024) - All results within normal range\n2. **Health Insurance Policy** - Blue Cross Blue Shield PPO Platinum Plan, renews Dec 31',
    recordRefs: ['rec-008', 'rec-011'],
  },

  // Contract queries
  'contract': {
    query: 'contract',
    response: 'You have 2 active contracts:\n1. **Lease Agreement** - 123 Main St, SF ($3,200/month, expires Dec 31, 2024)\n2. **Service Agreement with Acme Corp** - Technical consulting ($175/hour, expires Dec 31, 2024)',
    recordRefs: ['rec-009', 'rec-010'],
  },

  // Tax queries
  'tax': {
    query: 'tax',
    response: 'Tax document found:\n**1099-NEC for 2023** from Acme Corporation\n- Nonemployee compensation: $89,500.00\n- Form issued: January 31, 2024',
    recordRefs: ['rec-012'],
  },

  // Timeline queries
  'recent': {
    query: 'recent',
    response: 'Most recent records:\n1. Electricity Bill (Dec 1, 2024)\n2. Bank Statement November 2024 (Dec 1)\n3. Receipt from TechSupply (Nov 20)\n4. Invoice from Acme Corp (Nov 15)\n5. Flight and Hotel bookings (Nov 10)',
    recordRefs: ['rec-014', 'rec-003', 'rec-002', 'rec-001', 'rec-006', 'rec-007'],
  },
  'timeline': {
    query: 'timeline',
    response: 'Your timeline spans from 2010 to 2024 with 26 events:\n- **2010**: MBA graduation from Stanford\n- **2022**: Passport issued\n- **2023**: 4 events (contracts, insurance, driver license)\n- **2024**: 20 events (financial, travel, medical, documents)',
    recordRefs: [],
  },

  // Default responses
  default: {
    query: '',
    response: 'I can help you query your records. Try asking:\n- \"How many records do I have?\"\n- \"Show me my invoices\"\n- \"When is my flight to NYC?\"\n- \"What contracts expire in December?\"\n- \"List all companies\"\n\nAll responses are **deterministic** and based on extracted, structured data.',
    recordRefs: [],
  },
};

/**
 * Get mock AI response based on query
 */
export function getMockAIResponse(query: string): MockAIResponse {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Check for exact or partial matches
  for (const [key, response] of Object.entries(MOCK_AI_RESPONSES)) {
    if (normalizedQuery.includes(key)) {
      return response;
    }
  }
  
  // Return default response
  return MOCK_AI_RESPONSES.default;
}








