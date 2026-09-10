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

export type ClaimAccessRole = "owner" | "editor" | "viewer";

export interface ClaimAccess {
  claim: Doc<"claims">;
  userId: Id<"users">;
  accessRole: ClaimAccessRole;
}

/**
 * Normalize a collaborator email to its canonical lookup form.
 */
export function normalizeCollaboratorEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validate a collaborator email address with a conservative format check.
 */
export function assertValidCollaboratorEmail(email: string): string {
  const normalized = normalizeCollaboratorEmail(email);
  if (!normalized || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Invalid email: must be a valid email address");
  }
  return normalized;
}

/**
 * Resolve the caller's access role for a claim.
 * Owner is resolved strictly via claim.userId. Collaborator grants are read
 * defensively so unit mocks without the claimCollaborators table fall back
 * to owner-only semantics instead of throwing.
 */
export async function getClaimAccessRole(
  ctx: QueryCtx | MutationCtx,
  claim: Doc<"claims">,
  userId: Id<"users">
): Promise<ClaimAccessRole | null> {
  if (claim.userId && claim.userId === userId) {
    return "owner";
  }
  try {
    if (typeof ctx.db.query !== "function") return null;
    const user = typeof ctx.db.get === "function" ? await ctx.db.get(userId) : null;
    const userEmail = user?.email ? normalizeCollaboratorEmail(user.email) : null;
    const grants = await ctx.db
      .query("claimCollaborators")
      .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
      .take(20);
    if (!Array.isArray(grants)) return null;
    for (const grant of grants) {
      if (!grant || grant.status !== "active") continue;
      if (grant.userId && grant.userId === userId) {
        if (grant.role === "editor" || grant.role === "viewer") return grant.role;
      }
      if (userEmail && grant.email && normalizeCollaboratorEmail(grant.email) === userEmail) {
        if (grant.role === "editor" || grant.role === "viewer") return grant.role;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export type ClaimWithDetails = Doc<"claims"> & {
  patient?: Doc<"patients">;
  evidenceCount?: number;
  latestAppeal?: Doc<"appeals"> | null;
};

/**
 * Require that the caller is authenticated and has at least editor access to
 * the specified claim in an ActionCtx. Owners and active editor collaborators
 * are permitted. Viewers and non-members are rejected to protect LLM, crawl,
 * and email spend. Falls back to strict owner checks when the collaboration
 * lookup is unavailable (unit mocks) or returns a non-role payload.
 */
export async function requireClaimOwnerAction(
  ctx: ActionCtx,
  claimId: Id<"claims">
): Promise<{ claim: ClaimWithDetails; userId: Id<"users">; accessRole: ClaimAccessRole }> {
  const userId = await requireAuthUser(ctx);
  const claim = await ctx.runQuery(internal.claims.getByIdInternal, { claimId });
  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }
  if (claim.userId && claim.userId === userId) {
    return { claim: claim as ClaimWithDetails, userId, accessRole: "owner" };
  }
  if (!claim.userId) {
    throw new Error("Forbidden: You do not have permission to access this claim");
  }
  try {
    const role = await ctx.runQuery(internal.claimCollaborators.getRoleInternal, { claimId });
    if (role === "editor") {
      return { claim: claim as ClaimWithDetails, userId, accessRole: "editor" };
    }
  } catch {
    // Fall through to Forbidden below when collaboration lookup is unavailable.
  }
  throw new Error("Forbidden: You do not have permission to access this claim");
}

/**
 * Require any active claim access (owner, editor, or viewer) in an ActionCtx.
 * Used for read-only operations where viewers are legitimate participants.
 */
export async function requireClaimAccessAction(
  ctx: ActionCtx,
  claimId: Id<"claims">
): Promise<{ claim: ClaimWithDetails; userId: Id<"users">; accessRole: ClaimAccessRole }> {
  const userId = await requireAuthUser(ctx);
  const claim = await ctx.runQuery(internal.claims.getByIdInternal, { claimId });
  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }
  if (claim.userId && claim.userId === userId) {
    return { claim: claim as ClaimWithDetails, userId, accessRole: "owner" };
  }
  if (!claim.userId) {
    throw new Error("Forbidden: You do not have permission to access this claim");
  }
  try {
    const role = await ctx.runQuery(internal.claimCollaborators.getRoleInternal, { claimId });
    if (role === "editor" || role === "viewer") {
      return { claim: claim as ClaimWithDetails, userId, accessRole: role };
    }
  } catch {
    // Fall through to Forbidden below.
  }
  throw new Error("Forbidden: You do not have permission to access this claim");
}

/**
 * For queries that should return null/empty when unauthenticated or unauthorized
 * instead of throwing. Owners and active collaborators (editor/viewer) are
 * authorized. Returns the resolved accessRole alongside claim and userId.
 */
export async function getClaimIfAuthorized(
  ctx: QueryCtx | MutationCtx,
  claimId: Id<"claims">
): Promise<ClaimAccess | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const claim = await ctx.db.get(claimId);
  if (!claim) return null;
  if (claim.userId && claim.userId === userId) {
    return { claim, userId, accessRole: "owner" };
  }
  if (!claim.userId) return null;
  const role = await getClaimAccessRole(ctx, claim, userId);
  if (!role || role === "owner") return null;
  return { claim, userId, accessRole: role };
}

/**
 * Require any active claim access (owner, editor, or viewer). Use for reads
 * and presence heartbeats where viewers are legitimate participants.
 */
export async function requireClaimAccess(
  ctx: QueryCtx | MutationCtx,
  claimId: Id<"claims">
): Promise<ClaimAccess> {
  const userId = await requireAuthUser(ctx);
  const claim = await ctx.db.get(claimId);
  if (!claim) {
    throw new Error(`Claim ${claimId} not found`);
  }
  if (claim.userId && claim.userId === userId) {
    return { claim, userId, accessRole: "owner" };
  }
  if (!claim.userId) {
    throw new Error("Forbidden: You do not have permission to access this claim");
  }
  const role = await getClaimAccessRole(ctx, claim, userId);
  if (!role || role === "owner") {
    throw new Error("Forbidden: You do not have permission to access this claim");
  }
  return { claim, userId, accessRole: role };
}

/**
 * Require editor-level claim access (owner or active editor collaborator).
 * Use for all collaborative writes: appeal drafts, synthesis inputs, evidence
 * curation, status updates, and outbound messaging. Viewers are read-only.
 */
export async function requireClaimEditor(
  ctx: QueryCtx | MutationCtx,
  claimId: Id<"claims">
): Promise<ClaimAccess> {
  const access = await requireClaimAccess(ctx, claimId);
  if (access.accessRole !== "owner" && access.accessRole !== "editor") {
    throw new Error("Forbidden: Viewer collaborators have read-only access to this case");
  }
  return access;
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
