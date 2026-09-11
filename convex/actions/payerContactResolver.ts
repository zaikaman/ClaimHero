"use node";

import { action, internalAction, ActionCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { createStructuredCompletion } from "../lib/openai";
import { requireClaimOwnerAction } from "../lib/auth";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";

const firecrawl = new FirecrawlClient(components.firecrawl);

const CONTACT_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    officialAppealsEmail: {
      type: "string",
      description:
        "Official email address for submitting claims, appeals, disputes, grievances, or clinical documentation. Return empty string if not found in search evidence.",
    },
    intakePortalUrl: {
      type: "string",
      description:
        "Official URL of the payer's online appeals, grievance, or claims dispute portal. Return empty string if not found.",
    },
    portalName: {
      type: "string",
      description:
        "Human-readable name of the portal (e.g. 'Member Hub', 'Provider Appeals Gateway'). Return empty string if not found.",
    },
    appealsFax: {
      type: "string",
      description:
        "Official fax number dedicated to receiving appeals, disputes, or claim records. Return empty string if not found.",
    },
    statutoryPoBox: {
      type: "string",
      description:
        "Physical mailing address or P.O. Box for formal written appeals or claim disputes. Return empty string if not found.",
    },
    ediPayerId: {
      type: "string",
      description:
        "Electronic Data Interchange (EDI) Payer ID if known. Return empty string if not found.",
    },
    tollFreeHelpline: {
      type: "string",
      description:
        "Customer service, claims, or appeals department telephone helpline. Return empty string if not found.",
    },
    isVerified: {
      type: "boolean",
      description:
        "True if authentic, actionable contact information (portal, fax, email, or mailing address) was identified from search results.",
    },
    submissionPolicyNote: {
      type: "string",
      description:
        "Brief note explaining the payer's official submission requirements and accepted channels based on search results.",
    },
    source: {
      type: "string",
      description:
        "'firecrawl_live' if discovered from web search, 'preset' if preset directory, or 'unresolved' if not found.",
    },
  },
  required: [
    "officialAppealsEmail",
    "intakePortalUrl",
    "portalName",
    "appealsFax",
    "statutoryPoBox",
    "ediPayerId",
    "tollFreeHelpline",
    "isVerified",
    "submissionPolicyNote",
    "source",
  ],
  additionalProperties: false,
};

export interface ResolvedPayerContact {
  officialAppealsEmail?: string;
  intakePortalUrl?: string;
  portalName?: string;
  appealsFax?: string;
  statutoryPoBox?: string;
  ediPayerId?: string;
  tollFreeHelpline?: string;
  isVerified: boolean;
  submissionPolicyNote?: string;
  source?: string;
  registryDate?: string;
  verifiedAt?: number;
  liveVerifiedAt?: number;
}


function extractFirecrawlItems(payload: unknown): Array<{
  title?: string;
  url?: string;
  markdown?: string;
}> {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  let candidates: unknown[] = [];

  if (Array.isArray(root.web)) {
    candidates = root.web;
  } else if (root.data && typeof root.data === "object") {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.web)) {
      candidates = data.web;
    } else if (Array.isArray(root.data)) {
      candidates = root.data as unknown[];
    }
  } else if (Array.isArray(root.results)) {
    candidates = root.results;
  } else if (Array.isArray(root.items)) {
    candidates = root.items;
  }

  const results: Array<{ title?: string; url?: string; markdown?: string }> = [];
  for (const item of candidates) {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title : undefined;
      const url =
        typeof record.url === "string"
          ? record.url
          : typeof record.link === "string"
            ? record.link
            : undefined;
      const markdown =
        typeof record.markdown === "string"
          ? record.markdown
          : typeof record.content === "string"
            ? record.content
            : typeof record.description === "string"
              ? record.description
              : typeof record.snippet === "string"
                ? record.snippet
                : undefined;
      if (url || markdown) {
        results.push({ title, url, markdown });
      }
    }
  }
  return results;
}

function extractCandidateEmails(text: string, payerName: string): {
  priorityEmails: string[];
  allEmails: string[];
} {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const ignoredDomains = [
    "example.com",
    "w3.org",
    "schema.org",
    "sentry.io",
    "github.com",
    "google.com",
    "facebook.com",
    "twitter.com",
  ];
  const emailFilterRegex = /\.(png|jpg|jpeg|gif|svg|webp|css|js|ico)$/i;

  const allEmails = Array.from(new Set(matches))
    .map((e) => e.trim())
    .filter((email) => {
      const lower = email.toLowerCase();
      if (emailFilterRegex.test(lower)) return false;
      const domain = lower.split("@")[1];
      if (!domain || ignoredDomains.includes(domain)) return false;
      return true;
    });

  const payerClean = payerName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const payerTokens = payerName
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((t) => t.length >= 3 && !["health", "plan", "insurance", "the", "inc", "corp"].includes(t));

  const priorityEmails = allEmails.filter((email) => {
    const lower = email.toLowerCase();
    const [local, domain] = lower.split("@");
    const isRelevantLocal =
      /^(claims?|appeals?|grievance|disputes?|inquir|member|service|support|contact|submission|auth)/i.test(
        local
      );
    const domainClean = domain.replace(/[^a-z0-9]/g, "");
    const isPayerDomain =
      (domainClean.length > 3 && payerClean.includes(domainClean)) ||
      (payerClean.length > 3 && domainClean.includes(payerClean)) ||
      payerTokens.some((t) => domain.includes(t));

    return isRelevantLocal || isPayerDomain;
  });

  return { priorityEmails, allEmails };
}

/**
 * Internal execution helper for resolving and validating payer intake gateways with an authorized or internal claim context.
 */
export async function performResolvePayerGateway(
  ctx: ActionCtx,
  args: {
    claimId: Id<"claims">;
    payerName?: string;
    forceWebSearch?: boolean;
  },
  claim: Doc<"claims"> & {
    patient?: Doc<"patients"> | null;
  }
): Promise<ResolvedPayerContact> {
  const payer = args.payerName || claim.patient?.insurancePayer || claim.insurancePayer || "Health Insurer";

  // 2. Dynamic Discovery via Multi-Query Firecrawl Search + Candidate Extraction
  let webSearchContext = "";
  let detectedPriorityEmails: string[] = [];

  try {
    const searchQueries = [
      `"${payer}" appeals dispute claims submission portal fax address contact`,
      `"${payer}" (claims OR appeals OR grievances OR disputes) email address contact`,
    ];

    const allRawItems: Array<{ title?: string; url?: string; markdown?: string }> = [];

    const searchPromises = searchQueries.map(async (query) => {
      try {
        const searchData = await firecrawl.search(ctx, query, {
          limit: 5,
          scrapeOptions: { formats: ["markdown"] },
        });
        return extractFirecrawlItems(searchData);
      } catch (queryErr) {
        console.warn(`Firecrawl query "${query}" failed:`, queryErr);
        return [];
      }
    });

    const itemsArrays = await Promise.all(searchPromises);
    for (const items of itemsArrays) {
      allRawItems.push(...items);
    }

    const seenUrls = new Set<string>();
    const deduplicatedItems: Array<{ title: string; url: string; markdown: string }> = [];

    for (const item of allRawItems) {
      const normUrl = (item.url || "").toLowerCase().split("?")[0].replace(/\/+$/, "");
      if (normUrl && seenUrls.has(normUrl)) continue;
      if (normUrl) seenUrls.add(normUrl);
      deduplicatedItems.push({
        title: item.title || `${payer} Gateway Portal`,
        url: item.url || "",
        markdown: (item.markdown || "").slice(0, 3500),
      });
      if (deduplicatedItems.length >= 6) break;
    }

    webSearchContext = deduplicatedItems
      .map((r) => `Title: ${r.title}\nURL: ${r.url}\nContent:\n${r.markdown}`)
      .join("\n\n---\n\n");

    const { priorityEmails } = extractCandidateEmails(webSearchContext, payer);
    detectedPriorityEmails = priorityEmails;
  } catch (crawlErr) {
    console.warn("Firecrawl live search encountered transient error, proceeding to synthesis/fallback:", crawlErr);
  }

  // 3. Use LLM to extract verified contact details from live Firecrawl context
  const detectedEmailsSection =
    detectedPriorityEmails.length > 0
      ? `Candidate Email Addresses Discovered in Search Content:\n- ${detectedPriorityEmails.join("\n- ")}`
      : "No candidate email addresses pre-detected in search content.";

  const systemPrompt = `You are ClaimHero's Payer Intake Intelligence Agent.
Your task is to extract authentic, official appellate, grievance, claims, or customer intake gateway details for the specified health insurer.

EXTRACTION GUIDELINES:
1. NEVER guess or hallucinate contact information.
2. Official Appeals / Claims Email:
   - If the search evidence or candidate email list contains an official email address for claims submission, appeals, disputes, grievances, or customer inquiries (e.g. claims@payer.com, appeals@payer.com, disputes@payer.com), YOU MUST EXTRACT IT as officialAppealsEmail.
   - Payers frequently accept claims records, dispute documentation, and appeal inquiries via dedicated claims/appeals inboxes. Do NOT discard or omit valid claims, appeals, or dispute email addresses.
3. Online Appeals & Dispute Portal:
   - Extract the official URL for provider or member appeals, dispute resolution, or claims management.
4. Appellate Fax:
   - Extract dedicated appeals, grievances, or claims department fax numbers.
5. Statutory Mailing Address:
   - Extract the formal appeals or claims mailing address / P.O. Box.
6. Verification Status:
   - Set isVerified: true if genuine, actionable contact details (portal, fax, email, or statutory mailing address) were found in the authoritative search results.`;

  const userPrompt = `Insurer Name: ${payer}
Patient State / Jurisdiction: ${claim.patient?.state || "National"}

${detectedEmailsSection}

Web Search Evidence from Firecrawl:
${webSearchContext || "No live search results available."}

Extract the authentic appeals/grievance/claims intake gateway details for ${payer}.`;

  let resolvedContact: ResolvedPayerContact;

  try {
    const aiExtraction = await createStructuredCompletion<ResolvedPayerContact>({
      systemPrompt,
      userPrompt,
      schema: CONTACT_EXTRACTION_SCHEMA,
      schemaName: "ResolvedPayerContact",
      temperature: 0.1,
    });

    const cleanField = (val?: string) => {
      const trimmed = val?.trim();
      if (!trimmed) return undefined;
      if (trimmed.includes("555-01") || trimmed.includes("EDI-AUTO") || trimmed.includes("EDI-UNKNOWN")) {
        return undefined;
      }
      return trimmed;
    };

    let extractedEmail = cleanField(aiExtraction.officialAppealsEmail);
    // Dynamic Grounding Recovery: if LLM omitted email but crawl evidence contained verified priority emails
    if ((!extractedEmail || !extractedEmail.includes("@")) && detectedPriorityEmails.length > 0) {
      const best =
        detectedPriorityEmails.find((e) =>
          /^(claims?|appeals?|grievance|disputes?)/i.test(e.split("@")[0])
        ) || detectedPriorityEmails[0];
      if (best && best.includes("@")) {
        extractedEmail = best;
      }
    }

    const intakePortalUrl = cleanField(aiExtraction.intakePortalUrl);
    const portalName = cleanField(aiExtraction.portalName);
    const appealsFax = cleanField(aiExtraction.appealsFax);
    const statutoryPoBox = cleanField(aiExtraction.statutoryPoBox);
    const ediPayerId = cleanField(aiExtraction.ediPayerId);
    const tollFreeHelpline = cleanField(aiExtraction.tollFreeHelpline);
    const submissionPolicyNote = cleanField(aiExtraction.submissionPolicyNote);

    const hasLiveContact = Boolean(
      extractedEmail || intakePortalUrl || appealsFax || statutoryPoBox
    );

    const isLiveCorroborated = Boolean(
      hasLiveContact &&
        (aiExtraction.isVerified ||
          (webSearchContext && (extractedEmail || intakePortalUrl || appealsFax)))
    );

    if (isLiveCorroborated) {
      resolvedContact = {
        officialAppealsEmail:
          extractedEmail && extractedEmail.includes("@") ? extractedEmail : undefined,
        intakePortalUrl:
          intakePortalUrl && (intakePortalUrl.startsWith("http://") || intakePortalUrl.startsWith("https://"))
            ? intakePortalUrl
            : undefined,
        portalName: portalName || (intakePortalUrl ? `${payer} Appeals Portal` : undefined),
        appealsFax: appealsFax || undefined,
        statutoryPoBox: statutoryPoBox || undefined,
        ediPayerId: ediPayerId || undefined,
        tollFreeHelpline: tollFreeHelpline || undefined,
        isVerified: true,
        liveVerifiedAt: Date.now(),
        submissionPolicyNote:
          submissionPolicyNote ||
          "Submissions accepted via verified official payer channels.",
        source: webSearchContext ? "firecrawl_live" : "ai_knowledge",
      };
    } else {
      resolvedContact = {
        officialAppealsEmail: undefined,
        intakePortalUrl: undefined,
        portalName: undefined,
        appealsFax: undefined,
        statutoryPoBox: undefined,
        ediPayerId: undefined,
        tollFreeHelpline: undefined,
        isVerified: false,
        submissionPolicyNote:
          "Payer gateway could not be verified automatically. Consult the denial notice for appellate filing instructions.",
        source: "unresolved",
      };
    }
  } catch {
    resolvedContact = {
      officialAppealsEmail: undefined,
      intakePortalUrl: undefined,
      portalName: undefined,
      appealsFax: undefined,
      statutoryPoBox: undefined,
      ediPayerId: undefined,
      tollFreeHelpline: undefined,
      isVerified: false,
      submissionPolicyNote:
        "Payer gateway could not be verified automatically. Consult the denial notice for appellate filing instructions.",
      source: "unresolved",
    };
  }

  // 4. Persist the discovered contact to the claim record
  await ctx.runMutation(internal.claims.updatePayerContactInternal, {
    claimId: args.claimId,
    payerContact: resolvedContact,
  });

  // 5. Record audit log
  const auditActor =
    resolvedContact.source === "firecrawl_live"
      ? "Firecrawl Web Crawler"
      : "Payer Gateway Resolver";

  const auditDetail = resolvedContact.isVerified
    ? `Resolved official appeals gateway for ${payer}: ${resolvedContact.officialAppealsEmail || resolvedContact.portalName || resolvedContact.appealsFax || "Appellate Gateway"} (Source: ${resolvedContact.source}).`
    : `Payer gateway for ${payer} could not be verified automatically; manual filing verification required prior to PHI dispatch.`;

  await ctx.runMutation(internal.auditLogs.logEventInternal, {
    claimId: args.claimId,
    eventType: "policy_crawled",
    actor: auditActor,
    details: auditDetail,
  });

  return resolvedContact;
}

/**
 * Shared execution helper for resolving and validating payer intake gateways.
 * Requires caller authentication and claim ownership / editor access.
 */
export async function executeResolvePayerGateway(
  ctx: ActionCtx,
  args: {
    claimId: Id<"claims">;
    payerName?: string;
    forceWebSearch?: boolean;
  }
): Promise<ResolvedPayerContact> {
  // 1. Authorize claim ownership and fetch context
  const { claim } = await requireClaimOwnerAction(ctx, args.claimId);
  return await performResolvePayerGateway(ctx, args, claim);
}

/**
 * Autonomous Payer Contact Resolver Action:
 * Discovers real insurer grievance, claims, and appeals intake gateways
 * using Firecrawl Web Search + LLM extraction for any domestic or international insurer.
 */
export const resolvePayerGateway = action({
  args: {
    claimId: v.id("claims"),
    payerName: v.optional(v.string()),
    forceWebSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ResolvedPayerContact> => {
    return await executeResolvePayerGateway(ctx, args);
  },
});

/**
 * Autonomous Payer Contact Resolver Internal Action:
 * For server-side background tasks (document upload intake scheduler, durable workflows)
 * where execution occurs asynchronously without an interactive caller auth session.
 */
export const resolvePayerGatewayInternal = internalAction({
  args: {
    claimId: v.id("claims"),
    payerName: v.optional(v.string()),
    forceWebSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ResolvedPayerContact> => {
    const claim = await ctx.runQuery(internal.claims.getByIdInternal, {
      claimId: args.claimId,
    });
    if (!claim) {
      throw new Error(`Claim ${args.claimId} not found`);
    }
    return await performResolvePayerGateway(ctx, args, claim);
  },
});

/**
 * Autonomous Pre-Dispatch Payer Re-verification Action:
 * Re-verifies insurer appeals intake gateways via live Firecrawl search immediately
 * before PHI-bearing appeal dispatch. Prevents HIPAA breach from stale fax/email routing.
 */
export const reverifyPayerContactForDispatch = action({
  args: {
    claimId: v.id("claims"),
    intendedChannel: v.optional(
      v.union(
        v.literal("email"),
        v.literal("fax"),
        v.literal("portal"),
        v.literal("any")
      )
    ),
  },
  handler: async (ctx, args): Promise<ResolvedPayerContact> => {
    const { claim } = await requireClaimOwnerAction(ctx, args.claimId);
    const payer = claim.patient?.insurancePayer || claim.insurancePayer || "Health Insurer";

    const resolved = await performResolvePayerGateway(
      ctx,
      {
        claimId: args.claimId,
        payerName: payer,
        forceWebSearch: true,
      },
      claim
    );

    const isTargetChannelVerified =
      args.intendedChannel === "email"
        ? Boolean(resolved.isVerified && resolved.officialAppealsEmail)
        : args.intendedChannel === "fax"
          ? Boolean(resolved.isVerified && resolved.appealsFax)
          : args.intendedChannel === "portal"
            ? Boolean(resolved.isVerified && resolved.intakePortalUrl)
            : resolved.isVerified;

    await ctx.runMutation(internal.auditLogs.logEventInternal, {
      claimId: args.claimId,
      eventType: "payer_contact_reverified_for_dispatch",
      actor: "Pre-Dispatch Sentinel",
      details: isTargetChannelVerified
        ? `Live pre-dispatch re-verification confirmed ${args.intendedChannel || "gateway"} for ${payer}: ${resolved.officialAppealsEmail || resolved.portalName || resolved.appealsFax || "Appellate Gateway"} (Source: ${resolved.source}).`
        : `Live pre-dispatch re-verification notice: ${args.intendedChannel || "gateway"} for ${payer} is unverified (Source: ${resolved.source}). Automated PHI dispatch requires verified routing.`,
    });

    return resolved;
  },
});
