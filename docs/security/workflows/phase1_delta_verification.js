export const meta = {
  name: 'phase1-delta-verification',
  description: 'Bounded delta review of the two follow-up security fixes (resource-URI sort validation + LIMIT/OFFSET clamp)',
  phases: [
    { title: 'Review', detail: 'two lanes over the delta only' },
    { title: 'Verify', detail: 'refute-or-confirm each finding' },
  ],
}

const REPO = '/Users/markmhendrickson/repos/neotoma-wt-sec-advisories'
const DELTA = '/tmp/phase1_delta.diff'

const COMMON = `
You are reviewing ONLY the delta of two follow-up security fixes in the Neotoma repo at ${REPO}
(operator-authorized review of the operator's own product). The delta diff is at ${DELTA} — read it
first, then read the actual changed source for surrounding context. Do NOT re-review the earlier
hotfix (the auth-bypass and the original sort_by SQLi fix were already reviewed and confirmed); focus
strictly on whether THESE TWO NEW CHANGES are correct, bypassable, or break a legitimate flow.

The two changes:
 (A) src/server.ts parseResourceUri now validates the resource-URI 'sort' param with
     isValidSnapshotFieldName(...) before assigning queryParams.sort; a non-identifier value is
     dropped so handlers fall back to their default sort column.
 (B) src/repositories/sqlite/local_db_adapter.ts now integer-clamps LIMIT/OFFSET at the interpolation
     site (asSqlCount throws on a non-integer / negative value; execute() surfaces it as an error
     envelope).

Be adversarial and concrete. For every finding: file:line, exact code, a specific exploit or
breakage scenario (concrete input -> wrong outcome), severity, and a fix. Verify by reading code. If
your lane is clean, say so explicitly — do NOT invent weak findings.`

const LANES = [
  {
    key: 'server-sort-validator',
    prompt: `${COMMON}

YOUR LANE: change (A), the new server.ts sort validator. Answer concretely:
 - Is the validator BYPASSABLE? isValidSnapshotFieldName enforces ^[A-Za-z_][A-Za-z0-9_]*$. Can any
   value that passes it still reach an ORDER BY and cause injection or unintended ordering? Can a
   valid-identifier-but-not-a-real-column value (e.g. 'password', or a column from a different table)
   cause a raw SQLite error or information disclosure through the three resource handlers
   (handleSourceCollection, handleRelationshipCollection[All])?
 - Does the validation actually cover ALL paths that set queryParams.sort, or only the query-string
   path? Is there another entry (POST body, MCP resource read) that sets sort without this guard?
 - Does dropping an invalid sort (silent fallback to default) hide errors in a way that matters, or is
   fallback the right call?
 - Did it BREAK a legitimate resource sort that previously worked (a real column name the handlers
   accept)? Check each handler's default + selected columns.`,
  },
  {
    key: 'limit-offset-clamp',
    prompt: `${COMMON}

YOUR LANE: change (B), the LIMIT/OFFSET integer clamp. Answer concretely:
 - Is the clamp COMPLETE? Are there OTHER places LIMIT/OFFSET (or any count) get interpolated into SQL
   in the adapter besides the one site guarded? Grep the adapter for every LIMIT/OFFSET/count
   interpolation and confirm each is covered or bound.
 - Can a value pass Number.isInteger && >= 0 and still be dangerous (e.g. a boxed Number, a value that
   stringifies oddly)? Is asSqlCount reachable via every setter path (limit(), range(), any offset
   assignment) or can a value reach limitValue/offsetValue that skips it?
 - Does the throw-caught-as-error-envelope behavior break a legitimate caller? Does range()'s
   Math.max computation ever produce a non-integer for valid integer inputs?
 - Did it break any existing pagination test / legitimate large-limit query?`,
  },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    lane: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          kind: { type: 'string', enum: ['bypass', 'incomplete-fix', 'legitimate-flow-broken', 'other'] },
          exploit_or_breakage: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'severity', 'kind', 'exploit_or_breakage'],
      },
    },
    lane_clear: { type: 'boolean' },
  },
  required: ['lane', 'findings', 'lane_clear'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED', 'UNCERTAIN'] },
    reasoning: { type: 'string' },
    corrected_severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'not-a-bug'] },
  },
  required: ['verdict', 'reasoning'],
}

const results = await pipeline(
  LANES,
  (l) => agent(l.prompt, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  (review, lane) => {
    if (!review || !review.findings || review.findings.length === 0) return { lane: lane.key, verified: [] }
    return parallel(
      review.findings.map((f) => () =>
        agent(
          `Adversarially VERIFY this finding against the FIXED code at ${REPO}. Try to REFUTE it. Read
the cited file:line and surrounding code. A finding survives only if a concrete input actually
produces the claimed outcome given the current code.

Finding: ${JSON.stringify(f)}

CONFIRMED only if reproduced against real code; REFUTED if the code already handles it or the claim is
wrong; UNCERTAIN if undecidable without running it.`,
          { label: `verify:${lane.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then((v) => ({ ...f, lane: lane.key, verdict: v }))
      )
    ).then((verified) => ({ lane: lane.key, verified: verified.filter(Boolean) }))
  }
)

const all = results.flat().filter(Boolean)
const confirmed = all.flatMap((r) => (r.verified || []).filter((f) => f.verdict?.verdict === 'CONFIRMED'))
const uncertain = all.flatMap((r) => (r.verified || []).filter((f) => f.verdict?.verdict === 'UNCERTAIN'))
const clearLanes = all.filter((r) => (r.verified || []).length === 0).map((r) => r.lane)

return {
  confirmed_findings: confirmed,
  uncertain_findings: uncertain,
  lanes_clear: clearLanes,
  summary: { confirmed_count: confirmed.length, uncertain_count: uncertain.length },
}