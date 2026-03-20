import { v } from "convex/values";
import { mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Duplicate crypto helpers (Convex files don't cross-import custom utilities)
async function hashCode(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyCodeHash(
  code: string,
  hash: string
): Promise<boolean> {
  const inputHash = await hashCode(code);
  if (inputHash.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < inputHash.length; i++) {
    result |= inputHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

/** Generate a 6-digit verification code and store its hash on the user record */
export const generateEmailVerificationCode = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (!user) {
      // Don't reveal whether email exists
      return { success: true, code: null } as const;
    }

    // Already verified (true or undefined = grandfathered)
    if (user.emailVerified === true || user.emailVerified === undefined) {
      return { success: true, alreadyVerified: true, code: null } as const;
    }

    // Enforce resend cooldown
    if (user.emailVerificationLastSent) {
      const elapsed = Date.now() - user.emailVerificationLastSent;
      if (elapsed < RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return { success: false, cooldown: true, retryAfter, code: null } as const;
      }
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hashCode(code);
    const now = Date.now();

    await ctx.db.patch(user._id, {
      emailVerificationCode: codeHash,
      emailVerificationExpiry: now + VERIFICATION_CODE_EXPIRY_MS,
      emailVerificationLastSent: now,
    });

    return { success: true, code, userName: user.name } as const;
  },
});

/** Send a verification email via Resend */
export const sendEmailVerificationCode = action({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<{
    success: boolean;
    error?: string;
    alreadyVerified?: boolean;
    retryAfter?: number;
  }> => {
    const normalizedEmail = email.trim().toLowerCase();

    const result = await ctx.runMutation(
      internal.b2cEmailVerification.generateEmailVerificationCode,
      { email: normalizedEmail }
    );

    // Already verified — no email needed
    if ("alreadyVerified" in result && result.alreadyVerified) {
      return { success: true, alreadyVerified: true };
    }

    // Cooldown active
    if ("cooldown" in result && result.cooldown) {
      return { success: false, error: "Please wait before requesting another code", retryAfter: result.retryAfter };
    }

    // No user found — return success to prevent enumeration
    if (!result.code) {
      return { success: true };
    }

    // Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return { success: false, error: "Email service not configured" };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Sequ3nce <noreply@noreply.sequ3nce.ai>",
          to: [normalizedEmail],
          subject: "Your Sequ3nce Verification Code",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #111; margin-bottom: 8px;">Verify Your Email</h2>
              <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
                Hi ${result.userName || "there"}, use the code below to verify your email address. This code expires in 15 minutes.
              </p>
              <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${result.code}</span>
              </div>
              <p style="color: #999; font-size: 12px;">
                If you didn't create a Sequ3nce account, you can safely ignore this email.
              </p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Resend API error:", response.status, errorText);
        return { success: false, error: "Failed to send verification email" };
      }

      return { success: true };
    } catch (error) {
      console.error("Error sending verification email:", error);
      return { success: false, error: "Failed to send verification email" };
    }
  },
});

/** Verify the 6-digit email verification code */
export const verifyEmailCode = mutation({
  args: {
    email: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const code = args.code.trim();

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return { success: false, error: "Invalid verification code" };
    }

    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return { success: false, error: "Invalid verification code" };
    }

    // Already verified — idempotent success
    if (user.emailVerified === true || user.emailVerified === undefined) {
      return { success: true };
    }

    // No code stored
    if (!user.emailVerificationCode || !user.emailVerificationExpiry) {
      return { success: false, error: "No verification code found. Please request a new one." };
    }

    // Check expiry
    if (Date.now() > user.emailVerificationExpiry) {
      await ctx.db.patch(user._id, {
        emailVerificationCode: undefined,
        emailVerificationExpiry: undefined,
      });
      return { success: false, error: "Verification code has expired. Please request a new one." };
    }

    // Constant-time verify
    const codeValid = await verifyCodeHash(code, user.emailVerificationCode);
    if (!codeValid) {
      return { success: false, error: "Invalid verification code" };
    }

    // Mark as verified, clear verification fields
    await ctx.db.patch(user._id, {
      emailVerified: true,
      emailVerificationCode: undefined,
      emailVerificationExpiry: undefined,
      emailVerificationLastSent: undefined,
    });

    return { success: true };
  },
});
