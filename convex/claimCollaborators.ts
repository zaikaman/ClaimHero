import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
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
import { rateLimiter } from "./lib/rateLimiter";

export const collaboratorRoleValidator = v.union(v.literal("editor"), v.literal("viewer"));
export const collaboratorStatusValidator = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("declined"),
  v.literal("revoked")
);

/** Recipient-side spam cap: bounds how many unanswered invites one inbox can hold. */
export const MAX_PENDING_INVITES_PER_EMAIL = 50;

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
 * Find the caller's grant for a claim, regardless of status. Email matching
 * covers invites sent before the recipient signed up. When both match, the
 * userId-linked grant wins so a duplicate-email account cannot claim an
 * invite already linked to someone else. Returns null when never invited.
 */
async function findMyGrant(
  ctx: QueryCtx | MutationCtx,
  claimId: Id<"claims">,
  userId: Id<"users">
) {
  const user = typeof ctx.db.get === "function" ? await ctx.db.get(userId) : null;
  const userEmail = user?.email ? normalizeCollaboratorEmail(user.email) : null;
  const grants = await ctx.db
    .query("claimCollaborators")
    .withIndex("by_claim", (q) => q.eq("claimId", claimId))
    .take(20);
  const byUserId = grants.find((grant) => grant.userId && grant.userId === userId);
  if (byUserId) return byUserId;
  if (!userEmail) return null;
  return (
    grants.find((grant) => grant.email && normalizeCollaboratorEmail(grant.email) === userEmail) ??
    null
  );
}

/**
 * Internal role lookup for ActionCtx guards. Actions cannot touch ctx.db,
 * so they delegate to this query. Only active grants count: pending invites
 * confer no access. Returns editor/viewer/owner or null.
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
 * decide whether presence heartbeats should run. Pending invitees get null:
 * no access until they accept.
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
 * The caller's invite state for one claim, backing the deep-link accept gate.
 * Owners report active; strangers report null.
 */
export const getInviteStatus = query({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (
    ctx,
    args
  ): Promise<"pending" | "active" | "declined" | "revoked" | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return null;
    if (claim.userId && claim.userId === userId) return "active";
    const grant = await findMyGrant(ctx, args.claimId, userId);
    if (!grant) return null;
    if (
      grant.status === "pending" ||
      grant.status === "active" ||
      grant.status === "declined" ||
      grant.status === "revoked"
    ) {
      return grant.status;
    }
    return null;
  },
});

/**
 * Pending case invitations for the caller. Returns only the minimum needed
 * to decide (claim reference, offered role, inviter name): never patient
 * data, amounts, codes, or brief content.
 */
export const listMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    const userEmail = user?.email ? normalizeCollaboratorEmail(user.email) : null;

    const byUser = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(50);
    let byEmail: typeof byUser = [];
    if (userEmail) {
      try {
        byEmail = await ctx.db
          .query("claimCollaborators")
          .withIndex("by_email_and_status", (q) => q.eq("email", userEmail).eq("status", "pending"))
          .take(50);
      } catch {
        byEmail = [];
      }
    }

    const seen = new Set<string>();
    const pending: typeof byUser = [];
    for (const grant of [...byUser, ...byEmail]) {
      if (!grant || grant.status !== "pending") continue;
      const key = String(grant._id);
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push(grant);
    }

    const invites: Array<{
      claimId: Id<"claims">;
      claimNumber: string;
      role: ClaimAccessRole;
      invitedBy: string;
      invitedAt: number;
    }> = [];
    for (const grant of pending.slice(0, 20)) {
      const claim = await ctx.db.get(grant.claimId);
      if (!claim) continue;
      const inviter = await ctx.db.get(grant.invitedBy);
      invites.push({
        claimId: grant.claimId,
        claimNumber: claim.claimNumber,
        role: grant.role,
        invitedBy: inviter?.name || inviter?.email || "Case owner",
        invitedAt: grant.createdAt,
      });
    }
    return invites.sort((a, b) => b.invitedAt - a.invitedAt);
  },
});

/**
 * List collaborators for a claim. Owners see every non-revoked grant
 * (active, pending, declined) to manage the roster; other participants see
 * active members only so pending invite lists stay private.
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
    const showAll = authorized.accessRole === "owner";
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
    const callerEmail = normalizeCollaboratorEmail(
      (await ctx.db.get(authorized.userId))?.email || "__none__"
    );
    for (const grant of grants) {
      if (grant.status === "revoked") continue;
      if (!showAll && grant.status !== "active") continue;
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
          normalizeCollaboratorEmail(grant.email) === callerEmail,
      });
    }
    return roster;
  },
});

/**
 * Owner invites a teammate by email. Invites are always pending first: the
 * recipient gains nothing (no listing, no reads, no presence) until they
 * accept. Outgoing invites are rate-limited per owner and each inbox holds a
 * bounded number of pending invites, so one account cannot spray the network.
 * The Studio deep link (?claim=) is the delivery mechanism; no email is sent.
 */
export const invite = mutation({
  args: {
    claimId: v.id("claims"),
    email: v.string(),
    role: collaboratorRoleValidator,
  },
  handler: async (ctx, args) => {
    const { claim, userId: ownerId } = await requireClaimOwner(ctx, args.claimId);

    try {
      const limitStatus = await rateLimiter.limit(ctx, "collabInvite", { key: ownerId });
      if (!limitStatus.ok) {
        throw new ConvexError({
          code: "RATE_LIMITED",
          status: 429,
          message: `Invite rate limit exceeded. Please retry in ${Math.ceil((limitStatus.retryAfter || 1000) / 1000)}s.`,
        });
      }
    } catch (rateErr) {
      if (rateErr instanceof ConvexError) throw rateErr;
      if (process.env.NODE_ENV !== "test") {
        console.warn("[RateLimiter] Unexpected error checking collabInvite rate limit:", rateErr);
      }
    }

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
    const now = Date.now();
    const actor = owner?.name || owner?.email || "Case owner";
    if (existing && existing.status === "pending") {
      await ctx.db.patch(existing._id, {
        role: args.role,
        invitedBy: ownerId,
        updatedAt: now,
      });
      await ctx.db.insert("appealAuditLogs", {
        claimId: args.claimId,
        userId: ownerId,
        eventType: "collaborator_invited",
        actor,
        details: `Updated the pending invite for ${email} to ${args.role} on claim ${claim.claimNumber}.`,
        timestamp: now,
      });
      return { success: true, email, role: args.role, status: "pending" as const, updated: true };
    }

    const pendingForEmail = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_email_and_status", (q) => q.eq("email", email).eq("status", "pending"))
      .take(MAX_PENDING_INVITES_PER_EMAIL + 1);
    if (pendingForEmail.length >= MAX_PENDING_INVITES_PER_EMAIL) {
      throw new Error("This inbox already has the maximum number of pending case invites");
    }

    const resolvedUserId = await resolveUserIdByEmail(ctx, email);
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: "pending",
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
        status: "pending",
        invitedBy: ownerId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId: ownerId,
      eventType: "collaborator_invited",
      actor,
      details: `Invited ${email} as ${args.role} to collaborate on claim ${claim.claimNumber} (pending acceptance).`,
      timestamp: now,
    });
    return { success: true, email, role: args.role, status: "pending" as const };
  },
});

/**
 * Invited teammate accepts a pending invite, activating access and resolving
 * their userId onto the grant for roster display.
 */
export const accept = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (!claim) throw new Error(`Claim ${args.claimId} not found`);
    if (claim.userId && claim.userId === userId) {
      throw new Error("You already own this case");
    }
    const grant = await findMyGrant(ctx, args.claimId, userId);
    if (!grant || grant.status !== "pending") {
      throw new Error("No pending invite found for this case");
    }
    if (grant.userId && grant.userId !== userId) {
      throw new Error("This invite is linked to a different account");
    }
    const user = await ctx.db.get(userId);
    await ctx.db.patch(grant._id, { status: "active", userId, updatedAt: Date.now() });
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId,
      eventType: "collaborator_accepted",
      actor: user?.name || user?.email || "Collaborator",
      details: `${user?.email || "A collaborator"} accepted the case invite as ${grant.role}.`,
      timestamp: Date.now(),
    });
    return { success: true, role: grant.role };
  },
});

/**
 * Invited teammate declines a pending invite. The tombstone lets the owner
 * see the outcome and re-invite deliberately; it grants nothing.
 */
export const decline = mutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (!claim) throw new Error(`Claim ${args.claimId} not found`);
    const grant = await findMyGrant(ctx, args.claimId, userId);
    if (!grant || grant.status !== "pending") {
      throw new Error("No pending invite found for this case");
    }
    const user = await ctx.db.get(userId);
    await ctx.db.patch(grant._id, { status: "declined", updatedAt: Date.now() });
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId,
      eventType: "collaborator_declined",
      actor: user?.name || user?.email || "Collaborator",
      details: `${user?.email || "A collaborator"} declined the case invite.`,
      timestamp: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Owner cancels a pending invite before it is accepted. Accepted teammates
 * must be removed via remove instead.
 */
export const cancelInvite = mutation({
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
    if (!grant || grant.status !== "pending") {
      throw new Error("No pending invite found for this teammate (decided invites must be re-invited or removed instead)");
    }
    const ownerId = await requireAuthUser(ctx);
    const owner = await ctx.db.get(ownerId);
    await ctx.db.patch(grant._id, { status: "revoked", updatedAt: Date.now() });
    await ctx.db.insert("appealAuditLogs", {
      claimId: args.claimId,
      userId: ownerId,
      eventType: "collaborator_invite_canceled",
      actor: owner?.name || owner?.email || "Case owner",
      details: `Canceled the pending invite for ${email}.`,
      timestamp: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Owner changes a collaborator's role between editor and viewer. Applies to
 * active members and pending invites alike.
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
    if (!grant || (grant.status !== "active" && grant.status !== "pending")) {
      throw new Error("Only active members or pending invites can change roles");
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
 * Pending invites are canceled via cancelInvite instead.
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
    if (!grant || (grant.status !== "active" && grant.status !== "declined")) {
      throw new Error("No active member found for this case (pending invites must be canceled instead)");
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
    const mine = await findMyGrant(ctx, args.claimId, userId);
    if (!mine || mine.status !== "active") {
      throw new Error("You do not have access to this case");
    }
    const user = await ctx.db.get(userId);
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

/**
 * Bounded purge of one claim's collaborator grants for the deleteCase
 * cascade, so deleted cases leave no orphaned invite rows behind.
 */
export const purgeClaimInternal = internalMutation({
  args: {
    claimId: v.id("claims"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim", (q) => q.eq("claimId", args.claimId))
      .take(100);
    for (const grant of batch) {
      await ctx.db.delete(grant._id);
    }
    if (batch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.claimCollaborators.purgeClaimInternal, {
        claimId: args.claimId,
      });
    }
  },
});
