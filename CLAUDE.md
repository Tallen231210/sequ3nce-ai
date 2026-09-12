# Sequ3nce.ai

Sales call intelligence platform for high-ticket online sales teams (coaching, agencies, info products).

## Session Start

When starting a fresh session, always greet the user with:
- The current working directory (folder name)
- A reminder of available slash commands: `/plan`, `/implement`, `/bugfix`, `/review`, `/quick`, `/release-desktop-swift`, `/release-desktop`, `/release-personal`

## Project Overview

This is a SaaS product with two product lines and five components:

### Product Lines

| Product | Target | Price | Apps |
|---------|--------|-------|------|
| **Sequ3nce for Teams** (B2B) | Companies with sales teams | Per-seat | Desktop App + Web Dashboard |
| **Sequ3nce Personal** (B2C) | Individual closers | $99/mo | Personal App |

Both products share the same Convex backend but are **completely separate apps** with separate user tables, separate release pipelines, and separate codebases.

### 1. Web Dashboard (`/apps/web`) — B2B
- **Tech:** Next.js
- **Purpose:** Admin/manager interface for viewing live calls, recordings, transcripts, and team management
- **Product:** Sequ3nce for Teams (B2B)

### 2. macOS Desktop App (`/apps/macos`) — B2B (Legacy)
- **Tech:** Swift/SwiftUI
- **Platform:** macOS only
- **Purpose:** Closer-facing app to capture audio and display real-time "ammo" (key prospect quotes)
- **Release:** Use `/release-desktop-swift` slash command
- **Auto-update:** Sparkle framework, uses `appcast.xml` and GitHub releases in `sequ3nce-releases` repo
- **Status:** Being phased out in favor of Electron desktop app

### 3. Desktop App (`/apps/desktop`) — B2B
- **Tech:** Electron/React
- **Platform:** Windows + macOS (cross-platform)
- **Purpose:** B2B closer-facing app with Meeting Bot Hub — dashboard, call history, coaching, schedule, messaging, and more
- **Release:** Use `/release-desktop` slash command — bumps version, pushes tag, CI builds `.exe` + `.dmg` and creates GitHub release
- **Auto-update:** electron-updater, uses `latest.yml` (Windows) and `latest-mac.yml` (macOS) manifests in GitHub releases

### 4. Personal App (`/apps/personal`) — B2C
- **Tech:** Electron/React (forked from `/apps/desktop`)
- **Platform:** Windows + macOS (cross-platform)
- **Purpose:** B2C closer-facing app — call recording, stats, public profile, job board, community
- **Release:** Use `/release-personal` slash command
- **Auto-update:** electron-updater, uses `latest-personal.yml` (Windows) and `latest-personal-mac.yml` (macOS) manifests in GitHub releases
- **Spec:** See `/docs/B2C-SPEC.md` for full specification

### 5. Audio Processing Service (`/services/audio-processor`)
- **Tech:** Node.js
- **Purpose:** Handles real-time transcription and AI extraction

### Shared Code (`/packages/shared`)
- Shared TypeScript types, utilities, and constants used across components

## App Boundary Rules

**CRITICAL: Always confirm which app you are editing before making changes.**

When working on code, you MUST be aware of which app context you are in:

- **`/apps/desktop/`** → B2B Desktop App. Do NOT add B2C features here.
- **`/apps/personal/`** → B2C Personal App. Do NOT add B2B features here.
- **`/apps/web/`** → B2B Web Dashboard. Do NOT add B2C features here.
- **`/apps/web/convex/`** → Shared backend. Changes here affect ALL apps — test both B2B and B2C after any modification.

### Rules for Each App

| Rule | Description |
|------|-------------|
| **Never cross-contaminate** | B2C features go in `/apps/personal/` only. B2B features go in `/apps/desktop/` or `/apps/web/` only. |
| **Convex is shared** | Backend functions in `/apps/web/convex/` are shared. New B2C functions MUST NOT modify existing B2B functions. Add new functions instead. |
| **Schema changes are additive only** | Never remove or rename fields on existing tables. Only add new optional fields or new tables. |
| **Verify both apps** | After any Convex schema change, verify both desktop and personal apps still build. |
| **Separate releases** | B2B uses `/release-desktop`. B2C uses `/release-personal`. Never mix them up. |
| **Separate user tables** | B2B users are in `closers` table. B2C users are in `b2cUsers` table. Never query the wrong table for the wrong app. |

### Quick Reference: Which File Belongs Where

```
apps/desktop/src/renderer/views/     → B2B views ONLY
apps/personal/src/renderer/views/    → B2C views ONLY
apps/web/convex/schema.ts            → SHARED — changes affect everything
apps/web/convex/*.ts                 → SHARED — add new functions, don't modify existing
apps/web/src/                        → B2B web dashboard ONLY
```

## Development Context

This project is being built by a non-developer using Claude Code through natural language prompts. All code, architecture decisions, and implementations are generated via AI assistance.

## Code Quality Standards

Every piece of code you write must be production-grade from the start. Do not rush. Do not take shortcuts. Before moving on from any feature or fix, self-review your own work as if you were auditing someone else's code. Specifically:

- **Split large files.** No file should exceed ~300 lines. Extract components, utilities, and logic into focused, single-responsibility files. A 700-line file is a failure of organization.
- **Validate all inputs.** Every mutation and API endpoint must validate input lengths, required fields, and data relationships (e.g., "does this call belong to this team?"). Never trust the client.
- **No force unwraps or silent failures.** In Swift, use safe URL construction and proper error propagation — never `!` on network-related code. In TypeScript, never silently swallow errors or return empty defaults when something actually failed.
- **Verify every build.** After finishing a set of changes, run TypeScript checks (`npx tsc --noEmit`), Next.js build (`npx next build`), Xcode build, and Convex deploy. Do not tell the user "done" until all builds pass clean.
- **Think about what breaks next week.** Consider concurrent usage, missing data, network failures, and edge cases. Code defensively at system boundaries. If two users can hit the same endpoint simultaneously, make sure that's safe.
- **Self-review before declaring done.** After writing code, re-read it critically. Look for: files that are too long, missing error handling, hardcoded values that should be constants, duplicated logic, and anything that would make you uncomfortable if you saw it in a code review.

## Conventions

- **Monorepo structure** — All components live in this single repository
- **TypeScript everywhere** — Use TypeScript for all JavaScript code
- **Shared types** — Common interfaces and types go in `/packages/shared`
- **Documentation** — Keep `/docs` updated with PRD and technical decisions
- **Incremental builds** — Build one feature at a time, test before moving on
- **Clear naming** — Use descriptive names; avoid abbreviations except common ones (API, ID, etc.)

## Key Commands

```bash
# Convex CLI - ALWAYS use --prod for production data
npx convex data closers --prod --limit 10      # Query production closers
npx convex data liveMessages --prod --limit 10 # Query production messages
npx convex deploy --yes                         # Deploy to production

# Without --prod, CLI defaults to dev deployment (different data!)
```

## Convex Deployments

- **Production:** `ideal-ram-982` (used by every app and by Vercel) — shared by B2B and B2C
- **B2C dev:** `fastidious-dragon-782` (the shared checkout's `.env.local` points here)
- **B2B dev:** `judicious-impala-85` (project `sequ3nce-b2b-dev`; the B2B worktree's `.env.local` points here)

When debugging production issues, ALWAYS use `--prod` flag with Convex CLI commands.

## Agent Working Agreement (parallel lanes)

Several coding agents work at the same time in separate terminals. The Convex backend is shared by
design and cannot be split, so the separation is by lane, not by backend. Goal: any lane can ship to
production at any time without carrying another lane's unfinished work.

**Who owns what — set by Tyler, 2026-09-12**

| Lane | Owner |
|------|-------|
| B2B: `apps/desktop/**`, and `apps/web/src/**` minus the B2C surfaces | B2B agent |
| Personal app features: `apps/personal/**` | Personal-app agent |
| B2C funnel: `/start`, `/subscribe`, the thanks page, the GoHighLevel booking handoff | B2C release owner |
| `apps/web/convex/**` | shared seam, additive only — see below |
| Code review of Personal-app work, before every release | B2C release owner |
| `/release-personal` tags, and every B2C `npx convex deploy` | B2C release owner |

The Personal-app agent builds; the B2C release owner reviews and ships. Neither cuts a release tag nor
deploys the backend for the other's work.

**Lanes by folder — know whose work a change is before you touch it**
- `apps/personal/**` → B2C only, owned by the Personal-app agent. Reviewed and released by the B2C release owner.
- `apps/desktop/**` → B2B only.
- `apps/web/src/**` → B2B, except the B2C web surfaces (the Personal funnel at `/start` and `/subscribe`,
  the closer deck at `/pitch`, and the public job board), which B2C owns.
- `apps/web/convex/**` → shared seam, the only place the two lanes coordinate. **Additive only:** never
  rename or remove an existing field, table, or function; add new optional fields and new functions.
  Regenerate and commit `_generated/api.d.ts` whenever a convex file is added (or the Vercel build fails).
  Give Tyler a heads-up when touching `schema.ts`, `http.ts`, or `meetingBot.ts`.

**Branches and worktrees**
- Branch names start with `b2b/` or `b2c/`, so `git branch --show-current` says whose work it is.
- Each agent works only in its own worktree (B2B: `/Users/tylerallen/Desktop/sequ3nce-ai-b2b`). The shared
  checkout `/Users/tylerallen/Desktop/sequ3nce-ai` stays on a clean `main`, used only to pull and to deploy
  prod. Never check out a feature branch there.
- Commit only your own files, by name — never `git add -A`. Never force-push `main`. If both lanes pushed,
  rebase your own commits on top of `main`.
- Never run `convex dev` or `convex deploy` against the other lane's dev deployment.

**Commit, push, and merge are three different things. Only the third is a commitment.**
- `git commit` on a `b2b/…` or `b2c/…` branch is a private save point. Free and reversible. Commit early
  and often while building and testing. It reaches no customer and no other lane.
- `git push` of that BRANCH publishes it for review and backs it up off the laptop. Still reaches no
  customer: Vercel builds only `main`, the backend moves only on `npx convex deploy`, and the desktop
  and Personal apps move only on a release tag.
- Merging the branch into `main` is the commitment. It needs three things: the work is finished, the
  lane's reviewer has read it, and Tyler wants it live.
- An experiment that gets rejected needs no cleanup. Delete the branch or leave it. Nothing leaked into
  `main`, so nothing has to be unpicked.
- Therefore: never build or test in the shared checkout `/Users/tylerallen/Desktop/sequ3nce-ai`. Set up
  your own worktree once, and keep every experiment in it:
  `git worktree add -b b2c/<feature> ~/Desktop/sequ3nce-ai-personal origin/main`
  then symlink `node_modules` from the shared checkout instead of reinstalling, as the B2B worktree does.
- The shared checkout must stay clean and on `main`, because signed releases are built there. Uncommitted
  work sitting in it blocks the release pipeline for whichever lane needs to ship next.

**What goes live, and when**
- The website: every push to `main`. Vercel builds all of `apps/web`, both products' pages included.
- The backend: only `npx convex deploy`. It pushes the ENTIRE `apps/web/convex` folder and removes any
  function that is not in it. Deploying from a branch that is behind `main` deletes the other lane's work.
- The desktop and Personal apps: only when a release tag is cut (`/release-desktop`, `/release-personal`).

**Shipping rules**
1. **`main` is always shippable.** Unfinished work stays on a `b2b/…` or `b2c/…` branch and merges to
   `main` only when it is ready for customers.
2. **Deploy the backend only from the shared checkout on a freshly pulled `main`:**
   `git pull` → `npx convex codegen` → `npx convex deploy --yes`. Never from a worktree or a feature
   branch. One deploy at a time; tell Tyler before running it.
3. **Merged but not ready to be seen → behind a beta feature flag** (the `setBetaFeatures` pattern used
   for E2).
4. **Tag every backend deploy** so the next one shows exactly what is about to go live:
   after a deploy, `git tag convex-prod-YYYY-MM-DD <deployed commit> && git push origin convex-prod-YYYY-MM-DD`.
   Before the next deploy, list the backend changes since the last tag:
   `git log --oneline $(git describe --tags --match 'convex-prod-*' --abbrev=0 origin/main)..origin/main -- apps/web/convex`.
   If anything in that list is not ready, stop and say so.

**Review and release gate (Personal app)**

What reaches a customer, and when, decides what needs review first.
- `apps/personal/**` on `main` reaches nobody until a release tag is cut. Merge it to `main` when the
  change is finished; the B2C release owner reviews it before running `/release-personal`.
- `apps/web/convex/**` is the opposite: it goes live the moment ANY lane runs `npx convex deploy`,
  because a deploy pushes the whole folder. Backend changes are reviewed BEFORE they land on `main`, or
  they land inert — a new function nobody calls yet, or an existing path behind a beta flag.
- The B2C web surfaces (`/start`, `/subscribe`, `/pitch`, public job board) go live on every push to
  `main` via Vercel. Route changes there through the B2C release owner.
- A Personal release is signed off when `npx tsc --noEmit` is clean, the Playwright specs for the
  touched views pass against a compiled `.webpack`, and the release owner has looked at the screens.
  Findings get fixed on the branch, never after the tag.

## Documentation

- `/docs/PRD.md` — Product Requirements Document
- `/docs/B2C-SPEC.md` — Sequ3nce Personal (B2C) full specification — **reference this before any B2C work**
