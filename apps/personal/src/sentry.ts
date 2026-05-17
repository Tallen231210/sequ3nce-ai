// Sentry — main process initialization for Sequ3nce Personal.
//
// Init runs as the very first thing in main so we catch crashes in
// the rest of bootstrap (autoUpdater wiring, window creation, native
// dylib loads, etc). Renderer init is in src/renderer.ts; it doesn't
// need the DSN because the renderer SDK piggybacks on this main IPC.
//
// DSN is a public credential (designed to be embedded in client code).
// Safe to hardcode. The same DSN is used for both main + renderer.

import * as Sentry from "@sentry/electron/main";
import { app } from "electron";

const DSN =
  "https://78c5ac9850a170754adfe63696c22e0e@o4511407563276288.ingest.us.sentry.io/4511407591718912";

export function initSentry(): void {
  Sentry.init({
    dsn: DSN,
    // Capture the installed Personal app version as the release tag so
    // errors are grouped per release and we can spot regressions
    // introduced by a specific shipped build.
    release: `sequ3nce-personal@${app.getVersion()}`,
    // 10% trace sampling — same reasoning as web: errors always 100%,
    // only performance traces are sampled down. Keeps us inside the
    // free-tier monthly event quota.
    tracesSampleRate: 0.1,
    // Don't report errors from dev runs — they're noise (hot reload
    // failures, dev tools, etc).
    enabled: app.isPackaged,
  });
}
