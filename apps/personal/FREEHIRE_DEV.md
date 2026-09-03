# FreeHire job board integration

This integration is isolated inside Sequ3nce Personal and can be rolled out or
disabled without changing the legacy public board.

## What is included

- FreeHire's public job catalogue is fetched through a fixed Electron IPC
  handler. The renderer cannot turn it into an arbitrary web proxy.
- For You keeps role, work mode, location, disclosed target pay, posting date,
  and sort in one compact, always-adjustable preference strip. Changes update
  the feed immediately; Best Match remains the default sort.
- The public board also provides pagination, company logos, full listing
  details, extracted compensation, source links, and catalogue reality signals.
- Active, non-VIP jobs from `b2cPublicJobs` are merged into the same feed as an
  additional source. They retain their own `source` label, appear first on the
  first page of the matching lane, and use the same save/stage/note flow.
- Curated rows are deduplicated against FreeHire by normalized company + title,
  then application URL. Rows with non-HTTPS application URLs are never exposed.
- The weekly import preserves its `highTicket` classification; specialized
  title lanes and that flag determine where curated rows appear.
- Market Insights uses FreeHire's full-set facet counts plus its aggregated
  Sales role, skill, salary, and weekly catalogue rollups. It never derives
  market claims from only the jobs currently loaded in the renderer.
- The tab labels its scope and known boundaries: skills and weekly activity are
  global Sales rollups, salary currencies and pay periods are kept separate,
  the current partial week is omitted, and no AI is used.
- Saving, stages, private notes, dismissals, restores, and activity timestamps
  are wired to authenticated Convex persistence. The server resolves the user
  exclusively from the B2C session token; the endpoint accepts no user ID.
- Search preferences use the same identity rule and live in their own private
  one-row-per-user table. A per-user local fallback keeps them adjustable when
  the backend is temporarily unavailable; unsynced changes remain marked for
  upload and are retried on the next authenticated load.
- A per-user local cache keeps the preview usable when the development backend
  is unavailable. A successful authenticated connection treats Convex as the
  source of truth and migrates local-only preview activity once.
- New roles are calculated from the catalogue discovery timestamp (falling
  back to the source posting date), the member's previous board visit, and the
  member's private viewed-job timestamps. The first visit uses a seven-day
  lookback. Counts are explicitly scoped to the roles currently loaded.
- Opening a card marks it viewed; loading the feed or saving from the card does
  not. Viewed state and the visit marker use the same B2C session-derived user
  boundary as applications and preferences, with a per-user offline fallback.
- The Placement Line tab continues to use its existing implementation.

## Production safety

The board is behind the remote flag `freehire_job_board` (2026-09-02):

- Dev builds always show the new board.
- Packaged builds ask the server per user. Modes: `off` (default, nobody),
  `internal` (founders + test accounts), `all`. Flip with:
  `npx convex run b2cFeatureFlags:setFlag '{"key":"freehire_job_board","mode":"internal"}' --prod`
- Any flag-fetch failure falls back to the legacy board.
- The main-process FreeHire handler independently honors the global mode
  (cached 5 min) — setting `off` is a true kill switch even for running apps.

The Convex additions are isolated to `b2cFreeHireJobTracking`,
`b2cFreeHireJobPreferences`, `b2cFreeHireJobVisits`, a feed-safe internal query
in `b2cPublicJobs.ts`, internal functions in `b2cJobBoard.ts`, a B2C session
resolver, and three HTTP endpoints. The curated-source bridge enforces active +
non-VIP filtering before mapping rows into the shared job shape.
The existing login flow is reused unchanged. FreeHire market analytics are
read-only, pass through guarded Electron IPC, and are cached for five minutes.

## Fast rollback

For the smallest rollback, set `SHOW_FREEHIRE_JOB_BOARD_PREVIEW` to `false` in
`src/renderer/views/JobBoardView.tsx`. This restores the existing public board
without deleting any code.

For a complete removal, also remove:

1. `src/renderer/views/FreeHireJobBoardPreview.tsx`
2. the `freehire:search`, `freehire:facets`, and
   `freehire:market-insights` handlers in `src/index.ts`
3. the `FreeHire*` interfaces and `freeHire` bridge in `src/preload.ts`
4. the matching declarations in `src/renderer/types/electron.d.ts`
5. the FreeHire activity and preference client helpers in `src/renderer/convex.ts`
6. `b2cFreeHireJobTracking`, `b2cFreeHireJobPreferences`,
   `b2cFreeHireJobVisits`, and the FreeHire-only internal functions/routes in
   `apps/web/convex/{schema,b2cJobBoard,b2cAuth,http}.ts`

## Development backend

By default the activity client uses Sequ3nce's normal Convex site. To exercise
the feature against an isolated development deployment, launch Electron with:

```bash
FREEHIRE_DEV_CONVEX_SITE_URL=https://your-dev-deployment.convex.site npm run start
```

The corresponding Convex source lives in `apps/web/convex`; it must be pushed
to that development deployment before authenticated sync can succeed. Cached
sessions created before `sessionToken` shipped show a re-login notice and never
fall back to trusting a client-provided user ID.

## Operational follow-up

- Add source monitoring, observability, and a provider-failure fallback before
  widening the rollout.
- Review FreeHire API/license terms and upstream availability before relying on
  its hosted endpoint in a paid product.
