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
    /posted\s*date|posting\s*date/i,
    /transaction\s*id/i,
    /amount/i,
    /category/i,
    /bank\s*provider/i,
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
    /wallet/i,
    /institution/i,
  ],
  holding: [
    /holding|portfolio|position/i,
    /asset\s*symbol|ticker/i,
    /quantity|shares|units/i,
    /cost\s*basis/i,
    /current\s*value/i,
    /snapshot\s*date/i,
  ],
  income: [
    /income|earnings|revenue/i,
    /income\s*date/i,
    /income\s*type/i,
    /source/i,
    /tax\s*year/i,
    /amount/i,
  ],
  tax_event: [
    /tax\s*event|capital\s*gain|capital\s*loss/i,
    /event\s*date/i,
    /cost\s*basis/i,
    /proceeds/i,
    /gain|loss/i,
    /tax\s*year/i,
    /jurisdiction/i,
  ],
  crypto_transaction: [
    /crypto|blockchain|bitcoin|ethereum/i,
    /transaction\s*hash|tx\s*hash/i,
    /from\s*address|to\s*address/i,
    /wallet/i,
    /blockchain/i,
    /asset\s*symbol/i,
  ],
  liability: [
    /liability|debt|loan/i,
    /liability\s*type/i,
    /amount/i,
    /snapshot\s*date/i,
    /balance/i,
  ],
  flow: [
    /flow|cash\s*flow/i,
    /flow\s*name/i,
    /flow\s*date/i,
    /for\s*cash\s*flow/i,
    /party/i,
    /flow\s*type/i,
  ],
  purchase: [
    /purchase|buy|acquisition/i,
    /item\s*name/i,
    /status/i,
    /estimated\s*cost|actual\s*cost/i,
    /vendor/i,
    /priority/i,
  ],
  transfer: [
    /transfer/i,
    /origin\s*account|destination\s*account/i,
    /deposit\s*address/i,
    /fees/i,
    /transaction/i,
  ],
  wallet: [
    /wallet|financial\s*institution/i,
    /institution/i,
    /accounts/i,
    /categories/i,
    /status/i,
  ],
  tax_filing: [
    /tax\s*filing|tax\s*return/i,
    /jurisdiction/i,
    /year/i,
    /filed\s*date|due\s*date/i,
    /amount\s*owed|amount\s*paid/i,
    /status/i,
  ],
  order: [
    /order|trade\s*order/i,
    /order\s*type/i,
    /asset\s*type/i,
    /price/i,
    /status/i,
    /date/i,
  ],
  fixed_cost: [
    /fixed\s*cost|recurring\s*expense/i,
    /merchant/i,
    /expense\s*name/i,
    /frequency/i,
    /payment\s*amount/i,
    /status/i,
  ],
  property: [
    /property|real\s*estate/i,
    /address/i,
    /purchase\s*date/i,
    /purchase\s*price/i,
    /current\s*value/i,
    /type/i,
  ],
  balance: [
    /balance\s*snapshot|account\s*balance/i,
    /snapshot\s*date/i,
    /account\s*id/i,
    /balance/i,
    /currency/i,
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
    amount_original:
      /(?:original\s*amount|amount\s*original)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency: /\$|USD|EUR|GBP|([A-Z]{3})\b/,
    date: /(?:date|transaction\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    posting_date:
      /(?:posting\s*date|posted\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    account_number: /account\s*(?:#|number)?\s*:?\s*([\d-]+)/i,
    account_id: /account\s*id[:\s]*([A-Za-z0-9-]+)/i,
    merchant_name:
      /(?:merchant|description)[\s:]*([A-Za-z0-9\s&.,'-]+?)(?:\n|$|amount|date)/i,
    transaction_type: /(?:type|transaction\s*type)[\s:]*([a-z]+)/i,
    category: /(?:category)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    bank_provider: /(?:bank|provider)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
  },
  contract: {
    contract_number: /contract\s*(?:#|number)?\s*:?\s*([A-Z0-9-]+)/i,
    name: /(?:contract\s*name|title)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    effective_date:
      /(?:effective\s*date|date\s*effective)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    signed_date:
      /(?:signed\s*date|signature\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    expiration_date:
      /(?:expiration|expiry|expires|end\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    parties:
      /(?:between|parties)[\s:]*([A-Za-z0-9\s&.,'-]+?)(?:\n|$|and|effective)/i,
    companies: /(?:companies|parties)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    type: /(?:contract\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    files: /(?:files|attachments)[\s:]*([^\n]+)/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
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
    name: /(?:name|full\s*name)[\s:]*([A-Za-z\s'-]+)/i,
    email: /(?:email)[\s:]*([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    phone: /(?:phone|tel)[\s:]*([\d\s\-\(\)]+)/i,
    address: /(?:address|street\s*address)[\s:]*([^\n]+)/i,
    country: /(?:country)[\s:]*([A-Za-z\s]+)/i,
    website: /(?:website|url)[\s:]*([^\s]+)/i,
    contact_type: /(?:contact\s*type|type)[\s:]*([A-Za-z\s]+)/i,
    category: /(?:category|group)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    platform: /(?:platform|source)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
    first_contact_date:
      /(?:first\s*contact\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    last_contact_date:
      /(?:last\s*contact\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    created_date:
      /(?:created\s*date|date\s*created)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    updated_date:
      /(?:updated\s*date|date\s*updated)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
  },
  holding: {
    asset_symbol: /(?:asset\s*symbol|ticker|symbol)[\s:]*([A-Z0-9-]+)/i,
    asset_name: /(?:asset\s*name|name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    asset_type: /(?:asset\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    quantity: /(?:quantity|shares|units)[\s:]*([\d,]+\.?\d*)/i,
    cost_basis_usd: /(?:cost\s*basis)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    current_value_usd: /(?:current\s*value|value)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    snapshot_date:
      /(?:snapshot\s*date|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    account_id: /(?:account\s*id)[\s:]*([A-Za-z0-9-]+)/i,
    account_type: /(?:account\s*type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    provider: /(?:provider)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
  },
  income: {
    income_date:
      /(?:income\s*date|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    income_type: /(?:income\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    source: /(?:source)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    amount_usd: /(?:amount\s*usd|amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    amount_original:
      /(?:amount\s*original|original\s*amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency_original: /(?:currency)[\s:]*([A-Z]{3})/i,
    description: /(?:description|notes)[\s:]*([^\n]+)/i,
    entity: /(?:entity)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    tax_year: /(?:tax\s*year|year)[\s:]*(\d{4})/i,
  },
  tax_event: {
    event_date:
      /(?:event\s*date|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    event_type: /(?:event\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    asset_symbol: /(?:asset\s*symbol|symbol)[\s:]*([A-Z0-9-]+)/i,
    quantity: /(?:quantity|amount)[\s:]*([\d,]+\.?\d*)/i,
    cost_basis_usd: /(?:cost\s*basis)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    proceeds_usd: /(?:proceeds)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    gain_loss_usd: /(?:gain|loss)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    tax_year: /(?:tax\s*year|year)[\s:]*(\d{4})/i,
    jurisdiction: /(?:jurisdiction)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    description: /(?:description|notes)[\s:]*([^\n]+)/i,
  },
  crypto_transaction: {
    transaction_date:
      /(?:transaction\s*date|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    transaction_type: /(?:transaction\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    blockchain: /(?:blockchain|chain)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    from_address: /(?:from\s*address|from)[\s:]*([A-Za-z0-9]+)/i,
    to_address: /(?:to\s*address|to)[\s:]*([A-Za-z0-9]+)/i,
    asset_symbol: /(?:asset\s*symbol|symbol)[\s:]*([A-Z0-9-]+)/i,
    quantity: /(?:quantity|amount)[\s:]*([\d,]+\.?\d*)/i,
    value_usd: /(?:value\s*usd|value)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    fee_usd: /(?:fee)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    tx_hash: /(?:tx\s*hash|transaction\s*hash|hash)[\s:]*([A-Za-z0-9]+)/i,
    wallet_id: /(?:wallet\s*id)[\s:]*([A-Za-z0-9-]+)/i,
  },
  liability: {
    name: /(?:name|liability\s*name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    liability_type: /(?:liability\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    amount_usd: /(?:amount\s*usd|amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    amount_original:
      /(?:amount\s*original|original\s*amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency_original: /(?:currency)[\s:]*([A-Z]{3})/i,
    snapshot_date:
      /(?:snapshot\s*date|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  flow: {
    flow_name: /(?:flow\s*name|name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    flow_date:
      /(?:flow\s*date|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    year: /(?:year)[\s:]*(\d{4})/i,
    timeline: /(?:timeline)[\s:]*([^\n]+)/i,
    amount_usd: /(?:amount\s*usd|amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    amount_original:
      /(?:amount\s*original|original\s*amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency_original: /(?:currency)[\s:]*([A-Z]{3})/i,
    for_cash_flow: /(?:for\s*cash\s*flow)[\s:]*([Yy]es|[Tt]rue|1)/i,
    party: /(?:party)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    flow_type: /(?:flow\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    location: /(?:location)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    category: /(?:category)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  purchase: {
    item_name: /(?:item\s*name|name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    status: /(?:status)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    location: /(?:location)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    priority: /(?:priority)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    estimated_cost_usd: /(?:estimated\s*cost)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    actual_cost_usd: /(?:actual\s*cost)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency: /(?:currency)[\s:]*([A-Z]{3})/i,
    category: /(?:category)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    vendor: /(?:vendor)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    created_date:
      /(?:created\s*date|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    completed_date:
      /(?:completed\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  transfer: {
    name: /(?:name|transfer\s*name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    status: /(?:status)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    amount: /(?:amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    origin_account: /(?:origin\s*account|from\s*account)[\s:]*([A-Za-z0-9-]+)/i,
    destination_account:
      /(?:destination\s*account|to\s*account)[\s:]*([A-Za-z0-9-]+)/i,
    created_time:
      /(?:created\s*time|time)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    deposit_address: /(?:deposit\s*address)[\s:]*([A-Za-z0-9]+)/i,
    fees: /(?:fees|fee)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    transaction: /(?:transaction)[\s:]*([A-Za-z0-9-]+)/i,
    transactions: /(?:transactions)[\s:]*([^\n]+)/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  wallet: {
    name: /(?:name|wallet\s*name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    number: /(?:number)[\s:]*(\d+)/i,
    accounts: /(?:accounts)[\s:]*([^\n]+)/i,
    categories: /(?:categories)[\s:]*([^\n]+)/i,
    url: /(?:url)[\s:]*([^\s]+)/i,
    urls: /(?:urls)[\s:]*([^\n]+)/i,
    investments: /(?:investments)[\s:]*([^\n]+)/i,
    status: /(?:status)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  tax_filing: {
    name: /(?:name|filing\s*name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    jurisdiction: /(?:jurisdiction)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    year: /(?:year)[\s:]*(\d{4})/i,
    filings: /(?:filings)[\s:]*([^\n]+)/i,
    status: /(?:status)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    companies: /(?:companies)[\s:]*([^\n]+)/i,
    due_date:
      /(?:due\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    filed_date:
      /(?:filed\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    amount_owed: /(?:amount\s*owed)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    amount_paid: /(?:amount\s*paid)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency: /(?:currency)[\s:]*([A-Z]{3})/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  order: {
    name: /(?:name|order\s*name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    status: /(?:status)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    accounts: /(?:accounts)[\s:]*([^\n]+)/i,
    amount: /(?:amount)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    asset_type: /(?:asset\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    order_type: /(?:order\s*type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    price: /(?:price)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    url: /(?:url)[\s:]*([^\s]+)/i,
    date: /(?:date|order\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  fixed_cost: {
    merchant: /(?:merchant)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    expense_name: /(?:expense\s*name|name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    expense_type: /(?:expense\s*type|type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    location: /(?:location)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    frequency_per_year: /(?:frequency)[\s:]*(\d+)/i,
    payment_amount_eur: /(?:payment\s*amount\s*eur)[\s:]*€?\s*([\d,]+\.?\d*)/i,
    payment_amount_usd: /(?:payment\s*amount\s*usd)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    yearly_amount_eur: /(?:yearly\s*amount\s*eur)[\s:]*€?\s*([\d,]+\.?\d*)/i,
    yearly_amount_usd: /(?:yearly\s*amount\s*usd)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    monthly_amount_eur: /(?:monthly\s*amount\s*eur)[\s:]*€?\s*([\d,]+\.?\d*)/i,
    monthly_amount_usd: /(?:monthly\s*amount\s*usd)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    status: /(?:status)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    payment_method: /(?:payment\s*method)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    renews: /(?:renews)[\s:]*([^\n]+)/i,
    started: /(?:started)[\s:]*([^\n]+)/i,
    ended: /(?:ended)[\s:]*([^\n]+)/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  property: {
    name: /(?:name|property\s*name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    address: /(?:address)[\s:]*([^\n]+)/i,
    type: /(?:type|property\s*type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    purchase_date:
      /(?:purchase\s*date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    purchase_price: /(?:purchase\s*price)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    current_value: /(?:current\s*value)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency: /(?:currency)[\s:]*([A-Z]{3})/i,
    notes: /(?:notes|comments)[\s:]*([\s\S]+?)(?:\n\n|$)/i,
  },
  balance: {
    snapshot_date:
      /(?:snapshot\s*date|date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    account_id: /(?:account\s*id)[\s:]*([A-Za-z0-9-]+)/i,
    account_type: /(?:account\s*type)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    account_name: /(?:account\s*name|name)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
    balance_usd: /(?:balance\s*usd|balance)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    balance_original:
      /(?:balance\s*original|original\s*balance)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    currency_original: /(?:currency)[\s:]*([A-Z]{3})/i,
    provider: /(?:provider)[\s:]*([A-Za-z0-9\s&.,'-]+)/i,
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
      pattern.test(rawText),
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
    if (
      lowerFileName.includes("holding") ||
      lowerFileName.includes("portfolio")
    )
      matchCounts.holding = (matchCounts.holding || 0) + 1;
    if (lowerFileName.includes("income") || lowerFileName.includes("earnings"))
      matchCounts.income = (matchCounts.income || 0) + 1;
    if (
      lowerFileName.includes("tax_event") ||
      lowerFileName.includes("tax-event")
    )
      matchCounts.tax_event = (matchCounts.tax_event || 0) + 1;
    if (
      lowerFileName.includes("crypto") ||
      lowerFileName.includes("blockchain")
    )
      matchCounts.crypto_transaction =
        (matchCounts.crypto_transaction || 0) + 1;
    if (lowerFileName.includes("liability") || lowerFileName.includes("debt"))
      matchCounts.liability = (matchCounts.liability || 0) + 1;
    if (lowerFileName.includes("flow") || lowerFileName.includes("cash_flow"))
      matchCounts.flow = (matchCounts.flow || 0) + 1;
    if (lowerFileName.includes("purchase") || lowerFileName.includes("buy"))
      matchCounts.purchase = (matchCounts.purchase || 0) + 1;
    if (lowerFileName.includes("transfer"))
      matchCounts.transfer = (matchCounts.transfer || 0) + 1;
    if (
      lowerFileName.includes("wallet") ||
      lowerFileName.includes("institution")
    )
      matchCounts.wallet = (matchCounts.wallet || 0) + 1;
    if (
      lowerFileName.includes("tax_filing") ||
      lowerFileName.includes("tax-return")
    )
      matchCounts.tax_filing = (matchCounts.tax_filing || 0) + 1;
    if (lowerFileName.includes("order") || lowerFileName.includes("trade"))
      matchCounts.order = (matchCounts.order || 0) + 1;
    if (
      lowerFileName.includes("fixed_cost") ||
      lowerFileName.includes("recurring")
    )
      matchCounts.fixed_cost = (matchCounts.fixed_cost || 0) + 1;
    if (
      lowerFileName.includes("property") ||
      lowerFileName.includes("real_estate")
    )
      matchCounts.property = (matchCounts.property || 0) + 1;
    if (lowerFileName.includes("balance"))
      matchCounts.balance = (matchCounts.balance || 0) + 1;
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
  rawText: string,
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
  fileName?: string,
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
