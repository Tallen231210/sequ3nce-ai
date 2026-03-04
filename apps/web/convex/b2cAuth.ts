import { v } from "convex/values";
import { mutation, internalQuery } from "./_generated/server";

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
      name,
      passwordHash,
      personalWorkspaceId: teamId,
      subscriptionStatus: "none",
      createdAt: now,
    });

    return {
      success: true,
      b2cUserId,
      closerId,
      teamId,
      name,
      email,
      subscriptionStatus: "none",
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
      closer: {
        closerId: closer._id,
        teamId: user.personalWorkspaceId,
        name: user.name,
        email: user.email,
        status: closer.status,
        subscriptionStatus: user.subscriptionStatus,
        b2cUserId: user._id,
        role: user.role || "user",
      },
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
