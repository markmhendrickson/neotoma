/**
 * Generate PDF Fixtures for Testing
 *
 * Creates deterministic PDF files for testing file upload and extraction.
 * Uses pdfkit to generate PDFs with structured financial data.
 */

import PDFDocument from "pdfkit";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(process.cwd(), "tests/fixtures/pdf");

function createPdfBuffer(content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(12);
    doc.text(content);
    doc.end();
  });
}

async function generateTransactionReceipt(): Promise<void> {
  const content = `RECEIPT

Merchant: Acme Coffee Shop
Transaction Date: 2024-12-10
Posting Date: 2024-12-11
Amount: $50.00 USD
Category: Food & Dining
Account: Checking Account (****1234)
Status: Posted
Transaction ID: TXN-2024-12-10-001

Thank you for your purchase!`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_transaction_receipt.pdf"), buffer);
}

async function generateBankStatement(): Promise<void> {
  const content = `BANK STATEMENT

Chase Bank
Account: Checking Account (****1234)
Statement Period: December 1-31, 2024

Balance as of 12/01/2024: $10,000.00 USD
Balance as of 12/15/2024: $12,500.00 USD
Balance as of 12/31/2024: $11,000.00 USD

Recent Transactions:
- 12/10/2024: Acme Coffee Shop -$50.00
- 12/15/2024: Deposit +$5,000.00
- 12/20/2024: Transfer -$1,200.00

For questions, contact support.`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_bank_statement.pdf"), buffer);
}

async function generateInvoice(): Promise<void> {
  const content = `INVOICE

Invoice Number: INV-TEST-001
Date: 2024-12-15
Due Date: 2025-01-15

Bill To:
Acme Corp
123 Main Street
City, State 12345

Description: Consulting Services - Q1 2024
Amount: $5,000.00 USD
Tax Year: 2024

Payment Terms: Net 30
Status: Pending`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_invoice.pdf"), buffer);
}

async function generateTaxForm(): Promise<void> {
  const content = `TAX DOCUMENT

Form Type: 1099-INT
Tax Year: 2024
Jurisdiction: US Federal

Taxpayer: John Doe
SSN: 123-45-6789

Interest Income: $150.00 USD
Source: Acme Bank Savings Account

Capital Gains:
- Asset: AAPL
- Quantity: 50 shares
- Cost Basis: $7,500.00 USD
- Proceeds: $9,500.00 USD
- Gain/Loss: $2,000.00 USD

Filing Status: Filed
Filed Date: 2025-04-10`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_tax_form.pdf"), buffer);
}

async function generateHoldingStatement(): Promise<void> {
  const content = `PORTFOLIO STATEMENT

Account: Brokerage Account (acc-001)
Snapshot Date: 2024-12-15
Provider: Fidelity

Holdings:
- Asset: AAPL
- Asset Type: Stock
- Quantity: 100 shares
- Cost Basis: $15,000.00 USD
- Current Value: $18,500.00 USD
- Account Type: Brokerage

This is a test document for fixture generation.`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_holding_statement.pdf"), buffer);
}

async function generateContract(): Promise<void> {
  const content = `CONTRACT AGREEMENT

Contract Name: Consulting Agreement
Parties: Acme Corp, John Smith
Effective Date: 2024-01-01
Expiration Date: 2025-12-31
Status: Active

Contract Type: Service Agreement
Signed Date: 2024-01-01

Terms and conditions apply.
This is a test document for fixture generation.`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_contract.pdf"), buffer);
}

async function generateReceipt(): Promise<void> {
  const content = `PURCHASE RECEIPT

Store: Target
Date: 2024-12-18
Receipt Number: RCP-2024-12-18-001

Items:
- Groceries: $45.50
- Household supplies: $28.30
- Tax: $5.91

Total: $79.71 USD
Payment Method: Credit Card (****1234)

Thank you for shopping with us!`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_receipt.pdf"), buffer);
}

async function generateNote(): Promise<void> {
  const content = `MEETING NOTES

Date: 2024-12-15
Title: Q1 Planning Meeting

Attendees: John Doe, Jane Smith, Bob Johnson

Agenda:
1. Review Q4 results
2. Set Q1 objectives
3. Budget allocation

Key Points:
- Q4 exceeded targets by 15%
- Q1 focus: customer acquisition
- Budget approved: $50,000

Action Items:
- John: Prepare customer survey (Due: 12/20)
- Jane: Draft marketing plan (Due: 12/22)
- Bob: Setup tracking dashboard (Due: 12/25)

Next Meeting: January 5, 2025`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_note.pdf"), buffer);
}

async function generateResearchPaper(): Promise<void> {
  const content = `RESEARCH SUMMARY

Title: Event-Sourced Architecture Patterns
Author: Dr. John Smith
Publication: Software Engineering Journal
Date: March 2024

Abstract:
This paper explores event sourcing patterns in modern distributed systems.
Event sourcing provides audit trails, temporal queries, and replay capabilities.

Key Findings:
1. Event sourcing enables complete audit history
2. CQRS complements event sourcing well
3. Snapshots optimize read performance
4. Schema evolution requires careful planning

Conclusion:
Event sourcing is valuable for systems requiring strong auditability
and temporal reasoning capabilities.

Topics: architecture, event-sourcing, CQRS, distributed-systems`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_research.pdf"), buffer);
}

async function generateMealLog(): Promise<void> {
  const content = `MEAL LOG

Date: 2024-12-18

Breakfast (8:00 AM):
- Oatmeal with berries: 350 calories
- Coffee: 5 calories
- Protein: 12g, Carbs: 65g, Fat: 8g

Lunch (1:00 PM):
- Grilled chicken salad: 450 calories
- Whole grain bread: 150 calories
- Protein: 45g, Carbs: 35g, Fat: 15g

Dinner (7:00 PM):
- Salmon with vegetables: 550 calories
- Brown rice: 200 calories
- Protein: 50g, Carbs: 45g, Fat: 20g

Total Daily:
- Calories: 1705
- Protein: 107g
- Carbs: 145g
- Fat: 43g

Notes: Felt energized throughout the day`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_meal.pdf"), buffer);
}

async function generateExerciseLog(): Promise<void> {
  const content = `EXERCISE LOG

Date: 2024-12-18
Workout: Full Body Circuit

Exercises:
1. Squats: 3 sets x 15 reps
2. Push-ups: 3 sets x 20 reps
3. Pull-ups: 3 sets x 10 reps
4. Planks: 3 sets x 60 seconds

Duration: 45 minutes
Intensity: High
Primary Muscles: legs, chest, back, core
Secondary Muscles: shoulders, arms

Notes:
- Felt strong today
- Increased squat weight by 5 lbs
- Heart rate avg: 145 bpm`;

  const buffer = await createPdfBuffer(content);
  writeFileSync(join(FIXTURES_DIR, "sample_exercise.pdf"), buffer);
}

async function main(): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true });

  console.log("Generating PDF fixtures...");
  await generateTransactionReceipt();
  console.log("✓ sample_transaction_receipt.pdf");
  await generateBankStatement();
  console.log("✓ sample_bank_statement.pdf");
  await generateInvoice();
  console.log("✓ sample_invoice.pdf");
  await generateTaxForm();
  console.log("✓ sample_tax_form.pdf");
  await generateHoldingStatement();
  console.log("✓ sample_holding_statement.pdf");
  await generateContract();
  console.log("✓ sample_contract.pdf");
  await generateReceipt();
  console.log("✓ sample_receipt.pdf");
  await generateNote();
  console.log("✓ sample_note.pdf");
  await generateResearchPaper();
  console.log("✓ sample_research.pdf");
  await generateMealLog();
  console.log("✓ sample_meal.pdf");
  await generateExerciseLog();
  console.log("✓ sample_exercise.pdf");
  console.log("\nAll PDF fixtures generated successfully!");
}

main().catch((error) => {
  console.error("Error generating PDF fixtures:", error);
  process.exit(1);
});



