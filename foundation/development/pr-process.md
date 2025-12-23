# Pull Request Process

## Overview

This document defines the pull request creation, review, and merge process.

## Creating a Pull Request

### PR Title Format

```
{id}: Brief description of changes
```

Examples:
- `123: Add user authentication`
- `456: Fix memory leak in cache`
- `789: Update documentation for API`

### PR Body Template

```markdown
## Summary

Brief description of what this PR does and why.

## Changes

- Change 1
- Change 2
- Change 3

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated (if UI)
- [ ] All tests passing locally
- [ ] Manual testing completed

## Documentation

- [ ] Code comments added where needed
- [ ] Module/subsystem docs updated
- [ ] API docs updated (if applicable)
- [ ] README updated (if needed)

## Risk Assessment

- **Risk Level**: Low / Medium / High
- **Breaking Changes**: Yes / No
- **Migration Required**: Yes / No
- **Rollback Plan**: [Describe if high risk]

## Checklist

- [ ] Follows project coding conventions
- [ ] No secrets or credentials in code
- [ ] Error handling follows project patterns
- [ ] Performance impact considered
- [ ] Security implications reviewed
- [ ] Accessibility requirements met (if UI)

## Related Issues

Closes #XXX
Related to #YYY

## Screenshots / Videos

[If UI changes, add screenshots or screen recordings]

## Deployment Notes

[Any special deployment considerations]
```

### Before Creating PR

1. **Ensure branch is up to date:**
   ```bash
   git fetch origin
   git rebase origin/dev  # or merge origin/dev
   ```

2. **Run all checks locally:**
   ```bash
   npm run lint
   npm run type-check
   npm test
   ```

3. **Review your own changes:**
   - Read through the diff
   - Check for debug code, console.logs, TODOs
   - Verify no secrets or credentials
   - Ensure all files are intentionally included

4. **Write clear commit messages:**
   - Follow project commit message format
   - Each commit should be logical and atomic

## PR Review Process

### Reviewer Responsibilities

**Initial Review (within 24-48 hours):**

1. **Understand the context:**
   - Read PR description
   - Review linked issues/specs
   - Understand the problem being solved

2. **Check for obvious issues:**
   - Does it follow coding conventions?
   - Are there any security concerns?
   - Are tests included and passing?
   - Is documentation updated?

3. **Deep code review:**
   - Logic correctness
   - Edge cases handled
   - Error handling appropriate
   - Performance implications
   - Maintainability

4. **Provide feedback:**
   - Be specific and constructive
   - Suggest improvements, don't just criticize
   - Distinguish between required changes and suggestions
   - Use code suggestions feature for minor fixes

### Review States

**Approve** ✅
- All criteria met
- No blocking issues
- Ready to merge

**Request Changes** ❌
- Blocking issues found
- Must be fixed before merge
- Re-review required

**Comment** 💬
- Non-blocking feedback
- Suggestions for improvement
- Questions for clarification

### Review Criteria

**Code Quality:**
- Follows project conventions
- Clear and maintainable
- Appropriate abstractions
- No code duplication
- Good variable/function naming

**Testing:**
- Adequate test coverage
- Tests are meaningful
- Edge cases covered
- Tests pass consistently

**Documentation:**
- Code comments where needed
- Module docs updated
- API docs current
- README updated if needed

**Architecture:**
- Follows project architecture
- Proper separation of concerns
- Appropriate dependencies
- No architectural violations

**Security:**
- No credentials in code
- Input validation present
- No SQL injection vulnerabilities
- No XSS vulnerabilities
- Secure by default

**Performance:**
- No obvious performance issues
- Database queries optimized
- Appropriate caching
- No N+1 queries

### Review Labels

Apply labels to help categorize and track:

- `approved`: Ready to merge
- `changes-requested`: Needs fixes
- `needs-docs`: Documentation updates needed
- `needs-tests`: Test coverage insufficient
- `high-risk`: Requires extra scrutiny
- `breaking-change`: Contains breaking changes
- `security`: Security-related changes
- `performance`: Performance-sensitive changes

### Review Response Time

Configure based on priority:

**Critical/High Priority:**
- Initial review: 4-8 hours
- Re-review: 2-4 hours

**Medium Priority:**
- Initial review: 24 hours
- Re-review: 12 hours

**Low Priority:**
- Initial review: 48 hours
- Re-review: 24 hours

## Addressing Review Comments

### As PR Author:

1. **Respond to all comments:**
   - Acknowledge feedback
   - Explain your reasoning if disagreeing
   - Ask for clarification if needed

2. **Make requested changes:**
   - Fix issues in new commits (don't force-push immediately)
   - Reference which comments each commit addresses
   - Mark conversations as resolved after fixing

3. **Re-request review:**
   - After making changes, re-request review
   - Summarize what changed
   - Explain any decisions made

4. **Keep discussion professional:**
   - Focus on the code, not the person
   - Be open to feedback
   - Explain context when needed

## Merging

### Pre-Merge Checklist

- [ ] All CI checks passing
- [ ] Required number of approvals received
- [ ] No unresolved conversations
- [ ] Branch is up to date with target
- [ ] All review comments addressed
- [ ] Documentation complete

### Merge Strategies

**Squash and Merge** (Recommended for feature branches)
- Combines all commits into one
- Clean, linear history
- Easier to revert
- Loses individual commit history

**Merge Commit** (For preserving history)
- Preserves all commits
- Shows merge point in history
- Can be messy with many commits

**Rebase and Merge** (For clean history)
- Replays commits on top of target
- Linear history without merge commit
- Can cause issues if branch was shared

### After Merge

1. **Delete the branch:**
   ```bash
   git branch -d feature-branch
   git push origin --delete feature-branch
   ```

2. **Update local branches:**
   ```bash
   git checkout dev
   git pull origin dev
   ```

3. **Close related issues:**
   - Manually close or use keywords in PR

4. **Announce if needed:**
   - Notify team of breaking changes
   - Update release notes
   - Document migration steps

## PR Size Guidelines

**Small PRs are better:**
- Easier to review
- Faster to merge
- Lower risk
- Less likely to have conflicts

**Recommended sizes:**
- **Ideal**: < 200 lines changed
- **Acceptable**: 200-500 lines
- **Large**: 500-1000 lines (break up if possible)
- **Too Large**: > 1000 lines (definitely break up)

**If PR is large:**
- Explain why in description
- Consider breaking into smaller PRs
- Provide extra context for reviewers
- Consider pair programming or live review

## Draft PRs

Use draft PRs when:
- Work in progress
- Want early feedback
- Need CI to run
- Coordinating with other PRs

**Draft PR guidelines:**
- Clearly mark as WIP in title
- Describe what's remaining
- Request specific feedback
- Don't merge until marked ready

## Configuration

Configure PR process in `foundation-config.yaml`:

```yaml
development:
  pull_requests:
    # Title format
    require_id_in_title: true
    title_pattern: "{id}: {description}"
    
    # Review requirements
    min_approvals: 1
    high_risk_approvals: 2
    require_review_from_code_owners: false
    
    # Merge settings
    merge_strategy: "squash"  # or "merge", "rebase"
    delete_branch_on_merge: true
    require_linear_history: false
    
    # Automation
    auto_request_reviewers: true
    auto_assign_to_author: true
```

## Best Practices

**For Authors:**
1. Keep PRs small and focused
2. Write clear descriptions
3. Respond promptly to feedback
4. Test thoroughly before creating PR
5. Update documentation

**For Reviewers:**
1. Review promptly
2. Be constructive and specific
3. Distinguish required from suggested changes
4. Approve when ready, don't block unnecessarily
5. Check out and test locally for complex changes

**For Teams:**
1. Set clear review expectations
2. Use PR templates
3. Automate what you can
4. Track review metrics
5. Continuously improve the process

