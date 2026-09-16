import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { createThread, listUIMessages, syncStreams, vStreamArgs } from "@convex-dev/agent";
import { components } from "./_generated/api";
import { getAuthUserId, requireClaimAccess, requireClaimOwner } from "./lib/auth";

/**
 * Long-form drafting surfaces that stream through the `@convex-dev/agent`
 * component. Each claim and surface keeps exactly one live drafting thread:
 * starting a new generation retires the previous thread so the stream stays
 * clean and the component's message tables stay bounded.
 */
export const draftKindValidator = v.union(
  v.literal("appeal_brief"),
  v.literal("p2p_script")
);

export type DraftKind = "appeal_brief" | "p2p_script";

const DRAFT_THREAD_TITLES: Record<DraftKind, string> = {
  appeal_brief: "Appeal brief drafting",
  p2p_script: "P2P tele-script drafting",
};

const EMPTY_STREAM_PAGE = {
  page: [],
  isDone: true,
  continueCursor: "",
  streams: undefined,
};

type ClaimReadCtx = Parameters<typeof requireClaimAccess>[0];
type ClaimId = Parameters<typeof requireClaimAccess>[1];

async function findDraftThread(ctx: ClaimReadCtx, claimId: ClaimId, kind: DraftKind) {
  return await ctx.db
    .query("draftThreads")
    .withIndex("by_claim_and_kind", (q) => q.eq("claimId", claimId).eq("kind", kind))
    .first();
}

/**
 * The drafting thread currently bound to a claim and surface, if any. Lets the
 * Studio re-attach to an in-flight stream after a reload.
 */
export const getDraftThread = query({
  args: {
    claimId: v.id("claims"),
    kind: draftKindValidator,
  },
  handler: async (ctx, args) => {
    // Any case participant may read this binding; only the owner can create the
    // thread (and only the thread owner receives its deltas).
    await requireClaimAccess(ctx, args.claimId);
    const existing = await findDraftThread(ctx, args.claimId, args.kind);
    return existing ? { threadId: existing.threadId } : null;
  },
});

/**
 * Open a fresh drafting thread for a claim the caller owns, so the client can
 * subscribe to live deltas before generation starts and pass the id to the
 * generation action.
 */
export const startDraftThread = mutation({
  args: {
    claimId: v.id("claims"),
    kind: draftKindValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireClaimOwner(ctx, args.claimId);

    const previous = await findDraftThread(ctx, args.claimId, args.kind);
    if (previous) {
      await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
        threadId: previous.threadId,
      });
      await ctx.db.delete(previous._id);
    }

    const threadId = await createThread(ctx, components.agent, {
      userId,
      title: DRAFT_THREAD_TITLES[args.kind],
    });

    await ctx.db.insert("draftThreads", {
      userId,
      claimId: args.claimId,
      kind: args.kind,
      threadId,
      createdAt: Date.now(),
    });

    return { threadId };
  },
});

/**
 * Reactive token stream for a drafting thread, restricted to the thread owner.
 */
export const getDraftStream = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return EMPTY_STREAM_PAGE;

    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (!thread || thread.userId !== userId) return EMPTY_STREAM_PAGE;

    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});
