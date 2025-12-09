/**
 * Static entity fixtures for MVP prototype
 * Entities are extracted from records and represent real-world things:
 * - People
 * - Companies
 * - Locations
 * - Events
 */

export interface Entity {
  id: string;
  type: 'Person' | 'Company' | 'Location' | 'Event' | 'Product';
  name: string;
  canonical_name: string;
  properties: Record<string, any>;
  related_records: string[]; // Record IDs
  created_at: string;
  updated_at: string;
}

export const FIXTURE_ENTITIES: Entity[] = [
  // People
  {
    id: 'ent-person-001',
    type: 'Person',
    name: 'John Michael Smith',
    canonical_name: 'john michael smith',
    properties: {
      date_of_birth: '1985-03-15',
      nationality: 'United States',
      roles: ['Customer', 'Consultant', 'Traveler'],
    },
    related_records: ['rec-004', 'rec-005', 'rec-006', 'rec-007', 'rec-008', 'rec-009', 'rec-010', 'rec-011', 'rec-012', 'rec-013', 'rec-014', 'rec-015'],
    created_at: '2024-10-05T16:45:00Z',
    updated_at: '2024-12-01T08:00:00Z',
  },
  {
    id: 'ent-person-002',
    type: 'Person',
    name: 'Dr. Sarah Johnson',
    canonical_name: 'dr sarah johnson',
    properties: {
      profession: 'Medical Doctor',
      specialization: 'Internal Medicine',
      roles: ['Healthcare Provider'],
    },
    related_records: ['rec-008'],
    created_at: '2024-10-25T11:00:00Z',
    updated_at: '2024-10-25T11:00:00Z',
  },

  // Companies
  {
    id: 'ent-company-001',
    type: 'Company',
    name: 'Acme Corporation',
    canonical_name: 'acme corporation',
    properties: {
      industry: 'Technology Consulting',
      business_type: 'Client',
      ein: '12-3456789',
      relationships: ['Service Provider', 'Client'],
    },
    related_records: ['rec-001', 'rec-010', 'rec-012'],
    created_at: '2024-11-15T10:30:00Z',
    updated_at: '2024-11-15T10:30:00Z',
  },
  {
    id: 'ent-company-002',
    type: 'Company',
    name: 'TechSupply Inc',
    canonical_name: 'techsupply inc',
    properties: {
      industry: 'Technology Equipment',
      business_type: 'Vendor',
      relationships: ['Supplier'],
    },
    related_records: ['rec-002'],
    created_at: '2024-11-20T14:22:00Z',
    updated_at: '2024-11-20T14:22:00Z',
  },
  {
    id: 'ent-company-003',
    type: 'Company',
    name: 'First National Bank',
    canonical_name: 'first national bank',
    properties: {
      industry: 'Banking',
      business_type: 'Financial Institution',
      relationships: ['Bank'],
    },
    related_records: ['rec-003'],
    created_at: '2024-12-01T08:00:00Z',
    updated_at: '2024-12-01T08:00:00Z',
  },
  {
    id: 'ent-company-004',
    type: 'Company',
    name: 'United Airlines',
    canonical_name: 'united airlines',
    properties: {
      industry: 'Air Transportation',
      business_type: 'Airline',
      relationships: ['Service Provider'],
    },
    related_records: ['rec-006'],
    created_at: '2024-11-10T09:15:00Z',
    updated_at: '2024-11-10T09:15:00Z',
  },
  {
    id: 'ent-company-005',
    type: 'Company',
    name: 'Property Management LLC',
    canonical_name: 'property management llc',
    properties: {
      industry: 'Real Estate Management',
      business_type: 'Property Manager',
      relationships: ['Landlord'],
    },
    related_records: ['rec-009'],
    created_at: '2023-12-15T10:00:00Z',
    updated_at: '2023-12-15T10:00:00Z',
  },
  {
    id: 'ent-company-006',
    type: 'Company',
    name: 'Blue Cross Blue Shield',
    canonical_name: 'blue cross blue shield',
    properties: {
      industry: 'Health Insurance',
      business_type: 'Insurance Provider',
      relationships: ['Insurer'],
    },
    related_records: ['rec-011'],
    created_at: '2023-12-28T09:00:00Z',
    updated_at: '2023-12-28T09:00:00Z',
  },
  {
    id: 'ent-company-007',
    type: 'Company',
    name: 'Pacific Gas & Electric',
    canonical_name: 'pacific gas electric',
    properties: {
      industry: 'Utilities',
      business_type: 'Utility Provider',
      relationships: ['Service Provider'],
    },
    related_records: ['rec-014'],
    created_at: '2024-12-01T06:00:00Z',
    updated_at: '2024-12-01T06:00:00Z',
  },
  {
    id: 'ent-company-008',
    type: 'Company',
    name: 'City Medical Center',
    canonical_name: 'city medical center',
    properties: {
      industry: 'Healthcare',
      business_type: 'Medical Facility',
      relationships: ['Healthcare Provider'],
    },
    related_records: ['rec-008'],
    created_at: '2024-10-25T11:00:00Z',
    updated_at: '2024-10-25T11:00:00Z',
  },

  // Locations
  {
    id: 'ent-location-001',
    type: 'Location',
    name: 'San Francisco, CA',
    canonical_name: 'san francisco ca',
    properties: {
      city: 'San Francisco',
      state: 'California',
      country: 'United States',
      type: 'City',
    },
    related_records: ['rec-005', 'rec-006', 'rec-009', 'rec-014'],
    created_at: '2024-10-05T16:50:00Z',
    updated_at: '2024-12-01T06:00:00Z',
  },
  {
    id: 'ent-location-002',
    type: 'Location',
    name: 'New York, NY',
    canonical_name: 'new york ny',
    properties: {
      city: 'New York',
      state: 'New York',
      country: 'United States',
      type: 'City',
    },
    related_records: ['rec-006', 'rec-007'],
    created_at: '2024-11-10T09:15:00Z',
    updated_at: '2024-11-10T09:30:00Z',
  },
  {
    id: 'ent-location-003',
    type: 'Location',
    name: 'SFO Airport',
    canonical_name: 'sfo airport',
    properties: {
      full_name: 'San Francisco International Airport',
      code: 'SFO',
      city: 'San Francisco',
      state: 'California',
      type: 'Airport',
    },
    related_records: ['rec-006'],
    created_at: '2024-11-10T09:15:00Z',
    updated_at: '2024-11-10T09:15:00Z',
  },
  {
    id: 'ent-location-004',
    type: 'Location',
    name: 'JFK Airport',
    canonical_name: 'jfk airport',
    properties: {
      full_name: 'John F. Kennedy International Airport',
      code: 'JFK',
      city: 'New York',
      state: 'New York',
      type: 'Airport',
    },
    related_records: ['rec-006'],
    created_at: '2024-11-10T09:15:00Z',
    updated_at: '2024-11-10T09:15:00Z',
  },
  {
    id: 'ent-location-005',
    type: 'Location',
    name: 'The Plaza Hotel',
    canonical_name: 'the plaza hotel',
    properties: {
      full_name: 'The Plaza Hotel',
      address: '768 5th Avenue, New York, NY 10019',
      city: 'New York',
      state: 'New York',
      type: 'Hotel',
    },
    related_records: ['rec-007'],
    created_at: '2024-11-10T09:30:00Z',
    updated_at: '2024-11-10T09:30:00Z',
  },
  {
    id: 'ent-location-006',
    type: 'Location',
    name: 'Stanford University',
    canonical_name: 'stanford university',
    properties: {
      full_name: 'Stanford University',
      city: 'Stanford',
      state: 'California',
      type: 'Educational Institution',
    },
    related_records: ['rec-013'],
    created_at: '2024-09-10T12:00:00Z',
    updated_at: '2024-09-10T12:00:00Z',
  },

  // Products/Vehicles
  {
    id: 'ent-product-001',
    type: 'Product',
    name: 'Tesla Model 3 (VIN: 5YJ3E1EA1PF123456)',
    canonical_name: 'tesla model 3 5yj3e1ea1pf123456',
    properties: {
      make: 'Tesla',
      model: 'Model 3',
      year: '2023',
      vin: '5YJ3E1EA1PF123456',
      license_plate: 'ABC1234',
      type: 'Vehicle',
    },
    related_records: ['rec-015'],
    created_at: '2024-04-01T10:00:00Z',
    updated_at: '2024-04-01T10:00:00Z',
  },
];

/**
 * Get entities by type
 */
export function getEntitiesByType(type: Entity['type']): Entity[] {
  return FIXTURE_ENTITIES.filter(entity => entity.type === type);
}

/**
 * Get entities related to a specific record
 */
export function getEntitiesForRecord(recordId: string): Entity[] {
  return FIXTURE_ENTITIES.filter(entity => 
    entity.related_records.includes(recordId)
  );
}

/**
 * Get entity by ID
 */
export function getEntityById(id: string): Entity | undefined {
  return FIXTURE_ENTITIES.find(entity => entity.id === id);
}







