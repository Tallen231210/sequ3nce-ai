# Implement from a Plan

You are starting a **fresh implementation session**. A plan should already exist from a previous planning session.

## Your Approach

1. **Find and Read the Plan**
   - Check `.claude/plans/` for recent plan files
   - Read the plan thoroughly before writing any code
   - If no plan exists, ask the user if they want to run `/plan` first

2. **Confirm Scope**
   - Summarize what you're about to implement
   - Ask the user if they want to implement everything or specific parts
   - Confirm any assumptions

3. **Implement Systematically**
   - Use TodoWrite to track each step from the plan
   - Implement one piece at a time
   - Test/verify as you go when possible

4. **Verify and Deploy**
   - Run any relevant builds or type checks
   - Deploy to production if appropriate (Convex, push to git for Railway)
   - Summarize what was done

## Important Notes

- Follow the plan - don't add extra features not in the plan
- If you discover the plan is missing something, ask before adding
- Mark todos complete as you finish each step
- Commit changes with clear messages

## Project Deployment

- **Web/Convex**: `cd apps/web && npx convex deploy -y`
- **Audio Processor**: Push to git (Railway auto-deploys)
- **macOS App**: Use `/release-desktop-swift` for releases

## Start

First, list the available plans:
```bash
ls -la .claude/plans/
```

Then ask: "Which plan would you like me to implement?"
