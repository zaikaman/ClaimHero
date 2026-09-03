import { query, internalQuery, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "./lib/auth";

/**
 * Creates a user row when an account signs up with password.
 */
export const createPasswordUser = internalMutation({
  args: {
    provider: v.literal("password"),
    providerAccountId: v.string(),
    profile: v.object({ username: v.string() }),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const rawUsername = args.profile.username;
    const email = rawUsername.includes("@") ? rawUsername : `${rawUsername}@claimhero.ai`;
    return await ctx.db.insert("users", {
      name: rawUsername.split("@")[0],
      email: email,
      role: "advocate",
      createdAt: Date.now(),
    });
  },
});

import { vGoogleProfile } from "@convex-dev/auth/providers/oauth/google";

/**
 * Creates or links a user row when an account signs in with Google OAuth.
 */
export const createGoogleUser = internalMutation({
  args: {
    provider: v.literal("google"),
    providerAccountId: v.string(),
    profile: vGoogleProfile,
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    if (args.profile.email) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.profile.email))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          name: existing.name || args.profile.name || undefined,
          image: existing.image || args.profile.picture || undefined,
          emailVerificationTime: args.profile.emailVerified ? Date.now() : existing.emailVerificationTime,
        });
        return existing._id;
      }
    }

    return await ctx.db.insert("users", {
      name: args.profile.name || (args.profile.email ? args.profile.email.split("@")[0] : "Advocate"),
      email: args.profile.email || undefined,
      image: args.profile.picture || undefined,
      emailVerificationTime: args.profile.emailVerified ? Date.now() : undefined,
      role: "advocate",
      createdAt: Date.now(),
    });
  },
});

/**
 * Returns the currently authenticated user record from Convex database, or null if unauthenticated.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    return user;
  },
});

/**
 * Internal query to look up a user by their Convex ID for background notifications.
 */
export const getUserByIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Updates the profile of the currently authenticated user.
 */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const updates: { name?: string; image?: string } = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.image !== undefined) updates.image = args.image;
    await ctx.db.patch(userId, updates);
    return await ctx.db.get(userId);
  },
});
