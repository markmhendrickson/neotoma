## v1.0.0 Handle Registration
### Purpose
Track registration status for domain names, social media handles, and platform accounts required for v1.0.0 marketing activities.
### Priority Handles
**Target Name**: `neotoma` (primary), fallbacks: `neotomaio`, `useneotoma`, `neotomahq`, `neotomaco`
### 1. Domain Names
**Priority**: P0 (Required for launch)
| Domain         | Status       | Owner             | Registrar | Cost         | Notes                         |
| -------------- | ------------ | ----------------- | --------- | ------------ | ----------------------------- |
| neotoma.com    | ✗ TAKEN      | Unknown (privacy) | -         | -            | Registered, privacy protected |
| neotoma.app    | ✗ TAKEN      | Unknown           | -         | -            | Registered, not available     |
| neotoma.ai     | ✓ AVAILABLE  | -                 | -         | ~$74-89/year | Available for registration    |
| neotoma.io     | ✓ REGISTERED | Mark Hendrickson  | -         | -            | Already owned                 |
| getneotoma.com | ✓ AVAILABLE  | -                 | -         | ~$10-15/year | Available for registration    |
| useneotoma.com | ✓ AVAILABLE  | -                 | -         | ~$10-15/year | Available for registration    |
**Recommendation**: Use `neotoma.io` as primary domain (already owned). Optionally register `neotoma.ai` for AI-specific positioning.
**Action Items:**
- [x] Check availability for all priority domains
- [x] Primary domain already owned (neotoma.io)
- [ ] Configure DNS for neotoma.io
- [ ] Configure email forwarding for neotoma.io
- [ ] Optionally register neotoma.ai for AI positioning
- [ ] Set up domain privacy/WHOIS protection (if not already enabled)
### 2. Social Media Handles
#### 2.1 Twitter/X (P0)
**Justification**: Primary marketing platform per `marketing_plan.md`
| Handle      | Status    | Owner        | Notes                                                    |
| ----------- | --------- | ------------ | -------------------------------------------------------- |
| @neotoma    | ✗ TAKEN   | George McCoy | Inactive account (0 following, 3 followers, joined 2007) |
| @neotomaio  | ? Unknown | -            | Not checked (references .io domain)                      |
| @useneotoma | ? Unknown | -            | Not checked                                              |
| @neotomahq  | ? Unknown | -            | Not checked                                              |
| @neotomaco  | ? Unknown | -            | Not checked                                              |
| @getneotoma | ✗ TAKEN   | Unknown      | Account exists                                           |
**Recommendation**: Check and register `@neotomaio` (references owned domain) or `@useneotoma` immediately. Consider reaching out to @neotoma owner to purchase/acquire handle.
**Action Items:**
- [ ] Check handle availability
- [ ] Register primary handle
- [ ] Complete profile setup (bio, avatar, header image)
- [ ] Verify account (if possible)
- [ ] Configure OAuth for marketing automation
#### 2.2 LinkedIn (P1)
**Justification**: Secondary platform for High-Context Knowledge Workers segment
| Type         | Handle/URL         | Status      | Owner            | Notes                         |
| ------------ | ------------------ | ----------- | ---------------- | ----------------------------- |
| Company Page | /company/neotoma   | ✓ AVAILABLE | -                | Page doesn't exist, available |
| Company Page | /company/neotomaio | ? Unknown   | -                | Not checked                   |
| Personal     | (Mark's existing)  | ✓ Active    | Mark Hendrickson | Use for personal posts        |
**Recommendation**: Register `/company/neotoma` company page.
**Action Items:**
- [ ] Check company page availability
- [ ] Create company page
- [ ] Complete company profile (description, logo, cover image, website)
- [ ] Link to Mark's personal account
#### 2.3 Instagram (P2)
**Justification**: Lower priority, but useful for brand consistency
| Handle      | Status    | Owner | Notes                                                       |
| ----------- | --------- | ----- | ----------------------------------------------------------- |
| @neotoma    | ? Unclear | -     | Not publicly accessible (deleted, unregistered, or private) |
| @neotomaio  | ? Unknown | -     | Not checked                                                 |
| @useneotoma | ? Unknown | -     | Not checked                                                 |
**Recommendation**: Attempt to register `@neotoma` first, fallback to `@neotomaio` or `@useneotoma` if unavailable.
**Action Items:**
- [ ] Check handle availability
- [ ] Register primary handle
- [ ] Complete profile setup
- [ ] Reserve but defer active use until post-v1.0.0
#### 2.4 Facebook (P2)
**Justification**: Low priority, brand consistency only
| Type | Handle/URL | Status        | Owner | Notes    |
| ---- | ---------- | ------------- | ----- | -------- |
| Page | /neotoma   | ☐ Not checked | -     | Primary  |
| Page | /neotomaio | ☐ Not checked | -     | Fallback |
**Action Items:**
- [ ] Check page availability
- [ ] Create page
- [ ] Reserve but defer active use until post-v1.0.0
### 3. Developer Platforms
#### 3.1 GitHub (P0)
**Justification**: Already in use, ensure org/repo naming consistency
| Type         | Handle  | Status       | Owner            | Notes        |
| ------------ | ------- | ------------ | ---------------- | ------------ |
| Organization | neotoma | ✓ Registered | Mark Hendrickson | Current org  |
| Repository   | neotoma | ✓ Registered | neotoma org      | Current repo |
**Action Items:**
- [x] Organization registered
- [ ] Update org profile (bio, website, logo)
- [ ] Update repo description and README
- [ ] Add topics/tags for discoverability
#### 3.2 npm (P1)
**Justification**: Package distribution (if applicable)
| Package Name  | Status        | Owner | Notes          |
| ------------- | ------------- | ----- | -------------- |
| neotoma       | ☐ Not checked | -     | Primary        |
| @neotoma/core | ☐ Not checked | -     | Scoped package |
**Action Items:**
- [ ] Check package name availability
- [ ] Register npm organization (@neotoma)
- [ ] Reserve package names (defer publishing until ready)
### 4. Community Platforms
#### 4.1 Reddit (P1)
**Justification**: Community engagement on AI tool subreddits
| Type      | Handle      | Status      | Owner | Notes                                          |
| --------- | ----------- | ----------- | ----- | ---------------------------------------------- |
| User      | u/neotoma   | ✓ AVAILABLE | -     | Username doesn't exist, available              |
| User      | u/neotomaio | ? Unknown   | -     | Not checked                                    |
| Subreddit | r/neotoma   | ? Unknown   | -     | Not checked (subreddit separate from username) |
**Recommendation**: Register `u/neotoma` username immediately.
**Action Items:**
- [ ] Check username availability
- [ ] Register primary username
- [ ] Build karma before launch (participate in AI tool communities)
- [ ] Defer subreddit creation until post-v1.0.0
#### 4.2 Discord (P1)
**Justification**: Community server for users
| Type       | Handle   | Status              | Owner | Notes                  |
| ---------- | -------- | ------------------- | ----- | ---------------------- |
| Server     | Neotoma  | ☐ Not created       | -     | Community server       |
| Vanity URL | /neotoma | ☐ Not available yet | -     | Requires server boosts |
**Action Items:**
- [ ] Create Discord server
- [ ] Set up channels and roles
- [ ] Configure moderation and rules
- [ ] Defer active promotion until post-launch
#### 4.3 Product Hunt (P0)
**Justification**: Launch day platform
| Type          | Status        | Owner            | Notes                |
| ------------- | ------------- | ---------------- | -------------------- |
| Maker Account | ☐ Not checked | Mark Hendrickson | Use personal account |
| Product Page  | Not created   | -                | Create on launch day |
**Action Items:**
- [ ] Verify Mark's maker account exists
- [ ] Build maker reputation (hunt/upvote other products)
- [ ] Prepare product assets (logo, screenshots, video)
- [ ] Schedule launch date
#### 4.4 Hacker News (P0)
**Justification**: Launch day platform ("Show HN")
| Type         | Status        | Owner            | Notes                |
| ------------ | ------------- | ---------------- | -------------------- |
| User Account | ☐ Not checked | Mark Hendrickson | Use personal account |
**Action Items:**
- [ ] Verify Mark's HN account exists and is active
- [ ] Build karma (comment on relevant threads)
- [ ] Prepare "Show HN" post
#### 4.5 Indie Hackers (P0)
**Justification**: Primary launch platform
| Type         | Status        | Owner            | Notes                |
| ------------ | ------------- | ---------------- | -------------------- |
| User Account | ☐ Not checked | Mark Hendrickson | Use personal account |
| Product Page | Not created   | -                | Create pre-launch    |
**Action Items:**
- [ ] Verify Mark's IH account exists
- [ ] Build reputation (engage in community)
- [ ] Create product page
- [ ] Post build-in-public updates
### 5. Email Services
**Priority**: P0 (Required for transactional emails)
| Service         | Handle/Domain      | Status         | Owner | Notes                |
| --------------- | ------------------ | -------------- | ----- | -------------------- |
| Email Domain    | @neotoma.io        | Pending config | -     | Primary email domain |
| Support Email   | support@neotoma.io | Pending config | -     | Support inbox        |
| No-Reply Email  | noreply@neotoma.io | Pending config | -     | Transactional emails |
| Marketing Email | Mark's personal    | -              | Mark  | Pre-launch campaigns |
**Action Items:**
- [ ] Configure email service (e.g., SendGrid, Postmark)
- [ ] Set up transactional email templates
- [ ] Configure SPF, DKIM, DMARC records
- [ ] Test email deliverability
### 6. Analytics & Tracking
**Priority**: P1 (Required for metrics)
| Service             | Handle/Property      | Status      | Owner | Notes                       |
| ------------------- | -------------------- | ----------- | ----- | --------------------------- |
| Google Analytics    | neotoma.com property | Not created | -     | Web analytics               |
| Plausible Analytics | neotoma.com          | Not created | -     | Privacy-focused alternative |
**Action Items:**
- [ ] Choose analytics platform
- [ ] Create property/site
- [ ] Configure UTM tracking for marketing campaigns
- [ ] Set up goal tracking (signups, uploads, activation)
### 7. Registration Priority Order
**Phase 1 (Immediate - Week -4 to Week -2):**
1. Domain name (primary + fallback)
2. Twitter/X handle
3. GitHub profile updates
4. Email configuration
5. Indie Hackers product page
**Phase 2 (Pre-Launch - Week -2 to Week 0):**
6. LinkedIn company page
7. Product Hunt maker profile
8. Hacker News account prep
9. Reddit username
10. Analytics setup
**Phase 3 (Post-Launch - Week 1+):**
11. Discord server
12. Instagram handle
13. Facebook page
14. npm package names
15. Subreddit (deferred)
### 8. Budget Estimate
| Item              | Cost         | Frequency | Notes                |
| ----------------- | ------------ | --------- | -------------------- |
| Domain names (x4) | ~$50-200     | Annual    | .com, .app, .ai, .io |
| Email service     | $0-10        | Monthly   | Free tier initially  |
| Analytics         | $0           | -         | Use free tiers       |
| Social media      | $0           | -         | Free accounts        |
| **Total Year 1**  | **~$50-200** | -         | Domain names only    |
### 9. Handle Registration Log
**Format**: `YYYY-MM-DD - [Handle] - [Status] - [Owner] - [Notes]`
**Availability Check Results (2025-12-11):**
- neotoma.com - TAKEN (privacy protected)
- neotoma.app - TAKEN
- neotoma.ai - **AVAILABLE** (~$74-89/year)
- neotoma.io - **ALREADY OWNED** (registered)
- getneotoma.com - **AVAILABLE** (~$10-15/year)
- useneotoma.com - **AVAILABLE** (~$10-15/year)
- @neotoma (Twitter) - TAKEN (inactive account, 3 followers)
- @neotomaio (Twitter) - Not checked
- @useneotoma (Twitter) - Not checked
- @getneotoma (Twitter) - TAKEN
- /company/neotoma (LinkedIn) - **AVAILABLE**
- @neotoma (Instagram) - Unclear (not publicly accessible)
- u/neotoma (Reddit) - **AVAILABLE**
_No registrations completed yet. Update this section as handles are registered._
### 10. Status
- **Current Status**: Primary domain owned, social handles ready for registration
- **Owner**: Mark Hendrickson
- **Next Steps**:
  1. ✓ Check domain availability (completed 2025-12-11)
  2. ✓ Check social handle availability (completed 2025-12-11)
  3. ✓ Primary domain already owned: `neotoma.io`
  4. **Configure DNS for `neotoma.io`** (immediate action required)
  5. **Configure email for `neotoma.io`** (immediate action required)
  6. **Register Twitter handle: `@neotomaio` or `@useneotoma`** (immediate action required)
  7. **Register LinkedIn company page: `/company/neotoma`** (immediate action required)
  8. **Register Reddit username: `u/neotoma`** (immediate action required)
  9. Attempt Instagram registration: `@neotoma`
  10. Complete social profile setup (bios, logos, links)
  11. Optionally register `neotoma.ai` for AI positioning
### 11. Recommended Registration Package
**Immediate (This Week):**
1. ✓ **neotoma.io** - Primary domain (already owned)
2. **Configure DNS for neotoma.io** - Point to hosting
3. **Configure email for neotoma.io** - Set up transactional email
4. **@neotomaio** or **@useneotoma** - Twitter handle (free)
5. **u/neotoma** - Reddit username (free)
6. **/company/neotoma** - LinkedIn company page (free)
**Total Cost**: $0 (primary domain already owned)
**Optional Registrations:**
- **neotoma.ai** - AI-specific positioning (~$74-89/year)
- **useneotoma.com** - Alternative/redirect (~$10-15/year)
**Optional Acquisition:**
- Consider reaching out to @neotoma (Twitter) owner to purchase handle
- Consider reaching out to neotoma.com owner to purchase domain (likely expensive)
**Phase 2 (After Initial Setup):**
7. Set up DNS records (SPF, DKIM, DMARC)
8. Instagram (@neotoma or @neotomaio/@useneotoma fallback)
9. Product Hunt maker profile setup
10. Hacker News account prep
### 11. Related Documents
- `marketing_plan.md` — Platform prioritization and marketing strategy
- `pre_launch_marketing_plan.md` — Pre-launch activities requiring handles
- `post_launch_marketing_plan.md` — Post-launch activities requiring handles
- `deployment_strategy.md` — Domain and infrastructure configuration
