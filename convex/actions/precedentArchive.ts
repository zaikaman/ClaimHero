"use node";

import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createEmbedding } from "../lib/openai";
import { PRECEDENT_CORPUS } from "../lib/precedentCorpus";
import {
  buildClaimQueryText,
  buildPrecedentEmbedText,
  rankPrecedentHits,
  weightedTokensForCodes,
} from "../lib/embeddings";
import { precedentMatchValidator } from "../lib/precedentValidators";
import { requireClaimOwnerAction } from "../lib/auth";

const matchListValidator = v.array(precedentMatchValidator);

function primaryOrUnspecified(values: string[]): string {
  const first = values.find((value) => value && value.trim().length > 0);
  return first ? first.trim() : "UNSPECIFIED";
}

async function seedArchiveBody(ctx: ActionCtx): Promise<{ upserted: number }> {
  let upserted = 0;

  for (const entry of PRECEDENT_CORPUS) {
    const existing: Id<"precedents"> | null = await ctx.runQuery(
      internal.precedents.getByCorpusKey,
      { corpusKey: entry.corpusKey }
    );
    if (existing) {
      continue;
    }

    const embedText = buildPrecedentEmbedText(entry);
    const extraTokens = weightedTokensForCodes(entry.icd10Codes, entry.cptCodes, entry.carcCodes);
    extraTokens.push(`kind:${entry.sourceKind}`);
    const embedding = await createEmbedding(embedText, extraTokens);

    await ctx.runMutation(internal.precedents.insertPrecedent, {
      sourceKind: entry.sourceKind,
      title: entry.title,
      citation: entry.citation,
      jurisdiction: entry.jurisdiction,
      sourceUrl: entry.sourceUrl,
      icd10Codes: entry.icd10Codes,
      cptCodes: entry.cptCodes,
      carcCodes: entry.carcCodes,
      primaryIcd10: primaryOrUnspecified(entry.icd10Codes),
      primaryCpt: primaryOrUnspecified(entry.cptCodes),
      carcCode: primaryOrUnspecified(entry.carcCodes),
      winningArgument: entry.winningArgument,
      statutoryLanguage: entry.statutoryLanguage,
      outcome: entry.outcome,
      embedding,
      corpusKey: entry.corpusKey,
    });
    upserted += 1;
  }

  return { upserted };
}

/**
 * Embed and upsert the public legal corpus. Idempotent via corpusKey.
 */
export const seedArchive = internalAction({
  args: {},
  returns: v.object({
    upserted: v.number(),
  }),
  handler: async (ctx): Promise<{ upserted: number }> => {
    return await seedArchiveBody(ctx);
  },
});

/**
 * Re-embed every existing archive row after changing embedding providers.
 * This is intentionally separate from retrieval and should be run once per
 * vector-model migration.
 */
export const reindexArchive = internalAction({
  args: {},
  returns: v.object({
    reindexed: v.number(),
    total: v.number(),
  }),
  handler: async (ctx): Promise<{ reindexed: number; total: number }> => {
    const docs = await ctx.runQuery(
      internal.precedents.listForReindex,
      {}
    );
    if (docs.length > 1000) {
      throw new Error("Precedent archive exceeds the one-shot reindex limit of 1000 rows");
    }

    for (const doc of docs) {
      const extraTokens = weightedTokensForCodes(
        doc.icd10Codes,
        doc.cptCodes,
        doc.carcCodes
      );
      extraTokens.push(`kind:${doc.sourceKind}`);
      const embedding = await createEmbedding(
        buildPrecedentEmbedText(doc),
        extraTokens
      );
      await ctx.runMutation(internal.precedents.updateEmbedding, {
        precedentId: doc._id,
        embedding,
      });
    }

    return { reindexed: docs.length, total: docs.length };
  },
});

/**
 * Real-time semantic retrieval: embed the claim, run ctx.vectorSearch,
 * hydrate, re-rank by ICD-10 / CPT / CARC overlap, return top 3, and
 * attach proven statutory language onto the claim as legal_precedent evidence.
 */
export const retrieveTopPrecedents = action({
  args: {
    claimId: v.id("claims"),
  },
  returns: matchListValidator,
  handler: async (ctx, args): Promise<Array<{
    _id: Id<"precedents">;
    sourceKind: string;
    title: string;
    citation: string;
    jurisdiction: string;
    sourceUrl?: string;
    icd10Codes: string[];
    cptCodes: string[];
    carcCodes: string[];
    winningArgument: string;
    statutoryLanguage: string;
    outcome: string;
    vectorScore: number;
    combinedScore: number;
    codeOverlap: number;
  }>> => {
    const { claim } = await requireClaimOwnerAction(ctx, args.claimId);

    const icd10Codes: string[] = claim.icd10Codes || [];
    const cptCodes: string[] = claim.cptCodes || [];
    const denialReasonCode: string = claim.denialReasonCode || "CO-50";
    const denialReasonDescription: string = claim.denialReasonDescription || "";

    const queryText = buildClaimQueryText({
      icd10Codes,
      cptCodes,
      denialReasonCode,
      denialReasonDescription,
    });
    const extraTokens = weightedTokensForCodes(icd10Codes, cptCodes, [denialReasonCode]);
    const embedding = await createEmbedding(queryText, extraTokens);

    const hits = await ctx.vectorSearch("precedents", "by_embedding", {
      vector: embedding,
      limit: 16,
    });

    const ids = hits.map((hit) => hit._id);
    const docs = await ctx.runQuery(internal.precedents.hydrateByIds, { ids });
    const docsById = new Map(docs.map((doc) => [doc._id, doc]));

    const rankable = hits
      .map((hit) => {
        const doc = docsById.get(hit._id);
        if (!doc) return null;
        return {
          _id: doc._id,
          vectorScore: hit._score,
          icd10Codes: doc.icd10Codes,
          cptCodes: doc.cptCodes,
          carcCodes: doc.carcCodes,
          sourceKind: doc.sourceKind,
          title: doc.title,
          citation: doc.citation,
          jurisdiction: doc.jurisdiction,
          sourceUrl: doc.sourceUrl,
          winningArgument: doc.winningArgument,
          statutoryLanguage: doc.statutoryLanguage,
          outcome: doc.outcome,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const top = rankPrecedentHits(
      rankable,
      { icd10Codes, cptCodes, denialReasonCode, denialReasonDescription },
      3
    );

    const matches = top.map((row) => ({
      _id: row._id,
      sourceKind: row.sourceKind,
      title: row.title,
      citation: row.citation,
      jurisdiction: row.jurisdiction,
      sourceUrl: row.sourceUrl,
      icd10Codes: row.icd10Codes,
      cptCodes: row.cptCodes,
      carcCodes: row.carcCodes,
      winningArgument: row.winningArgument,
      statutoryLanguage: row.statutoryLanguage,
      outcome: row.outcome,
      vectorScore: row.vectorScore,
      combinedScore: row.combinedScore,
      codeOverlap: row.codeOverlap,
    }));

    if (matches.length > 0) {
      await ctx.runMutation(internal.precedents.attachMatchesToClaim, {
        claimId: args.claimId,
        matches,
      });
    }

    return matches;
  },
});

/**
 * Index a de-identified winning appeal brief into the vector archive.
 */
export const indexWonAppeal = internalAction({
  args: {
    claimId: v.id("claims"),
  },
  returns: v.union(v.id("precedents"), v.null()),
  handler: async (ctx, args): Promise<Id<"precedents"> | null> => {
    const already: Id<"precedents"> | null = await ctx.runQuery(
      internal.precedents.getBySourceClaim,
      { sourceClaimId: args.claimId }
    );
    if (already) {
      return already;
    }

    const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    });
    if (!claim) {
      return null;
    }

    const appeal = await ctx.runQuery(internal.appeals.getLatestByClaimInternal, {
      claimId: args.claimId,
    });
    if (!appeal?.fullAppealMarkdown) {
      return null;
    }

    const icd10Codes: string[] = claim.icd10Codes || [];
    const cptCodes: string[] = claim.cptCodes || [];
    const carcCodes: string[] = claim.denialReasonCode ? [claim.denialReasonCode] : [];
    const title = `Winning brief — CPT ${(cptCodes[0] || "procedure")} / ${claim.denialReasonCode || "CARC"} overturn`;
    const citation = `ClaimHero overturned appeal ${claim.claimNumber}`;
    const winningArgument = (appeal.medicalNecessityArguments || appeal.fullAppealMarkdown)
      .replace(/\*\*/g, "")
      .slice(0, 2400);
    const statutoryLanguage = (appeal.legalCitations || "")
      .replace(/\*\*/g, "")
      .slice(0, 1800);

    const entry = {
      title,
      citation,
      winningArgument,
      statutoryLanguage:
        statutoryLanguage ||
        "This brief prevailed on internal appeal. Proven medical-necessity and ERISA 29 CFR § 2560.503-1 arguments are retained for future semantic retrieval.",
      outcome: `Overturned. Recovered $${Number(claim.deniedAmount || 0).toLocaleString()}.`,
      icd10Codes,
      cptCodes,
      carcCodes,
      sourceKind: "winning_brief" as const,
    };

    const embedding = await createEmbedding(
      buildPrecedentEmbedText(entry),
      weightedTokensForCodes(icd10Codes, cptCodes, carcCodes)
    );

    const insertedId = await ctx.runMutation(internal.precedents.insertPrecedent, {
      sourceKind: "winning_brief",
      title: entry.title,
      citation: entry.citation,
      jurisdiction: claim.patient?.state || "US-FED",
      icd10Codes,
      cptCodes,
      carcCodes,
      primaryIcd10: primaryOrUnspecified(icd10Codes),
      primaryCpt: primaryOrUnspecified(cptCodes),
      carcCode: primaryOrUnspecified(carcCodes),
      winningArgument: entry.winningArgument,
      statutoryLanguage: entry.statutoryLanguage,
      outcome: entry.outcome,
      embedding,
      sourceClaimId: args.claimId,
      corpusKey: `won-claim-${args.claimId}`,
    });
    return insertedId;
  },
});
