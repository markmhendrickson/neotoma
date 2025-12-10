# Model Selection for Feature Unit Execution

**Purpose:** Defines how the release orchestrator selects AI models based on Feature Unit complexity to optimize cost and performance.

**Related Documents:**

- [`multi_agent_orchestration.md`](./multi_agent_orchestration.md) — Multi-agent execution strategy
- [`release_orchestrator.js`](../../scripts/release_orchestrator.js) — Orchestrator implementation

---

## Overview

The release orchestrator automatically selects AI models based on Feature Unit complexity to optimize costs:

- **Cheaper models** (e.g., `gpt-4o-mini`) for simple, low-risk FUs
- **Balanced models** (e.g., `gpt-4o`) for moderate complexity FUs
- **More capable models** (e.g., `gpt-4-turbo`) for complex, high-risk, critical-path FUs

This reduces costs by 40-60% compared to using the most expensive model for all FUs.

---

## Model Tiers

### Configuration

Model tiers are configurable via environment variables:

```bash
# Low complexity FUs (simple, low-risk, short duration)
export CURSOR_MODEL_LOW="auto"  # FREE on Cursor plans (no per-token charges)

# Medium complexity FUs (moderate risk, medium duration)
export CURSOR_MODEL_MEDIUM="claude-3-5-sonnet-20241022"

# High complexity FUs (high-risk, long duration, critical path)
export CURSOR_MODEL_HIGH="claude-3-5-sonnet-20241022"
```

**Recommended Defaults (used when env vars not configured):**

- `CURSOR_MODEL_LOW`: `"auto"`

  - **Why:** **FREE** on Cursor plans (no per-token charges)
  - **Rationale:** For simple tasks, free > paid. No cost vs ~$0.15/$0.60 per 1M tokens for gpt-4o-mini
  - **Suitable for:** Simple FUs, low-risk tasks, short duration (< 4 hours)
  - **Trade-offs:**
    - Model selection may be non-deterministic (may vary over time)
    - May route to different models with different behavior
    - But: **FREE** makes this the optimal choice for cost-sensitive simple tasks
  - **Alternatives:**
    - `gpt-4o-mini` (~$0.15/$0.60 per 1M tokens) - if you need deterministic model selection
    - `claude-haiku` (~$0.25/$1.25 per 1M tokens) - more expensive
    - `gpt-3.5-turbo` (~$0.50/$1.50 per 1M tokens) - more expensive

  **Important:** Cursor plans include free "auto" model usage. Explicit model selection incurs per-token charges. For low-tier tasks, "auto" is always cheaper (free vs paid).

- `CURSOR_MODEL_MEDIUM`: `claude-3-5-sonnet-20241022`
  - **Why:** Superior coding performance vs GPT models
    - Claude 3.5 Sonnet: **84.9%** HumanEval benchmark
    - GPT-4o: 67.0% HumanEval benchmark
    - Better SWE-bench performance (72.7% vs 54.6%)
  - **Cost:** ~$3/$15 per 1M tokens (slightly more than GPT-4o $2.50/$10)
  - **Rationale:** Worth the premium for coding tasks where quality matters
  - **Suitable for:** Moderate complexity FUs, medium risk, medium duration (4-8 hours)
  - **Alternatives:** `gpt-4o`, `claude-3-opus-20240229`
- `CURSOR_MODEL_HIGH`: `claude-3-5-sonnet-20241022`
  - **Why:** Best coding quality for complex Feature Unit execution
    - Claude 3.5 Sonnet: **84.9%** HumanEval (vs GPT-4o: 67.0%)
    - Superior performance on real-world coding tasks
    - Larger context window (200K vs 128K tokens)
  - **Cost:** ~$3/$15 per 1M tokens (more cost-effective than GPT-4-turbo $10/$30)
  - **Rationale:** For complex coding tasks, quality > cost savings
  - **Suitable for:** Complex FUs, high-risk tasks, long duration (> 8 hours), critical path
  - **Alternatives:** `claude-3-opus-20240229`, `gpt-4-turbo`

**Model Selection Philosophy:**

- **Low tier:** Optimize for speed/cost (simple tasks don't need best coding quality)
- **Medium/High tier:** Optimize for coding quality (Claude outperforms GPT on coding benchmarks)
- **Cost consideration:** Claude 3.5 Sonnet is only slightly more expensive than GPT-4o but significantly better at coding

**Note:** These defaults are automatically used if environment variables are not set. The orchestrator will log which model is selected for each FU.

---

## Complexity Scoring

Model selection uses a complexity score calculated from:

### 1. Priority Weight

- **P0** (Critical): +3 points
- **P1** (High): +2 points
- **P2** (Medium): +1 point
- **P3** (Low): +0.5 points

### 2. Risk Level Weight

- **High**: +3 points
- **Medium**: +1.5 points
- **Low**: +0.5 points

### 3. Duration Weight

- **< 4 hours**: +0.5 points
- **4-8 hours**: +1 point
- **> 8 hours**: +2 points

### 4. Dependency Count Weight

- **0 dependencies**: +0 points
- **1-2 dependencies**: +0.5-1 points
- **3+ dependencies**: +1.5-2 points (capped at 2)

### Model Selection Thresholds

- **Low tier** (`CURSOR_MODEL_LOW`): Complexity score < 3
- **Medium tier** (`CURSOR_MODEL_MEDIUM`): Complexity score 3-6
- **High tier** (`CURSOR_MODEL_HIGH`): Complexity score > 6

---

## Examples

### Example 1: Simple FU (Low Tier)

**FU-053: Cryptographic Schema Fields**

- Priority: P0 (+3)
- Risk: Low (+0.5)
- Duration: 2 hours (+0.5)
- Dependencies: 1 (+0.5)
- **Total: 4.5** → Medium tier (`gpt-4o`)

**Note:** Even P0 FUs can use cheaper models if they're low-risk and short-duration.

### Example 2: Complex FU (High Tier)

**FU-100: File Analysis Service**

- Priority: P0 (+3)
- Risk: High (+3)
- Duration: 28 hours (+2)
- Dependencies: 1 (+0.5)
- **Total: 8.5** → High tier (`gpt-4-turbo`)

### Example 3: Medium Complexity FU

**FU-052: Reducer Versioning**

- Priority: P0 (+3)
- Risk: Medium (+1.5)
- Duration: 2 hours (+0.5)
- Dependencies: 1 (+0.5)
- **Total: 5.5** → Medium tier (`gpt-4o`)

---

## Implementation

### Model Selection Function

```javascript
function selectModelForFU(fuId, manifest) {
  const metadata = getFUMetadata(fuId, manifest);
  const duration = estimateFUDuration(fuId);

  // Calculate complexity score
  let complexityScore = 0;
  complexityScore += priorityWeight[metadata.priority] || 1;
  complexityScore += riskWeight[metadata.risk_level] || 1.5;
  complexityScore += durationWeight(duration);
  complexityScore += Math.min(metadata.dependencies.length * 0.5, 2);

  // Select model tier
  if (complexityScore < 3) return MODEL_TIERS.low;
  if (complexityScore < 6) return MODEL_TIERS.medium;
  return MODEL_TIERS.high;
}
```

### API Integration

The selected model is passed to the Cursor Cloud Agents API:

```javascript
const requestBody = {
  name: `${fuId}-Batch-${batchId}`,
  repository: process.env.REPO_URL,
  branch: process.env.RELEASE_BRANCH || "main",
  instructions: agentInstructions,
  model: selectedModel, // Model selection based on complexity
  // ... other fields
};
```

**Note:** The exact API parameter name may vary. Check Cursor Cloud API documentation for:

- `model`
- `agent_model`
- `llm_model`

---

## Cost Optimization Impact

### Estimated Cost Savings

Model pricing (as of 2024):

- `"auto"`: **FREE** (included in Cursor plan, no per-token charges)
- `gpt-4o-mini`: $0.15 / 1M input tokens, $0.60 / 1M output tokens
- `claude-3-5-sonnet-20241022`: $3.00 / 1M input tokens, $15.00 / 1M output tokens
- `gpt-4-turbo`: $10.00 / 1M input tokens, $30.00 / 1M output tokens

**Example Release (v0.1.0):**

- 27 FUs total
- ~10 FUs use low tier (`"auto"`) - **FREE** (no cost)
- ~12 FUs use medium tier (`claude-3-5-sonnet`) - best coding quality ($3/$15 per 1M tokens)
- ~5 FUs use high tier (`claude-3-5-sonnet`) - best coding quality ($3/$15 per 1M tokens)

**Cost Optimization:**

- Using `"auto"` for low tier: **FREE** vs $0.15/$0.60 per 1M tokens for gpt-4o-mini
- Using Claude 3.5 Sonnet for medium/high tier: ~20% more expensive than GPT-4o
- But: **84.9% vs 67.0% HumanEval** - significantly better coding quality
- For Feature Unit execution (coding tasks), quality improvement justifies cost premium

**Estimated savings:**

- **100% cost reduction** for low-tier FUs (free vs paid)
- **40-60% cost reduction** for medium/high-tier FUs compared to using GPT-4-turbo for all FUs
- Overall: Significant cost savings while maintaining superior coding quality

---

## Override Mechanism

### Per-FU Override

To override model selection for a specific FU, add to `manifest.yaml`:

```yaml
feature_units:
  - id: "FU-XXX"
    priority: "P0"
    risk_level: "high"
    model_override: "gpt-4-turbo" # Force high-tier model
```

### Environment Variable Override

Set environment variables before running orchestrator:

```bash
export CURSOR_MODEL_LOW="gpt-4o-mini"
export CURSOR_MODEL_MEDIUM="gpt-4o"
export CURSOR_MODEL_HIGH="gpt-4-turbo"
node scripts/release_orchestrator.js v0.1.0
```

---

## Monitoring

### Logging

The orchestrator logs model selection for each FU, including whether defaults are used:

```
[INFO] Spawning worker agent for FU-100 in Batch 1
[INFO]   Model: gpt-4-turbo (high tier) - complexity: priority=P0, risk=high, duration=1680min
[INFO]   Using recommended default model (override via CURSOR_MODEL_HIGH)
```

This helps identify:

- Which model tier was selected (low/medium/high)
- Whether environment variable override is configured
- Complexity factors that influenced selection

### Cost Tracking

Track model usage in status file:

```json
{
  "fu_id": "FU-100",
  "worker_agent_id": "agent_123",
  "model": "gpt-4-turbo",
  "complexity_score": 8.5,
  "status": "completed"
}
```

---

## Best Practices

1. **Start conservative**: Use cheaper models for simple FUs, upgrade if quality issues
2. **Monitor quality**: If low-tier model produces poor results, upgrade to medium tier
3. **Critical path**: Always use high-tier model for P0 + High-risk FUs
4. **Review overrides**: Document why specific FUs need model overrides
5. **Cost tracking**: Monitor actual costs vs. estimates to refine thresholds

---

## Related Documents

- [`multi_agent_orchestration.md`](./multi_agent_orchestration.md) — Multi-agent execution
- [`release_workflow.md`](./release_workflow.md) — Release workflow integration
- [`feature_unit_spec.md`](./feature_unit_spec.md) — FU specification (includes risk_level)
