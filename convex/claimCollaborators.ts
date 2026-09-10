import { internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  assertValidCollaboratorEmail,
  getAuthUserId,
  normalizeCollaboratorEmail,
  requireAuthUser,
  requireClaimOwner,
  getClaimIfAuthorized,
  type ClaimAccessRole,
} from "./lib/auth";

export const collaboratorRoleValidator = v.union(v.literal("editor"), v.literal("viewer"));

async function resolveUserIdByEmail(
  ctx: MutationCtx,
  email: string
): Promise<Id<"users"> | undefined> {
  try {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    return existing?._id;
  } catch {
    return undefined;
  }
}

/**
 * Internal role lookup for ActionCtx guards. Actions cannot touch ctx.db,
 * so they delegate to this query. Returns editor/viewer/owner or null.
 */
export const getRoleInternal = internalQuery({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<ClaimAccessRole | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return null;
    if (claim.userId && claim.userId === userId) return "owner";
    if (!claim.userId) return null;
    const user = await ctx.db.get(userId);
    const userEmail = user?.email ? normalizeCollaboratorEmail(user.email) : null;
    const grants = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(20);
    for (const grant of grants) {
      if (!grant || grant.status !== "active") continue;
      if (grant.userId && grant.userId === userId) {
        if (grant.role === "editor" || grant.role === "viewer") return grant.role;
      }
      if (userEmail && grant.email && normalizeCollaboratorEmail(grant.email) === userEmail) {
        if (grant.role === "editor" || grant.role === "viewer") return grant.role;
      }
    }
    return null;
  },
});

/**
 * Caller's own access for a claim. Used by the Studio to gate editing and to
 * decide whether presence heartbeats should run.
 */
export const getMyAccess = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args): Promise<{ accessRole: ClaimAccessRole; isOwner: boolean } | null> => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return null;
    return {
      accessRole: authorized.accessRole,
      isOwner: authorized.accessRole === "owner",
    };
  },
});

/**
 * List active and revoked collaborators for a claim. Any participant can read
 * the roster so presence avatars resolve to real teammates.
 */
export const listByClaim = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const authorized = await getClaimIfAuthorized(ctx, args.claimId);
    if (!authorized) return [];
    const grants = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(50);
    const owner = await ctx.db.get(authorized.claim.userId);
    const roster: Array<{
      _id?: string;
      userId?: string;
      email: string;
      role: ClaimAccessRole;
      status: string;
      displayName: string;
      image?: string;
      isOwner: boolean;
      isSelf: boolean;
    }> = [];
    if (owner) {
      const ownerEmail = owner.email || "";
      roster.push({
        email: ownerEmail,
        userId: String(owner._id),
        role: "owner",
        status: "active",
        displayName: owner.name || (ownerEmail ? ownerEmail.split("@")[0] : "Case owner"),
        image: owner.image,
        isOwner: true,
        isSelf: owner._id === authorized.userId,
      });
    }
    for (const grant of grants) {
      if (grant.status === "revoked") continue;
      let displayName = grant.email.split("@")[0] || "Teammate";
      let image: string | undefined;
      if (grant.userId) {
        const member = await ctx.db.get(grant.userId);
        if (member?.name) displayName = member.name;
        else if (member?.email) displayName = member.email.split("@")[0];
        image = member?.image;
      }
      roster.push({
        _id: grant._id,
        userId: grant.userId ? String(grant.userId) : undefined,
        email: grant.email,
        role: grant.role,
        status: grant.status,
        displayName,
        image,
        isOwner: false,
        isSelf:
          (grant.userId && grant.userId === authorized.userId) ||
          normalizeCollaboratorEmail(grant.email) ===
            normalizeCollaboratorEmail((await ctx.db.get(authorized.userId))?.email || "__none__"),
      });
    }
    return roster;
  },
});

/**
 * Owner invites a teammate by email. The grant is active immediately so the
 * recipient sees the case on next login; the Studio deep link (?claim=) is the
 * delivery mechanism and no email is sent by this mutation.
 */
export const invite = mutation({
  args: {
    claimId: v.id("claims"),
    email: v.string(),
    role: collaboratorRoleValidator,
  },
  handler: async (ctx, args) => {
    const { claim, userId: ownerId } = await requireClaimOwner(ctx, args.claimId);
    const email = assertValidCollaboratorEmail(args.email);
    const owner = await ctx.db.get(ownerId);
    if (owner?.email && normalizeCollaboratorEmail(owner.email) === email) {
      throw new Error("You cannot invite yourself to your own case");
    }
    const existing = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim_and_email", (q) => q.eq("claimId", args.claimId).eq("email", email))
      .first();
    if (existing && existing.status === "active") {
      throw new Error("This teammate already has access to the case");
    }
    const resolvedUserId = await resolveUserIdByEmail(ctx, email);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: "active",
        userId: resolvedUserId,
        invitedBy: ownerId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("claimCollaborators", {
        claimId: args.claimId,
        userId: resolvedUserId,
        email,
        role: args.role,
        status: "active",
        invitedBy: ownerId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId: ownerId,
      eventType: "collaborator_invited",
      actor: owner?.name || owner?.email || "Case owner",
      details: `Invited ${email} as ${args.role} to collaborate on claim ${claim.claimNumber}.`,
      timestamp: now,
    });
    return { success: true, email, role: args.role };
  },
});

/**
 * Owner changes a collaborator's role between editor and viewer.
 */
export const updateRole = mutation({
  args: {
    claimId: v.id("claims"),
    email: v.string(),
    role: collaboratorRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    const email = assertValidCollaboratorEmail(args.email);
    const grant = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim_and_email", (q) => q.eq("claimId", args.claimId).eq("email", email))
      .first();
    if (!grant || grant.status !== "active") {
      throw new Error("Collaborator grant not found for this case");
    }
    const ownerId = await requireAuthUser(ctx);
    const owner = await ctx.db.get(ownerId);
    await ctx.db.patch(grant._id, { role: args.role, updatedAt: Date.now() });
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId: ownerId,
      eventType: "collaborator_role_changed",
      actor: owner?.name || owner?.email || "Case owner",
      details: `Changed ${email} to ${args.role} access.`,
      timestamp: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Owner revokes a collaborator's access. The grant is tombstoned as revoked
 * (not deleted) so email-keyed re-entry is blocked until re-invited.
 */
export const remove = mutation({
  args: {
    claimId: v.id("claims"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requireClaimOwner(ctx, args.claimId);
    const email = assertValidCollaboratorEmail(args.email);
    const grant = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim_and_email", (q) => q.eq("claimId", args.claimId).eq("email", email))
      .first();
    if (!grant || grant.status !== "active") {
      throw new Error("Collaborator grant not found for this case");
    }
    const ownerId = await requireAuthUser(ctx);
    const owner = await ctx.db.get(ownerId);
    await ctx.db.patch(grant._id, { status: "revoked", updatedAt: Date.now() });
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId: ownerId,
      eventType: "collaborator_removed",
      actor: owner?.name || owner?.email || "Case owner",
      details: `Revoked ${email} access to the case.`,
      timestamp: Date.now(),
    });
    return { success: true };
  },
});

/**
 * A collaborator leaves a shared case voluntarily. Owners cannot leave their
 * own case; they must delete it instead.
 */
export const leave = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (!claim) throw new Error(`Claim ${args.claimId} not found`);
    if (claim.userId && claim.userId === userId) {
      throw new Error("Case owners cannot leave their own case");
    }
    const user = await ctx.db.get(userId);
    const userEmail = user?.email ? normalizeCollaboratorEmail(user.email) : null;
    const grants = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(20);
    const mine = grants.find(
      (g) =>
        g.status === "active" &&
        ((g.userId && g.userId === userId) ||
          (userEmail && normalizeCollaboratorEmail(g.email) === userEmail))
    );
    if (!mine) {
      throw new Error("You do not have access to this case");
    }
    await ctx.db.patch(mine._id, { status: "revoked", updatedAt: Date.now() });
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId,
      eventType: "collaborator_left",
      actor: user?.name || user?.email || "Collaborator",
      details: `${user?.email || "A collaborator"} left the shared case.`,
      timestamp: Date.now(),
    });
    return { success: true };
  },
});
