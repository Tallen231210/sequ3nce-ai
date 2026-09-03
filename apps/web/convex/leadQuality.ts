// ============================================================================
// Lead-quality gate for the ads funnel (2026-09-03, co-founder request:
// low-quality traffic was clearing the old any-non-empty checks).
//
// Phone: 10–15 digits, junk patterns rejected, normalized toward E.164 so
// the number is textable in GHL. Email: syntax + disposable-domain blocklist
// + a live MX lookup over DNS-over-HTTPS. The MX check FAILS OPEN — a DNS
// hiccup must never cost a real lead.
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Domains of throwaway-inbox services. Not exhaustive — the MX check catches
// invented domains; this list catches the real services that DO have MX.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "yopmail.com", "yopmail.fr", "yopmail.net",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz",
  "sharklasers.com", "grr.la", "guerrillamailblock.com",
  "10minutemail.com", "10minutemail.net", "10minemail.com",
  "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net", "tempmail.dev",
  "tempmailo.com", "tempm.com", "tmpmail.org", "tmpmail.net", "tmails.net",
  "throwawaymail.com", "trashmail.com", "trashmail.de", "trash-mail.com",
  "getnada.com", "nada.email", "getairmail.com",
  "dispostable.com", "maildrop.cc", "mailnesia.com", "mintemail.com",
  "fakeinbox.com", "spamgourmet.com", "mytemp.email", "mohmal.com",
  "emailondeck.com", "tempail.com", "moakt.com", "moakt.cc", "tmail.ws",
  "burnermail.io", "mailsac.com", "inboxkitten.com", "33mail.com",
  "spam4.me", "mailcatch.com", "mailexpire.com", "tempinbox.com",
  "throwam.com", "mailbox52.ga", "eyepaste.com", "mailpoof.com",
  "harakirimail.com", "spambog.com", "spambog.de", "discard.email",
  "discardmail.com", "mailhazard.com", "binkmail.com", "safetymail.info",
  "tempr.email", "cuvox.de", "dayrep.com", "einrot.com", "fleckens.hu",
  "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us",
  "armyspy.com",
]);

export function validateLeadPhone(raw: string): { ok: true; normalized: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length < 10) {
    return { ok: false, reason: "That phone number looks too short — we need a full mobile number to reach you." };
  }
  if (digits.length > 15) {
    return { ok: false, reason: "That phone number looks too long — double-check it." };
  }
  // Junk patterns: one digit repeated, or a straight ascending/descending run.
  if (/^(\d)\1+$/.test(digits)) {
    return { ok: false, reason: "That doesn't look like a real mobile number." };
  }
  const ascending = "01234567890123456789";
  const descending = "98765432109876543210";
  if (ascending.includes(digits) || descending.includes(digits)) {
    return { ok: false, reason: "That doesn't look like a real mobile number." };
  }

  // Normalize toward E.164 so GHL can text it: bare 10-digit numbers are
  // treated as US/Canada (the ads run there); 11 digits starting with 1 too.
  let normalized: string;
  if (hasPlus) normalized = `+${digits}`;
  else if (digits.length === 10) normalized = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) normalized = `+${digits}`;
  else normalized = `+${digits}`;

  return { ok: true, normalized };
}

/**
 * Email deliverability gate. Syntax and disposable checks are instant; the
 * MX lookup asks Cloudflare's DNS-over-HTTPS whether the domain can receive
 * mail at all. Any lookup failure (timeout, DoH outage) ALLOWS the email.
 */
export async function checkLeadEmail(email: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cleaned = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(cleaned) || cleaned.length > 254) {
    return { ok: false, reason: "That email address doesn't look right — double-check it." };
  }
  const domain = cleaned.split("@")[1];

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: "Temporary email addresses don't work here — use the inbox you actually check." };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
        { headers: { Accept: "application/dns-json" }, signal: controller.signal },
      );
      if (!response.ok) return { ok: true }; // fail open
      const data = await response.json() as { Status?: number; Answer?: Array<{ type: number }> };
      const hasMx = Array.isArray(data.Answer) && data.Answer.some((a) => a.type === 15);
      if (hasMx) return { ok: true };

      // No MX — some tiny domains receive mail on a bare A record. One more
      // lookup before rejecting; any ambiguity still lets the lead through.
      const aResponse = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
        { headers: { Accept: "application/dns-json" }, signal: controller.signal },
      );
      if (!aResponse.ok) return { ok: true };
      const aData = await aResponse.json() as { Answer?: Array<{ type: number }> };
      const hasA = Array.isArray(aData.Answer) && aData.Answer.some((a) => a.type === 1);
      if (hasA) return { ok: true };

      return { ok: false, reason: "That email's domain can't receive mail — check the spelling after the @." };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { ok: true }; // never lose a real lead to a DNS hiccup
  }
}
