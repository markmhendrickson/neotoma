# Schema Type Distinctions and Redundancy Analysis

Generated: 2026-01-22

## Quick Reference: Common Confusions

### Transaction vs Transfer

**transaction**: External economic activity (you ↔ third party)
- Bank feed imports from Plaid
- Receipt purchases from merchants
- Salary deposits from employers
- Rent payments to landlords
- **Key fields**: merchant_name, category, bank_provider

**transfer**: Internal asset movement (your account A → your account B)
- Moving money between your own accounts
- Retirement contributions (checking → IRA)
- Portfolio rebalancing (stocks → bonds)
- Crypto custody changes (exchange → cold wallet)
- **Key fields**: origin_account, destination_account

**Example**:
- Transaction: "Coffee Shop -$5.00" (you → merchant)
- Transfer: "Checking → Savings $1000" (your account → your account)

---

### Exercise vs Workout

**exercise**: Individual exercise activities (atomic unit)
- Single activity: "squats", "push-ups", "running"
- Specific sets: "3 sets x 15 reps"
- **Key fields**: name, sets, reps, duration

**workout**: Complete workout routines (combination)
- Full routine: "Full Body Circuit"
- Multiple exercises: "squats, pushups, pullups, planks"
- Workout plan with circuits
- **Key fields**: exercises (list), circuits, primary_muscles

**Example**:
- Exercise: "Squats - 3 sets x 15 reps"
- Workout: "Full Body Circuit" (contains: squats, pushups, pullups, planks)

---

### Email vs Message

**email**: Email-specific messages
- Email threads with subjects
- Sender/recipient email addresses
- Email-specific metadata (thread_id, reply-to)
- **Key fields**: subject, thread_id, email-specific structure

**message**: Generic messages without email structure
- DMs, SMS, chat messages
- Social media messages
- Any text communication that's not email
- **Key fields**: channel, platform-specific metadata

**Example**:
- Email: "Subject: Q1 Report" (email thread)
- Message: "Hey, can we meet at 3?" (Slack DM)

---

### Goal vs Outcome

**goal**: Target metrics you're trying to achieve
- OKRs (Objectives and Key Results)
- Target metrics: "Reach $100k revenue"
- Future-oriented targets
- **Key fields**: target_value, metric, deadline

**outcome**: Results organized by strategic goals
- What you're trying to achieve (deliverable-focused)
- Can be strategic (long-term), tactical (methods), or operational (procedures)
- Links to goals via goal_id
- **Key fields**: outcome_name, outcome_type, goal_id, status

**Example**:
- Goal: "Increase revenue by 50% by Q4" (target metric)
- Outcome: "Launch MVP" (deliverable, links to startup goal)

---

### Contact vs Person vs Company

**contact**: Unified people and organization records (raw entry)
- Can represent person OR organization
- Data as entered (mixed type)
- **Key fields**: name, email, organization, contact_type

**person**: Individual human records (resolved)
- Specifically individuals
- Extracted/resolved from contacts
- **Key fields**: name, email, phone, title

**company**: Organization records (resolved)
- Specifically organizations
- Extracted/resolved from contacts
- **Key fields**: name, industry, website

**Pattern**: contact = raw input, person/company = resolved entities

---

### Address vs Location

**address**: Postal/mailing addresses
- Structured address components
- For mail delivery
- **Key fields**: street, city, state, postal_code, country

**location**: Geographic coordinates and places
- Latitude/longitude
- Named places with coordinates
- **Key fields**: name, latitude, longitude, address (can include)

**Example**:
- Address: "123 Main St, City, State 12345" (postal)
- Location: "Central Park" (lat: 40.785, lon: -73.968, address: "...")

---

### Purchase vs Receipt vs Order

**purchase**: Planned and completed purchase tracking
- Wishlist → intent → completion
- Status transitions (pending → in_progress → completed)
- **Key fields**: item_name, status, created_date, completed_date

**receipt**: Proof-of-purchase documents
- Physical/digital receipts
- Document proving purchase occurred
- **Key fields**: receipt_number, merchant_name, amount_total, date

**order**: Trading orders (brokerage-specific)
- Stock/crypto buy/sell orders
- Limit orders, stop losses
- **Key fields**: order_type, asset_type, price, accounts

**Distinctions**:
- Purchase = planning/tracking (before/during/after)
- Receipt = proof document (after)
- Order = trading execution (brokerage-specific)

---

## Redundancy Analysis Results

### ❌ Fixed Issues

**Duplicate alias "objective"**: Was used by both `goal` and `outcome`
- ✅ Fixed: Removed from `goal`, kept for `outcome`
- goal now uses: ["target", "okr", "key_result"]
- outcome keeps: ["objective", "result", "deliverable"]

**Ambiguous descriptions**: Clarified distinctions
- ✅ Fixed: Updated descriptions for exercise, workout, goal, outcome, email, message

### ✅ Intentional Separations (No Action Needed)

**Task metadata types** (5 types):
- task, task_attachment, task_comment, task_dependency, task_story
- **Justified**: Preserves Asana import fidelity, enables granular tracking

**Habit metadata types** (3 types):
- habit, habit_completion, habit_objective
- **Justified**: Enables temporal completion tracking and multiple objectives per habit

**Financial transaction types** (5 types):
- transaction, transfer, purchase, receipt, order
- **Justified**: Each represents distinct financial concept with different use cases

**Identity types** (5 types):
- contact, person, company, address, location
- **Justified**: contact = raw entry, person/company = resolved entities, address/location = different coordinate systems

### No Action Recommended

All other schema separations are well-justified and serve distinct purposes.

---

## Schema Health Metrics

**Total schemas**: 50  
**Duplicate aliases**: 0 (fixed)  
**Well-differentiated**: 50/50 (100%)  
**Category balance**: Reasonable (18 finance, 13 productivity, 12 knowledge, 7 health)

---

## Conclusion

**No true redundancies found.** All schema separations are intentional architectural choices:

1. **transaction vs transfer**: External vs internal activity ✅
2. **exercise vs workout**: Atomic vs composite ✅
3. **email vs message**: Email-specific vs generic ✅
4. **goal vs outcome**: Target vs achieved result ✅
5. **contact vs person/company**: Raw vs resolved ✅
6. **address vs location**: Postal vs geographic ✅
7. **Task/habit metadata**: Granularity by design ✅

**Critical fix applied**: Removed duplicate "objective" alias.

**Schema set is healthy and well-designed.**
