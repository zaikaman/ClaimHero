import { query, internalQuery, internalMutation, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "./lib/auth";
import { seedDemoCasesForUser } from "./demoSeeder";
import { vGoogleProfile } from "@convex-dev/auth/providers/oauth/google";

/**
 * Creates a user row when an account signs up with password.
 * Strictly throws on email collision to prevent account takeover and invite theft.
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

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      throw new ConvexError("An account with this email address already exists. Please sign in instead.");
    }

    const userId = await ctx.db.insert("users", {
      name: rawUsername.split("@")[0],
      email: email,
      provider: "password",
      providerAccountId: args.providerAccountId,
      role: "advocate",
      createdAt: Date.now(),
    });

    // Atomically pre-seed 3 demo cases for new password accounts
    await seedDemoCasesForUser(ctx, userId);

    return userId;
  },
});

/**
 * Creates or links a user row when an account signs in with Google OAuth.
 * Enforces providerAccountId verification and blocks linking to unverified squatted accounts.
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
        if (existing.providerAccountId && existing.providerAccountId !== args.providerAccountId) {
          throw new ConvexError("This email is already associated with another account.");
        }
        if (!existing.emailVerificationTime && existing.provider === "password") {
          if (!args.profile.emailVerified) {
            throw new ConvexError("An unverified account with this email already exists. Please sign in or verify ownership.");
          }
        }

        await ctx.db.patch(existing._id, {
          name: existing.name || args.profile.name || undefined,
          image: existing.image || args.profile.picture || undefined,
          provider: "google",
          providerAccountId: args.providerAccountId,
          emailVerificationTime: args.profile.emailVerified ? Date.now() : existing.emailVerificationTime,
        });

        // If existing account has 0 claims in their workspace, seed demo cases so they are ready out of the box
        const existingClaim = await ctx.db
          .query("claims")
          .withIndex("by_user", (q) => q.eq("userId", existing._id))
          .first();
        if (!existingClaim) {
          await seedDemoCasesForUser(ctx, existing._id);
        }

        return existing._id;
      }
    }

    const userId = await ctx.db.insert("users", {
      name: args.profile.name || (args.profile.email ? args.profile.email.split("@")[0] : "Advocate"),
      email: args.profile.email || undefined,
      image: args.profile.picture || undefined,
      provider: "google",
      providerAccountId: args.providerAccountId,
      emailVerificationTime: args.profile.emailVerified ? Date.now() : undefined,
      role: "advocate",
      createdAt: Date.now(),
    });

    // Atomically pre-seed 3 demo cases for new Google OAuth accounts
    await seedDemoCasesForUser(ctx, userId);

    return userId;
  },
});

/**
 * Creates an anonymous user row and atomically seeds 3 comprehensive demo cases.
 */
export const createAnonymousUser = internalMutation({
  args: {
    provider: v.literal("anonymous"),
    providerAccountId: v.string(),
    profile: v.object({}),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", {
      name: "Anonymous Advocate",
      provider: "anonymous",
      providerAccountId: args.providerAccountId,
      role: "advocate",
      isAnonymous: true,
      createdAt: Date.now(),
    });

    // Atomically pre-seed 3 demo cases with full evidence, brief, and audit trail
    await seedDemoCasesForUser(ctx, userId);

    return userId;
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
