/**
 * Rule-Based Extraction Rules (FU-100)
 *
 * Deterministic schema detection and field extraction using regex patterns.
 */

/**
 * Schema detection patterns (multi-pattern matching - requires 2+ matches)
 */
export const SCHEMA_DETECTION_PATTERNS: Record<string, RegExp[]> = {
  invoice: [
    /invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /bill\s*to:/i,
    /amount\s*due:/i,
    /invoice\s*date/i,
    /payment\s*terms/i,
    /vendor|seller|from:/i,
    /customer|buyer|bill\s*to/i,
  ],
  receipt: [
    /receipt/i,
    /thank\s*you\s*for\s*your\s*purchase/i,
    /items?\s*purchased/i,
    /total\s*amount/i,
    /payment\s*method/i,
    /merchant|store/i,
    /transaction\s*date/i,
  ],
  transaction: [
    /transaction/i,
    /debit|credit/i,
    /account\s*number/i,
    /balance/i,
    /posted\s*date/i,
    /transaction\s*id/i,
    /amount/i,
  ],
  statement: [
    /statement/i,
    /account\s*summary/i,
    /period\s*from|statement\s*period/i,
    /beginning\s*balance/i,
    /ending\s*balance/i,
    /account\s*balance/i,
    /statement\s*date/i,
  ],
  contract: [
    /agreement|contract/i,
    /parties|between/i,
    /effective\s*date/i,
    /terms\s*and\s*conditions/i,
    /signature/i,
    /this\s*agreement/i,
    /whereas/i,
  ],
  travel_document: [
    /itinerary|booking|reservation/i,
    /departure|arrival/i,
    /flight|train|hotel/i,
    /confirmation\s*number/i,
    /passenger|guest/i,
    /check-in|check\s*in/i,
    /check-out|check\s*out/i,
  ],
  identity_document: [
    /passport|driver.*license|national.*id/i,
    /document\s*number/i,
    /date\s*of\s*issue|issued/i,
    /expiry|expires/i,
    /nationality|country\s*of\s*issue/i,
    /date\s*of\s*birth/i,
    /full\s*name/i,
  ],
  message: [
    /from:/i,
    /to:/i,
    /subject:/i,
    /sent:/i,
    /reply|forward/i,
    /message\s*id/i,
    /cc:|bcc:/i,
  ],
  note: [/note|memo/i, /created\s*at|date/i, /tags?:/i, /content|body/i],
  contact: [
    /contact|person/i,
    /email\s*address/i,
    /phone\s*number/i,
    /address|location/i,
    /name|full\s*name/i,
  ],
  task: [
    /task|todo/i,
    /due\s*date|deadline/i,
    /status|completed/i,
    /priority/i,
    /assignee/i,
  ],
  project: [
    /project/i,
    /status|phase/i,
    /start\s*date|end\s*date/i,
    /team|members/i,
    /milestone/i,
  ],
  event: [
    /event/i,
    /date|time|datetime/i,
    /location|venue/i,
    /attendees|guests/i,
    /description/i,
  ],
  dataset: [/dataset|data/i, /rows?|columns?/i, /csv|json|table/i, /header/i],
  account: [
    /account/i,
    /account\s*number/i,
    /routing\s*number/i,
    /bank|financial/i,
    /balance/i,
  ],
};

/**
 * Field extraction patterns per schema type
 */
export const FIELD_EXTRACTION_PATTERNS: Record<
  string,
  Record<string, RegExp>
> = {
  invoice: {
    invoice_number: /invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    amount_due: /(?:amount\s*due|total|amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency: /\$|USD|EUR|GBP|([A-Z]{3})\b/,
    date_issued:
      /(?:invoice\s*date|date\s*issued|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    date_due:
      /(?:due\s*date|payment\s*due|payable\s*by)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    vendor_name:
      /(?:from|vendor|seller|company)[\s:]*([A-Za-z0-9\s&.,'-]+?)(?:\n|$|amount|date|invoice)/i,
    customer_name:
      /(?:bill\s*to|customer|buyer)[\s:]*([A-Za-z0-9\s&.,'-]+?)(?:\n|$|amount|date|invoice)/i,
  },
  receipt: {
    receipt_number: /receipt\s*(?:#|number)?\s*:?\s*([A-Z0-9-]+)/i,
    amount_total: /(?:total|amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency: /\$|USD|EUR|GBP|([A-Z]{3})\b/,
    date_purchased:
      /(?:date|transaction\s*date|purchase\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    merchant_name:
      /(?:merchant|store|vendor)[\s:]*([A-Za-z0-9\s&.,'-]+?)(?:\n|$|amount|date|total)/i,
    payment_method: /(?:payment\s*method|paid\s*with)[\s:]*([A-Za-z\s]+)/i,
  },
  transaction: {
    transaction_id: /transaction\s*(?:#|id)?\s*:?\s*([A-Z0-9-]+)/i,
    amount: /(?:amount|transaction\s*amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency: /\$|USD|EUR|GBP|([A-Z]{3})\b/,
    date: /(?:date|transaction\s*date|posted\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    account_number: /account\s*(?:#|number)?\s*:?\s*([\d-]+)/i,
    merchant_name:
      /(?:merchant|description)[\s:]*([A-Za-z0-9\s&.,'-]+?)(?:\n|$|amount|date)/i,
    transaction_type: /(?:type|transaction\s*type)[\s:]*([a-z]+)/i,
  },
  contract: {
    contract_number: /contract\s*(?:#|number)?\s*:?\s*([A-Z0-9-]+)/i,
    effective_date:
      /(?:effective\s*date|date\s*effective)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    expiration_date:
      /(?:expiration|expiry|expires|end\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    parties:
      /(?:between|parties)[\s:]*([A-Za-z0-9\s&.,'-]+?)(?:\n|$|and|effective)/i,
  },
  travel_document: {
    confirmation_number:
      /(?:confirmation|booking|reference)\s*(?:#|number)?\s*:?\s*([A-Z0-9-]+)/i,
    departure_datetime:
      /(?:departure|departs)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s+\d{1,2}:\d{2}|\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2})/i,
    arrival_datetime:
      /(?:arrival|arrives)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s+\d{1,2}:\d{2}|\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2})/i,
    airline: /(?:airline|carrier)[\s:]*([A-Za-z\s]+)/i,
    passenger_name: /(?:passenger|name)[\s:]*([A-Za-z\s'-]+)/i,
  },
  identity_document: {
    document_number:
      /(?:document|passport|license)\s*(?:#|number)?\s*:?\s*([A-Z0-9-]+)/i,
    full_name: /(?:full\s*name|name)[\s:]*([A-Za-z\s'-]+)/i,
    date_of_birth:
      /(?:date\s*of\s*birth|dob|born)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    issue_date:
      /(?:date\s*of\s*issue|issued)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    expiration_date:
      /(?:expiration|expiry|expires)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    nationality: /(?:nationality|country)[\s:]*([A-Za-z\s]+)/i,
  },
  message: {
    sender: /(?:from|sender)[\s:]*([^\n]+)/i,
    recipient: /(?:to|recipient)[\s:]*([^\n]+)/i,
    subject: /(?:subject)[\s:]*([^\n]+)/i,
    sent_at:
      /(?:sent|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
  },
  note: {
    title: /(?:title|heading)[\s:]*([^\n]+)/i,
    content: /(?:content|body|text)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
    tags: /(?:tags|tag)[\s:]*([^\n]+)/i,
  },
  contact: {
    full_name: /(?:name|full\s*name)[\s:]*([A-Za-z\s'-]+)/i,
    email: /(?:email)[\s:]*([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    phone: /(?:phone|tel)[\s:]*([\d\s\-\(\)]+)/i,
    address: /(?:address)[\s:]*([^\n]+)/i,
  },
};

/**
 * Detect schema type using multi-pattern matching (requires 2+ matches)
 */
export function detectSchemaType(rawText: string, fileName?: string): string {
  if (!rawText || !rawText.trim()) {
    return "document";
  }

  const text = rawText.toLowerCase();
  const matchCounts: Record<string, number> = {};

  // Count pattern matches for each type
  for (const [type, patterns] of Object.entries(SCHEMA_DETECTION_PATTERNS)) {
    matchCounts[type] = patterns.filter((pattern) =>
      pattern.test(rawText)
    ).length;
  }

  // Check filename patterns as additional signal
  if (fileName) {
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.includes("invoice"))
      matchCounts.invoice = (matchCounts.invoice || 0) + 1;
    if (lowerFileName.includes("receipt"))
      matchCounts.receipt = (matchCounts.receipt || 0) + 1;
    if (lowerFileName.includes("statement"))
      matchCounts.statement = (matchCounts.statement || 0) + 1;
    if (lowerFileName.includes("contract"))
      matchCounts.contract = (matchCounts.contract || 0) + 1;
  }

  // Find types with 2+ matches
  const candidates = Object.entries(matchCounts)
    .filter(([_, count]) => count >= 2)
    .sort(([_, countA], [__, countB]) => countB - countA);

  // Return type with most matches, or fallback to 'document'
  if (candidates.length > 0) {
    return candidates[0][0];
  }

  return "document"; // Generic fallback
}

/**
 * Extract fields for a schema type
 */
export function extractFields(
  schemaType: string,
  rawText: string
): Record<string, unknown> {
  const patterns = FIELD_EXTRACTION_PATTERNS[schemaType];
  if (!patterns) {
    return {};
  }

  const fields: Record<string, unknown> = {
    schema_version: "1.0",
  };

  // Extract each field
  for (const [fieldName, pattern] of Object.entries(patterns)) {
    const match = rawText.match(pattern);
    if (match) {
      let value: unknown = match[1] || match[0];

      // Clean up extracted values
      if (typeof value === "string") {
        value = value.trim();

        // Convert numeric fields
        if (
          fieldName.includes("amount") ||
          fieldName.includes("balance") ||
          fieldName.includes("total")
        ) {
          const numValue = parseFloat(String(value).replace(/[,$]/g, ""));
          if (!isNaN(numValue)) {
            value = numValue;
          }
        }

        // Normalize dates
        if (fieldName.includes("date") || fieldName.includes("datetime")) {
          value = normalizeDate(value as string);
        }
      }

      if (value !== null && value !== undefined && value !== "") {
        fields[fieldName] = value;
      }
    }
  }

  return fields;
}

/**
 * Normalize date string to ISO 8601 format
 */
function normalizeDate(dateStr: string): string {
  // Try common formats
  const formats = [
    /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/, // YYYY-MM-DD
    /(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/, // MM-DD-YYYY or DD-MM-YYYY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch {
        // Continue to next format
      }
    }
  }

  // Return as-is if can't parse
  return dateStr;
}

/**
 * Generate summary from extracted fields (deterministic)
 */
export function generateSummary(
  schemaType: string,
  fields: Record<string, unknown>,
  fileName?: string
): string {
  const parts: string[] = [];

  if (schemaType === "invoice") {
    const invoiceNum = fields.invoice_number;
    const amount = fields.amount_due;
    const vendor = fields.vendor_name;
    if (invoiceNum) parts.push(`Invoice ${invoiceNum}`);
    if (vendor) parts.push(`from ${vendor}`);
    if (amount) parts.push(`for $${amount}`);
  } else if (schemaType === "receipt") {
    const merchant = fields.merchant_name;
    const amount = fields.amount_total;
    if (merchant) parts.push(`Receipt from ${merchant}`);
    if (amount) parts.push(`for $${amount}`);
  } else if (schemaType === "contract") {
    const contractNum = fields.contract_number;
    const parties = fields.parties;
    if (contractNum) parts.push(`Contract ${contractNum}`);
    if (parties) parts.push(`between ${parties}`);
  } else if (fileName) {
    parts.push(`Document: ${fileName}`);
  } else {
    parts.push(`${schemaType} document`);
  }

  if (parts.length === 0) {
    return `${schemaType} document`;
  }

  return parts.join(" ");
}

