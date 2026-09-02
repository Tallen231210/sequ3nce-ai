# FreeHire job board development integration

This integration is intentionally a development-only experiment inside
Sequ3nce Personal.

## What is live in development

- FreeHire's public job catalogue is fetched through a fixed Electron IPC
  handler. The renderer cannot turn it into an arbitrary web proxy.
- The public board offers preset sales lanes, work-mode and freshness filters,
  pagination, company logos, full listing details, extracted compensation,
  source links, and catalogue reality signals.
- High-Ticket mirrors FreeHire's broad worldwide relevance search. The other
  sales lanes remain scoped to U.S. sales roles and sort newest first.
- Saving, stages, private notes, dismissals, restores, and activity timestamps
  are wired to authenticated Convex persistence. The server resolves the user
  exclusively from the B2C session token; the endpoint accepts no user ID.
- A per-user local cache keeps the preview usable when the development backend
  is unavailable. A successful authenticated connection treats Convex as the
  source of truth and migrates local-only preview activity once.
- The Internal / Placement Line tab continues to use its existing implementation.

## Production safety

`JobBoardView.tsx` renders the new board only when
`process.env.NODE_ENV === 'development'`. Packaged builds continue to render
`LegacyJobBoardView`. The main-process FreeHire handler also refuses requests in
packaged production.

The Convex additions are isolated to `b2cFreeHireJobTracking`, internal
functions in `b2cJobBoard.ts`, a B2C session resolver, and one HTTP endpoint.
No deployment or production-data mutation is part of this development change.
The existing login flow is reused unchanged.

## Fast rollback

For the smallest rollback, set `SHOW_FREEHIRE_JOB_BOARD_PREVIEW` to `false` in
`src/renderer/views/JobBoardView.tsx`. This restores the existing public board
without deleting any code.

For a complete removal, also remove:

1. `src/renderer/views/FreeHireJobBoardPreview.tsx`
2. the `freehire:search` handler in `src/index.ts`
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

## Work required before production

- Add server-side catalogue caching, source monitoring, observability, and a
  provider-failure fallback.
- Review FreeHire API/license terms and upstream availability before relying on
  its hosted endpoint in a paid product.
- Add a production rollout migration and operational monitoring after the
  development deployment has been reviewed.
