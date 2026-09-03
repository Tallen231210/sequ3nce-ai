# FreeHire job board integration

This integration is isolated inside Sequ3nce Personal and can be rolled out or
disabled without changing the legacy public board.

## What is included

- FreeHire's public job catalogue is fetched through a fixed Electron IPC
  handler. The renderer cannot turn it into an arbitrary web proxy.
- The public board offers preset sales lanes, work-mode and freshness filters,
  pagination, company logos, full listing details, extracted compensation,
  source links, and catalogue reality signals.
- Each preset lane can be narrowed by work mode, country, and posting date;
  Best Match remains the default sort.
- Market Insights uses FreeHire's full-set facet counts plus its aggregated
  Sales role, skill, salary, and weekly catalogue rollups. It never derives
  market claims from only the jobs currently loaded in the renderer.
- The tab labels its scope and known boundaries: skills and weekly activity are
  global Sales rollups, salary currencies and pay periods are kept separate,
  the current partial week is omitted, and no AI is used.
- Saving, stages, private notes, dismissals, restores, and activity timestamps
  are wired to authenticated Convex persistence. The server resolves the user
  exclusively from the B2C session token; the endpoint accepts no user ID.
- A per-user local cache keeps the preview usable when the development backend
  is unavailable. A successful authenticated connection treats Convex as the
  source of truth and migrates local-only preview activity once.
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

The Convex additions are isolated to `b2cFreeHireJobTracking`, internal
functions in `b2cJobBoard.ts`, a B2C session resolver, and one HTTP endpoint.
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
5. the FreeHire activity client helpers in `src/renderer/convex.ts`
6. `b2cFreeHireJobTracking` and the FreeHire-only internal functions/routes in
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
