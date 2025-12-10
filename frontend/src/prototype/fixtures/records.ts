import type { NeotomaRecord } from '@/types/record';

/**
 * Static record fixtures for MVP prototype
 * Demonstrates various record types and their structure
 */

export const FIXTURE_RECORDS: NeotomaRecord[] = [
  // Financial Records
  {
    id: 'rec-001',
    type: 'FinancialRecord',
    summary: 'Invoice #INV-2024-001 from Acme Corp',
    properties: {
      vendor_name: 'Acme Corporation',
      amount: 15750.00,
      currency: 'USD',
      date_issued: '2024-11-15',
      date_due: '2024-12-15',
      invoice_number: 'INV-2024-001',
      status: 'Pending',
      description: 'Q4 2024 Consulting Services',
    },
    tags: ['invoice', 'consulting', 'q4-2024'],
    created_at: '2024-11-15T10:30:00Z',
    updated_at: '2024-11-15T10:30:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/invoice-acme-001.pdf'],
    _status: 'Ready',
  },
  {
    id: 'rec-002',
    type: 'FinancialRecord',
    summary: 'Receipt #RCP-2024-045 from TechSupply Inc',
    properties: {
      vendor_name: 'TechSupply Inc',
      amount: 3249.99,
      currency: 'USD',
      date_issued: '2024-11-20',
      transaction_type: 'Purchase',
      category: 'Equipment',
      description: 'Laptop and accessories',
    },
    tags: ['receipt', 'equipment', 'hardware'],
    created_at: '2024-11-20T14:22:00Z',
    updated_at: '2024-11-20T14:22:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/receipt-techsupply-045.pdf'],
    _status: 'Ready',
  },
  {
    id: 'rec-003',
    type: 'FinancialRecord',
    summary: 'Bank Statement - November 2024',
    properties: {
      account_number: '****1234',
      bank_name: 'First National Bank',
      statement_period: '2024-11-01 to 2024-11-30',
      opening_balance: 45320.50,
      closing_balance: 52180.75,
      total_deposits: 18500.00,
      total_withdrawals: 11639.75,
    },
    tags: ['bank-statement', 'november-2024'],
    created_at: '2024-12-01T08:00:00Z',
    updated_at: '2024-12-01T08:00:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/bank-statement-nov-2024.pdf'],
    _status: 'Ready',
  },

  // Identity Documents
  {
    id: 'rec-004',
    type: 'IdentityDocument',
    summary: 'Passport - John Smith',
    properties: {
      document_type: 'Passport',
      full_name: 'John Michael Smith',
      date_of_birth: '1985-03-15',
      nationality: 'United States',
      passport_number: 'P123456789',
      issue_date: '2022-06-01',
      expiry_date: '2032-05-31',
      issuing_authority: 'U.S. Department of State',
    },
    tags: ['passport', 'identity', 'travel-document'],
    created_at: '2024-10-05T16:45:00Z',
    updated_at: '2024-10-05T16:45:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/passport-smith.jpg'],
    _status: 'Ready',
  },
  {
    id: 'rec-005',
    type: 'IdentityDocument',
    summary: 'Driver License - John Smith',
    properties: {
      document_type: 'Driver License',
      full_name: 'John Michael Smith',
      date_of_birth: '1985-03-15',
      license_number: 'DL-CA-9876543',
      issue_date: '2023-03-20',
      expiry_date: '2028-03-15',
      issuing_authority: 'California DMV',
      address: '123 Main Street, San Francisco, CA 94102',
    },
    tags: ['driver-license', 'identity', 'california'],
    created_at: '2024-10-05T16:50:00Z',
    updated_at: '2024-10-05T16:50:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/drivers-license-smith.jpg'],
    _status: 'Ready',
  },

  // Travel Documents
  {
    id: 'rec-006',
    type: 'TravelDocument',
    summary: 'Flight Booking - SF to NYC',
    properties: {
      booking_reference: 'ABC123XYZ',
      passenger_name: 'John Michael Smith',
      departure_airport: 'SFO',
      arrival_airport: 'JFK',
      departure_date: '2024-12-15',
      departure_time: '08:30',
      arrival_date: '2024-12-15',
      arrival_time: '17:15',
      airline: 'United Airlines',
      flight_number: 'UA1234',
      seat: '12A',
      booking_class: 'Economy Plus',
    },
    tags: ['flight', 'travel', 'december-2024'],
    created_at: '2024-11-10T09:15:00Z',
    updated_at: '2024-11-10T09:15:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/flight-booking-sf-nyc.pdf'],
    _status: 'Ready',
  },
  {
    id: 'rec-007',
    type: 'TravelDocument',
    summary: 'Hotel Reservation - The Plaza NYC',
    properties: {
      confirmation_number: 'HTL-98765',
      guest_name: 'John Michael Smith',
      hotel_name: 'The Plaza Hotel',
      address: '768 5th Avenue, New York, NY 10019',
      check_in_date: '2024-12-15',
      check_out_date: '2024-12-18',
      room_type: 'Deluxe King',
      nightly_rate: 450.00,
      total_cost: 1350.00,
      currency: 'USD',
    },
    tags: ['hotel', 'travel', 'new-york', 'december-2024'],
    created_at: '2024-11-10T09:30:00Z',
    updated_at: '2024-11-10T09:30:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/hotel-plaza-nyc.pdf'],
    _status: 'Ready',
  },

  // Medical Records
  {
    id: 'rec-008',
    type: 'MedicalRecord',
    summary: 'Lab Results - Annual Physical 2024',
    properties: {
      patient_name: 'John Michael Smith',
      date_of_service: '2024-10-20',
      provider: 'Dr. Sarah Johnson',
      facility: 'City Medical Center',
      test_type: 'Annual Physical - Blood Panel',
      results_summary: 'All results within normal range',
    },
    tags: ['medical', 'lab-results', 'annual-physical'],
    created_at: '2024-10-25T11:00:00Z',
    updated_at: '2024-10-25T11:00:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/lab-results-2024.pdf'],
    _status: 'Ready',
  },

  // Contracts and Legal
  {
    id: 'rec-009',
    type: 'LegalDocument',
    summary: 'Lease Agreement - 123 Main St',
    properties: {
      document_type: 'Lease Agreement',
      parties: ['John Michael Smith', 'Property Management LLC'],
      property_address: '123 Main Street, San Francisco, CA 94102',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      monthly_rent: 3200.00,
      currency: 'USD',
      security_deposit: 6400.00,
    },
    tags: ['lease', 'contract', 'housing'],
    created_at: '2023-12-15T10:00:00Z',
    updated_at: '2023-12-15T10:00:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/lease-agreement-2024.pdf'],
    _status: 'Ready',
  },
  {
    id: 'rec-010',
    type: 'LegalDocument',
    summary: 'Service Agreement - Acme Corp',
    properties: {
      document_type: 'Service Agreement',
      parties: ['John Smith Consulting LLC', 'Acme Corporation'],
      effective_date: '2024-01-01',
      termination_date: '2024-12-31',
      service_description: 'Technical Consulting Services',
      payment_terms: 'Net 30',
      hourly_rate: 175.00,
      currency: 'USD',
    },
    tags: ['contract', 'consulting', 'service-agreement'],
    created_at: '2023-12-20T14:30:00Z',
    updated_at: '2023-12-20T14:30:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/service-agreement-acme.pdf'],
    _status: 'Ready',
  },

  // Insurance Documents
  {
    id: 'rec-011',
    type: 'InsuranceDocument',
    summary: 'Health Insurance Policy - 2024',
    properties: {
      policy_type: 'Health Insurance',
      policy_number: 'HI-2024-567890',
      policyholder: 'John Michael Smith',
      provider: 'Blue Cross Blue Shield',
      effective_date: '2024-01-01',
      renewal_date: '2024-12-31',
      premium_monthly: 650.00,
      deductible: 2500.00,
      coverage_type: 'PPO - Platinum Plan',
    },
    tags: ['insurance', 'health', '2024-policy'],
    created_at: '2023-12-28T09:00:00Z',
    updated_at: '2023-12-28T09:00:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/health-insurance-2024.pdf'],
    _status: 'Ready',
  },

  // Tax Documents
  {
    id: 'rec-012',
    type: 'TaxDocument',
    summary: '1099-NEC 2023 - Acme Corp',
    properties: {
      form_type: '1099-NEC',
      tax_year: '2023',
      payer_name: 'Acme Corporation',
      payer_ein: '12-3456789',
      recipient_name: 'John Smith',
      recipient_ssn: 'XXX-XX-1234',
      nonemployee_compensation: 89500.00,
    },
    tags: ['tax', '1099', '2023', 'income'],
    created_at: '2024-01-31T16:00:00Z',
    updated_at: '2024-01-31T16:00:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/1099-nec-2023-acme.pdf'],
    _status: 'Ready',
  },

  // Education Documents
  {
    id: 'rec-013',
    type: 'EducationDocument',
    summary: 'MBA Diploma - Stanford University',
    properties: {
      document_type: 'Diploma',
      institution: 'Stanford University',
      degree: 'Master of Business Administration',
      field_of_study: 'Technology Management',
      recipient: 'John Michael Smith',
      graduation_date: '2010-06-15',
      honors: 'With Distinction',
    },
    tags: ['education', 'degree', 'mba', 'stanford'],
    created_at: '2024-09-10T12:00:00Z',
    updated_at: '2024-09-10T12:00:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/mba-diploma-stanford.pdf'],
    _status: 'Ready',
  },

  // Utility Bills
  {
    id: 'rec-014',
    type: 'UtilityBill',
    summary: 'Electricity Bill - November 2024',
    properties: {
      utility_type: 'Electricity',
      provider: 'Pacific Gas & Electric',
      account_number: 'PGE-123456789',
      service_address: '123 Main Street, San Francisco, CA 94102',
      billing_period: '2024-11-01 to 2024-11-30',
      usage_kwh: 420,
      amount_due: 168.50,
      due_date: '2024-12-15',
      currency: 'USD',
    },
    tags: ['utility', 'electricity', 'november-2024'],
    created_at: '2024-12-01T06:00:00Z',
    updated_at: '2024-12-01T06:00:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/electricity-bill-nov-2024.pdf'],
    _status: 'Ready',
  },

  // Vehicle Documents
  {
    id: 'rec-015',
    type: 'VehicleDocument',
    summary: 'Vehicle Registration - Tesla Model 3',
    properties: {
      document_type: 'Vehicle Registration',
      vehicle_make: 'Tesla',
      vehicle_model: 'Model 3',
      vehicle_year: '2023',
      vin: '5YJ3E1EA1PF123456',
      license_plate: 'ABC1234',
      owner_name: 'John Michael Smith',
      registration_expiry: '2025-03-31',
      issuing_state: 'California',
    },
    tags: ['vehicle', 'registration', 'tesla'],
    created_at: '2024-04-01T10:00:00Z',
    updated_at: '2024-04-01T10:00:00Z',
    user_id: 'user-demo',
    file_urls: ['/fixtures/vehicle-registration-tesla.pdf'],
    _status: 'Ready',
  },
];

/**
 * Get records filtered by type
 */
export function getRecordsByType(type: string): NeotomaRecord[] {
  return FIXTURE_RECORDS.filter(record => record.type === type);
}

/**
 * Get all unique record types
 */
export function getRecordTypes(): string[] {
  return Array.from(new Set(FIXTURE_RECORDS.map(r => r.type))).sort();
}

/**
 * Get a single record by ID
 */
export function getRecordById(id: string): NeotomaRecord | undefined {
  return FIXTURE_RECORDS.find(record => record.id === id);
}








