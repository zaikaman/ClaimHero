import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { requireClaimAccess } from "./lib/auth";
import { getAuthUserId } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

export const presence = new Presence(components.presence);

const activityValidator = v.union(
  v.literal("viewing"),
  v.literal("editing"),
  v.literal("synthesizing"),
  v.literal("reviewing"),
  v.literal("idle")
);

const presenceDataValidator = v.object({
  displayName: v.string(),
  initials: v.string(),
  role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
  tier: v.string(),
  activity: activityValidator,
  section: v.optional(v.string()),
  color: v.string(),
});

function parseClaimIdFromRoom(roomId: string): Id<"claims"> {
  const prefix = "appeal:";
  if (!roomId.startsWith(prefix) || roomId.length <= prefix.length) {
    throw new Error("Invalid presence room: expected appeal:{claimId}");
  }
  return roomId.slice(prefix.length) as Id<"claims">;
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function assertSafePresenceData(data: {
  displayName: string;
  initials: string;
  role: string;
  tier: string;
  activity: string;
  section?: string;
  color: string;
}) {
  if (!data.displayName || data.displayName.length > 64) {
    throw new Error("Invalid presence displayName");
  }
  if (!data.initials || data.initials.length > 4) {
    throw new Error("Invalid presence initials");
  }
  if (data.tier.length > 64) {
    throw new Error("Invalid presence tier");
  }
  if (data.section !== undefined && data.section.length > 64) {
    throw new Error("Invalid presence section");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(data.color)) {
    throw new Error("Invalid presence color");
  }
}

/**
 * Presence heartbeat scoped to a shared appeal room. The server derives
 * identity from Convex Auth and refuses spoofed userIds. Room format is
 * appeal:{claimId} and only owners plus active collaborators may join.
 * Presence payloads carry display metadata only, never PHI or brief content.
 */
export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Unauthorized: Authentication required");
    }
    if (args.userId !== authUserId) {
      throw new Error("Forbidden: Presence identity must match the authenticated user");
    }
    if (!Number.isFinite(args.interval) || args.interval < 2000 || args.interval > 60000) {
      throw new Error("Invalid presence interval");
    }
    const claimId = parseClaimIdFromRoom(args.roomId);
    await requireClaimAccess(ctx, claimId);
    return await presence.heartbeat(ctx, args.roomId, authUserId, args.sessionId, args.interval);
  },
});

/**
 * List live presence for an appeal room. Room tokens are unguessable opaque
 * handles issued only by the access-checked heartbeat below, matching the
 * upstream component contract so the stock usePresence hook works unchanged.
 * Access is enforced at heartbeat time and by UI gating on getMyAccess.
 */
export const list = query({
  args: {
    roomToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await presence.list(ctx, args.roomToken);
  },
});

/**
 * Update the caller's ephemeral Studio state (activity, tier, section).
 * Viewers may publish presence; this carries no document content.
 * Identity fields are stamped server-side from the account record so a
 * caller cannot impersonate a teammate in the facepile.
 */
export const updateState = mutation({
  args: {
    roomId: v.string(),
    data: presenceDataValidator,
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Unauthorized: Authentication required");
    }
    assertSafePresenceData(args.data);
    const claimId = parseClaimIdFromRoom(args.roomId);
    const access = await requireClaimAccess(ctx, claimId);
    if (args.data.role !== access.accessRole) {
      throw new Error("Forbidden: Presence role must match case access");
    }
    const account = await ctx.db.get(authUserId);
    const displayName =
      account?.name || account?.email?.split("@")[0] || args.data.displayName;
    return await presence.updateRoomUser(ctx, args.roomId, authUserId, {
      ...args.data,
      displayName: displayName.slice(0, 64),
      initials: initialsForName(displayName).slice(0, 4),
    });
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    // Intentionally unauthenticated: called via sendBeacon on tab close.
    return await presence.disconnect(ctx, args.sessionToken);
  },
});
