## Discovery Lead Sourcing — Filtering Keywords Reference

_(Complete list of all filtering keywords and criteria used across all platforms)_

---

### LinkedIn Sales Navigator

**Job Title Keywords:**

- `founder`
- `indie hacker`
- `AI engineer`
- `product manager`

**Company Size:**

- `1-10 employees` (for indie hackers)

**Other Filters:**

- Keywords in profile/headline
- Industry
- Location

**Example Filter String:**

```
job_title:founder|indie hacker,company_size:1-10
```

---

### LinkedIn Connections Export

**Position/Job Title Keywords:**

- `founder`
- `indie hacker`
- `AI engineer`

**Other Filters:**

- Company name
- Industry (if enriched via Sales Navigator)
- Date connected (recent vs. old connections)

**Example Filter String:**

```
position:founder|indie hacker|AI engineer
```

---

### Twitter/X Search

**Bio Keywords:**

- `building with AI`
- `Claude user`
- `indie hacker`

**Follows Accounts:**

- `anthropicai`
- `openai`

**Other Filters:**

- `--min-followers 100`

**Example Filter String:**

```
--bio-keywords "building with AI|Claude user|indie hacker"
--follows-accounts "anthropicai|openai"
--min-followers 100
```

---

### Indie Hackers Search

**Keywords:**

- `AI`
- `Claude`
- `ChatGPT`

**Other Filters:**

- `--min-posts 5`

**Example Filter String:**

```
--keywords "AI|Claude|ChatGPT"
--min-posts 5
```

---

### GitHub User Search

**Repository Topics:**

- `AI`
- `automation`
- `productivity`

**Other Filters:**

- `--min-stars 10`
- `--min-recent-activity "2024-01-01"`

**Example Filter String:**

```
--repo-topics "AI|automation|productivity"
--min-stars 10
--min-recent-activity "2024-01-01"
```

---

### Reddit/Discord Search

**Subreddits:**

- `ChatGPT`
- `ClaudeAI`

**Other Filters:**

- `--min-activity 10`

**Example Filter String:**

```
--subreddits "ChatGPT|ClaudeAI"
--min-activity 10
```

---

### Unified Lead Manager

**ICP Match Score Threshold:**

- `--min-score 0.7`

**Segment Alignment:**

- `AI-Native Operator`
- `Knowledge Worker`

**Scoring Criteria:**

- Segment alignment (AI-Native Operator vs Knowledge Worker)
- Profile keywords match
- Activity signals
- Engagement with AI tools

**Deduplication Fields:**

- `email`
- `linkedin_url`
- `username`

**Example Filter String:**

```
--min-score 0.7
--dedupe-by email,linkedin_url,username
```

---

### Summary by Platform

| Platform                     | Keyword Types                  | Example Values                                                                |
| ---------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| **LinkedIn Sales Navigator** | Job title, Company size        | `founder`, `indie hacker`, `AI engineer`, `product manager`, `1-10 employees` |
| **LinkedIn Connections**     | Position, Company              | `founder`, `indie hacker`, `AI engineer`                                      |
| **Twitter/X**                | Bio keywords, Follows accounts | `building with AI`, `Claude user`, `indie hacker`, `anthropicai`, `openai`    |
| **Indie Hackers**            | Keywords                       | `AI`, `Claude`, `ChatGPT`                                                     |
| **GitHub**                   | Repo topics                    | `AI`, `automation`, `productivity`                                            |
| **Reddit/Discord**           | Subreddits                     | `ChatGPT`, `ClaudeAI`                                                         |
| **Unified Manager**          | ICP score, Segment             | `0.7`, `AI-Native Operator`, `Knowledge Worker`                               |

---

### Common Filter Patterns

**AI-Native Operator Keywords:**

- `founder`
- `indie hacker`
- `AI engineer`
- `building with AI`
- `Claude user`
- `ChatGPT`
- `AI`
- `automation`
- `productivity`

**Knowledge Worker Keywords:**

- `product manager`
- (Additional keywords to be defined based on ICP profiles)

**AI Tool References:**

- `Claude`
- `ChatGPT`
- `anthropicai`
- `openai`

**Activity Thresholds:**

- Minimum followers: `100`
- Minimum posts: `5`
- Minimum stars: `10`
- Minimum activity: `10`
- Minimum ICP match score: `0.7`

---

### Usage Notes

- All keywords support pipe-separated OR logic (`|`)
- Multiple filter types can be combined with commas (`,`)
- Case-insensitive matching recommended
- Wildcard matching may be supported depending on platform API





