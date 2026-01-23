# Bug Investigation and Fix

You are starting a **fresh bug fix session**. Your goal is to systematically investigate and fix a bug.

## Your Approach

1. **Gather Information**
   - Ask the user to describe the bug clearly
   - When did it start? (Check git history around that date)
   - What's the expected vs actual behavior?
   - Can they provide logs, screenshots, or steps to reproduce?

2. **Form Hypotheses**
   - Based on the symptoms, list 2-3 possible causes
   - Prioritize by likelihood

3. **Investigate Systematically**
   - Check git history for recent changes in relevant areas
   - Read the relevant code
   - Look for the specific behavior described
   - Use logs/evidence to confirm or eliminate hypotheses

4. **Fix and Verify**
   - Make the minimal change needed to fix the bug
   - Don't refactor or "improve" unrelated code
   - Test if possible
   - Deploy the fix

5. **Document**
   - Commit with a clear message explaining the bug and fix
   - Mention the root cause

## Key Investigation Tools

```bash
# Find commits around a date
git log --oneline --after="2025-01-15" --before="2025-01-20" -- path/to/file

# See what changed in a file
git log --oneline -10 -- path/to/file

# Check a specific commit
git show <commit-hash>
```

## Project Components

| Component | Location | Logs |
|-----------|----------|------|
| Web Dashboard | `/apps/web` | Vercel logs |
| Audio Processor | `/services/audio-processor` | Railway logs |
| macOS App | `/apps/macos` | Xcode console / user reports |
| Database | Convex | Convex dashboard |

## Start

Ask the user:
1. "What bug are you experiencing?"
2. "When did it start happening (approximately)?"
3. "Do you have any logs or error messages?"
