"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { Agent, createTool, stepCountIs } from "@convex-dev/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { getOpenAIConfig } from "../lib/openai";
import { api, components, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { rateLimiter } from "../lib/rateLimiter";
import { getAuthUserId } from "../lib/auth";
import { FirecrawlClient, type Format } from "@firecrawl/firecrawl-convex";
import { isAccessDeniedDocument, sanitizePublicPolicyUrl } from "./policyCrawler";
import { buildLeanSentinelPrompt } from "./sentinelChatbot";

/**
 * Configure OpenAI client for the AI Agent
 */
export function getAgentLanguageModel() {
  const { apiKey, model, baseURL } = getOpenAIConfig();
  const openai = createOpenAI({
    apiKey,
    baseURL: baseURL || undefined,
  });
  return openai(model);
}

// 1. Get Active Claim Details Tool
export const getActiveClaimDetails = createTool({
  description:
    "Retrieve comprehensive medical and clinical facts, denial reason codes (CARC), CPT/ICD-10 codes, financial liability, and ERISA § 502(c) statutory penalty calculations for a specific claim.",
  inputSchema: z.object({
    claimId: z.string().optional().describe("The unique Convex ID of the claim."),
    claimNumber: z.string().optional().describe("The human-readable claim number (e.g. CLM-88219)."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const userId = (ctx.userId as Id<"users"> | undefined) || (await getAuthUserId(ctx));
    if (!userId) return "Error: Authentication required to access claim details.";

    const data = await ctx.runQuery(internal.chatbot.getClaimDataForChatbot, {
      claimId: input.claimId as Id<"claims"> | undefined,
      claimNumber: input.claimNumber,
      userId,
    });

    if (!data) {
      return `Claim not found or access denied for query ${input.claimId || input.claimNumber}.`;
    }

    return JSON.stringify(data, null, 2);
  },
});

// 2. Search Claims Tool
export const searchClaims = createTool({
  description:
    "Search or list patient claims by keyword, payer name, patient name, CPT code, CARC denial code, or lifecycle status.",
  inputSchema: z.object({
    searchTerm: z.string().optional().describe("Search keyword (e.g., patient name, payer, CPT code, or denial term)."),
    status: z.string().optional().describe("Filter by status: ingested, parsing, precedent_matched, drafting, dispatched, won, lost."),
    limit: z.number().optional().describe("Maximum number of claims to return (default: 5)."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const userId = (ctx.userId as Id<"users"> | undefined) || (await getAuthUserId(ctx));
    if (!userId) return "Error: Authentication required to search claims.";

    const data = await ctx.runQuery(internal.chatbot.searchClaimsForChatbot, {
      searchTerm: input.searchTerm,
      status: input.status,
      limit: input.limit || 5,
      userId,
    });

    return JSON.stringify(data, null, 2);
  },
});

// 3. Get Clinical Evidence Tool
export const getClinicalEvidence = createTool({
  description:
    "Retrieve crawled insurer Clinical Policy Bulletins (CPBs), PubMed clinical studies, FDA package inserts, and exact criteria citation clauses for a claim.",
  inputSchema: z.object({
    claimId: z.string().describe("The unique Convex ID of the claim."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const userId = (ctx.userId as Id<"users"> | undefined) || (await getAuthUserId(ctx));
    if (!userId) return "Error: Authentication required to fetch clinical evidence.";

    const data = await ctx.runQuery(internal.chatbot.getEvidencesForChatbot, {
      claimId: input.claimId as Id<"claims">,
      userId,
    });

    return JSON.stringify(data, null, 2);
  },
});

// 4. Get Appeal Brief Tool
export const getAppealBrief = createTool({
  description:
    "Retrieve the synthesized ERISA legal memorandum, medical necessity arguments, and statutory legal citations for a claim.",
  inputSchema: z.object({
    claimId: z.string().describe("The unique Convex ID of the claim."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const userId = (ctx.userId as Id<"users"> | undefined) || (await getAuthUserId(ctx));
    if (!userId) return "Error: Authentication required to fetch appeal brief.";

    const data = await ctx.runQuery(internal.chatbot.getAppealBriefForChatbot, {
      claimId: input.claimId as Id<"claims">,
      userId,
    });

    return JSON.stringify(data, null, 2);
  },
});

// 5. Get P2P Defense Script Tool
export const getP2PDefenseScript = createTool({
  description:
    "Retrieve the physician Peer-to-Peer (P2P) tele-script, disqualification rebuttals, insurer trap counters, and rapid clinical cheat sheet for a claim.",
  inputSchema: z.object({
    claimId: z.string().describe("The unique Convex ID of the claim."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const userId = (ctx.userId as Id<"users"> | undefined) || (await getAuthUserId(ctx));
    if (!userId) return "Error: Authentication required to fetch P2P script.";

    const data = await ctx.runQuery(internal.chatbot.getP2PScriptForChatbot, {
      claimId: input.claimId as Id<"claims">,
      userId,
    });

    return JSON.stringify(data, null, 2);
  },
});

// 6. Get Audit Trail Tool
export const getAuditTrail = createTool({
  description:
    "Retrieve the immutable cryptographic audit timeline and chronological action history for a claim.",
  inputSchema: z.object({
    claimId: z.string().describe("The unique Convex ID of the claim."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const userId = (ctx.userId as Id<"users"> | undefined) || (await getAuthUserId(ctx));
    if (!userId) return "Error: Authentication required to fetch audit trail.";

    const data = await ctx.runQuery(internal.chatbot.getAuditLogsForChatbot, {
      claimId: input.claimId as Id<"claims">,
      userId,
    });

    return JSON.stringify(data, null, 2);
  },
});

// 7. Search Precedents Tool
export const searchPrecedents = createTool({
  description:
    "Perform Hybrid Precedent Search combining 1536-d semantic embeddings with BM25 keyword matching and clinical code overlap across winning briefs, commissioner rulings, and court overturns.",
  inputSchema: z.object({
    query: z.string().describe("Clinical or statutory query (e.g. knee arthroplasty failed conservative therapy)."),
    primaryCpt: z.string().optional().describe("Optional CPT code to filter precedents (e.g., 27447)."),
    carcCode: z.string().optional().describe("Optional CARC code to filter precedents (e.g., CO-50)."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const userId = (ctx.userId as Id<"users"> | undefined) || (await getAuthUserId(ctx));
    if (!userId) return "Error: Authentication required to search precedents.";

    const searchRes = await ctx.runAction(api.actions.precedentArchive.hybridSearchPrecedents, {
      query: input.query,
      cptCodes: input.primaryCpt ? [input.primaryCpt] : undefined,
      carcCode: input.carcCode,
      limit: 3,
    });

    return JSON.stringify(searchRes, null, 2);
  },
});

// 8. Firecrawl Web Search Tool
export const firecrawlWebSearch = createTool({
  description:
    "Perform real-time live web search using Firecrawl to discover insurer Clinical Policy Bulletins (CPBs) across Aetna, UnitedHealthcare, Cigna, BCBS, Humana, Medicare NCD/LCD coverage determinations, PubMed medical literature, and FDA indications.",
  inputSchema: z.object({
    query: z.string().describe("Clinical, procedural, or statutory search terms."),
    payer: z.string().optional().describe("Optional specific insurance payer name (e.g. 'Aetna', 'UnitedHealthcare')."),
    limit: z.number().optional().describe("Maximum search results to return (default: 3)."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const firecrawl = new FirecrawlClient(components.firecrawl);
    const limit = input.limit || 3;
    const searchQuery = input.payer ? `${input.payer} ${input.query}` : input.query;

    try {
      const searchData = await firecrawl.search(ctx, searchQuery, {
        limit,
        sources: ["web"],
        scrapeOptions: { formats: ["markdown"] },
      });

      const rawResults = searchData?.web || [];
      const formatted = (Array.isArray(rawResults) ? rawResults : [])
        .slice(0, limit)
        .map((item: { title?: string; url?: string; description?: string; markdown?: string }) => ({
          title: item.title || "Clinical Policy Document",
          url: item.url || "",
          description: item.description || item.markdown?.slice(0, 300) || "",
        }))
        .filter((item) => Boolean(item.url));

      return JSON.stringify(
        {
          query: searchQuery,
          totalResults: formatted.length,
          results: formatted,
          source: "firecrawl_live_web",
        },
        null,
        2
      );
    } catch (err) {
      console.error("Firecrawl web search error:", err);
      return JSON.stringify({
        query: searchQuery,
        totalResults: 0,
        results: [],
        source: "firecrawl_live_web",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

// 9. Firecrawl Scrape URL Tool
export const firecrawlScrapeUrl = createTool({
  description:
    "Scrape a specific clinical guideline URL, insurer bulletin, or PubMed study using Firecrawl and extract clean markdown criteria.",
  inputSchema: z.object({
    url: z.string().describe("The HTTP or HTTPS URL to scrape."),
  }),
  execute: async (ctx, input): Promise<string> => {
    if (!input.url || (!input.url.startsWith("http://") && !input.url.startsWith("https://"))) {
      return JSON.stringify({
        sourceUrl: input.url,
        markdownSnippet: "Invalid URL provided. Please supply a valid HTTP or HTTPS address.",
        success: false,
        error: "Invalid URL protocol",
      });
    }

    const cleanUrl = sanitizePublicPolicyUrl(input.url);
    const firecrawl = new FirecrawlClient(components.firecrawl);

    try {
      const formats: Format[] = [
        "markdown",
        {
          type: "json",
          prompt: "Extract structured clinical policy criteria, coverage guidelines, contraindications, and prior authorization requirements.",
          schema: {
            type: "object",
            properties: {
              policyTitle: { type: "string" },
              effectiveDate: { type: "string" },
              medicalNecessityCriteria: { type: "array", items: { type: "string" } },
              contraindications: { type: "array", items: { type: "string" } },
              priorAuthRequirements: { type: "array", items: { type: "string" } },
            },
            required: ["policyTitle"],
          },
        },
      ];

      const doc = await firecrawl.scrape(ctx, cleanUrl, {
        formats,
        onlyMainContent: true,
        proxy: "auto",
        timeout: 12000,
        waitFor: 300,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        blockAds: true,
      });

      const markdown = doc.markdown?.trim() || "";
      const title = doc.metadata?.title || "Scraped Policy Document";

      if (markdown && !isAccessDeniedDocument(markdown)) {
        return JSON.stringify(
          {
            sourceUrl: cleanUrl,
            title,
            markdownSnippet: markdown.slice(0, 3500),
            structuredCriteria: doc.json,
            success: true,
          },
          null,
          2
        );
      }

      return JSON.stringify({
        sourceUrl: cleanUrl,
        title,
        markdownSnippet: "Policy document content was empty or access was restricted / denied.",
        success: false,
        error: "Empty or restricted content",
      });
    } catch (err) {
      console.error("Firecrawl scrape error:", err);
      return JSON.stringify({
        sourceUrl: cleanUrl,
        markdownSnippet: `Failed to scrape document from ${cleanUrl}: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

// 10. Crawl and Attach Evidence Tool
export const crawlAndAttachEvidence = createTool({
  description:
    "Trigger the autonomous multi-source Firecrawl research pipeline to scrape and attach clinical evidence for a specific claim.",
  inputSchema: z.object({
    claimId: z.string().describe("The unique Convex ID of the claim."),
    customUrl: z.string().optional().describe("Optional custom guideline or clinical policy bulletin URL."),
  }),
  execute: async (ctx, input): Promise<string> => {
    const userId = (ctx.userId as Id<"users"> | undefined) || (await getAuthUserId(ctx));
    if (!userId) return "Error: Authentication required to trigger clinical evidence ingestion.";

    const claimId = input.claimId as Id<"claims">;
    const claim = await ctx.runQuery(internal.chatbot.getClaimDataForChatbot, {
      claimId,
      userId,
    });

    if (!claim) {
      return `Error: Claim ${claimId} not found or access denied.`;
    }

    try {
      if (input.customUrl) {
        await ctx.runAction(api.actions.policyCrawler.crawlCustomResearchUrl, {
          claimId,
          customUrl: input.customUrl,
        });
      } else {
        await ctx.runAction(api.actions.policyCrawler.crawlMultiSourceHub, {
          claimId,
          payer: claim.insurancePayer || "Payer",
          cptCodes: claim.cptCodes || [],
          icd10Codes: claim.icd10Codes || [],
          denialReasonCode: claim.denialReasonCode || "CO-50",
          denialReasonDescription: claim.denialReasonDescription,
        });
      }

      return `Firecrawl multi-source clinical research pipeline executed. Policy bulletins, PubMed studies, and FDA clauses have been extracted and attached to claim ${claim.claimNumber}.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Research trigger error: ${message}`;
    }
  },
});

export const SENTINEL_AGENT_TOOLS = {
  get_active_claim_details: getActiveClaimDetails,
  search_claims: searchClaims,
  get_clinical_evidence: getClinicalEvidence,
  get_appeal_brief: getAppealBrief,
  get_p2p_defense_script: getP2PDefenseScript,
  get_audit_trail: getAuditTrail,
  search_precedents: searchPrecedents,
  firecrawl_web_search: firecrawlWebSearch,
  firecrawl_scrape_url: firecrawlScrapeUrl,
  crawl_and_attach_evidence: crawlAndAttachEvidence,
};

/**
 * Instantiate the Sentinel Agent
 */
export function createSentinelAgent() {
  return new Agent(components.agent, {
    name: "Sentinel Copilot",
    languageModel: getAgentLanguageModel(),
    instructions: buildLeanSentinelPrompt({}),
    tools: SENTINEL_AGENT_TOOLS,
    stopWhen: stepCountIs(6),
  });
}

/**
 * Asynchronously stream tokens directly into Convex database tables
 * Clients subscribe to stream deltas via listThreadMessages query.
 */
export const streamSentinelMessage = action({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    sessionId: v.optional(v.id("chatbotSessions")),
    activeClaimId: v.optional(v.id("claims")),
    activeClaimNumber: v.optional(v.string()),
    activePayer: v.optional(v.string()),
    currentView: v.optional(v.string()),
    conversationSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: You must be logged in to communicate with Sentinel Copilot");
    }

    // Rate limiter: 30 queries / minute per user
    const { ok } = await rateLimiter.limit(ctx, "sentinelChatbot", {
      key: `sentinel_chat_${args.sessionId || userId}`,
    });
    if (!ok) {
      throw new Error("Sentinel Copilot rate limit reached (30 queries/minute). Please wait a moment.");
    }

    const instructions = buildLeanSentinelPrompt({
      currentView: args.currentView,
      activeClaimId: args.activeClaimId,
      activeClaimNumber: args.activeClaimNumber,
      activePayer: args.activePayer,
      conversationSummary: args.conversationSummary,
    });

    const agent = createSentinelAgent();

    const result = await agent.streamText(
      ctx,
      { threadId: args.threadId, userId },
      {
        prompt: args.prompt,
        instructions,
      },
      {
        saveStreamDeltas: {
          chunking: "word",
          throttleMs: 100,
        },
      }
    );

    // Drain the stream so all chunks are committed to the database
    await result.consumeStream();

    if (args.sessionId) {
      try {
        await ctx.runMutation(internal.chatbot.incrementSessionMessageCount, {
          sessionId: args.sessionId,
        });
      } catch (err) {
        console.warn("Failed to increment session message count:", err);
      }
    }

    return { success: true };
  },
});
