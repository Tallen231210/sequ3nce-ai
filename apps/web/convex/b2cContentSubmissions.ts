import { v } from "convex/values";
import { mutation, internalQuery } from "./_generated/server";

const MAX_LABEL = 100;
const MAX_NOTE = 500;
const MAX_HANDLE = 100;
const MAX_URL = 500;

const VALID_CATEGORIES = [
  "objection_handle", "funny_moment", "great_close",
  "motivational", "testimonial", "other",
] as const;

const VALID_PAYMENT_METHODS = ["venmo", "paypal", "cashapp"] as const;

// ==================== Mutations ====================

export const submitClip = mutation({
  args: {
    userId: v.id("b2cUsers"),
    clipId: v.id("b2cHighlightClips"),
    category: v.string(),
    note: v.optional(v.string()),
    paymentHandle: v.string(),
    paymentMethod: v.string(),
    consentGiven: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.consentGiven) throw new Error("Consent is required");
    if (!VALID_CATEGORIES.includes(args.category as any)) throw new Error("Invalid category");
    if (!VALID_PAYMENT_METHODS.includes(args.paymentMethod as any)) throw new Error("Invalid payment method");
    if (!args.paymentHandle.trim() || args.paymentHandle.length > MAX_HANDLE) throw new Error("Invalid payment handle");
    if (args.note && args.note.length > MAX_NOTE) throw new Error("Note too long");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const clip = await ctx.db.get(args.clipId);
    if (!clip) throw new Error("Clip not found");
    if (clip.userId !== args.userId) throw new Error("Not authorized");
    if (clip.blurRegion === "none") throw new Error("Prospect must be blurred before submitting");
    if (clip.isFullCall) throw new Error("Only clips are accepted, not full calls");

    // Check for duplicate submission
    const existing = await ctx.db
      .query("b2cContentSubmissions")
      .withIndex("by_clip", (q) => q.eq("clipId", args.clipId))
      .first();
    if (existing) throw new Error("This clip has already been submitted");

    const submissionId = await ctx.db.insert("b2cContentSubmissions", {
      userId: args.userId,
      type: "clip",
      clipId: args.clipId,
      callId: clip.callId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      blurRegion: clip.blurRegion,
      label: clip.label.slice(0, MAX_LABEL),
      category: args.category,
      note: args.note?.slice(0, MAX_NOTE),
      paymentHandle: args.paymentHandle.trim().slice(0, MAX_HANDLE),
      paymentMethod: args.paymentMethod,
      consentGiven: true,
      status: "pending",
      createdAt: Date.now(),
    });

    return { submissionId };
  },
});

export const submitTestimonial = mutation({
  args: {
    userId: v.id("b2cUsers"),
    label: v.string(),
    videoUrl: v.string(),
    category: v.string(),
    note: v.optional(v.string()),
    paymentHandle: v.string(),
    paymentMethod: v.string(),
    consentGiven: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.consentGiven) throw new Error("Consent is required");
    if (!args.label.trim() || args.label.length > MAX_LABEL) throw new Error("Title is required (max 100 chars)");
    if (!args.videoUrl.trim() || !args.videoUrl.startsWith("http")) throw new Error("Valid video URL is required");
    if (args.videoUrl.length > MAX_URL) throw new Error("URL too long");
    if (!VALID_CATEGORIES.includes(args.category as any)) throw new Error("Invalid category");
    if (!VALID_PAYMENT_METHODS.includes(args.paymentMethod as any)) throw new Error("Invalid payment method");
    if (!args.paymentHandle.trim() || args.paymentHandle.length > MAX_HANDLE) throw new Error("Invalid payment handle");
    if (args.note && args.note.length > MAX_NOTE) throw new Error("Note too long");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const submissionId = await ctx.db.insert("b2cContentSubmissions", {
      userId: args.userId,
      type: "testimonial",
      videoUrl: args.videoUrl.trim().slice(0, MAX_URL),
      label: args.label.trim().slice(0, MAX_LABEL),
      category: args.category,
      note: args.note?.slice(0, MAX_NOTE),
      paymentHandle: args.paymentHandle.trim().slice(0, MAX_HANDLE),
      paymentMethod: args.paymentMethod,
      consentGiven: true,
      status: "pending",
      createdAt: Date.now(),
    });

    return { submissionId };
  },
});

export const reviewSubmission = mutation({
  args: {
    submissionId: v.id("b2cContentSubmissions"),
    reviewerUserId: v.id("b2cUsers"),
    action: v.union(v.literal("approve"), v.literal("reject")),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reviewer = await ctx.db.get(args.reviewerUserId);
    if (!reviewer) throw new Error("Reviewer not found");
    if (!reviewer.badges?.includes("founder")) throw new Error("Not authorized — founder access required");

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found");
    if (submission.status !== "pending") throw new Error("Submission already reviewed");
    if (submission.userId === args.reviewerUserId) throw new Error("Cannot review your own submission");

    await ctx.db.patch(args.submissionId, {
      status: args.action === "approve" ? "approved" : "rejected",
      reviewedBy: args.reviewerUserId,
      reviewedAt: Date.now(),
      rejectionReason: args.action === "reject" ? args.rejectionReason : undefined,
    });

    return { success: true };
  },
});

export const markPaid = mutation({
  args: {
    submissionId: v.id("b2cContentSubmissions"),
    reviewerUserId: v.id("b2cUsers"),
    paidAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const reviewer = await ctx.db.get(args.reviewerUserId);
    if (!reviewer) throw new Error("Reviewer not found");
    if (!reviewer.badges?.includes("founder")) throw new Error("Not authorized");

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found");
    if (submission.status !== "approved") throw new Error("Can only mark approved submissions as paid");

    await ctx.db.patch(args.submissionId, {
      status: "paid",
      paidAmount: args.paidAmount,
      reviewedBy: args.reviewerUserId,
      reviewedAt: Date.now(),
    });

    return { success: true };
  },
});

// ==================== Queries ====================

export const getMySubmissions = internalQuery({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cContentSubmissions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const getPendingSubmissions = internalQuery({
  args: { reviewerUserId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    // Verify founder access
    const reviewer = await ctx.db.get(args.reviewerUserId);
    if (!reviewer?.badges?.includes("founder")) return [];

    const submissions = await ctx.db
      .query("b2cContentSubmissions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    // Enrich with submitter info + recording URLs
    return await enrichSubmissions(ctx, submissions);
  },
});

export const getAllSubmissions = internalQuery({
  args: {
    reviewerUserId: v.id("b2cUsers"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reviewer = await ctx.db.get(args.reviewerUserId);
    if (!reviewer?.badges?.includes("founder")) return [];

    let submissions;
    if (args.status && ["pending", "approved", "rejected", "paid"].includes(args.status)) {
      submissions = await ctx.db
        .query("b2cContentSubmissions")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .collect();
    } else {
      submissions = await ctx.db
        .query("b2cContentSubmissions")
        .order("desc")
        .collect();
    }

    return await enrichSubmissions(ctx, submissions);
  },
});

export const getSubmissionsByClip = internalQuery({
  args: { clipId: v.id("b2cHighlightClips") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cContentSubmissions")
      .withIndex("by_clip", (q) => q.eq("clipId", args.clipId))
      .collect();
  },
});

// Enrich submissions with submitter name/email and recording URL
async function enrichSubmissions(
  ctx: any,
  submissions: any[]
): Promise<any[]> {
  return await Promise.all(
    submissions.map(async (sub) => {
      const user = await ctx.db.get(sub.userId);
      let recordingUrl: string | null = null;
      if (sub.callId) {
        const call = await ctx.db.get(sub.callId);
        recordingUrl = call?.recordingUrl ?? null;
      }
      return {
        ...sub,
        submitterName: user?.name ?? "Unknown",
        submitterEmail: user?.email ?? "",
        recordingUrl,
      };
    })
  );
}
