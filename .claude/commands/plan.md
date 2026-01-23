# Plan a New Feature

You are starting a **fresh planning session**. Your goal is to thoroughly understand the feature request and create a detailed implementation plan.

## Your Approach

1. **Clarify Requirements First**
   - Ask questions about anything unclear
   - Understand the user's goals, not just the literal request
   - Identify edge cases and potential issues early

2. **Explore the Codebase**
   - Use the Explore agent to understand relevant existing code
   - Identify files that will need changes
   - Look for existing patterns to follow

3. **Create a Written Plan**
   - Write the plan to `.claude/plans/[descriptive-name].md`
   - Include: problem statement, approach, files to modify, implementation steps
   - Be specific enough that implementation can happen in a separate session

4. **Get User Approval**
   - Present the plan summary
   - Use ExitPlanMode when ready for approval

## Important Notes

- Do NOT write code in this session - only plan
- Do NOT rush to solutions - understand first
- Ask questions early rather than assuming
- Consider what could go wrong

## Project Context

This is Sequ3nce.ai - a sales call intelligence platform with:
- **Web Dashboard** (`/apps/web`) - Next.js admin interface
- **macOS Desktop App** (`/apps/macos`) - Swift app for closers
- **Audio Processor** (`/services/audio-processor`) - Node.js transcription service
- **Database** - Convex (serverless)

## Start

Ask the user: "What feature would you like to plan?"
