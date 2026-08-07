export const meta = {
  name: 'phase1-security-adversarial-review',
  description: 'Adversarial swarm review of the Phase 1 Neotoma security hotfix (auth-bypass + SQLi fixes)',
  phases: [
    { title: 'Review', detail: 'three independent adversarial reviewers' },
    { title: 'Verify', detail: 'refute-or-confirm each finding independently' },
  ],
}

const REPO = '/Users/markmhendrickson/repos/neotoma-wt-sec-advisories'
const DIFF = '/tmp/phase1_security.diff'

const COMMON = `
You are reviewing an UNPUSHED security hotfix in the Neotoma repo at ${REPO}
(branch hotfix/v0.21.4-ed25519-auth-and-sortby-sqli, base origin/main). This is an
operator-authorized review of the operator's own product. The full diff is at ${DIFF}
(read it first), then read the actual source files it touches for surrounding context.

The hotfix fixes two confirmed-live vulnerabilities:
 (F1) Ed25519 REST auth bypass — the bearer path auto-registered any 32-byte key and
      verified the request signature only 'if (signature)', then getAuthenticatedUserId
      trusted a caller-supplied user_id. Fixed in src/actions.ts (accept block requires a
      valid signature AND a pre-provisioned userId; getAuthenticatedUserId fails closed for
      unresolved Bearer requests).
 (F2) SQL injection via sort_by=snapshot.<field> / snapshot_filters keys interpolated raw
      into ORDER BY. Fixed in src/services/entity_queries.ts (identifier validation) and
      src/repositories/sqlite/local_db_adapter.ts (normalizeColumnName fails closed).

Be adversarial and concrete. For every finding give: file:line, the exact code, a specific
exploit or breakage scenario (concrete inputs → wrong outcome), severity
(critical/high/med/low), and a fix. Verify claims by reading code — do NOT speculate. If you
find nothing in your lane, say so explicitly rather than inventing weak findings.`

const REVIEWERS = [
  {
    key: 'auth-bypass-hunt',
    prompt: `${COMMON}

YOUR LANE: hunt for ANOTHER auth-bypass path the fix did NOT close. The fix patched two
locations; your job is to find a THIRD. Read the ENTIRE auth middleware in src/actions.ts
(every branch: sandbox public, sandbox stale-bearer, AAuth admission, session token, guest
capability, dev-local/loopback, the Ed25519 accept block) and getAuthenticatedUserId.
Questions to answer concretely:
 - Can an external caller reach a protected REST route with an unresolved or attacker-chosen
   principal through any branch OTHER than the two that were fixed?
 - After the fix, does any path still stamp a principal from a forged/unverified key, or still
   honor a caller-supplied user_id without a resolved authenticatedUserId?
 - Does the /mcp path, guest-capability path, or sandbox stale-bearer degrade path offer an
   equivalent pivot?
 - Is the signature verification actually sound (does verifyRequest bind to the exact body;
   can an empty/whitespace signature slip through the new mandatory check)?
Report each reachable bypass as a finding.`,
  },
  {
    key: 'sql-sink-sweep',
    prompt: `${COMMON}

YOUR LANE: completeness of the SQLi fix. The fix validated TWO snapshot->>\${field} sites in
entity_queries.ts and made normalizeColumnName fail closed. Your job: find EVERY OTHER place
user-controlled input reaches a SQL identifier, ORDER BY, column position, or is interpolated
into query text — across src/repositories/**, src/services/**, and the query builders. Grep
for template-literal SQL, .order(/.eq(/.gt( with non-constant columns, ORDER BY / LIMIT /
OFFSET interpolation, dynamic table/column names, FTS/MATCH, sqlite-vec. Specifically:
 - Are LIMIT/OFFSET still interpolated rather than bound? (the fix noted but may not have
   fixed this)
 - Does the normalizeColumnName fail-closed regex have a gap (e.g. does it still accept
   something dangerous, or does it now reject a legitimate column some caller depends on)?
 - Is there any OTHER caller that builds snapshot->>\${x} or similar without the new validator?
Report each injectable or newly-broken site.`,
  },
  {
    key: 'fail-closed-regression',
    prompt: `${COMMON}

YOUR LANE: did the fail-closed changes BREAK a legitimate flow? Both fixes make auth/query
stricter; a false positive locks out real callers. Read the changed code and trace legitimate
paths:
 - A properly-provisioned Ed25519 agent that registered WITH a userId and sends a valid
   signature — does it still authenticate after the accept-block change? Walk the new
   condition (registered && isBearerTokenValid && registeredUserId && ed25519Signature).
 - The session-token path, AAuth admission path, dev-local/loopback path, guest path — does
   the getAuthenticatedUserId fail-closed tail wrongly reject any of them (e.g. a case that
   legitimately reached the old 'return providedUserId' tail)?
 - Legitimate sort_by=snapshot.<field> and snapshot_filters with real field names, and the
   'submitted_at'/'observation_count'/'last_observation_at' special sorts — still work?
 - Does normalizeColumnName's new throw reject any column shape a real caller passes (scan its
   ~13 call sites: .eq/.gt/.lt/.order/.or with table.column, aliases, lower(->>) )?
Report each legitimate flow that the fix breaks, with the concrete input that now fails.`,
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
          kind: { type: 'string', enum: ['new-bypass', 'incomplete-sqli-fix', 'legitimate-flow-broken', 'other'] },
          exploit_or_breakage: { type: 'string' },
          code: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'severity', 'kind', 'exploit_or_breakage'],
      },
    },
    lane_clear: { type: 'boolean', description: 'true if no real findings in this lane' },
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
  REVIEWERS,
  (r) => agent(r.prompt, { label: `review:${r.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  (review, reviewer) => {
    if (!review || !review.findings || review.findings.length === 0) return { reviewer: reviewer.key, verified: [] }
    return parallel(
      review.findings.map((f) => () =>
        agent(
          `Adversarially VERIFY this security-review finding against the code at ${REPO}. Try to REFUTE it.
Read the cited file:line and surrounding code before deciding. A finding only survives if a concrete
attacker input or legitimate-caller input actually produces the claimed outcome given the FIXED code.

Finding: ${JSON.stringify(f)}

Return CONFIRMED only if you reproduced the reasoning against the real fixed code; REFUTED if the
fix already handles it or the claim is wrong; UNCERTAIN if you cannot tell without running it.`,
          { label: `verify:${reviewer.key}:${(f.file || '').split('/').pop()}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then((v) => ({ ...f, lane: reviewer.key, verdict: v }))
      )
    ).then((verified) => ({ reviewer: reviewer.key, verified: verified.filter(Boolean) }))
  }
)

const all = results.flat().filter(Boolean)
const confirmed = all.flatMap((r) => (r.verified || []).filter((f) => f.verdict?.verdict === 'CONFIRMED'))
const uncertain = all.flatMap((r) => (r.verified || []).filter((f) => f.verdict?.verdict === 'UNCERTAIN'))
const clearLanes = all.filter((r) => (r.verified || []).length === 0).map((r) => r.reviewer)

return {
  confirmed_findings: confirmed,
  uncertain_findings: uncertain,
  lanes_with_no_confirmed_findings: clearLanes,
  summary: {
    confirmed_count: confirmed.length,
    uncertain_count: uncertain.length,
    by_kind: confirmed.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] || 0) + 1 }), {}),
  },
}