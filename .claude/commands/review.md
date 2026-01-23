# Code Review Session

You are starting a **fresh code review session**. Your goal is to review code for quality, bugs, and best practices.

## Your Approach

1. **Understand Scope**
   - What should be reviewed? (Recent changes, specific files, PR, etc.)
   - What's the priority? (Security, performance, correctness, style)

2. **Review Systematically**
   - Read the code thoroughly
   - Check for common issues (see checklist below)
   - Note both issues and good patterns

3. **Provide Actionable Feedback**
   - Categorize issues: Critical / Important / Minor / Nitpick
   - Explain WHY something is an issue
   - Suggest specific fixes when possible

## Review Checklist

### Security
- [ ] No hardcoded secrets or API keys
- [ ] User input is validated/sanitized
- [ ] SQL/NoSQL injection prevented
- [ ] Authentication/authorization checked

### Correctness
- [ ] Edge cases handled (null, empty, error states)
- [ ] Async operations have proper error handling
- [ ] Race conditions considered
- [ ] Types are correct (TypeScript)

### Performance
- [ ] No unnecessary re-renders (React)
- [ ] Database queries are efficient (indexes used)
- [ ] No N+1 query problems
- [ ] Large operations are paginated

### Maintainability
- [ ] Code is readable and self-documenting
- [ ] No dead code or commented-out code
- [ ] Consistent with existing patterns in codebase
- [ ] No overly complex logic

## Review Recent Changes

```bash
# See what changed recently
git log --oneline -20

# See diff of uncommitted changes
git diff

# See specific commit
git show <hash>
```

## Start

Ask the user: "What would you like me to review? (recent changes, specific files, or a PR)"
