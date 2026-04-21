import { v } from "convex/values";
import { mutation, internalQuery, query, action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";

// Password hashing using Web Crypto API (same pattern as closers.ts)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time password comparison to prevent timing attacks
async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const inputHash = await hashPassword(password);
  if (inputHash.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < inputHash.length; i++) {
    result |= inputHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

// Input validation helpers
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{7,20}$/;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 8;

// Sign up a new B2C user
// Creates 3 records: b2cUsers + teams (personal workspace) + closers (within workspace)
export const signupB2CUser = mutation({
  args: {
    email: v.string(),
    phone: v.string(),
    password: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const phone = args.phone.trim();
    const name = args.name.trim();

    // Validate required fields
    if (!email || !phone || !name) {
      return { success: false, error: "All fields are required" };
    }

    // Validate field lengths
    if (email.length > MAX_EMAIL_LENGTH) {
      return { success: false, error: "Email is too long" };
    }
    if (name.length > MAX_NAME_LENGTH) {
      return { success: false, error: "Name is too long" };
    }
    if (args.password.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: "Password must be at least 8 characters" };
    }
    if (args.password.length > MAX_PASSWORD_LENGTH) {
      return { success: false, error: "Password is too long" };
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return { success: false, error: "Invalid email format" };
    }

    // Validate phone format
    if (!PHONE_REGEX.test(phone)) {
      return { success: false, error: "Invalid phone number format" };
    }

    // Check if email already taken
    const existingEmail = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingEmail) {
      return { success: false, error: "An account with this email already exists" };
    }

    // Check if phone already taken (phone is the primary identity key)
    const existingPhone = await ctx.db
      .query("b2cUsers")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();

    if (existingPhone) {
      return { success: false, error: "An account with this phone number already exists" };
    }

    const passwordHash = await hashPassword(args.password);
    const now = Date.now();

    // 1. Create personal workspace (team of one)
    const teamId = await ctx.db.insert("teams", {
      name: `${name}'s Workspace`,
      type: "personal",
      plan: "active",
      createdAt: now,
    });

    // 2. Create closer record within the personal workspace
    const closerId = await ctx.db.insert("closers", {
      email,
      name,
      teamId,
      status: "active",
      passwordHash,
      phone,
      invitedAt: now,
      activatedAt: now,
    });

    // 3. Create b2cUsers record
    const b2cUserId = await ctx.db.insert("b2cUsers", {
      email,
      phone,
      phoneVerified: false,
      emailVerified: false,
      name,
      passwordHash,
      personalWorkspaceId: teamId,
      subscriptionStatus: "none",
      createdAt: now,
    });

    // 4. New users start with "none" — trial is managed by Stripe (45-day free trial on checkout)
    // Existing beta users (first 50) who already have trials are untouched (their data is already in the DB)

    // Determine pricing tier for new user
    const totalUsers = await ctx.db.query("b2cUsers").collect();
    const pricingTier = totalUsers.length <= 100 ? "early" : "standard";

    // Sync to GHL — append the `b2c-signed-up` tag so marketing's workflow
    // exits the "downloaded but didn't sign up" nurture sequence. Fire-and-forget.
    await ctx.scheduler.runAfter(0, api.b2cGhl.syncSignupToGHL, {
      email,
      phone,
      name,
    });

    return {
      success: true,
      b2cUserId,
      closerId,
      teamId,
      name,
      email,
      subscriptionStatus: "none" as const,
      trialExpiresAt: undefined,
      pricingTier,
    };
  },
});

// Log in an existing B2C user
export const loginB2CUser = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    // Find B2C user by email
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return { success: false, error: "Invalid email or password" };
    }

    // Verify password (constant-time comparison)
    const valid = await verifyPassword(args.password, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Invalid email or password" };
    }

    // Update last login timestamp
    await ctx.db.patch(user._id, { lastLoginAt: Date.now() });

    // Check if trial has expired (trial user = has trialExpiresAt but no subscriptionId)
    let currentSubscriptionStatus = user.subscriptionStatus;
    if (
      user.trialExpiresAt &&
      user.trialExpiresAt < Date.now() &&
      user.subscriptionStatus === "active" &&
      !user.subscriptionId
    ) {
      await ctx.db.patch(user._id, { subscriptionStatus: "none" });
      currentSubscriptionStatus = "none";
    }

    // Find the closer record in their personal workspace
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.personalWorkspaceId))
      .first();

    if (!closer) {
      return {
        success: false,
        error: "Account data is corrupted. Please contact support.",
      };
    }

    return {
      success: true,
      emailVerified: user.emailVerified === undefined ? true : user.emailVerified,
      closer: {
        closerId: closer._id,
        teamId: user.personalWorkspaceId,
        name: user.name,
        email: user.email,
        status: closer.status,
        subscriptionStatus: currentSubscriptionStatus,
        b2cUserId: user._id,
        role: user.role || "user",
        badges: user.badges || [],
        trialExpiresAt: user.trialExpiresAt,
        onboardingCompleted: user.onboardingCompleted || false,
        pricingTier: await (async () => {
          const totalUsers = await ctx.db.query("b2cUsers").collect();
          return totalUsers.length <= 100 ? "early" : "standard";
        })(),
      },
    };
  },
});

// Save onboarding questionnaire answers
export const completeOnboarding = mutation({
  args: {
    userId: v.id("b2cUsers"),
    source: v.string(),
    income: v.string(),
    struggle: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(args.userId, {
      onboardingCompleted: true,
      onboardingSource: args.source,
      onboardingIncome: args.income,
      onboardingStruggle: args.struggle,
    });

    return { success: true };
  },
});

// Public: resolve a minimal session refresh for a B2C user by email.
// Returns only b2cUserId (plus subscriptionStatus, which callers would refetch anyway) —
// used by the Personal app to hydrate stale localStorage that predates the b2cUserId field.
// Email is low-sensitivity because the signup/login endpoints already leak existence of an account.
export const resolveSessionByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email) return { b2cUserId: null, subscriptionStatus: null };

    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) return { b2cUserId: null, subscriptionStatus: null };

    return {
      b2cUserId: user._id,
      subscriptionStatus: user.subscriptionStatus ?? null,
    };
  },
});

// Look up B2C user by email (internal only — not exposed to clients directly)
export const getB2CUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return null;
    }

    // Don't expose phone number in query responses
    return {
      b2cUserId: user._id,
      email: user.email,
      name: user.name,
      phoneVerified: user.phoneVerified,
      subscriptionStatus: user.subscriptionStatus,
      personalWorkspaceId: user.personalWorkspaceId,
      profileSlug: user.profileSlug,
      createdAt: user.createdAt,
    };
  },
});

// Set admin role on a B2C user (run via CLI: npx convex run b2cAuth:setAdminRole '{"userId":"..."}' --prod)
export const setAdminRole = mutation({
  args: {
    userId: v.id("b2cUsers"),
    role: v.optional(v.string()), // "admin" to grant, undefined/null to revoke
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { role: args.role || undefined });
    return { success: true, role: args.role || "user" };
  },
});

// Set badges on a B2C user (run via CLI: npx convex run b2cAuth:setBadges '{"userId":"...","badges":["founder"]}' --prod)
export const setBadges = mutation({
  args: {
    userId: v.id("b2cUsers"),
    badges: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { badges: args.badges });
    return { success: true, badges: args.badges };
  },
});

// Admin: update a B2C user's email (run via CLI: npx convex run b2cAuth:adminUpdateEmail '{"userId":"...","newEmail":"..."}' --prod)
export const adminUpdateEmail = mutation({
  args: {
    userId: v.id("b2cUsers"),
    newEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const newEmail = args.newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(newEmail)) throw new Error("Invalid email format");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Check if new email is already taken by another B2C user
    const existing = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", newEmail))
      .first();
    if (existing && existing._id !== args.userId) {
      throw new Error("Email already taken by another B2C account");
    }

    const oldEmail = user.email;

    // Update b2cUsers record
    await ctx.db.patch(args.userId, { email: newEmail });

    // Update the closer record in their personal workspace
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.personalWorkspaceId))
      .first();
    if (closer) {
      await ctx.db.patch(closer._id, { email: newEmail });
    }

    return { success: true, oldEmail, newEmail };
  },
});

// ==================== Password Reset ====================

const RESET_CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/** Generate a 6-digit reset code and store its hash on the user record */
export const generatePasswordResetCode = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (!user) {
      // Don't reveal whether email exists
      return { success: true, code: null };
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hashPassword(code);

    await ctx.db.patch(user._id, {
      passwordResetCode: codeHash,
      passwordResetExpiry: Date.now() + RESET_CODE_EXPIRY_MS,
    });

    return { success: true, code, userName: user.name };
  },
});

/** Request a password reset — generates code and sends email via Resend */
export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return { success: false, error: "Invalid email format" };
    }

    // Generate the reset code
    const result = await ctx.runMutation(internal.b2cAuth.generatePasswordResetCode, {
      email: normalizedEmail,
    });

    // Always return success to prevent email enumeration
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
          subject: "Your Sequ3nce Password Reset Code",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #111; margin-bottom: 8px;">Password Reset</h2>
              <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
                Hi ${result.userName || "there"}, use the code below to reset your password. This code expires in 15 minutes.
              </p>
              <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${result.code}</span>
              </div>
              <p style="color: #999; font-size: 12px;">
                If you didn't request this reset, you can safely ignore this email.
              </p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Resend API error:", response.status, errorText);
        return { success: false, error: "Failed to send reset email" };
      }

      return { success: true };
    } catch (error) {
      console.error("Error sending reset email:", error);
      return { success: false, error: "Failed to send reset email" };
    }
  },
});

/** Verify reset code and set new password */
export const resetPassword = mutation({
  args: {
    email: v.string(),
    code: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const code = args.code.trim();

    if (!EMAIL_REGEX.test(email)) {
      return { success: false, error: "Invalid email format" };
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return { success: false, error: "Invalid reset code" };
    }

    if (args.newPassword.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: "Password must be at least 8 characters" };
    }

    if (args.newPassword.length > MAX_PASSWORD_LENGTH) {
      return { success: false, error: "Password is too long" };
    }

    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user || !user.passwordResetCode || !user.passwordResetExpiry) {
      return { success: false, error: "Invalid or expired reset code" };
    }

    // Check expiry
    if (Date.now() > user.passwordResetExpiry) {
      // Clear expired code
      await ctx.db.patch(user._id, {
        passwordResetCode: undefined,
        passwordResetExpiry: undefined,
      });
      return { success: false, error: "Reset code has expired. Please request a new one." };
    }

    // Verify code (constant-time comparison)
    const codeValid = await verifyPassword(code, user.passwordResetCode);
    if (!codeValid) {
      return { success: false, error: "Invalid reset code" };
    }

    // Hash new password and update both b2cUsers and closers records
    const newPasswordHash = await hashPassword(args.newPassword);
    await ctx.db.patch(user._id, {
      passwordHash: newPasswordHash,
      passwordResetCode: undefined,
      passwordResetExpiry: undefined,
    });

    // Also update the closer record's password hash
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.personalWorkspaceId))
      .first();

    if (closer) {
      await ctx.db.patch(closer._id, { passwordHash: newPasswordHash });
    }

    return { success: true };
  },
});

// Admin: update subscription status (for testing / Stripe webhook handler)
export const updateSubscriptionStatus = mutation({
  args: {
    userId: v.id("b2cUsers"),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("past_due"),
      v.literal("none"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { subscriptionStatus: args.status });
    return { success: true };
  },
});

// Admin: update B2C user name
export const adminUpdateName = mutation({
  args: { userId: v.id("b2cUsers"), name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { name: args.name });
    // Also update the closer record
    const user = await ctx.db.get(args.userId);
    if (user?.personalWorkspaceId) {
      const closer = await ctx.db.query("closers").withIndex("by_team", q => q.eq("teamId", user.personalWorkspaceId)).first();
      if (closer) await ctx.db.patch(closer._id, { name: args.name });
    }
    return { success: true };
  },
});
