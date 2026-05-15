import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

// Meta Conversions API endpoint.
//
// Receives conversion events from the browser via trackMetaEvent() in
// @/lib/meta-pixel, hashes PII per Meta's spec, and POSTs the event
// to graph.facebook.com. Browser pixel + this server event share the
// same event_id so Meta dedupes them.
//
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
//
// Env vars required (set in Vercel):
//   NEXT_PUBLIC_META_PIXEL_ID — pixel/dataset ID
//   META_CONVERSIONS_API_TOKEN — long-lived access token, server-only

const META_API_VERSION = "v18.0";

interface IncomingBody {
  eventId: string;
  eventName: string;
  eventSourceUrl?: string;
  customData?: {
    product?: "b2b" | "b2c";
    value?: number;
    currency?: string;
    contentIds?: string[];
  };
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Normalize + hash an email per Meta's spec (lowercase + trim). */
function hashEmail(email: string): string {
  return sha256(email.trim().toLowerCase());
}

/** Normalize + hash a phone per Meta's spec (digits only, country code prefix). */
function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return sha256(digits);
}

/** Hash a name per Meta's spec (lowercase + trim, no normalization). */
function hashName(name: string): string {
  return sha256(name.trim().toLowerCase());
}

export async function POST(req: NextRequest) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN?.trim();

  if (!pixelId || !accessToken) {
    console.error("[meta-capi] Missing env vars");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  let body: IncomingBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.eventId || !body.eventName) {
    return NextResponse.json(
      { error: "Missing eventId or eventName" },
      { status: 400 },
    );
  }

  // Build user_data — only include fields we actually have. Hash PII
  // with SHA-256 per Meta's requirements (they reject raw email/phone).
  const userData: Record<string, string | string[]> = {};

  if (body.userData?.email) userData.em = hashEmail(body.userData.email);
  if (body.userData?.phone) userData.ph = hashPhone(body.userData.phone);
  if (body.userData?.firstName) userData.fn = hashName(body.userData.firstName);
  if (body.userData?.lastName) userData.ln = hashName(body.userData.lastName);

  // Forward request-scoped IP + UA to improve match quality. The
  // browser pixel sees these on its side, and matching them server-
  // side helps Meta confirm both events are the same person.
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    undefined;
  const userAgent = req.headers.get("user-agent") || undefined;
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;

  // Build custom_data — only include fields we actually have.
  const customData: Record<string, unknown> = {};
  if (body.customData?.value !== undefined) {
    customData.value = body.customData.value;
    customData.currency = body.customData.currency ?? "USD";
  }
  if (body.customData?.contentIds?.length) {
    customData.content_ids = body.customData.contentIds;
  }
  if (body.customData?.product) {
    customData.product = body.customData.product;
  }

  const payload = {
    data: [
      {
        event_name: body.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: body.eventId,
        event_source_url: body.eventSourceUrl,
        action_source: "website",
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const responseBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[meta-capi] Meta API rejected event:", {
        status: res.status,
        body: responseBody,
        eventName: body.eventName,
      });
      return NextResponse.json(
        { error: "Meta rejected event", details: responseBody },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[meta-capi] Failed to call Meta API:", err);
    return NextResponse.json({ error: "Network error" }, { status: 502 });
  }
}
