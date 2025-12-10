## Cross-Platform Signal Detection Strategy

_(How to detect ICP signals across target platform and linked platforms)_

---

### Purpose

When generating leads for direct outreach, we need to decide: Should we check posts on the target platform (where we're reaching out) or posts on linked platforms (from their profile)? This document defines the strategy.

---

### Recommendation: Check Both, Prioritize Target Platform

**Strategy**: Check target platform first (most relevant), then enrich with linked platforms (additional signals)

**Rationale**:

- **Target platform posts**: Most relevant to outreach context, easier to access, directly related to platform you're using
- **Linked platform posts**: Additional signals, people often post more on some platforms (Twitter/X), fills gaps if target platform has limited activity
- **Combined approach**: Maximum signal detection while maintaining relevance

---

### Signal Detection Priority

#### 1. Target Platform (Primary — Weight 1.0)

**Check posts/activity on the platform you're reaching out on:**

- **LinkedIn Outreach**: Check LinkedIn posts, LinkedIn activity feed
- **Twitter/X Outreach**: Check Twitter/X posts, Twitter/X activity feed
- **GitHub Outreach**: Check GitHub activity, repositories, commits

**Why Primary**:

- Most relevant to outreach context
- Shows activity on platform you're using
- Easier to access (already have platform access)
- Directly related to how you found them

**Detection**:

- Search recent posts (last 30-90 days)
- Check activity feed for AI tool mentions
- Look for subscription mentions, AI tool usage
- Check engagement patterns (likes, comments, shares)

---

#### 2. Linked Platforms (Secondary — Weight 0.6)

**Check posts/activity on platforms linked from their profile:**

- **From LinkedIn**: Extract Twitter/X handle, GitHub username (if linked in profile)
- **From Twitter/X**: Extract LinkedIn URL, GitHub username (if linked in bio)
- **From GitHub**: Extract Twitter/X handle, LinkedIn URL (if linked in profile)

**Why Secondary**:

- Additional signals (people often post more on Twitter/X than LinkedIn)
- Fills gaps if target platform has limited activity
- Provides cross-platform validation
- But less directly relevant to outreach context

**Detection**:

- Extract linked platform handles/URLs from profile
- Search linked platform posts for subscription mentions
- Check linked platform activity for AI tool usage
- Aggregate signals across platforms

**Limitations**:

- Not all profiles link other platforms
- Requires cross-platform API access
- May have rate limits
- Some platforms don't allow easy extraction of linked profiles

---

### Implementation by Platform

#### LinkedIn Sales Navigator

**Target Platform (LinkedIn)**:

- Check LinkedIn posts for subscription mentions
- Check LinkedIn activity feed for AI tool usage
- Search LinkedIn profile/headline for keywords

**Linked Platforms**:

- Extract Twitter/X handle from LinkedIn profile (if linked)
- Extract GitHub username from LinkedIn profile (if linked)
- Check Twitter/X posts (if handle found)
- Check GitHub activity (if username found)

**Output**: `linkedin_signals` (primary), `twitter_signals` (secondary), `github_signals` (secondary)

---

#### Twitter/X Search

**Target Platform (Twitter/X)**:

- Check Twitter/X posts for subscription mentions
- Check Twitter/X bio for subscription mentions
- Search Twitter/X activity feed for AI tool usage

**Linked Platforms**:

- Extract LinkedIn URL from Twitter/X bio (if linked)
- Extract GitHub username from Twitter/X bio (if linked)
- Check LinkedIn posts (if URL found)
- Check GitHub activity (if username found)

**Output**: `twitter_signals` (primary), `linkedin_signals` (secondary), `github_signals` (secondary)

---

#### GitHub User Search

**Target Platform (GitHub)**:

- Check GitHub repositories for AI-related projects
- Check GitHub activity for AI tool usage
- Search GitHub profile/bio for keywords

**Linked Platforms**:

- Extract Twitter/X handle from GitHub profile (if linked)
- Extract LinkedIn URL from GitHub profile (if linked)
- Check Twitter/X posts (if handle found)
- Check LinkedIn posts (if URL found)

**Output**: `github_signals` (primary), `twitter_signals` (secondary), `linkedin_signals` (secondary)

---

### Signal Aggregation in Unified Lead Manager

**Combining Signals Across Platforms**:

```javascript
// Pseudo-code for signal aggregation
function aggregateSignals(lead) {
  const targetPlatformSignals = getTargetPlatformSignals(lead); // Weight 1.0
  const linkedPlatformSignals = getLinkedPlatformSignals(lead); // Weight 0.6

  const aggregatedScore =
    targetPlatformSignals.score * 1.0 + linkedPlatformSignals.score * 0.6;

  return {
    ...lead,
    aggregated_signals: aggregatedScore,
    signal_sources: {
      target: targetPlatformSignals,
      linked: linkedPlatformSignals,
    },
  };
}
```

**Scoring Logic**:

- Target platform signals: Full weight (1.0)
- Linked platform signals: Reduced weight (0.6)
- Combined score: Weighted average
- Missing linked platform: No penalty (just use target platform signals)

---

### Benefits of Cross-Platform Detection

**Advantages**:

1. **More Signals**: People post more on some platforms (Twitter/X) than others (LinkedIn)
2. **Gap Filling**: If target platform has limited activity, linked platforms provide signals
3. **Validation**: Cross-platform signals validate each other (more confidence)
4. **Comprehensive**: Captures full picture of user's AI tool usage

**Example**:

- LinkedIn profile: Limited posts, but links Twitter/X
- Twitter/X posts: Multiple mentions of "ChatGPT Plus", "Claude Pro"
- Result: Strong subscription signals from Twitter/X enrich LinkedIn lead

---

### Limitations and Mitigation

**Limitations**:

- Not all profiles link other platforms
- Cross-platform API access required
- Rate limits may apply
- Some platforms don't expose linked profiles easily

**Mitigation**:

- Make linked platform detection optional (graceful degradation)
- Prioritize target platform (works even if linked platforms unavailable)
- Cache linked platform data to reduce API calls
- Use rate limiting and delays for cross-platform checks

---

### Recommended Workflow

**For Each Lead**:

1. **Check Target Platform** (Required):

   - Search posts on platform you're reaching out on
   - Extract subscription signals, AI tool usage
   - Score based on target platform signals

2. **Extract Linked Platforms** (Optional):

   - Parse profile for linked platform handles/URLs
   - If found, check linked platform posts
   - Extract additional signals from linked platforms

3. **Aggregate Signals**:

   - Combine target platform signals (weight 1.0) + linked platform signals (weight 0.6)
   - Calculate aggregated ICP match score
   - Flag leads with strong signals from any platform

4. **Export with Signal Sources**:
   - Include `target_platform_signals` field
   - Include `linked_platform_signals` field
   - Include `aggregated_signals` field
   - Include `signal_sources` breakdown

---

### Implementation Notes

**Tool Updates Needed**:

1. **LinkedIn Sales Navigator Tool**:

   - Extract Twitter/X handle, GitHub username from LinkedIn profiles
   - Check LinkedIn posts (target platform)
   - Check Twitter/X posts (if handle found)
   - Check GitHub activity (if username found)

2. **Twitter/X Search Tool**:

   - Extract LinkedIn URL, GitHub username from Twitter/X bios
   - Check Twitter/X posts (target platform)
   - Check LinkedIn posts (if URL found)
   - Check GitHub activity (if username found)

3. **Unified Lead Manager**:
   - Aggregate signals across platforms
   - Weight target platform higher than linked platforms
   - Export signal breakdown for transparency

**API Requirements**:

- LinkedIn API: Profile data, posts (if available)
- Twitter/X API: Bio parsing, posts search
- GitHub API: Profile data, activity feed

**Rate Limits**:

- Respect platform rate limits
- Cache linked platform data
- Use delays between cross-platform checks
- Make linked platform checks optional (don't fail if unavailable)

---

### Success Metrics

**Signal Detection Rate**:

- Target platform signals: 60-70% of leads (expected)
- Linked platform signals: 30-40% of leads (if profiles link platforms)
- Combined signals: 70-80% of leads (target + linked)

**Signal Quality**:

- Target platform signals: Higher relevance (weight 1.0)
- Linked platform signals: Supporting evidence (weight 0.6)
- Combined score: More accurate ICP matching

**Performance**:

- Target platform check: Fast (already have access)
- Linked platform check: Slower (requires cross-platform API calls)
- Recommendation: Make linked platform checks optional/async
