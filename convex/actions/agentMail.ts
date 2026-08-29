"use node";

import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { getSharedAgentMailboxes } from "../lib/agentMail";

/**
 * Binds a claim to the two real AgentMail identities provisioned for the app.
 * This action intentionally never creates inboxes: the free-tier limit makes
 * per-claim inbox provisioning unsuitable for production.
 */
export const provisionClaimInboxes = internalAction({
  args: {
    claimId: v.id("claims"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim: any = await ctx.runQuery((api as any).claims.getById, {
      claimId: args.claimId,
    });

    if (!claim) return null;

    if (!process.env.AGENTMAIL_API_KEY?.trim()) {
      await ctx.runMutation((internal as any).claims.setAgentMailInboxes, {
        claimId: args.claimId,
        status: "not_configured",
        error: "AgentMail is not configured. Set AGENTMAIL_API_KEY before sending email.",
      });
      return null;
    }

    try {
      const mailboxes = getSharedAgentMailboxes();

      await ctx.runMutation((internal as any).claims.setAgentMailInboxes, {
        claimId: args.claimId,
        claimInboxId: mailboxes.senderInboxId,
        claimInboxEmail: mailboxes.senderEmail,
        adjudicatorInboxId: mailboxes.adjudicatorInboxId,
        adjudicatorEmail: mailboxes.adjudicatorEmail,
        status: "shared",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation((internal as any).claims.setAgentMailInboxes, {
        claimId: args.claimId,
        status: "failed",
        error: message.slice(0, 1000),
      });
      throw error;
    }

    return null;
  },
});
