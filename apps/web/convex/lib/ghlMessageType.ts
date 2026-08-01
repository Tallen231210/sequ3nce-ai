// ============================================================================
// What counts as a call, and what counts as a text.
//
// GoHighLevel labels a message differently depending on who delivered it. Its
// own phone system produces TYPE_CALL / TYPE_SMS. Anything bolted on through
// the marketplace — Sendblue, Aircall, JustCall, Kixie — is a "custom
// conversation provider", and those produce TYPE_CUSTOM_CALL / TYPE_CUSTOM_SMS
// instead.
//
// We only ever recognised the first pair. A team dialling through Sendblue
// therefore synced perfectly: contacts, opportunities, users, no errors — and
// not one dial. Measured on one install: 5,828 messages fetched, 5,828
// discarded as "some other kind of message". Nothing logged it, because an
// unrecognised type is a legitimate everyday occurrence (emails, activity
// entries) and not an error.
//
// The two sources also disagree on shape, which is the other half of why this
// went unnoticed:
//
//   REST  /conversations/:id/messages → messageType: "TYPE_CUSTOM_CALL"
//   Webhook InboundMessage            → messageType: "Custom",
//                                       messageTypeString: "TYPE_CUSTOM_SMS",
//                                       messageTypeId: 20
//
// So a webhook's `messageType` is the literal word "Custom" and carries no
// information. The real answer is in `messageTypeString`. Reading the wrong
// field is what let the live path fail silently alongside the backfill.
// ============================================================================

export type GhlMessageKind = "CALL" | "SMS";

/**
 * Every spelling we've actually observed, per source. Kept explicit rather
 * than inferred so that adding one is a deliberate, reviewable act.
 */
const CALL_TYPES = new Set([
  "CALL", // webhook, native
  "TYPE_CALL", // REST, native
  "TYPE_CUSTOM_CALL", // REST + webhook messageTypeString, custom provider
]);

const SMS_TYPES = new Set([
  "SMS", // webhook, native
  "TYPE_SMS", // REST, native
  "TYPE_CUSTOM_SMS", // REST + webhook messageTypeString, custom provider
]);

/**
 * Numeric ids. GHL sends these as `type` (REST) or `messageTypeId` (webhook).
 * 25/1/2 are the values the original native-only implementation trusted;
 * 34 and 20 are the custom-provider equivalents, confirmed against live data.
 *
 * Numbers are a fallback, not the primary signal — a string is present on
 * every payload we've seen, and the numeric space is undocumented enough that
 * guessing at unobserved values would be how we mislabel someone's email as a
 * phone call.
 */
const NUMERIC_TYPES: Record<number, GhlMessageKind> = {
  1: "SMS",
  2: "SMS",
  20: "SMS", // TYPE_CUSTOM_SMS
  25: "CALL",
  34: "CALL", // TYPE_CUSTOM_CALL
};

export interface GhlTypedMessage {
  messageType?: unknown;
  messageTypeString?: unknown;
  messageTypeId?: unknown;
  type?: unknown;
}

/**
 * Decide whether a GHL message is a call, a text, or neither.
 *
 * Returns null for everything else — emails, activity entries, live chat —
 * which is the overwhelming majority of traffic and entirely uninteresting to
 * Setter Data.
 */
export function normalizeGhlMessageKind(
  msg: GhlTypedMessage,
): GhlMessageKind | null {
  // Strings first, most specific field first. `messageTypeString` only appears
  // on webhooks and is the only place a webhook states the real type.
  for (const raw of [msg.messageTypeString, msg.messageType]) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toUpperCase();
    if (CALL_TYPES.has(key)) return "CALL";
    if (SMS_TYPES.has(key)) return "SMS";
    // A provider we haven't catalogued yet. Falling through to the numeric
    // check is the whole point: "TYPE_CUSTOM_*" from some future dialer should
    // still land if its numeric id is one we know.
  }

  for (const raw of [msg.messageTypeId, msg.type]) {
    if (typeof raw !== "number") continue;
    const kind = NUMERIC_TYPES[raw];
    if (kind) return kind;
  }

  return null;
}

/**
 * True when the message came from a marketplace app rather than GHL's own
 * phone system.
 *
 * Matters because custom-provider calls arrive with no duration and no user —
 * the caller has to go and derive the duration from the recording instead of
 * trusting `callDuration`, which is simply absent.
 */
export function isCustomProviderMessage(msg: GhlTypedMessage): boolean {
  for (const raw of [msg.messageTypeString, msg.messageType]) {
    if (typeof raw === "string" && raw.trim().toUpperCase().includes("CUSTOM")) {
      return true;
    }
  }
  return false;
}
