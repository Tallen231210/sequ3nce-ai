// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://6a3f18d7618b8535433a9bef45954fc9@o4511407563276288.ingest.us.sentry.io/4511407582216192",

  // 10% trace sampling — 100% (the wizard default) burns through the
  // free tier's monthly event quota in days at any real traffic level.
  // Errors are always captured 100%; this only affects performance traces.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
