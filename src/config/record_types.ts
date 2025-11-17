export type RecordTypeCategory = 'finance' | 'productivity' | 'knowledge' | 'health' | 'media';

export interface RecordTypeDefinition {
  id: string;
  label: string;
  description: string;
  category: RecordTypeCategory;
  primaryProperties: string[];
  aliases?: string[];
}

export type RecordTypeMatch = 'canonical' | 'alias' | 'custom' | 'default';

const definitions: ReadonlyArray<RecordTypeDefinition> = [
  {
    id: 'account',
    label: 'Account',
    description: 'Financial account snapshots (bank, brokerage, wallet).',
    category: 'finance',
    primaryProperties: ['external_id', 'institution', 'balance', 'currency', 'status'],
    aliases: ['bank_account', 'wallet', 'ledger_account'],
  },
  {
    id: 'transaction',
    label: 'Transaction',
    description: 'Individual debits/credits pulled from Plaid or uploads.',
    category: 'finance',
    primaryProperties: ['amount', 'currency', 'date', 'merchant_name', 'status', 'account_id'],
    aliases: ['transactions', 'txn', 'expense', 'purchase', 'payment'],
  },
  {
    id: 'invoice',
    label: 'Invoice',
    description: 'Money owed to you or vendors.',
    category: 'finance',
    primaryProperties: ['invoice_number', 'amount_due', 'due_date', 'vendor', 'status'],
    aliases: ['bill'],
  },
  {
    id: 'receipt',
    label: 'Receipt',
    description: 'Proof-of-purchase documents.',
    category: 'finance',
    primaryProperties: ['receipt_number', 'amount_total', 'date', 'merchant_name', 'currency'],
    aliases: ['proof_of_purchase'],
  },
  {
    id: 'statement',
    label: 'Statement',
    description: 'Periodic statements (bank, credit, utilities).',
    category: 'finance',
    primaryProperties: ['statement_period_start', 'statement_period_end', 'balance', 'institution'],
    aliases: ['bank_statement'],
  },
  {
    id: 'budget',
    label: 'Budget',
    description: 'Planned vs actual spend for a window/category.',
    category: 'finance',
    primaryProperties: ['period', 'category', 'amount_limit', 'amount_spent', 'currency'],
    aliases: ['spending_plan'],
  },
  {
    id: 'subscription',
    label: 'Subscription',
    description: 'Recurring payment agreements.',
    category: 'finance',
    primaryProperties: ['provider', 'plan_name', 'amount', 'currency', 'renewal_date', 'status'],
    aliases: ['membership', 'recurring_payment'],
  },
  {
    id: 'note',
    label: 'Note',
    description: 'Free-form text, journals, scratchpads.',
    category: 'productivity',
    primaryProperties: ['title', 'content', 'tags', 'source', 'summary'],
    aliases: ['journal', 'memo'],
  },
  {
    id: 'document',
    label: 'Document',
    description: 'Structured files, specs, PDFs, knowledge assets.',
    category: 'knowledge',
    primaryProperties: ['title', 'summary', 'source', 'tags', 'link'],
    aliases: ['doc', 'file', 'pdf'],
  },
  {
    id: 'message',
    label: 'Message',
    description: 'Emails, DMs, chat transcripts.',
    category: 'knowledge',
    primaryProperties: ['channel', 'sender', 'recipient', 'subject', 'body'],
    aliases: ['email', 'dm', 'sms'],
  },
  {
    id: 'task',
    label: 'Task',
    description: 'Action items with status.',
    category: 'productivity',
    primaryProperties: ['title', 'status', 'due_date', 'assignee', 'priority'],
    aliases: ['todo', 'action_item'],
  },
  {
    id: 'project',
    label: 'Project',
    description: 'Multi-step initiatives.',
    category: 'productivity',
    primaryProperties: ['name', 'status', 'owner', 'start_date', 'due_date'],
    aliases: ['initiative', 'program'],
  },
  {
    id: 'goal',
    label: 'Goal',
    description: 'Outcome targets or OKRs.',
    category: 'productivity',
    primaryProperties: ['name', 'metric', 'target_value', 'deadline', 'category'],
    aliases: ['objective', 'okr'],
  },
  {
    id: 'event',
    label: 'Event',
    description: 'Meetings, appointments, scheduled interactions.',
    category: 'productivity',
    primaryProperties: ['title', 'start_time', 'end_time', 'location', 'attendees'],
    aliases: ['meeting', 'appointment', 'calendar_event'],
  },
  {
    id: 'contact',
    label: 'Contact',
    description: 'People and organization records.',
    category: 'knowledge',
    primaryProperties: ['name', 'email', 'phone', 'organization', 'role'],
    aliases: ['person', 'lead'],
  },
  {
    id: 'exercise',
    label: 'Exercise',
    description: 'Single workout sessions or sets.',
    category: 'health',
    primaryProperties: ['name', 'duration', 'intensity', 'muscle_group', 'sets', 'reps'],
    aliases: ['workout', 'training_session'],
  },
  {
    id: 'measurement',
    label: 'Measurement',
    description: 'Biometrics and quantitative stats.',
    category: 'health',
    primaryProperties: ['metric', 'value', 'unit', 'recorded_at', 'context'],
    aliases: ['biometric', 'stat'],
  },
  {
    id: 'meal',
    label: 'Meal',
    description: 'Food logs and nutrition captures.',
    category: 'health',
    primaryProperties: ['name', 'calories', 'macros', 'consumed_at', 'items'],
    aliases: ['food_log', 'nutrition'],
  },
  {
    id: 'sleep_session',
    label: 'Sleep Session',
    description: 'Bedtime tracking entries.',
    category: 'health',
    primaryProperties: ['start_time', 'end_time', 'duration', 'quality', 'notes'],
    aliases: ['sleep', 'rest'],
  },
  {
    id: 'file_asset',
    label: 'File Asset',
    description: 'Generic uploaded assets (images, videos, binaries).',
    category: 'media',
    primaryProperties: ['file_name', 'mime_type', 'size', 'checksum', 'source'],
    aliases: ['file', 'attachment', 'asset'],
  },
  {
    id: 'dataset',
    label: 'Dataset',
    description: 'Tabular datasets produced from CSV or spreadsheet uploads.',
    category: 'knowledge',
    primaryProperties: ['row_count', 'source_file', 'summary'],
    aliases: ['csv', 'spreadsheet', 'table', 'dataset_file'],
  },
  {
    id: 'dataset_row',
    label: 'Dataset Row',
    description: 'Single row derived from a dataset upload.',
    category: 'knowledge',
    primaryProperties: ['csv_origin', 'row_index', 'source_file'],
    aliases: ['table_row', 'csv_row'],
  },
] as const;

type AliasMap = Map<string, RecordTypeDefinition>;

const aliasMap: AliasMap = definitions.reduce((map, definition) => {
  map.set(definition.id.toLowerCase(), definition);
  (definition.aliases || []).forEach(alias => {
    map.set(alias.toLowerCase(), definition);
  });
  return map;
}, new Map<string, RecordTypeDefinition>());

export interface RecordTypeResolution {
  type: string;
  match: RecordTypeMatch;
  definition?: RecordTypeDefinition;
  alias?: string;
}

function sanitizeCustomType(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

export function listCanonicalRecordTypes(): ReadonlyArray<RecordTypeDefinition> {
  return definitions;
}

export function normalizeRecordType(input?: string | null): RecordTypeResolution {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { type: 'unknown', match: 'default' };
  }

  const lower = trimmed.toLowerCase();
  const canonical = aliasMap.get(lower);
  if (canonical) {
    return {
      type: canonical.id,
      match: lower === canonical.id ? 'canonical' : 'alias',
      definition: canonical,
      alias: lower === canonical.id ? undefined : trimmed,
    };
  }

  const sanitized = sanitizeCustomType(trimmed);
  if (!sanitized) {
    return { type: 'unknown', match: 'default' };
  }

  return { type: sanitized, match: 'custom' };
}

export function isCanonicalRecordType(type: string): boolean {
  return aliasMap.get(type.toLowerCase())?.id === type;
}


