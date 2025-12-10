/**
 * Static event fixtures for MVP prototype
 * Events are timeline entries extracted from date fields in records
 */

export interface TimelineEvent {
  id: string;
  type: string;
  date: string;
  time?: string;
  title: string;
  description?: string;
  record_id: string;
  record_type: string;
  entity_ids: string[]; // Related entities
  properties: Record<string, any>;
  created_at: string;
}

export const FIXTURE_EVENTS: TimelineEvent[] = [
  // 2010
  {
    id: 'evt-001',
    type: 'EducationCompleted',
    date: '2010-06-15',
    title: 'MBA Graduation - Stanford University',
    description: 'Completed Master of Business Administration with Distinction',
    record_id: 'rec-013',
    record_type: 'EducationDocument',
    entity_ids: ['ent-person-001', 'ent-location-006'],
    properties: {
      institution: 'Stanford University',
      degree: 'MBA',
      honors: 'With Distinction',
    },
    created_at: '2024-09-10T12:00:00Z',
  },

  // 2022
  {
    id: 'evt-002',
    type: 'DocumentIssued',
    date: '2022-06-01',
    title: 'Passport Issued',
    description: 'U.S. Passport issued, valid until 2032',
    record_id: 'rec-004',
    record_type: 'IdentityDocument',
    entity_ids: ['ent-person-001'],
    properties: {
      document_type: 'Passport',
      passport_number: 'P123456789',
      expiry_date: '2032-05-31',
    },
    created_at: '2024-10-05T16:45:00Z',
  },

  // 2023
  {
    id: 'evt-003',
    type: 'DocumentIssued',
    date: '2023-03-20',
    title: 'Driver License Issued',
    description: 'California Driver License issued',
    record_id: 'rec-005',
    record_type: 'IdentityDocument',
    entity_ids: ['ent-person-001', 'ent-location-001'],
    properties: {
      license_number: 'DL-CA-9876543',
      expiry_date: '2028-03-15',
    },
    created_at: '2024-10-05T16:50:00Z',
  },
  {
    id: 'evt-004',
    type: 'ContractSigned',
    date: '2023-12-15',
    title: 'Lease Agreement Signed',
    description: 'One-year lease for 123 Main Street, San Francisco',
    record_id: 'rec-009',
    record_type: 'LegalDocument',
    entity_ids: ['ent-person-001', 'ent-company-005', 'ent-location-001'],
    properties: {
      property_address: '123 Main Street, San Francisco, CA 94102',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      monthly_rent: 3200.00,
    },
    created_at: '2023-12-15T10:00:00Z',
  },
  {
    id: 'evt-005',
    type: 'ContractSigned',
    date: '2023-12-20',
    title: 'Service Agreement with Acme Corp',
    description: 'One-year consulting services agreement',
    record_id: 'rec-010',
    record_type: 'LegalDocument',
    entity_ids: ['ent-person-001', 'ent-company-001'],
    properties: {
      service_type: 'Technical Consulting',
      hourly_rate: 175.00,
      effective_date: '2024-01-01',
    },
    created_at: '2023-12-20T14:30:00Z',
  },
  {
    id: 'evt-006',
    type: 'PolicyEffective',
    date: '2023-12-28',
    title: 'Health Insurance Policy Active',
    description: 'Annual health insurance coverage begins',
    record_id: 'rec-011',
    record_type: 'InsuranceDocument',
    entity_ids: ['ent-person-001', 'ent-company-006'],
    properties: {
      policy_number: 'HI-2024-567890',
      coverage_type: 'PPO - Platinum Plan',
      monthly_premium: 650.00,
    },
    created_at: '2023-12-28T09:00:00Z',
  },

  // 2024
  {
    id: 'evt-007',
    type: 'ContractEffective',
    date: '2024-01-01',
    title: 'Lease Begins',
    description: 'Move-in date for 123 Main Street apartment',
    record_id: 'rec-009',
    record_type: 'LegalDocument',
    entity_ids: ['ent-person-001', 'ent-company-005', 'ent-location-001'],
    properties: {
      event_type: 'Lease Start',
    },
    created_at: '2023-12-15T10:00:00Z',
  },
  {
    id: 'evt-008',
    type: 'ContractEffective',
    date: '2024-01-01',
    title: 'Consulting Agreement Begins',
    description: 'Service agreement with Acme Corp becomes effective',
    record_id: 'rec-010',
    record_type: 'LegalDocument',
    entity_ids: ['ent-person-001', 'ent-company-001'],
    properties: {
      event_type: 'Contract Start',
    },
    created_at: '2023-12-20T14:30:00Z',
  },
  {
    id: 'evt-009',
    type: 'TaxDocumentIssued',
    date: '2024-01-31',
    title: '1099-NEC Received from Acme Corp',
    description: 'Tax form for 2023 consulting income',
    record_id: 'rec-012',
    record_type: 'TaxDocument',
    entity_ids: ['ent-person-001', 'ent-company-001'],
    properties: {
      tax_year: '2023',
      form_type: '1099-NEC',
      amount: 89500.00,
    },
    created_at: '2024-01-31T16:00:00Z',
  },
  {
    id: 'evt-010',
    type: 'RegistrationRenewed',
    date: '2024-04-01',
    title: 'Vehicle Registration Renewed',
    description: 'Tesla Model 3 registration renewed through March 2025',
    record_id: 'rec-015',
    record_type: 'VehicleDocument',
    entity_ids: ['ent-person-001', 'ent-product-001'],
    properties: {
      vehicle: 'Tesla Model 3',
      license_plate: 'ABC1234',
      expiry_date: '2025-03-31',
    },
    created_at: '2024-04-01T10:00:00Z',
  },
  {
    id: 'evt-011',
    type: 'MedicalAppointment',
    date: '2024-10-20',
    title: 'Annual Physical Exam',
    description: 'Routine annual physical with lab work',
    record_id: 'rec-008',
    record_type: 'MedicalRecord',
    entity_ids: ['ent-person-001', 'ent-person-002', 'ent-company-008'],
    properties: {
      provider: 'Dr. Sarah Johnson',
      facility: 'City Medical Center',
      result: 'All results within normal range',
    },
    created_at: '2024-10-25T11:00:00Z',
  },
  {
    id: 'evt-012',
    type: 'InvoiceIssued',
    date: '2024-11-15',
    title: 'Invoice #INV-2024-001 Issued',
    description: 'Q4 2024 consulting services invoice to Acme Corp',
    record_id: 'rec-001',
    record_type: 'FinancialRecord',
    entity_ids: ['ent-person-001', 'ent-company-001'],
    properties: {
      invoice_number: 'INV-2024-001',
      amount: 15750.00,
      due_date: '2024-12-15',
      status: 'Pending',
    },
    created_at: '2024-11-15T10:30:00Z',
  },
  {
    id: 'evt-013',
    type: 'Purchase',
    date: '2024-11-20',
    title: 'Equipment Purchase - TechSupply Inc',
    description: 'Laptop and accessories purchased',
    record_id: 'rec-002',
    record_type: 'FinancialRecord',
    entity_ids: ['ent-person-001', 'ent-company-002'],
    properties: {
      vendor: 'TechSupply Inc',
      amount: 3249.99,
      category: 'Equipment',
    },
    created_at: '2024-11-20T14:22:00Z',
  },
  {
    id: 'evt-014',
    type: 'BankStatement',
    date: '2024-12-01',
    title: 'Bank Statement - November 2024',
    description: 'Monthly bank statement for account ****1234',
    record_id: 'rec-003',
    record_type: 'FinancialRecord',
    entity_ids: ['ent-person-001', 'ent-company-003'],
    properties: {
      account: '****1234',
      opening_balance: 45320.50,
      closing_balance: 52180.75,
    },
    created_at: '2024-12-01T08:00:00Z',
  },
  {
    id: 'evt-015',
    type: 'UtilityBillDue',
    date: '2024-12-01',
    title: 'Electricity Bill Issued',
    description: 'November 2024 electricity usage: 420 kWh',
    record_id: 'rec-014',
    record_type: 'UtilityBill',
    entity_ids: ['ent-person-001', 'ent-company-007', 'ent-location-001'],
    properties: {
      provider: 'Pacific Gas & Electric',
      usage_kwh: 420,
      amount: 168.50,
      due_date: '2024-12-15',
    },
    created_at: '2024-12-01T06:00:00Z',
  },
  {
    id: 'evt-016',
    type: 'TravelBooked',
    date: '2024-11-10',
    title: 'Flight Booked - SF to NYC',
    description: 'United Airlines UA1234, December 15, 2024',
    record_id: 'rec-006',
    record_type: 'TravelDocument',
    entity_ids: ['ent-person-001', 'ent-company-004', 'ent-location-003', 'ent-location-004'],
    properties: {
      booking_reference: 'ABC123XYZ',
      flight_number: 'UA1234',
      departure_date: '2024-12-15',
    },
    created_at: '2024-11-10T09:15:00Z',
  },
  {
    id: 'evt-017',
    type: 'TravelBooked',
    date: '2024-11-10',
    title: 'Hotel Reserved - The Plaza NYC',
    description: 'Dec 15-18, 2024 - Deluxe King Room',
    record_id: 'rec-007',
    record_type: 'TravelDocument',
    entity_ids: ['ent-person-001', 'ent-location-005', 'ent-location-002'],
    properties: {
      confirmation_number: 'HTL-98765',
      check_in: '2024-12-15',
      check_out: '2024-12-18',
      total_cost: 1350.00,
    },
    created_at: '2024-11-10T09:30:00Z',
  },
  {
    id: 'evt-018',
    type: 'FlightDeparture',
    date: '2024-12-15',
    time: '08:30',
    title: 'Flight Departure - SFO',
    description: 'United Airlines UA1234 departs San Francisco',
    record_id: 'rec-006',
    record_type: 'TravelDocument',
    entity_ids: ['ent-person-001', 'ent-company-004', 'ent-location-003'],
    properties: {
      flight_number: 'UA1234',
      departure_airport: 'SFO',
      seat: '12A',
    },
    created_at: '2024-11-10T09:15:00Z',
  },
  {
    id: 'evt-019',
    type: 'FlightArrival',
    date: '2024-12-15',
    time: '17:15',
    title: 'Flight Arrival - JFK',
    description: 'United Airlines UA1234 arrives in New York',
    record_id: 'rec-006',
    record_type: 'TravelDocument',
    entity_ids: ['ent-person-001', 'ent-company-004', 'ent-location-004'],
    properties: {
      flight_number: 'UA1234',
      arrival_airport: 'JFK',
    },
    created_at: '2024-11-10T09:15:00Z',
  },
  {
    id: 'evt-020',
    type: 'HotelCheckIn',
    date: '2024-12-15',
    title: 'Hotel Check-in - The Plaza',
    description: 'Check-in at The Plaza Hotel, NYC',
    record_id: 'rec-007',
    record_type: 'TravelDocument',
    entity_ids: ['ent-person-001', 'ent-location-005'],
    properties: {
      hotel: 'The Plaza Hotel',
      room_type: 'Deluxe King',
    },
    created_at: '2024-11-10T09:30:00Z',
  },
  {
    id: 'evt-021',
    type: 'PaymentDue',
    date: '2024-12-15',
    title: 'Invoice Payment Due - Acme Corp',
    description: 'Invoice #INV-2024-001 payment due',
    record_id: 'rec-001',
    record_type: 'FinancialRecord',
    entity_ids: ['ent-person-001', 'ent-company-001'],
    properties: {
      invoice_number: 'INV-2024-001',
      amount: 15750.00,
    },
    created_at: '2024-11-15T10:30:00Z',
  },
  {
    id: 'evt-022',
    type: 'PaymentDue',
    date: '2024-12-15',
    title: 'Electricity Bill Payment Due',
    description: 'PG&E bill payment due',
    record_id: 'rec-014',
    record_type: 'UtilityBill',
    entity_ids: ['ent-person-001', 'ent-company-007'],
    properties: {
      provider: 'Pacific Gas & Electric',
      amount: 168.50,
    },
    created_at: '2024-12-01T06:00:00Z',
  },
  {
    id: 'evt-023',
    type: 'HotelCheckOut',
    date: '2024-12-18',
    title: 'Hotel Check-out - The Plaza',
    description: 'Check-out from The Plaza Hotel, NYC',
    record_id: 'rec-007',
    record_type: 'TravelDocument',
    entity_ids: ['ent-person-001', 'ent-location-005'],
    properties: {
      hotel: 'The Plaza Hotel',
      total_cost: 1350.00,
    },
    created_at: '2024-11-10T09:30:00Z',
  },
  {
    id: 'evt-024',
    type: 'ContractExpiry',
    date: '2024-12-31',
    title: 'Lease Agreement Expires',
    description: 'One-year lease ends for 123 Main Street',
    record_id: 'rec-009',
    record_type: 'LegalDocument',
    entity_ids: ['ent-person-001', 'ent-company-005', 'ent-location-001'],
    properties: {
      property_address: '123 Main Street, San Francisco, CA 94102',
    },
    created_at: '2023-12-15T10:00:00Z',
  },
  {
    id: 'evt-025',
    type: 'ContractExpiry',
    date: '2024-12-31',
    title: 'Service Agreement Expires',
    description: 'Consulting agreement with Acme Corp ends',
    record_id: 'rec-010',
    record_type: 'LegalDocument',
    entity_ids: ['ent-person-001', 'ent-company-001'],
    properties: {
      service_type: 'Technical Consulting',
    },
    created_at: '2023-12-20T14:30:00Z',
  },
  {
    id: 'evt-026',
    type: 'PolicyRenewal',
    date: '2024-12-31',
    title: 'Health Insurance Policy Renewal Due',
    description: 'Annual health insurance coverage renewal',
    record_id: 'rec-011',
    record_type: 'InsuranceDocument',
    entity_ids: ['ent-person-001', 'ent-company-006'],
    properties: {
      policy_number: 'HI-2024-567890',
      coverage_type: 'PPO - Platinum Plan',
    },
    created_at: '2023-12-28T09:00:00Z',
  },
];

/**
 * Get events sorted by date (most recent first)
 */
export function getEventsSorted(ascending: boolean = false): TimelineEvent[] {
  return [...FIXTURE_EVENTS].sort((a, b) => {
    const dateA = new Date(`${a.date}${a.time ? `T${a.time}` : ''}`).getTime();
    const dateB = new Date(`${b.date}${b.time ? `T${b.time}` : ''}`).getTime();
    return ascending ? dateA - dateB : dateB - dateA;
  });
}

/**
 * Get events for a specific record
 */
export function getEventsForRecord(recordId: string): TimelineEvent[] {
  return FIXTURE_EVENTS.filter(event => event.record_id === recordId);
}

/**
 * Get events by date range
 */
export function getEventsByDateRange(startDate: string, endDate: string): TimelineEvent[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  
  return FIXTURE_EVENTS.filter(event => {
    const eventDate = new Date(event.date).getTime();
    return eventDate >= start && eventDate <= end;
  });
}

/**
 * Get events by type
 */
export function getEventsByType(type: string): TimelineEvent[] {
  return FIXTURE_EVENTS.filter(event => event.type === type);
}

/**
 * Group events by year-month
 */
export function getEventsGroupedByMonth(): Record<string, TimelineEvent[]> {
  const grouped: Record<string, TimelineEvent[]> = {};
  
  FIXTURE_EVENTS.forEach(event => {
    const date = new Date(event.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(event);
  });
  
  return grouped;
}








