# Discovery Process Alignment with Marty Cagan Principles

_(How Neotoma's Discovery Process Addresses Cagan's Four Product Risks)_

---

## Purpose

This document explains how Neotoma's Discovery Process (integrated into Release Workflow) addresses Marty Cagan's discovery vs delivery principles and his four product risks.

---

## Cagan's Four Product Risks

### 1. Value Risk: Will users buy or choose to use this?

**How Discovery Addresses This:**

**Pre-Release Discovery:**
- **Value Discovery Interviews**: Conduct 5-10 ICP interviews to validate:
  - Do users actually have this problem?
  - Does our value proposition resonate?
  - Would users choose this over current solutions?
- **Success Criteria**: ≥70% validate problem exists, ≥60% express interest

**Continuous Discovery:**
- Weekly user interviews during development
- Validate value assumptions as features are built
- Rapid iteration based on value feedback

**Outcome:** Build only features that address validated user problems.

---

### 2. Usability Risk: Can users figure out how to use this?

**How Discovery Addresses This:**

**Pre-Release Discovery:**
- **Usability Discovery (Prototype Testing)**: User test core workflows with 5-8 users:
  - Can users complete workflows without guidance?
  - Is the UI discoverable?
  - Are interactions intuitive?
- **Success Criteria**: ≥80% complete workflows successfully, ≥80% rate usability acceptable

**Continuous Discovery:**
- Prototype testing after each major UI Feature Unit
- Weekly usability check-ins during development
- Rapid fixes based on usability findings

**Outcome:** Build only features that users can actually use.

---

### 3. Feasibility Risk: Can our engineers build this?

**How Discovery Addresses This:**

**Pre-Release Discovery:**
- **Feasibility Validation**: Technical proof of concept for high-risk assumptions:
  - Can we achieve performance targets?
  - Are there architectural blockers?
  - Is the technical approach viable?
- **Success Criteria**: POC meets requirements, no architectural blockers

**Technical Architecture:**
- Existing feasibility validation through technical specs and architecture docs
- Feasibility is well-validated in current plan

**Outcome:** Build only features that are technically feasible.

---

### 4. Business Viability Risk: Will this solution work for our business?

**How Discovery Addresses This:**

**Pre-Release Discovery:**
- **Business Viability Discovery (Pricing Validation)**: Test business model assumptions:
  - Will users pay for this?
  - What price point is acceptable?
  - What are the value drivers for paying?
- **Success Criteria**: ≥50% express willingness to pay, ≥40% accept target price

**Business Model Validation:**
- Unit economics modeling
- Customer acquisition strategy validation
- Revenue model validation

**Outcome:** Build only features that support a viable business model.

---

## Discovery Before Delivery (Cagan's Core Principle)

### Current Workflow (Before Discovery Integration)

```
Planning → Build → Deploy → Validate
```

**Problem:** Validates after building (too late to pivot).

### Enhanced Workflow (With Discovery Integration)

```
Planning → Discover → Build → Deploy → Validate
         ↑
    Validate BEFORE building
```

**Solution:** Validates before building (can pivot early).

---

## How Discovery is Integrated

### Step 0.5: Pre-Release Discovery

**Timeline:** 1-3 weeks before building

**Activities:**
1. **Value Discovery** (Week 1-2): ICP interviews validate problem and value prop
2. **Usability Discovery** (Week 1-2): Prototype testing validates workflows
3. **Business Viability Discovery** (Week 2): Pricing validation tests business model
4. **Feasibility Validation** (Week 1-2): Technical POC validates assumptions

**Go/No-Go Decision:**
- **Go**: All critical hypotheses validated → Proceed to build
- **Pivot**: Some hypotheses validated, some failed → Adjust scope, re-validate
- **No-Go**: Critical hypotheses failed → Cancel or defer Release

### Continuous Discovery During Development

**Timeline:** Weekly during Step 1 (Execute FU Batches)

**Activities:**
- Weekly user interviews (2-3 users per week)
- Prototype testing after each major UI FU
- Rapid iteration based on feedback

**Outcome:** Continuous validation ensures we're building the right thing.

---

## Discovery Success Criteria

### Value Discovery

- ✅ **Problem Validation**: ≥70% of users validate problem exists
- ✅ **Interest in Solution**: ≥60% express interest in solution
- ✅ **Value Proposition**: ≥50% see clear value proposition

### Usability Discovery

- ✅ **Workflow Completion**: ≥80% complete core workflows successfully
- ✅ **Usability Rating**: ≥80% rate usability as acceptable (≥3/5)
- ✅ **Critical Blockers**: ≤2 critical usability blockers identified

### Business Viability Discovery

- ✅ **Willingness to Pay**: ≥50% express willingness to pay
- ✅ **Price Point Acceptance**: ≥40% accept target price point
- ✅ **Value Drivers**: Clear value drivers for paying identified

### Feasibility Validation

- ✅ **POC Success**: Technical POC meets requirements
- ✅ **No Blockers**: No architectural blockers identified
- ✅ **Performance**: Performance targets achievable

---

## Discovery vs Validation

### Discovery (Before Building)

**Purpose:** Validate assumptions before committing resources

**Timeline:** Pre-release (Step 0.5)

**Methods:**
- ICP interviews (value, business viability)
- Prototype user testing (usability)
- Technical POC (feasibility)

**Outcome:** Go/No-Go decision to build or pivot

### Validation (After Building)

**Purpose:** Confirm outcomes after deployment

**Timeline:** Post-release (Step 6, Release Validation Process)

**Methods:**
- Automated metrics retrieval (quantitative)
- ICP interviews (qualitative)
- User feedback analysis

**Outcome:** Learnings for next release

**Both are important:**
- **Discovery**: Prevents building the wrong thing
- **Validation**: Confirms we built the right thing

---

## Example: MVP Discovery

### Value Discovery

**Hypothesis:** "AI-Native Operators will find value in unified document search via MCP"

**Method:** 5-10 ICP interviews with AI-Native Individual Operators

**Questions:**
- Do you have a problem with fragmented documents?
- How do you currently search for documents?
- Would unified search via MCP be valuable?

**Success Criteria:**
- ≥70% validate problem exists
- ≥60% express interest in solution

### Usability Discovery

**Hypothesis:** "Users can complete upload → extraction → timeline workflow without guidance"

**Method:** Prototype user testing with 5-8 users

**Tasks:**
- Upload a document
- View extracted fields
- Navigate to timeline view
- Ask an AI question

**Success Criteria:**
- ≥80% complete workflow successfully
- ≥80% rate usability acceptable

### Business Viability Discovery

**Hypothesis:** "Tier 1 ICPs will pay €250-€1,250/month for Neotoma"

**Method:** Willingness-to-pay interviews with 5-10 users

**Questions:**
- Would you pay for this solution?
- What price point?
- What features are must-have for paying?

**Success Criteria:**
- ≥50% express willingness to pay
- ≥40% accept target price point

---

## Key Benefits

### 1. Reduce Risk of Building Wrong Product

**Before Discovery:**
- Build based on assumptions
- Risk: Users don't want it
- Risk: Users can't use it
- Risk: Users won't pay for it

**After Discovery:**
- Build based on validated assumptions
- Lower risk: Users validated problem
- Lower risk: Users validated usability
- Lower risk: Users validated pricing

### 2. Faster Time to Product-Market Fit

**Before Discovery:**
- Build → Deploy → Learn → Pivot → Rebuild
- Multiple cycles to find fit

**After Discovery:**
- Discover → Build → Deploy → Validate
- Faster path to fit (fewer cycles)

### 3. Better Resource Allocation

**Before Discovery:**
- Waste resources on unvalidated features
- Build features users don't want

**After Discovery:**
- Focus resources on validated features
- Build features users actually want

---

## Alignment with Cagan Principles

### ✅ Continuous Discovery

**Cagan:** "Discovery should be continuous, not just at the beginning"

**Neotoma Implementation:**
- Pre-release discovery (Step 0.5)
- Continuous discovery during development (weekly interviews)
- Post-release validation (Step 6)

### ✅ Discovery Before Delivery

**Cagan:** "Validate assumptions before building"

**Neotoma Implementation:**
- Step 0.5 validates assumptions before Step 1 (Execute FU Batches)
- Go/No-Go decision before committing resources

### ✅ Testable Hypotheses

**Cagan:** "Make assumptions explicit and testable"

**Neotoma Implementation:**
- Discovery plan defines explicit hypotheses
- Success criteria are quantifiable
- Go/No-Go decision based on evidence

### ✅ Risk-First Approach

**Cagan:** "Address highest risks first"

**Neotoma Implementation:**
- Value Risk: Value discovery interviews
- Usability Risk: Prototype user testing
- Feasibility Risk: Technical POC
- Business Viability Risk: Pricing validation

---

## Summary

Neotoma's Discovery Process fully addresses Cagan's discovery vs delivery principles:

1. **✅ Discovery Before Delivery**: Step 0.5 validates assumptions before building
2. **✅ Continuous Discovery**: Weekly interviews and prototype testing during development
3. **✅ Addresses All Four Risks**: Value, Usability, Feasibility, Business Viability
4. **✅ Testable Hypotheses**: Explicit hypotheses with quantifiable success criteria
5. **✅ Risk-First Approach**: Validates highest risks first

**Result:** Build the right product, faster, with lower risk.

---

**END OF DOCUMENT**












