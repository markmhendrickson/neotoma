# Discovery-First vs. Dogfooding-First: Comparative Analysis

**Date**: 2026-01-15  
**Purpose**: Assess comparative advantages of discovery-first vs. dogfooding-first approaches for MVP development

## Executive Summary

**Discovery-First Approach:**
- Discovery (Week -8 to -5) → Build (Week 0-12) → Marketing (Week -4 to Week 4)
- External validation before building
- Market-driven feature prioritization

**Dogfooding-First Approach:**
- Build for personal use (ateles integration) → Release developer preview during dogfooding → Validate through usage → Discovery only if signals are weak
- Internal validation through real usage
- Use-case-driven feature prioritization

**Capacity-Constrained Sequence (Recommended When Discovery Is Not Feasible):**
- Build + dogfood with developer preview release during dogfooding
- Use preview validation to assess dependence and feedback quality
- Schedule discovery only if validation is insufficient

---

## 1. Time to Value

### Discovery-First
**Advantages:**
- ✅ **External validation before investment**: 3-4 weeks of discovery prevents building wrong product
- ✅ **Parallel activities**: Discovery and marketing prep can run in parallel (Week -8 to -5)
- ✅ **Clear go/no-go decision**: Discovery findings inform whether to proceed

**Disadvantages:**
- ❌ **Delayed development start**: 3-4 weeks before building begins
- ❌ **Discovery overhead**: 40-50 survey responses, 13 interviews, 8 usability tests, 8 pricing interviews
- ❌ **Total timeline**: ~16-20 weeks (discovery + build + marketing)

**Time Investment:**
- Discovery: ~80-100 hours (interviews, analysis, synthesis)
- Marketing prep: ~35 hours (pre-launch) + ~60 hours (post-launch)
- **Total pre-build**: ~175-195 hours

### Dogfooding-First
**Advantages:**
- ✅ **Immediate development start**: Begin building immediately
- ✅ **Faster iteration cycles**: Real usage feedback drives rapid iteration
- ✅ **No discovery overhead**: Skip 3-4 weeks of discovery activities
- ✅ **Total timeline**: ~12-14 weeks (build only, marketing deferred)

**Disadvantages:**
- ❌ **No external validation**: Risk of building for single user (yourself)
- ❌ **Delayed market feedback**: No external validation until post-dogfooding

**Time Investment:**
- Discovery: 0 hours (deferred)
- Marketing: 0 hours (deferred)
- **Total pre-build**: 0 hours

**Winner**: **Dogfooding-First** (faster time to personal value, but discovery-first has better external validation)

---

## 2. Risk Mitigation

### Discovery-First
**Advantages:**
- ✅ **Validates problem exists**: 70%+ validation threshold before building
- ✅ **Validates solution approach**: 60%+ interest in MCP solution before building
- ✅ **Validates business model**: 50%+ willingness to pay ≥€25/month before building
- ✅ **Validates technical feasibility**: OCR determinism, MCP reliability tested before building
- ✅ **Identifies failure modes early**: Pre-mortem failure modes validated/disproven in discovery
- ✅ **Reduces build risk**: Lower probability of building wrong product

**Disadvantages:**
- ❌ **Discovery can be wrong**: Survey/interview bias, small sample size (13-29 participants)
- ❌ **Market can change**: 3-4 weeks + 12 weeks build = 15-16 weeks to market (competitive risk)
- ❌ **Discovery overhead risk**: Time spent on discovery if product is obvious

**Risk Profile:**
- **Market fit risk**: Low (validated before building)
- **Technical risk**: Low (feasibility validated)
- **Business risk**: Low (pricing validated)
- **Timing risk**: Medium (15-16 weeks to market)
- **Competitive risk**: Medium (competitors may launch first)

### Dogfooding-First
**Advantages:**
- ✅ **Validates real usage**: Actual daily usage reveals real problems/needs
- ✅ **Validates technical feasibility**: Real-world usage tests determinism, performance, reliability
- ✅ **Validates integration patterns**: Ateles integration validates MCP integration patterns
- ✅ **Faster failure detection**: Real usage catches issues immediately
- ✅ **No discovery bias**: Real usage vs. hypothetical interview responses

**Disadvantages:**
- ❌ **Single-user validation**: Your needs may not represent market needs
- ❌ **No external validation**: No validation of market demand, pricing, or competitive positioning
- ❌ **Business model risk**: No validation of willingness to pay
- ❌ **Market fit risk**: Building for yourself may not solve others' problems
- ❌ **Competitive positioning risk**: No validation of defensible differentiators

**Risk Profile:**
- **Market fit risk**: High (single-user validation)
- **Technical risk**: Low (real usage validates)
- **Business risk**: High (no pricing validation)
- **Timing risk**: Low (faster to market)
- **Competitive risk**: Low (faster to market)

**Winner**: **Discovery-First** (better external risk mitigation), but **Dogfooding-First** has better technical validation through real usage

---

## 3. Validation Quality

### Discovery-First
**Advantages:**
- ✅ **External validation**: 13-29 participants across multiple segments
- ✅ **Structured methodology**: Mom Test, Van Westendorp, SUS scores
- ✅ **Quantitative metrics**: Success criteria with thresholds (70% problem validation, 60% solution interest, 50% willingness to pay)
- ✅ **Diverse perspectives**: AI-Native Operators + Knowledge Workers
- ✅ **Commitment signals**: Time/money spent, workarounds built (validates real pain)

**Disadvantages:**
- ❌ **Hypothetical responses**: Interviews ask about past behavior, but not real usage of Neotoma
- ❌ **Small sample size**: 13-29 participants may not represent market
- ❌ **Interview bias**: Participants may be polite, overstate interest
- ❌ **No real usage data**: Validation based on descriptions, not actual product usage

**Validation Depth:**
- Problem validation: High (structured interviews, commitment signals)
- Solution validation: Medium (hypothetical, no real usage)
- Technical validation: Medium (feasibility tests, but not production usage)
- Business validation: Medium (pricing interviews, but not real purchases)

### Dogfooding-First
**Advantages:**
- ✅ **Real usage validation**: Actual daily usage reveals real problems, workflows, edge cases
- ✅ **Integration validation**: Ateles integration validates MCP integration patterns in production
- ✅ **Technical validation**: Real-world usage tests determinism, performance, reliability at scale
- ✅ **Feature prioritization**: Real usage drives feature prioritization (what you actually use)
- ✅ **No hypothetical bias**: Real usage vs. interview responses

**Disadvantages:**
- ❌ **Single-user validation**: Your needs may not represent market
- ❌ **No external validation**: No validation of market demand, pricing, competitive positioning
- ❌ **Limited perspective**: Single user, single use case (ateles integration)
- ❌ **No quantitative metrics**: Subjective validation vs. structured success criteria

**Validation Depth:**
- Problem validation: High (real usage, real pain points)
- Solution validation: High (real usage of actual product)
- Technical validation: High (production usage, real data, real scale)
- Business validation: Low (no external validation of pricing, market demand)

**Winner**: **Tie** — Discovery-First has better external/market validation, Dogfooding-First has better technical/usage validation

---

## 4. Resource Requirements

### Discovery-First
**Time Investment:**
- Discovery: ~80-100 hours (interviews, analysis, synthesis)
- Marketing prep: ~35 hours (pre-launch) + ~60 hours (post-launch)
- **Total**: ~175-195 hours before/during build

**Financial Investment:**
- Discovery incentives: ~$500-1000 (gift cards for participants)
- Marketing: $0 (organic only)
- **Total**: ~$500-1000

**Infrastructure:**
- Discovery tools: Lead sourcing tools, survey platform, interview scheduling
- Marketing: Social media accounts, website, analytics

### Dogfooding-First
**Time Investment:**
- Discovery: 0 hours (deferred)
- Marketing: 0 hours (deferred)
- **Total**: 0 hours (all time focused on building)

**Financial Investment:**
- Discovery: $0
- Marketing: $0
- **Total**: $0

**Infrastructure:**
- Minimal: Just development environment, ateles integration

**Winner**: **Dogfooding-First** (lower resource requirements, faster to start)

---

## 5. Market Fit Confidence

### Discovery-First
**Advantages:**
- ✅ **External validation**: 13-29 participants validate problem exists
- ✅ **Market segmentation**: Validates AI-Native Operators vs. Knowledge Workers
- ✅ **Competitive positioning**: Validates defensible differentiators (privacy, determinism, cross-platform)
- ✅ **Pricing validation**: Van Westendorp PSM validates price point (€25-€125/month)
- ✅ **Go/no-go decision**: Clear criteria for proceeding (70% problem validation, 60% solution interest, 50% willingness to pay)

**Confidence Level:**
- Problem exists: High (70%+ validation threshold)
- Solution approach: Medium-High (60%+ interest, but hypothetical)
- Market demand: Medium (13-29 participants, small sample)
- Pricing: Medium-High (50%+ willingness to pay, but hypothetical)
- Competitive positioning: Medium (validated in interviews, but not market-tested)

### Dogfooding-First
**Advantages:**
- ✅ **Real usage validation**: Actual daily usage validates product works for real use case
- ✅ **Integration validation**: Ateles integration validates MCP integration patterns
- ✅ **Technical validation**: Real-world usage validates determinism, performance, reliability

**Disadvantages:**
- ❌ **Single-user validation**: Your needs may not represent market
- ❌ **No external validation**: No validation of market demand, pricing, competitive positioning
- ❌ **Limited market insight**: Single use case (ateles integration) may not represent broader market

**Confidence Level:**
- Problem exists: High (you have the problem, real usage)
- Solution approach: High (real usage validates product works)
- Market demand: Low (single-user validation, no external validation)
- Pricing: Low (no pricing validation)
- Competitive positioning: Low (no external validation of differentiators)

**Winner**: **Discovery-First** (better market fit confidence through external validation)

---

## 6. Technical Validation

### Discovery-First
**Advantages:**
- ✅ **Feasibility validation**: OCR determinism, MCP reliability tested before building
- ✅ **Technical risk mitigation**: Identifies technical blockers early
- ✅ **Architecture validation**: Validates technical approach before implementation

**Disadvantages:**
- ❌ **Limited scale**: Feasibility tests on 20+ documents, not production scale
- ❌ **No production usage**: Tests in controlled environment, not real-world usage
- ❌ **No integration validation**: No validation of MCP integration patterns in production

**Technical Validation Depth:**
- OCR determinism: High (100+ document tests)
- MCP reliability: Medium (99.9% uptime target, but not production-tested)
- Integration patterns: Low (no production integration validation)
- Performance at scale: Low (no production scale testing)

### Dogfooding-First
**Advantages:**
- ✅ **Production usage**: Real-world usage tests determinism, performance, reliability at scale
- ✅ **Integration validation**: Ateles integration validates MCP integration patterns in production
- ✅ **Real data**: Real parquet files, real entity types, real workflows
- ✅ **Edge case discovery**: Real usage reveals edge cases, bugs, performance issues
- ✅ **Iteration speed**: Real usage drives rapid iteration on technical issues

**Disadvantages:**
- ❌ **Single use case**: Ateles integration may not reveal all technical issues
- ❌ **Limited scale**: Single-user usage may not test scale limits

**Technical Validation Depth:**
- OCR determinism: High (production usage, real documents)
- MCP reliability: High (production usage, real queries)
- Integration patterns: High (production ateles integration)
- Performance at scale: Medium (single-user, but real data/workloads)

**Winner**: **Dogfooding-First** (better technical validation through production usage)

---

## 7. Business Viability

### Discovery-First
**Advantages:**
- ✅ **Pricing validation**: Van Westendorp PSM validates price point (€25-€125/month)
- ✅ **Willingness to pay**: 50%+ threshold validates business model
- ✅ **Value drivers**: Identifies what drives willingness to pay
- ✅ **Go/no-go decision**: Clear criteria for business viability

**Disadvantages:**
- ❌ **Hypothetical pricing**: Interviews ask about willingness to pay, but not real purchases
- ❌ **Small sample size**: 8 pricing interviews may not represent market
- ❌ **No revenue validation**: No actual revenue until post-launch

**Business Validation:**
- Pricing: Medium-High (50%+ willingness to pay, but hypothetical)
- Business model: Medium (validated in interviews, but not market-tested)
- Revenue potential: Low (no actual revenue until post-launch)

### Dogfooding-First
**Advantages:**
- ✅ **Real value validation**: Actual daily usage validates product provides value
- ✅ **Use case validation**: Ateles integration validates specific use case value

**Disadvantages:**
- ❌ **No pricing validation**: No validation of willingness to pay
- ❌ **No business model validation**: No validation of subscription model, pricing tiers
- ❌ **No revenue validation**: No actual revenue until post-dogfooding marketing

**Business Validation:**
- Pricing: Low (no pricing validation)
- Business model: Low (no business model validation)
- Revenue potential: Low (no actual revenue until post-dogfooding)

**Winner**: **Discovery-First** (better business viability validation through pricing interviews)

---

## 8. Iteration Speed

### Discovery-First
**Advantages:**
- ✅ **Informed iteration**: Discovery findings inform feature prioritization
- ✅ **Continuous discovery**: Weekly user interviews during development (2-3 participants/week)
- ✅ **External feedback**: External validation drives iteration

**Disadvantages:**
- ❌ **Slower iteration**: Discovery → Build → Marketing sequence adds overhead
- ❌ **Interview overhead**: Weekly interviews add time overhead
- ❌ **Delayed feedback**: Discovery findings may not match real usage

**Iteration Cycle:**
- Discovery phase: 3-4 weeks (one-time)
- Build phase: 12 weeks (with continuous discovery)
- Marketing phase: 4 weeks (post-launch)
- **Total**: ~19-20 weeks

### Dogfooding-First
**Advantages:**
- ✅ **Rapid iteration**: Real usage feedback drives immediate iteration
- ✅ **No interview overhead**: No discovery interviews, all time on building
- ✅ **Real-time feedback**: Real usage reveals issues immediately
- ✅ **Faster cycles**: Build → Use → Iterate cycles are faster

**Disadvantages:**
- ❌ **Single-user feedback**: Limited to your perspective
- ❌ **No external feedback**: No external validation until post-dogfooding

**Iteration Cycle:**
- Build phase: 12 weeks (with real usage feedback)
- Dogfooding phase: Ongoing (continuous real usage)
- Marketing phase: Deferred (post-dogfooding)
- **Total**: ~12 weeks (marketing deferred)

**Winner**: **Dogfooding-First** (faster iteration through real usage feedback)

---

## 9. Strategic Positioning

### Discovery-First
**Advantages:**
- ✅ **Validates defensible differentiators**: Interviews validate privacy-first, deterministic, cross-platform positioning
- ✅ **Competitive analysis**: Discovery includes competitive positioning validation
- ✅ **Market messaging**: Discovery findings inform marketing messaging
- ✅ **Strategic clarity**: Clear go/no-go decision based on competitive positioning

**Disadvantages:**
- ❌ **Delayed market entry**: 15-16 weeks to market (competitive risk)
- ❌ **Competitive timing risk**: Competitors may launch first

**Strategic Validation:**
- Defensible differentiators: Medium (validated in interviews, but not market-tested)
- Competitive positioning: Medium (validated in interviews, but not market-tested)
- Market messaging: Medium (informed by discovery, but not market-tested)

### Dogfooding-First
**Advantages:**
- ✅ **Faster market entry**: 12 weeks to usable product (competitive advantage)
- ✅ **Real usage validation**: Real usage validates product works, not just positioning
- ✅ **Technical differentiation**: Real usage validates technical differentiators (determinism, MCP integration)

**Disadvantages:**
- ❌ **No external positioning validation**: No validation of defensible differentiators with market
- ❌ **No competitive analysis**: No validation of competitive positioning
- ❌ **Limited strategic clarity**: Single-user validation may not represent market

**Strategic Validation:**
- Defensible differentiators: Low (no external validation)
- Competitive positioning: Low (no external validation)
- Market messaging: Low (no external validation)

**Winner**: **Discovery-First** (better strategic positioning validation), but **Dogfooding-First** has faster market entry

---

## 10. Use Case Validation (Ateles Integration)

### Discovery-First
**Advantages:**
- ✅ **Broad market validation**: Validates problem across multiple segments, not just ateles use case
- ✅ **Multiple use cases**: Discovery may reveal use cases beyond ateles integration

**Disadvantages:**
- ❌ **No ateles-specific validation**: Discovery doesn't validate ateles integration use case
- ❌ **Hypothetical validation**: Interviews ask about use cases, but not real ateles integration

### Dogfooding-First
**Advantages:**
- ✅ **Real ateles integration**: Actual integration validates use case works
- ✅ **Production validation**: Real usage in ateles validates MCP integration patterns
- ✅ **Parquet replacement validation**: Validates Neotoma can replace parquet MCP in ateles
- ✅ **Real data validation**: Real parquet files, real entity types, real workflows

**Disadvantages:**
- ❌ **Single use case**: Ateles integration may not represent broader market
- ❌ **Limited perspective**: Single use case may miss other important use cases

**Winner**: **Dogfooding-First** (better ateles-specific validation through real integration)

---

## 11. Competitive Timing

### Discovery-First
**Timeline to Market:**
- Discovery: 3-4 weeks (Week -8 to -5)
- Build: 12 weeks (Week 0-12)
- Marketing: 4 weeks (Week -4 to Week 4, parallel with build)
- **Total**: ~15-16 weeks to market

**Competitive Risk:**
- Medium: 15-16 weeks gives competitors time to launch first
- Discovery findings may reveal competitive threats

### Dogfooding-First
**Timeline to Market:**
- Build: 12 weeks (immediate start)
- Dogfooding: Ongoing (parallel with build)
- Marketing: Deferred (post-dogfooding)
- **Total**: ~12 weeks to usable product (marketing deferred)

**Competitive Risk:**
- Low: 12 weeks is faster to market
- But: Marketing deferred means slower public launch

**Winner**: **Dogfooding-First** (faster to usable product, but marketing deferred)

---

## 12. Failure Mode Mitigation

### Discovery-First
**Pre-Mortem Failure Modes:**
1. **RLS Implementation Issues**: Discovery doesn't mitigate (technical issue)
2. **Graph Integrity Regressions**: Discovery doesn't mitigate (technical issue)
3. **MVP Date Slips**: Discovery adds 3-4 weeks, but reduces scope surprises
4. **OCR Determinism Fails**: ✅ **Discovery mitigates** (feasibility validation)
5. **Discovery Reveals Low Willingness-to-Pay**: ✅ **Discovery mitigates** (go/no-go decision)

**Mitigation Effectiveness:**
- Technical risks: Low (discovery doesn't mitigate technical issues)
- Market risks: High (discovery mitigates market fit, pricing risks)
- Business risks: High (discovery mitigates business viability risks)

### Dogfooding-First
**Pre-Mortem Failure Modes:**
1. **RLS Implementation Issues**: ✅ **Dogfooding mitigates** (real usage catches issues)
2. **Graph Integrity Regressions**: ✅ **Dogfooding mitigates** (real usage catches issues)
3. **MVP Date Slips**: ✅ **Dogfooding mitigates** (faster iteration, no discovery overhead)
4. **OCR Determinism Fails**: ✅ **Dogfooding mitigates** (real usage catches issues)
5. **Discovery Reveals Low Willingness-to-Pay**: ❌ **Dogfooding doesn't mitigate** (no pricing validation)

**Mitigation Effectiveness:**
- Technical risks: High (dogfooding mitigates technical issues through real usage)
- Market risks: Low (dogfooding doesn't mitigate market fit, pricing risks)
- Business risks: Low (dogfooding doesn't mitigate business viability risks)

**Winner**: **Tie** — Discovery-First mitigates market/business risks, Dogfooding-First mitigates technical risks

---

## 13. Recommended Approach by Scenario

### Choose Discovery-First If:
- ✅ **Market validation is critical**: Need external validation of problem, solution, pricing
- ✅ **Business viability is uncertain**: Need validation of willingness to pay, business model
- ✅ **Competitive positioning is critical**: Need validation of defensible differentiators
- ✅ **Resources available**: Have time/budget for discovery activities
- ✅ **Market timing is flexible**: 15-16 weeks to market is acceptable

### Choose Dogfooding-First If:
- ✅ **Personal use case is clear**: Ateles integration is primary use case
- ✅ **Technical validation is critical**: Need real-world usage to validate determinism, MCP integration
- ✅ **Speed to value is critical**: Need usable product quickly (12 weeks vs. 15-16 weeks)
- ✅ **Resources are limited**: Want to focus all time on building
- ✅ **Market validation can be deferred**: Can validate market fit after dogfooding

---

## 14. Hybrid Approach (Recommended)

**Best of Both Worlds:**
1. **Start with dogfooding**: Build MVP for ateles integration (12 weeks)
2. **Validate through usage**: Real usage validates technical feasibility, integration patterns
3. **Then conduct discovery**: After dogfooding, conduct discovery with working product
4. **Iterate based on findings**: Discovery findings inform v1.1+ features
5. **Market after validation**: Launch marketing after both dogfooding and discovery validation

**Advantages:**
- ✅ Faster time to personal value (12 weeks)
- ✅ Real usage validates technical feasibility
- ✅ Discovery validates market fit with working product (stronger validation)
- ✅ Lower risk: Technical validation first, then market validation
- ✅ Better discovery: Can show working product in discovery interviews

**Timeline:**
- Build + Dogfooding: 12 weeks
- Discovery: 3-4 weeks (with working product)
- Marketing: 4 weeks (post-discovery)
- **Total**: ~19-20 weeks (same as discovery-first, but with working product earlier)

---

## 15. Conclusion

**Discovery-First Advantages:**
- Better external/market validation
- Better business viability validation
- Better strategic positioning validation
- Lower market fit risk
- Lower business model risk

**Dogfooding-First Advantages:**
- Faster time to personal value
- Better technical validation through real usage
- Better ateles-specific validation
- Lower resource requirements
- Faster iteration cycles
- Lower technical risk

**Recommendation:**
- **For ateles integration use case**: **Dogfooding-First** is recommended
  - Clear use case (ateles integration)
  - Technical validation is critical (determinism, MCP integration)
  - Speed to value is important
  - Market validation can be deferred

- **For broader market launch**: **Hybrid Approach** is recommended
  - Start with dogfooding (12 weeks)
  - Then conduct discovery with working product (3-4 weeks)
  - Then launch marketing (4 weeks)
  - Total: ~19-20 weeks, but with working product earlier

**Key Insight:**
Dogfooding-first is optimal when:
1. Personal use case is clear and representative
2. Technical validation is critical
3. Speed to value is important
4. Market validation can be deferred

Discovery-first is optimal when:
1. Market validation is critical
2. Business viability is uncertain
3. Competitive positioning is critical
4. Resources are available for discovery
