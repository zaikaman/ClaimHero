import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { Id, Doc, TableNames } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import * as serverAuth from "@convex-dev/auth/server";

interface LegacyAuthModule {
  getAuthUserId?: (ctx: QueryCtx | MutationCtx | ActionCtx) => Promise<Id<"users"> | null>;
}

/**
 * Returns the currently authenticated user ID from context or null if unauthenticated.
 * Works natively with Convex Auth v2, and honors test mocks if present.
 */
export async function getAuthUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"users"> | null> {
  const legacyAuth = serverAuth as unknown as LegacyAuthModule;
  if (typeof legacyAuth.getAuthUserId === "function") {
    return await legacyAuth.getAuthUserId(ctx);
  }
  if (!ctx?.auth?.getUserIdentity) {
    return null;
  }
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  if ("db" in ctx && ctx.db?.normalizeId) {
    return ctx.db.normalizeId("users", identity.subject);
  }
  return (identity.subject as Id<"users">) || null;
}

/**
 * Require an authenticated user identity.
 * Throws an error if the user is not authenticated.
 */
export async function requireAuthUser(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Unauthorized: Authentication required");
  }
  return userId;
}

/**
 * Canonical requireIdentity helper for convex-authz compatibility.
 */
export async function requireIdentity(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"users">> {
  return await requireAuthUser(ctx);
}

/**
 * Require that the caller is authenticated and owns the specified claim.
 * If the claim does not exist, throws "Claim not found".
 * If the claim belongs to another user, throws "Forbidden: Access denied".
 */
export async function requireClaimOwner(
  ctx: QueryCtx | MutationCtx,
  claimId: Id<"claims">
): Promise<{ claim: Doc<"claims">; userId: Id<"users"> }> {
  const userId = await requireAuthUser(ctx);
  const claim = await ctx.db.get(claimId);
  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }
  if (!claim.userId || claim.userId !== userId) {
    throw new Error("Forbidden: You do not have permission to access this claim");
  }
  return { claim, userId };
}

export type ClaimWithDetails = Doc<"claims"> & {
  patient?: Doc<"patients">;
  evidenceCount?: number;
  latestAppeal?: Doc<"appeals"> | null;
};

/**
 * Require that the caller is authenticated and owns the specified claim in an ActionCtx.
 * If the claim does not exist, throws "Claim not found".
 * If the claim belongs to another user, throws "Forbidden: Access denied".
 */
export async function requireClaimOwnerAction(
  ctx: ActionCtx,
  claimId: Id<"claims">
): Promise<{ claim: ClaimWithDetails; userId: Id<"users"> }> {
  const userId = await requireAuthUser(ctx);
  const claim = await ctx.runQuery(internal.claims.getByIdInternal, { claimId });
  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }
  if (!claim.userId || claim.userId !== userId) {
    throw new Error("Forbidden: You do not have permission to access this claim");
  }
  return { claim: claim as ClaimWithDetails, userId };
}

/**
 * For queries that should return null/empty when unauthenticated or unowned instead of throwing.
 */
export async function getClaimIfAuthorized(
  ctx: QueryCtx | MutationCtx,
  claimId: Id<"claims">
): Promise<{ claim: Doc<"claims">; userId: Id<"users"> } | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const claim = await ctx.db.get(claimId);
  if (!claim) return null;
  if (!claim.userId || claim.userId !== userId) return null;
  return { claim, userId };
}

/**
 * Generic requireOwner helper for convex-authz compatibility.
 */
export async function requireOwner<T extends { _id: Id<TableNames>; userId?: Id<"users"> }>(
  ctx: QueryCtx | MutationCtx,
  doc: T | null
): Promise<{ doc: T; userId: Id<"users"> }> {
  if (!doc) {
    throw new Error("Document not found");
  }
  const userId = await requireAuthUser(ctx);
  if (!doc.userId || doc.userId !== userId) {
    throw new Error("Forbidden: You do not have permission to access this resource");
  }
  return { doc, userId };
}

/**
 * Require ownership of a chatbot session.
 */
export async function requireChatbotSessionOwner(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"chatbotSessions">
): Promise<{ session: Doc<"chatbotSessions">; userId: Id<"users"> }> {
  const userId = await requireAuthUser(ctx);
  const session = await ctx.db.get(sessionId);
  if (!session) {
    throw new Error("Chatbot session not found");
  }
  if (!session.userId || session.userId !== userId) {
    throw new Error("Forbidden: You do not have permission to access this chat session");
  }
  return { session, userId };
}

/**
 * Get chatbot session if the authenticated user is the owner.
 */
export async function getChatbotSessionIfAuthorized(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"chatbotSessions">
): Promise<Doc<"chatbotSessions"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const session = await ctx.db.get(sessionId);
  if (!session) return null;
  if (!session.userId || session.userId !== userId) return null;
  return session;
}
