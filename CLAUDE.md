# Sequ3nce.ai

Sales call intelligence platform for high-ticket online sales teams (coaching, agencies, info products).

## Session Start

When starting a fresh session, always greet the user with:
- The current working directory (folder name)
- A reminder of available slash commands: `/plan`, `/implement`, `/bugfix`, `/review`, `/quick`, `/release-desktop-swift`, `/release-desktop`

## Project Overview

This is a SaaS product with four components:

### 1. Web Dashboard (`/apps/web`)
- **Tech:** Next.js
- **Purpose:** Admin/manager interface for viewing live calls, recordings, transcripts, and team management

### 2. macOS Desktop App (`/apps/macos`)
- **Tech:** Swift/SwiftUI
- **Platform:** macOS only
- **Purpose:** Closer-facing app to capture audio and display real-time "ammo" (key prospect quotes)
- **Release:** Use `/release-desktop-swift` slash command
- **Auto-update:** Sparkle framework, uses `appcast.xml` and GitHub releases in `sequ3nce-releases` repo

### 3. Windows Desktop App (`/apps/desktop`)
- **Tech:** Electron/React
- **Platform:** Windows only (macOS builds disabled — use Swift app instead)
- **Purpose:** Same closer-facing functionality as the Swift app, built for Windows users
- **Release:** Use `/release-desktop` slash command — bumps version, pushes tag, CI builds `.exe` and creates GitHub release
- **Auto-update:** electron-updater, uses `latest.yml` manifest in GitHub releases in `sequ3nce-ai` repo

### 4. Audio Processing Service (`/services/audio-processor`)
- **Tech:** Node.js
- **Purpose:** Handles real-time transcription and AI extraction

### Shared Code (`/packages/shared`)
- Shared TypeScript types, utilities, and constants used across components

### Desktop App Strategy
- **macOS users** → Swift app (`/apps/macos`) — native, primary experience
- **Windows users** → Electron app (`/apps/desktop`) — Windows-only builds
- These are two completely separate apps sharing only the Convex backend
- The Electron app no longer ships macOS builds (disabled in CI)

## Development Context

This project is being built by a non-developer using Claude Code through natural language prompts. All code, architecture decisions, and implementations are generated via AI assistance.

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
