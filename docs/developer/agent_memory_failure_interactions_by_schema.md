# Common Failure Interactions By Supported Schema

This reference lists common "user asks / agent fails" interactions for every supported schema.
Use it for onboarding prompts, demos, QA scenarios, and incident reviews.

## How To Read This

- **Failure interaction example:** A chat exchange where the agent answers from an older record as if it is current.
- **Improper old-data behavior:** The specific stale-data mistake happening behind the response.

## Identity And Relationship Schemas

| Schema | Failure interaction example | Improper old-data behavior |
| --- | --- | --- |
| `person` | "Use Jordan Lee from legal on this thread." -> "Sending to Jordan Lee (Sales)." | Agent resolves to an older identity match and does not notice mismatch. |
| `contact` (`v1.0`, `v1.1`) | "Use Priya's new work email." -> "Sent to priya@oldco.com." | Stale contact fields overwrite newer values. |
| `company` | "Route this to Acme Holdings." -> "Assigned to Acme Logistics account owner." | Duplicate company entities cause stale routing decisions. |
| `address` | "Ship to the updated Austin office." -> "Shipment queued for 210 2nd St." | Old address persists; fulfillment errors. |
| `relationship` | "Mark Maya as Sam's manager." -> "Sam still reports to Alex in follow-up actions." | Old relationship edges survive and are treated as current truth. |

## Conversation And Communication Schemas

| Schema | Failure interaction example | Improper old-data behavior |
| --- | --- | --- |
| `conversation` | "Continue where we left off yesterday." -> "Resuming based on last week's thread." | Agent replays an older thread snapshot as if it were latest context. |
| `message` | "What did I approve in that exchange?" -> "You approved the first draft." | Agent cites an earlier message version, not the final approval update. |
| `agent_message` | "Why did the agent decide that?" -> "It followed the previous policy version." | Agent responses reference outdated internal state with no freshness signal. |
| `email` | "Follow up on the last vendor email." -> "Replying to the January chain now." | Newer email thread exists but stale linkage points to older chain. |
| `note` | "Use my meeting notes from Tuesday." -> "Using Tuesday notes: launch on May 1." | Agent pulls an older note revision and misses corrected decisions. |

## Work, Planning, And Execution Schemas

| Schema | Failure interaction example | Improper old-data behavior |
| --- | --- | --- |
| `task` | "Remind me to submit payroll Friday." -> "Reminder set for last Friday's payroll task." | Agent reuses closed task state as if still active. |
| `goal` | "How does this task map to Q2 goal?" -> "Linked to Q1 retention goal." | Task-goal alignment uses outdated planning links. |
| `project` | "Show all open work for Project Atlas." -> "Showing 18 open items." (actual is 7) | Project scope/status snapshots drift; agent trusts old aggregate state. |
| `flow` | "Run the onboarding flow from step 3." -> "Resuming at step 3 with old checklist." | Flow progression snapshot is stale and misses newer required steps. |
| `event` | "What changed after yesterday's incident?" -> "No change after incident close." | Event chronology replay stops at older timeline state. |

## Finance, Commerce, And Contract Schemas

| Schema | Failure interaction example | Improper old-data behavior |
| --- | --- | --- |
| `account` | "Post this to the operating account." -> "Posted to operating-old." | Account references drift; stale aliases stay authoritative. |
| `balance` | "What was the last verified balance?" -> "Last verified: $412,000." (new reconciliation is $398,200) | Contradictory financial snapshots exist; agent picks older one. |
| `transaction` | "Was invoice 884 paid?" -> "Unpaid as of Feb 2." (paid Feb 14) | Payment state updates fail to supersede older transaction view. |
| `transfer` | "Confirm transfer from treasury to payroll." -> "Confirmed transfer id tx-771." (superseded by corrected tx-771b) | Corrective transfer updates are not treated as latest truth. |
| `purchase` | "Where is the approved laptop purchase?" -> "Still in draft." | Purchase state transitions are stale at query time. |
| `order` | "Has order 492 shipped?" -> "Status: processing." (shipped this morning) | Order lifecycle updates silently drift. |
| `income` | "Tag this as recurring income." -> "Saved as one-time income." | New categorization is overwritten by stale prior value. |
| `fixed_cost` | "What are this month's fixed costs?" -> "Rent, payroll." (missing insurance added yesterday) | Recurring obligations lag behind latest entries. |
| `liability` | "Show liabilities due this quarter." -> "Loan B due next quarter." (date changed last week) | Liability due-date corrections do not supersede old schedule. |
| `contract` | "Which company owns this contract?" -> "Owned by Beta LLC." (assigned to Apex LLC) | Contract ownership updates are stale but treated as final. |
| `holding` | "How many shares are currently held?" -> "12,400 shares." (after sale: 10,900) | Holdings snapshot inconsistency across updates. |
| `wallet` | "Use treasury wallet for payout." -> "Using wallet 0xOLD..." | Wallet rotation updates are ignored; stale key targeted. |
| `crypto_transaction` | "Trace this on-chain payment." -> "Matched to hash 0xabc..." (reorg replaced hash) | Chain reference updates lag; old hash remains linked as current. |
| `tax_event` | "Which transactions triggered this tax event?" -> "Using last quarter's trigger set." | Tax provenance links reflect older event composition. |
| `tax_filing` | "What changed since the last filing?" -> "No changes since draft." | Filing revisions are not replayed in order; stale draft state returned. |

## Personal Context And Activity Schemas

| Schema | Failure interaction example | Improper old-data behavior |
| --- | --- | --- |
| `location` | "Where is the handoff meeting?" -> "At the old office on 3rd Ave." | Updated location is missed; stale place record is reused. |
| `property` | "Which property has the open repair task?" -> "Maple St unit." (task moved to Oak St unit) | Property-task links use older assignment state. |
| `meal` | "Log this as lunch with client." -> "Linked to last month's lunch entry." | New meal event is merged into stale prior record. |
| `exercise` | "Compare this week's workouts." -> "2 workouts this week." (actual 4) | Recent activity entries lag behind older weekly snapshot. |

## Practical QA Use

- Build scenario tests from each row as deterministic replay checks.
- Verify that updates preserve provenance and do not erase prior observations.
- Confirm cross-schema links (for example `task` <-> `person`, `contract` <-> `company`, `tax_event` <-> `transaction`) survive merges and corrections.

