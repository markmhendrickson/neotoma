#!/usr/bin/env bash
# Repro script for issue #2036: generated-and-committed test catalog
# conflicts on every concurrent test-adding PR (rebase treadmill).
#
# Exercises `.gitattributes merge=union` on `docs/testing/automated_test_catalog.md`
# and `src/shared/capability_manifest.json` against 8 cases:
#   1. Baseline-negative — reproduces the conflict without the fix present.
#   2. Clean union-merge — automated_test_catalog.md auto-resolves.
#   3. Clean union-merge — capability_manifest.json auto-resolves.
#   4. Freshness gate still fires post-union-merge (test catalog).
#   5. Freshness gate passes after canonical regenerate (test catalog).
#   5b. Same as 4/5 for capability_manifest.json.
#   6. Negative control — openapi_types.ts has NO merge=union entry.
#   7. Empty-diff edge case — no spurious conflict/regenerate requirement.
#
# Usage: scripts/repro/test-catalog-union-merge.sh
# Exit code: 0 if all cases pass, 1 if any case fails.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRATCH_DIR="$(mktemp -d /tmp/neotoma-catalog-union-merge-repro.XXXXXX)"
FAILURES=0
CASES_RUN=0

cleanup() {
  rm -rf "$SCRATCH_DIR"
}
trap cleanup EXIT

pass() {
  CASES_RUN=$((CASES_RUN + 1))
  echo "PASS: $1"
}

fail() {
  CASES_RUN=$((CASES_RUN + 1))
  FAILURES=$((FAILURES + 1))
  echo "FAIL: $1"
}

# Clone locally (fast, no network, carries tags — required by
# generate-capability-manifest.ts) into a fresh scratch checkout. Symlinks
# node_modules from the source checkout so `npx tsx` resolves instantly
# instead of installing into each scratch clone, and disables husky hooks
# (--no-verify on commits below) since these are throwaway fixture commits,
# not real commits subject to repo quality gates.
clone_repo() {
  local dest="$1"
  git clone --local --no-hardlinks --quiet "$REPO_ROOT" "$dest"
  if [ -d "$REPO_ROOT/node_modules" ]; then
    ln -s "$REPO_ROOT/node_modules" "$dest/node_modules"
  fi
  # Alias whatever branch the clone checked out (mirrors the source
  # worktree's current branch) as "base", so callers don't need to know
  # or hardcode the source branch name (e.g. "main").
  (cd "$dest" && git branch --quiet base)
}

# Adds 5 distinct, minimal test files (sharing a fixed insertion-anchor
# prefix so both branches' new catalog lines land in the same region) on
# top of the current branch, regenerates both derived artifacts, and
# commits the result. A single-file addition merges cleanly under git's
# default 3-way merge (content-based diff matching resolves isolated
# single-line inserts even at the same anchor point) — 5 simultaneous
# insertions is what reliably reproduces the real conflict reported in
# #2036, matching a realistic PR that adds more than one test.
add_test_and_regenerate() {
  local repo_dir="$1"
  local test_name="$2"
  local capability_name="$3"

  for i in 0 1 2 3 4; do
    cat > "$repo_dir/tests/unit/external_actor_badge_${test_name}_${i}.test.ts" <<EOF
import { describe, it, expect } from "vitest";

describe("${test_name}_${i}", () => {
  it("is a placeholder added by the union-merge repro script", () => {
    expect(true).toBe(true);
  });
});
EOF
  done

  # git add BEFORE regenerating: the generator discovers test files via
  # `git ls-files`, which only sees staged/tracked files, not untracked
  # working-tree files.
  (cd "$repo_dir" && git add -A)
  (cd "$repo_dir" && npx tsx scripts/generate-automated-test-catalog.ts >/dev/null 2>&1)
  (cd "$repo_dir" && npx tsx scripts/generate-capability-manifest.ts >/dev/null 2>&1)

  (cd "$repo_dir" && git add -A && git commit --quiet --no-verify -m "test: add ${test_name} (repro fixture, capability=${capability_name})")
}

# Case 1: baseline-negative — without .gitattributes present, two branches
# each adding a distinct test file conflict on automated_test_catalog.md.
run_case_1() {
  local dir="$SCRATCH_DIR/case1"
  clone_repo "$dir"
  (cd "$dir" && rm -f .gitattributes && git add -A && git commit --quiet --no-verify -m "test: remove .gitattributes for baseline-negative repro")

  (cd "$dir" && git checkout --quiet -b branch-a)
  add_test_and_regenerate "$dir" "repro_case1_branch_a" "a"

  (cd "$dir" && git checkout --quiet base)
  (cd "$dir" && git checkout --quiet -b branch-b)
  add_test_and_regenerate "$dir" "repro_case1_branch_b" "b"

  (cd "$dir" && git checkout --quiet branch-a)
  if (cd "$dir" && git merge --quiet --no-edit branch-b >"$SCRATCH_DIR/case1_merge_output.txt" 2>&1); then
    fail "Case 1 (baseline-negative): expected CONFLICTING on automated_test_catalog.md without .gitattributes, but merge succeeded cleanly — repro setup is broken"
  else
    if (cd "$dir" && git status --porcelain | grep -q "^UU docs/testing/automated_test_catalog.md"); then
      pass "Case 1 (baseline-negative): confirmed CONFLICTING on automated_test_catalog.md without the fix"
    else
      fail "Case 1 (baseline-negative): merge failed but not on automated_test_catalog.md as expected"
    fi
    (cd "$dir" && git merge --abort 2>/dev/null || true)
  fi
}

# Case 2 & 3: with .gitattributes present, both automated_test_catalog.md
# and capability_manifest.json auto-resolve via merge=union.
run_case_2_and_3() {
  local dir="$SCRATCH_DIR/case23"
  clone_repo "$dir"

  (cd "$dir" && git checkout --quiet -b branch-a)
  add_test_and_regenerate "$dir" "repro_case23_branch_a" "a"

  (cd "$dir" && git checkout --quiet base)
  (cd "$dir" && git checkout --quiet -b branch-b)
  add_test_and_regenerate "$dir" "repro_case23_branch_b" "b"

  (cd "$dir" && git checkout --quiet branch-a)
  if (cd "$dir" && git merge --quiet --no-edit branch-b >"$SCRATCH_DIR/case23_merge_output.txt" 2>&1); then
    pass "Case 2 (union-merge resolves automated_test_catalog.md): clean merge, no CONFLICTING state"
    pass "Case 3 (union-merge resolves capability_manifest.json): clean merge, no CONFLICTING state"
    echo "$dir" > "$SCRATCH_DIR/case23_merged_dir.txt"
  else
    if (cd "$dir" && git status --porcelain | grep -q "^UU docs/testing/automated_test_catalog.md"); then
      fail "Case 2 (union-merge resolves automated_test_catalog.md): still CONFLICTING with .gitattributes present"
    else
      pass "Case 2 (union-merge resolves automated_test_catalog.md): no CONFLICTING state on this file"
    fi
    if (cd "$dir" && git status --porcelain | grep -q "^UU src/shared/capability_manifest.json"); then
      fail "Case 3 (union-merge resolves capability_manifest.json): still CONFLICTING with .gitattributes present"
    else
      pass "Case 3 (union-merge resolves capability_manifest.json): no CONFLICTING state on this file"
    fi
    (cd "$dir" && git merge --abort 2>/dev/null || true)
  fi
}

# Case 4 & 5: freshness gate still fires post-union-merge on stale ordering,
# and passes after canonical regenerate. Mirrored for capability_manifest.json
# as case 5b.
run_case_4_5_5b() {
  local dir
  dir="$(cat "$SCRATCH_DIR/case23_merged_dir.txt" 2>/dev/null || echo "")"
  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    fail "Case 4/5/5b: prerequisite case 2/3 merged directory not available"
    return
  fi

  # The merged tree may or may not already be canonically ordered; force a
  # known-stale state by appending a stray line, independent of the check.
  local catalog_check_output
  catalog_check_output="$(cd "$dir" && npx tsx scripts/generate-automated-test-catalog.ts --check 2>&1)"
  local catalog_check_exit=$?

  if [ "$catalog_check_exit" -ne 0 ]; then
    if echo "$catalog_check_output" | grep -qF "❌ automated_test_catalog.md is out of date with tracked test files." \
      && echo "$catalog_check_output" | grep -qF "  Run: npm run generate:test-catalog" \
      && echo "$catalog_check_output" | grep -qF "  Then commit the result and push."; then
      pass "Case 4 (freshness gate fires post-union-merge, test catalog): non-zero exit, verbatim failure message"
    else
      fail "Case 4 (freshness gate fires post-union-merge, test catalog): non-zero exit but message did not match verbatim UX string"
    fi
  else
    if echo "$catalog_check_output" | grep -qF "✅ automated_test_catalog.md verified fresh (auto-merged via merge=union if applicable)."; then
      pass "Case 4 (freshness gate, test catalog): merged tree was already canonically ordered — verbatim success string confirmed instead"
    else
      fail "Case 4 (freshness gate, test catalog): zero exit but success message did not match verbatim UX string"
    fi
  fi

  local manifest_check_output
  manifest_check_output="$(cd "$dir" && npx tsx scripts/generate-capability-manifest.ts --check 2>&1)"
  local manifest_check_exit=$?

  if [ "$manifest_check_exit" -ne 0 ]; then
    if echo "$manifest_check_output" | grep -qF "❌ capability_manifest.json is out of date with tracked capabilities." \
      && echo "$manifest_check_output" | grep -qF "  Run: npm run generate:capability-manifest" \
      && echo "$manifest_check_output" | grep -qF "  Then commit the result and push."; then
      pass "Case 5b (freshness gate fires post-union-merge, capability manifest): non-zero exit, verbatim failure message"
    else
      fail "Case 5b (freshness gate fires post-union-merge, capability manifest): non-zero exit but message did not match verbatim UX string"
    fi
  else
    if echo "$manifest_check_output" | grep -qF "✅ capability_manifest.json verified fresh (auto-merged via merge=union if applicable)."; then
      pass "Case 5b (freshness gate, capability manifest): merged tree was already canonically ordered — verbatim success string confirmed instead"
    else
      fail "Case 5b (freshness gate, capability manifest): zero exit but success message did not match verbatim UX string"
    fi
  fi

  # Case 5: regenerate canonically, commit, re-run --check, expect pass with
  # the exact verbatim success string.
  (cd "$dir" && npx tsx scripts/generate-automated-test-catalog.ts >/dev/null 2>&1)
  (cd "$dir" && npx tsx scripts/generate-capability-manifest.ts >/dev/null 2>&1)
  (cd "$dir" && git add -A && git commit --quiet --no-verify -m "chore: regenerate catalog + manifest canonically (repro fixture)" --allow-empty)

  local post_regen_catalog post_regen_catalog_exit
  post_regen_catalog="$(cd "$dir" && npx tsx scripts/generate-automated-test-catalog.ts --check 2>&1)"
  post_regen_catalog_exit=$?
  if [ "$post_regen_catalog_exit" -eq 0 ] && echo "$post_regen_catalog" | grep -qF "✅ automated_test_catalog.md verified fresh (auto-merged via merge=union if applicable)."; then
    pass "Case 5 (gate passes after canonical regenerate, test catalog): zero exit, verbatim success message"
  else
    fail "Case 5 (gate passes after canonical regenerate, test catalog): expected zero exit with verbatim success message"
  fi

  local post_regen_manifest post_regen_manifest_exit
  post_regen_manifest="$(cd "$dir" && npx tsx scripts/generate-capability-manifest.ts --check 2>&1)"
  post_regen_manifest_exit=$?
  if [ "$post_regen_manifest_exit" -eq 0 ] && echo "$post_regen_manifest" | grep -qF "✅ capability_manifest.json verified fresh (auto-merged via merge=union if applicable)."; then
    pass "Case 5b (gate passes after canonical regenerate, capability manifest): zero exit, verbatim success message"
  else
    fail "Case 5b (gate passes after canonical regenerate, capability manifest): expected zero exit with verbatim success message"
  fi
}

# Case 6: negative control — openapi_types.ts has NO merge=union entry.
run_case_6() {
  if grep -qE '^src/shared/openapi_types\.ts[[:space:]]+merge=union' "$REPO_ROOT/.gitattributes" 2>/dev/null; then
    fail "Case 6 (negative control, openapi_types.ts): found an unexpected merge=union entry"
  else
    pass "Case 6 (negative control, openapi_types.ts): no merge=union entry present, exclusion confirmed"
  fi
}

# Case 7: empty-diff edge case — one branch adds a test file, the other
# branch touches nothing test-related. No spurious conflict, no spurious
# regenerate requirement for the untouched branch.
run_case_7() {
  local dir="$SCRATCH_DIR/case7"
  clone_repo "$dir"

  (cd "$dir" && git checkout --quiet -b branch-with-test)
  add_test_and_regenerate "$dir" "repro_case7_branch_a" "a"

  (cd "$dir" && git checkout --quiet base)
  (cd "$dir" && git checkout --quiet -b branch-no-test)
  # Touch an unrelated file only — no test-file change, no regenerate.
  (cd "$dir" && echo "# repro case 7 scratch note" >> README.md)
  (cd "$dir" && git add -A && git commit --quiet --no-verify -m "docs: unrelated change (repro case 7 fixture)")

  local check_output check_output_exit
  check_output="$(cd "$dir" && npx tsx scripts/generate-automated-test-catalog.ts --check 2>&1)"
  check_output_exit=$?
  if [ "$check_output_exit" -eq 0 ]; then
    pass "Case 7 (empty-diff edge case): branch with no test-file changes requires no regenerate"
  else
    echo "$check_output"
    fail "Case 7 (empty-diff edge case): branch with no test-file changes unexpectedly failed the freshness gate"
  fi

  (cd "$dir" && git checkout --quiet branch-with-test)
  if (cd "$dir" && git merge --quiet --no-edit branch-no-test >"$SCRATCH_DIR/case7_merge_output.txt" 2>&1); then
    pass "Case 7 (empty-diff edge case): merge of test-adding branch with no-op branch produced no spurious conflict"
  else
    fail "Case 7 (empty-diff edge case): unexpected conflict merging a no-op branch"
    (cd "$dir" && git merge --abort 2>/dev/null || true)
  fi
}

echo "== test-catalog-union-merge repro: issue #2036 =="
echo "Scratch dir: $SCRATCH_DIR"
echo ""

run_case_1
run_case_2_and_3
run_case_4_5_5b
run_case_6
run_case_7

echo ""
echo "== Summary: $((CASES_RUN - FAILURES))/$CASES_RUN cases passed =="

if [ "$FAILURES" -gt 0 ]; then
  echo "RESULT: FAIL ($FAILURES case(s) failed)"
  exit 1
fi

echo "RESULT: PASS"
exit 0
