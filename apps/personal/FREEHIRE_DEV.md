# FreeHire job board integration

This integration is isolated inside Sequ3nce Personal and can be rolled out or
disabled without changing the legacy public board.

## What is included

- FreeHire's public job catalogue is fetched through fixed Electron IPC. For
  signed-in members, IPC calls Sequ3nce's authenticated Convex HTTP proxy first,
  so a member's residential network or VPN is not exposed to the catalogue
  provider. The proxy accepts only the exact read paths and query parameters
  used by the board; the renderer cannot turn it into an arbitrary web proxy.
- Successful proxy responses are cached in Convex for five minutes and may be
  served stale for up to 24 hours during an upstream interruption. During the
  first rollout, an unavailable proxy falls back to a direct public read; if
  that also fails, search still returns active non-VIP Sequ3nce-curated jobs.
  A provider outage therefore cannot remove the curated board. Curated-only
  responses carry an explicit `limited` state: the UI shows a maintenance
  notice, labels the count **Available now**, and replaces **Live feed** with
  **Limited results** so a sudden catalogue contraction is never misleading.
- For You keeps role, work mode, location, disclosed target pay, posting date,
  and sort in one compact, always-adjustable preference strip. Changes update
  the feed immediately; Best Match remains the default sort.
- The public board also provides pagination, company logos, full listing
  details, extracted compensation, source links, and catalogue reality signals.
- Active, non-VIP jobs from `b2cPublicJobs` are merged into the same feed as an
  additional source. They retain their own `source` label, appear first on the
  first page of the matching lane, and use the same save/stage/note flow.
- The unified feed conservatively consolidates repeated opportunities across
  FreeHire and curated sources. Exact cleaned application URLs are strong
  signals; otherwise company and location must agree, plus either an exact
  title or strong title-and-description similarity. Same-title openings in
  different regions remain separate, and unrelated roles sharing a generic
  careers URL are preserved.
- Consolidated cards prefer a direct company/ATS application URL over an
  aggregator, list every detected source, and keep the first feed identifier
  stable across loaded pages so existing tracking remains recognizable.
- Search slightly over-fetches and can request up to three bounded batches to
  replace removed duplicates. `nextOffset` tracks the consumed upstream rows,
  so later pages do not skip the extra candidates. The provider's headline
  total remains raw catalogue volume rather than an exact globally deduplicated
  count; calculating that would require indexing the full upstream catalogue.
- Curated rows with non-HTTPS application URLs are never exposed.
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
in `b2cPublicJobs.ts`, internal functions in `b2cJobBoard.ts`, the
`b2cFreeHireProxyCache` table and its internal helpers, a B2C session resolver,
and the related HTTP endpoints. The curated-source bridge enforces active +
non-VIP filtering before mapping rows into the shared job shape.
The existing login flow is reused unchanged. FreeHire market analytics are
read-only, pass through guarded Electron IPC, and are cached for five minutes.

### Interview practice preview

Development and test builds expose a job-specific **Practice interview** entry
point. It opens an isolated, full-window prototype with a pre-call device
check, optional local camera preview, hiring-manager and sales-role-play modes,
a provider-neutral session engine, and a session-derived mock debrief.

- The setup room now offers two practice formats. **Live mock interview** is
  the primary path: the operating system's local speech voice asks each
  question, microphone capture starts automatically, local voice-activity
  detection recognizes the end of a response, and the conversation advances
  through scripted mock follow-ups. **Guided answer practice** preserves the
  existing read, record, replay, retry, and manual next-question workflow.
- Live mode requires an active microphone and includes a visible
  **Finish response** fallback for background noise or unusually long pauses.
  Turn detection requires sustained voice activity, preserves ordinary
  thinking pauses, and waits for a longer silence before advancing. It does
  not call an LLM, speech API, billing service, or credit ledger. Confirming
  **End interview** during an active response stops and saves the local capture,
  then proceeds directly to the debrief without requiring a separate finish
  action.
- The call stage presents the animated Sequ3nce mark as the interviewer and
  keeps the user's mirrored camera in a compact bottom-right self-view tile.
  Its active-room UI uses one quiet call surface, a floating control dock,
  conversational stage labels, and an optional lightweight notes rail rather
  than a permanently dense dashboard.
- Setup, the active call, pause/confirmation states, and the complete debrief
  inherit the Personal app's existing class-based light/dark theme. Light mode
  uses Vercel-like white and soft-gray surfaces; dark mode retains the near-
  black call treatment. No interview-specific theme preference is stored.
- Camera and microphone controls use Electron's existing OS permission bridge
  and `getUserMedia`. The setup room explicitly unlocks and refreshes the full
  hardware list, preserves independent camera/microphone choices, and confirms
  the device currently active. All live and permission-probe tracks are stopped
  immediately when they are no longer needed or when the room closes.
- Camera video is local-only and is neither uploaded nor recorded.
- Microphone answers use the browser's local `MediaRecorder` and can be played
  back or retried during the current app session. Audio blobs are not uploaded
  or persisted across restarts.
- Pause/resume, guided previous/next controls, live transcript timeline, mock
  transcript generation, and a mock-scored report run through a replaceable
  interview-intelligence adapter. No external AI request, API key, credit, or
  billing path exists. The provider boundary is intentionally shaped so a
  later Realtime implementation can replace the local mock without rewriting
  the room UI or session history.
- The debrief is production-shaped around a role-specific four-part rubric,
  a selectable answer-by-answer coaching review, stronger-opening examples,
  a three-step practice plan, and comparison with earlier attempts for the
  same job. Session facts such as completion, duration, and attempt history
  are real; semantic ratings and coaching copy remain clearly labeled as a
  development evaluation until an intelligence provider is connected.
- In-progress recovery and the eight most recent summaries are stored under a
  localStorage key namespaced by the current B2C user ID. The recovered text
  state remains private to that account; transient audio is intentionally gone
  after an app restart.
- Production bundles omit the entry point because
  `INTERVIEW_PRACTICE_PREVIEW` is false when `NODE_ENV` is `production`.
- To revoke only this prototype, remove `InterviewPracticeRoom.tsx`,
  `renderer/lib/interview-session.ts`, its import and entry-point props in
  `FreeHireJobBoardPreview.tsx`, and the interview tests in
  `tests/e2e/freehire-job-board.spec.ts`.

## Fast rollback

For the smallest rollback, set `SHOW_FREEHIRE_JOB_BOARD_PREVIEW` to `false` in
`src/renderer/views/JobBoardView.tsx`. This restores the existing public board
without deleting any code.

For a complete removal, also remove:

1. `src/renderer/views/FreeHireJobBoardPreview.tsx`
2. `src/freehire-dedupe.ts`
3. the `freehire:search`, `freehire:get-job`, `freehire:facets`, and
   `freehire:market-insights` handlers in `src/index.ts`
4. the `FreeHire*` interfaces and `freeHire` bridge in `src/preload.ts`
5. the matching declarations in `src/renderer/types/electron.d.ts`
6. the FreeHire activity and preference client helpers in `src/renderer/convex.ts`
7. `b2cFreeHireJobTracking`, `b2cFreeHireJobPreferences`,
   `b2cFreeHireJobVisits`, `b2cFreeHireProxyCache`, and the FreeHire-only
   internal functions/routes in
   `apps/web/convex/{schema,b2cJobBoard,b2cAuth,b2cFreeHireProxy,http}.ts`

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

- Add source health monitoring and alerting before treating provider coverage
  as an availability guarantee.
- After the backend proxy is verified across the rollout, remove or feature-
  flag the temporary direct-read fallback to eliminate client-IP dependence
  completely.
- Review FreeHire API/license terms and upstream availability before relying on
  its hosted endpoint in a paid product.
