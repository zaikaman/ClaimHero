import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id, Doc } from "../_generated/dataModel";

/**
 * Require an authenticated user identity.
 * Throws an error if the user is not authenticated.
 */
export async function requireAuthUser(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx as any);
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

/**
 * For queries that should return null/empty when unauthenticated or unowned instead of throwing.
 */
export async function getClaimIfAuthorized(
  ctx: QueryCtx | MutationCtx,
  claimId: Id<"claims">
): Promise<{ claim: Doc<"claims">; userId: Id<"users"> } | null> {
  const userId = await getAuthUserId(ctx as any);
  if (!userId) return null;
  const claim = await ctx.db.get(claimId);
  if (!claim) return null;
  if (!claim.userId || claim.userId !== userId) return null;
  return { claim, userId };
}

/**
 * Generic requireOwner helper for convex-authz compatibility.
 */
export async function requireOwner<T extends { _id: Id<any>; userId?: Id<"users"> }>(
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
  const userId = await getAuthUserId(ctx as any);
  if (!userId) return null;
  const session = await ctx.db.get(sessionId);
  if (!session) return null;
  if (!session.userId || session.userId !== userId) return null;
  return session;
}
