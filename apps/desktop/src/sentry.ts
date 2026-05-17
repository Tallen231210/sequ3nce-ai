// Sentry — main process initialization for Sequ3nce Desktop (B2B).
//
// Init runs as the very first thing in main so we catch crashes in
// the rest of bootstrap (autoUpdater wiring, window creation, native
// dylib loads, etc). Renderer init is in src/renderer.ts; it doesn't
// need the DSN because the renderer SDK piggybacks on this main IPC.
//
// DSN is a public credential (designed to be embedded in client code).
// Safe to hardcode. Separate DSN from Personal so errors are tagged
// by product in Sentry.

import * as Sentry from "@sentry/electron/main";
import { app } from "electron";

const DSN =
  "https://d8a7aaf97a233dcdcab67744554cad29@o4511407563276288.ingest.us.sentry.io/4511407586934784";

export function initSentry(): void {
  Sentry.init({
    dsn: DSN,
    release: `sequ3nce-desktop@${app.getVersion()}`,
    tracesSampleRate: 0.1,
    enabled: app.isPackaged,
  });
}
