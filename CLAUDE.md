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

- **Production:** `ideal-ram-982` (used by macOS app and Vercel)
- **Dev:** `fastidious-dragon-782` (local development)

When debugging production issues, ALWAYS use `--prod` flag with Convex CLI commands.

## Documentation

- `/docs/PRD.md` — Product Requirements Document
- `/docs/B2C-SPEC.md` — Sequ3nce Personal (B2C) full specification — **reference this before any B2C work**
